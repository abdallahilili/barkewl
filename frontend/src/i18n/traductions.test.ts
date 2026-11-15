/**
 * Contrôle des traductions arabes.
 *
 * Les textes de l'interface sont écrits en français et passés à t('…') ; leur traduction est dans ar.ts.
 * Si un texte est ajouté ou modifié dans le code sans mise à jour de ar.ts, l'arabe affiche ce texte en
 * français, sans aucun avertissement. Ce test le détecte et liste les textes à traduire.
 *
 * Limite : seuls les textes écrits directement dans t('…') sont vérifiés (pas t(variable)).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AR } from './ar'

const RACINE = path.resolve(__dirname, '..')

function fichiersSource(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = path.join(dossier, entree.name)
    if (entree.isDirectory()) return entree.name === 'i18n' ? [] : fichiersSource(chemin)
    return /\.tsx?$/.test(entree.name) && !/\.test\.tsx?$/.test(entree.name) ? [chemin] : []
  })
}

/** Textes passés à t('…') ou t("…"), avec le fichier où chacun apparaît la première fois. */
function textesDeLInterface(): Map<string, string> {
  const appel = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g
  const textes = new Map<string, string>()
  for (const fichier of fichiersSource(RACINE)) {
    const contenu = fs.readFileSync(fichier, 'utf8')
    for (const correspondance of contenu.matchAll(appel)) {
      const texte = correspondance[2].replace(/\\(.)/g, '$1')
      if (!textes.has(texte)) textes.set(texte, path.relative(RACINE, fichier))
    }
  }
  return textes
}

const parametres = (texte: string) => [...texte.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('traductions arabes (ar.ts)', () => {
  const textes = textesDeLInterface()

  it("trouve les textes de l'interface", () => {
    expect(textes.size).toBeGreaterThan(500)
  })

  it('chaque texte de l’interface a sa traduction arabe', () => {
    const manquants = [...textes].filter(([texte]) => !(texte in AR)).map(([texte, fichier]) => `${fichier} : ${texte}`)
    expect(manquants, `Textes à traduire dans src/i18n/ar.ts :\n${manquants.join('\n')}`).toEqual([])
  })

  it('les traductions gardent les mêmes {paramètres} que le français', () => {
    const differents = Object.entries(AR)
      .filter(([francais, arabe]) => parametres(francais).join() !== parametres(arabe).join())
      .map(([francais, arabe]) => `${francais}  →  ${arabe}`)
    expect(differents).toEqual([])
  })

  it('aucune traduction vide, et mêmes espaces au début et à la fin que le français', () => {
    // Un morceau de phrase (« · Client : {nom} ») commence par un espace dans les deux langues ;
    // un espace en trop ou en moins décale l'affichage.
    const bords = (texte: string) => [texte.length - texte.trimStart().length, texte.length - texte.trimEnd().length].join()
    const suspectes = Object.entries(AR)
      .filter(([francais, arabe]) => !arabe.trim() || bords(arabe) !== bords(francais))
      .map(([francais, arabe]) => `${francais}  →  «${arabe}»`)
    expect(suspectes).toEqual([])
  })
})
