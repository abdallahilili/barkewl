from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.achats.models import Achat, LigneAchat
from apps.achats.services import valider_achat
from apps.caisse.models import ModePaiement
from apps.commun.constantes import ADMIN, CAISSIER, MAGASINIER
from apps.commun.references import prochaine_reference
from apps.depots.models import Depot
from apps.fournisseurs.models import Fournisseur
from apps.medicaments.models import Categorie, Medicament
from apps.utilisateurs.models import Utilisateur

MEDICAMENTS = [
    ("Paracétamol", "Paracétamol", "500 mg", "Comprimé", "Antalgiques", "60", "100", 30),
    ("Amoxicilline", "Amoxicilline", "500 mg", "Gélule", "Antibiotiques", "120", "200", 20),
    ("Ibuprofène", "Ibuprofène", "400 mg", "Comprimé", "Anti-inflammatoires", "80", "140", 20),
    ("Oméprazole", "Oméprazole", "20 mg", "Gélule", "Digestif", "150", "250", 15),
    ("Metformine", "Metformine", "850 mg", "Comprimé", "Diabète", "90", "160", 15),
    ("Sérum physiologique", "Chlorure de sodium", "0,9 %", "Ampoule", "Soins", "20", "40", 50),
    ("Vitamine C", "Acide ascorbique", "500 mg", "Comprimé", "Vitamines", "70", "120", 25),
    ("Salbutamol", "Salbutamol", "100 µg", "Spray", "Respiratoire", "180", "300", 10),
]


class Command(BaseCommand):
    help = "Charge des données de démonstration (utilisateurs, médicaments, un achat validé). À ne pas utiliser en production."

    def handle(self, *args, **options):
        admin = Utilisateur.objects.filter(role=ADMIN).first()
        if admin is None:
            self.stderr.write("Lancez d'abord : python manage.py initialiser_donnees")
            return
        for identifiant, nom, prenom, role in (("caissier", "Caissier", "Demo", CAISSIER), ("magasinier", "Magasinier", "Demo", MAGASINIER)):
            if not Utilisateur.objects.filter(identifiant=identifiant).exists():
                Utilisateur.objects.creer_utilisateur(identifiant, "demo12345", nom=nom, prenom=prenom, role=role)
        depot = Depot.objects.get(nom="Pharmacie")
        fournisseur, _ = Fournisseur.objects.get_or_create(nom="Grossiste Nouakchott", defaults={"telephone": "22 00 00 00"})
        if Achat.objects.exists():
            self.stdout.write("Données de démonstration déjà présentes.")
            return
        achat = Achat.objects.create(reference=prochaine_reference("ACH"), fournisseur=fournisseur, depot=depot,
                                     utilisateur=admin, reference_facture="FAC-DEMO-001")
        aujourdhui = timezone.localdate()
        for i, (nom, generique, dosage, forme, categorie, prix_achat, prix_vente, minimum) in enumerate(MEDICAMENTS, 1):
            cat, _ = Categorie.objects.get_or_create(nom=categorie)
            med, _ = Medicament.objects.get_or_create(
                nom=nom, dosage=dosage,
                defaults={"nom_generique": generique, "forme": forme, "categorie": cat, "prix_achat": Decimal(prix_achat),
                          "prix_vente": Decimal(prix_vente), "stock_minimum": minimum, "code_barre": f"6100000{i:05d}"},
            )
            LigneAchat.objects.create(achat=achat, medicament=med, numero_lot=f"L{i}A", date_peremption=aujourdhui + timedelta(days=45 + i * 20),
                                      quantite=60, prix_achat=Decimal(prix_achat))
            LigneAchat.objects.create(achat=achat, medicament=med, numero_lot=f"L{i}B", date_peremption=aujourdhui + timedelta(days=400 + i * 15),
                                      quantite=120, prix_achat=Decimal(prix_achat))
        achat.recalculer_total()
        valider_achat(achat.pk, admin, Decimal(achat.total) / 2, ModePaiement.objects.filter(type="ESPECES").first())
        self.stdout.write(self.style.SUCCESS("Démo chargée. Comptes : caissier / magasinier (mot de passe : demo12345)."))
