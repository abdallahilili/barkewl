"""Rapports de gestion (propriétaire) : produits les plus / moins vendus, dormants, bénéfice estimé, compte fournisseur."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import F, Max, Sum
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.achats.models import Achat
from apps.commun.exceptions import ErreurMetier
from apps.commun.utilitaires import plage_dates
from apps.depenses.models import CategorieDepense, Depense, StatutDepense
from apps.fournisseurs.models import Fournisseur, PaiementFournisseur
from apps.medicaments.conditionnement import decrire_quantite
from apps.medicaments.models import Medicament
from apps.stock.alertes import VALEUR_STOCK
from apps.stock.models import Stock
from apps.ventes.models import LigneRetourVente, LigneVente

from . import calculs
from .calculs import somme

DEUX = Decimal("0.01")


def _nom(medicament):
    return f"{medicament.nom} {medicament.dosage}".strip()


class RapportProduitsView(APIView):
    """
    ?type=plus_vendus | moins_vendus | dormants
      plus_vendus / moins_vendus : classement par quantité vendue (en équivalent boîtes), nette des retours ;
      dormants : produits en stock qui ne se sont pas vendus depuis `jours` jours (90 par défaut).
    """

    roles_lecture = ()

    def get(self, request):
        type_rapport = request.query_params.get("type", "plus_vendus")
        if type_rapport in ("plus_vendus", "moins_vendus"):
            return self.classement(request, type_rapport)
        if type_rapport == "dormants":
            return self.dormants(request)
        raise ErreurMetier("Type de rapport inconnu (plus_vendus, moins_vendus, dormants).")

    def classement(self, request, type_rapport):
        debut, fin = plage_dates(request.query_params)
        depot = request.query_params.get("depot")
        try:
            limite = max(1, min(int(request.query_params.get("limite", 20)), 500))
        except ValueError:
            raise ErreurMetier("La limite doit être un nombre entier.")
        ventes = calculs.ventes_validees(debut, fin, depot)
        retours = calculs.retours_periode(debut, fin, depot)
        vendu = (LigneVente.objects.filter(vente__in=ventes).values("medicament_id")
                 .annotate(unites=Sum(F("quantite") * F("unites_par_conditionnement")), montant=somme("total")))
        rendu = (LigneRetourVente.objects.filter(retour__in=retours).values("ligne_vente__medicament_id")
                 .annotate(rendues=Sum("unites"), montant=somme("montant")))
        net = {l["medicament_id"]: [l["unites"], l["montant"]] for l in vendu}
        for l in rendu:
            ligne = net.setdefault(l["ligne_vente__medicament_id"], [0, Decimal("0")])
            ligne[0] -= l["rendues"]
            ligne[1] -= l["montant"]
        medicaments = Medicament.objects.in_bulk([i for i, (unites, _) in net.items() if unites > 0])
        mois = calculs.nombre_de_mois(debut, fin)
        lignes = []
        for identifiant, (unites, montant) in net.items():
            medicament = medicaments.get(identifiant)
            if medicament is None:
                continue
            boites = (Decimal(unites) / medicament.unites_par_boite).quantize(DEUX)
            # CMM : boîtes vendues par mois en moyenne sur la période choisie.
            cmm = (Decimal(unites) / medicament.unites_par_boite / mois).quantize(DEUX)
            lignes.append({"medicament": _nom(medicament), "quantite": unites, "quantite_texte": decrire_quantite(medicament, unites),
                           "boites": boites, "cmm": cmm, "montant": montant})
        lignes.sort(key=lambda l: (l["boites"], l["montant"]), reverse=type_rapport == "plus_vendus")
        return Response({"type": type_rapport, "date_debut": debut, "date_fin": fin, "mois": mois,
                         "lignes": lignes[:limite], "nombre_produits_vendus": len(lignes)})

    def dormants(self, request):
        try:
            jours = max(1, int(request.query_params.get("jours", 90)))
        except ValueError:
            raise ErreurMetier("Le nombre de jours doit être un entier positif.")
        depot = request.query_params.get("depot")
        limite_date = timezone.localdate() - timedelta(days=jours)
        stocks = Stock.objects.filter(quantite__gt=0, lot__medicament__actif=True)
        if depot:
            stocks = stocks.filter(depot_id=depot)
        en_stock = list(stocks.values("lot__medicament_id").annotate(unites=Sum("quantite"), valeur=somme(VALEUR_STOCK)))
        ids = [l["lot__medicament_id"] for l in en_stock]
        dernieres = {
            l["medicament_id"]: l["derniere"]
            for l in LigneVente.objects.filter(medicament_id__in=ids, vente__statut="VALIDEE")
            .values("medicament_id").annotate(derniere=Max("vente__date_vente"))
        }
        medicaments = Medicament.objects.in_bulk(ids)
        aujourdhui = timezone.localdate()
        lignes = []
        for l in en_stock:
            derniere = dernieres.get(l["lot__medicament_id"])
            derniere_date = timezone.localtime(derniere).date() if derniere else None
            if derniere_date and derniere_date >= limite_date:
                continue
            medicament = medicaments[l["lot__medicament_id"]]
            lignes.append({
                "medicament": _nom(medicament), "quantite": l["unites"],
                "quantite_texte": decrire_quantite(medicament, l["unites"]), "valeur": l["valeur"],
                "derniere_vente": derniere_date,
                "jours_sans_vente": (aujourdhui - derniere_date).days if derniere_date else None,
            })
        # Jamais vendus d'abord, puis les plus anciens ; à égalité, la plus grosse valeur immobilisée.
        lignes.sort(key=lambda l: (l["derniere_vente"] is not None, l["derniere_vente"] or aujourdhui, -l["valeur"]))
        return Response({"type": "dormants", "jours": jours, "lignes": lignes[:1000],
                         "nombre_produits": len(lignes), "valeur_immobilisee": sum((l["valeur"] for l in lignes), Decimal("0"))})


class RapportBeneficeView(APIView):
    """Bénéfice estimé = ventes (nettes des retours) − coût d'achat des produits vendus − dépenses de la période."""

    roles_lecture = ()

    def get(self, request):
        debut, fin = plage_dates(request.query_params)
        ventes = calculs.ventes_validees(debut, fin).aggregate(t=somme("total"))["t"]
        retours = calculs.total_retours(debut, fin)
        ventes_nettes = ventes - retours
        cout = calculs.cout_achat_ventes(debut, fin).quantize(DEUX)
        marge = ventes_nettes - cout
        depenses_qs = Depense.objects.filter(statut=StatutDepense.VALIDEE, date_depense__range=(debut, fin))
        par_categorie = depenses_qs.values("categorie").annotate(total=somme("montant")).order_by("-total")
        libelles = dict(CategorieDepense.choices)
        depenses = sum((l["total"] for l in par_categorie), Decimal("0"))
        return Response({
            "date_debut": debut, "date_fin": fin,
            "ventes_brutes": ventes, "retours": retours, "ventes_nettes": ventes_nettes,
            "cout_achat": cout, "marge_brute": marge,
            "depenses": depenses,
            "depenses_par_categorie": [{"categorie": l["categorie"], "libelle": libelles.get(l["categorie"], l["categorie"]),
                                        "total": l["total"]} for l in par_categorie],
            "benefice_estime": marge - depenses,
        })


