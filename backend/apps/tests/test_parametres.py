"""Tests des paramètres d'identité et de messages imprimés sur les reçus et documents de vente."""
from decimal import Decimal

from rest_framework.test import APIClient

from apps.caisse.services import ouvrir_session
from apps.commun.models import JournalAudit
from apps.commun.parametres import message_vide
from apps.facturation.models import DocumentVente, LigneDocumentVente
from apps.ventes.models import Client

from .test_flux import BaseTest

IMAGE = "data:image/png;base64,AAAA"


class TestParametresDocuments(BaseTest):
    def client_pour(self, utilisateur):
        c = APIClient()
        c.force_authenticate(utilisateur)
        return c

    def vendre_un(self):
        ouvrir_session(utilisateur=self.caissier, caisse_id=self.caisse.pk, montant_initial=Decimal("0"))
        return self.vendre(1, paiement=[{"mode_paiement": self.especes, "montant": Decimal("100")}])

    def parametres(self, utilisateur=None):
        r = self.client_pour(utilisateur or self.admin).get("/api/parametres/")
        self.assertEqual(r.status_code, 200)
        return {p["cle"]: p["valeur"] for p in r.data}

    def test_nouveaux_parametres_exposes_et_modifiables_par_l_admin(self):
        valeurs = self.parametres()
        for cle in ("whatsapp_pharmacie", "email_pharmacie", "nif_pharmacie", "entete_image", "afficher_logo_documents",
                    "bl_afficher_prix", "message_devis", "message_bl", "message_facture"):
            self.assertIn(cle, valeurs)
        r = self.client_pour(self.admin).put("/api/parametres/", {
            "whatsapp_pharmacie": "22001122", "email_pharmacie": "contact@pharmacie.test", "entete_image": IMAGE,
            "message_devis": "<b>Valable 15 jours</b>",
        }, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        valeurs = self.parametres()
        self.assertEqual(valeurs["whatsapp_pharmacie"], "22001122")
        self.assertEqual(valeurs["message_devis"], "<b>Valable 15 jours</b>")

    def test_seul_l_admin_modifie_les_parametres(self):
        for utilisateur in (self.caissier, self.magasinier):
            r = self.client_pour(utilisateur).put("/api/parametres/", {"email_pharmacie": "x@y.z"}, format="json")
            self.assertEqual(r.status_code, 403)

    def test_audit_ne_recopie_pas_les_images(self):
        self.client_pour(self.admin).put("/api/parametres/", {"entete_image": IMAGE}, format="json")
        entree = JournalAudit.objects.get(entite="Parametre", reference="entete_image")
        self.assertEqual(entree.nouvelle_valeur, {"valeur": "(image)"})
        self.assertNotIn(IMAGE, str(entree.ancienne_valeur) + str(entree.nouvelle_valeur))

    def test_recu_porte_les_coordonnees_et_l_entete_personnalises(self):
        self.client_pour(self.admin).put("/api/parametres/", {
            "logo_pharmacie": IMAGE, "whatsapp_pharmacie": "22001122", "nif_pharmacie": "NIF-42",
            "entete_image": IMAGE, "message_recu": "<i>Merci</i>",
        }, format="json")
        vente = self.vendre_un()
        recu = self.client_pour(self.caissier).get(f"/api/recus/{vente.pk}/").data["pharmacie"]
        self.assertEqual(recu["whatsapp"], "22001122")
        self.assertEqual(recu["nif"], "NIF-42")
        self.assertEqual(recu["entete_image"], IMAGE)
        self.assertEqual(recu["logo"], IMAGE)
        self.assertEqual(recu["message"], "<i>Merci</i>")

    def test_logo_masque_sur_les_documents_si_desactive(self):
        self.client_pour(self.admin).put("/api/parametres/", {"logo_pharmacie": IMAGE, "afficher_logo_documents": "0"}, format="json")
        vente = self.vendre_un()
        recu = self.client_pour(self.caissier).get(f"/api/recus/{vente.pk}/").data["pharmacie"]
        self.assertEqual(recu["logo"], "")
        self.assertEqual(self.parametres()["logo_pharmacie"], IMAGE)  # le logo reste enregistré (barre latérale)

    def test_document_de_vente_messages_par_type_et_repli_facture(self):
        self.client_pour(self.admin).put("/api/parametres/", {
            "message_recu": "Merci", "message_bl": "Vérifiez la livraison", "message_facture": "<div><br></div>", "bl_afficher_prix": "0",
        }, format="json")
        client = Client.objects.create(nom="Clinique Ennour")
        document = DocumentVente.objects.create(reference="DEV-PARAM", client=client, depot=self.depot, personnel=self.magasinier)
        LigneDocumentVente.objects.create(document=document, medicament=self.med, designation=self.med.nom,
                                          quantite_devis=2, prix_unitaire=Decimal("100"), total=Decimal("200"))
        pharmacie = self.client_pour(self.magasinier).get(f"/api/documents-vente/{document.pk}/").data["pharmacie"]
        self.assertEqual(pharmacie["message_bl"], "Vérifiez la livraison")
        self.assertEqual(pharmacie["message_facture"], "Merci")  # message de facture vide : repli sur le reçu
        self.assertTrue(pharmacie["message_devis"])  # valeur par défaut
        self.assertIs(pharmacie["bl_afficher_prix"], False)

    def test_message_vide(self):
        self.assertTrue(message_vide(""))
        self.assertTrue(message_vide("<div><br></div>"))
        self.assertTrue(message_vide("<p>&nbsp;</p>"))
        self.assertFalse(message_vide("<b>Merci</b>"))
