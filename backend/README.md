# Gestion de pharmacie — Backend (Django REST + MySQL)

API REST pour une pharmacie privée : médicaments, lots et péremptions (FEFO), dépôts, stock, achats,
fournisseurs, ventes/caisse, inventaires, rapports. Authentification JWT, 3 rôles (Administrateur, Caissier, Magasinier).

## Installation

```bash
python -m venv venv
source venv/bin/activate            # Windows : venv\Scripts\activate
pip install -r requirements.txt     # mysqlclient demande les bibliothèques de développement MySQL/MariaDB
cp .env.example .env                # puis renseigner CLE_SECRETE et les paramètres BD_*
```

Créer la base MySQL (une seule fois) :

```sql
CREATE DATABASE pharmacie CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
python manage.py migrate
python manage.py initialiser_donnees          # administrateur, dépôts, caisse, modes de paiement, paramètres
python manage.py charger_demo                 # (facultatif) médicaments et stock de démonstration
python manage.py runserver                    # http://localhost:8000/api/
```

Comptes de démonstration (après `charger_demo`) : `caissier` et `magasinier`, mot de passe `demo12345`.
En production : `DEBUG=0`, `CLE_SECRETE` longue et aléatoire, `HOTES_AUTORISES`, `ORIGINES_CORS`, serveur WSGI (gunicorn) derrière HTTPS.

## Tests

```bash
UTILISER_SQLITE=1 python manage.py test apps.tests     # rapide, sans MySQL
python manage.py test apps.tests                        # sur MySQL (le compte BD doit pouvoir créer une base de test)
```

## Règles métier garanties par le code

- **Un seul point d'écriture du stock** : `apps/stock/services.py::appliquer_mouvement()`. Il verrouille la ligne,
  refuse un stock négatif (sauf paramètre explicite), calcule stock avant/après et écrit l'historique **dans la même transaction**.
- **FEFO** : `selectionner_lots_fefo()` vend d'abord le lot qui expire en premier et **n'utilise jamais un lot périmé**.
- **Historique immuable** : `MouvementStock`, `MouvementCaisse` et `JournalAudit` ne peuvent être ni modifiés ni supprimés
  (les corrections passent par des mouvements inverses). Une session de caisse clôturée est figée.
- **Tout ou rien** : chaque opération (vente, achat, transfert, inventaire, clôture) est une transaction unique ; aucune exception n'est avalée.
- **Le serveur décide** des lots, des prix et des totaux d'une vente ; le frontend n'envoie que médicament + quantité + paiements.
- **Numérotation** sans doublon (verrou de ligne) : `REC-2026-00001`, `ACH-…`, `TRF-…`, `INV-…`.
- **Caisse** : espèces attendues = fond de caisse + ventes en espèces + entrées − remboursements − sorties ; écart calculé à la clôture.
- **Journal d'audit** : qui, quoi, quand, ancienne/nouvelle valeur, référence (`/api/journal-audit/`, administrateur).

## Rôles

| Rôle | Accès |
|---|---|
| Administrateur | tout, y compris achats, fournisseurs, rapports, utilisateurs, paramètres, annulation de vente |
| Caissier | caisse, ventes, reçus, clients, consultation du stock (sans prix d'achat) |
| Magasinier | stock, entrées/sorties, transferts, inventaires, lots, consultation des médicaments |

## Principaux points d'accès (préfixe `/api/`)

`auth/connexion/` · `auth/rafraichir/` · `auth/moi/` · `utilisateurs/` · `depots/` · `categories/` · `medicaments/` (+ `recherche-caisse/`, `historique/`) ·
`lots/` · `stocks/` (+ `synthese/`, `entree/`, `sortie/`) · `mouvements-stock/` · `transferts/` (+ `valider/`, `annuler/`) ·
`inventaires/` (+ `saisir/`, `recharger/`, `valider/`, `annuler/`) · `alertes/` · `fournisseurs/` · `achats/` (+ `valider/`, `payer/`, `annuler/`) ·
`clients/` · `ventes/` (+ `apercu/`, `annuler/`) · `recus/` · `modes-paiement/` · `caisses/` · `sessions-caisse/` (+ `actuelle/`, `fermer/`, `mouvements/`) ·
`rapports/{ventes,achats,caisse,stock,mouvements}/` · `tableau-de-bord/` · `parametres/` · `journal-audit/`

Listes paginées : `?page=1&taille_page=25&recherche=…&tri=-champ`. Réponse : `{total, page, taille_page, nombre_pages, resultats}`.

## Noms en français

Tables, colonnes, modèles, champs, URLs, variables d'environnement, valeurs (`ENTREE`, `VALIDE`…) et messages sont en français.
Seuls restent en anglais les noms **imposés par Django / Django REST / SimpleJWT** (`password`, `is_active`, `last_login` côté Python,
tables techniques `django_*` et `auth_*`) ; les colonnes de la table `utilisateurs` sont, elles, en français (`mot_de_passe`, `derniere_connexion`).
