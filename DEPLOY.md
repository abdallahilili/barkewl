# Installation de RAQEEM PHARMA chez une pharmacie

L'installation se fait avec un **paquet** préparé par Rawafid Digital Services, sur clé USB, **sans Internet**.
(L'ancienne procédure manuelle — Apache, configuration à la main — est remplacée ; elle reste consultable
dans l'historique git.)

## 1. Choisir le paquet

| Paquet | Taille | Pour quel PC |
|---|---|---|
| `RaqeemPharma-<version>.zip` | ~22 Mo | PC avec **WampServer** (ou MySQL / MariaDB) déjà installé |
| `RaqeemPharma-<version>-complet.zip` | ~117 Mo | PC **sans** MySQL : MySQL est installé automatiquement |

En cas de doute : le paquet **complet** (il utilise le MySQL existant s'il en trouve un).
Construction des paquets : voir [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md), section 5.

## 2. Installer

1. Copier le zip sur le PC, clic droit > **Extraire tout**.
2. Clic droit sur **Installer.bat** > **Exécuter en tant qu'administrateur**.
3. Questions posées :
   - avec WampServer : mot de passe MySQL de `root` (vide par défaut sous WampServer) ;
   - toujours : mot de passe du **propriétaire** (compte `admin`, 8 caractères minimum, pas uniquement des chiffres).
4. À la fin : noter le **CODE DU PC** (`RQM-XXXX-XXXX-XXXX`) affiché.
5. Émettre la licence dans le **Centre des licences** (offre Essentiel / Professionnel / Réseau, durée),
   puis la coller dans **Paramètres > Licence**.

Ce que fait l'installation : logiciel dans `C:\RaqeemPharma`, base `raqeem` avec un compte MySQL dédié
(mot de passe aléatoire), démarrage automatique du logiciel **et de MySQL** avec Windows, raccourci
**RAQEEM PHARMA** sur le bureau, sauvegardes automatiques toutes les 6 heures.

Plusieurs postes (caisses) sur le réseau local : sur le PC serveur, ouvrir une invite de commandes dans le
dossier du paquet et taper `Installer.bat -Reseau` ; les autres postes ouvrent
`http://<nom-du-pc-serveur>:<port>` dans le navigateur.

## 3. Mettre à jour

1. Copier le nouveau zip, **Extraire tout**.
2. Clic droit sur **Mettre_a_jour.bat** > **Exécuter en tant qu'administrateur** (pas Installer.bat).

La mise à jour sauvegarde la base, garde l'ancienne version, installe la nouvelle et met la base à jour.
En cas d'échec : **retour automatique** à la version précédente et à la base d'avant. Les données, la
configuration et la licence sont conservées.

## 4. Après l'installation

- **Copie de secours des sauvegardes** (fortement conseillé) : dans `C:\RaqeemPharma\app\backend\.env`
  (Bloc-notes en administrateur), indiquer un dossier sur clé USB ou autre disque dans
  `DOSSIER_SAUVEGARDES_COPIE=`.
- **Accès à la base** (support) :
  - avec WampServer : `http://localhost/phpmyadmin` (WampServer ouvert, icône verte), base `raqeem` ;
  - paquet complet : `C:\RaqeemPharma\Base_de_donnees.bat` (HeidiSQL, administrateurs seulement).
  Toujours faire une sauvegarde avant de modifier des données.

## 5. Dépannage

| Symptôme | À faire |
|---|---|
| Le logiciel ne s'ouvre pas | attendre 1 minute après le démarrage du PC ; lire `C:\RaqeemPharma\journaux\serveur.log` |
| L'installation s'arrête | l'écran affiche la cause (et les dernières lignes du journal) : photo à envoyer à Rawafid |
| « Le port … est interdit » | relancer l'installation sans `-Port` (choix automatique) |
| MySQL ne démarre pas (paquet complet) | `C:\RaqeemPharma\journaux\mysql.err` |
| Licence expirée | le logiciel passe en lecture seule : émettre une nouvelle licence |
| Fonction absente du menu (ex. facturation) | elle n'est pas dans l'offre de la licence : émettre une licence Professionnel |
