"""Configuration Django de l'application de gestion de pharmacie."""
import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env(cle, defaut=None):
    return os.environ.get(cle, defaut)


DEBUG = env("DEBUG", "1") == "1"
SECRET_KEY = env("CLE_SECRETE", "cle-de-developpement-a-changer")
if not DEBUG and SECRET_KEY == "cle-de-developpement-a-changer":
    raise ImproperlyConfigured("CLE_SECRETE doit être définie en production.")

ALLOWED_HOSTS = ['*']

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
    "apps.rapports",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
AUTH_USER_MODEL = "utilisateurs.Utilisateur"

if env("UTILISER_SQLITE", "0") == "1":
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
else:
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
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "fr"
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

CORS_ALLOWED_ORIGINS = [o.strip() for o in env("ORIGINES_CORS", "http://localhost:5173").split(",") if o.strip()]

if not DEBUG:
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
