"""Robustesse des mots de passe (création de compte, changement, compte propriétaire de l'installation)."""
import os
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.commun.constantes import ADMIN
from apps.utilisateurs.models import Utilisateur


class TestMotsDePasse(TestCase):
    def setUp(self):
        self.admin = Utilisateur.objects.creer_utilisateur("patron", "Bonjour-2026!", nom="Patron", role=ADMIN)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def creer(self, mot_de_passe):
        return self.client.post("/api/utilisateurs/", {
            "identifiant": "vendeur1", "nom": "Ould Ahmed", "prenom": "Sidi", "role": "CAISSIER",
            "mot_de_passe": mot_de_passe,
        }, format="json")

    def test_mots_de_passe_faibles_refuses_a_la_creation(self):
        for faible in ("12345678", "password", "vendeur1", "court1"):
            with self.subTest(faible=faible):
                self.assertEqual(self.creer(faible).status_code, 400)
        self.assertFalse(Utilisateur.objects.filter(identifiant="vendeur1").exists())

    def test_mot_de_passe_correct_accepte(self):
        self.assertEqual(self.creer("Tidjikja-77").status_code, 201)

    def test_changement_vers_un_mot_de_passe_faible_refuse(self):
        reponse = self.client.post("/api/auth/changer-mot-de-passe/", {
            "ancien_mot_de_passe": "Bonjour-2026!", "nouveau_mot_de_passe": "11111111"}, format="json")
        self.assertEqual(reponse.status_code, 400)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password("Bonjour-2026!"))


class TestCompteProprietaire(TestCase):
    """initialiser_donnees : mot de passe lu dans RAQEEM_ADMIN_MDP (jamais sur la ligne de commande)."""

    def test_mot_de_passe_faible_refuse_avec_code_3(self):
        with mock.patch.dict(os.environ, {"RAQEEM_ADMIN_MDP": "12345678"}):
            with self.assertRaises(CommandError) as contexte:
                call_command("initialiser_donnees", "--identifiant", "proprio", stdout=open(os.devnull, "w"))
        self.assertEqual(contexte.exception.returncode, 3)
        self.assertFalse(Utilisateur.objects.filter(identifiant="proprio").exists())

    def test_cree_le_compte_et_efface_la_variable(self):
        with mock.patch.dict(os.environ, {"RAQEEM_ADMIN_MDP": "Nouakchott-2026"}):
            call_command("initialiser_donnees", "--identifiant", "proprio", stdout=open(os.devnull, "w"))
            self.assertNotIn("RAQEEM_ADMIN_MDP", os.environ)
        self.assertTrue(Utilisateur.objects.get(identifiant="proprio").check_password("Nouakchott-2026"))

    def test_plus_d_option_mot_de_passe_en_ligne_de_commande(self):
        with self.assertRaises(CommandError):
            call_command("initialiser_donnees", "--mot-de-passe", "Nouakchott-2026")


@override_settings(ALLOWED_HOSTS=["localhost", "127.0.0.1"])
class TestHotes(TestCase):
    def test_nom_inconnu_refuse(self):
        self.assertEqual(self.client.get("/api/licence/etat/", HTTP_HOST="site-pirate.example").status_code, 400)
