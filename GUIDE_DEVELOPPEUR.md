# RAQEEM PHARMA — Guide du développeur

Document de référence pour faire évoluer le logiciel : architecture, règles à respecter, publication d'une
version, et pièges déjà rencontrés sur le terrain. À lire avant toute modification.

Éditeur : **Rawafid Digital Services** (Nouakchott) — +222 46 63 59 96 / 31 17 70 08.

---

## 1. Vue d'ensemble

| Partie | Technologie | Dossier |
|---|---|---|
| Serveur (API REST) | Python 3.12, Django 5.2 LTS, Django REST Framework, SimpleJWT | `backend/` |
| Interface | React 18, TypeScript, Tailwind CSS, Vite | `frontend/` |
| Base de données | MySQL 8.0+ (ou MariaDB 10.5+), tables InnoDB, utf8mb4 | — |
| Installation chez le client | PowerShell 5.1, Python « embarqué », Waitress | `deploy/installation/` |
| Licences (hors dépôt) | Python, signature Ed25519 | `C:\Rawafid digital services\rawafid-licences\` |

Chez le client, **un seul programme** tourne : Django (via Waitress, `python -m waitress`) sert l'API sous
`/api/` **et** l'interface déjà construite (`config/frontend.py`). Pas d'Apache, pas de Node.js.

### Applications Django (`backend/apps/`)

| Application | Rôle |
|---|---|
| `commun` | constantes (rôles, modules), permissions, audit, paramètres, sauvegardes, numérotation |
| `utilisateurs` | comptes, connexion JWT, code PIN d'approbation |
| `medicaments` | médicaments, catégories, lots, conditionnement (boîte / plaquette / unité) |
| `stock` | stocks par dépôt, mouvements, transferts, inventaires, alertes |
| `depots` | dépôts (pharmacie, magasin) |
| `achats`, `fournisseurs` | achats et fournisseurs |
| `ventes`, `caisse` | ventes, reçus, sessions et mouvements de caisse |
| `facturation` | devis, bons de livraison, factures (offre Professionnel et plus) |
| `rapports` | rapports et tableau de bord |
| `licence` | licence signée, offres, mode lecture seule |
| `tests` | tous les tests automatiques du serveur |

### Interface (`frontend/src/`)

`pages/` (écrans), `fonctionnalites/` (blocs réutilisés : licence, sauvegardes…), `composants/` (boutons,
logo…), `miseEnPage/` (menu), `services/` (appels API), `i18n/` (traductions), `utilitaires/`.

---

## 2. Poste de développement

```powershell
# Serveur
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # DEBUG=1 obligatoire en développement (sinon CLE_SECRETE est exigée)
python manage.py migrate
python manage.py initialiser_donnees      # demande le mot de passe du compte « admin »
python manage.py runserver                # http://localhost:8000/api/

