/**
 * Interface bilingue français / arabe.
 *
 * Les textes sont écrits en français dans le code et passés à t() : t('Nouvelle vente').
 * En arabe, t() renvoie la traduction du dictionnaire ar.ts (le texte français reste affiché
 * si une traduction manque, jamais une clé technique).
 * Paramètres : t('Stock disponible : {n}.', { n: 12 }).
 *
 * La langue est choisie AVANT le premier rendu (lue dans le navigateur) : changer de langue recharge
 * la page, ce qui garantit que tous les textes, y compris les menus et listes définis au chargement,
 * sont dans la bonne langue.
 */
import { AR } from './ar'

export type Langue = 'fr' | 'ar'

const CLE_STOCKAGE = 'raqeem_langue'

function lireLangueEnregistree(): Langue {
  try {
    const valeur = localStorage.getItem(CLE_STOCKAGE)
    if (valeur === 'fr' || valeur === 'ar') return valeur
  } catch {
    // Navigateur sans stockage local : langue par défaut.
  }
  return 'fr'
}

let langue: Langue = lireLangueEnregistree()

export const langueCourante = () => langue
export const estArabe = () => langue === 'ar'

/** Traduit un texte écrit en français ; {nom} est remplacé par la valeur correspondante de `parametres`. */
export function t(texte: string, parametres?: Record<string, string | number | null | undefined>): string {
  let resultat = langue === 'ar' ? AR[texte] ?? texte : texte
  if (parametres) {
    for (const [cle, valeur] of Object.entries(parametres)) resultat = resultat.split(`{${cle}}`).join(String(valeur ?? ''))
  }
  return resultat
}

/** Applique la langue au document : sens de lecture (rtl/ltr) et attribut lang. */
export function appliquerLangueAuDocument() {
  document.documentElement.lang = langue
  document.documentElement.dir = langue === 'ar' ? 'rtl' : 'ltr'
}

export function changerLangue(nouvelle: Langue) {
  if (nouvelle === langue) return
  try {
    localStorage.setItem(CLE_STOCKAGE, nouvelle)
  } catch {
    // Sans stockage local, le choix ne survit pas au rechargement : on applique quand même.
  }
  langue = nouvelle
  window.location.reload()
}
