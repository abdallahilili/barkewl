from django.core.management.base import BaseCommand, CommandError

from apps.commun.exceptions import ErreurMetier
from apps.commun.sauvegarde import copier_vers_usb, creer_sauvegarde, etat_sauvegardes


class Command(BaseCommand):
    help = "Crée une sauvegarde complète de la base de données (dossier défini par DOSSIER_SAUVEGARDES)."

    def add_arguments(self, parser):
        parser.add_argument("--auto", action="store_true", help="Marque la sauvegarde comme automatique (tâche planifiée).")
        parser.add_argument("--usb", action="store_true", help="Copie ensuite la sauvegarde sur les clés USB / disques préparés.")

    def handle(self, *args, **options):
        try:
            infos = creer_sauvegarde(origine="auto" if options["auto"] else "manuelle")
        except ErreurMetier as erreur:
            raise CommandError(str(erreur.detail)) from erreur
        etat = etat_sauvegardes()
        self.stdout.write(self.style.SUCCESS(
            f"Sauvegarde créée : {infos['nom']} ({infos['taille'] / 1024:.0f} Ko, {infos['duree_secondes']} s)"
        ))
        self.stdout.write(f"Dossier : {etat['dossier']}")
        if etat["dossier_copie"]:
            if infos["copie_erreur"]:
                self.stdout.write(self.style.WARNING(infos["copie_erreur"]))
            else:
                self.stdout.write(f"Copie : {etat['dossier_copie']}")
        if options["usb"]:
            self._copier_usb()

    def _copier_usb(self):
        try:
            resultats = copier_vers_usb(forcer=True)
        except ErreurMetier as erreur:
            self.stdout.write(self.style.WARNING(f"Clé USB : {erreur.detail}"))
            return
        if not resultats:
            self.stdout.write(self.style.WARNING("Clé USB : aucun disque préparé n'est branché."))
        for r in resultats:
            if r["ok"]:
                self.stdout.write(f"Clé USB {r['racine']} ({r['nom_volume'] or '-'}) : copie faite")
            else:
                self.stdout.write(self.style.WARNING(f"Clé USB : {r['erreur']}"))
