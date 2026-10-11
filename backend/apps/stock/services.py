"""
Toute la logique de stock est ici. Règle d'or : la quantité d'un Stock ne se modifie
QUE par appliquer_mouvement(), qui écrit toujours l'historique dans la même transaction.
"""
from django.db import transaction
from django.utils import timezone

from apps.commun.audit import enregistrer_audit
from apps.commun.constantes import StatutDocument
from apps.commun.exceptions import ErreurMetier
from apps.commun.parametres import obtenir_booleen
from apps.commun.references import prochaine_reference
from apps.medicaments.models import Lot

from .models import Inventaire, LigneInventaire, MouvementStock, Stock, Transfert, TypeMouvement


def appliquer_mouvement(*, lot, depot, quantite, type_mouvement, utilisateur, motif="", reference=""):
    """Modifie le stock d'un lot dans un dépôt et enregistre le mouvement (quantité signée)."""
    if quantite == 0:
        raise ErreurMetier("La quantité d'un mouvement ne peut pas être nulle.")
    with transaction.atomic():
        stock, _ = Stock.objects.select_for_update().get_or_create(lot=lot, depot=depot, defaults={"quantite": 0})
        avant = stock.quantite
        apres = avant + quantite
        if apres < 0 and not obtenir_booleen("stock_negatif_autorise"):
            raise ErreurMetier(
                f"Stock insuffisant pour « {lot.medicament.nom} » (lot {lot.numero_lot}) "
                f"dans le dépôt « {depot.nom} » : disponible {avant}, demandé {-quantite}."
            )
        stock.quantite = apres
        stock.save(update_fields=["quantite", "date_modification"])
        return MouvementStock.objects.create(
            utilisateur=utilisateur, medicament=lot.medicament, lot=lot, depot=depot,
            type_mouvement=type_mouvement, quantite=quantite, stock_avant=avant, stock_apres=apres,
            motif=motif[:255], reference=reference,
        )


def selectionner_lots_fefo(medicament, depot, quantite, *, verrouiller=False):
    """
    FEFO : les lots qui expirent en premier sont consommés en premier.
    Les lots périmés ne sont jamais proposés. Retourne [(lot, quantité), ...].
    """
    aujourdhui = timezone.localdate()
    stocks = (
        Stock.objects.filter(depot=depot, lot__medicament=medicament, quantite__gt=0,
                             lot__date_peremption__gte=aujourdhui)
        .select_related("lot__medicament")
        .order_by("lot__date_peremption", "lot_id")
    )
    if verrouiller:
        stocks = stocks.select_for_update()
    restant = quantite
    plan = []
    for stock in stocks:
        prise = min(stock.quantite, restant)
        plan.append((stock.lot, prise))
        restant -= prise
        if restant == 0:
            break
    if restant > 0:
        if plan and obtenir_booleen("stock_negatif_autorise"):
            lot, prise = plan[-1]
            plan[-1] = (lot, prise + restant)
            return plan
        disponible = quantite - restant
        raise ErreurMetier(
            f"Stock insuffisant pour « {medicament.nom} » dans le dépôt « {depot.nom} » : "
            f"demandé {quantite}, disponible {disponible} (lots périmés exclus)."
        )
    return plan


MOTIFS_ENTREE = {
    "RETOUR_CLIENT": (TypeMouvement.RETOUR, "Retour client"),
    "CORRECTION": (TypeMouvement.AJUSTEMENT, "Correction de stock"),
    "AUTRE": (TypeMouvement.ENTREE, "Autre entrée"),
}

MOTIFS_SORTIE = {
    "PEREMPTION": (TypeMouvement.PEREMPTION, "Produit périmé"),
    "ENDOMMAGE": (TypeMouvement.ENDOMMAGE, "Produit endommagé"),
    "PERTE": (TypeMouvement.PERTE, "Perte"),
    "CONSOMMATION_INTERNE": (TypeMouvement.CONSOMMATION_INTERNE, "Consommation interne"),
    "CORRECTION": (TypeMouvement.AJUSTEMENT, "Correction de stock"),
    "AUTRE": (TypeMouvement.SORTIE, "Autre sortie"),
}