# Interface (autre terminal)
cd frontend
npm install
npm run dev                               # http://localhost:5173
```

- **MySQL de WampServer** : le `.env` pointe sur la base `pharmacie`. Sur certains PC Windows, Smart App
  Control bloque la DLL de `mysqlclient` : `settings.py` bascule alors automatiquement sur PyMySQL.
- **Sans MySQL** : `UTILISER_SQLITE=1` dans le `.env` (pratique pour les tests rapides).
- Le PC de développement a WampServer avec MySQL 8.4 (port 3306) **et** MariaDB (port 3307).

---

## 3. Règles à respecter

### 3.1 Noms en français
Modèles, champs, tables, URLs, variables, messages : en français. Seuls les noms imposés par Django restent
en anglais (`password`, `is_active`…). Voir `backend/README.md`.

### 3.2 Règles métier (ne jamais les contourner)
- **Un seul point d'écriture du stock** : `apps/stock/services.py::appliquer_mouvement()` (verrou de ligne,
  stock jamais négatif, historique dans la même transaction).
- **Stock compté en unités** (comprimés), **prix à la boîte** ; conversions dans `apps/medicaments/conditionnement.py`.
- **FEFO** : le lot qui expire en premier sort d'abord ; jamais un lot périmé.
- **Historique immuable** : mouvements de stock et de caisse, journal d'audit — on corrige par un mouvement inverse.
- **Tout ou rien** : chaque opération est une transaction (`transaction.atomic`). D'où **InnoDB obligatoire**
  (MyISAM ignore les transactions sans prévenir) : forcé par `settings.py`, migration `commun.0002`, contrôle `raqeem.W001`.
- **Le serveur décide** des lots, prix et totaux ; l'interface n'envoie que médicament, quantité et paiements.

### 3.3 Textes de l'interface : toujours `t()` + traduction arabe
```tsx
import { t } from '../i18n'
<button>{t('Nouvelle vente')}</button>
<p>{t('Stock disponible : {n}.', { n: 12 })}</p>
```
- Le texte français **est** la clé. Toute nouvelle phrase (ou phrase modifiée) doit être ajoutée dans
  `frontend/src/i18n/ar.ts`, avec les **mêmes `{paramètres}`** et les mêmes espaces de début/fin.
- Le test `src/i18n/traductions.test.ts` échoue et **liste les textes oubliés** (`npm test`).
- Mise en page droite-à-gauche : utiliser les classes Tailwind **logiques** (`ps-`, `pe-`, `ms-`, `me-`,
  `start-`, `end-`, `text-start`), jamais `pl-`/`pr-`/`left-`/`right-`. Icônes de flèche : `rtl:-scale-x-100`.
- Ne pas passer à `t()` les noms propres ni les valeurs techniques (noms de polices, types de champ…).
- Restent en français (à traduire un jour) : messages d'erreur du serveur, documents imprimés.

### 3.4 Rôles et offres
- **4 rôles** (`apps/commun/constantes.py`) : Propriétaire (`ADMIN`), Pharmacien, Vendeur (`CAISSIER`),
  Magasinier. Le Pharmacien hérite des droits Vendeur et Magasinier (`ROLES_INCLUS`), ne voit pas les prix
  d'achat (`ROLES_SANS_PRIX_ACHAT`). Menu par rôle : `MODULES_PAR_ROLE`.
- **Approbation par PIN** (`apps/utilisateurs/approbation.py`) : un Vendeur fait valider une annulation
  par le code PIN du Propriétaire ou du Pharmacien ; blocage après 5 essais.
- **3 offres** (`apps/licence/offres.py`), écrites dans la clé de licence signée :

| | Essentiel | Professionnel | Réseau |
|---|---|---|---|
| Comptes actifs | 3 | 10 | illimité |
| Rôles | Propriétaire, Vendeur | les 4 | les 4 |
| Transferts, facturation, approbation PIN | — | oui | oui |

  Une fonction absente de l'offre disparaît du menu (`modules_autorises`) et l'API la refuse (`exiger_fonction`).

### 3.5 Licence
- Clé `RQM1.<données>.<signature>` signée **Ed25519** (implémentation pure Python : `apps/licence/ed25519.py`).
  Le logiciel ne contient que la **clé publique** (`apps/licence/services.py`, `CLE_PUBLIQUE_HEX`).
- Liée au PC par le **code PC** `RQM-XXXX-XXXX-XXXX`. **Ne jamais changer le sel** de l'empreinte
  (`"barkewl:"`) : toutes les licences émises deviendraient invalides.
- Abonnements : mensuel, annuel, essai. À l'expiration : **lecture seule** (consultation et sauvegarde
  permises, ventes bloquées) via `LicenceMiddleware`. Recul de l'horloge détecté.
- Émission : outil séparé `rawafid-licences` (Centre des licences). **`cle_privee.key` ne doit jamais
  entrer dans ce dépôt** ; en garder une copie hors ligne (perdue = plus aucune licence émise).

### 3.6 Base de données
- Version minimale : **MySQL 8.0.11** / **MariaDB 10.5** (Django 5.2). Vérifiée par l'installateur.
- Format de ligne **DYNAMIC** obligatoire (index utf8mb4 longs) : l'installateur le règle.
- Toute modification de modèle → `python manage.py makemigrations`, migration **committée**.
  La mise à jour chez le client applique les migrations (et revient en arrière si elles échouent).
- Sauvegardes : `apps/commun/sauvegarde.py` (`mysqldump --single-transaction`, `.sql.gz`, toutes les 6 h,
  30 jours). `CHEMIN_MYSQL_BIN` indique où trouver `mysqldump` (MySQL inclus du paquet complet).

### 3.7 Dépendances Python
Versions **exactes** :
- développement : `backend/requirements.txt` ;
- client : `deploy/installation/requirements-installation.in` (plages) →
  `python deploy/installation/verrouiller_dependances.py` → `requirements-installation.txt` (versions exactes
  + empreintes SHA-256, `pip --require-hashes` à la construction).

Changer une version = modifier les deux fichiers, relancer `verrouiller_dependances.py`, puis **tous les tests**.
**Ne pas passer à Django 6** sans vérifier les clients : il exige MySQL 8.4+ (WampServer fournit souvent 8.0).

---

## 4. Tests

| Commande | Ce qui est vérifié |
|---|---|
| `cd backend` puis `set UTILISER_SQLITE=1` et `python manage.py test apps.tests` | serveur, rapide (SQLite) |
| `cd backend` puis `python manage.py test apps.tests` | serveur sur MySQL (6 tests propres à SQLite ignorés) |
| `cd frontend` puis `npm test` | fonction `t()` et **traductions arabes complètes** |
| `cd frontend` puis `npx tsc --noEmit` | types TypeScript |
| `powershell -ExecutionPolicy Bypass -File deploy\installation\tester_paquet.ps1` | paquet complet : installation, mise à jour, **mise à jour cassée + retour automatique** |

**GitHub Actions** (`.github/workflows/tests.yml`) lance les tests serveur (SQLite + MySQL 8.0) et interface
à chaque envoi : onglet *Actions* du dépôt. Le test du paquet (Windows, administrateur non requis) se lance
à la main avant chaque livraison.

---

## 5. Publier une nouvelle version (procédure complète)

1. Modifier le code, ajouter les traductions, les migrations éventuelles.
2. Lancer les tests serveur et interface (section 4).
3. Augmenter la version dans `backend/config/version.py` :
   `1.0.1 → 1.0.2` (correction), `→ 1.1.0` (nouvelle fonction), `→ 2.0.0` (changement majeur).
4. **Committer** (obligatoire : le paquet prend le serveur dans le dernier commit, via `git archive`).
5. Construire :
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\installation\construire_paquet.ps1
   ```
   → `dist-installation\RaqeemPharma-<v>.zip` (léger, PC avec WampServer)
   et `RaqeemPharma-<v>-complet.zip` (avec MySQL et HeidiSQL). `-SansMysql` : léger seulement.
