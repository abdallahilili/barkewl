"""
Conditionnements de vente : boîte, plaquette, unité (comprimé, gélule…).

Règles :
- Le STOCK est toujours compté en unités (la plus petite). Pour un médicament à 1 unité par boîte
  (valeur par défaut), unité = boîte : rien ne change par rapport au fonctionnement d'origine.
- Les prix du médicament et des lots (prix_achat, prix_vente) sont des prix à la BOÎTE.
- Prix à la plaquette / à l'unité : celui saisi sur la fiche, sinon proportionnel au prix de la boîte.
"""
from decimal import ROUND_HALF_UP, Decimal

from apps.commun.exceptions import ErreurMetier

BOITE = "BOITE"
PLAQUETTE = "PLAQUETTE"
UNITE = "UNITE"
CONDITIONNEMENTS = [(BOITE, "Boîte"), (PLAQUETTE, "Plaquette"), (UNITE, "Unité")]

DEUX_DECIMALES = Decimal("0.01")


def plaquette_disponible(medicament):
    n, p = medicament.unites_par_boite, medicament.unites_par_plaquette
    return bool(p) and 1 < n and p < n and n % p == 0


def detail_disponible(medicament):
    return medicament.unites_par_boite > 1


def conditionnements_disponibles(medicament):
    resultat = [BOITE]
    if plaquette_disponible(medicament):
        resultat.append(PLAQUETTE)
    if detail_disponible(medicament):
        resultat.append(UNITE)
    return resultat


def multiplicateur(medicament, conditionnement):
    """Nombre d'unités de stock contenues dans un conditionnement."""
    if conditionnement == BOITE:
        return medicament.unites_par_boite
    if conditionnement == PLAQUETTE:
        if not plaquette_disponible(medicament):
            raise ErreurMetier(f"« {medicament.nom} » ne se vend pas à la plaquette.")
        return medicament.unites_par_plaquette
    if conditionnement == UNITE:
        if not detail_disponible(medicament):
            raise ErreurMetier(f"« {medicament.nom} » ne se vend qu'à la boîte.")
        return 1
    raise ErreurMetier(f"Conditionnement inconnu : {conditionnement}.")


def prix_conditionnement(medicament, conditionnement, prix_boite):
    """Prix de vente d'un conditionnement ; prix_boite = prix effectif de la boîte (celui du lot ou du médicament)."""
    if conditionnement == BOITE:
        return prix_boite
    explicite = medicament.prix_vente_plaquette if conditionnement == PLAQUETTE else medicament.prix_vente_unite
    if explicite is not None and explicite > 0:
        return explicite
    if prix_boite is None:
        return None
    m = multiplicateur(medicament, conditionnement)
    return (Decimal(prix_boite) * m / medicament.unites_par_boite).quantize(DEUX_DECIMALES, rounding=ROUND_HALF_UP)


def libelle(medicament, conditionnement, quantite=1):
    """Libellé lisible : « boîte », « plaquettes », « comprimés »…"""
    pluriel = quantite > 1
    if conditionnement == BOITE:
        nom = (medicament.unite or "boîte").strip()
    elif conditionnement == PLAQUETTE:
        nom = "plaquette"
    else:
        nom = (medicament.nom_unite_detail or "unité").strip()
    if pluriel and not nom.endswith(("s", "x")):
        nom += "s"
    return nom


def decrire_quantite(medicament, unites):
    """Quantité en unités → texte « 3 boîtes + 12 comprimés »."""
    n = medicament.unites_par_boite
    if n <= 1:
        return str(unites)
    boites, reste = divmod(abs(unites), n)
    morceaux = []
    if boites:
        morceaux.append(f"{boites} {libelle(medicament, BOITE, boites)}")
    if reste or not boites:
        morceaux.append(f"{reste} {libelle(medicament, UNITE, reste)}")
    texte = " + ".join(morceaux)
    return f"-{texte}" if unites < 0 else texte


def valider_conditionnement(n, p):
    """Contrôle la cohérence du conditionnement saisi sur la fiche du médicament."""
    if n is None or n < 1:
        raise ErreurMetier("Le nombre d'unités par boîte doit être au moins 1.")
    if p:
        if n <= 1:
            raise ErreurMetier("Indiquez d'abord le nombre d'unités par boîte pour vendre à la plaquette.")
        if p >= n or n % p != 0:
            raise ErreurMetier(f"Une boîte de {n} unités doit contenir un nombre entier de plaquettes de {p} unités.")
