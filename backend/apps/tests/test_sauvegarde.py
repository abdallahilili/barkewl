"""Tests de la sauvegarde / restauration de la base (exécutés sur SQLite)."""
import gzip
import json
import os
import shutil
import sqlite3
import tempfile
import time
from pathlib import Path
from unittest import mock, skipUnless

from django.db import connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from apps.commun import sauvegarde
from apps.commun.constantes import ADMIN, CAISSIER
from apps.commun.models import JournalAudit
from apps.depots.models import Depot
from apps.utilisateurs.models import Utilisateur


@skipUnless(connection.vendor == "sqlite", "tests prévus pour SQLite")
class TestSauvegarde(TransactionTestCase):
    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        self.copie = Path(tempfile.mkdtemp()) / "usb"
        self.env = mock.patch.dict(os.environ, {"DOSSIER_SAUVEGARDES": str(self.dossier),
                                                "DOSSIER_SAUVEGARDES_COPIE": str(self.copie)})
        self.env.start()
        self.admin = Utilisateur.objects.creer_utilisateur("admin", "motdepasse1", nom="Admin", role=ADMIN)
        self.caissier = Utilisateur.objects.creer_utilisateur("caissier", "motdepasse1", nom="Caissier", role=CAISSIER)

    def tearDown(self):
        self.env.stop()
        shutil.rmtree(self.dossier, ignore_errors=True)
        shutil.rmtree(self.copie.parent, ignore_errors=True)

    def client_pour(self, utilisateur):
        c = APIClient()
        c.force_authenticate(utilisateur)
        return c

    def test_sauvegarde_complete_et_lisible(self):
        Depot.objects.create(nom="Pharmacie")
        infos = sauvegarde.creer_sauvegarde()
        fichier = self.dossier / infos["nom"]
        self.assertTrue(fichier.is_file())
        self.assertTrue((self.copie / infos["nom"]).is_file(), "copie dans le second dossier")
        self.assertEqual(list(self.dossier.glob(".*en-cours")), [], "aucun fichier temporaire laissé")
        descripteur, nom_brut = tempfile.mkstemp(suffix=".sqlite3")
        os.close(descripteur)
        brut = Path(nom_brut)
        try:
            brut.write_bytes(gzip.decompress(fichier.read_bytes()))
            base = sqlite3.connect(brut)
            self.assertEqual(base.execute("SELECT nom FROM depots").fetchall(), [("Pharmacie",)])
            base.close()
        finally:
            brut.unlink()

    def test_restauration_remet_les_donnees(self):
        Depot.objects.create(nom="Avant")
        infos = sauvegarde.creer_sauvegarde()
        Depot.objects.all().delete()
        Depot.objects.create(nom="Après")
        securite = sauvegarde.restaurer_sauvegarde(self.dossier / infos["nom"])
        self.assertEqual(list(Depot.objects.values_list("nom", flat=True)), ["Avant"])
        self.assertIn("_restauration.", securite["nom"], "l'état écrasé est conservé")

    def test_api_reservee_a_l_administrateur(self):
        self.assertEqual(self.client_pour(self.caissier).get("/api/sauvegardes/").status_code, 403)
        self.assertEqual(self.client_pour(self.caissier).post("/api/sauvegardes/").status_code, 403)

    def test_api_creation_liste_telechargement(self):
        client = self.client_pour(self.admin)
        r = client.get("/api/sauvegardes/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["en_retard"], "aucune sauvegarde : alerte")
        r = client.post("/api/sauvegardes/")
        self.assertEqual(r.status_code, 201)
        nom = r.data["nom"]
        r = client.get("/api/sauvegardes/")
        self.assertFalse(r.data["en_retard"])
        self.assertEqual([f["nom"] for f in r.data["fichiers"]], [nom])
        r = client.get(f"/api/sauvegardes/{nom}/telecharger/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(b"".join(r.streaming_content).startswith(b"\x1f\x8b"), "fichier gzip")
        self.assertTrue(JournalAudit.objects.filter(action="SAUVEGARDE", reference=nom).exists())

    def test_nom_de_fichier_malveillant_refuse(self):
        r = self.client_pour(self.admin).get("/api/sauvegardes/..%5C..%5Csettings.py/telecharger/")
        self.assertEqual(r.status_code, 400)

    def test_purge_garde_les_plus_recentes(self):
        for i in range(10):
            f = self.dossier / f"raqeem_2020010{i % 10}_00000{i}.sql.gz"
            f.write_bytes(b"x")
            os.utime(f, (946684800 + i, 946684800 + i))   # année 2000 : hors conservation
        sauvegarde._purger(self.dossier)
        self.assertEqual(len(list(self.dossier.glob("raqeem_*"))), sauvegarde.MINIMUM_CONSERVE)


@skipUnless(connection.vendor == "sqlite", "tests prévus pour SQLite")
class TestSauvegardeUsb(TransactionTestCase):
    """Copie automatique vers une clé USB préparée (lecteurs simulés par SAUVEGARDE_USB_RACINES)."""

    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        self.cle = Path(tempfile.mkdtemp())
        self.autre = Path(tempfile.mkdtemp())
        self.env = mock.patch.dict(os.environ, {
            "DOSSIER_SAUVEGARDES": str(self.dossier), "DOSSIER_SAUVEGARDES_COPIE": "",
            "SAUVEGARDE_USB_RACINES": os.pathsep.join([str(self.cle), str(self.autre)]),
            "SAUVEGARDE_USB_INTERVALLE_HEURES": "24", "SAUVEGARDE_USB_NOMBRE": "5",
        })
        self.env.start()
        self.admin = Utilisateur.objects.creer_utilisateur("admin", "motdepasse1", nom="Admin", role=ADMIN)
        self.caissier = Utilisateur.objects.creer_utilisateur("caissier", "motdepasse1", nom="Caissier", role=CAISSIER)

    def tearDown(self):
        self.env.stop()
        for d in (self.dossier, self.cle, self.autre):
            shutil.rmtree(d, ignore_errors=True)

    def client_pour(self, utilisateur):
        c = APIClient()
        c.force_authenticate(utilisateur)
        return c

    def sauvegardes_sur(self, racine):
        return sorted(f.name for f in (racine / sauvegarde.DOSSIER_USB).glob("*.gz"))

    def vieillir(self, fichier, heures):
        instant = time.time() - heures * 3600
        os.utime(fichier, (instant, instant))

    def test_lecteur_non_prepare_ne_recoit_rien(self):
        self.assertEqual(sauvegarde.copier_vers_usb(forcer=True), [])
        self.assertEqual(sauvegarde.copier_vers_usb(), [])
        self.assertEqual(list(self.cle.iterdir()), [])
        self.assertEqual(list(self.autre.iterdir()), [])

    def test_preparer_cree_le_marqueur_et_copie(self):
        Depot.objects.create(nom="Pharmacie")
        resultat = sauvegarde.preparer_lecteur(str(self.cle))
        self.assertTrue((self.cle / sauvegarde.DOSSIER_USB / sauvegarde.MARQUEUR_USB).is_file())
        self.assertTrue(resultat["copies"][0]["ok"])
        noms = self.sauvegardes_sur(self.cle)
        self.assertEqual(len(noms), 1)
        copie = self.cle / sauvegarde.DOSSIER_USB / noms[0]
        locale = self.dossier / noms[0]
        self.assertEqual(copie.read_bytes(), locale.read_bytes(), "copie identique au fichier local")
        self.assertTrue(gzip.decompress(copie.read_bytes()), "gzip lisible")
        self.assertEqual(list((self.cle / sauvegarde.DOSSIER_USB).glob(".*en-cours")), [])
        self.assertEqual(list(self.autre.iterdir()), [], "l'autre lecteur, non préparé, n'est pas touché")

    def test_rotation_garde_les_5_plus_recentes_sans_toucher_au_reste(self):
        sauvegarde.preparer_lecteur(str(self.cle))
        dossier_cle = self.cle / sauvegarde.DOSSIER_USB
        (dossier_cle / "photo.jpg").write_bytes(b"photo")
        (self.cle / "document.txt").write_text("perso")
        for i in range(7):   # avec la copie de la préparation : 8 sauvegardes sur la clé
            f = dossier_cle / f"raqeem_2020010{i + 1}_000000_auto.sqlite3.gz"
            f.write_bytes(gzip.compress(b"x"))
            self.vieillir(f, 48 + 24 * i)
        self.assertEqual(len(self.sauvegardes_sur(self.cle)), 8)
        sauvegarde.copier_vers_usb(forcer=True)
        restantes = self.sauvegardes_sur(self.cle)
        self.assertEqual(len(restantes), 5)
        self.assertNotIn("raqeem_20200107_000000_auto.sqlite3.gz", restantes, "les plus anciennes sont supprimées")
        self.assertTrue((dossier_cle / "photo.jpg").is_file())
        self.assertTrue((self.cle / "document.txt").is_file())
        self.assertTrue((dossier_cle / sauvegarde.MARQUEUR_USB).is_file())

    def test_intervalle_de_24_heures(self):
        sauvegarde.preparer_lecteur(str(self.cle))
        lecteur = next(l for l in sauvegarde.lecteurs_externes() if l["prepare"])
        self.assertFalse(sauvegarde.copie_usb_necessaire(lecteur))
        self.assertEqual(sauvegarde.copier_vers_usb(), [], "copie de moins de 24 h : rien à faire")
        for f in (self.cle / sauvegarde.DOSSIER_USB).glob("*.gz"):
            self.vieillir(f, 25)
        self.assertTrue(sauvegarde.copie_usb_necessaire(lecteur))
        resultats = sauvegarde.copier_vers_usb()
        self.assertEqual(len(resultats), 1)
        self.assertTrue(resultats[0]["ok"])
        with mock.patch.dict(os.environ, {"SAUVEGARDE_USB_INTERVALLE_HEURES": "0"}):
            self.assertFalse(sauvegarde.copie_usb_necessaire(lecteur), "0 = désactivée")

    def test_racine_inconnue_refusee(self):
        with self.assertRaises(sauvegarde.ErreurMetier):
            sauvegarde.preparer_lecteur(str(self.dossier))
        r = self.client_pour(self.admin).post("/api/sauvegardes/usb/preparer/", {"racine": "Z:\\inconnu"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(list(self.dossier.glob(sauvegarde.DOSSIER_USB)), [])

    def test_api_reservee_a_l_administrateur(self):
        caissier = self.client_pour(self.caissier)
        self.assertEqual(caissier.get("/api/sauvegardes/usb/lecteurs/").status_code, 403)
        self.assertEqual(caissier.post("/api/sauvegardes/usb/preparer/", {"racine": str(self.cle)}, format="json").status_code, 403)
        self.assertEqual(caissier.post("/api/sauvegardes/usb/copier/").status_code, 403)
        self.assertEqual(list(self.cle.iterdir()), [])
        admin = self.client_pour(self.admin)
        r = admin.get("/api/sauvegardes/usb/lecteurs/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)
        r = admin.post("/api/sauvegardes/usb/preparer/", {"racine": str(self.cle)}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(admin.post("/api/sauvegardes/usb/copier/").status_code, 200)
        self.assertGreaterEqual(JournalAudit.objects.filter(entite="Clé USB").count(), 2)
        etat = admin.get("/api/sauvegardes/").data["usb"]
        self.assertEqual(len(etat["lecteurs"]), 1)
        self.assertTrue(etat["lecteurs"][0]["branche"])
        self.assertEqual(len(etat["lecteurs"][0]["fichiers"]), 1)

    def test_lecteur_qui_disparait(self):
        sauvegarde.preparer_lecteur(str(self.cle))
        lecteur = next(l for l in sauvegarde.lecteurs_externes() if l["prepare"])
        shutil.rmtree(self.cle)   # clé retirée
        self.assertEqual(sauvegarde.copier_vers_usb(forcer=True), [], "lecteur absent : ignoré sans erreur")
        # clé retirée entre la détection et la copie
        with mock.patch.object(sauvegarde, "lecteurs_externes", return_value=[lecteur]):
            resultats = sauvegarde.copier_vers_usb(forcer=True)
        self.assertFalse(resultats[0]["ok"])
        etat = json.loads((self.dossier / sauvegarde.FICHIER_ETAT_USB).read_text(encoding="utf-8"))
        self.assertIsNotNone(etat["derniere_erreur"])
        usb = sauvegarde.etat_sauvegardes()["usb"]
        self.assertEqual(usb["derniere_erreur"]["message"], etat["derniere_erreur"]["message"])
        self.assertFalse(usb["lecteurs"][0]["branche"], "la clé connue apparaît « débranchée »")

    def test_pas_d_alerte_sans_cle_preparee(self):
        self.assertFalse(sauvegarde.etat_sauvegardes()["usb"]["en_retard"])
        sauvegarde.preparer_lecteur(str(self.cle))
        self.assertFalse(sauvegarde.etat_sauvegardes()["usb"]["en_retard"])
        etat = sauvegarde._lire_etat_usb()
        for fiche in etat["lecteurs_connus"].values():
            fiche["derniere_copie"] = fiche["date_preparation"] = "2020-01-01T00:00:00+00:00"
        sauvegarde._ecrire_etat_usb(etat)
        self.assertTrue(sauvegarde.etat_sauvegardes()["usb"]["en_retard"], "aucune copie depuis plus de 26 h")
        self.assertNotIn(sauvegarde.FICHIER_ETAT_USB, [f["nom"] for f in sauvegarde.lister_sauvegardes()])
