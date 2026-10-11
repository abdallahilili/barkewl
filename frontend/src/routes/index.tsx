import type { ReactElement } from 'react'
import Achats from '../pages/achats/Achats'
import AchatDetail from '../pages/achats/AchatDetail'
import Fournisseurs from '../pages/achats/Fournisseurs'
import Utilisateurs from '../pages/administration/Utilisateurs'
import Parametres from '../pages/administration/Parametres'
import HistoriqueSessions from '../pages/caisse/HistoriqueSessions'
import SessionActuelle from '../pages/caisse/SessionActuelle'
import Depots from '../pages/Depots'
import Categories from '../pages/medicaments/Categories'
import Lots from '../pages/medicaments/Lots'
import Medicaments from '../pages/medicaments/Medicaments'
import Rapports from '../pages/Rapports'
import EtatStock from '../pages/stock/EtatStock'
import InventaireDetail from '../pages/stock/InventaireDetail'
import Inventaires from '../pages/stock/Inventaires'
import MouvementsStock from '../pages/stock/MouvementsStock'
import Transferts from '../pages/stock/Transferts'
import TableauDeBord from '../pages/TableauDeBord'
import Clients from '../pages/ventes/Clients'
import ListeVentes from '../pages/ventes/ListeVentes'
import NouvelleVente from '../pages/ventes/NouvelleVente'
import Recus from '../pages/ventes/Recus'

export interface RouteProtegee { chemin: string; module: string; element: ReactElement }

// Une route n'est enregistrée que si le module correspondant est autorisé pour le rôle de l'utilisateur.
export const routesProtegees: RouteProtegee[] = [
  { chemin: '/', module: 'tableau_de_bord', element: <TableauDeBord /> },
  { chemin: '/ventes/nouvelle', module: 'ventes', element: <NouvelleVente /> },
  { chemin: '/ventes', module: 'ventes', element: <ListeVentes /> },
  { chemin: '/recus', module: 'ventes', element: <Recus /> },
  { chemin: '/clients', module: 'ventes', element: <Clients /> },
  { chemin: '/stock', module: 'stock_etat', element: <EtatStock /> },
  { chemin: '/stock/entrees', module: 'stock_gestion', element: <MouvementsStock mode="entree" /> },
  { chemin: '/stock/sorties', module: 'stock_gestion', element: <MouvementsStock mode="sortie" /> },
  { chemin: '/stock/historique', module: 'stock_gestion', element: <MouvementsStock mode="tous" /> },
  { chemin: '/stock/transferts', module: 'stock_gestion', element: <Transferts /> },
  { chemin: '/stock/inventaires', module: 'stock_gestion', element: <Inventaires /> },
  { chemin: '/stock/inventaires/:id', module: 'stock_gestion', element: <InventaireDetail /> },
  { chemin: '/medicaments', module: 'medicaments', element: <Medicaments /> },
  { chemin: '/categories', module: 'medicaments', element: <Categories /> },
  { chemin: '/lots', module: 'lots', element: <Lots /> },
  { chemin: '/achats', module: 'achats', element: <Achats /> },
  { chemin: '/achats/nouveau', module: 'achats', element: <AchatDetail /> },
  { chemin: '/achats/:id', module: 'achats', element: <AchatDetail /> },
  { chemin: '/fournisseurs', module: 'achats', element: <Fournisseurs /> },
  { chemin: '/caisse', module: 'caisse', element: <SessionActuelle /> },
  { chemin: '/caisse/historique', module: 'caisse', element: <HistoriqueSessions /> },
  { chemin: '/depots', module: 'depots', element: <Depots /> },
  { chemin: '/rapports', module: 'rapports', element: <Rapports /> },
  { chemin: '/administration/utilisateurs', module: 'administration', element: <Utilisateurs /> },
  { chemin: '/administration/parametres', module: 'administration', element: <Parametres /> },
]
