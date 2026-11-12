"""Vente à la boîte, à la plaquette et à l'unité ; stock compté en unités."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.achats.models import Achat, LigneAchat
from apps.achats.services import annuler_achat, valider_achat
from apps.caisse.models import Caisse, ModePaiement
from apps.caisse.services import ouvrir_session
from apps.commun.constantes import ADMIN, CAISSIER
from apps.commun.exceptions import ErreurMetier
from apps.commun.references import prochaine_reference
from apps.depots.models import Depot
from apps.facturation.models import DocumentVente, LigneDocumentVente
from apps.facturation.services import valider_bon_livraison
from apps.fournisseurs.models import Fournisseur
from apps.medicaments.conditionnement import decrire_quantite
from apps.medicaments.models import Lot, Medicament
from apps.medicaments.services import changer_unites_par_boite
from apps.stock import alertes
from apps.stock.models import MouvementStock, Stock, TypeMouvement
from apps.stock.services import appliquer_mouvement
from apps.utilisateurs.models import Utilisateur
from apps.ventes.models import Client
from apps.ventes.serializers import construire_recu
from apps.ventes.services import annuler_vente, creer_vente, planifier_vente


class TestConditionnement(TestCase):
    def setUp(self):
        self.admin = Utilisateur.objects.creer_utilisateur("admin", "motdepasse1", nom="Admin", role=ADMIN)
        self.caissier = Utilisateur.objects.creer_utilisateur("caissier", "motdepasse1", nom="Caissier", role=CAISSIER)
        self.depot = Depot.objects.create(nom="Pharmacie")
        self.caisse = Caisse.objects.create(nom="Caisse 1", depot=self.depot)
        self.especes = ModePaiement.objects.create(nom="Espèces", type="ESPECES")
        # Boîte de 30 comprimés = 3 plaquettes de 10. Boîte à 300 ; plaquette à 110 (prix fixé) ; comprimé calculé (10).
        self.med = Medicament.objects.create(
            nom="Amoxicilline", prix_achat=Decimal("240"), prix_vente=Decimal("300"), unite="boîte",
            unites_par_boite=30, unites_par_plaquette=10, nom_unite_detail="comprimé",
            prix_vente_plaquette=Decimal("110"), stock_minimum=2,
        )
        aujourdhui = timezone.localdate()
        self.lot_court = Lot.objects.create(medicament=self.med, numero_lot="COURT", prix_achat=Decimal("240"),
                                            date_peremption=aujourdhui + timedelta(days=60))
        self.lot_long = Lot.objects.create(medicament=self.med, numero_lot="LONG", prix_achat=Decimal("240"),
                                           date_peremption=aujourdhui + timedelta(days=400))
        ouvrir_session(utilisateur=self.caissier, caisse_id=self.caisse.pk, montant_initial=Decimal("0"))

    def entrer(self, lot, unites):
        appliquer_mouvement(lot=lot, depot=self.depot, quantite=unites, type_mouvement=TypeMouvement.ENTREE, utilisateur=self.admin)

    def stock(self, lot):
        s = Stock.objects.filter(lot=lot, depot=self.depot).first()
        return s.quantite if s else 0

    def vendre(self, *articles):
        lignes, total = planifier_vente([{"medicament": self.med, "conditionnement": c, "quantite": q} for c, q in articles], self.depot)
        return creer_vente(
            utilisateur=self.caissier,
            articles=[{"medicament": self.med, "conditionnement": c, "quantite": q} for c, q in articles],
            paiements=[{"mode_paiement": self.especes, "montant": total}],
        )

    # ------------------------------------------------------------------ achats

    def test_achat_en_boites_entre_des_unites(self):
        achat = Achat.objects.create(reference=prochaine_reference("ACH"), fournisseur=Fournisseur.objects.create(nom="Grossiste"),
                                     depot=self.depot, utilisateur=self.admin)
        LigneAchat.objects.create(achat=achat, medicament=self.med, numero_lot="A1", quantite=4, prix_achat=Decimal("240"),
                                  date_peremption=timezone.localdate() + timedelta(days=300))
        achat.recalculer_total()
        self.assertEqual(achat.total, Decimal("960"), "le total d'achat reste en boîtes")
        valider_achat(achat.pk, self.admin)
        lot = Lot.objects.get(numero_lot="A1")
        self.assertEqual(self.stock(lot), 120)
        self.assertEqual(lot.quantite_initiale, 120)
        annuler_achat(achat.pk, self.admin)
        self.assertEqual(self.stock(lot), 0)

    # ------------------------------------------------------------------ ventes

    def test_vente_plaquette_et_unites_prix_et_stock(self):
        self.entrer(self.lot_court, 60)
        vente = self.vendre(("PLAQUETTE", 1), ("UNITE", 3))
        self.assertEqual(vente.total, Decimal("140.00"), "1 plaquette à 110 + 3 comprimés à 10 (300 / 30)")
        self.assertEqual(self.stock(self.lot_court), 47)
        self.assertEqual(MouvementStock.objects.filter(reference=vente.reference).count(), 2)
        recu = construire_recu(vente)
        self.assertEqual({l["conditionnement_libelle"] for l in recu["lignes"]}, {"plaquette", "comprimés"})

    def test_boite_prise_uniquement_dans_un_lot_complet(self):
        """Le lot qui expire en premier est entamé (25) : la boîte vient du lot suivant, le détail du lot entamé."""
        self.entrer(self.lot_court, 25)
        self.entrer(self.lot_long, 30)
        lignes, _ = planifier_vente([{"medicament": self.med, "conditionnement": "BOITE", "quantite": 1},
                                     {"medicament": self.med, "conditionnement": "UNITE", "quantite": 5}], self.depot)
        par_lot = {(l["lot"].numero_lot, l["conditionnement"]): l["quantite"] for l in lignes}
        self.assertEqual(par_lot, {("LONG", "BOITE"): 1, ("COURT", "UNITE"): 5})

    def test_pas_assez_de_boites_completes(self):
        self.entrer(self.lot_court, 25)
        self.entrer(self.lot_long, 20)   # 45 comprimés en tout, mais aucune boîte complète
        with self.assertRaisesMessage(ErreurMetier, "conditionnement complet"):
            self.vendre(("BOITE", 1))
        self.vendre(("UNITE", 30))       # au détail, c'est possible
        self.assertEqual(self.stock(self.lot_court) + self.stock(self.lot_long), 15)

    def test_annulation_remet_les_unites(self):
        self.entrer(self.lot_court, 60)
        vente = self.vendre(("BOITE", 1), ("PLAQUETTE", 2))
        self.assertEqual(self.stock(self.lot_court), 10)
        annuler_vente(vente.pk, self.admin, "Erreur de saisie")
        self.assertEqual(self.stock(self.lot_court), 60)

    def test_medicament_sans_detail_refuse_la_plaquette(self):
        boite_seule = Medicament.objects.create(nom="Sirop", prix_vente=Decimal("50"))
        with self.assertRaisesMessage(ErreurMetier, "plaquette"):
            planifier_vente([{"medicament": boite_seule, "conditionnement": "PLAQUETTE", "quantite": 1}], self.depot)

    def test_api_vente_au_detail(self):
        self.entrer(self.lot_court, 30)
        client = APIClient()
        client.force_authenticate(self.caissier)
        r = client.get("/api/medicaments/recherche-caisse/", {"q": "Amox", "depot": self.depot.pk})
        conditionnements = {c["code"]: c for c in r.data[0]["conditionnements"]}
        self.assertEqual(conditionnements["BOITE"]["disponible"], 1)
        self.assertEqual(conditionnements["PLAQUETTE"]["prix"], Decimal("110"))
        self.assertEqual(conditionnements["UNITE"]["disponible"], 30)
        self.assertEqual(r.data[0]["stock_texte"], "1 boîte")
        r = client.post("/api/ventes/", {
            "articles": [{"medicament": self.med.pk, "conditionnement": "UNITE", "quantite": 4}],
            "paiements": [{"mode_paiement": self.especes.pk, "montant": "40"}],
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.stock(self.lot_court), 26)
        r = client.post("/api/ventes/", {   # ancien format (sans conditionnement) = boîte
            "articles": [{"medicament": self.med.pk, "quantite": 1}],
            "paiements": [{"mode_paiement": self.especes.pk, "montant": "300"}],
        }, format="json")
        self.assertEqual(r.status_code, 400, "plus de boîte complète : 26 comprimés")

    # ------------------------------------------------------------------ stock, valeur, alertes

    def test_valeur_et_alerte_en_boites(self):
        self.entrer(self.lot_court, 45)   # 1,5 boîte ; seuil = 2 boîtes
        self.assertEqual(alertes.calculer_synthese(self.depot)["valeur_totale"], Decimal("360"), "45 × 240 / 30")
        faibles = alertes.construire_alertes(self.depot)["stock_faible"]
        self.assertEqual([(f["medicament"], f["stock_texte"]) for f in faibles], [("Amoxicilline", "1 boîte + 15 comprimés")])

    def test_decrire_quantite(self):
        self.assertEqual(decrire_quantite(self.med, 0), "0 comprimé")
        self.assertEqual(decrire_quantite(self.med, 61), "2 boîtes + 1 comprimé")
        self.assertEqual(decrire_quantite(self.med, -30), "-1 boîte")
        self.assertEqual(decrire_quantite(Medicament(nom="X"), 7), "7")

    # ------------------------------------------------------------------ changement de conditionnement

    def test_passage_de_1_a_30_convertit_le_stock(self):
        ancien = Medicament.objects.create(nom="Doliprane", prix_vente=Decimal("100"))
        lot = Lot.objects.create(medicament=ancien, numero_lot="D1", date_peremption=timezone.localdate() + timedelta(days=90),
                                 quantite_initiale=5)
        self.entrer(lot, 5)   # 5 boîtes, comptées à l'ancienne (1 unité = 1 boîte)
        changer_unites_par_boite(ancien, 16, self.admin)
        ancien.refresh_from_db()
        lot.refresh_from_db()
        self.assertEqual(ancien.unites_par_boite, 16)
        self.assertEqual(self.stock(lot), 80)
        self.assertEqual(lot.quantite_initiale, 80)
        mouvement = MouvementStock.objects.filter(lot=lot).latest("id")
        self.assertEqual((mouvement.type_mouvement, mouvement.quantite), (TypeMouvement.AJUSTEMENT, 75))

    def test_conversion_impossible_refusee(self):
        self.entrer(self.lot_court, 31)   # 31 comprimés : pas un nombre entier de boîtes de 20
        with self.assertRaisesMessage(ErreurMetier, "inventaire"):
            changer_unites_par_boite(self.med, 20, self.admin)
        self.assertEqual(Medicament.objects.get(pk=self.med.pk).unites_par_boite, 30)

    def test_api_modification_conditionnement(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        r = client.patch(f"/api/medicaments/{self.med.pk}/", {"unites_par_plaquette": 7}, format="json")
        self.assertEqual(r.status_code, 400, "30 n'est pas un multiple de 7")
        r = client.patch(f"/api/medicaments/{self.med.pk}/", {"unites_par_boite": 20, "unites_par_plaquette": 10}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["prix_unite_effectif"], Decimal("15.00"), "300 / 20")

    # ------------------------------------------------------------------ facturation

    def test_bon_de_livraison_en_boites(self):
        self.entrer(self.lot_court, 75)
        document = DocumentVente.objects.create(reference="DEV-T", client=Client.objects.create(nom="Clinique"),
                                                depot=self.depot, personnel=self.admin)
        LigneDocumentVente.objects.create(document=document, medicament=self.med, quantite_devis=2,
                                          prix_unitaire=Decimal("300"), total=Decimal("600"))
        valider_bon_livraison(document.pk, self.admin)
        self.assertEqual(self.stock(self.lot_court), 15)
