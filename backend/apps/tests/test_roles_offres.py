"""Rôles (Propriétaire, Pharmacien, Vendeur, Magasinier), approbation par PIN et offres de licence."""
from decimal import Decimal
from unittest import mock

from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from apps.caisse.services import ouvrir_session
from apps.commun.constantes import PHARMACIEN
from apps.utilisateurs.models import Utilisateur
from apps.ventes.models import Vente

from .test_flux import BaseTest


def etat_offre(offre):
    return {"statut": "ACTIVE", "lecture_seule": False, "message": "", "offre": offre}


class BaseRoles(BaseTest):
    def setUp(self):
        super().setUp()
        cache.clear()
        self.pharmacien = Utilisateur.objects.creer_utilisateur("pharma", "motdepasse1", nom="Pharmacien", role=PHARMACIEN)
        self.pharmacien.definir_code_pin("2468")
        self.pharmacien.save()

    def client_pour(self, utilisateur):
        c = APIClient()
        c.force_authenticate(utilisateur)
        return c

    def vente_du_caissier(self):
        ouvrir_session(utilisateur=self.caissier, caisse_id=self.caisse.pk, montant_initial=Decimal("0"))
        return self.vendre(1, paiement=[{"mode_paiement": self.especes, "montant": Decimal("100")}])


