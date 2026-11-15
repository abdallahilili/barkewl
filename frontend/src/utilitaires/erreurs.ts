import { isAxiosError } from 'axios'
import { t, traduireServeur } from '../i18n'

/** Transforme une erreur de l'API (format Django REST) en message lisible en français. */
export function extraireErreur(erreur: unknown): string {
  if (isAxiosError(erreur)) {
    if (!erreur.response) return t('Impossible de joindre le serveur. Vérifiez la connexion et réessayez.')
    const donnees = erreur.response.data
    if (typeof donnees === 'string') return erreur.response.status >= 500 ? t('Erreur du serveur. Réessayez plus tard.') : traduireServeur(donnees)
    if (donnees?.detail) return traduireServeur(String(donnees.detail))
    if (donnees && typeof donnees === 'object') {
      const messages = aplatir(donnees)
      if (messages.length) return messages.join(' ')
    }
    if (erreur.response.status === 403) return t("Vous n'avez pas le droit d'effectuer cette opération.")
    if (erreur.response.status === 404) return t('Élément introuvable.')
    if (erreur.response.status >= 500) return t('Erreur du serveur. Réessayez plus tard.')
  }
  return t('Une erreur est survenue.')
}

function aplatir(valeur: unknown, prefixe = ''): string[] {
  if (Array.isArray(valeur)) {
    return valeur.flatMap((v, i) => (typeof v === 'string' ? [prefixe ? `${prefixe} : ${traduireServeur(v)}` : traduireServeur(v)] : aplatir(v, prefixe ? t('{champ} (ligne {n})', { champ: prefixe, n: i + 1 }) : '')))
  }
  if (valeur && typeof valeur === 'object') {
    return Object.entries(valeur as Record<string, unknown>).flatMap(([cle, v]) => aplatir(v, cle === 'non_field_errors' ? '' : cle))
  }
  if (typeof valeur === 'string') return [prefixe ? `${prefixe} : ${traduireServeur(valeur)}` : traduireServeur(valeur)]
  return []
}

/** Erreurs par champ, pour afficher le message sous le champ concerné. */
export function erreursParChamp(erreur: unknown): Record<string, string> {
  if (isAxiosError(erreur) && erreur.response?.data && typeof erreur.response.data === 'object') {
    const resultat: Record<string, string> = {}
    for (const [cle, v] of Object.entries(erreur.response.data as Record<string, unknown>)) {
      if (Array.isArray(v) && typeof v[0] === 'string') resultat[cle] = traduireServeur(v[0])
    }
    return resultat
  }
  return {}
}
