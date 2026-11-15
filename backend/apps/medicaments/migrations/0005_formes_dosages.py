"""Référentiels des formes et des dosages ; ils sont préremplis avec les valeurs déjà saisies dans les fiches médicament."""
import unicodedata
from collections import Counter

from django.db import migrations, models


def _cle(texte):
    """Clé de comparaison sans accents ni majuscules : « Comprimé » et « comprime » sont la même forme
    (la base compare déjà ainsi : un doublon provoquerait une erreur d'unicité)."""
    decompose = unicodedata.normalize("NFKD", texte)
    return "".join(c for c in decompose if not unicodedata.combining(c)).casefold()


def remplir_referentiels(apps, schema_editor):
    Medicament = apps.get_model("medicaments", "Medicament")
    for champ, nom_modele in (("forme", "Forme"), ("dosage", "Dosage")):
        Modele = apps.get_model("medicaments", nom_modele)
        compte = Counter(
            valeur.strip() for valeur in Medicament.objects.values_list(champ, flat=True) if valeur and valeur.strip()
        )
        groupes = {}
        for valeur, n in compte.items():
            groupes.setdefault(_cle(valeur), []).append((valeur, n))
        for variantes in groupes.values():
            # On garde la graphie la plus utilisée (à égalité, la plus longue : celle qui porte les accents).
            retenue = max(variantes, key=lambda v: (v[1], len(v[0])))[0]
            Modele.objects.get_or_create(nom=retenue)


class Migration(migrations.Migration):

    dependencies = [
        ("medicaments", "0004_conditionnement"),
    ]

    operations = [
        migrations.CreateModel(
            name="Forme",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nom", models.CharField(max_length=60, unique=True)),
                ("actif", models.BooleanField(default=True)),
            ],
            options={"db_table": "formes", "ordering": ["nom"]},
        ),
        migrations.CreateModel(
            name="Dosage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nom", models.CharField(max_length=60, unique=True)),
                ("actif", models.BooleanField(default=True)),
            ],
            options={"db_table": "dosages", "ordering": ["nom"]},
        ),
        migrations.RunPython(remplir_referentiels, migrations.RunPython.noop),
    ]
