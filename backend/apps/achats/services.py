from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.commun.audit import enregistrer_audit
from apps.commun.constantes import StatutDocument
from apps.commun.exceptions import ErreurMetier
from apps.fournisseurs.models import PaiementFournisseur
from apps.medicaments.models import Lot
from apps.stock.models import TypeMouvement
from apps.stock.services import appliquer_mouvement

from .models import Achat


@transaction.atomic
def valider_achat(achat_id, utilisateur, montant_paye=Decimal("0"), mode_paiement=None):
    """Achat validé → lot créé/mis à jour → entrée en stock → historique (tout ou rien)."""
    achat = Achat.objects.select_for_update().select_related("depot", "fournisseur").get(pk=achat_id)
    if achat.statut != StatutDocument.BROUILLON:
        raise ErreurMetier("Seul un achat en brouillon peut être validé.")
    lignes = list(achat.lignes.select_related("medicament"))
    if not lignes:
        raise ErreurMetier("L'achat ne contient aucune ligne.")
    if not achat.depot.actif:
        raise ErreurMetier("Le dépôt de réception est désactivé.")
    aujourdhui = timezone.localdate()

    for ligne in lignes:
        if ligne.date_peremption < aujourdhui:
            raise ErreurMetier(f"« {ligne.medicament.nom} » (lot {ligne.numero_lot}) est déjà périmé : achat refusé.")
        lot, cree = Lot.objects.select_for_update().get_or_create(
            medicament=ligne.medicament, numero_lot=ligne.numero_lot,
            defaults={
                "date_peremption": ligne.date_peremption, "date_fabrication": ligne.date_fabrication,
                "prix_achat": ligne.prix_achat, "prix_vente": ligne.prix_vente, "quantite_initiale": ligne.quantite,
            },
        )
        if not cree:
            if lot.date_peremption != ligne.date_peremption:
                raise ErreurMetier(
                    f"Le lot {ligne.numero_lot} de « {ligne.medicament.nom} » existe déjà avec une autre "
                    f"date de péremption ({lot.date_peremption:%d/%m/%Y})."
                )
            lot.quantite_initiale += ligne.quantite
            lot.prix_achat = ligne.prix_achat
            if ligne.prix_vente is not None:
                lot.prix_vente = ligne.prix_vente
            lot.save()
        appliquer_mouvement(
            lot=lot, depot=achat.depot, quantite=ligne.quantite, type_mouvement=TypeMouvement.ENTREE,
            utilisateur=utilisateur, motif=f"Achat fournisseur — {achat.fournisseur.nom}", reference=achat.reference,
        )
        ligne.lot = lot
        ligne.save(update_fields=["lot"])
        medicament = ligne.medicament
        medicament.prix_achat = ligne.prix_achat  # dernier prix d'achat connu
        medicament.save(update_fields=["prix_achat", "date_modification"])

    achat.statut = StatutDocument.VALIDE
    achat.date_validation = timezone.now()
    achat.save(update_fields=["statut", "date_validation"])
    enregistrer_audit(utilisateur, "VALIDATION", "Achat", achat.pk, reference=achat.reference,
                      ancienne={"statut": "BROUILLON"}, nouvelle={"statut": "VALIDE", "total": str(achat.total)})
    if montant_paye and Decimal(montant_paye) > 0:
        payer_achat(achat.pk, utilisateur, Decimal(montant_paye), mode_paiement)
    return Achat.objects.get(pk=achat.pk)


@transaction.atomic
def payer_achat(achat_id, utilisateur, montant, mode_paiement=None, reference="", note=""):
    achat = Achat.objects.select_for_update().get(pk=achat_id)
    if achat.statut != StatutDocument.VALIDE:
        raise ErreurMetier("Seul un achat validé peut être payé.")
    montant = Decimal(montant)
    if montant <= 0:
        raise ErreurMetier("Le montant doit être supérieur à zéro.")
    if montant > achat.reste_a_payer:
        raise ErreurMetier(f"Le montant dépasse le reste à payer ({achat.reste_a_payer}).")
    PaiementFournisseur.objects.create(
        achat=achat, fournisseur=achat.fournisseur, montant=montant, mode_paiement=mode_paiement,
        reference=reference, note=note, utilisateur=utilisateur,
    )
    achat.montant_paye += montant
    achat.save(update_fields=["montant_paye"])
    enregistrer_audit(utilisateur, "PAIEMENT", "Achat", achat.pk, reference=achat.reference,
                      nouvelle={"montant": str(montant), "montant_paye": str(achat.montant_paye)})
    return achat


@transaction.atomic
def annuler_achat(achat_id, utilisateur):
    """Annulation = mouvements inverses (sortie du stock reçu). Refusée si le stock a déjà été vendu."""
    achat = Achat.objects.select_for_update().select_related("depot").get(pk=achat_id)
    if achat.statut == StatutDocument.ANNULE:
        raise ErreurMetier("Cet achat est déjà annulé.")
    ancien_statut = achat.statut
    if ancien_statut == StatutDocument.VALIDE:
        if achat.montant_paye > 0:
            raise ErreurMetier("Cet achat a déjà été payé (totalement ou en partie) : annulation impossible.")
        for ligne in achat.lignes.select_related("lot__medicament"):
            appliquer_mouvement(
                lot=ligne.lot, depot=achat.depot, quantite=-ligne.quantite, type_mouvement=TypeMouvement.SORTIE,
                utilisateur=utilisateur, motif=f"Annulation de l'achat {achat.reference}", reference=achat.reference,
            )
    achat.statut = StatutDocument.ANNULE
    achat.save(update_fields=["statut"])
    enregistrer_audit(utilisateur, "ANNULATION", "Achat", achat.pk, reference=achat.reference,
                      ancienne={"statut": ancien_statut}, nouvelle={"statut": "ANNULE"})
    return achat
