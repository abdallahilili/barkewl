"""Tests du circuit Devis -> Bon de livraison -> Facture -> Paiement."""
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APIClient

from apps.caisse.models import MouvementCaisse
from apps.caisse.services import ouvrir_session
from apps.commun.exceptions import ErreurMetier
from apps.facturation.models import DocumentVente, EtapeDocument, LigneDocumentVente, PaiementFacture
from apps.facturation.services import annuler_devis, payer_facture, valider_bon_livraison, valider_facture
from apps.stock.models import TypeMouvement
from apps.ventes.models import Client

from .test_flux import BaseTest


class BaseFacturation(BaseTest):
    def setUp(self):
        super().setUp()
        self.client_pro = Client.objects.create(nom="Clinique Ennour", telephone="22334455")

    def creer_devis(self, quantite=5, utilisateur=None, prix=None):
        document = DocumentVente.objects.create(
            reference="DEV-TEST", client=self.client_pro, depot=self.depot, personnel=utilisateur or self.magasinier,
        )
        ligne = LigneDocumentVente.objects.create(
            document=document, medicament=self.med, designation=self.med.nom,
            quantite_devis=quantite, prix_unitaire=prix or self.med.prix_vente,
            total=(prix or self.med.prix_vente) * quantite,
        )
        document.recalculer_total()
        return document, ligne


class TestCircuitComplet(BaseFacturation):
    def test_bl_sort_le_stock_en_fefo(self):
        document, ligne = self.creer_devis(quantite=15)  # COURT(10) + LONG(5), comme le test FEFO existant
        avant_court, avant_long = self.stock(self.lot_court), self.stock(self.lot_long)
        valider_bon_livraison(document.pk, self.magasinier)
        document.refresh_from_db()
        self.assertEqual(document.etape, EtapeDocument.BON_LIVRAISON)
        self.assertTrue(document.numero_bl.startswith("BL-"))
        self.assertEqual(self.stock(self.lot_court), avant_court - 10)
        self.assertEqual(self.stock(self.lot_long), avant_long - 5)
        ligne.refresh_from_db()
        self.assertEqual(ligne.quantite_livree, 15)

    def test_livraison_partielle(self):
        document, ligne = self.creer_devis(quantite=10)
        valider_bon_livraison(document.pk, self.magasinier, {ligne.pk: 4})
        ligne.refresh_from_db()
        document.refresh_from_db()
        self.assertEqual(ligne.quantite_livree, 4)
        self.assertEqual(document.total, ligne.prix_unitaire * 4)
        self.assertEqual(self.stock(self.lot_court), 10 - 4)

    def test_sur_livraison_refusee(self):
        document, ligne = self.creer_devis(quantite=5)
        with self.assertRaises(ErreurMetier):
            valider_bon_livraison(document.pk, self.magasinier, {ligne.pk: 6})

    def test_etapes_dans_l_ordre(self):
        document, _ = self.creer_devis(quantite=5)
        with self.assertRaises(ErreurMetier):
            valider_facture(document.pk, self.admin)  # pas de saut devis -> facture
        valider_bon_livraison(document.pk, self.magasinier)
        valider_facture(document.pk, self.admin)
        document.refresh_from_db()
        self.assertEqual(document.etape, EtapeDocument.FACTURE)
        self.assertTrue(document.numero_facture.startswith("FAC-"))
        with self.assertRaises(ErreurMetier):
            valider_bon_livraison(document.pk, self.magasinier)  # déjà transformé

    def test_paiement_necessite_session_ouverte(self):
        document, _ = self.creer_devis(quantite=5)
        valider_bon_livraison(document.pk, self.magasinier)
        valider_facture(document.pk, self.admin)
        with self.assertRaises(ErreurMetier):
            payer_facture(document.pk, self.caissier, document.total, self.especes)
        ouvrir_session(utilisateur=self.caissier, caisse_id=self.caisse.pk, montant_initial=Decimal("0"))
        payer_facture(document.pk, self.caissier, document.total, self.especes)
        document.refresh_from_db()
        self.assertEqual(document.montant_paye, document.total)
        self.assertEqual(document.reste_a_payer, Decimal("0"))
        self.assertEqual(PaiementFacture.objects.filter(document=document).count(), 1)
        self.assertTrue(MouvementCaisse.objects.filter(motif__contains=document.numero_facture).exists())

    def test_paiements_partiels_et_pas_de_sur_paiement(self):
        document, _ = self.creer_devis(quantite=5)  # total = 500
        valider_bon_livraison(document.pk, self.magasinier)
        valider_facture(document.pk, self.admin)
        ouvrir_session(utilisateur=self.caissier, caisse_id=self.caisse.pk, montant_initial=Decimal("0"))
        payer_facture(document.pk, self.caissier, Decimal("300"), self.especes)
        document.refresh_from_db()
        self.assertEqual(document.reste_a_payer, Decimal("200"))
        with self.assertRaises(ErreurMetier):
            payer_facture(document.pk, self.caissier, Decimal("201"), self.especes)
        payer_facture(document.pk, self.caissier, Decimal("200"), self.especes)
        document.refresh_from_db()
        self.assertEqual(document.reste_a_payer, Decimal("0"))

    def test_annulation_devis_avant_bl(self):
        document, _ = self.creer_devis(quantite=5)
        annuler_devis(document.pk, self.magasinier)
        document.refresh_from_db()
        self.assertTrue(document.annule)
        with self.assertRaises(ErreurMetier):
            valider_bon_livraison(document.pk, self.magasinier)

    def test_annulation_impossible_apres_bl(self):
        document, _ = self.creer_devis(quantite=5)
        valider_bon_livraison(document.pk, self.magasinier)
        with self.assertRaises(ErreurMetier):
            annuler_devis(document.pk, self.magasinier)