6. Tester le paquet : `deploy\installation\tester_paquet.ps1` → « TOUS LES TESTS SONT PASSÉS ».
7. Marquer la version : `git tag v1.0.2`, puis `git push` et `git push origin v1.0.2`.
8. Chez chaque client : copier le zip, décompresser, **Mettre_a_jour.bat** (administrateur).

---

## 6. Le paquet d'installation (`deploy/installation/`)

| Fichier | Rôle |
|---|---|
| `construire_paquet.ps1` | construit les paquets (sur le PC Rawafid, avec Internet la première fois) |
| `installer.ps1` + `Installer.bat` | installation chez le client (8 étapes) |
| `mettre_a_jour.ps1` + `Mettre_a_jour.bat` | mise à jour avec retour automatique |
| `commun.ps1` | **fonctions partagées** par l'installation et la mise à jour (ne pas les recopier ailleurs) |
| `outils_installation.py` | clé secrète, mots de passe, création de la base et du compte MySQL, version MySQL |
| `preparer_mysql.py` | allège l'archive MySQL officielle (1 Go → 146 Mo) |
| `generer_icone.py` | `raqeem.ico` (raccourci du bureau) à partir du logo de l'interface |
| `verrouiller_dependances.py` | versions exactes + empreintes des composants Python |
| `base_de_donnees.ps1` + `Base_de_donnees.bat` | ouverture de la base dans HeidiSQL (support) |
| `tester_paquet.ps1` | test automatique du paquet complet |
| `LISEZMOI.txt` | guide remis avec le paquet |
| `cache/` (non versionné) | Python embarqué, MySQL, Visual C++, HeidiSQL téléchargés une fois |

