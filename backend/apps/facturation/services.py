from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.caisse.models import MouvementCaisse, SessionCaisse, StatutSession, TypeMouvementCaisse
from apps.commun.audit import enregistrer_audit
from apps.commun.exceptions import ErreurMetier
from apps.commun.references import prochaine_reference
from apps.stock.models import TypeMouvement
from apps.stock.services import appliquer_mouvement, selectionner_lots_fefo

from .models import DocumentVente, EtapeDocument, LigneDocumentVente

DEUX_DECIMALES = Decimal("0.01")


@transaction.atomic
def valider_bon_livraison(document_id, utilisateur, quantites_livrees=None):
    """Devis -> Bon de livraison : sort le stock (allocation FEFO par lot, comme une vente).
    Livraison partielle possible via quantites_livrees ({ligne_id: quantite}) ; par défaut, livre tout le devis."""
    document = DocumentVente.objects.select_for_update().select_related("depot", "client").get(pk=document_id)
    if document.annule:
        raise ErreurMetier("Ce devis est annulé.")
    if document.etape != EtapeDocument.DEVIS:
        raise ErreurMetier("Seul un devis peut être transformé en bon de livraison.")
    if not document.depot.actif:
        raise ErreurMetier("Le dépôt est désactivé.")
    lignes = list(document.lignes.select_related("medicament"))
    if not lignes:
        raise ErreurMetier("Ce devis ne contient aucune ligne.")
    quantites_livrees = quantites_livrees or {}

    total = Decimal("0")
    for ligne in lignes:
        livree = quantites_livrees.get(ligne.id, ligne.quantite_devis)
        if livree < 0 or livree > ligne.quantite_devis:
            raise ErreurMetier(f"Quantité livrée invalide pour « {ligne.medicament.nom} ».")
        if livree > 0:
            for lot, quantite in selectionner_lots_fefo(ligne.medicament, document.depot, livree, verrouiller=True):
                appliquer_mouvement(
                    lot=lot, depot=document.depot, quantite=-quantite, type_mouvement=TypeMouvement.VENTE,
                    utilisateur=utilisateur, motif=f"Bon de livraison {document.reference}", reference=document.reference,
                )
        ligne.quantite_livree = livree
        ligne.total = (ligne.prix_unitaire * livree).quantize(DEUX_DECIMALES)
        ligne.save(update_fields=["quantite_livree", "total"])
        total += ligne.total

    document.numero_bl = prochaine_reference("BL")
    document.date_bl = timezone.now()
    document.etape = EtapeDocument.BON_LIVRAISON
    document.total = total
    document.save(update_fields=["numero_bl", "date_bl", "etape", "total"])
    enregistrer_audit(
        utilisateur, "VALIDATION", "DocumentVente", document.pk, reference=document.reference,
        ancienne={"etape": "DEVIS"}, nouvelle={"etape": "BON_LIVRAISON", "numero_bl": document.numero_bl, "total": str(total)},
    )
    return document


@transaction.atomic
def valider_facture(document_id, utilisateur):
    """Bon de livraison -> Facture : purement administratif, aucun mouvement de stock (déjà sorti au BL)."""
    document = DocumentVente.objects.select_for_update().get(pk=document_id)
    if document.etape != EtapeDocument.BON_LIVRAISON:
        raise ErreurMetier("Seul un bon de livraison peut être transformé en facture.")
    document.numero_facture = prochaine_reference("FAC")
    document.date_facture = timezone.now()
    document.etape = EtapeDocument.FACTURE
    document.save(update_fields=["numero_facture", "date_facture", "etape"])
    enregistrer_audit(
        utilisateur, "VALIDATION", "DocumentVente", document.pk, reference=document.reference,
        ancienne={"etape": "BON_LIVRAISON"}, nouvelle={"etape": "FACTURE", "numero_facture": document.numero_facture},
    )
    return document


@transaction.atomic
def payer_facture(document_id, utilisateur, montant, mode_paiement):
    document = DocumentVente.objects.select_for_update().get(pk=document_id)
    if document.etape != EtapeDocument.FACTURE:
        raise ErreurMetier("Seule une facture peut être encaissée.")
    montant = Decimal(montant)
    if montant <= 0:
        raise ErreurMetier("Le montant doit être supérieur à zéro.")
    if montant > document.reste_a_payer:
        raise ErreurMetier(f"Le montant dépasse le reste à payer ({document.reste_a_payer}).")
    if not mode_paiement.actif:
        raise ErreurMetier("Ce mode de paiement est désactivé.")

    session = (
        SessionCaisse.objects.select_for_update()
        .filter(caissier=utilisateur, statut=StatutSession.OUVERTE).first()
    )
    if session is None:
        raise ErreurMetier("Aucune session de caisse ouverte. Ouvrez une session avant d'encaisser un paiement.")

    from .models import PaiementFacture

    PaiementFacture.objects.create(
        document=document, montant=montant, mode_paiement=mode_paiement, session=session, utilisateur=utilisateur,
    )
    MouvementCaisse.objects.create(
        session=session, type_mouvement=TypeMouvementCaisse.ENTREE_MANUELLE, mode_paiement=mode_paiement,
        montant=montant, motif=f"Paiement facture {document.numero_facture}", utilisateur=utilisateur,
    )
    document.montant_paye += montant
    document.save(update_fields=["montant_paye"])
    enregistrer_audit(
        utilisateur, "PAIEMENT", "DocumentVente", document.pk, reference=document.numero_facture,
        nouvelle={"montant": str(montant), "montant_paye": str(document.montant_paye)},
    )
    return document


@transaction.atomic
def annuler_devis(document_id, utilisateur):
    """Un devis ne peut être annulé qu'avant toute sortie de stock (stade DEVIS uniquement)."""
    document = DocumentVente.objects.select_for_update().get(pk=document_id)
    if document.annule:
        raise ErreurMetier("Ce devis est déjà annulé.")
    if document.etape != EtapeDocument.DEVIS:
        raise ErreurMetier("Seul un devis (avant bon de livraison) peut être annulé.")
    document.annule = True
    document.save(update_fields=["annule"])
    enregistrer_audit(
        utilisateur, "ANNULATION", "DocumentVente", document.pk, reference=document.reference,
        ancienne={"annule": False}, nouvelle={"annule": True},
    )
    return document
