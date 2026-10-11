from datetime import date, timedelta

from django.utils import timezone

from .exceptions import ErreurMetier


def lire_date(valeur, defaut=None):
    if not valeur:
        return defaut
    try:
        return date.fromisoformat(valeur)
    except ValueError:
        raise ErreurMetier(f"Date invalide : « {valeur} » (format attendu AAAA-MM-JJ).")


def plage_dates(parametres, jours_par_defaut=30):
    """Retourne (date_debut, date_fin) à partir des paramètres ?date_debut=&date_fin=."""
    fin = lire_date(parametres.get("date_fin"), timezone.localdate())
    debut = lire_date(parametres.get("date_debut"), fin - timedelta(days=jours_par_defaut))
    if debut > fin:
        raise ErreurMetier("La date de début doit précéder la date de fin.")
    return debut, fin
