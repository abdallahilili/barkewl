import { texteCopyright } from '../utilitaires/copyright'

/** Copyright de l'éditeur, en tout petit tout en bas d'un document (reçu, facture, rapport…). */
export function PiedLogiciel() {
  const texte = texteCopyright()
  if (!texte) return null
  return <p className="pied-logiciel" dir="auto">{texte}</p>
}
