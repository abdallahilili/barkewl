import getpass
import os

from django.core.management.base import BaseCommand, CommandError

from apps.caisse.models import Caisse, ModePaiement, TypeModePaiement
from apps.commun.constantes import ADMIN
from apps.commun.parametres import DEFAUTS, obtenir_parametre
from apps.commun.models import Parametre
from apps.depots.models import Depot
from apps.utilisateurs.models import Utilisateur
from apps.utilisateurs.serializers import verifier_robustesse


class Command(BaseCommand):
    help = "Crée les données de base : administrateur, dépôt, caisse, modes de paiement, paramètres."

    def add_arguments(self, parser):
        parser.add_argument("--identifiant", default="admin")
        # Pas d'option « --mot-de-passe » : sur la ligne de commande, il serait visible par les autres
        # programmes du PC. Il est demandé au clavier ou transmis par la variable RAQEEM_ADMIN_MDP.

    def handle(self, *args, **options):
        identifiant = options["identifiant"]
        if not Utilisateur.objects.filter(identifiant=identifiant).exists():
            mot_de_passe = os.environ.pop("RAQEEM_ADMIN_MDP", "") or getpass.getpass(
                f"Mot de passe pour « {identifiant} » (8 caractères min.) : ")
            problemes = verifier_robustesse(mot_de_passe, Utilisateur(identifiant=identifiant, nom="Admin", prenom="Compte"))
            if problemes:
                # Code 3 : l'installateur redemande un autre mot de passe.
                raise CommandError("Mot de passe refusé : " + " ".join(problemes), returncode=3)
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
