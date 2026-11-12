export type Role = 'ADMIN' | 'PHARMACIEN' | 'CAISSIER' | 'MAGASINIER'

export interface Utilisateur {
  id: number
  identifiant: string
  nom: string
  prenom: string
  nom_complet: string
  email: string
  telephone: string
  role: Role
  actif: boolean
  modules: string[]
  pin_defini?: boolean
}

export interface ReponsePaginee<T> {
  total: number
  page: number
  taille_page: number
  nombre_pages: number
  resultats: T[]
}

export interface Depot { id: number; nom: string; description: string; actif: boolean }
export interface Categorie { id: number; nom: string; description: string }
export interface Fournisseur { id: number; nom: string; telephone: string; adresse: string; email: string; actif: boolean; solde: number }
export interface Client { id: number; nom: string; telephone: string; adresse: string; notes: string; actif: boolean }
export interface ModePaiement { id: number; nom: string; type: 'ESPECES' | 'MOBILE' | 'CARTE' | 'VIREMENT' | 'AUTRE'; actif: boolean }
export interface Caisse { id: number; nom: string; depot: number; depot_nom: string; active: boolean }

export interface Medicament {
  id: number
  nom: string
  nom_generique: string
  code: string
  code_barre: string | null
  categorie: number | null
  categorie_nom: string | null
  forme: string
  dosage: string
  unite: string
  laboratoire: string
  emplacement: string
  prix_achat?: number
  prix_vente: number
  /** Conditionnement : le stock est compté en unités (comprimés…) ; 1 = vente à la boîte uniquement. */
  unites_par_boite: number
  unites_par_plaquette: number | null
  nom_unite_detail: string
  prix_vente_plaquette: number | null
  prix_vente_unite: number | null
  prix_plaquette_effectif: number | null
  prix_unite_effectif: number | null
  stock_texte: string | null
  stock_minimum: number
  actif: boolean
  stock_total: number
  stock_depot?: number | null
  frequence_vente: number
}

export interface Lot {
  id: number
  medicament: number
  medicament_nom: string
  numero_lot: string
  date_fabrication: string | null
  date_peremption: string
  prix_achat?: number
  prix_vente: number | null
  quantite_initiale: number
  quantite_actuelle: number
  quantite_texte: string | null
  unites_par_boite: number
  jours_restants: number
  perime: boolean
}

export type EtatStock = 'DISPONIBLE' | 'STOCK_FAIBLE' | 'RUPTURE' | 'EPUISE' | 'BIENTOT_PERIME' | 'PERIME'

export interface LigneStock {
  id: number
  medicament_id: number
  medicament: string
  dosage: string
  forme: string
  categorie: string | null
  lot: number
  numero_lot: string
  depot: number
  depot_nom: string
  quantite: number
  quantite_texte: string
  unites_par_boite: number
  prix_achat?: number
  prix_vente: number
  valeur_stock?: number
  date_peremption: string
  jours_restants: number
  etat: EtatStock
}

export interface SyntheseStock {
  valeur_totale: number
  nombre_medicaments: number
  nombre_lots: number
  nombre_ruptures: number
  nombre_stock_faible: number
  nombre_bientot_perimes: number
  nombre_perimes: number
}

export interface MouvementStock {
  id: number
  date_mouvement: string
  utilisateur_nom: string
  medicament: number
  medicament_nom: string
  numero_lot: string
  depot_nom: string
  type_mouvement: string
  type_libelle: string
  quantite: number
  quantite_texte: string
  stock_avant: number
  stock_apres: number
  motif: string
  reference: string
}

export type StatutDocument = 'BROUILLON' | 'VALIDE' | 'ANNULE'

export interface LigneTransfert { id?: number; lot: number; medicament_nom?: string; numero_lot?: string; date_peremption?: string; quantite: number }
export interface Transfert {
  id: number
  reference: string
  date_transfert: string
  utilisateur_nom: string
  depot_source: number
  depot_source_nom: string
  depot_destination: number
  depot_destination_nom: string
  statut: StatutDocument
  note: string
  lignes: LigneTransfert[]
}

export interface LigneInventaire {
  id: number
  lot: number
  medicament_nom: string
  numero_lot: string
  date_peremption: string
  unites_par_boite: number
  quantite_theorique: number
  quantite_physique: number | null
  ecart: number | null
  ecart_applique: number | null
}
export interface Inventaire {
  id: number
  reference: string
  depot: number
  depot_nom: string
  date_creation: string
  utilisateur_nom: string
  statut: StatutDocument
  note: string
  nombre_lignes: number
  nombre_ecarts: number
  lignes?: LigneInventaire[]
}

export interface LigneAchat {
  id?: number
  medicament: number | null
  medicament_nom?: string
  numero_lot: string
  date_fabrication: string | null
  date_peremption: string
  quantite: number
  prix_achat: number
  prix_vente: number | null
  total?: number
}
export interface Achat {
  id: number
  reference: string
  fournisseur: number
  fournisseur_nom: string
  depot: number
  depot_nom: string
  date_achat: string
  reference_facture: string
  statut: StatutDocument
  total: number
  montant_paye: number
  reste_a_payer: number
  note?: string
  date_validation?: string | null
  lignes?: LigneAchat[]
}