class TestPharmacien(BaseRoles):
    def test_vend_et_gere_le_stock(self):
        client = self.client_pour(self.pharmacien)
        r = client.post("/api/sessions-caisse/", {"caisse": self.caisse.pk, "montant_initial": "0"}, format="json")
        self.assertIn(r.status_code, (200, 201), r.data)
        r = client.post("/api/ventes/", {"articles": [{"medicament": self.med.pk, "quantite": 1}],
                                          "paiements": [{"mode_paiement": self.especes.pk, "montant": "100"}]}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r = client.post("/api/stocks/sortie/", {"lot": self.lot_long.pk, "depot": self.depot.pk, "quantite": 1, "motif": "PERTE"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)

    def test_ne_voit_ni_prix_achat_ni_administration(self):
        client = self.client_pour(self.pharmacien)
        self.assertNotIn("prix_achat", client.get("/api/medicaments/").data["resultats"][0])
        self.assertNotIn("valeur_totale", client.get("/api/stocks/synthese/").data)
        for url in ("/api/achats/", "/api/utilisateurs/", "/api/journal-audit/", "/api/rapports/ventes/"):
            self.assertEqual(client.get(url).status_code, 403, url)
        self.assertEqual(client.put("/api/parametres/", {"devise": "EUR"}, format="json").status_code, 403)

    def test_ne_modifie_pas_le_prix_d_un_lot(self):
        client = self.client_pour(self.pharmacien)
        r = client.patch(f"/api/lots/{self.lot_long.pk}/", {"prix_vente": "999", "prix_achat": "1"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.lot_long.refresh_from_db()
        self.assertEqual(self.lot_long.prix_vente, Decimal("120"))

    def test_annule_directement(self):
        vente = self.vente_du_caissier()
        r = self.client_pour(self.pharmacien).post(f"/api/ventes/{vente.pk}/annuler/", {"motif": "Erreur"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)


class TestApprobationParPin(BaseRoles):
    def annuler(self, vente, **approbation):
        return self.client_pour(self.caissier).post(f"/api/ventes/{vente.pk}/annuler/", {"motif": "Erreur client", **approbation},
                                                     format="json")

    def test_le_vendeur_a_besoin_d_une_approbation(self):
        vente = self.vente_du_caissier()
        self.assertEqual(self.annuler(vente).status_code, 400)
        self.assertEqual(self.annuler(vente, approbateur_identifiant="pharma", approbateur_pin="0000").status_code, 400)
        self.assertEqual(self.annuler(vente, approbateur_identifiant="caissier", approbateur_pin="2468").status_code, 400)
        r = self.annuler(vente, approbateur_identifiant="pharma", approbateur_pin="2468")
        self.assertEqual(r.status_code, 200, r.data)
        vente.refresh_from_db()
        self.assertEqual((vente.statut, vente.annule_par, vente.annulation_approuvee_par), ("ANNULEE", self.caissier, self.pharmacien))

    def test_blocage_apres_cinq_erreurs(self):
        vente = self.vente_du_caissier()
        for _ in range(5):
            self.annuler(vente, approbateur_identifiant="pharma", approbateur_pin="1111")
        r = self.annuler(vente, approbateur_identifiant="pharma", approbateur_pin="2468")
        self.assertIn("Trop d'essais", r.data["detail"])

    def test_definir_pin_par_le_proprietaire(self):
        client = self.client_pour(self.admin)
        self.assertEqual(client.post(f"/api/utilisateurs/{self.caissier.pk}/definir-pin/", {"code_pin": "1234"}).status_code, 400)
        self.assertEqual(client.post(f"/api/utilisateurs/{self.pharmacien.pk}/definir-pin/", {"code_pin": "12"}).status_code, 400)
        r = client.post(f"/api/utilisateurs/{self.pharmacien.pk}/definir-pin/", {"code_pin": "135790"})
        self.assertEqual((r.status_code, r.data["pin_defini"]), (200, True))
        self.pharmacien.refresh_from_db()
        self.assertTrue(self.pharmacien.verifier_code_pin("135790"))


@override_settings(LICENCE_OBLIGATOIRE=True)
class TestOffres(BaseRoles):
    def offre(self, code):
        return mock.patch("apps.licence.services.etat_licence", return_value=etat_offre(code)), \
            mock.patch("apps.licence.middleware.etat_licence", return_value=etat_offre(code))

    def test_essentiel(self):
        p1, p2 = self.offre("ESSENTIEL")
        with p1, p2:
            client = self.client_pour(self.admin)
            # 4 comptes actifs déjà (admin, caissier, magasinier, pharmacien) : aucun de plus en Essentiel.
            r = client.post("/api/utilisateurs/", {"identifiant": "v2", "nom": "V", "role": "CAISSIER", "mot_de_passe": "motdepasse1"},
                            format="json")
            self.assertEqual(r.status_code, 400)
            self.assertIn("Rawafid", str(r.data))
            Utilisateur.objects.exclude(pk=self.admin.pk).update(actif=False)
            r = client.post("/api/utilisateurs/", {"identifiant": "p2", "nom": "P", "role": "PHARMACIEN", "mot_de_passe": "motdepasse1"},
                            format="json")
            self.assertEqual(r.status_code, 400, "pas de rôle Pharmacien en Essentiel")
            r = client.post("/api/utilisateurs/", {"identifiant": "v3", "nom": "V", "role": "CAISSIER", "mot_de_passe": "motdepasse1"},
                            format="json")
            self.assertEqual(r.status_code, 201, r.data)
            r = client.get("/api/transferts/")
            self.assertEqual((r.status_code, r.data["code"]), (403, "offre"))
            self.assertEqual(client.get("/api/documents-vente/").status_code, 403)
            modules = client.get("/api/auth/moi/").data["modules"]
            self.assertNotIn("facturation", modules)
            self.assertNotIn("transferts", modules)

    def test_essentiel_seul_le_proprietaire_annule(self):
        Utilisateur.objects.filter(pk=self.pharmacien.pk).update(actif=False)
        vente = self.vente_du_caissier()
        p1, p2 = self.offre("ESSENTIEL")
        with p1, p2:
            r = self.client_pour(self.caissier).post(f"/api/ventes/{vente.pk}/annuler/", {
                "motif": "x", "approbateur_identifiant": "pharma", "approbateur_pin": "2468"}, format="json")
            self.assertEqual(r.status_code, 403)
            r = self.client_pour(self.admin).post(f"/api/ventes/{vente.pk}/annuler/", {"motif": "x"}, format="json")
            self.assertEqual(r.status_code, 200)

    def test_professionnel(self):
        p1, p2 = self.offre("PRO")
        with p1, p2:
            client = self.client_pour(self.admin)
            self.assertEqual(client.get("/api/transferts/").status_code, 200)
            r = client.post("/api/utilisateurs/", {"identifiant": "p2", "nom": "P", "role": "PHARMACIEN", "mot_de_passe": "motdepasse1"},
                            format="json")
            self.assertEqual(r.status_code, 201, r.data)
            self.assertIn("transferts", client.get("/api/auth/moi/").data["modules"])
            self.assertEqual(client.get("/api/licence/").data["offre_details"]["max_utilisateurs"], 10)
