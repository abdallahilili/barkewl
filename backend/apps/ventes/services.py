from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.db.models.functions import Greatest
from django.utils import timezone

from apps.caisse.models import (
    ModePaiement, MouvementCaisse, SessionCaisse, StatutSession, TypeMouvementCaisse,
)
from apps.commun.audit import enregistrer_audit
from apps.commun.exceptions import ErreurMetier
from apps.commun.references import prochaine_reference
from apps.medicaments.models import Medicament
from apps.stock.models import TypeMouvement
from apps.stock.services import appliquer_mouvement, selectionner_lots_fefo

from .models import LigneVente, PaiementVente, StatutVente, Vente

DEUX_DECIMALES = Decimal("0.01")


def planifier_vente(articles, depot, *, verrouiller=False):
    """
    Calcule les lignes de vente (lot FEFO, prix, total) SANS rien enregistrer.
    Le backend décide : le frontend ne fournit que médicament + quantité.
    """
    demandes = defaultdict(int)
    for article in articles:
        demandes[article["medicament"].pk] += article["quantite"]
    if not demandes:
        raise ErreurMetier("Le panier est vide.")
    medicaments = {m.pk: m for m in Medicament.objects.filter(pk__in=demandes)}
    lignes, total = [], Decimal("0")
    for identifiant in sorted(demandes):  # ordre stable => moins de blocages entre ventes simultanées
        medicament = medicaments[identifiant]
        if not medicament.actif:
            raise ErreurMetier(f"« {medicament.nom} » est désactivé et ne peut pas être vendu.")
        for lot, quantite in selectionner_lots_fefo(medicament, depot, demandes[identifiant], verrouiller=verrouiller):
            prix = lot.prix_vente_effectif
            if prix is None or prix <= 0:
                raise ErreurMetier(f"Le prix de vente de « {medicament.nom} » n'est pas défini.")
            ligne_total = (prix * quantite).quantize(DEUX_DECIMALES)
            total += ligne_total
            lignes.append({"medicament": medicament, "lot": lot, "quantite": quantite,
                           "prix_unitaire": prix, "total": ligne_total})
    return lignes, total


@transaction.atomic
def creer_vente(*, utilisateur, articles, paiements, client=None, montant_recu=None, note=""):
    session = (
        SessionCaisse.objects.select_for_update().select_related("caisse__depot")
        .filter(caissier=utilisateur, statut=StatutSession.OUVERTE).first()
    )
    if session is None:
        raise ErreurMetier("Aucune session de caisse ouverte. Ouvrez une session avant de vendre.")
    depot = session.caisse.depot
    lignes, total = planifier_vente(articles, depot, verrouiller=True)

    somme_paiements = sum((p["montant"] for p in paiements), Decimal("0"))
    if somme_paiements != total:
        raise ErreurMetier(f"Le total des paiements ({somme_paiements}) doit être égal au total de la vente ({total}).")
    especes = sum((p["montant"] for p in paiements if p["mode_paiement"].type == "ESPECES"), Decimal("0"))
    if montant_recu is not None and montant_recu < especes:
        raise ErreurMetier("Le montant reçu est inférieur au montant payé en espèces.")

    vente = Vente.objects.create(
        reference=prochaine_reference("REC"), client=client, session=session, caissier=utilisateur,
        depot=depot, total=total, montant_recu=montant_recu, note=note,
    )
    for l in lignes:
        LigneVente.objects.create(vente=vente, medicament=l["medicament"], lot=l["lot"], quantite=l["quantite"],
                                  prix_unitaire=l["prix_unitaire"], total=l["total"])
        appliquer_mouvement(lot=l["lot"], depot=depot, quantite=-l["quantite"], type_mouvement=TypeMouvement.VENTE,
                            utilisateur=utilisateur, motif="Vente", reference=vente.reference)
        Medicament.objects.filter(pk=l["medicament"].pk).update(frequence_vente=F("frequence_vente") + l["quantite"])
    for p in paiements:
        PaiementVente.objects.create(vente=vente, mode_paiement=p["mode_paiement"], montant=p["montant"],
                                     reference_transaction=p.get("reference_transaction", ""))
        MouvementCaisse.objects.create(
            session=session, type_mouvement=TypeMouvementCaisse.VENTE, mode_paiement=p["mode_paiement"],
            montant=p["montant"], motif=f"Vente {vente.reference}", vente=vente, utilisateur=utilisateur,
        )
    return vente


@transaction.atomic
def annuler_vente(vente_id, utilisateur, motif):
    """Annulation (jamais de suppression) : stock remis en place + remboursement en caisse."""
    if not motif or not motif.strip():
        raise ErreurMetier("Un motif d'annulation est obligatoire.")
    vente = Vente.objects.select_for_update().select_related("session", "depot").get(pk=vente_id)
    if vente.statut != StatutVente.VALIDEE:
        raise ErreurMetier("Cette vente est déjà annulée.")
    if vente.session.statut == StatutSession.OUVERTE:
        session_cible = SessionCaisse.objects.select_for_update().get(pk=vente.session_id)
    else:
        session_cible = SessionCaisse.objects.select_for_update().filter(
            caissier=utilisateur, statut=StatutSession.OUVERTE).first()
        if session_cible is None:
            raise ErreurMetier("La session d'origine est clôturée : ouvrez une session de caisse pour enregistrer le remboursement.")
    for ligne in vente.lignes.select_related("lot__medicament"):
        appliquer_mouvement(lot=ligne.lot, depot=vente.depot, quantite=ligne.quantite, type_mouvement=TypeMouvement.RETOUR,
                            utilisateur=utilisateur, motif=f"Annulation de la vente {vente.reference}", reference=vente.reference)
        Medicament.objects.filter(pk=ligne.lot.medicament_id).update(
            frequence_vente=Greatest(F("frequence_vente") - ligne.quantite, 0)
        )
    for paiement in vente.paiements.select_related("mode_paiement"):
        MouvementCaisse.objects.create(
            session=session_cible, type_mouvement=TypeMouvementCaisse.REMBOURSEMENT, mode_paiement=paiement.mode_paiement,
            montant=paiement.montant, motif=f"Annulation {vente.reference}", vente=vente, utilisateur=utilisateur,
        )
    vente.statut = StatutVente.ANNULEE
    vente.date_annulation = timezone.now()
    vente.annule_par = utilisateur
    vente.motif_annulation = motif.strip()[:255]
    vente.save(update_fields=["statut", "date_annulation", "annule_par", "motif_annulation"])
    enregistrer_audit(utilisateur, "ANNULATION", "Vente", vente.pk, reference=vente.reference,
                      ancienne={"statut": "VALIDEE"}, nouvelle={"statut": "ANNULEE", "motif": vente.motif_annulation})
    return vente
