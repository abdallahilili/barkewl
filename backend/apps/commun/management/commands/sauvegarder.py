from django.core.management.base import BaseCommand, CommandError

from apps.commun.exceptions import ErreurMetier
from apps.commun.sauvegarde import creer_sauvegarde, etat_sauvegardes


class Command(BaseCommand):
    help = "Crée une sauvegarde complète de la base de données (dossier défini par DOSSIER_SAUVEGARDES)."

    def add_arguments(self, parser):
        parser.add_argument("--auto", action="store_true", help="Marque la sauvegarde comme automatique (tâche planifiée).")

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
