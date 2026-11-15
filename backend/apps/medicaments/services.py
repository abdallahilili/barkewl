from django.db import transaction

from apps.commun.audit import enregistrer_audit
from apps.commun.constantes import StatutDocument
from apps.commun.exceptions import ErreurMetier

from .models import Lot, Medicament


@transaction.atomic
def changer_unites_par_boite(medicament, nouveau, utilisateur):
    """
    Change le nombre d'unités par boîte d'un médicament en CONVERTISSANT son stock existant :
    5 boîtes comptées « 1 unité = 1 boîte » deviennent 150 comprimés si l'on passe à 30 par boîte.
    Chaque conversion est tracée dans l'historique du stock (mouvement d'ajustement).
    """
    from apps.stock.models import LigneInventaire, LigneTransfert, Stock, TypeMouvement
    from apps.stock.services import appliquer_mouvement

    medicament = Medicament.objects.select_for_update().get(pk=medicament.pk)
    ancien = medicament.unites_par_boite
    if nouveau == ancien:
        return medicament
    if nouveau is None or nouveau < 1:
        raise ErreurMetier("Le nombre d'unités par boîte doit être au moins 1.")

    lots = Lot.objects.filter(medicament=medicament)
    if (LigneTransfert.objects.filter(lot__in=lots, transfert__statut=StatutDocument.BROUILLON).exists()
            or LigneInventaire.objects.filter(lot__in=lots, inventaire__statut=StatutDocument.BROUILLON).exists()):
        raise ErreurMetier(
            f"« {medicament.nom} » figure dans un transfert ou un inventaire en brouillon : "
            "validez-le ou annulez-le avant de changer le conditionnement."
        )

    stocks = list(Stock.objects.select_for_update().filter(lot__in=lots).exclude(quantite=0).select_related("lot", "depot"))
    impossibles = [s for s in stocks if (s.quantite * nouveau) % ancien]
    if impossibles:
        s = impossibles[0]
        raise ErreurMetier(
            f"Impossible de convertir le stock du lot {s.lot.numero_lot} ({s.depot.nom}) : {s.quantite} unité(s) "
            f"ne font pas un nombre entier de boîtes de {ancien}. Faites d'abord un inventaire de ce médicament."
        )

    medicament.unites_par_boite = nouveau
    if medicament.unites_par_plaquette and (medicament.unites_par_plaquette >= nouveau or nouveau % medicament.unites_par_plaquette):
        medicament.unites_par_plaquette = None
    medicament.save(update_fields=["unites_par_boite", "unites_par_plaquette", "date_modification"])

    motif = f"Changement de conditionnement : 1 boîte = {nouveau} unité(s) (avant : {ancien})"
    for stock in stocks:
        converti = stock.quantite * nouveau // ancien
        appliquer_mouvement(lot=stock.lot, depot=stock.depot, quantite=converti - stock.quantite,
                            type_mouvement=TypeMouvement.AJUSTEMENT, utilisateur=utilisateur, motif=motif,
                            reference=medicament.code)
    for lot in lots:
        if (lot.quantite_initiale * nouveau) % ancien == 0:
            lot.quantite_initiale = lot.quantite_initiale * nouveau // ancien
            lot.save(update_fields=["quantite_initiale"])

    enregistrer_audit(utilisateur, "MODIFICATION", "Medicament", medicament.pk, reference=str(medicament),
                      ancienne={"unites_par_boite": ancien}, nouvelle={"unites_par_boite": nouveau},
                      description=f"{motif} — stock converti sur {len(stocks)} ligne(s)")
    return medicament
