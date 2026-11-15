"""
Convertit en InnoDB toutes les tables MySQL créées en MyISAM.

MyISAM ne gère ni les transactions ni les verrous de ligne : une vente ou un transfert interrompu pouvait
laisser des données à moitié modifiées, et deux caisses pouvaient vendre la même dernière boîte.
Sans effet sur SQLite, ni sur une base déjà en InnoDB.
"""
from django.db import migrations


def convertir_en_innodb(apps, schema_editor):
    connexion = schema_editor.connection
    if connexion.vendor != "mysql":
        return
    with connexion.cursor() as curseur:
        curseur.execute(
            "SELECT TABLE_NAME FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND ENGINE <> 'InnoDB'"
        )
        for (table,) in curseur.fetchall():
            curseur.execute(f"ALTER TABLE `{table}` ENGINE=InnoDB")


class Migration(migrations.Migration):
    # Le DDL MySQL valide implicitement : pas de transaction englobante.
    atomic = False

    dependencies = [("commun", "0001_initial")]

    operations = [migrations.RunPython(convertir_en_innodb, migrations.RunPython.noop)]