@transaction.atomic
def enregistrer_entree(*, utilisateur, medicament, numero_lot, date_peremption, depot, quantite, motif_code,
                       date_fabrication=None, prix_achat=None, prix_vente=None, note=""):
    if quantite <= 0:
        raise ErreurMetier("La quantité doit être supérieure à zéro.")
    type_mouvement, libelle = MOTIFS_ENTREE[motif_code]
    lot, cree = Lot.objects.get_or_create(
        medicament=medicament, numero_lot=numero_lot,
        defaults={
            "date_peremption": date_peremption, "date_fabrication": date_fabrication,
            "prix_achat": prix_achat if prix_achat is not None else medicament.prix_achat,
            "prix_vente": prix_vente, "quantite_initiale": quantite,
        },
    )
    if not cree and lot.date_peremption != date_peremption:
        raise ErreurMetier(
            f"Le lot {numero_lot} existe déjà avec une autre date de péremption ({lot.date_peremption:%d/%m/%Y})."
        )
    motif = f"{libelle} — {note}" if note else libelle
    return appliquer_mouvement(lot=lot, depot=depot, quantite=quantite, type_mouvement=type_mouvement,
                               utilisateur=utilisateur, motif=motif)


@transaction.atomic
def enregistrer_sortie(*, utilisateur, lot, depot, quantite, motif_code, note=""):
    if quantite <= 0:
        raise ErreurMetier("La quantité doit être supérieure à zéro.")
    type_mouvement, libelle = MOTIFS_SORTIE[motif_code]
    motif = f"{libelle} — {note}" if note else libelle
    return appliquer_mouvement(lot=lot, depot=depot, quantite=-quantite, type_mouvement=type_mouvement,
                               utilisateur=utilisateur, motif=motif)


# ---------------------------------------------------------------- Transferts

@transaction.atomic
def valider_transfert(transfert_id, utilisateur):
    transfert = Transfert.objects.select_for_update().select_related("depot_source", "depot_destination").get(pk=transfert_id)
    if transfert.statut != StatutDocument.BROUILLON:
        raise ErreurMetier("Seul un transfert en brouillon peut être validé.")
    lignes = list(transfert.lignes.select_related("lot__medicament").order_by("lot_id"))
    if not lignes:
        raise ErreurMetier("Le transfert ne contient aucune ligne.")
    for ligne in lignes:
        appliquer_mouvement(
            lot=ligne.lot, depot=transfert.depot_source, quantite=-ligne.quantite,
            type_mouvement=TypeMouvement.TRANSFERT_SORTIE, utilisateur=utilisateur,
            motif=f"Transfert vers {transfert.depot_destination.nom}", reference=transfert.reference,
        )
        appliquer_mouvement(
            lot=ligne.lot, depot=transfert.depot_destination, quantite=ligne.quantite,
            type_mouvement=TypeMouvement.TRANSFERT_ENTREE, utilisateur=utilisateur,
            motif=f"Transfert depuis {transfert.depot_source.nom}", reference=transfert.reference,
        )
    transfert.statut = StatutDocument.VALIDE
    transfert.date_validation = timezone.now()
    transfert.save(update_fields=["statut", "date_validation"])
    enregistrer_audit(utilisateur, "VALIDATION", "Transfert", transfert.pk, reference=transfert.reference,
                      ancienne={"statut": "BROUILLON"}, nouvelle={"statut": "VALIDE"})
    return transfert


