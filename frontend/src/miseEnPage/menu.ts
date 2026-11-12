import {
  Archive, ArrowLeftRight, BarChart3, Boxes, Building2, ClipboardCheck, ClipboardList, FileText, History, LayoutDashboard,
  LucideIcon, Package, Pill, Receipt, Settings, ShoppingCart, Store, Tags, Truck, Users, UserCog, Wallet, PackagePlus, PackageMinus, Layers,
} from 'lucide-react'

import { t } from '../i18n'
export interface ElementMenu { libelle: string; chemin: string; module: string; icone: LucideIcon }
export interface GroupeMenu { titre?: string; elements: ElementMenu[] }

export const menu: GroupeMenu[] = [
  { elements: [{ libelle: t('Tableau de bord'), chemin: '/', module: 'tableau_de_bord', icone: LayoutDashboard }] },
  {
    titre: t('Ventes'),
    elements: [
      { libelle: t('Nouvelle vente'), chemin: '/ventes/nouvelle', module: 'ventes', icone: ShoppingCart },
      { libelle: t('Historique des ventes'), chemin: '/ventes', module: 'ventes', icone: History },
      { libelle: t('Reçus'), chemin: '/recus', module: 'ventes', icone: Receipt },
      { libelle: t('Clients'), chemin: '/clients', module: 'ventes', icone: Users },
    ],
  },
  {
    titre: t('Stock'),
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
    elements: [
      { libelle: t('Médicaments'), chemin: '/medicaments', module: 'medicaments', icone: Pill },
      { libelle: t('Catégories'), chemin: '/categories', module: 'medicaments', icone: Tags },
      { libelle: t('Lots'), chemin: '/lots', module: 'lots', icone: Layers },
    ],
  },
  {
    titre: t('Achats'),
    elements: [
      { libelle: t('Achats'), chemin: '/achats', module: 'achats', icone: Package },
      { libelle: t('Fournisseurs'), chemin: '/fournisseurs', module: 'achats', icone: Truck },
    ],
  },
  {
    titre: t('Facturation'),
    elements: [
      { libelle: t('Devis / BL / Factures'), chemin: '/facturation', module: 'facturation', icone: FileText },
    ],
  },
  {
    titre: t('Caisse'),
    elements: [
      { libelle: t('Session actuelle'), chemin: '/caisse', module: 'caisse', icone: Wallet },
      { libelle: t('Historique des sessions'), chemin: '/caisse/historique', module: 'caisse', icone: Archive },
    ],
  },
  {
    titre: t('Gestion'),
    elements: [
      { libelle: t('Dépôts'), chemin: '/depots', module: 'depots', icone: Store },
      { libelle: t('Rapports'), chemin: '/rapports', module: 'rapports', icone: BarChart3 },
    ],
  },
  {
    titre: t('Administration'),
    elements: [
      { libelle: t('Utilisateurs'), chemin: '/administration/utilisateurs', module: 'administration', icone: UserCog },
      { libelle: t('Paramètres'), chemin: '/administration/parametres', module: 'administration', icone: Settings },
    ],
  },
]

export { Building2, FileText }
