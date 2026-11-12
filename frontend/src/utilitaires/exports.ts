import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { estArabe, t } from '../i18n'
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
    headStyles: { fillColor: [16, 45, 70] },
  })

  doc.save(nomFichier.endsWith('.pdf') ? nomFichier : `${nomFichier}.pdf`)
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