export type EtapeDocumentVente = 'DEVIS' | 'BON_LIVRAISON' | 'FACTURE'

export interface LigneDocumentVente {
  id?: number
  medicament: number | null
  medicament_nom?: string
  medicament_prix_achat?: number
  unite?: string
  designation?: string
  quantite_devis: number
  quantite_livree?: number
  prix_unitaire: number
  total?: number
}

export interface PaiementFactureVente {
  id: number
  montant: number
  mode_paiement: number
  mode_paiement_nom: string
  utilisateur_nom: string
  date_paiement: string
}

export interface DocumentVente {
  id: number
  reference: string
  client: number
  client_nom: string
  client_telephone: string
  client_adresse: string
  depot: number
  depot_nom: string
  personnel: number
  personnel_nom: string
  etape: EtapeDocumentVente
  etape_libelle: string
  annule: boolean
  numero_bl: string
  numero_facture: string
  date_devis: string
  date_bl: string | null
  date_facture: string | null
  total: number
  montant_paye: number
  reste_a_payer: number
  note?: string
  lignes?: LigneDocumentVente[]
  paiements?: PaiementFactureVente[]
  pharmacie?: IdentiteDocumentVente
}

export interface ResumeSession {
  nombre_ventes: number
  total_ventes: number
  total_especes: number
  total_autres_paiements: number
  remboursements_especes: number
  entrees_manuelles: number
  sorties_manuelles: number
  montant_attendu: number
}
export interface SessionCaisse {
  id: number
  caissier_nom: string
  caisse: number
  caisse_nom: string
  depot: number
  depot_nom: string
  date_ouverture: string
  date_fermeture: string | null
  montant_initial: number
  montant_attendu: number | null
  montant_reel: number | null
  ecart: number | null
  statut: 'OUVERTE' | 'FERMEE'
  note: string
  resume: ResumeSession
}
export interface MouvementCaisse {
  id: number
  type_mouvement: string
  type_libelle: string
  mode_paiement_nom: string
  montant: number
  date_mouvement: string
  motif: string
  vente_reference: string | null
  utilisateur_nom: string
}

export interface Vente {
  id: number
  reference: string
  date_vente: string
  client_nom: string | null
  caissier_nom: string
  depot_nom: string
  total: number
  statut: 'VALIDEE' | 'ANNULEE'
  modes_paiement: string
  montant_recu?: number | null
  motif_annulation?: string
  annulation_approuvee_par_nom?: string | null
  lignes?: { id: number; medicament_nom: string; numero_lot: string; conditionnement: Conditionnement; conditionnement_libelle: string; quantite: number; prix_unitaire: number; total: number }[]
  paiements?: { id: number; mode_paiement_nom: string; montant: number }[]
}

/** Coordonnées de la pharmacie imprimées en en-tête des reçus et documents de vente. */
export interface IdentiteDocument {
  nom: string
  adresse: string
  telephone: string
  telephone_2?: string
  telephone_3?: string
  whatsapp?: string
  whatsapp_2?: string
  email?: string
  nif?: string
  devise: string
  message: string
  logo: string
  /** Image d'en-tête personnalisée (data URL) ; vide = en-tête par défaut (logo, nom, contacts). */
  entete_image?: string
}

export interface IdentiteDocumentVente extends IdentiteDocument {
  message_devis: string
  message_bl: string
  message_facture: string
  /** Bon de livraison : afficher les colonnes Prix et Total. */
  bl_afficher_prix: boolean
}

export interface Recu {
  id: number
  reference: string
  date_vente: string
  statut: string
  pharmacie: IdentiteDocument
  client: string | null
  caissier: string
  depot: string
  lignes: { medicament: string; dosage: string; conditionnement: Conditionnement; conditionnement_libelle: string; quantite: number; prix_unitaire: number; total: number }[]
  total: number
  paiements: { mode_paiement: string; montant: number }[]
  montant_recu: number | null
  rendu: number | null
}

export interface ResultatCaisse {
  id: number
  nom: string
  nom_generique: string
  dosage: string
  forme: string
  code: string
  code_barre: string | null
  emplacement: string
  prix_vente: number
  stock_disponible: number
  stock_texte: string
  unites_par_boite: number
  conditionnements: OptionConditionnement[]
  prochaine_peremption: string | null
  frequence_vente: number
}

export type Conditionnement = 'BOITE' | 'PLAQUETTE' | 'UNITE'

/** Une façon de vendre un médicament (boîte, plaquette, unité) avec son prix et la quantité vendable. */
export interface OptionConditionnement {
  code: Conditionnement
  libelle: string
  libelle_pluriel: string
  unites: number
  prix: number
  disponible: number
}

export interface Parametre { cle: string; valeur: string; description: string }
