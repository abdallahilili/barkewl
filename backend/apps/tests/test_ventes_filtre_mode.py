"""Historique des ventes : filtre par mode de paiement (wallet) et montant total du résultat filtré."""
from decimal import Decimal

from rest_framework.test import APIClient

from apps.caisse.services import ouvrir_session
from apps.ventes.services import annuler_vente, creer_vente

from .test_flux import BaseTest


class TestFiltreModePaiementVentes(BaseTest):
    def setUp(self):
        super().setUp()
        ouvrir_session(utilisateur=self.caissier, caisse_id=self.caisse.pk, montant_initial=Decimal("0"))

        def vendre(quantite, paiements):
            return creer_vente(utilisateur=self.caissier, articles=[{"medicament": self.med, "quantite": quantite}], paiements=paiements)

        self.v_especes = vendre(2, [{"mode_paiement": self.especes, "montant": Decimal("200")}])
        self.v_bankily = vendre(1, [{"mode_paiement": self.bankily, "montant": Decimal("100")}])
        self.v_mixte = vendre(5, [{"mode_paiement": self.especes, "montant": Decimal("300")},
                                  {"mode_paiement": self.bankily, "montant": Decimal("200")}])
        self.v_annulee = vendre(1, [{"mode_paiement": self.bankily, "montant": Decimal("100")}])
        annuler_vente(self.v_annulee.pk, self.caissier, "Erreur de saisie")

    def lister(self, utilisateur=None, **params):
        client = APIClient()
        client.force_authenticate(utilisateur or self.admin)
        r = client.get("/api/ventes/", params)
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def test_sans_filtre_total_des_ventes_validees(self):
        donnees = self.lister()
        self.assertEqual(donnees["total"], 4)  # la vente annulée reste listée
        self.assertEqual(donnees["montant_total"], Decimal("800"))  # 200 + 100 + 500 : l'annulée ne compte pas
        self.assertTrue(all(v["montant_mode"] is None for v in donnees["resultats"]))

    def test_filtre_bankily_montant_regle_avec_ce_mode(self):
        donnees = self.lister(mode_paiement=self.bankily.pk)
        par_reference = {v["reference"]: v for v in donnees["resultats"]}
        self.assertEqual(set(par_reference), {self.v_bankily.reference, self.v_mixte.reference, self.v_annulee.reference})
        self.assertEqual(par_reference[self.v_bankily.reference]["montant_mode"], Decimal("100"))
        self.assertEqual(par_reference[self.v_mixte.reference]["montant_mode"], Decimal("200"))  # seulement la part Bankily
        self.assertEqual(donnees["montant_total"], Decimal("300"))  # 100 + 200 ; l'annulée est exclue

    def test_filtre_especes(self):
        donnees = self.lister(mode_paiement=self.especes.pk)
        self.assertEqual({v["reference"] for v in donnees["resultats"]}, {self.v_especes.reference, self.v_mixte.reference})
        self.assertEqual(donnees["montant_total"], Decimal("500"))  # 200 + 300

    def test_total_couvre_toutes_les_pages_et_respecte_les_autres_filtres(self):
        donnees = self.lister(mode_paiement=self.bankily.pk, taille_page=1)
        self.assertEqual(len(donnees["resultats"]), 1)
        self.assertEqual(donnees["montant_total"], Decimal("300"))  # toutes les pages, pas seulement la page affichée
        donnees = self.lister(mode_paiement=self.bankily.pk, statut="ANNULEE")
        self.assertEqual(donnees["montant_total"], Decimal("0"))

    def test_le_vendeur_ne_voit_que_ses_ventes(self):
        donnees = self.lister(utilisateur=self.caissier, mode_paiement=self.especes.pk)
        self.assertEqual(donnees["montant_total"], Decimal("500"))
