from django.apps import AppConfig
from django.core import checks


def verifier_moteur_mysql(app_configs=None, **kwargs):
    """Alerte au démarrage si une table MySQL n'est pas en InnoDB (pas de transactions ni de verrous)."""
    from django.db import connection

    if connection.vendor != "mysql":
        return []
    try:
        with connection.cursor() as curseur:
            curseur.execute(
                "SELECT TABLE_NAME FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND ENGINE <> 'InnoDB'"
            )
            tables = [ligne[0] for ligne in curseur.fetchall()]
    except Exception:   # base indisponible au démarrage : rien à signaler ici
        return []
    if not tables:
        return []
    # Avertissement (et non erreur) : une erreur bloquerait « migrate », justement la commande qui corrige.
    return [checks.Warning(
        f"{len(tables)} table(s) MySQL ne sont pas en InnoDB ({', '.join(tables[:5])}…) : "
        "les opérations « tout ou rien » et les verrous ne fonctionnent pas.",
        hint="Lancez « python manage.py migrate » (la migration commun.0002 les convertit).",
        id="raqeem.W001",
    )]


class CommunConfig(AppConfig):
    name = "apps.commun"
    verbose_name = "Commun"

    def ready(self):
        checks.register(verifier_moteur_mysql, checks.Tags.database)
