import {
  Archive, ArrowLeftRight, BarChart3, Boxes, Building2, ClipboardCheck, ClipboardList, FileText, History, LayoutDashboard, Library, Undo2, Banknote,
  LucideIcon, Package, Pill, Receipt, Settings, ShoppingCart, Truck, Users, UserCog, Wallet, PackagePlus, PackageMinus, Layers, Database, BookOpen,
} from 'lucide-react'

import { t } from '../i18n'
export interface ElementMenu { libelle: string; chemin: string; module: string; icone: LucideIcon }
export interface GroupeMenu { titre?: string; /** Icône du groupe repliable (par défaut : celle de son premier élément). */ icone?: LucideIcon; elements: ElementMenu[] }

export const menu: GroupeMenu[] = [
  { elements: [{ libelle: t('Tableau de bord'), chemin: '/', module: 'tableau_de_bord', icone: LayoutDashboard }] },
  {
    titre: t('Ventes'),
    icone: ShoppingCart,
    elements: [
      { libelle: t('Nouvelle vente'), chemin: '/ventes/nouvelle', module: 'ventes', icone: ShoppingCart },
      { libelle: t('Historique des ventes'), chemin: '/ventes', module: 'ventes', icone: History },
      { libelle: t('Reçus'), chemin: '/recus', module: 'ventes', icone: Receipt },
      { libelle: t('Retours clients'), chemin: '/retours', module: 'ventes', icone: Undo2 },
      { libelle: t('Clients'), chemin: '/clients', module: 'ventes', icone: Users },
    ],
  },
  {
    titre: t('Stock'),
    icone: Boxes,
    elements: [
      { libelle: t('État du stock'), chemin: '/stock', module: 'stock_etat', icone: Boxes },
      { libelle: t('Entrées'), chemin: '/stock/entrees', module: 'stock_gestion', icone: PackagePlus },
      { libelle: t('Sorties'), chemin: '/stock/sorties', module: 'stock_gestion', icone: PackageMinus },
      { libelle: t('Transferts'), chemin: '/stock/transferts', module: 'transferts', icone: ArrowLeftRight },
      { libelle: t('Historique du stock'), chemin: '/stock/historique', module: 'stock_gestion', icone: ClipboardList },
      { libelle: t('Inventaires'), chemin: '/stock/inventaires', module: 'stock_gestion', icone: ClipboardCheck },
    ],
  },
  {
    titre: t('Médicaments'),
    icone: Pill,
    elements: [
      { libelle: t('Médicaments'), chemin: '/medicaments', module: 'medicaments', icone: Pill },
      { libelle: t('Lots'), chemin: '/lots', module: 'lots', icone: Layers },
    ],
  },
  {
    titre: t('Achats'),
    icone: Truck,
    elements: [
      { libelle: t('Achats'), chemin: '/achats', module: 'achats', icone: Package },
      { libelle: t('Bons de commande'), chemin: '/achats/commandes', module: 'achats', icone: ClipboardList },
      { libelle: t('Fournisseurs'), chemin: '/fournisseurs', module: 'achats', icone: Truck },
    ],
  },
  {
    titre: t('Facturation'),
    icone: FileText,
    elements: [
      { libelle: t('Devis / BL / Factures'), chemin: '/facturation', module: 'facturation', icone: FileText },
    ],
  },
  {
    titre: t('Caisse'),
    icone: Wallet,
    elements: [
      { libelle: t('Session actuelle'), chemin: '/caisse', module: 'caisse', icone: Wallet },
      { libelle: t('Historique des sessions'), chemin: '/caisse/historique', module: 'caisse', icone: Archive },
    ],
  },
  {
    titre: t('Gestion'),
    icone: BarChart3,
    elements: [
      { libelle: t('Dépenses'), chemin: '/depenses', module: 'depenses', icone: Banknote },
      { libelle: t('Rapports'), chemin: '/rapports', module: 'rapports', icone: BarChart3 },
    ],
  },
  {
    titre: t('Administration'),
    icone: Settings,
    elements: [
      { libelle: t('Utilisateurs'), chemin: '/administration/utilisateurs', module: 'administration', icone: UserCog },
      { libelle: t('Référentiels'), chemin: '/referentiels', module: 'administration', icone: Library },
      { libelle: t('Paramètres'), chemin: '/administration/parametres', module: 'administration', icone: Settings },
      { libelle: t('Données'), chemin: '/administration/donnees', module: 'administration', icone: Database },
    ],
  },
  // Le guide d'utilisation, accessible à tous, en dernier : une aide toujours à portée de main.
  { elements: [{ libelle: t('Guide'), chemin: '/guide', module: 'tableau_de_bord', icone: BookOpen }] },
]

export { Building2, FileText }