**Chez le client** (`C:\RaqeemPharma`) : `python\` (embarqué), `lib\` (composants), `app\backend\`
(+ `.env`, réservé aux administrateurs), `app\interface\`, `sauvegardes\`, `journaux\` (`serveur.log`,
`mysql.err`), `installation.json`, `demarrer_serveur.bat`, et avec le paquet complet : `mysql\`,
`donnees_mysql\`, `mysql.ini`, `mysql_root.txt` (administrateurs), `outils\HeidiSQL\`, `Base_de_donnees.bat`.

Démarrage : tâche Windows **RaqeemPharma** (compte SYSTEM, au démarrage, sur batterie, sans limite de
durée, relance chaque minute en cas d'arrêt) → `demarrer_serveur.bat` → `python -m waitress`.
MySQL : service WampServer passé en démarrage automatique, ou service **RaqeemMySQL** (paquet complet).

Contraintes PowerShell 5.1 : scripts en **UTF-8 avec BOM** (accents), `.bat` en cp1252 avec fins de ligne
CRLF (fait par `construire_paquet.ps1`) ; programmes externes appelés via `Natif` (un message sur la sortie
d'erreur ne doit pas arrêter le script) ; ne jamais analyser une phrase accentuée dans une sortie console.

---

## 7. Leçons du terrain (ne pas réintroduire ces problèmes)

| Problème rencontré | Cause | Solution en place |
|---|---|---|
| DLL `mysqlclient`, `waitress-serve.exe` bloqués | Smart App Control refuse les programmes non signés | PyMySQL ; toujours `python -m …` |
| Installation de Python ignorée | l'installateur officiel réutilise un Python 3.12 existant | Python « embarqué » copié tel quel |
| Erreur 1709 « Index column size too large » | MySQL réglé en ROW_FORMAT COMPACT | l'installateur force DYNAMIC |
| « MySQL 8.4 or later is required » | Django 6 | Django 5.2 LTS épinglé |
| Ventes / stock incohérents possibles | tables MyISAM (WampServer) | InnoDB forcé + contrôle `raqeem.W001` |
| WinError 10013 sur le port 8080 | port réservé par Windows (Hyper-V / WSL) | port testé réellement, choix automatique |
| Serveur jamais lancé / arrêté après 3 jours | `schtasks` : pas sur batterie, limite 72 h | `Register-ScheduledTask` avec réglages explicites |
| Mise à jour refusée « sauvegarde impossible » | phrase accentuée déformée par la console | repérage par l'extension `.sql.gz` |
| WampServer fermé = pas de base | services MySQL en démarrage manuel | service trouvé (port ou `my.ini`) et passé en automatique |
| Deux MySQL sur le même port 3306 | Windows laisse ouvrir 127.0.0.1:3306 quand un MySQL écoute sur « :: » ; et un WampServer arrêté n'était pas retrouvé | `Test-PortLibre` refuse tout port déjà écouté ; recherche par `my.ini` corrigée |

---

## 8. Calendrier de maintenance

| Échéance | Action |
|---|---|
| Chaque version | tests + `tester_paquet.ps1` avant livraison |
| Mises à jour de sécurité Django 5.2.x | relever la version dans les deux fichiers de dépendances, re-verrouiller, tester |
| **Avant avril 2028** | fin du support Django 5.2 : passer à la LTS suivante. Elle exigera sans doute MySQL 8.4+ : prévoir le passage des clients WampServer en MySQL 8.0 vers le MySQL inclus (paquet complet) |
| **Avant octobre 2028** | fin du support Python 3.12 : changer `VersionPython` dans `construire_paquet.ps1` (et `VERSION_PYTHON` dans `verrouiller_dependances.py`) ; la mise à jour remplace le Python embarqué |
| Mise à jour du MySQL inclus | non automatisée : les données (`donnees_mysql`) doivent être mises à niveau par `mysqld` ; à préparer et tester à part |
| Chaque année | vérifier la sauvegarde hors ligne de `cle_privee.key` |
