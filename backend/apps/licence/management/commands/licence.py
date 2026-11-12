from django.core.management.base import BaseCommand, CommandError

from apps.commun.exceptions import ErreurMetier
from apps.licence import services


class Command(BaseCommand):
    help = "Affiche le code du PC et l'état de la licence ; avec --activer <clé>, installe une licence."

    def add_arguments(self, parser):
        parser.add_argument("--activer", metavar="CLE", help="Clé de licence reçue de Rawafid Digital Services")

    def handle(self, *args, **options):
        if options["activer"]:
            try:
                services.activer_licence(options["activer"], utilisateur=None)
            except ErreurMetier as erreur:
                raise CommandError(str(erreur.detail)) from erreur
            self.stdout.write(self.style.SUCCESS("Licence activée."))
        etat = services.etat_licence(forcer=True)
        self.stdout.write(f"Code du PC   : {etat['empreinte']}")
        self.stdout.write(f"Statut       : {etat['statut']}")
        if etat["fin"]:
            self.stdout.write(f"Pharmacie    : {etat['client']}")
            self.stdout.write(f"Abonnement   : {etat['plan']} jusqu'au {etat['fin']:%d/%m/%Y}")
        if etat["message"]:
            self.stdout.write(self.style.WARNING(etat["message"]))
