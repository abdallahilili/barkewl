"""Tests des bons de commande fournisseurs : création, modification, statuts, droits, sans effet sur le stock."""
from decimal import Decimal

from rest_framework.test import APIClient

from apps.achats.models import BonCommande, StatutBonCommande
from apps.commun.models import SequenceDocument
from apps.fournisseurs.models import Fournisseur
from apps.medicaments.models import Medicament
from apps.stock.models import Stock

from .test_flux import BaseTest


class BaseBonCommande(BaseTest):
    def setUp(self):
        super().setUp()
        self.fournisseur = Fournisseur.objects.create(nom="Pharma Distrib", telephone="22001122", adresse="Nouakchott")
        self.med2 = Medicament.objects.create(nom="Amoxicilline", dosage="1 g", prix_vente=Decimal("200"))  # sans prix d'achat

    def api(self, utilisateur):
        c = APIClient()
        c.force_authenticate(utilisateur)
        return c

    def charge(self, **extra):
        donnees = {
            "fournisseur": self.fournisseur.pk, "depot": self.depot.pk, "note": "Urgent",
            "lignes": [{"medicament": self.med.pk, "quantite": 10}, {"medicament": self.med2.pk, "quantite": 3, "prix_achat": "150.00"}],
        }
        donnees.update(extra)
        return donnees

    def creer(self):
        reponse = self.api(self.admin).post("/api/bons-commande/", self.charge(), format="json")
        self.assertEqual(reponse.status_code, 201, reponse.content)
        return reponse.json()


class TestCreation(BaseBonCommande):
    def test_creation_reference_prix_et_total(self):
        bon = self.creer()
        self.assertTrue(bon["reference"].startswith("BC-"))
        self.assertEqual(bon["statut"], "BROUILLON")
        par_med = {l["medicament"]: l for l in bon["lignes"]}
        # Prix d'achat repris de la fiche si non précisé (60), sinon celui saisi (150).
        self.assertEqual(Decimal(par_med[self.med.pk]["prix_achat"]), Decimal("60"))
        self.assertEqual(Decimal(par_med[self.med2.pk]["prix_achat"]), Decimal("150"))
        self.assertEqual(Decimal(bon["total"]), Decimal("10") * 60 + 3 * 150)
        self.assertEqual(bon["fournisseur_nom"], "Pharma Distrib")
        self.assertEqual(bon["fournisseur_telephone"], "22001122")
        self.assertIn("nom", bon["pharmacie"])  # identité imprimée en en-tête

    def test_references_incrementales(self):
        a, b = self.creer(), self.creer()
        self.assertNotEqual(a["reference"], b["reference"])
        self.assertEqual(SequenceDocument.objects.get(prefixe="BC").dernier_numero, 2)

    def test_ligne_obligatoire_et_pas_de_doublon(self):
        c = self.api(self.admin)
        self.assertEqual(c.post("/api/bons-commande/", self.charge(lignes=[]), format="json").status_code, 400)
        doublon = [{"medicament": self.med.pk, "quantite": 1}, {"medicament": self.med.pk, "quantite": 2}]
        self.assertEqual(c.post("/api/bons-commande/", self.charge(lignes=doublon), format="json").status_code, 400)

    def test_quantite_positive(self):
        reponse = self.api(self.admin).post("/api/bons-commande/", self.charge(lignes=[{"medicament": self.med.pk, "quantite": 0}]), format="json")
        self.assertEqual(reponse.status_code, 400)

    def test_fournisseur_desactive_refuse(self):
        self.fournisseur.actif = False
        self.fournisseur.save()
        self.assertEqual(self.api(self.admin).post("/api/bons-commande/", self.charge(), format="json").status_code, 400)

    def test_aucun_effet_sur_le_stock(self):
        avant = {s.pk: s.quantite for s in Stock.objects.all()}
        self.creer()
        self.assertEqual({s.pk: s.quantite for s in Stock.objects.all()}, avant)


class TestModificationEtStatuts(BaseBonCommande):
    def test_modification_remplace_les_lignes_en_brouillon(self):
        bon = self.creer()
        c = self.api(self.admin)
        reponse = c.put(f"/api/bons-commande/{bon['id']}/", self.charge(lignes=[{"medicament": self.med.pk, "quantite": 4}]), format="json")
        self.assertEqual(reponse.status_code, 200, reponse.content)
        self.assertEqual(len(reponse.json()["lignes"]), 1)
        self.assertEqual(Decimal(reponse.json()["total"]), Decimal("240"))

    def test_circuit_envoye_puis_recu(self):
        bon = self.creer()
        c = self.api(self.admin)
        self.assertEqual(c.post(f"/api/bons-commande/{bon['id']}/recu/").status_code, 400)  # pas de saut
        self.assertEqual(c.post(f"/api/bons-commande/{bon['id']}/envoyer/").json()["statut"], "ENVOYE")
        self.assertEqual(c.post(f"/api/bons-commande/{bon['id']}/recu/").json()["statut"], "RECU")
        self.assertEqual(BonCommande.objects.get(pk=bon["id"]).statut, StatutBonCommande.RECU)

    def test_modification_refusee_une_fois_envoye(self):
        bon = self.creer()
        c = self.api(self.admin)
        c.post(f"/api/bons-commande/{bon['id']}/envoyer/")
        self.assertEqual(c.put(f"/api/bons-commande/{bon['id']}/", self.charge(), format="json").status_code, 400)

    def test_annulation(self):
        bon = self.creer()
        c = self.api(self.admin)
        self.assertEqual(c.post(f"/api/bons-commande/{bon['id']}/annuler/").json()["statut"], "ANNULE")
        self.assertEqual(c.post(f"/api/bons-commande/{bon['id']}/annuler/").status_code, 400)  # déjà annulé
        self.assertEqual(c.post(f"/api/bons-commande/{bon['id']}/envoyer/").status_code, 400)

    def test_recu_ne_peut_plus_etre_annule(self):
        bon = self.creer()
        c = self.api(self.admin)
        c.post(f"/api/bons-commande/{bon['id']}/envoyer/")
        c.post(f"/api/bons-commande/{bon['id']}/recu/")
        self.assertEqual(c.post(f"/api/bons-commande/{bon['id']}/annuler/").status_code, 400)

    def test_liste_et_filtres(self):
        self.creer()
        c = self.api(self.admin)
        self.assertEqual(c.get("/api/bons-commande/").json()["total"], 1)
        self.assertEqual(c.get("/api/bons-commande/", {"statut": "ENVOYE"}).json()["total"], 0)
        self.assertEqual(c.get("/api/bons-commande/", {"recherche": "Distrib"}).json()["total"], 1)


class TestDroits(BaseBonCommande):
    def test_reserve_a_l_administrateur(self):
        bon = self.creer()
        for utilisateur in (self.caissier, self.magasinier):
            c = self.api(utilisateur)
            self.assertEqual(c.get("/api/bons-commande/").status_code, 403)
            self.assertEqual(c.get(f"/api/bons-commande/{bon['id']}/").status_code, 403)
            self.assertEqual(c.post("/api/bons-commande/", self.charge(), format="json").status_code, 403)
            self.assertEqual(c.post(f"/api/bons-commande/{bon['id']}/envoyer/").status_code, 403)
