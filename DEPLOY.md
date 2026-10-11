# Déploiement de Barkewl sur Windows (sans Docker, avec WampServer)

Architecture retenue : usage **local uniquement** (ce PC), backend démarré
**automatiquement avec Windows** via un service.

- **MySQL** : celui de WampServer (déjà installé), port 3306.
- **Backend Django** : servi par **Waitress** (serveur WSGI pur Python, pas besoin de
  compiler mod_wsgi pour Apache), démarré automatiquement via une **tâche planifiée
  Windows** (`schtasks`, natif, pas de téléchargement externe requis).
- **Frontend React** : build statique (`npm run build`) servi par **Apache**
  (celui de WampServer), qui fait aussi proxy vers `/api` pour éviter le CORS.

## 1. Prérequis à installer sur le nouveau PC

1. **WampServer** : déjà fait.
2. **Python 3.12/3.13** : https://www.python.org/downloads/ — cocher **"Add python.exe to PATH"** à l'installation.
3. **Node.js LTS** : https://nodejs.org/ (inclut npm).

Rien d'autre à télécharger : le démarrage automatique du backend utilise le
Planificateur de tâches intégré à Windows (pas besoin de NSSM).

Vérifier après installation (nouveau terminal PowerShell) :

```powershell
python --version
node --version
npm --version
```

## 2. Copier le projet

Copier tout le dossier `Barkewl` sur le nouveau PC (clé USB, partage réseau, ou zip).
**Ne pas copier** `backend\venv`, `frontend\node_modules`, `frontend\dist` — ils seront
recréés proprement sur le nouveau PC (les chemins absolus de l'ancien `venv` ne
fonctionneraient pas ailleurs).

## 3. Base de données MySQL (WampServer)

1. Démarrer WampServer (icône verte dans la barre des tâches).
2. Ouvrir http://localhost/phpmyadmin (ou utiliser la console MySQL de Wamp).
3. Créer la base :

```sql
CREATE DATABASE pharmacie CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

4. Noter les identifiants (par défaut sous Wamp : utilisateur `root`, mot de passe vide).

## 4. Backend Django

```powershell
cd Barkewl\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pip install waitress
```

Créer le fichier `.env` (copier le `.env` existant ou s'inspirer de celui-ci) et l'adapter :

```
DEBUG=0
CLE_SECRETE=<générer une longue valeur aléatoire, voir commande ci-dessous>
HOTES_AUTORISES=localhost,127.0.0.1
ORIGINES_CORS=http://localhost:8080

BD_NOM=pharmacie
BD_UTILISATEUR=root
BD_MOT_DE_PASSE=
BD_HOTE=127.0.0.1
BD_PORT=3306

UTILISER_SQLITE=0
```

Générer une clé secrète aléatoire :

```powershell
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Initialiser la base :

```powershell
python manage.py migrate
python manage.py initialiser_donnees
REM optionnel, données de démo :
REM python manage.py charger_demo
```

Tester que ça fonctionne avant de créer le service :

```powershell
python manage.py runserver
```

Ouvrir http://127.0.0.1:8000/api/ dans le navigateur, puis `Ctrl+C` pour arrêter.

### Démarrage automatique (tâche planifiée Windows)

1. Tester d'abord manuellement avec Waitress : lancer `deploy\start_waitress_manuel.bat`,
   vérifier http://127.0.0.1:8000/api/, puis fermer la fenêtre (`Ctrl+C`).
2. Exécuter `deploy\install_task_scheduler.bat` **en Administrateur**
   (clic droit > "Exécuter en tant qu'administrateur").
3. La tâche `BarkewlBackend` est créée : elle démarre Waitress automatiquement à
   chaque démarrage de Windows (compte SYSTEM, même sans session ouverte).

Commandes utiles ensuite (terminal admin) :