@transaction.atomic
def annuler_transfert(transfert_id, utilisateur):
    transfert = Transfert.objects.select_for_update().select_related("depot_source", "depot_destination").get(pk=transfert_id)
    if transfert.statut == StatutDocument.ANNULE:
        raise ErreurMetier("Ce transfert est déjà annulé.")
    ancien_statut = transfert.statut
    if ancien_statut == StatutDocument.VALIDE:
        # Annulation d'un transfert validé : mouvements inverses (jamais de suppression).
        for ligne in transfert.lignes.select_related("lot__medicament").order_by("lot_id"):
            appliquer_mouvement(
                lot=ligne.lot, depot=transfert.depot_destination, quantite=-ligne.quantite,
                type_mouvement=TypeMouvement.TRANSFERT_SORTIE, utilisateur=utilisateur,
                motif=f"Annulation du transfert {transfert.reference}", reference=transfert.reference,
            )
            appliquer_mouvement(
                lot=ligne.lot, depot=transfert.depot_source, quantite=ligne.quantite,
                type_mouvement=TypeMouvement.TRANSFERT_ENTREE, utilisateur=utilisateur,
                motif=f"Annulation du transfert {transfert.reference}", reference=transfert.reference,
            )
    transfert.statut = StatutDocument.ANNULE
    transfert.save(update_fields=["statut"])
    enregistrer_audit(utilisateur, "ANNULATION", "Transfert", transfert.pk, reference=transfert.reference,
                      ancienne={"statut": ancien_statut}, nouvelle={"statut": "ANNULE"})
    return transfert


# --------------------------------------------------------------- Inventaires

@transaction.atomic
def creer_inventaire(*, depot, utilisateur, note=""):
    inventaire = Inventaire.objects.create(
        reference=prochaine_reference("INV"), depot=depot, utilisateur=utilisateur, note=note
    )
    charger_stock_theorique(inventaire)
    return inventaire


def charger_stock_theorique(inventaire):
    """(Re)charge les lignes depuis le stock actuel du dépôt, en gardant les quantités déjà comptées."""
    if inventaire.statut != StatutDocument.BROUILLON:
        raise ErreurMetier("Seul un inventaire en brouillon peut être rechargé.")
    comptes = {l.lot_id: l.quantite_physique for l in inventaire.lignes.all()}
    inventaire.lignes.all().delete()
    stocks = Stock.objects.filter(depot=inventaire.depot, quantite__gt=0).select_related("lot__medicament")
    LigneInventaire.objects.bulk_create(
        [LigneInventaire(inventaire=inventaire, lot=s.lot, quantite_theorique=s.quantite,
                         quantite_physique=comptes.get(s.lot_id)) for s in stocks]
    )


@transaction.atomic
def valider_inventaire(inventaire_id, utilisateur):
    inventaire = Inventaire.objects.select_for_update().select_related("depot").get(pk=inventaire_id)
    if inventaire.statut != StatutDocument.BROUILLON:
        raise ErreurMetier("Seul un inventaire en brouillon peut être validé.")
    lignes = list(inventaire.lignes.select_related("lot__medicament").order_by("lot_id"))
    if not lignes:
        raise ErreurMetier("L'inventaire ne contient aucune ligne.")
    non_comptees = [l for l in lignes if l.quantite_physique is None]
    if non_comptees:
        raise ErreurMetier(f"{len(non_comptees)} ligne(s) n'ont pas de quantité physique saisie.")
    for ligne in lignes:
        stock = Stock.objects.select_for_update().filter(lot=ligne.lot, depot=inventaire.depot).first()
        actuel = stock.quantite if stock else 0
        difference = ligne.quantite_physique - actuel
        ligne.ecart_applique = difference
        ligne.save(update_fields=["ecart_applique"])
        if difference != 0:
            appliquer_mouvement(
                lot=ligne.lot, depot=inventaire.depot, quantite=difference,
                type_mouvement=TypeMouvement.INVENTAIRE, utilisateur=utilisateur,
                motif=f"Ajustement d'inventaire (théorique {ligne.quantite_theorique}, compté {ligne.quantite_physique})",
                reference=inventaire.reference,
            )
    inventaire.statut = StatutDocument.VALIDE
    inventaire.date_validation = timezone.now()
    inventaire.save(update_fields=["statut", "date_validation"])
    enregistrer_audit(utilisateur, "VALIDATION", "Inventaire", inventaire.pk, reference=inventaire.reference,
                      ancienne={"statut": "BROUILLON"}, nouvelle={"statut": "VALIDE"})
    return inventaire
