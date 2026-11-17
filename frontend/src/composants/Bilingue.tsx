import { tVers } from '../i18n'
import type { LangueRecu } from '../types'

const sansDeuxPoints = (texte: string) => texte.replace(/\s*:\s*$/, '')

/** Libellé d'un document imprimé : « Français / العربية » sur une seule ligne (`langue` = « bilingue », le réglage
 * d'origine du reçu), ou seulement en français (`fr`) ou en arabe (`ar`).
 * Les deux points ne sont écrits qu'une fois, à la fin ; l'arabe est un peu plus grand.
 * `fin` s'ajoute à chaque langue (numéro : « 1 ») ; s'il se termine par « : », les deux points sont ajoutés à la fin.
 * Sans traduction arabe, seul le français est affiché. */
export function Bilingue({ texte, fin = '', langue = 'bilingue' }: { texte: string; fin?: string; langue?: LangueRecu }) {
  const deuxPoints = /:\s*$/.test(texte) || /:\s*$/.test(fin) ? ' :' : ''
  const suffixe = sansDeuxPoints(fin)
  const fr = sansDeuxPoints(tVers('fr', texte)) + suffixe
  const ar = sansDeuxPoints(tVers('ar', texte)) + suffixe
  if (langue === 'fr' || ar === fr) return <>{fr + deuxPoints}</>
  if (langue === 'ar') return <span className="bi-ar" dir="rtl" lang="ar">{ar + deuxPoints}</span>
  return (
    <span className="bi">
      <span dir="ltr" lang="fr">{fr}</span>
      {' / '}
      <span className="bi-ar" dir="rtl" lang="ar">{ar}</span>
      {deuxPoints}
    </span>
  )
}
