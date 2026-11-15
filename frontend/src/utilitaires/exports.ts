import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { estArabe, t } from '../i18n'
import { api } from '../services/api'
import type { ReponsePaginee } from '../types'
import {
  formaterDateHeureExport, lireAdressePharmacie, lireLogoPharmacie, lireNomPharmacie, lireTelephonePharmacie,
} from './formatage'

export type LigneExport = (string | number | null | undefined)[]

interface OptionsExportDocument {
  titre: string
  nomFichier: string
  entetes: string[]
  lignes: LigneExport[]
  imprimePar: string
}

/** Les polices standard de jsPDF (WinAnsi) ne rendent pas correctement certains caractères (flèches, tirets longs…). */
function nettoyerPourPdf(valeur: string) {
  return valeur.replace(/→/g, '->').replace(/←/g, '<-').replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
}

function telechargerBlob(blob: Blob, nomFichier: string) {
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(blob)
  lien.download = nomFichier
  lien.click()
  URL.revokeObjectURL(lien.href)
}

export interface ColonneExportable<T> {
  cle: string
  titre: string
  exportRendu?: (ligne: T) => string | number | null
}

export function valeurExport<T>(colonne: ColonneExportable<T>, ligne: T): string | number {
  if (colonne.exportRendu) return colonne.exportRendu(ligne) ?? ''
  const valeur = (ligne as Record<string, unknown>)[colonne.cle]
  return valeur == null || typeof valeur === 'object' ? '' : (valeur as string | number)
}

export function genererNomFichier(titre: string) {
  return titre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'export'
}

