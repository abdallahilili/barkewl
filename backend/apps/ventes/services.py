from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.db.models.functions import Greatest
from django.utils import timezone

from apps.caisse.models import (
    ModePaiement, MouvementCaisse, SessionCaisse, StatutSession, TypeMouvementCaisse,
)
from apps.commun.audit import enregistrer_audit
from apps.commun.exceptions import ErreurMetier
from apps.commun.references import prochaine_reference
from apps.medicaments.conditionnement import BOITE, PLAQUETTE, UNITE, multiplicateur, prix_conditionnement
from apps.medicaments.models import Medicament
from apps.stock.models import TypeMouvement
from apps.stock.services import appliquer_mouvement, selectionner_lots_fefo

from .models import EtatRetour, LigneRetourVente, LigneVente, PaiementVente, RetourVente, StatutVente, Vente

DEUX_DECIMALES = Decimal("0.01")


ORDRE_CONDITIONNEMENTS = {BOITE: 0, PLAQUETTE: 1, UNITE: 2}


def planifier_vente(articles, depot, *, verrouiller=False):
    """
    Calcule les lignes de vente (lot FEFO, prix, total) SANS rien enregistrer.
    Le backend décide : le frontend ne fournit que médicament + conditionnement + quantité.
    Les boîtes sont réservées en premier (boîtes complètes uniquement), puis les plaquettes et les unités.
    """
    demandes = defaultdict(int)
    for article in articles:
        demandes[(article["medicament"].pk, article.get("conditionnement") or BOITE)] += article["quantite"]
    if not demandes:
        raise ErreurMetier("Le panier est vide.")
    medicaments = {m.pk: m for m in Medicament.objects.filter(pk__in={cle[0] for cle in demandes})}
    lignes, total = [], Decimal("0")
    reserve = defaultdict(dict)   # médicament -> {lot_id: unités déjà prises dans cette vente}
    # Ordre stable (médicament puis conditionnement) => moins de blocages entre ventes simultanées.
    for identifiant, conditionnement in sorted(demandes, key=lambda c: (c[0], ORDRE_CONDITIONNEMENTS.get(c[1], 9))):
        medicament = medicaments[identifiant]
        if not medicament.actif:
            raise ErreurMetier(f"« {medicament.nom} » est désactivé et ne peut pas être vendu.")
        par = multiplicateur(medicament, conditionnement)
        nombre = demandes[(identifiant, conditionnement)]
        plan = selectionner_lots_fefo(medicament, depot, nombre * par, verrouiller=verrouiller,
                                      granularite=par, deja_pris=reserve[identifiant])
        for lot, unites in plan:
            prix = prix_conditionnement(medicament, conditionnement, lot.prix_vente_effectif)
            if prix is None or prix <= 0:
                raise ErreurMetier(f"Le prix de vente de « {medicament.nom} » n'est pas défini.")
            quantite = unites // par
            ligne_total = (prix * quantite).quantize(DEUX_DECIMALES)
            total += ligne_total
            lignes.append({"medicament": medicament, "lot": lot, "conditionnement": conditionnement,
                           "unites_par_conditionnement": par, "quantite": quantite,
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
        ligne = LigneVente.objects.create(
            vente=vente, medicament=l["medicament"], lot=l["lot"], conditionnement=l["conditionnement"],
            unites_par_conditionnement=l["unites_par_conditionnement"], quantite=l["quantite"],
            prix_unitaire=l["prix_unitaire"], total=l["total"],
        )
        appliquer_mouvement(lot=l["lot"], depot=depot, quantite=-ligne.quantite_unites, type_mouvement=TypeMouvement.VENTE,
                            utilisateur=utilisateur, motif="Vente", reference=vente.reference)
        Medicament.objects.filter(pk=l["medicament"].pk).update(frequence_vente=F("frequence_vente") + ligne.quantite_unites)
    for p in paiements:
        PaiementVente.objects.create(vente=vente, mode_paiement=p["mode_paiement"], montant=p["montant"],
                                     reference_transaction=p.get("reference_transaction", ""))
        MouvementCaisse.objects.create(
            session=session, type_mouvement=TypeMouvementCaisse.VENTE, mode_paiement=p["mode_paiement"],
            montant=p["montant"], motif=f"Vente {vente.reference}", vente=vente, utilisateur=utilisateur,
        )
    return vente


@transaction.atomic
def annuler_vente(vente_id, utilisateur, motif, approbateur=None):
    """Annulation (jamais de suppression) : stock remis en place + remboursement en caisse."""
    if not motif or not motif.strip():
        raise ErreurMetier("Un motif d'annulation est obligatoire.")
    vente = Vente.objects.select_for_update().select_related("session", "depot").get(pk=vente_id)
    if vente.statut != StatutVente.VALIDEE:
        raise ErreurMetier("Cette vente est déjà annulée.")
    if vente.retours.exists():
        raise ErreurMetier("Cette vente a déjà fait l'objet d'un retour client : elle ne peut plus être annulée.")
    if vente.session.statut == StatutSession.OUVERTE:
        session_cible = SessionCaisse.objects.select_for_update().get(pk=vente.session_id)
    else:
        session_cible = SessionCaisse.objects.select_for_update().filter(
            caissier=utilisateur, statut=StatutSession.OUVERTE).first()
        if session_cible is None:
            raise ErreurMetier("La session d'origine est clôturée : ouvrez une session de caisse pour enregistrer le remboursement.")
    for ligne in vente.lignes.select_related("lot__medicament"):
        appliquer_mouvement(lot=ligne.lot, depot=vente.depot, quantite=ligne.quantite_unites, type_mouvement=TypeMouvement.RETOUR,
                            utilisateur=utilisateur, motif=f"Annulation de la vente {vente.reference}", reference=vente.reference)
        Medicament.objects.filter(pk=ligne.lot.medicament_id).update(
            frequence_vente=Greatest(F("frequence_vente") - ligne.quantite_unites, 0)
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
    vente.annulation_approuvee_par = approbateur
    vente.save(update_fields=["statut", "date_annulation", "annule_par", "motif_annulation", "annulation_approuvee_par"])
    nouvelle = {"statut": "ANNULEE", "motif": vente.motif_annulation}
    if approbateur:
        nouvelle["approuve_par"] = approbateur.nom_complet or approbateur.identifiant
    enregistrer_audit(utilisateur, "ANNULATION", "Vente", vente.pk, reference=vente.reference,
                      ancienne={"statut": "VALIDEE"}, nouvelle=nouvelle,
                      description=f"Approuvée par {nouvelle['approuve_par']}" if approbateur else "")
    return vente


def quantites_deja_retournees(vente):
    """{ligne_vente_id: quantité déjà rendue (dans le conditionnement vendu)} pour une vente."""
    lignes = LigneRetourVente.objects.filter(ligne_vente__vente=vente).values("ligne_vente_id").annotate(q=Sum("quantite"))
    return {l["ligne_vente_id"]: l["q"] for l in lignes}


def articles_retournables(vente):
    """Pour chaque ligne de la vente : quantité vendue, déjà rendue et encore rendable."""
    deja = quantites_deja_retournees(vente)
    resultat = []
    for ligne in vente.lignes.select_related("medicament", "lot"):
        rendu = deja.get(ligne.pk, 0)
        resultat.append({"ligne": ligne, "deja_retourne": rendu, "retournable": ligne.quantite - rendu})
    return resultat


@transaction.atomic
def retourner_articles(*, vente_id, utilisateur, lignes, motif, mode_paiement=None, approbateur=None):
    """
    Retour partiel : un ou plusieurs articles d'une vente validée sont rendus par le client.
      - revendable : le produit retourne en stock (même lot) ;
      - non revendable : il ne revient pas en stock (déjà sorti à la vente, il est perdu) ;
      - le remboursement est enregistré en caisse, dans la session ouverte de celui qui fait le retour.
    `lignes` : [{"ligne_vente": <LigneVente ou id>, "quantite": n, "etat": "REVENDABLE" | "NON_REVENDABLE"}].
    """
    if not motif or not motif.strip():
        raise ErreurMetier("Un motif de retour est obligatoire.")
    if not lignes:
        raise ErreurMetier("Choisissez au moins un article à retourner.")
    vente = (Vente.objects.select_for_update().select_related("depot", "session", "client").get(pk=vente_id))
    if vente.statut != StatutVente.VALIDEE:
        raise ErreurMetier("Cette vente est annulée : aucun retour n'est possible.")
    session = (SessionCaisse.objects.select_for_update()
               .filter(caissier=utilisateur, statut=StatutSession.OUVERTE).first())
    if session is None:
        raise ErreurMetier("Aucune session de caisse ouverte : ouvrez une session pour enregistrer le remboursement.")

    paiements = list(vente.paiements.select_related("mode_paiement"))
    if mode_paiement is None:
        mode_paiement = next((p.mode_paiement for p in paiements if p.mode_paiement.type == "ESPECES"),
                             paiements[0].mode_paiement if paiements else None)
    payes = {p.mode_paiement_id: Decimal("0") for p in paiements}
    for p in paiements:
        payes[p.mode_paiement_id] += p.montant
    if mode_paiement is None or mode_paiement.pk not in payes:
        raise ErreurMetier("Le remboursement doit se faire avec un mode de paiement utilisé pour cette vente.")

    par_ligne = {l.pk: l for l in vente.lignes.select_related("medicament", "lot__medicament")}
    deja = quantites_deja_retournees(vente)
    demandes, vues = [], set()
    for entree in lignes:
        ligne = entree["ligne_vente"]
        ligne = par_ligne.get(getattr(ligne, "pk", ligne))
        if ligne is None:
            raise ErreurMetier("Un des articles ne fait pas partie de cette vente.")
        if ligne.pk in vues:
            raise ErreurMetier(f"« {ligne.medicament.nom} » est indiqué deux fois : regroupez les quantités.")
        vues.add(ligne.pk)
        quantite = int(entree["quantite"])
        if quantite <= 0:
            raise ErreurMetier("La quantité retournée doit être supérieure à zéro.")
        if entree["etat"] not in EtatRetour.values:
            raise ErreurMetier("État du produit invalide (revendable ou non revendable).")
        possible = ligne.quantite - deja.get(ligne.pk, 0)
        if quantite > possible:
            raise ErreurMetier(
                f"« {ligne.medicament.nom} » : {quantite} à retourner, mais il n'en reste que {possible} "
                "à retourner sur cette vente.")
        if entree["etat"] == EtatRetour.REVENDABLE and ligne.lot.est_perime:
            raise ErreurMetier(
                f"« {ligne.medicament.nom} » (lot {ligne.lot.numero_lot}) est périmé : il ne peut pas "
                "revenir en stock. Indiquez « non revendable ».")
        demandes.append((ligne, quantite, entree["etat"]))

    montants = [(prix * quantite).quantize(DEUX_DECIMALES) for prix, quantite in
                ((ligne.prix_unitaire, quantite) for ligne, quantite, _ in demandes)]
    total = sum(montants, Decimal("0"))
    deja_rembourse = (RetourVente.objects.filter(vente=vente, mode_paiement=mode_paiement)
                      .aggregate(t=Sum("total"))["t"] or Decimal("0"))
    if deja_rembourse + total > payes[mode_paiement.pk]:
        raise ErreurMetier(
            f"Le remboursement ({total}) dépasse ce qui a été réglé en « {mode_paiement.nom} » sur cette vente "
            "et qui n'a pas encore été remboursé : choisissez un autre mode de remboursement.")

    retour = RetourVente.objects.create(
        reference=prochaine_reference("RET"), vente=vente, session=session, mode_paiement=mode_paiement,
        utilisateur=utilisateur, approuve_par=approbateur, motif=motif.strip()[:255], total=total,
    )
    for (ligne, quantite, etat), montant in zip(demandes, montants):
        unites = quantite * ligne.unites_par_conditionnement
        LigneRetourVente.objects.create(retour=retour, ligne_vente=ligne, quantite=quantite, unites=unites,
                                        etat=etat, montant=montant)
        if etat == EtatRetour.REVENDABLE:
            appliquer_mouvement(lot=ligne.lot, depot=vente.depot, quantite=unites, type_mouvement=TypeMouvement.RETOUR,
                                utilisateur=utilisateur, motif=f"Retour client {retour.reference} ({vente.reference})",
                                reference=retour.reference)
        Medicament.objects.filter(pk=ligne.medicament_id).update(
            frequence_vente=Greatest(F("frequence_vente") - unites, 0))
    MouvementCaisse.objects.create(
        session=session, type_mouvement=TypeMouvementCaisse.REMBOURSEMENT, mode_paiement=mode_paiement,
        montant=total, motif=f"Retour {retour.reference} — vente {vente.reference}", vente=vente, utilisateur=utilisateur,
    )
    nouvelle = {"vente": vente.reference, "total": str(total), "motif": retour.motif,
                "articles": [f"{l.medicament.nom} × {q} ({e})" for l, q, e in demandes]}
    if approbateur:
        nouvelle["approuve_par"] = approbateur.nom_complet or approbateur.identifiant
    enregistrer_audit(utilisateur, "RETOUR", "RetourVente", retour.pk, reference=retour.reference, nouvelle=nouvelle,
                      description=f"Approuvé par {nouvelle['approuve_par']}" if approbateur else "")
    return retour
