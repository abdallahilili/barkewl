"""
Outils appelés par l'installateur RAQEEM PHARMA (Python + PyMySQL du paquet).

Les mots de passe passent par des variables d'environnement, jamais par la ligne de commande.
    python outils_installation.py cle                    une clé secrète Django aléatoire
    python outils_installation.py mot_de_passe           un mot de passe aléatoire (compte MySQL dédié)
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
        print("Serveur :", c.fetchone()[0])
        c.execute(f"CREATE DATABASE IF NOT EXISTS `{nom}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        for hote in ("localhost", "127.0.0.1"):
            c.execute("CREATE USER IF NOT EXISTS %s@%s IDENTIFIED BY %s", (utilisateur, hote, mdp))
            c.execute("ALTER USER %s@%s IDENTIFIED BY %s", (utilisateur, hote, mdp))
            c.execute(f"GRANT ALL PRIVILEGES ON `{nom}`.* TO %s@%s", (utilisateur, hote))
        c.execute("FLUSH PRIVILEGES")
    connexion.close()
    print(f"Base « {nom} » et compte « {utilisateur} » prêts.")


if __name__ == "__main__":
    {"cle": cle, "mot_de_passe": mot_de_passe, "base": base}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
