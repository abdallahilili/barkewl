import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_wsgi_application()

# Sauvegarde automatique de la base tant que le serveur tourne (Waitress ou runserver).
# Réglage : SAUVEGARDE_INTERVALLE_HEURES dans .env (0 = désactivée).
from apps.commun.sauvegarde import demarrer_sauvegarde_automatique  # noqa: E402

demarrer_sauvegarde_automatique()
