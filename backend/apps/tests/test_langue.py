"""Langue des messages : l'en-tête Accept-Language du frontend choisit la langue des messages natifs de Django REST Framework."""
from rest_framework.test import APIClient

from .test_flux import BaseTest


class TestLangueMessages(BaseTest):
    def champ_obligatoire(self, **extra):
        r = APIClient().post("/api/auth/connexion/", {}, format="json", **extra)
        self.assertEqual(r.status_code, 400)
        return r.data["identifiant"][0]

    def test_francais_par_defaut(self):
        self.assertEqual(self.champ_obligatoire(), "Ce champ est obligatoire.")

    def test_francais_demande(self):
        self.assertEqual(self.champ_obligatoire(HTTP_ACCEPT_LANGUAGE="fr"), "Ce champ est obligatoire.")

    def test_arabe_demande(self):
        message = self.champ_obligatoire(HTTP_ACCEPT_LANGUAGE="ar")
        self.assertNotEqual(message, "Ce champ est obligatoire.")
        self.assertRegex(message, "[؀-ۿ]")  # texte arabe

    def test_langue_inconnue_repli_sur_le_francais(self):
        self.assertEqual(self.champ_obligatoire(HTTP_ACCEPT_LANGUAGE="de"), "Ce champ est obligatoire.")

    def test_messages_metier_restent_en_francais_quelle_que_soit_la_langue(self):
        # Traduits côté frontend (dictionnaire de messages) : le serveur renvoie toujours la même phrase.
        for langue in ("fr", "ar"):
            r = APIClient().post("/api/auth/connexion/", {"identifiant": "inconnu", "mot_de_passe": "x"}, format="json",
                                 HTTP_ACCEPT_LANGUAGE=langue)
            self.assertEqual(r.status_code, 401)
            self.assertEqual(r.data["detail"], "Identifiant ou mot de passe incorrect.")
