"""Configuration Django de l'application de gestion de pharmacie."""
import os
import sys
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env(cle, defaut=None):
    return os.environ.get(cle, defaut)


# Sûr par défaut : sans configuration, le mode production s'applique (aucun détail technique affiché en cas
# d'erreur). Le PC de développement active le mode debug explicitement (DEBUG=1 dans son .env).
DEBUG = env("DEBUG", "0") == "1"
SECRET_KEY = env("CLE_SECRETE", "cle-de-developpement-a-changer")
if not DEBUG and SECRET_KEY == "cle-de-developpement-a-changer":
    raise ImproperlyConfigured(
        "CLE_SECRETE doit être définie en production (fichier .env). En développement, mettez DEBUG=1 dans le .env."
    )

# Noms sous lesquels le serveur répond : le PC lui-même par défaut. L'installation ajoute le nom du PC
# (et ses adresses en mode plusieurs postes).
ALLOWED_HOSTS = [h.strip() for h in env("HOTES_AUTORISES", "localhost,127.0.0.1").split(",") if h.strip()]
if env("HOTES_RESEAU_LOCAL", "0") == "1":
    # Plusieurs postes : les caisses joignent ce PC par son nom ou par son adresse IP. L'adresse (DHCP) peut
    # changer ; elle est relue à chaque démarrage du serveur, au lieu d'accepter n'importe quel nom (« * »).
    import socket

    try:
        _nom, _alias, _adresses = socket.gethostbyname_ex(socket.gethostname())
        ALLOWED_HOSTS += [_nom, socket.gethostname(), *_alias, *_adresses]
    except OSError:
        ALLOWED_HOSTS.append(socket.gethostname())

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "corsheaders",
    "apps.commun",
    "apps.utilisateurs",
    "apps.depots",
    "apps.medicaments",
    "apps.stock",
    "apps.fournisseurs",
    "apps.achats",
    "apps.ventes",
    "apps.caisse",
    "apps.facturation",
    "apps.rapports",
    "apps.licence",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    # Langue de l'interface (en-tête Accept-Language envoyé par le frontend) : les messages natifs de Django et de
    # Django REST Framework (champ obligatoire, valeur invalide…) sortent en arabe ; les messages métier restent en
    # français et sont traduits par le frontend.
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "apps.licence.middleware.LicenceMiddleware",
]

# Licence Rawafid Digital Services : toujours exigée, sauf pendant les tests automatiques
# (les tests de licence l'activent eux-mêmes). Volontairement non réglable par le fichier .env.
LICENCE_OBLIGATOIRE = not (len(sys.argv) > 1 and sys.argv[1] == "test")

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
AUTH_USER_MODEL = "utilisateurs.Utilisateur"

if env("UTILISER_SQLITE", "0") == "1":
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
else:
    # mysqlclient (pilote C) est privilégié. S'il ne peut pas être chargé — par exemple quand
    # Windows (Smart App Control) bloque sa DLL — on bascule sur PyMySQL (pur Python).
    try:
        import MySQLdb  # noqa: F401
    except ImportError:
        import pymysql

        pymysql.version_info = (2, 2, 1, "final", 0)  # Django exige mysqlclient >= 2.2.1
        pymysql.install_as_MySQLdb()

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": env("BD_NOM", "pharmacie"),
            "USER": env("BD_UTILISATEUR", "root"),
            "PASSWORD": env("BD_MOT_DE_PASSE", ""),
            "HOST": env("BD_HOTE", "127.0.0.1"),
            "PORT": env("BD_PORT", "3306"),
            "OPTIONS": {
                "charset": "utf8mb4",
                # InnoDB obligatoire : transactions (« tout ou rien ») et verrous de ligne. Certains MySQL
                # (WampServer notamment) créent par défaut des tables MyISAM, qui ignorent les deux sans prévenir.
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES', default_storage_engine=INNODB",
            },
        }
    }

# Mots de passe des comptes : 8 caractères minimum, ni trop courants, ni uniquement des chiffres, ni proches
# de l'identifiant ou du nom.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
     "OPTIONS": {"user_attributes": ("identifiant", "nom", "prenom", "email")}},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "fr"
LANGUAGES = [("fr", "Français"), ("ar", "العربية")]
# Nouakchott est en UTC+0 toute l'année : on reste en UTC, ce qui évite d'avoir
# à charger les tables de fuseaux horaires de MySQL.
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["apps.commun.permissions.PermissionParRole"],
    "DEFAULT_PAGINATION_CLASS": "apps.commun.pagination.PaginationStandard",
    "DEFAULT_FILTER_BACKENDS": [
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "SEARCH_PARAM": "recherche",
    "ORDERING_PARAM": "tri",
    "COERCE_DECIMAL_TO_STRING": False,
    "DEFAULT_THROTTLE_RATES": {"connexion": "20/min"},
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=20),
    "REFRESH_TOKEN_LIFETIME": timedelta(hours=12),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "UPDATE_LAST_LOGIN": False,
}

DOSSIER_JOURNAUX = BASE_DIR / "logs"
DOSSIER_JOURNAUX.mkdir(exist_ok=True)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "%(asctime)s %(levelname)s %(name)s : %(message)s"}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "simple"},
        "fichier": {
            "class": "logging.handlers.RotatingFileHandler", "filename": DOSSIER_JOURNAUX / "raqeem.log",
            "maxBytes": 2 * 1024 * 1024, "backupCount": 5, "encoding": "utf-8", "formatter": "simple",
        },
    },
    "loggers": {"raqeem": {"handlers": ["console", "fichier"], "level": "INFO"}},
}

CORS_ALLOWED_ORIGINS =[o.strip() for o in env("ORIGINES_CORS", "http://localhost:5173").split(",") if o.strip()]

if not DEBUG:
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