```powershell
schtasks /run /tn "BarkewlBackend"       REM démarrer tout de suite
schtasks /end /tn "BarkewlBackend"       REM arrêter
schtasks /query /tn "BarkewlBackend"     REM statut
schtasks /delete /tn "BarkewlBackend" /f REM supprimer
```

> **Alternative** si tu préfères un vrai service Windows (logs dédiés, redémarrage
> automatique en cas de crash) : [NSSM](https://nssm.cc/download) fait ça très bien,
> mais le site était indisponible (503) au moment de la rédaction de ce guide —
> réessaie plus tard, ou installe-le via `winget install NSSM.NSSM` ou
> `choco install nssm` si tu as l'un de ces gestionnaires de paquets. Le script
> `deploy\install_service.bat` est prêt si tu veux basculer sur cette option.

## 5. Frontend

Dans `frontend\.env`, mettre une URL relative (plus simple, pas de CORS à gérer
puisque Apache fera le proxy) :

```
VITE_URL_API=/api
```

Puis build :

```powershell
cd Barkewl\frontend
npm install
npm run build
```

Ça génère `frontend\dist\`. **Il n'y a pas besoin de Node.js pour faire tourner le
site ensuite** — seulement pour rebuild après une future modification du code.

## 6. Apache (WampServer) : servir le frontend + proxy API

1. Activer les modules Apache nécessaires : clic gauche sur l'icône Wamp dans la
   barre des tâches > **Apache** > **Modules Apache**, cocher :
   - `rewrite_module`
   - `proxy_module`
   - `proxy_http_module`
   (Wamp redémarre Apache automatiquement après chaque coche.)
2. Ouvrir `httpd.conf` (menu Wamp > Apache > httpd.conf) et ajouter, à côté de la
   ligne existante `Listen 80` :

```
Listen 8080
```

3. Ouvrir `httpd-vhosts.conf` (menu Wamp > Apache > httpd-vhosts.conf) et y coller
   le contenu de `deploy\apache-vhost.conf`, **en adaptant le chemin**
   `DocumentRoot`/`Directory` vers `.../Barkewl/frontend/dist` sur ce PC.
4. Redémarrer tous les services Wamp (menu Wamp > "Redémarrer tous les services").

Le port 8080 (au lieu de 80) évite de toucher au vhost `localhost` par défaut de
Wamp, qui continue de servir phpMyAdmin normalement sur http://localhost/.

## 7. Vérification finale

- Ouvrir http://localhost:8080 dans le navigateur → l'appli React doit s'afficher.
- Se connecter avec un compte créé par `initialiser_donnees` (voir le README du
  backend pour les comptes de démo si `charger_demo` a été lancé).
- Si l'API ne répond pas : vérifier que la tâche tourne
  (`schtasks /query /tn "BarkewlBackend"`, ou dans le Planificateur de tâches
  Windows > Bibliothèque), et que WampServer (MySQL) est bien démarré.

## 8. Mettre à jour l'application plus tard

```powershell
REM Backend (si le code a changé)
cd Barkewl\backend
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
nssm restart BarkewlBackend

REM Frontend (si le code a changé)
cd Barkewl\frontend
npm install
npm run build
REM rien d'autre : Apache sert directement le nouveau contenu de dist\
```

## Dépannage

- **`pip install mysqlclient` échoue** : un wheel précompilé existe normalement pour
  Windows (Python 3.9 à 3.13) depuis `mysqlclient>=2.2` — vérifier que la version de
  Python installée est bien dans cette plage.
- **Erreur CORS dans la console navigateur** : vérifier que `VITE_URL_API=/api`
  (chemin relatif) a bien été utilisé *avant* le `npm run build`, et que le vhost
  Apache proxy fonctionne (tester http://localhost:8080/api/ directement).
- **Page blanche sur une route autre que `/`** : vérifier que `rewrite_module`
  est bien activé et que les règles `RewriteRule` du vhost sont présentes
  (nécessaire car React Router utilise `BrowserRouter`).
