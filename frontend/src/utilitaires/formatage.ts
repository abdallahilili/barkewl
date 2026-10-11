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

const formatNombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const formatMontant = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const formaterNombre = (n: number | null | undefined) => (n == null ? '—' : formatNombre.format(Number(n)))
export const formaterMontant = (n: number | string | null | undefined) =>
  n == null || n === '' ? '—' : `${formatMontant.format(Number(n))} ${devise}`

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

export const libelleRole = (role: string) =>
  ({ ADMIN: 'Administrateur', CAISSIER: 'Caissier', MAGASINIER: 'Magasinier' } as Record<string, string>)[role] ?? role

export const libelleStatut = (statut: string) =>
  ({
    BROUILLON: 'Brouillon', VALIDE: 'Validé', ANNULE: 'Annulé', VALIDEE: 'Validée', ANNULEE: 'Annulée',
    OUVERTE: 'Ouverte', FERMEE: 'Clôturée',
  } as Record<string, string>)[statut] ?? statut

export const libelleEtatStock = (etat: string) =>
  ({
    DISPONIBLE: 'Disponible', STOCK_FAIBLE: 'Stock faible', RUPTURE: 'Rupture', EPUISE: 'Lot épuisé',
    BIENTOT_PERIME: 'Bientôt périmé', PERIME: 'Périmé',
  } as Record<string, string>)[etat] ?? etat
