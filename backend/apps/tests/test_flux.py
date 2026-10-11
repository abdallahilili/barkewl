"""Tests des règles métier critiques : FEFO, ventes, stock, caisse, achats, transferts, inventaires."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.achats.models import Achat, LigneAchat
from apps.achats.services import annuler_achat, valider_achat
from apps.caisse.models import Caisse, ModePaiement
from apps.caisse.services import fermer_session, ouvrir_session
from apps.commun.constantes import ADMIN, CAISSIER, MAGASINIER
from apps.commun.exceptions import ErreurMetier
from apps.commun.references import prochaine_reference
from apps.depots.models import Depot
from apps.fournisseurs.models import Fournisseur
from apps.medicaments.models import Lot, Medicament
from apps.stock.models import MouvementStock, Stock, TypeMouvement
from apps.stock.services import (
    appliquer_mouvement, creer_inventaire, selectionner_lots_fefo, valider_inventaire, valider_transfert,
    annuler_transfert,
)
from apps.utilisateurs.models import Utilisateur
from apps.ventes.models import Vente
from apps.ventes.services import annuler_vente, creer_vente


class BaseTest(TestCase):
    def setUp(self):
        self.admin = Utilisateur.objects.creer_utilisateur("admin", "motdepasse1", nom="Admin", role=ADMIN)
        self.caissier = Utilisateur.objects.creer_utilisateur("caissier", "motdepasse1", nom="Caissier", role=CAISSIER)
        self.magasinier = Utilisateur.objects.creer_utilisateur("magasinier", "motdepasse1", nom="Magasinier", role=MAGASINIER)
        self.depot = Depot.objects.create(nom="Pharmacie")
        self.magasin = Depot.objects.create(nom="Magasin")
        self.caisse = Caisse.objects.create(nom="Caisse 1", depot=self.depot)
        self.especes = ModePaiement.objects.create(nom="Espèces", type="ESPECES")
        self.bankily = ModePaiement.objects.create(nom="Bankily", type="MOBILE")
        self.med = Medicament.objects.create(nom="Paracétamol", dosage="500 mg", prix_vente=Decimal("100"), prix_achat=Decimal("60"))
        aujourdhui = timezone.localdate()
        self.lot_perime = Lot.objects.create(medicament=self.med, numero_lot="PER", date_peremption=aujourdhui - timedelta(days=1))
        self.lot_court = Lot.objects.create(medicament=self.med, numero_lot="COURT", date_peremption=aujourdhui + timedelta(days=30))
        self.lot_long = Lot.objects.create(medicament=self.med, numero_lot="LONG", date_peremption=aujourdhui + timedelta(days=300),
                                           prix_vente=Decimal("120"))
        for lot, q in ((self.lot_perime, 50), (self.lot_court, 10), (self.lot_long, 20)):
            appliquer_mouvement(lot=lot, depot=self.depot, quantite=q, type_mouvement=TypeMouvement.ENTREE, utilisateur=self.admin)

    def stock(self, lot, depot=None):
        s = Stock.objects.filter(lot=lot, depot=depot or self.depot).first()
        return s.quantite if s else 0

    def vendre(self, quantite, paiement=None, utilisateur=None):
        utilisateur = utilisateur or self.caissier
        return creer_vente(
            utilisateur=utilisateur, articles=[{"medicament": self.med, "quantite": quantite}],
            paiements=paiement or [{"mode_paiement": self.especes, "montant": None}],
        )


class TestFEFO(BaseTest):
    def test_lots_perimes_exclus_et_plus_proche_peremption_d_abord(self):
        plan = selectionner_lots_fefo(self.med, self.depot, 15)
        self.assertEqual([(l.numero_lot, q) for l, q in plan], [("COURT", 10), ("LONG", 5)])

    def test_stock_insuffisant_ignore_les_lots_perimes(self):
        with self.assertRaises(ErreurMetier):
            selectionner_lots_fefo(self.med, self.depot, 31)  # 10 + 20 vendables (les 50 périmés ne comptent pas)


class TestVente(BaseTest):
    def setUp(self):
        super().setUp()
        ouvrir_session(utilisateur=self.caissier, caisse_id=self.caisse.pk, montant_initial=Decimal("1000"))

    def test_vente_reduit_stock_ecrit_historique_et_caisse(self):
        vente = creer_vente(
            utilisateur=self.caissier, articles=[{"medicament": self.med, "quantite": 12}],
            paiements=[{"mode_paiement": self.especes, "montant": Decimal("1240")}], montant_recu=Decimal("1500"),
        )  # 10 x 100 + 2 x 120
        self.assertEqual(vente.total, Decimal("1240.00"))
        self.assertEqual(self.stock(self.lot_court), 0)
        self.assertEqual(self.stock(self.lot_long), 18)
        self.assertEqual(self.stock(self.lot_perime), 50)
        mvts = MouvementStock.objects.filter(reference=vente.reference, type_mouvement="VENTE")
        self.assertEqual(mvts.count(), 2)
        self.assertEqual(sorted(m.quantite for m in mvts), [-10, -2])
        self.assertTrue(vente.reference.startswith("REC-"))

    def test_stock_insuffisant_annule_tout(self):
        with self.assertRaises(ErreurMetier):
            creer_vente(utilisateur=self.caissier, articles=[{"medicament": self.med, "quantite": 999}],
                        paiements=[{"mode_paiement": self.especes, "montant": Decimal("1")}])
        self.assertEqual(Vente.objects.count(), 0)
        self.assertEqual(self.stock(self.lot_court), 10)

    def test_paiement_incorrect_annule_tout(self):
        with self.assertRaises(ErreurMetier):
            creer_vente(utilisateur=self.caissier, articles=[{"medicament": self.med, "quantite": 2}],
                        paiements=[{"mode_paiement": self.especes, "montant": Decimal("50")}])
        self.assertEqual(Vente.objects.count(), 0)
        self.assertEqual(self.stock(self.lot_court), 10)
        self.assertEqual(MouvementStock.objects.filter(type_mouvement="VENTE").count(), 0)

    def test_vente_sans_session_refusee(self):
        with self.assertRaises(ErreurMetier):
            creer_vente(utilisateur=self.magasinier, articles=[{"medicament": self.med, "quantite": 1}],
                        paiements=[{"mode_paiement": self.especes, "montant": Decimal("100")}])

    def test_paiement_mixte_et_cloture_avec_ecart(self):
        creer_vente(utilisateur=self.caissier, articles=[{"medicament": self.med, "quantite": 5}],
                    paiements=[{"mode_paiement": self.especes, "montant": Decimal("300")},
                               {"mode_paiement": self.bankily, "montant": Decimal("200")}])
        session = self.caissier.sessioncaisse_set.first() if hasattr(self.caissier, "sessioncaisse_set") else None
        from apps.caisse.models import SessionCaisse

        session = SessionCaisse.objects.get(caissier=self.caissier)
        cloturee = fermer_session(session.pk, self.caissier, Decimal("1250"))
        self.assertEqual(cloturee.total_ventes, Decimal("500.00"))
        self.assertEqual(cloturee.total_especes, Decimal("300.00"))
        self.assertEqual(cloturee.total_autres_paiements, Decimal("200.00"))
        self.assertEqual(cloturee.montant_attendu, Decimal("1300.00"))
        self.assertEqual(cloturee.ecart, Decimal("-50.00"))
        with self.assertRaises(ErreurMetier):
            cloturee.note = "modif"
            cloturee.save()

    def test_annulation_remet_le_stock_et_rembourse(self):
        vente = creer_vente(utilisateur=self.caissier, articles=[{"medicament": self.med, "quantite": 4}],
                            paiements=[{"mode_paiement": self.especes, "montant": Decimal("400")}])
        annuler_vente(vente.pk, self.admin if False else self.caissier, "Erreur de saisie")
        self.assertEqual(self.stock(self.lot_court), 10)
        vente.refresh_from_db()
        self.assertEqual(vente.statut, "ANNULEE")
        with self.assertRaises(ErreurMetier):
            annuler_vente(vente.pk, self.caissier, "encore")

    def test_historique_immuable(self):
        vente = self.vendre(1, [{"mode_paiement": self.especes, "montant": Decimal("100")}])
        mvt = MouvementStock.objects.filter(reference=vente.reference).first()
        with self.assertRaises(ErreurMetier):
            mvt.quantite = 99
            mvt.save()
        with self.assertRaises(ErreurMetier):
            mvt.delete()
        with self.assertRaises(ErreurMetier):
            MouvementStock.objects.all().update(quantite=0)


class TestAchatTransfertInventaire(BaseTest):
    def test_achat_cree_lot_stock_et_historique(self):
        fournisseur = Fournisseur.objects.create(nom="Grossiste")
        achat = Achat.objects.create(reference=prochaine_reference("ACH"), fournisseur=fournisseur, depot=self.depot, utilisateur=self.admin)
        LigneAchat.objects.create(achat=achat, medicament=self.med, numero_lot="NEW", date_peremption=timezone.localdate() + timedelta(days=500),
                                  quantite=40, prix_achat=Decimal("55"))
        achat.recalculer_total()
        self.assertEqual(achat.total, Decimal("2200.00"))
        achat = valider_achat(achat.pk, self.admin, Decimal("1000"), self.especes)
        lot = Lot.objects.get(numero_lot="NEW")
        self.assertEqual(self.stock(lot), 40)
        self.assertEqual(achat.reste_a_payer, Decimal("1200.00"))
        self.assertEqual(MouvementStock.objects.filter(reference=achat.reference).count(), 1)
        with self.assertRaises(ErreurMetier):
            annuler_achat(achat.pk, self.admin)  # déjà partiellement payé

    def test_achat_lot_perime_refuse(self):
        fournisseur = Fournisseur.objects.create(nom="Grossiste")
        achat = Achat.objects.create(reference=prochaine_reference("ACH"), fournisseur=fournisseur, depot=self.depot, utilisateur=self.admin)
        LigneAchat.objects.create(achat=achat, medicament=self.med, numero_lot="X", date_peremption=timezone.localdate() - timedelta(days=2),
                                  quantite=1, prix_achat=Decimal("1"))
        with self.assertRaises(ErreurMetier):
            valider_achat(achat.pk, self.admin)

    def test_transfert_valide_puis_annule(self):
        from apps.stock.models import LigneTransfert, Transfert

        t = Transfert.objects.create(reference=prochaine_reference("TRF"), utilisateur=self.magasinier,
                                     depot_source=self.depot, depot_destination=self.magasin)
        LigneTransfert.objects.create(transfert=t, lot=self.lot_long, quantite=8)
        valider_transfert(t.pk, self.magasinier)
        self.assertEqual(self.stock(self.lot_long), 12)
        self.assertEqual(self.stock(self.lot_long, self.magasin), 8)
        annuler_transfert(t.pk, self.magasinier)
        self.assertEqual(self.stock(self.lot_long), 20)
        self.assertEqual(self.stock(self.lot_long, self.magasin), 0)

    def test_transfert_stock_insuffisant_tout_ou_rien(self):
        from apps.stock.models import LigneTransfert, Transfert

        t = Transfert.objects.create(reference=prochaine_reference("TRF"), utilisateur=self.magasinier,
                                     depot_source=self.depot, depot_destination=self.magasin)
        LigneTransfert.objects.create(transfert=t, lot=self.lot_court, quantite=5)
        LigneTransfert.objects.create(transfert=t, lot=self.lot_long, quantite=999)
        with self.assertRaises(ErreurMetier):
            valider_transfert(t.pk, self.magasinier)
        self.assertEqual(self.stock(self.lot_court), 10)
        self.assertEqual(self.stock(self.magasin and self.lot_court, self.magasin), 0)

    def test_inventaire_ajuste_sans_doublon(self):
        inv = creer_inventaire(depot=self.depot, utilisateur=self.magasinier)
        for ligne in inv.lignes.all():
            ligne.quantite_physique = ligne.quantite_theorique - (2 if ligne.lot_id == self.lot_long.pk else 0)
            ligne.save()
        valider_inventaire(inv.pk, self.magasinier)
        self.assertEqual(self.stock(self.lot_long), 18)
        self.assertEqual(Stock.objects.filter(lot=self.lot_long, depot=self.depot).count(), 1)
        mvts = MouvementStock.objects.filter(reference=inv.reference)
        self.assertEqual(mvts.count(), 1)
        self.assertEqual(mvts.first().quantite, -2)

    def test_inventaire_refuse_lignes_non_comptees(self):
        inv = creer_inventaire(depot=self.depot, utilisateur=self.magasinier)
        with self.assertRaises(ErreurMetier):
            valider_inventaire(inv.pk, self.magasinier)

    def test_references_uniques(self):
        refs = {prochaine_reference("REC") for _ in range(20)}
        self.assertEqual(len(refs), 20)


class TestAPI(BaseTest):
    def client_pour(self, utilisateur):
        c = APIClient()
        c.force_authenticate(utilisateur)
        return c

    def test_connexion_et_jeton(self):
        c = APIClient()
        r = c.post("/api/auth/connexion/", {"identifiant": "admin", "mot_de_passe": "motdepasse1"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertIn("acces", r.data)
        c.credentials(HTTP_AUTHORIZATION="Bearer " + r.data["acces"])
        self.assertEqual(c.get("/api/auth/moi/").data["role"], "ADMIN")
        r2 = APIClient().post("/api/auth/rafraichir/", {"rafraichissement": r.data["rafraichissement"]}, format="json")
        self.assertEqual(r2.status_code, 200)
        r3 = APIClient().post("/api/auth/connexion/", {"identifiant": "admin", "mot_de_passe": "faux"}, format="json")
        self.assertEqual(r3.status_code, 401)

    def test_roles(self):
        caissier = self.client_pour(self.caissier)
        self.assertEqual(caissier.get("/api/medicaments/").status_code, 200)
        self.assertEqual(caissier.get("/api/achats/").status_code, 403)
        self.assertEqual(caissier.get("/api/utilisateurs/").status_code, 403)
        self.assertEqual(caissier.get("/api/mouvements-stock/").status_code, 403)
        self.assertEqual(caissier.post("/api/medicaments/", {"nom": "X"}, format="json").status_code, 403)
        magasinier = self.client_pour(self.magasinier)
        self.assertEqual(magasinier.get("/api/mouvements-stock/").status_code, 200)
        self.assertEqual(magasinier.get("/api/ventes/").status_code, 403)
        self.assertEqual(magasinier.get("/api/rapports/ventes/").status_code, 403)
        self.assertEqual(self.client_pour(self.admin).get("/api/rapports/ventes/").status_code, 200)

    def test_caissier_ne_voit_pas_prix_achat(self):
        r = self.client_pour(self.caissier).get("/api/medicaments/")
        self.assertNotIn("prix_achat", r.data["resultats"][0])
        r = self.client_pour(self.admin).get("/api/medicaments/")
        self.assertIn("prix_achat", r.data["resultats"][0])

    def test_scenario_vente_complet_api(self):
        c = self.client_pour(self.caissier)
        r = c.post("/api/sessions-caisse/", {"caisse": self.caisse.pk, "montant_initial": 500}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r = c.get(f"/api/medicaments/recherche-caisse/?q=parac&depot={self.depot.pk}")
        self.assertEqual(r.data[0]["stock_disponible"], 30)
        apercu = c.post("/api/ventes/apercu/", {"articles": [{"medicament": self.med.pk, "quantite": 12}]}, format="json")
        self.assertEqual(apercu.status_code, 200, apercu.data)
        self.assertEqual(Decimal(str(apercu.data["total"])), Decimal("1240"))
        r = c.post("/api/ventes/", {"articles": [{"medicament": self.med.pk, "quantite": 12}],
                                    "paiements": [{"mode_paiement": self.especes.pk, "montant": 1240}],
                                    "montant_recu": 1500}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Decimal(str(r.data["rendu"])), Decimal("260"))
        recu = c.get(f"/api/recus/{r.data['id']}/")
        self.assertEqual(recu.status_code, 200)
        r = c.post("/api/ventes/", {"articles": [{"medicament": self.med.pk, "quantite": 500}],
                                    "paiements": [{"mode_paiement": self.especes.pk, "montant": 1}]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("insuffisant", r.data["detail"])
        r = c.get("/api/tableau-de-bord/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["ventes_aujourdhui"]["nombre"], 1)
        s = c.get("/api/sessions-caisse/actuelle/").data["session"]
        r = c.post(f"/api/sessions-caisse/{s['id']}/fermer/", {"montant_reel": 1740}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Decimal(str(r.data["ecart"])), Decimal("0"))

    def test_stock_endpoints(self):
        c = self.client_pour(self.magasinier)
        r = c.get("/api/stocks/")
        self.assertEqual(r.status_code, 200)
        etats = {l["numero_lot"]: l["etat"] for l in r.data["resultats"]}
        self.assertEqual(etats["PER"], "PERIME")
        self.assertEqual(etats["COURT"], "BIENTOT_PERIME")
        self.assertEqual(etats["LONG"], "DISPONIBLE")
        self.assertEqual(len(c.get("/api/stocks/?perime=1").data["resultats"]), 1)
        self.assertEqual(c.get("/api/stocks/synthese/").status_code, 200)
        self.assertEqual(c.get("/api/alertes/").status_code, 200)
        r = c.post("/api/stocks/entree/", {"medicament": self.med.pk, "numero_lot": "E1", "date_peremption": str(timezone.localdate() + timedelta(days=200)),
                                           "depot": self.depot.pk, "quantite": 15, "motif": "CORRECTION"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r = c.post("/api/stocks/sortie/", {"lot": self.lot_perime.pk, "depot": self.depot.pk, "quantite": 50, "motif": "PEREMPTION"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r = c.post("/api/stocks/sortie/", {"lot": self.lot_perime.pk, "depot": self.depot.pk, "quantite": 1, "motif": "PERTE"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_rapports(self):
        c = self.client_pour(self.admin)
        for url in ("ventes", "achats", "caisse", "mouvements", "stock"):
            self.assertEqual(c.get(f"/api/rapports/{url}/").status_code, 200, url)
        for t in ("valeur", "faible", "ruptures", "peremption"):
            self.assertEqual(c.get(f"/api/rapports/stock/?type={t}").status_code, 200, t)
        for g in ("caissier", "depot", "medicament"):
            self.assertEqual(c.get(f"/api/rapports/ventes/?regroupement={g}").status_code, 200, g)
        self.assertEqual(c.get("/api/rapports/achats/?regroupement=fournisseur").status_code, 200)

    def test_medicament_creation_code_auto_et_audit(self):
        c = self.client_pour(self.admin)
        r = c.post("/api/medicaments/", {"nom": "Aspirine", "prix_vente": "50", "code_barre": ""}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data["code"].startswith("MED-"))
        c.patch(f"/api/medicaments/{r.data['id']}/", {"prix_vente": "55"}, format="json")
        h = c.get(f"/api/medicaments/{r.data['id']}/historique/")
        self.assertEqual(h.status_code, 200)
        self.assertEqual(len(h.data["modifications"]), 2)
