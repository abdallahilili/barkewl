"""Licence Rawafid Digital Services : signature, PC, expiration, consultation seule, horloge."""
import base64
import json
from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.commun.constantes import ADMIN, CAISSIER
from apps.commun.exceptions import ErreurMetier
from apps.licence import ed25519, services
from apps.licence.models import EtatLicence
from apps.utilisateurs.models import Utilisateur

SECRET_TEST = bytes(range(32))
PUBLIQUE_TEST = ed25519.cle_publique(SECRET_TEST).hex()
PC = "BRK-AAAA-BBBB-CCCC"


def b64(octets):
    return base64.urlsafe_b64encode(octets).decode().rstrip("=")


def fabriquer_cle(fin_dans_jours=30, machine=PC, secret=SECRET_TEST, plan="MENSUEL"):
    aujourdhui = timezone.localdate()
    contenu = {"v": 1, "id": "test", "client": "Pharmacie Test", "machine": machine, "plan": plan,
               "debut": aujourdhui.isoformat(), "fin": (aujourdhui + timedelta(days=fin_dans_jours)).isoformat()}
    charge = json.dumps(contenu).encode()
    return f"BRKW1.{b64(charge)}.{b64(ed25519.signer(secret, charge))}"


@override_settings(LICENCE_OBLIGATOIRE=True)
class TestLicence(TestCase):
    def setUp(self):
        self.patchs = [mock.patch.object(services, "CLE_PUBLIQUE_HEX", PUBLIQUE_TEST),
                       mock.patch.object(services, "empreinte_machine", return_value=PC)]
        for p in self.patchs:
            p.start()
        services.vider_cache()
        self.admin = Utilisateur.objects.creer_utilisateur("admin", "motdepasse1", nom="Admin", role=ADMIN)
        self.caissier = Utilisateur.objects.creer_utilisateur("caissier", "motdepasse1", nom="Caissier", role=CAISSIER)

    def tearDown(self):
        for p in self.patchs:
            p.stop()
        services.vider_cache()

    def client_pour(self, utilisateur):
        c = APIClient()
        c.force_authenticate(utilisateur)
        return c

    def installer(self, cle):
        EtatLicence.objects.update_or_create(pk=1, defaults={"cle": cle})
        services.vider_cache()

    def test_vecteur_officiel_rfc8032(self):
        secret = bytes.fromhex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
        self.assertEqual(ed25519.cle_publique(secret).hex(), "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
        self.assertEqual(ed25519.signer(secret, b"").hex()[:32], "e5564300c360ac729086e2cc806e828a")

    def test_sans_licence_consultation_seule(self):
        etat = services.etat_licence()
        self.assertEqual((etat["statut"], etat["lecture_seule"]), ("NON_ACTIVEE", True))
        client = self.client_pour(self.admin)
        self.assertEqual(client.get("/api/medicaments/").status_code, 200, "la consultation reste possible")
        r = client.post("/api/categories/", {"nom": "Test"}, format="json")
        self.assertEqual((r.status_code, r.json()["code"]), (403, "licence"))

    def test_activation_par_l_administrateur(self):
        r = self.client_pour(self.caissier).post("/api/licence/activer/", {"cle": fabriquer_cle()}, format="json")
        self.assertEqual(r.status_code, 403)
        cle = fabriquer_cle(fin_dans_jours=365, plan="ANNUEL")
        r = self.client_pour(self.admin).post("/api/licence/activer/", {"cle": cle[:40] + "\n" + cle[40:]}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data["statut"], r.data["plan"], r.data["client"]), ("ACTIVE", "ANNUEL", "Pharmacie Test"))
        self.assertEqual(self.client_pour(self.admin).post("/api/categories/", {"nom": "Test"}, format="json").status_code, 201)

    def test_cle_falsifiee_refusee(self):
        vraie = fabriquer_cle(fin_dans_jours=30)
        entete, charge, signature = vraie.split(".")
        contenu = json.loads(base64.urlsafe_b64decode(charge + "==="))
        contenu["fin"] = "2099-12-31"   # on tente de prolonger la licence
        fausse = f"{entete}.{b64(json.dumps(contenu).encode())}.{signature}"
        with self.assertRaisesMessage(ErreurMetier, "Rawafid"):
            services.decoder_cle(fausse)
        with self.assertRaisesMessage(ErreurMetier, "Rawafid"):
            services.decoder_cle(fabriquer_cle(secret=bytes(32)))   # signée par quelqu'un d'autre

    def test_licence_d_un_autre_pc(self):
        with self.assertRaisesMessage(ErreurMetier, "autre ordinateur"):
            services.activer_licence(fabriquer_cle(machine="BRK-1111-2222-3333"), self.admin)
        self.installer(fabriquer_cle(machine="BRK-1111-2222-3333"))   # copiée à la main dans la base
        self.assertEqual(services.etat_licence()["statut"], "INVALIDE")

    def test_cycle_d_expiration(self):
        cas = [(30, "ACTIVE", False), (5, "EXPIRE_BIENTOT", False), (-3, "GRACE", False), (-6, "EXPIREE", True)]
        for jours, statut, bloque in cas:
            with self.subTest(jours=jours):
                self.installer(fabriquer_cle(fin_dans_jours=jours))
                etat = services.etat_licence()
                self.assertEqual((etat["statut"], etat["lecture_seule"]), (statut, bloque))

    def test_expiree_bloque_les_ventes_mais_pas_la_sauvegarde_ni_le_renouvellement(self):
        self.installer(fabriquer_cle(fin_dans_jours=-10))
        client = self.client_pour(self.admin)
        r = client.post("/api/ventes/", {"articles": [], "paiements": []}, format="json")
        self.assertEqual((r.status_code, r.json()["code"]), (403, "licence"))
        self.assertIn("consultation seule", r.json()["detail"])
        with mock.patch("apps.commun.sauvegarde.creer_sauvegarde", return_value={"nom": "x", "taille": 1}):
            self.assertEqual(client.post("/api/sauvegardes/").status_code, 201)
        r = client.post("/api/licence/activer/", {"cle": fabriquer_cle(fin_dans_jours=30)}, format="json")
        self.assertEqual(r.data["statut"], "ACTIVE")

    def test_recul_de_l_horloge_detecte(self):
        self.installer(fabriquer_cle(fin_dans_jours=30))
        EtatLicence.objects.filter(pk=1).update(derniere_date_vue=timezone.localdate() + timedelta(days=40))
        services.vider_cache()
        etat = services.etat_licence()
        self.assertEqual((etat["statut"], etat["lecture_seule"]), ("HORLOGE", True))

    def test_etat_public_sans_details(self):
        self.installer(fabriquer_cle())
        r = APIClient().get("/api/licence/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["editeur"]["nom"], "Rawafid Digital Services")
        self.assertNotIn("client", r.data)

    def test_empreinte_stable(self):
        mock.patch.stopall()
        services.vider_cache()
        self.assertRegex(services.empreinte_machine(), r"^BRK-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$")
        self.assertEqual(services.empreinte_machine(), services.empreinte_machine())
        self.patchs = []
