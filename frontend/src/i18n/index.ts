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
import { MESSAGES_SERVEUR } from './serveur'

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

/** En arabe (lecture de droite à gauche), un nombre négatif est isolé : sinon le signe « - » passe de l'autre côté. */
function texteParametrePour(valeur: string | number | null | undefined, langueCible: Langue): string {
  const texte = String(valeur ?? '')
  return langueCible === 'ar' && /^[-−]\d/.test(texte) ? `\u2066${texte}\u2069` : texte
}

/** Traduit un texte écrit en français vers `langueCible`, indépendamment de la langue courante de
 * l'interface (utilisé pour imprimer ou exporter un document dans une langue choisie explicitement). */
export function tVers(langueCible: Langue, texte: string, parametres?: Record<string, string | number | null | undefined>): string {
  let resultat = langueCible === 'ar' ? AR[texte] ?? texte : texte
  if (parametres) {
    for (const [cle, valeur] of Object.entries(parametres)) resultat = resultat.split(`{${cle}}`).join(texteParametrePour(valeur, langueCible))
  }
  return resultat
}

/** Traduit un texte écrit en français ; {nom} est remplacé par la valeur correspondante de `parametres`. */
export function t(texte: string, parametres?: Record<string, string | number | null | undefined>): string {
  return tVers(langue, texte, parametres)
}

/** Les deux langues à la fois, séparées par « / » (français puis arabe) : pour les documents qui
 * doivent toujours être bilingues (le reçu de caisse), quelle que soit la langue courante de l'interface. */
export function tDeux(texte: string, parametres?: Record<string, string | number | null | undefined>): string {
  const fr = tVers('fr', texte, parametres)
  const ar = tVers('ar', texte, parametres)
  return ar === fr ? fr : `${fr} / ${ar}`
}

const echapperRegex = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Messages du serveur avec valeurs variables ({0}, {1}…) : un modèle d'expression régulière par message.
const MODELES_SERVEUR = Object.entries(MESSAGES_SERVEUR)
  .filter(([fr]) => /\{\d+\}/.test(fr))
  .map(([fr, ar]) => ({ regex: new RegExp(`^${echapperRegex(fr).replace(/\\\{\d+\\\}/g, '(.+?)')}$`, 's'), ar }))

/** Traduit un message renvoyé par le serveur (Django), écrit en français, vers la langue de l'interface.
 * Les valeurs variables (noms, quantités, dates) sont conservées ; un message inconnu reste inchangé. */
export function traduireServeur(message: string): string {
  if (langue !== 'ar' || !message) return message
  const exact = MESSAGES_SERVEUR[message]
  if (exact) return exact
  for (const { regex, ar } of MODELES_SERVEUR) {
    const trouve = regex.exec(message)
    if (trouve) return ar.replace(/\{(\d+)\}/g, (_, i) => traduireServeur(trouve[Number(i) + 1] ?? ''))
  }
  return AR[message] ?? message
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