class TestAPIFacturation(BaseFacturation):
    def client_pour(self, utilisateur):
        c = APIClient()
        c.force_authenticate(utilisateur)
        return c

    def test_circuit_complet_via_api_et_droits_par_etape(self):
        magasinier = self.client_pour(self.magasinier)
        caissier = self.client_pour(self.caissier)
        admin = self.client_pour(self.admin)

        # Le caissier peut aussi créer un devis.
        r = caissier.post("/api/documents-vente/", {
            "client": self.client_pro.pk, "depot": self.depot.pk,
            "lignes": [{"medicament": self.med.pk, "quantite_devis": 2}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        devis_caissier_id = r.data["id"]

        # Le magasinier peut créer un devis (prix par défaut = prix_vente du médicament).
        r = magasinier.post("/api/documents-vente/", {
            "client": self.client_pro.pk, "depot": self.depot.pk,
            "lignes": [{"medicament": self.med.pk, "quantite_devis": 10}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data["reference"].startswith("DEV-"))
        self.assertEqual(Decimal(str(r.data["total"])), self.med.prix_vente * 10)
        document_id = r.data["id"]

        # Liste visible par les 3 rôles, mais le caissier n'y voit que ses propres documents.
        self.assertEqual(admin.get("/api/documents-vente/").status_code, 200)
        reponse_caissier = caissier.get("/api/documents-vente/")
        self.assertEqual(reponse_caissier.status_code, 200)
        ids_vus_par_caissier = {d["id"] for d in reponse_caissier.data["resultats"]}
        self.assertIn(devis_caissier_id, ids_vus_par_caissier)
        self.assertNotIn(document_id, ids_vus_par_caissier)  # créé par le magasinier

        # Le magasinier valide le BL.
        r = magasinier.post(f"/api/documents-vente/{document_id}/valider-bl/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["etape"], "BON_LIVRAISON")

        # Le magasinier ne peut jamais valider la facture.
        r = magasinier.post(f"/api/documents-vente/{document_id}/valider-facture/", {}, format="json")
        self.assertEqual(r.status_code, 403)
        # Le caissier a le droit en général, mais pas sur un document qui n'est pas le sien (erreur métier 400).
        r = caissier.post(f"/api/documents-vente/{document_id}/valider-facture/", {}, format="json")
        self.assertEqual(r.status_code, 400, r.data)
        r = admin.post(f"/api/documents-vente/{document_id}/valider-facture/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["etape"], "FACTURE")
        total = Decimal(str(r.data["total"]))

        # Le caissier peut valider le BL puis la facture de SON PROPRE devis.
        r = caissier.post(f"/api/documents-vente/{devis_caissier_id}/valider-bl/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        r = caissier.post(f"/api/documents-vente/{devis_caissier_id}/valider-facture/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["etape"], "FACTURE")

        # Le caissier encaisse (nécessite une session ouverte).
        r = caissier.post(f"/api/documents-vente/{document_id}/payer/",
                          {"montant": str(total), "mode_paiement": self.especes.pk}, format="json")
        self.assertEqual(r.status_code, 400)  # pas de session ouverte
        ouvrir_session(utilisateur=self.caissier, caisse_id=self.caisse.pk, montant_initial=Decimal("0"))
        r = caissier.post(f"/api/documents-vente/{document_id}/payer/",
                          {"montant": str(total), "mode_paiement": self.especes.pk}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Decimal(str(r.data["reste_a_payer"])), Decimal("0"))
