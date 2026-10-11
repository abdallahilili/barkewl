import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, FileText } from 'lucide-react'
import { ReactNode, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { exporterCsv, exporterPdf } from '../utilitaires/exports'
import { Chargement, EtatVide, MessageErreur } from './EnTetePage'

export interface Colonne<T> {
  cle: string
  titre: string
  rendu?: (ligne: T) => ReactNode
  exportRendu?: (ligne: T) => string | number | null
  tri?: string
  alignement?: 'gauche' | 'droite' | 'centre'
  cacheParDefaut?: boolean
}

interface Props<T> {
  colonnes: Colonne<T>[]
  lignes: T[]
  chargement: boolean
  erreur?: string | null
  total: number
  page: number
  nombrePages: number
  onPage: (page: number) => void
  tri?: string
  onTri?: (tri: string | undefined) => void
  cleLigne: (ligne: T) => string | number
  onClicLigne?: (ligne: T) => void
  messageVide?: string
  choixColonnes?: boolean
  titre?: string
  exporter?: boolean
}

const alignements = { gauche: 'text-left', droite: 'text-right', centre: 'text-center' }

function valeurExport<T>(colonne: Colonne<T>, ligne: T) {
  if (colonne.exportRendu) return colonne.exportRendu(ligne)
  const valeur = (ligne as Record<string, unknown>)[colonne.cle]
  return valeur == null || typeof valeur === 'object' ? '' : (valeur as string | number)
}

export function TableauDonnees<T>({
  colonnes, lignes, chargement, erreur, total, page, nombrePages, onPage, tri, onTri, cleLigne, onClicLigne,
  messageVide = 'Aucun résultat.', choixColonnes = true, titre = 'Export', exporter = true,
}: Props<T>) {
  const { utilisateur } = useAuth()
  const [cachees, setCachees] = useState<string[]>(colonnes.filter((c) => c.cacheParDefaut).map((c) => c.cle))
  const [menuOuvert, setMenuOuvert] = useState(false)
  const visibles = colonnes.filter((c) => !cachees.includes(c.cle))

  const basculerTri = (champ: string) => {
    if (!onTri) return
    if (tri === champ) onTri(`-${champ}`)
    else if (tri === `-${champ}`) onTri(undefined)
    else onTri(champ)
  }

  const nomFichier = titre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'export'
  const colonnesExport = visibles.filter((c) => c.titre !== '')

  return (
    <div className="carte">
      {(exporter || (choixColonnes && colonnes.length > 5)) && (
        <div className="flex flex-wrap justify-end gap-2 border-b border-slate-100 px-3 py-2 sans-impression">
          {exporter && (
            <>
              <button type="button" className="btn-discret btn-petit"
                onClick={() => exporterCsv(`${nomFichier}.csv`, colonnesExport.map((c) => c.titre), lignes.map((l) => colonnesExport.map((c) => valeurExport(c, l))))}>
                <Download size={14} /> Exporter en CSV
              </button>
              <button type="button" className="btn-discret btn-petit"
                onClick={() => exporterPdf({
                  titre, nomFichier, imprimePar: utilisateur?.nom_complet ?? '—',
                  entetes: colonnesExport.map((c) => c.titre), lignes: lignes.map((l) => colonnesExport.map((c) => valeurExport(c, l))),
                })}>
                <FileText size={14} /> Exporter en PDF
              </button>
            </>
          )}
          {choixColonnes && colonnes.length > 5 && (
            <div className="relative">
              <button type="button" className="btn-discret btn-petit" onClick={() => setMenuOuvert(!menuOuvert)}>
                <Columns3 size={14} /> Colonnes
              </button>
              {menuOuvert && (
                <div className="absolute right-0 top-10 z-10 w-52 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                  {colonnes.map((c) => (
                    <label key={c.cle} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={!cachees.includes(c.cle)}
                        onChange={() => setCachees((x) => (x.includes(c.cle) ? x.filter((k) => k !== c.cle) : [...x, c.cle]))} />
                      {c.titre}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <MessageErreur message={erreur ?? null} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              {visibles.map((c) => (
                <th key={c.cle} className={`whitespace-nowrap px-3 py-2.5 font-medium ${alignements[c.alignement ?? 'gauche']}`}>
                  {c.tri && onTri ? (
                    <button type="button" className="inline-flex items-center gap-1 hover:text-slate-900" onClick={() => basculerTri(c.tri!)}>
                      {c.titre}
                      {tri === c.tri && <ArrowUp size={12} />}
                      {tri === `-${c.tri}` && <ArrowDown size={12} />}
                    </button>
                  ) : c.titre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map((ligne) => (
              <tr key={cleLigne(ligne)} className={onClicLigne ? 'cursor-pointer hover:bg-marque-50/40' : 'hover:bg-slate-50'}
                onClick={onClicLigne ? () => onClicLigne(ligne) : undefined}>
                {visibles.map((c) => (
                  <td key={c.cle} className={`px-3 py-2.5 align-middle ${alignements[c.alignement ?? 'gauche']}`}>
                    {c.rendu ? c.rendu(ligne) : String((ligne as Record<string, unknown>)[c.cle] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {chargement && lignes.length === 0 && <Chargement />}
      {!chargement && lignes.length === 0 && !erreur && <EtatVide titre={messageVide} />}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500 sans-impression">
        <span>{total} résultat{total > 1 ? 's' : ''}{chargement && lignes.length > 0 ? ' — mise à jour…' : ''}</span>
        {nombrePages > 1 && (
          <div className="flex items-center gap-1">
            <button className="btn-discret btn-petit" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente"><ChevronLeft size={14} /></button>
            <span>Page {page} / {nombrePages}</span>
            <button className="btn-discret btn-petit" disabled={page >= nombrePages} onClick={() => onPage(page + 1)} aria-label="Page suivante"><ChevronRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
