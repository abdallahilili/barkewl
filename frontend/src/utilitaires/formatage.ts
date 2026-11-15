
import { estArabe, t } from '../i18n'
let devise = 'MRU'
export const definirDevise = (valeur: string) => { devise = valeur || 'MRU' }
export const lireDevise = () => devise

let rayonnagesActifs = false
export const definirGestionRayonnages = (active: boolean) => { rayonnagesActifs = active }
export const gestionRayonnagesActive = () => rayonnagesActifs

let nomPharmacie = 'PHARMACIE'
export const definirNomPharmacie = (valeur: string) => { nomPharmacie = valeur || 'PHARMACIE' }
export const lireNomPharmacie = () => nomPharmacie

let logoPharmacie = ''
export const definirLogoPharmacie = (valeur: string) => { logoPharmacie = valeur || '' }
export const lireLogoPharmacie = () => logoPharmacie

let adressePharmacie = ''
export const definirAdressePharmacie = (valeur: string) => { adressePharmacie = valeur || '' }
export const lireAdressePharmacie = () => adressePharmacie

let telephonePharmacie = ''
export const definirTelephonePharmacie = (valeur: string) => { telephonePharmacie = valeur || '' }
export const lireTelephonePharmacie = () => telephonePharmacie

// Copyright de l'éditeur en bas des documents : affiché tant que le paramètre n'est pas désactivé.
let copyrightDocuments = true
export const definirCopyrightDocuments = (valeur: string | undefined) => { copyrightDocuments = valeur !== '0' }
export const copyrightDocumentsAffiche = () => copyrightDocuments

const formatNombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const formatMontant = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** En arabe (lecture de droite à gauche), un montant négatif est isolé : sinon le signe « - » passe de l'autre côté. */
const isolerNegatif = (texte: string) => (estArabe() && /^[-−]/.test(texte) ? `\u2066${texte}\u2069` : texte)

export const formaterNombre = (n: number | null | undefined) => (n == null ? '—' : isolerNegatif(formatNombre.format(Number(n))))
export const formaterMontant = (n: number | string | null | undefined) =>
  n == null || n === '' ? '—' : isolerNegatif(`${formatMontant.format(Number(n))} ${devise}`)

export function formaterDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formaterDateHeure(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0')

/** Format yyyy/mm/dd, utilisé pour les exports (CSV/PDF) afin de rester trié correctement. */
export function formaterDateExport(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return `${d.getFullYear()}/${deuxChiffres(d.getMonth() + 1)}/${deuxChiffres(d.getDate())}`
}

/** Format yyyy/mm/dd hh:mm, utilisé pour les exports (CSV/PDF) afin de rester trié correctement. */
export function formaterDateHeureExport(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${formaterDateExport(iso)} ${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`
}

export const aujourdhui = () => new Date().toISOString().slice(0, 10)
export const ilYaJours = (jours: number) => {
  const d = new Date()
  d.setDate(d.getDate() - jours)
  return d.toISOString().slice(0, 10)
}
export const premierJourMois = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
export const premierJourAnnee = () => { const d = new Date(); d.setMonth(0, 1); return d.toISOString().slice(0, 10) }

export const libelleRole = (role: string) =>
  t(({ ADMIN: 'Propriétaire', PHARMACIEN: 'Pharmacien', CAISSIER: 'Vendeur', MAGASINIER: 'Magasinier' } as Record<string, string>)[role] ?? role)

export const libelleStatut = (statut: string) =>
  ({
    BROUILLON: 'Brouillon', VALIDE: 'Validé', ANNULE: 'Annulé', VALIDEE: 'Validée', ANNULEE: 'Annulée',
    OUVERTE: 'Ouverte', FERMEE: 'Clôturée',
  } as Record<string, string>)[statut] ? t(({
    BROUILLON: 'Brouillon', VALIDE: 'Validé', ANNULE: 'Annulé', VALIDEE: 'Validée', ANNULEE: 'Annulée',
    OUVERTE: 'Ouverte', FERMEE: 'Clôturée',
  } as Record<string, string>)[statut]) : statut

/** Libellé d'un type de mouvement (stock ou caisse) dans la langue de l'interface, à partir de son code. */
const TYPES_MOUVEMENT: Record<string, string> = {
  ENTREE: 'Entrée', SORTIE: 'Sortie', VENTE: 'Vente', RETOUR: 'Retour', TRANSFERT_ENTREE: 'Transfert (entrée)',
  TRANSFERT_SORTIE: 'Transfert (sortie)', INVENTAIRE: 'Inventaire', AJUSTEMENT: 'Ajustement', PERTE: 'Perte',
  PEREMPTION: 'Péremption', ENDOMMAGE: 'Produit endommagé', CONSOMMATION_INTERNE: 'Consommation interne',
  REMBOURSEMENT: 'Remboursement', ENTREE_MANUELLE: 'Entrée manuelle', SORTIE_MANUELLE: 'Sortie manuelle',
}
export const libelleTypeMouvement = (code: string, parDefaut?: string) =>
  TYPES_MOUVEMENT[code] ? t(TYPES_MOUVEMENT[code]) : parDefaut ?? code

/** Libellés du journal d'audit (action et objet), à partir des codes enregistrés par le serveur. */
const ACTIONS_AUDIT: Record<string, string> = {
  CREATION: 'Création', MODIFICATION: 'Modification', VALIDATION: 'Validation', PAIEMENT: 'Paiement', ANNULATION: 'Annulation',
  OUVERTURE: 'Ouverture', CLOTURE: 'Clôture', SAUVEGARDE: 'Sauvegarde', TELECHARGEMENT: 'Téléchargement', ACTIVATION: 'Activation',
}
const OBJETS_AUDIT: Record<string, string> = {
  Achat: 'Achat', SessionCaisse: 'Session de caisse', DocumentVente: 'Devis / BL / Facture', Parametre: 'Paramètre', Medicament: 'Médicament',
  Transfert: 'Transfert', Inventaire: 'Inventaire', Utilisateur: 'Utilisateur', Vente: 'Vente', Licence: 'Licence', Client: 'Client',
  Fournisseur: 'Fournisseur', Depot: 'Dépôt', Categorie: 'Catégorie', Forme: 'Forme', Dosage: 'Dosage', Caisse: 'Caisse', ModePaiement: 'Mode de paiement',
  PaiementFournisseur: 'Paiement fournisseur', 'Base de données': 'Base de données',
}
export const libelleActionAudit = (code: string) => (ACTIONS_AUDIT[code] ? t(ACTIONS_AUDIT[code]) : code)
export const libelleObjetAudit = (code: string) => (OBJETS_AUDIT[code] ? t(OBJETS_AUDIT[code]) : code)

export const libelleEtatStock = (etat: string) =>
  ({
    DISPONIBLE: 'Disponible', STOCK_FAIBLE: 'Stock faible', RUPTURE: 'Rupture', EPUISE: 'Lot épuisé',
    BIENTOT_PERIME: 'Bientôt périmé', PERIME: 'Périmé',
  } as Record<string, string>)[etat] ? t(({
    DISPONIBLE: 'Disponible', STOCK_FAIBLE: 'Stock faible', RUPTURE: 'Rupture', EPUISE: 'Lot épuisé',
    BIENTOT_PERIME: 'Bientôt périmé', PERIME: 'Périmé',
  } as Record<string, string>)[etat]) : etat
