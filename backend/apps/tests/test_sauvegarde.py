"""Tests de la sauvegarde / restauration de la base (exécutés sur SQLite)."""
import gzip
import os
import shutil
import sqlite3
import tempfile
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
            f = self.dossier / f"barkewl_2020010{i % 10}_00000{i}.sql.gz"
            f.write_bytes(b"x")
            os.utime(f, (946684800 + i, 946684800 + i))   # année 2000 : hors conservation
        sauvegarde._purger(self.dossier)
        self.assertEqual(len(list(self.dossier.glob("barkewl_*"))), sauvegarde.MINIMUM_CONSERVE)
