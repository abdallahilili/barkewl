# RAQEEM PHARMA | رَقِيم فارما

Logiciel de gestion de pharmacie bilingue **arabe / français**, édité par **Rawafid Digital Services**
(Nouakchott, Mauritanie) — +222 46 63 59 96 / 31 17 70 08.

Ventes à la boîte, à la plaquette ou à l'unité · stock par lots avec péremptions (FEFO) · achats et
fournisseurs · caisse · devis, bons de livraison et factures · rapports · 4 rôles avec approbation par code
PIN · sauvegardes automatiques · licence mensuelle ou annuelle · installation en un clic, sans Internet.

| Document | Pour qui |
|---|---|
| [GUIDE_DEVELOPPEUR.md](GUIDE_DEVELOPPEUR.md) | développeurs : architecture, règles, tests, publication d'une version |
| [DEPLOY.md](DEPLOY.md) | installation et mise à jour chez une pharmacie |
| [backend/README.md](backend/README.md) | serveur : règles métier, points d'accès de l'API |
| [deploy/installation/LISEZMOI.txt](deploy/installation/LISEZMOI.txt) | guide remis au client avec le paquet |

Technique : Django 5.2 LTS + Django REST Framework, React + TypeScript + Tailwind, MySQL 8 (InnoDB).

## Travaux prévus (liste de l'équipe)

- État par mode de paiement sur l'état global des sessions (filtrage)
- Récupérer la quantité en sortie si le type est « périmé »
- Référencer toutes les colonnes des médicaments (forme, dosage, etc.)
- Internationalisation
- Copyright
- Algorithme de calcul du prix de vente dans un nouvel achat
- Citer le nom du système dans les documents imprimés
- Dépôt privé ; le partager avec dex, el adel
- Création d'un fournisseur au cours d'un achat
- Dettes clients (sur demande)

----------------------------------
- correction de traduire ![alt text](image.png)
dash board

- ajouter filtrage par type de Wollet avec total dans le table et l'exportation![alt text](image-1.png)

- devise en arabe : MRU (أوقية)

![alt text](image.png)