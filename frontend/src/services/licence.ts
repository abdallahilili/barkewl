import type { Role } from '../types'
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
  version?: string
  client?: string | null
  plan?: 'MENSUEL' | 'ANNUEL' | 'ESSAI' | null
  offre?: 'ESSENTIEL' | 'PRO' | 'RESEAU' | null
  /** Ce que débloque l'offre de la licence (rôles, nombre de comptes, fonctions). */
  offre_details?: { code: string; nom: string; max_utilisateurs: number | null; roles: Role[]; fonctions: string[] }
  debut?: string | null
  fin?: string | null
}

export const NOM_LOGICIEL = 'RAQEEM PHARMA'
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

/** Assistance technique RAQEEM PHARMA sur WhatsApp (Mauritanie, +222). */
export const ASSISTANCE_WHATSAPP = '22246635996'
export const ASSISTANCE_AFFICHAGE = '+222 46 63 59 96'

export function lienAssistanceWhatsapp(pharmacie?: string) {
  const texte = `Bonjour, j'ai besoin d'aide sur ${NOM_LOGICIEL}${pharmacie ? ` (${pharmacie})` : ''}.`
  return `https://wa.me/${ASSISTANCE_WHATSAPP}?text=${encodeURIComponent(texte)}`
}

/** Numéros de téléphone et e-mail de l'assistance, affichés dans le menu de la page de connexion. */
export const ASSISTANCE_TELEPHONES = [
  { affichage: '+222 32 10 33 54', lien: '+22232103354' },
  { affichage: '+222 31 17 70 08', lien: '+22231177008' },
]
export const ASSISTANCE_EMAIL = 'contact@rawafid.mr'
