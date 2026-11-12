import { api } from './api'

export type StatutLicence = 'ACTIVE' | 'EXPIRE_BIENTOT' | 'GRACE' | 'EXPIREE' | 'NON_ACTIVEE' | 'INVALIDE' | 'HORLOGE'

export interface Editeur { nom: string; slogan: string; telephone: string; whatsapp: string; email: string; site: string }

export interface EtatLicence {
  statut: StatutLicence
  lecture_seule: boolean
  message: string
  empreinte: string
  editeur: Editeur
  jours_restants: number | null
  client?: string | null
  plan?: 'MENSUEL' | 'ANNUEL' | 'ESSAI' | null
  debut?: string | null
  fin?: string | null
}

export const NOM_LOGICIEL = 'Raqim'
export const EDITEUR_PAR_DEFAUT = 'Rawafid Digital Services'

/** Événement envoyé après une activation, pour que le bandeau se mette à jour sans recharger la page. */
export const EVENEMENT_LICENCE = 'licence-modifiee'

export const lireLicence = () => api.get<EtatLicence>('/licence/').then((r) => r.data)

/** Lien WhatsApp vers l'éditeur avec le code du PC déjà écrit (demande ou renouvellement de licence). */
export function lienWhatsappLicence(etat: EtatLicence) {
  if (!etat.editeur.whatsapp) return null
  const texte = `Bonjour ${etat.editeur.nom}, je souhaite ${etat.statut === 'NON_ACTIVEE' ? 'activer' : 'renouveler'} ma licence ${NOM_LOGICIEL}. Code du PC : ${etat.empreinte}`
  return `https://wa.me/${etat.editeur.whatsapp}?text=${encodeURIComponent(texte)}`
}