class RapportFournisseurView(APIView):
    """Relevé de compte d'un fournisseur (?fournisseur=ID) : achats validés, paiements, solde courant."""

    roles_lecture = ()

    def get(self, request):
        identifiant = request.query_params.get("fournisseur")
        if not identifiant:
            raise ErreurMetier("Choisissez un fournisseur.")
        fournisseur = Fournisseur.objects.filter(pk=identifiant).first()
        if fournisseur is None:
            raise ErreurMetier("Fournisseur introuvable.")
        debut, fin = plage_dates(request.query_params, 90)
        achats = Achat.objects.filter(fournisseur=fournisseur, statut="VALIDE")
        paiements = PaiementFournisseur.objects.filter(fournisseur=fournisseur, achat__statut="VALIDE")
        facture_avant = achats.filter(date_achat__lt=debut).aggregate(t=somme("total"))["t"]
        paye_avant = paiements.filter(date_paiement__date__lt=debut).aggregate(t=somme("montant"))["t"]
        solde_initial = facture_avant - paye_avant

        mouvements = []
        for a in achats.filter(date_achat__range=(debut, fin)):
            texte = f"Achat {a.reference}" + (f" (facture {a.reference_facture})" if a.reference_facture else "")
            mouvements.append((a.date_achat, 0, a.pk, {"type": "ACHAT", "reference": a.reference, "libelle": texte,
                                                      "facture": a.total, "paye": Decimal("0")}))
        for p in paiements.filter(date_paiement__date__range=(debut, fin)).select_related("achat", "mode_paiement"):
            texte = f"Paiement {p.achat.reference}" + (f" — {p.mode_paiement.nom}" if p.mode_paiement else "")
            mouvements.append((timezone.localtime(p.date_paiement).date(), 1, p.pk, {
                "type": "PAIEMENT", "reference": p.achat.reference, "libelle": texte,
                "facture": Decimal("0"), "paye": p.montant}))
        mouvements.sort(key=lambda m: m[:3])
        solde, lignes = solde_initial, []
        for date, _, _, ligne in mouvements:
            solde += ligne["facture"] - ligne["paye"]
            lignes.append({"date": date, **ligne, "solde": solde})
        return Response({
            "fournisseur": {"id": fournisseur.pk, "nom": fournisseur.nom, "telephone": fournisseur.telephone},
            "date_debut": debut, "date_fin": fin, "solde_initial": solde_initial, "lignes": lignes,
            "total_facture": sum((l["facture"] for l in lignes), Decimal("0")),
            "total_paye": sum((l["paye"] for l in lignes), Decimal("0")),
            "solde_final": solde,
        })
