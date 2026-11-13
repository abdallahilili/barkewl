"""
Outils appelés par l'installateur RAQEEM PHARMA (Python + PyMySQL du paquet).

Les mots de passe passent par des variables d'environnement, jamais par la ligne de commande.
    python outils_installation.py cle                    une clé secrète Django aléatoire
    python outils_installation.py mot_de_passe           un mot de passe aléatoire (compte MySQL dédié)
    python outils_installation.py root                   MySQL inclus : fixe le mot de passe root (vide après
        RAQEEM_MYSQL_PORT, RAQEEM_MYSQL_ROOT_MDP           l'initialisation) ; sans effet s'il est déjà en place
    python outils_installation.py base                   crée la base et le compte MySQL dédié
        RAQEEM_MYSQL_HOTE, RAQEEM_MYSQL_PORT, RAQEEM_MYSQL_ADMIN, RAQEEM_MYSQL_ADMIN_MDP,
        RAQEEM_BD_NOM, RAQEEM_BD_UTILISATEUR, RAQEEM_BD_MDP
"""
import os
import secrets
import string
import sys


def cle():
    print(secrets.token_urlsafe(50))


def mot_de_passe():
    alphabet = string.ascii_letters + string.digits
    print("".join(secrets.choice(alphabet) for _ in range(24)))


# Versions minimales exigées par Django 5.2 (le serveur refuse de démarrer en dessous).
MINIMUM_MYSQL = (8, 0, 11)
MINIMUM_MARIADB = (10, 5)


def verifier_version(version):
    """« 8.0.27 », « 8.4.7 », « 11.4.5-MariaDB-log »… -> arrêt avec un message clair si trop ancienne."""
    import re

    chiffres = tuple(int(n) for n in re.findall(r"\d+", version.split("-")[0])[:3])
    if "mariadb" in version.lower():
        produit, minimum = "MariaDB", MINIMUM_MARIADB
    else:
        produit, minimum = "MySQL", MINIMUM_MYSQL
    if chiffres < minimum:
        attendu = ".".join(map(str, minimum))
        sys.exit(f"{produit} {version} est trop ancien : RAQEEM PHARMA exige {produit} {attendu} ou plus récent. "
                 f"Mettez WampServer / {produit} à jour, puis relancez l'installation.")


def verifier_format_lignes(curseur, version):
    """
    Index en utf8mb4 (arabe) : le format de ligne InnoDB doit être DYNAMIC (index jusqu'à 3072 octets).
    Certains MySQL (WampServer) sont réglés en COMPACT (767 octets) : la création des tables échoue
    (« Index column size too large »). On règle le serveur en DYNAMIC, le format par défaut des MySQL récents.
    """
    curseur.execute("SELECT @@innodb_default_row_format")
    actuel = (curseur.fetchone()[0] or "").lower()
    if actuel == "dynamic":
        return
    print(f"Format des tables du serveur : {actuel.upper()} -> DYNAMIC")
    try:
        # MySQL 8 : réglage conservé après redémarrage du serveur.
        curseur.execute("SET PERSIST innodb_default_row_format = 'DYNAMIC'")
    except Exception:
        # MariaDB / anciens MySQL : valable jusqu'au prochain redémarrage de MySQL.
        curseur.execute("SET GLOBAL innodb_default_row_format = 'DYNAMIC'")
        print("  Conseil : ajoutez « innodb_default_row_format=dynamic » dans le fichier my.ini de MySQL.")


def root():
    import pymysql

    port, mdp = int(os.environ.get("RAQEEM_MYSQL_PORT", "3306")), os.environ["RAQEEM_MYSQL_ROOT_MDP"]
    try:
        # Reprise d'une installation interrompue : le mot de passe est peut-être déjà en place.
        pymysql.connect(host="127.0.0.1", port=port, user="root", password=mdp).close()
        print("Mot de passe root déjà en place.")
        return
    except pymysql.MySQLError:
        pass
    try:
        connexion = pymysql.connect(host="127.0.0.1", port=port, user="root", password="", autocommit=True)
    except pymysql.MySQLError as erreur:
        sys.exit(f"Connexion au MySQL inclus impossible : {erreur.args[-1] if erreur.args else erreur}")
    with connexion.cursor() as c:
        c.execute("ALTER USER 'root'@'localhost' IDENTIFIED BY %s", (mdp,))
    print("Mot de passe root du MySQL inclus enregistré.")


def base():
    import pymysql

    e = os.environ
    nom, utilisateur, mdp = e["RAQEEM_BD_NOM"], e["RAQEEM_BD_UTILISATEUR"], e["RAQEEM_BD_MDP"]
    for valeur in (nom, utilisateur):
        if not valeur.replace("_", "").isalnum():
            sys.exit("Nom de base ou d'utilisateur invalide.")
    try:
        connexion = pymysql.connect(host=e.get("RAQEEM_MYSQL_HOTE", "127.0.0.1"), port=int(e.get("RAQEEM_MYSQL_PORT", "3306")),
                                    user=e.get("RAQEEM_MYSQL_ADMIN", "root"), password=e.get("RAQEEM_MYSQL_ADMIN_MDP", ""),
                                    charset="utf8mb4", autocommit=True)
    except pymysql.MySQLError as erreur:
        sys.exit(f"Connexion à MySQL impossible : {erreur.args[-1] if erreur.args else erreur}")
    with connexion.cursor() as c:
        c.execute("SELECT VERSION()")
        version = c.fetchone()[0]
        print("Serveur :", version)
        verifier_version(version)
        verifier_format_lignes(c, version)

        # Reprise d'une installation interrompue : une base sans aucun utilisateur n'a jamais servi,
        # on peut la recréer. Une base qui contient des données n'est JAMAIS supprimée.
        c.execute("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = %s", (nom,))
        if c.fetchone()[0]:
            c.execute("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'utilisateurs'", (nom,))
            utilisee = False
            if c.fetchone()[0]:
                c.execute(f"SELECT COUNT(*) FROM `{nom}`.`utilisateurs`")
                utilisee = c.fetchone()[0] > 0
            if utilisee:
                sys.exit(f"La base « {nom} » existe déjà et contient des données : elle n'est pas modifiée. "
                         "Utilisez « Mettre_a_jour.bat », ou choisissez un autre nom de base.")
            c.execute(f"DROP DATABASE `{nom}`")
            print(f"Base « {nom} » d'une installation interrompue (vide) : recréée.")
        c.execute(f"CREATE DATABASE IF NOT EXISTS `{nom}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        for hote in ("localhost", "127.0.0.1"):
            c.execute("CREATE USER IF NOT EXISTS %s@%s IDENTIFIED BY %s", (utilisateur, hote, mdp))
            c.execute("ALTER USER %s@%s IDENTIFIED BY %s", (utilisateur, hote, mdp))
            c.execute(f"GRANT ALL PRIVILEGES ON `{nom}`.* TO %s@%s", (utilisateur, hote))
        c.execute("FLUSH PRIVILEGES")
    connexion.close()
    print(f"Base « {nom} » et compte « {utilisateur} » prêts.")


if __name__ == "__main__":
    {"cle": cle, "root": root, "mot_de_passe": mot_de_passe, "base": base}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
