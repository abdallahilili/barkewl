import type { Langue } from '../i18n'
import { tVers } from '../i18n'
import type { BonCommande } from '../types'
import { telechargerBlob } from './exports'
import { texteCopyright } from './copyright'

/** Langue d'un bon de commande imprimé ou exporté : français, arabe, ou les deux (« Français / العربية »). */
export type LangueBon = Langue | 'bilingue'

/** Libellé dans la langue du document ; en bilingue : « français / arabe » (une seule langue si pas de traduction). */
export function libelleBon(langue: LangueBon, texte: string): string {
  if (langue !== 'bilingue') return tVers(langue, texte)
  const fr = tVers('fr', texte)
  const ar = tVers('ar', texte)
  return fr === ar ? fr : `${fr} / ${ar}`
}

export const nomFichierBon = (bon: BonCommande) => `bon-de-commande-${bon.reference.toLowerCase()}`

export const designationLigne = (l: NonNullable<BonCommande['lignes']>[number]) =>
  [l.medicament_nom ?? l.designation, l.medicament_dosage].filter(Boolean).join(' ')

/** Excel (.xlsx) du bon de commande : en-tête de la pharmacie, fournisseur, lignes et total. */
export async function exporterBonCommandeExcel(bon: BonCommande, langue: LangueBon, avecPrix: boolean) {
  const { default: ExcelJS } = await import('exceljs')
  const arabe = langue === 'ar'
  const l = (texte: string) => libelleBon(langue, texte)
  const pharmacie = bon.pharmacie
  const classeur = new ExcelJS.Workbook()
  classeur.creator = pharmacie?.nom ?? ''
  classeur.created = new Date()
  const feuille = classeur.addWorksheet(bon.reference.slice(0, 31).replace(/[[\]*?/\\:]/g, ' '))
  const colonnes = avecPrix ? 5 : 3
  feuille.columns = [
    { width: 6 }, { width: 48 }, { width: 18 }, ...(avecPrix ? [{ width: 20 }, { width: 20 }] : []),
  ]
  feuille.views = [{ rightToLeft: arabe }]
  const fusionner = (texte: string, style: { bold?: boolean; size?: number } = {}) => {
    const ligne = feuille.addRow([texte])
    feuille.mergeCells(ligne.number, 1, ligne.number, colonnes)
    ligne.getCell(1).font = style
    ligne.getCell(1).alignment = { horizontal: 'center' }
    return ligne
  }
  const info = (libelle: string, valeur: string) => {
    if (!valeur) return
    const ligne = feuille.addRow([libelle, '', valeur])
    feuille.mergeCells(ligne.number, 1, ligne.number, 2)
    feuille.mergeCells(ligne.number, 3, ligne.number, colonnes)
    ligne.getCell(1).font = { bold: true }
    ligne.getCell(3).alignment = { horizontal: arabe ? 'right' : 'left' }
  }

  if (pharmacie?.nom) fusionner([pharmacie.nom, langue !== 'fr' ? pharmacie.nom_ar : ''].filter(Boolean).join(' — '), { bold: true, size: 14 })
  const contacts = [pharmacie?.adresse, pharmacie?.telephone].filter(Boolean).join('  ·  ')
  if (contacts) fusionner(contacts, { size: 9 })
  fusionner(`${l('Bon de commande')} ${bon.reference}`, { bold: true, size: 13 })
  feuille.addRow([])
  info(l('Fournisseur :'), bon.fournisseur_nom)
  info(l('Téléphone :'), bon.fournisseur_telephone ?? '')
  info(l('Adresse :'), bon.fournisseur_adresse ?? '')
  info(l('Date :'), bon.date_commande)
  info(l('Livraison prévue :'), bon.date_livraison_prevue ?? '')
  info(l('Livrer à :'), bon.depot_nom)
  feuille.addRow([])

  const entete = feuille.addRow([
    l('N°'), l('Désignation'), l('Quantité (boîtes)'), ...(avecPrix ? [l('Prix d\'achat estimé'), l('Total')] : []),
  ])
  entete.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  entete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
  entete.alignment = { vertical: 'middle', horizontal: 'center' }

  ;(bon.lignes ?? []).forEach((ligne, i) => {
    const r = feuille.addRow([i + 1, designationLigne(ligne), ligne.quantite, ...(avecPrix ? [Number(ligne.prix_achat), Number(ligne.total ?? ligne.quantite * ligne.prix_achat)] : [])])
    r.getCell(1).alignment = { horizontal: 'center' }
    r.getCell(3).alignment = { horizontal: 'center' }
    if (avecPrix) { r.getCell(4).numFmt = '#,##0.00'; r.getCell(5).numFmt = '#,##0.00' }
  })

  if (avecPrix) {
    const total = feuille.addRow(['', l('TOTAL'), '', '', Number(bon.total)])
    total.font = { bold: true }
    total.getCell(5).numFmt = '#,##0.00'
    total.getCell(5).border = { top: { style: 'thin' } }
  }
  if (bon.note) { feuille.addRow([]); info(l('Note :'), bon.note) }

  const copyright = texteCopyright()
  if (copyright) feuille.headerFooter = { oddFooter: `&C&7${copyright}` }
  const buffer = await classeur.xlsx.writeBuffer()
  telechargerBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${nomFichierBon(bon)}.xlsx`,
  )
}
