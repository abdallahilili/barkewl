from decimal import Decimal

from django.db import transaction
from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.commun.audit import enregistrer_audit
from apps.commun.exceptions import ErreurMetier

from .models import (
    Caisse, ModePaiement, MouvementCaisse, SessionCaisse, StatutSession, TypeMouvementCaisse, TypeModePaiement,
)

ZERO = Decimal("0")


def _somme(qs):
    return qs.aggregate(t=Coalesce(Sum("montant"), Value(ZERO), output_field=DecimalField(max_digits=16, decimal_places=2)))["t"]


@transaction.atomic
def ouvrir_session(*, utilisateur, caisse_id, montant_initial):
    caisse = Caisse.objects.select_for_update().filter(pk=caisse_id).first()
    if caisse is None or not caisse.active:
        raise ErreurMetier("Caisse introuvable ou désactivée.")
    if montant_initial < 0:
        raise ErreurMetier("Le montant initial ne peut pas être négatif.")
    if SessionCaisse.objects.filter(caisse=caisse, statut=StatutSession.OUVERTE).exists():
        raise ErreurMetier("Une session est déjà ouverte sur cette caisse.")
    if SessionCaisse.objects.filter(caissier=utilisateur, statut=StatutSession.OUVERTE).exists():
        raise ErreurMetier("Vous avez déjà une session ouverte : clôturez-la avant d'en ouvrir une autre.")
    session = SessionCaisse.objects.create(caissier=utilisateur, caisse=caisse, montant_initial=montant_initial)
    enregistrer_audit(utilisateur, "OUVERTURE", "SessionCaisse", session.pk, reference=str(session),
                      nouvelle={"caisse": caisse.nom, "montant_initial": str(montant_initial)})
    return session


def calculer_resume(session):
    """Chiffres de la session, recalculés à partir des mouvements (immuables)."""
    mouvements = session.mouvements.all()
    ventes = mouvements.filter(type_mouvement=TypeMouvementCaisse.VENTE)
    ventes_especes = _somme(ventes.filter(mode_paiement__type=TypeModePaiement.ESPECES))
    ventes_autres = _somme(ventes.exclude(mode_paiement__type=TypeModePaiement.ESPECES))
    remboursements_especes = _somme(
        mouvements.filter(type_mouvement=TypeMouvementCaisse.REMBOURSEMENT, mode_paiement__type=TypeModePaiement.ESPECES)
    )
    entrees = _somme(mouvements.filter(type_mouvement=TypeMouvementCaisse.ENTREE_MANUELLE))
    sorties = _somme(mouvements.filter(type_mouvement=TypeMouvementCaisse.SORTIE_MANUELLE))
    from apps.ventes.models import Vente

    ventes_valides = Vente.objects.filter(session=session, statut="VALIDEE")
    total_ventes = ventes_valides.aggregate(
        t=Coalesce(Sum("total"), Value(ZERO), output_field=DecimalField(max_digits=16, decimal_places=2))
    )["t"]
    if session.statut == StatutSession.FERMEE:
        total_ventes = session.total_ventes
    attendu = session.montant_initial + ventes_especes + entrees - remboursements_especes - sorties
    return {
        "nombre_ventes": ventes_valides.count(),
        "total_ventes": total_ventes,
        "total_especes": ventes_especes,
        "total_autres_paiements": ventes_autres,
        "remboursements_especes": remboursements_especes,
        "entrees_manuelles": entrees,
        "sorties_manuelles": sorties,
        "montant_attendu": attendu,
    }


@transaction.atomic
def fermer_session(session_id, utilisateur, montant_reel, note=""):
    session = SessionCaisse.objects.select_for_update().get(pk=session_id)
    if session.statut != StatutSession.OUVERTE:
        raise ErreurMetier("Cette session est déjà clôturée.")
    if session.caissier_id != utilisateur.pk and getattr(utilisateur, "role", None) != "ADMIN":
        raise ErreurMetier("Seul le caissier de la session (ou un administrateur) peut la clôturer.")
    if montant_reel < 0:
        raise ErreurMetier("Le montant compté ne peut pas être négatif.")
    resume = calculer_resume(session)
    session.total_ventes = resume["total_ventes"]
    session.total_especes = resume["total_especes"]
    session.total_autres_paiements = resume["total_autres_paiements"]
    session.montant_attendu = resume["montant_attendu"]
    session.montant_reel = montant_reel
    session.ecart = montant_reel - resume["montant_attendu"]
    session.date_fermeture = timezone.now()
    session.statut = StatutSession.FERMEE
    session.note = note[:255]
    session.save()
    enregistrer_audit(utilisateur, "CLOTURE", "SessionCaisse", session.pk, reference=str(session),
                      nouvelle={"montant_attendu": str(session.montant_attendu), "montant_reel": str(montant_reel),
                                "ecart": str(session.ecart)})
    return session


@transaction.atomic
def ajouter_mouvement_manuel(*, session_id, utilisateur, type_mouvement, montant, motif):
    if type_mouvement not in (TypeMouvementCaisse.ENTREE_MANUELLE, TypeMouvementCaisse.SORTIE_MANUELLE):
        raise ErreurMetier("Type de mouvement manuel invalide.")
    if not motif or not motif.strip():
        raise ErreurMetier("Un motif est obligatoire pour toute opération manuelle.")
    if montant <= 0:
        raise ErreurMetier("Le montant doit être supérieur à zéro.")
    session = SessionCaisse.objects.select_for_update().get(pk=session_id)
    if session.statut != StatutSession.OUVERTE:
        raise ErreurMetier("La session est clôturée.")
    especes = ModePaiement.objects.filter(type=TypeModePaiement.ESPECES, actif=True).first()
    if especes is None:
        raise ErreurMetier("Aucun mode de paiement « Espèces » n'est configuré.")
    if type_mouvement == TypeMouvementCaisse.SORTIE_MANUELLE:
        attendu = calculer_resume(session)["montant_attendu"]
        if montant > attendu:
            raise ErreurMetier(f"Sortie supérieure à l'espèce attendue en caisse ({attendu}).")
    return MouvementCaisse.objects.create(
        session=session, type_mouvement=type_mouvement, mode_paiement=especes, montant=montant,
        motif=motif.strip()[:255], utilisateur=utilisateur,
    )
