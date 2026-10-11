import type { Utilisateur } from '../types'
import {
  api, definirJetonAcces, definirJetonRafraichissement, lireJetonRafraichissement, rafraichirJeton,
} from './api'

export async function connexion(identifiant: string, mot_de_passe: string): Promise<Utilisateur> {
  const { data } = await api.post('/auth/connexion/', { identifiant, mot_de_passe })
  definirJetonAcces(data.acces)
  definirJetonRafraichissement(data.rafraichissement)
  return data.utilisateur
}

export function deconnexion() {
  definirJetonAcces(null)
  definirJetonRafraichissement(null)
}

/** Restaure la session au chargement de la page grâce au jeton de rafraîchissement. */
export async function restaurerSession(): Promise<Utilisateur | null> {
  if (!lireJetonRafraichissement()) return null
  try {
    await rafraichirJeton()
    const { data } = await api.get('/auth/moi/')
    return data
  } catch {
    deconnexion()
    return null
  }
}

export async function changerMotDePasse(ancien_mot_de_passe: string, nouveau_mot_de_passe: string) {
  await api.post('/auth/changer-mot-de-passe/', { ancien_mot_de_passe, nouveau_mot_de_passe })
}
