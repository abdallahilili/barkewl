"""
Sert l'interface (application React déjà construite) directement depuis le serveur Django/Waitress.

En installation chez un client, un seul service suffit (plus besoin d'Apache) : toute adresse qui n'est pas
une adresse /api/ renvoie le fichier demandé du dossier de l'interface, ou index.html (navigation de l'application).
"""
import mimetypes
import os
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")


def dossier_interface():
    valeur = os.environ.get("DOSSIER_INTERFACE", "").strip()
    dossier = Path(valeur) if valeur else Path(settings.BASE_DIR).parent / "frontend" / "dist"
    return dossier if (dossier / "index.html").is_file() else None


def servir_interface(request, chemin=""):
    racine = dossier_interface()
    if racine is None or chemin.startswith("api/"):
        raise Http404
    racine = racine.resolve()
    demande = (racine / chemin).resolve()
    if demande.is_file() and racine in demande.parents:
        reponse = FileResponse(open(demande, "rb"))
        # Les fichiers de assets/ ont une empreinte dans leur nom : ils peuvent rester en cache longtemps.
        reponse["Cache-Control"] = "public, max-age=31536000, immutable" if "assets" in demande.parts else "no-cache"
        return reponse
    reponse = FileResponse(open(racine / "index.html", "rb"), content_type="text/html; charset=utf-8")
    reponse["Cache-Control"] = "no-cache"
    return reponse
