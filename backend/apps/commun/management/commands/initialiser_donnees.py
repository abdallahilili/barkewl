import getpass

from django.core.management.base import BaseCommand, CommandError

from apps.caisse.models import Caisse, ModePaiement, TypeModePaiement
from apps.commun.constantes import ADMIN
from apps.commun.parametres import DEFAUTS, obtenir_parametre
from apps.commun.models import Parametre
from apps.depots.models import Depot
from apps.utilisateurs.models import Utilisateur


class Command(BaseCommand):
    help = "Crée les données de base : administrateur, dépôt, caisse, modes de paiement, paramètres."

    def add_arguments(self, parser):
        parser.add_argument("--identifiant", default="admin")
        parser.add_argument("--mot-de-passe", dest="mot_de_passe", default=None)

    def handle(self, *args, **options):
        identifiant = options["identifiant"]
        if not Utilisateur.objects.filter(identifiant=identifiant).exists():
            mot_de_passe = options["mot_de_passe"] or getpass.getpass(f"Mot de passe pour « {identifiant} » (8 caractères min.) : ")
            if len(mot_de_passe) < 8:
                raise CommandError("Le mot de passe doit contenir au moins 8 caractères.")
            Utilisateur.objects.creer_utilisateur(identifiant, mot_de_passe, nom="Admin", prenom="Compte", role=ADMIN)
            self.stdout.write(self.style.SUCCESS(f"Administrateur « {identifiant} » créé."))
        depot, _ = Depot.objects.get_or_create(nom="Pharmacie", defaults={"description": "Dépôt de vente principal"})
        Depot.objects.get_or_create(nom="Magasin", defaults={"description": "Réserve / magasin de stockage"})
        Caisse.objects.get_or_create(nom="Caisse 1", defaults={"depot": depot})
        for nom, type_ in (("Espèces", TypeModePaiement.ESPECES), ("Bankily", TypeModePaiement.MOBILE),
                           ("Masrvi", TypeModePaiement.MOBILE), ("Sedad", TypeModePaiement.MOBILE)):
            ModePaiement.objects.get_or_create(nom=nom, defaults={"type": type_})
        for cle, (valeur, description) in DEFAUTS.items():
            Parametre.objects.get_or_create(cle=cle, defaults={"valeur": valeur, "description": description})
        self.stdout.write(self.style.SUCCESS("Données de base prêtes."))