export function exporterCsv(nomFichier: string, entetes: string[], lignes: LigneExport[]) {
  const echapper = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const contenu = [entetes, ...lignes].map((l) => l.map(echapper).join(';')).join('\r\n')
  telechargerBlob(new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8;' }), nomFichier)
}

export function exporterPdf(options: OptionsExportDocument) {
  const { titre, nomFichier, entetes, lignes } = options
  // jsPDF ne sait pas dessiner l'arabe (ni la liaison des lettres, ni le sens de lecture) :
  // dès qu'il y a de l'arabe, on passe par l'impression du navigateur (« Enregistrer au format PDF »).
  const ARABE = /[؀-ۿ]/
  if (estArabe() || [titre, lireNomPharmacie(), ...entetes, ...lignes.flat().map((v) => String(v ?? ''))].some((v) => ARABE.test(v))) {
    imprimerTableau(options)
    return
  }
  const doc = new jsPDF({ orientation: entetes.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const largeurPage = doc.internal.pageSize.getWidth()
  const margeGauche = 14
  let y = 16

  const logo = lireLogoPharmacie()
  if (logo) {
    const format = /^data:image\/(\w+);/.exec(logo)?.[1]?.toUpperCase()
    try { doc.addImage(logo, format === 'JPEG' || format === 'JPG' ? 'JPEG' : 'PNG', margeGauche, y - 6, 16, 16) } catch { /* image illisible, on l'ignore */ }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(nettoyerPourPdf(lireNomPharmacie()), largeurPage / 2, y, { align: 'center' })
  y += 6
  const coordonnees = [lireAdressePharmacie(), lireTelephonePharmacie()].filter(Boolean).join('  ·  ')
  if (coordonnees) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(nettoyerPourPdf(coordonnees), largeurPage / 2, y, { align: 'center' })
    y += 5
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(nettoyerPourPdf(titre), largeurPage / 2, y, { align: 'center' })
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Imprimé par : ${nettoyerPourPdf(options.imprimePar)}`, margeGauche, y)
  doc.text(`Date : ${formaterDateHeureExport(new Date().toISOString())}`, largeurPage - margeGauche, y, { align: 'right' })
  y += 3

  doc.setLineWidth(0.2)
  doc.line(margeGauche, y, largeurPage - margeGauche, y)

  autoTable(doc, {
    startY: y + 4,
    margin: { left: margeGauche, right: margeGauche },
    head: [entetes.map(nettoyerPourPdf)],
    body: lignes.map((l) => l.map((v) => nettoyerPourPdf(v == null ? '' : String(v)))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [16, 45, 70] },
  })

  doc.save(nomFichier.endsWith('.pdf') ? nomFichier : `${nomFichier}.pdf`)
}

export async function exporterExcel(options: Omit<OptionsExportDocument, 'imprimePar'>) {
  const { titre, nomFichier, entetes, lignes } = options
  const { default: ExcelJS } = await import('exceljs')
  const classeur = new ExcelJS.Workbook()
  classeur.creator = lireNomPharmacie()
  classeur.created = new Date()
  const feuille = classeur.addWorksheet((titre || 'Export').slice(0, 31).replace(/[[\]*?/\\:]/g, ' '))
  feuille.columns = entetes.map((e) => ({ header: e, width: Math.min(40, Math.max(12, e.length + 4)) }))
  const enTete = feuille.getRow(1)
  enTete.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  enTete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
  enTete.alignment = { vertical: 'middle' }
  for (const ligne of lignes) feuille.addRow(ligne.map((v) => v ?? ''))
  feuille.views = [{ state: 'frozen', ySplit: 1 }]
  const buffer = await classeur.xlsx.writeBuffer()
  telechargerBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nomFichier.endsWith('.xlsx') ? nomFichier : `${nomFichier}.xlsx`,
  )
}

export async function exporterWord(options: Omit<OptionsExportDocument, 'imprimePar'>) {
  const { titre, nomFichier, entetes, lignes } = options
  const {
    AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
  } = await import('docx')
  const celluleEnTete = (texte: string) => new TableCell({
    shading: { fill: '1E40AF' },
    children: [new Paragraph({ children: [new TextRun({ text: texte, bold: true, color: 'FFFFFFFF' })] })],
  })
  const celluleDonnee = (valeur: string | number | null | undefined) => new TableCell({
    children: [new Paragraph(String(valeur ?? ''))],
  })
  const tableau = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: entetes.map(celluleEnTete) }),
      ...lignes.map((ligne) => new TableRow({ children: ligne.map(celluleDonnee) })),
    ],
  })
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: lireNomPharmacie(), heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: titre, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `Exporté le ${formaterDateHeureExport(new Date().toISOString())}`, size: 18 })],
        }),
        new Paragraph({ text: '' }),
        tableau,
      ],
    }],
  })
  const blob = await Packer.toBlob(doc)
  telechargerBlob(blob, nomFichier.endsWith('.docx') ? nomFichier : `${nomFichier}.docx`)
}

/** Récupère toutes les pages d'un endpoint paginé (jusqu'à épuisement), pour les exports "filtré"/"tout". */
export async function recupererTout<T>(endpoint: string, params: Record<string, unknown>, tailleLot = 500): Promise<T[]> {
  const resultats: T[] = []
  let page = 1
  let nombrePages = 1
  do {
    const { data } = await api.get<ReponsePaginee<T>>(endpoint, { params: { ...params, page, taille_page: tailleLot } })
    resultats.push(...data.resultats)
    nombrePages = data.nombre_pages
    page += 1
  } while (page <= nombrePages)
  return resultats
}

const echapperHtml = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Tableau imprimé par le navigateur (gère l'arabe et la lecture de droite à gauche). */
function imprimerTableau(options: { titre: string; entetes: string[]; lignes: (string | number | null | undefined)[][]; imprimePar: string }) {
  const sens = estArabe() ? 'rtl' : 'ltr'
  const logo = lireLogoPharmacie()
  const html = `<!doctype html><html lang="${estArabe() ? 'ar' : 'fr'}" dir="${sens}"><head><meta charset="utf-8"><title>${echapperHtml(options.titre)}</title>
<style>
  @page { size: A4 ${options.entetes.length > 6 ? 'landscape' : 'portrait'}; margin: 12mm; }
  body { font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif; color: #102D46; font-size: 11px; margin: 0; }
  header { text-align: center; margin-bottom: 8px; }
  header img { height: 40px; }
  h1 { font-size: 16px; margin: 4px 0 0; } h2 { font-size: 13px; margin: 2px 0 6px; font-weight: 600; }
  .meta { display: flex; justify-content: space-between; color: #475569; border-bottom: 1px solid #102D46; padding-bottom: 4px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th { background: #102D46; color: #fff; font-weight: 600; } th, td { padding: 5px 6px; text-align: start; border-bottom: 1px solid #E2E8F0; }
  tr:nth-child(even) td { background: #F3F6F8; }
</style></head><body>
<header>${logo ? `<img src="${logo}" alt="">` : ''}<h1>${echapperHtml(lireNomPharmacie())}</h1><h2>${echapperHtml(options.titre)}</h2></header>
<div class="meta"><span>${echapperHtml(t('Imprimé par : {nom}', { nom: options.imprimePar }))}</span><span dir="ltr">${formaterDateHeureExport(new Date().toISOString())}</span></div>
<table><thead><tr>${options.entetes.map((e) => `<th>${echapperHtml(e)}</th>`).join('')}</tr></thead>
<tbody>${options.lignes.map((l) => `<tr>${l.map((v) => `<td>${echapperHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
</body></html>`
  const cadre = document.createElement('iframe')
  cadre.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'
  document.body.appendChild(cadre)
  const fenetre = cadre.contentWindow
  if (!fenetre) return
  fenetre.document.open()
  fenetre.document.write(html)
  fenetre.document.close()
  setTimeout(() => {
    fenetre.focus()
    fenetre.print()
    setTimeout(() => cadre.remove(), 1000)
  }, 300)
}
