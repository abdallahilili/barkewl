from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.commun.exceptions import ErreurMetier
from apps.commun.sauvegarde import dossier_sauvegardes, lister_sauvegardes, restaurer_sauvegarde


class Command(BaseCommand):
    help = (
        "Restaure une sauvegarde : REMPLACE toute la base de données actuelle. "
        "Sans argument, affiche la liste des sauvegardes disponibles."
    )

    def add_arguments(self, parser):
        parser.add_argument("fichier", nargs="?", help="Nom d'une sauvegarde du dossier, ou chemin complet d'un fichier (ex. sur clé USB).")
        parser.add_argument("--oui", action="store_true", help="Ne pas demander de confirmation.")

    def handle(self, *args, **options):
        if not options["fichier"]:
            sauvegardes = lister_sauvegardes()
            if not sauvegardes:
                self.stdout.write("Aucune sauvegarde dans " + str(dossier_sauvegardes()))
                return
            self.stdout.write(f"Sauvegardes disponibles ({dossier_sauvegardes()}) :")
            for s in sauvegardes:
                self.stdout.write(f"  {s['nom']}   {s['taille'] / 1024:>8.0f} Ko   {s['date'][:19].replace('T', ' ')}")
            self.stdout.write("\nPour restaurer : python manage.py restaurer_sauvegarde <nom_du_fichier>")
            return

        chemin = Path(options["fichier"])
        if not chemin.is_file():
            chemin = dossier_sauvegardes() / options["fichier"]
        if not chemin.is_file():
            raise CommandError(f"Fichier introuvable : {options['fichier']}")

        if not options["oui"]:
            self.stdout.write(self.style.WARNING(
                f"ATTENTION : toutes les données actuelles vont être remplacées par celles de\n  {chemin}\n"
                "Une sauvegarde de sécurité de l'état actuel sera faite juste avant."
            ))
            if input("Tapez RESTAURER pour confirmer : ").strip() != "RESTAURER":
                self.stdout.write("Restauration annulée.")
                return
        try:
            securite = restaurer_sauvegarde(chemin)
        except ErreurMetier as erreur:
            raise CommandError(str(erreur.detail)) from erreur
        self.stdout.write(self.style.SUCCESS(f"Restauration terminée depuis {chemin.name}."))
        self.stdout.write(f"État précédent conservé dans : {securite['nom']}")
        self.stdout.write("Redémarrez le serveur (BarkewlBackend) pour repartir proprement.")
