import { tVers } from '../i18n'

const sansDeuxPoints = (texte: string) => texte.replace(/\s*:\s*$/, '')

/** Libellé bilingue sur une seule ligne, « Français / العربية », pour les documents toujours imprimés dans les deux
 * langues (le reçu de caisse). Les deux points ne sont écrits qu'une fois, à la fin ; l'arabe est un peu plus grand.
 * `fin` s'ajoute à chaque langue (numéro : « 1 ») ; s'il se termine par « : », les deux points sont ajoutés à la fin.
 * Sans traduction arabe, seul le français est affiché. */
export function Bilingue({ texte, fin = '' }: { texte: string; fin?: string }) {
  const deuxPoints = /:\s*$/.test(texte) || /:\s*$/.test(fin) ? ' :' : ''
  const suffixe = sansDeuxPoints(fin)
  const fr = sansDeuxPoints(tVers('fr', texte)) + suffixe
  const ar = sansDeuxPoints(tVers('ar', texte)) + suffixe
  if (ar === fr) return <>{fr + deuxPoints}</>
  return (
    <span className="bi">
      <span dir="ltr" lang="fr">{fr}</span>
      {' / '}
      <span className="bi-ar" dir="rtl" lang="ar">{ar}</span>
      {deuxPoints}
    </span>
  )
}
