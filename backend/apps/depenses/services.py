from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.caisse.models import ModePaiement, SessionCaisse, StatutSession, TypeMouvementCaisse
from apps.caisse.services import ajouter_mouvement_manuel
from apps.commun.audit import enregistrer_audit
from apps.commun.exceptions import ErreurMetier
from apps.commun.references import prochaine_reference

from .models import CategorieDepense, Depense, StatutDepense


@transaction.atomic
def creer_depense(*, utilisateur, categorie, libelle, montant, date_depense=None, payee_depuis_caisse=False,
                  mode_paiement=None, note=""):
    """Enregistre une dépense. Payée depuis la caisse : les espèces sont déduites de la session ouverte de
    l'utilisateur (sortie de caisse tracée) ; sinon aucune écriture de caisse."""
    if categorie not in CategorieDepense.values:
        raise ErreurMetier("Catégorie de dépense inconnue.")
    if not libelle or not libelle.strip():
        raise ErreurMetier("Un libellé est obligatoire pour une dépense.")
    montant = Decimal(montant)
    if montant <= 0:
        raise ErreurMetier("Le montant doit être supérieur à zéro.")
    date_depense = date_depense or timezone.localdate()
    if date_depense > timezone.localdate():
        raise ErreurMetier("La date d'une dépense ne peut pas être dans le futur.")
    session = None
    if payee_depuis_caisse:
        session = (SessionCaisse.objects.select_for_update()
                   .filter(caissier=utilisateur, statut=StatutSession.OUVERTE).first())
        if session is None:
            raise ErreurMetier("Aucune session de caisse ouverte : ouvrez une session pour payer une dépense avec la caisse.")
        mode_paiement = ModePaiement.objects.filter(type="ESPECES", actif=True).first()
    depense = Depense.objects.create(
        reference=prochaine_reference("DEP"), categorie=categorie, libelle=libelle.strip()[:200], montant=montant,
        date_depense=date_depense, payee_depuis_caisse=payee_depuis_caisse, session=session,
        mode_paiement=mode_paiement, note=(note or "").strip()[:255], utilisateur=utilisateur,
    )
    if payee_depuis_caisse:
        ajouter_mouvement_manuel(
            session_id=session.pk, utilisateur=utilisateur, type_mouvement=TypeMouvementCaisse.SORTIE_MANUELLE,
            montant=montant, motif=f"Dépense {depense.reference} — {depense.libelle}",
        )
    enregistrer_audit(utilisateur, "CREATION", "Depense", depense.pk, reference=depense.reference,
                      nouvelle={"categorie": categorie, "libelle": depense.libelle, "montant": str(montant),
                                "payee_depuis_caisse": payee_depuis_caisse})
    return depense


@transaction.atomic
def annuler_depense(depense_id, utilisateur, motif):
    """Annulation (jamais de suppression). Dépense payée en caisse : l'espèce revient en caisse (mouvement inverse)."""
    if not motif or not motif.strip():
        raise ErreurMetier("Un motif d'annulation est obligatoire.")
    depense = Depense.objects.select_for_update().select_related("session").get(pk=depense_id)
    if depense.statut != StatutDepense.VALIDEE:
        raise ErreurMetier("Cette dépense est déjà annulée.")
    if depense.payee_depuis_caisse:
        if depense.session.statut == StatutSession.OUVERTE:
            session_cible = depense.session
        else:
            session_cible = SessionCaisse.objects.filter(caissier=utilisateur, statut=StatutSession.OUVERTE).first()
            if session_cible is None:
                raise ErreurMetier("La session d'origine est clôturée : ouvrez une session de caisse pour remettre l'espèce en caisse.")
        ajouter_mouvement_manuel(
            session_id=session_cible.pk, utilisateur=utilisateur, type_mouvement=TypeMouvementCaisse.ENTREE_MANUELLE,
            montant=depense.montant, motif=f"Annulation de la dépense {depense.reference}",
        )
    depense.statut = StatutDepense.ANNULEE
    depense.date_annulation = timezone.now()
    depense.annule_par = utilisateur
    depense.motif_annulation = motif.strip()[:255]
    depense.save(update_fields=["statut", "date_annulation", "annule_par", "motif_annulation"])
    enregistrer_audit(utilisateur, "ANNULATION", "Depense", depense.pk, reference=depense.reference,
                      ancienne={"statut": "VALIDEE"}, nouvelle={"statut": "ANNULEE", "motif": depense.motif_annulation})
    return depense
