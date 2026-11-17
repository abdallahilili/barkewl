"""Retours clients, dépenses, nouveaux rapports (produits, bénéfice, compte fournisseur) et format du reçu."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.achats.models import Achat, LigneAchat
from apps.achats.services import payer_achat, valider_achat
from apps.caisse.models import MouvementCaisse, SessionCaisse
from apps.caisse.services import calculer_resume, fermer_session, ouvrir_session
from apps.commun.exceptions import ErreurMetier
from apps.depenses.models import Depense
from apps.depenses.services import annuler_depense, creer_depense
from apps.stock.models import MouvementStock
from apps.ventes.models import RetourVente
from apps.ventes.services import annuler_vente, creer_vente, retourner_articles

from .test_roles_offres import BaseRoles


class BaseRetours(BaseRoles):
    def setUp(self):
        super().setUp()
        self.session = ouvrir_session(utilisateur=self.caissier, caisse_id=self.caisse.pk, montant_initial=Decimal("1000"))
        # 12 unités : 10 du lot COURT à 100, 2 du lot LONG à 120 => 2 lignes, total 1240.
        self.vente = creer_vente(
            utilisateur=self.caissier, articles=[{"medicament": self.med, "quantite": 12}],
            paiements=[{"mode_paiement": self.especes, "montant": Decimal("1240")}], montant_recu=Decimal("1240"),
        )
        self.ligne_court = self.vente.lignes.get(lot=self.lot_court)
        self.ligne_long = self.vente.lignes.get(lot=self.lot_long)

    def retourner(self, ligne, quantite, etat="REVENDABLE", utilisateur=None, **kw):
        return retourner_articles(
            vente_id=self.vente.pk, utilisateur=utilisateur or self.caissier, motif="Client mécontent",
            lignes=[{"ligne_vente": ligne, "quantite": quantite, "etat": etat}], **kw)


class TestRetourPartiel(BaseRetours):
    def test_retour_revendable_remet_en_stock_et_rembourse_en_caisse(self):
        avant = self.stock(self.lot_court)
        retour = self.retourner(self.ligne_court, 3)
        self.assertEqual(retour.total, Decimal("300.00"))
        self.assertTrue(retour.reference.startswith("RET-"))
        self.assertEqual(self.stock(self.lot_court), avant + 3)
        self.assertTrue(MouvementStock.objects.filter(reference=retour.reference, type_mouvement="RETOUR", quantite=3).exists())
        remboursement = MouvementCaisse.objects.get(vente=self.vente, type_mouvement="REMBOURSEMENT")
        self.assertEqual((remboursement.montant, remboursement.mode_paiement), (Decimal("300.00"), self.especes))
        resume = calculer_resume(self.session)
        self.assertEqual(resume["remboursements_especes"], Decimal("300.00"))
        self.assertEqual(resume["total_retours"], Decimal("300.00"))
        self.assertEqual(resume["montant_attendu"], Decimal("1000") + Decimal("1240") - Decimal("300"))
        self.med.refresh_from_db()
        self.assertEqual(self.med.frequence_vente, 9)

    def test_retour_non_revendable_ne_revient_pas_en_stock_mais_est_rembourse(self):
        avant = self.stock(self.lot_long)
        retour = self.retourner(self.ligne_long, 1, etat="NON_REVENDABLE")
        self.assertEqual(self.stock(self.lot_long), avant)
        self.assertEqual(retour.total, Decimal("120.00"))
        self.assertFalse(MouvementStock.objects.filter(reference=retour.reference).exists())
        self.assertEqual(MouvementCaisse.objects.filter(vente=self.vente, type_mouvement="REMBOURSEMENT").count(), 1)

    def test_quantite_limitee_au_reste_a_retourner(self):
        self.retourner(self.ligne_court, 8)
        with self.assertRaises(ErreurMetier):
            self.retourner(self.ligne_court, 3)         # il n'en reste que 2
        self.retourner(self.ligne_court, 2)
        self.assertEqual(RetourVente.objects.count(), 2)

    def test_motif_obligatoire_et_session_ouverte_requise(self):
        with self.assertRaises(ErreurMetier):
            retourner_articles(vente_id=self.vente.pk, utilisateur=self.caissier, motif=" ",
                               lignes=[{"ligne_vente": self.ligne_court, "quantite": 1, "etat": "REVENDABLE"}])
        fermer_session(self.session.pk, self.caissier, Decimal("2240"))
        with self.assertRaises(ErreurMetier):
            self.retourner(self.ligne_court, 1)

    def test_lot_perime_ne_peut_pas_revenir_en_stock(self):
        self.lot_court.date_peremption = timezone.localdate() - timedelta(days=1)
        self.lot_court.save()
        with self.assertRaises(ErreurMetier):
            self.retourner(self.ligne_court, 1)
        self.retourner(self.ligne_court, 1, etat="NON_REVENDABLE")

    def test_tout_ou_rien(self):
        with self.assertRaises(ErreurMetier):
            retourner_articles(vente_id=self.vente.pk, utilisateur=self.caissier, motif="x", lignes=[
                {"ligne_vente": self.ligne_court, "quantite": 1, "etat": "REVENDABLE"},
                {"ligne_vente": self.ligne_long, "quantite": 99, "etat": "REVENDABLE"}])
        self.assertEqual(RetourVente.objects.count(), 0)
        self.assertEqual(MouvementCaisse.objects.filter(type_mouvement="REMBOURSEMENT").count(), 0)

    def test_annulation_impossible_apres_un_retour_et_retour_impossible_apres_annulation(self):
        self.retourner(self.ligne_court, 1)
        with self.assertRaises(ErreurMetier):
            annuler_vente(self.vente.pk, self.admin, "Erreur")
        autre = creer_vente(utilisateur=self.caissier, articles=[{"medicament": self.med, "quantite": 1}],
                            paiements=[{"mode_paiement": self.especes, "montant": Decimal("100")}])
        annuler_vente(autre.pk, self.admin, "Erreur")
        with self.assertRaises(ErreurMetier):
            retourner_articles(vente_id=autre.pk, utilisateur=self.caissier, motif="x",
                               lignes=[{"ligne_vente": autre.lignes.first(), "quantite": 1, "etat": "REVENDABLE"}])


class TestRetourApi(BaseRetours):
    def corps(self, **extra):
        return {"vente": self.vente.pk, "motif": "Mauvais produit",
                "articles": [{"ligne_vente": self.ligne_court.pk, "quantite": 2, "etat": "REVENDABLE"}], **extra}

    def poster(self, utilisateur, **extra):
        return self.client_pour(utilisateur).post("/api/retours-clients/", self.corps(**extra), format="json")

    def test_le_vendeur_a_besoin_du_pin_du_proprietaire_ou_du_pharmacien(self):
        self.assertEqual(self.poster(self.caissier).status_code, 400)
        self.assertEqual(self.poster(self.caissier, approbateur_identifiant="pharma", approbateur_pin="0000").status_code, 400)
        r = self.poster(self.caissier, approbateur_identifiant="pharma", approbateur_pin="2468")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["approuve_par_nom"], self.pharmacien.nom_complet)
        self.assertEqual(r.data["total"], Decimal("200.00"))
        self.assertEqual(r.data["lignes"][0]["etat"], "REVENDABLE")

    def test_le_pharmacien_n_a_pas_besoin_de_pin(self):
        from apps.caisse.models import Caisse

        caisse2 = Caisse.objects.create(nom="Caisse 2", depot=self.depot)     # une session ouverte par caisse
        ouvrir_session(utilisateur=self.pharmacien, caisse_id=caisse2.pk, montant_initial=Decimal("0"))
        r = self.poster(self.pharmacien)
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIsNone(r.data["approuve_par_nom"])

    def test_liste_filtree_et_vente_expose_les_quantites_retournables(self):
        self.poster(self.caissier, approbateur_identifiant="pharma", approbateur_pin="2468")
        liste = self.client_pour(self.caissier).get("/api/retours-clients/")
        self.assertEqual(liste.data["total"], 1)
        self.assertEqual(liste.data["montant_total"], Decimal("200.00"))
        vente = self.client_pour(self.caissier).get(f"/api/ventes/{self.vente.pk}/").data
        ligne = next(l for l in vente["lignes"] if l["id"] == self.ligne_court.pk)
        self.assertEqual((ligne["deja_retourne"], ligne["retournable"]), (2, 8))

    def test_le_magasinier_n_a_pas_acces(self):
        self.assertEqual(self.client_pour(self.magasinier).get("/api/retours-clients/").status_code, 403)


class TestDepenses(BaseRetours):
    def test_depense_payee_depuis_la_caisse_deduit_les_especes(self):
        avant = calculer_resume(self.session)["montant_attendu"]
        depense = creer_depense(utilisateur=self.caissier, categorie="LOYER", libelle="Loyer novembre",
                                montant=Decimal("500"), payee_depuis_caisse=True)
        self.assertTrue(depense.reference.startswith("DEP-"))
        self.assertEqual(calculer_resume(self.session)["montant_attendu"], avant - Decimal("500"))
        sortie = MouvementCaisse.objects.get(type_mouvement="SORTIE_MANUELLE")
        self.assertIn(depense.reference, sortie.motif)

    def test_depense_payee_autrement_ne_touche_pas_la_caisse(self):
        avant = calculer_resume(self.session)["montant_attendu"]
        creer_depense(utilisateur=self.admin, categorie="ELECTRICITE", libelle="Facture STEG", montant=Decimal("300"),
                      mode_paiement=self.bankily)
        self.assertEqual(calculer_resume(self.session)["montant_attendu"], avant)
        self.assertFalse(MouvementCaisse.objects.filter(type_mouvement="SORTIE_MANUELLE").exists())

    def test_depense_depuis_la_caisse_exige_session_et_espece_suffisante(self):
        with self.assertRaises(ErreurMetier):
            creer_depense(utilisateur=self.admin, categorie="LOYER", libelle="x", montant=Decimal("10"), payee_depuis_caisse=True)
        with self.assertRaises(ErreurMetier):
            creer_depense(utilisateur=self.caissier, categorie="LOYER", libelle="x", montant=Decimal("999999"), payee_depuis_caisse=True)
        self.assertEqual(Depense.objects.count(), 0)          # tout ou rien

    def test_annulation_remet_l_espece_en_caisse_et_rien_n_est_supprime(self):
        avant = calculer_resume(self.session)["montant_attendu"]
        depense = creer_depense(utilisateur=self.caissier, categorie="SALAIRES", libelle="Avance", montant=Decimal("200"),
                                payee_depuis_caisse=True)
        with self.assertRaises(ErreurMetier):
            annuler_depense(depense.pk, self.caissier, "")
        annuler_depense(depense.pk, self.caissier, "Saisie en double")
        self.assertEqual(calculer_resume(self.session)["montant_attendu"], avant)
        depense.refresh_from_db()
        self.assertEqual(depense.statut, "ANNULEE")
        with self.assertRaises(ErreurMetier):
            annuler_depense(depense.pk, self.caissier, "encore")
        with self.assertRaises(ErreurMetier):
            depense.delete()

    def test_api_reservee_au_proprietaire_et_total_sans_les_annulees(self):
        for utilisateur in (self.caissier, self.pharmacien, self.magasinier):
            self.assertEqual(self.client_pour(utilisateur).get("/api/depenses/").status_code, 403)
        admin = self.client_pour(self.admin)
        r = admin.post("/api/depenses/", {"categorie": "EAU", "libelle": "Eau", "montant": "150", "payee_depuis_caisse": False}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        r2 = admin.post("/api/depenses/", {"categorie": "TRANSPORT", "libelle": "Taxi", "montant": "50"}, format="json")
        admin.post(f"/api/depenses/{r2.data['id']}/annuler/", {"motif": "Erreur"}, format="json")
        liste = admin.get("/api/depenses/").data
        self.assertEqual((liste["total"], liste["montant_total"]), (2, Decimal("150.00")))
        self.assertIn("depenses", admin.get("/api/auth/moi/").data["modules"])
        self.assertEqual(admin.delete(f"/api/depenses/{r.data['id']}/").status_code, 405)


class TestRapports(BaseRetours):
    def setUp(self):
        super().setUp()
        self.admin_api = self.client_pour(self.admin)

    def test_chiffre_d_affaires_net_des_retours(self):
        self.retourner(self.ligne_court, 3)               # 300 rendus
        d = self.admin_api.get("/api/rapports/ventes/").data
        self.assertEqual((d["ventes_brutes"], d["total_retours"], d["chiffre_affaires"]),
                         (Decimal("1240.00"), Decimal("300.00"), Decimal("940.00")))
        self.assertEqual(d["lignes"][0]["total"], Decimal("940.00"))
        par_medicament = self.admin_api.get("/api/rapports/ventes/?regroupement=medicament").data
        self.assertEqual((par_medicament["lignes"][0]["nombre"], par_medicament["lignes"][0]["total"]), (9, Decimal("940.00")))
        tableau = self.admin_api.get("/api/tableau-de-bord/").data
        self.assertEqual(tableau["ventes_aujourdhui"]["total"], Decimal("940.00"))

    def test_benefice_estime(self):
        # Coût d'achat : prix_achat des lots = 0 (non renseigné dans BaseTest) -> on le fixe pour le calcul.
        self.med.unites_par_boite = 1
        self.med.save()
        self.lot_court.prix_achat = Decimal("60")
        self.lot_court.save()
        self.lot_long.prix_achat = Decimal("80")
        self.lot_long.save()
        self.retourner(self.ligne_court, 3)               # revendable : retiré du coût
        self.retourner(self.ligne_long, 1, etat="NON_REVENDABLE")   # perdu : le coût reste
        creer_depense(utilisateur=self.admin, categorie="LOYER", libelle="Loyer", montant=Decimal("100"))
        annulee = creer_depense(utilisateur=self.admin, categorie="EAU", libelle="Eau", montant=Decimal("999"))
        annuler_depense(annulee.pk, self.admin, "Erreur")
        d = self.admin_api.get("/api/rapports/benefice/").data
        self.assertEqual(d["ventes_brutes"], Decimal("1240.00"))
        self.assertEqual(d["retours"], Decimal("420.00"))
        self.assertEqual(d["ventes_nettes"], Decimal("820.00"))
        self.assertEqual(d["cout_achat"], Decimal("10") * 60 + 2 * 80 - 3 * 60)   # 580
        self.assertEqual(d["marge_brute"], Decimal("240.00"))
        self.assertEqual(d["depenses"], Decimal("100.00"))
        self.assertEqual(d["benefice_estime"], Decimal("140.00"))
        self.assertEqual(d["depenses_par_categorie"][0]["categorie"], "LOYER")

    def test_plus_et_moins_vendus_et_dormants(self):
        autre = self.med.__class__.objects.create(nom="Amoxicilline", prix_vente=Decimal("200"))
        lot = autre.lots.create(numero_lot="A1", date_peremption=timezone.localdate() + timedelta(days=200), prix_achat=Decimal("50"))
        from apps.stock.models import TypeMouvement
        from apps.stock.services import appliquer_mouvement
        appliquer_mouvement(lot=lot, depot=self.depot, quantite=5, type_mouvement=TypeMouvement.ENTREE, utilisateur=self.admin)
        dormant = self.med.__class__.objects.create(nom="Dormant", prix_vente=Decimal("10"))
        lot_d = dormant.lots.create(numero_lot="D1", date_peremption=timezone.localdate() + timedelta(days=200), prix_achat=Decimal("5"))
        appliquer_mouvement(lot=lot_d, depot=self.depot, quantite=4, type_mouvement=TypeMouvement.ENTREE, utilisateur=self.admin)
        creer_vente(utilisateur=self.caissier, articles=[{"medicament": autre, "quantite": 1}],
                    paiements=[{"mode_paiement": self.especes, "montant": Decimal("200")}])
        self.retourner(self.ligne_court, 10)              # le paracétamol retombe à 2 vendus (net)
        plus = self.admin_api.get("/api/rapports/produits/?type=plus_vendus").data["lignes"]
        self.assertEqual([l["medicament"] for l in plus], ["Paracétamol 500 mg", "Amoxicilline"])
        self.assertEqual(plus[0]["quantite"], 2)
        moins = self.admin_api.get("/api/rapports/produits/?type=moins_vendus").data["lignes"]
        self.assertEqual(moins[0]["medicament"], "Amoxicilline")
        dormants = self.admin_api.get("/api/rapports/produits/?type=dormants&jours=30").data
        self.assertEqual([l["medicament"] for l in dormants["lignes"]], ["Dormant"])
        self.assertIsNone(dormants["lignes"][0]["derniere_vente"])

    def test_releve_compte_fournisseur(self):
        from apps.fournisseurs.models import Fournisseur
        fournisseur = Fournisseur.objects.create(nom="Labo Test")
        achat = Achat.objects.create(reference="ACH-T-1", fournisseur=fournisseur, depot=self.depot, utilisateur=self.admin,
                                     date_achat=timezone.localdate() - timedelta(days=5))
        LigneAchat.objects.create(achat=achat, medicament=self.med, numero_lot="N1",
                                  date_peremption=timezone.localdate() + timedelta(days=400), quantite=10, prix_achat=Decimal("60"))
        achat.recalculer_total()
        valider_achat(achat.pk, self.admin)
        payer_achat(achat.pk, self.admin, Decimal("200"), self.especes)
        r = self.admin_api.get(f"/api/rapports/fournisseur/?fournisseur={fournisseur.pk}")
        self.assertEqual(r.status_code, 200, r.data)
        d = r.data
        self.assertEqual((d["solde_initial"], d["total_facture"], d["total_paye"], d["solde_final"]),
                         (Decimal("0"), Decimal("600.00"), Decimal("200.00"), Decimal("400.00")))
        self.assertEqual([l["type"] for l in d["lignes"]], ["ACHAT", "PAIEMENT"])
        self.assertEqual(d["lignes"][-1]["solde"], Decimal("400.00"))
        # Période qui commence après l'achat : le solde d'ouverture reprend le dû.
        demain = (timezone.localdate() - timedelta(days=1)).isoformat()
        d2 = self.admin_api.get(f"/api/rapports/fournisseur/?fournisseur={fournisseur.pk}&date_debut={demain}").data
        self.assertEqual(d2["solde_initial"], Decimal("600.00"))
        self.assertEqual(self.admin_api.get("/api/rapports/fournisseur/").status_code, 400)

    def test_rapports_de_gestion_reserves_au_proprietaire(self):
        for chemin in ("produits", "benefice", "fournisseur"):
            for utilisateur in (self.caissier, self.pharmacien, self.magasinier):
                self.assertEqual(self.client_pour(utilisateur).get(f"/api/rapports/{chemin}/").status_code, 403, chemin)


class TestFormatRecu(BaseRetours):
    def test_format_et_langue_par_defaut_puis_modifiables_et_controles(self):
        admin = self.client_pour(self.admin)
        recu = admin.get(f"/api/recus/{self.vente.pk}/").data
        self.assertEqual(recu["mise_en_page"], {"format": "demi_a4", "langue": "bilingue"})
        r = admin.put("/api/parametres/", {"recu_format": "80mm", "recu_langue": "ar"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(admin.get(f"/api/recus/{self.vente.pk}/").data["mise_en_page"], {"format": "80mm", "langue": "ar"})
        self.assertEqual(admin.put("/api/parametres/", {"recu_format": "a3"}, format="json").status_code, 400)
        self.assertEqual(admin.put("/api/parametres/", {"recu_langue": "en"}, format="json").status_code, 400)
        # Lisible par le vendeur (impression sur son poste).
        self.assertEqual(self.client_pour(self.caissier).get(f"/api/recus/{self.vente.pk}/").data["mise_en_page"]["format"], "80mm")
