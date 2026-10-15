import {
  Archive, ArrowLeftRight, BarChart3, Boxes, Building2, ClipboardCheck, ClipboardList, FileText, History, LayoutDashboard,
  LucideIcon, Package, Pill, Receipt, Settings, ShoppingCart, Store, Tags, Truck, Users, UserCog, Wallet, PackagePlus, PackageMinus, Layers,
} from 'lucide-react'

export interface ElementMenu { libelle: string; chemin: string; module: string; icone: LucideIcon }
export interface GroupeMenu { titre?: string; elements: ElementMenu[] }

export const menu: GroupeMenu[] = [
  { elements: [{ libelle: 'Tableau de bord', chemin: '/', module: 'tableau_de_bord', icone: LayoutDashboard }] },
  {
    titre: 'Ventes',
    elements: [
      { libelle: 'Nouvelle vente', chemin: '/ventes/nouvelle', module: 'ventes', icone: ShoppingCart },
      { libelle: 'Historique des ventes', chemin: '/ventes', module: 'ventes', icone: History },
      { libelle: 'Reçus', chemin: '/recus', module: 'ventes', icone: Receipt },
      { libelle: 'Clients', chemin: '/clients', module: 'ventes', icone: Users },
    ],
  },
  {
    titre: 'Stock',
    elements: [
      { libelle: 'État du stock', chemin: '/stock', module: 'stock_etat', icone: Boxes },
      { libelle: 'Entrées', chemin: '/stock/entrees', module: 'stock_gestion', icone: PackagePlus },
      { libelle: 'Sorties', chemin: '/stock/sorties', module: 'stock_gestion', icone: PackageMinus },
      { libelle: 'Transferts', chemin: '/stock/transferts', module: 'stock_gestion', icone: ArrowLeftRight },
      { libelle: 'Historique du stock', chemin: '/stock/historique', module: 'stock_gestion', icone: ClipboardList },
      { libelle: 'Inventaires', chemin: '/stock/inventaires', module: 'stock_gestion', icone: ClipboardCheck },
    ],
  },
  {
    titre: 'Médicaments',
    elements: [
      { libelle: 'Médicaments', chemin: '/medicaments', module: 'medicaments', icone: Pill },
      { libelle: 'Catégories', chemin: '/categories', module: 'medicaments', icone: Tags },
      { libelle: 'Lots', chemin: '/lots', module: 'lots', icone: Layers },
    ],
  },
  {
    titre: 'Achats',
    elements: [
      { libelle: 'Achats', chemin: '/achats', module: 'achats', icone: Package },
      { libelle: 'Fournisseurs', chemin: '/fournisseurs', module: 'achats', icone: Truck },
    ],
  },
  {
    titre: 'Facturation',
    elements: [
      { libelle: 'Devis / BL / Factures', chemin: '/facturation', module: 'facturation', icone: FileText },
    ],
  },
  {
    titre: 'Caisse',
    elements: [
      { libelle: 'Session actuelle', chemin: '/caisse', module: 'caisse', icone: Wallet },
      { libelle: 'Historique des sessions', chemin: '/caisse/historique', module: 'caisse', icone: Archive },
    ],
  },
  {
    titre: 'Gestion',
    elements: [
      { libelle: 'Dépôts', chemin: '/depots', module: 'depots', icone: Store },
      { libelle: 'Rapports', chemin: '/rapports', module: 'rapports', icone: BarChart3 },
    ],
  },
  {
    titre: 'Administration',
    elements: [
      { libelle: 'Utilisateurs', chemin: '/administration/utilisateurs', module: 'administration', icone: UserCog },
      { libelle: 'Paramètres', chemin: '/administration/parametres', module: 'administration', icone: Settings },
    ],
  },
]

export { Building2, FileText }
