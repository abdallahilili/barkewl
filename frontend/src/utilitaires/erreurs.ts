import { isAxiosError } from 'axios'

/** Transforme une erreur de l'API (format Django REST) en message lisible en français. */
export function extraireErreur(erreur: unknown): string {
  if (isAxiosError(erreur)) {
    if (!erreur.response) return 'Impossible de joindre le serveur. Vérifiez la connexion et réessayez.'
    const donnees = erreur.response.data
    if (typeof donnees === 'string') return erreur.response.status >= 500 ? 'Erreur du serveur. Réessayez plus tard.' : donnees
    if (donnees?.detail) return String(donnees.detail)
    if (donnees && typeof donnees === 'object') {
      const messages = aplatir(donnees)
      if (messages.length) return messages.join(' ')
    }
    if (erreur.response.status === 403) return "Vous n'avez pas le droit d'effectuer cette opération."
    if (erreur.response.status === 404) return 'Élément introuvable.'
    if (erreur.response.status >= 500) return 'Erreur du serveur. Réessayez plus tard.'
  }
  return 'Une erreur est survenue.'
}

function aplatir(valeur: unknown, prefixe = ''): string[] {
  if (Array.isArray(valeur)) {
    return valeur.flatMap((v, i) => (typeof v === 'string' ? [prefixe ? `${prefixe} : ${v}` : v] : aplatir(v, prefixe ? `${prefixe} (ligne ${i + 1})` : '')))
  }
  if (valeur && typeof valeur === 'object') {
    return Object.entries(valeur as Record<string, unknown>).flatMap(([cle, v]) => aplatir(v, cle === 'non_field_errors' ? '' : cle))
  }
  if (typeof valeur === 'string') return [prefixe ? `${prefixe} : ${valeur}` : valeur]
  return []
}

/** Erreurs par champ, pour afficher le message sous le champ concerné. */
export function erreursParChamp(erreur: unknown): Record<string, string> {
  if (isAxiosError(erreur) && erreur.response?.data && typeof erreur.response.data === 'object') {
    const resultat: Record<string, string> = {}
    for (const [cle, v] of Object.entries(erreur.response.data as Record<string, unknown>)) {
      if (Array.isArray(v) && typeof v[0] === 'string') resultat[cle] = v[0]
    }
    return resultat
  }
  return {}
}
