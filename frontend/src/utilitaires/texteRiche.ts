/** Texte riche des messages de pied de page : un petit sous-ensemble de HTML
 * (gras, italique, souligné, tailles et polices, retours à la ligne), nettoyé avant
 * affichage pour ne jamais exécuter de code. Les anciens messages en texte brut
 * restent valides : leurs retours à la ligne sont conservés. */

const BALISES_AUTORISEES = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P', 'SPAN', 'FONT'])
const STYLES_AUTORISES = new Set(['font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'color'])

function nettoyerNoeud(noeud: Node, doc: Document): Node | null {
  if (noeud.nodeType === Node.TEXT_NODE) return doc.createTextNode(noeud.textContent ?? '')
  if (noeud.nodeType !== Node.ELEMENT_NODE) return null
  const element = noeud as HTMLElement
  if (!BALISES_AUTORISEES.has(element.tagName)) {
    // Balise inconnue : on garde son texte (jamais la balise).
    const fragment = doc.createDocumentFragment()
    element.childNodes.forEach((enfant) => {
      const propre = nettoyerNoeud(enfant, doc)
      if (propre) fragment.appendChild(propre)
    })
    return fragment
  }
  const copie = doc.createElement(element.tagName.toLowerCase())
  const styles = element.style
  const gardes: string[] = []
  for (let i = 0; i < styles.length; i++) {
    const nom = styles[i]
    const valeur = styles.getPropertyValue(nom)
    if (STYLES_AUTORISES.has(nom) && !/url\s*\(|expression|javascript/i.test(valeur)) gardes.push(`${nom}: ${valeur}`)
  }
  if (gardes.length) copie.setAttribute('style', gardes.join('; '))
  element.childNodes.forEach((enfant) => {
    const propre = nettoyerNoeud(enfant, doc)
    if (propre) copie.appendChild(propre)
  })
  return copie
}

/** Renvoie du HTML sûr pour afficher `texte` (texte brut ou HTML produit par l'éditeur). */
export function htmlSur(texte: string): string {
  if (!texte) return ''
  const brut = /<[a-z][\s\S]*>/i.test(texte)
    ? texte
    : texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
  const doc = new DOMParser().parseFromString(brut, 'text/html')
  const sortie = document.createElement('div')
  doc.body.childNodes.forEach((enfant) => {
    const propre = nettoyerNoeud(enfant, document)
    if (propre) sortie.appendChild(propre)
  })
  return sortie.innerHTML
}

/** Vrai si le texte ne contient rien d'imprimable (vide ou balises vides). */
export function texteVide(texte: string | null | undefined): boolean {
  return htmlSur(texte ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === ''
}
