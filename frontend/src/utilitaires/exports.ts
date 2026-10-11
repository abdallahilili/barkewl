import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formaterDateHeureExport, lireLogoPharmacie, lireNomPharmacie } from './formatage'

/** Les polices standard de jsPDF (WinAnsi) ne rendent pas correctement certains caractères (flèches, tirets longs…). */
function nettoyerPourPdf(valeur: string) {
  return valeur.replace(/→/g, '->').replace(/←/g, '<-').replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
}

export function exporterCsv(nomFichier: string, entetes: string[], lignes: (string | number | null | undefined)[][]) {
  const echapper = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const contenu = [entetes, ...lignes].map((l) => l.map(echapper).join(';')).join('\r\n')
  const blob = new Blob(['\ufeff' + contenu], { type: 'text/csv;charset=utf-8;' })
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(blob)
  lien.download = nomFichier
  lien.click()
  URL.revokeObjectURL(lien.href)
}

export function exporterPdf(options: {
  titre: string
  nomFichier: string
  entetes: string[]
  lignes: (string | number | null | undefined)[][]
  imprimePar: string
}) {
  const { titre, nomFichier, entetes, lignes } = options
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
  y += 7
  doc.setFontSize(11)
  doc.text(nettoyerPourPdf(titre), largeurPage / 2, y, { align: 'center' })
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Imprim\u00e9 par : ${nettoyerPourPdf(options.imprimePar)}`, margeGauche, y)
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
    headStyles: { fillColor: [30, 64, 175] },
  })

  doc.save(nomFichier.endsWith('.pdf') ? nomFichier : `${nomFichier}.pdf`)
}
