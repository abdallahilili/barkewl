import {
  ColumnOrderState, ColumnPinningState, ColumnSizingState, VisibilityState, flexRender, getCoreRowModel, useReactTable,
} from '@tanstack/react-table'
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, GripVertical, Loader2, Maximize2, Minimize2, Pin, PinOff, X,
} from 'lucide-react'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmer } from './Confirmation'
import { Chargement, EtatVide, MessageErreur } from './EnTetePage'
import { ModaleExport } from './ModaleExport'
import { useNotifier } from './Notifications'

import { estArabe, t } from '../i18n'
export interface Colonne<T> {
  cle: string
  /** Texte français brut (pas de `t(...)` ici) : traduit à l'affichage et, indépendamment, à l'export
   * dans la langue choisie par l'utilisateur dans la fenêtre d'export. */
  titre: string
  rendu?: (ligne: T) => ReactNode
  exportRendu?: (ligne: T) => string | number | null
  tri?: string
  alignement?: 'gauche' | 'droite' | 'centre'
  cacheParDefaut?: boolean
  /** Largeur initiale en pixels (redimensionnable ensuite par l'utilisateur). */
  largeur?: number
  /** Colonne filtrable depuis son en-tête ; envoie la valeur saisie à `onFiltreColonne`. */
  filtrable?: boolean
  optionsFiltre?: { valeur: string | number; libelle: string }[]
}

export interface ResultatActionMasse { reussies: number; echecs: { libelle: string; raison: string }[] }
export interface ActionMasse<T> {
  libelle: string
  executer: (lignes: T[]) => Promise<ResultatActionMasse>
  confirmation: string
  danger?: boolean
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
  /** Identifiant stable pour mémoriser (poste par poste) l'ordre/largeur/visibilité/épinglage des colonnes. */
  idTableau?: string
  /** Active les cases à cocher + une barre d'actions sur la sélection (désactiver, annuler…). */
  actionsMasse?: ActionMasse<T>[]
  /** Valeurs des filtres par colonne (voir `Colonne.filtrable`), à fusionner par la page appelante dans ses propres filtres. */
  filtresColonnes?: Record<string, string>
  onFiltreColonne?: (cle: string, valeur: string) => void
  /** Endpoint + paramètres courants (recherche/tri/filtres, hors page), pour les portées d'export "filtré"/"tout". */
  endpoint?: string
  parametresRequete?: Record<string, unknown>
}

const alignements = { gauche: 'text-start', droite: 'text-end', centre: 'text-center' }
const CLE_SELECTION = '_selection'

interface EtatColonnes { ordre: string[]; tailles: Record<string, number>; cachees: string[]; epinglage: ColumnPinningState }

function chargerEtat(idTableau?: string): EtatColonnes | null {
  if (!idTableau) return null
  try {
    const brut = localStorage.getItem(`tableau:${idTableau}`)
    return brut ? (JSON.parse(brut) as EtatColonnes) : null
  } catch { return null }
}

function sauverEtat(idTableau: string | undefined, etat: EtatColonnes) {
  if (!idTableau) return
  try { localStorage.setItem(`tableau:${idTableau}`, JSON.stringify(etat)) } catch { /* stockage indisponible, tant pis */ }
}

export function TableauDonnees<T>({
  colonnes, lignes, chargement, erreur, total, page, nombrePages, onPage, tri, onTri, cleLigne, onClicLigne,
  messageVide = t('Aucun résultat.'), choixColonnes = true, titre = t('Export'), exporter = true, idTableau,
  actionsMasse, filtresColonnes = {}, onFiltreColonne, endpoint, parametresRequete,
}: Props<T>) {
  const notifier = useNotifier()
  const confirmer = useConfirmer()
  const conteneurRef = useRef<HTMLDivElement>(null)
  const etatInitial = useMemo(() => chargerEtat(idTableau), [idTableau]) // eslint-disable-line react-hooks/exhaustive-deps

  const [menuOuvert, setMenuOuvert] = useState(false)
  const [modaleExport, setModaleExport] = useState(false)
  const [pleinEcran, setPleinEcran] = useState(false)
  const [glissee, setGlissee] = useState<string | null>(null)
  const [executionMasse, setExecutionMasse] = useState(false)

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    const v: VisibilityState = {}
    for (const c of colonnes) v[c.cle] = etatInitial ? !etatInitial.cachees.includes(c.cle) : !c.cacheParDefaut
    return v
  })
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => {
    const defaut = colonnes.map((c) => c.cle)
    if (etatInitial && etatInitial.ordre.length === defaut.length && defaut.every((c) => etatInitial.ordre.includes(c))) return etatInitial.ordre
    return defaut
  })
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    const tailles: ColumnSizingState = {}
    for (const c of colonnes) tailles[c.cle] = etatInitial?.tailles[c.cle] ?? c.largeur ?? 160
    return tailles
  })
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(etatInitial?.epinglage ?? {})
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  useEffect(() => {
    sauverEtat(idTableau, { ordre: columnOrder, tailles: columnSizing, cachees: Object.keys(columnVisibility).filter((k) => !columnVisibility[k]), epinglage: columnPinning })
  }, [idTableau, columnOrder, columnSizing, columnVisibility, columnPinning])

  useEffect(() => {
    const surChangement = () => setPleinEcran(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', surChangement)
    return () => document.removeEventListener('fullscreenchange', surChangement)
  }, [])

  const colonnesParCle = useMemo(() => Object.fromEntries(colonnes.map((c) => [c.cle, c])), [colonnes])

  const colonnesTanStack = useMemo(() => {
    const def = colonnes.map((c) => ({
      id: c.cle,
      header: t(c.titre),
      size: c.largeur ?? 160,
      enableSorting: !!c.tri,
      enableHiding: c.titre !== '',
      enableResizing: c.titre !== '',
      cell: ({ row }: { row: { original: T } }) => (c.rendu ? c.rendu(row.original) : String((row.original as Record<string, unknown>)[c.cle] ?? '—')),
    }))
    if (actionsMasse && actionsMasse.length > 0) {
      def.unshift({
        id: CLE_SELECTION, header: '', size: 36, enableSorting: false, enableHiding: false, enableResizing: false,
        cell: () => null,
      })
    }
    return def
  }, [colonnes, actionsMasse])

  const table = useReactTable({
    data: lignes,
    columns: colonnesTanStack,
    state: { columnVisibility, columnOrder, columnSizing, columnPinning, rowSelection },
    columnResizeMode: 'onChange',
    columnResizeDirection: estArabe() ? 'rtl' : 'ltr',
    enableRowSelection: !!actionsMasse,
    getRowId: (row) => String(cleLigne(row)),
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onColumnPinningChange: setColumnPinning,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
  })

  const basculerTri = (champ: string) => {
    if (!onTri) return
    if (tri === champ) onTri(`-${champ}`)
    else if (tri === `-${champ}`) onTri(undefined)
    else onTri(champ)
  }

  const basculerPlein = () => {
    if (!conteneurRef.current) return
    if (document.fullscreenElement) document.exitFullscreen()
    else conteneurRef.current.requestFullscreen()
  }

  const basculerEpingle = (cle: string) => {
    setColumnPinning((p) => {
      const actuel = p.left?.includes(cle) ? 'left' : p.right?.includes(cle) ? 'right' : false
      const sansCle = { left: (p.left ?? []).filter((c) => c !== cle), right: (p.right ?? []).filter((c) => c !== cle) }
      if (actuel === false) return { ...sansCle, left: [...sansCle.left, cle] }
      if (actuel === 'left') return sansCle
      return sansCle
    })
  }

  const lignesSelectionnees = table.getSelectedRowModel().rows.map((r) => r.original)

  const executerActionMasse = async (action: ActionMasse<T>) => {
    const nombre = t(lignesSelectionnees.length > 1 ? '{n} lignes' : '{n} ligne', { n: lignesSelectionnees.length })
    const ok = await confirmer({ titre: t(action.libelle), message: `${t(action.confirmation)} (${nombre})`, libelle: t(action.libelle), danger: action.danger })
    if (!ok) return
    setExecutionMasse(true)
    try {
      const resultat = await action.executer(lignesSelectionnees)
      if (resultat.echecs.length === 0) notifier.succes(t('{n} ligne(s) traitée(s) avec succès.', { n: resultat.reussies }))
      else notifier.erreur(t('{reussies} réussie(s), {refusees} refusée(s) : {details}', { reussies: resultat.reussies, refusees: resultat.echecs.length, details: resultat.echecs.map((e) => `${e.libelle} (${e.raison})`).join(' · ') }))
      setRowSelection({})
    } catch { notifier.erreur(t("Échec de l'action groupée.")) }
    finally { setExecutionMasse(false) }
  }

  const colonnesExportables = colonnes.filter((c) => c.titre !== '')
  const colonnesVisiblesExport = colonnesExportables.filter((c) => columnVisibility[c.cle] !== false).map((c) => c.cle)
  const colonnesFiltrables = colonnes.filter((c) => c.filtrable)

  return (
    <div ref={conteneurRef} className={`carte ${pleinEcran ? 'fixed inset-0 z-50 flex flex-col overflow-auto rounded-none bg-white' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 sans-impression">
        <div>
          {actionsMasse && Object.keys(rowSelection).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-600">{Object.keys(rowSelection).length} {' '}{t('sélectionnée(s)')}</span>
              {actionsMasse.map((a) => (
                <button key={a.libelle} type="button" disabled={executionMasse} className={a.danger ? 'btn-danger btn-petit' : 'btn-secondaire btn-petit'}
                  onClick={() => executerActionMasse(a)}>
                  {executionMasse ? <Loader2 size={14} className="animate-spin" /> : null} {a.libelle}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {exporter && (
            <button type="button" className="btn-discret btn-petit" onClick={() => setModaleExport(true)}>
              <Download size={14} /> {' '}{t('Exporter')}
            </button>
          )}
          {choixColonnes && colonnes.length > 3 && (
            <div className="relative">
              <button type="button" className="btn-discret btn-petit" onClick={() => setMenuOuvert(!menuOuvert)}>
                <Columns3 size={14} /> {' '}{t('Colonnes')}
              </button>
              {menuOuvert && (
                <div className="absolute end-0 top-10 z-20 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                  {colonnes.filter((c) => c.titre !== '').map((c) => (
                    <label key={c.cle} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={columnVisibility[c.cle] !== false}
                        onChange={() => setColumnVisibility((v) => ({ ...v, [c.cle]: v[c.cle] === false }))} />
                      {t(c.titre) || c.cle}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <button type="button" className="btn-discret btn-petit" onClick={basculerPlein} aria-label={pleinEcran ? 'Quitter le plein écran' : 'Plein écran'}>
            {pleinEcran ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>
      <MessageErreur message={erreur ?? null} />
      <div className={`overflow-auto ${pleinEcran ? 'flex-1' : ''}`}>
        <table className="w-full table-fixed text-sm" style={{ width: table.getTotalSize() }}>
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              {table.getHeaderGroups()[0].headers.map((header) => {
                const colonne = colonnesParCle[header.column.id]
                const epingle = header.column.getIsPinned()
                const estActions = header.column.id !== CLE_SELECTION && colonne?.titre === ''
                const estSelection = header.column.id === CLE_SELECTION
                return (
                  <th key={header.id} style={{ width: header.getSize(), left: epingle === 'left' ? header.column.getStart('left') : undefined, right: epingle === 'right' ? header.column.getAfter('right') : undefined }}
                    className={`relative whitespace-nowrap px-3 py-2.5 font-medium ${alignements[colonne?.alignement ?? 'gauche']} ${epingle ? 'sticky z-10 bg-slate-50' : ''}`}
                    draggable={!estActions && !estSelection}
                    onDragStart={() => setGlissee(header.column.id)}
                    onDragOver={(e) => { if (!estActions && !estSelection) e.preventDefault() }}
                    onDrop={() => {
                      if (!glissee || glissee === header.column.id) return
                      const ordreActuel = table.getState().columnOrder
                      const depuis = ordreActuel.indexOf(glissee)
                      const vers = ordreActuel.indexOf(header.column.id)
                      if (depuis === -1 || vers === -1) return
                      const nouveau = [...ordreActuel]
                      nouveau.splice(depuis, 1)
                      nouveau.splice(vers, 0, glissee)
                      setColumnOrder(nouveau)
                      setGlissee(null)
                    }}>
                    {estSelection ? (
                      <input type="checkbox" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} aria-label={t('Tout sélectionner')} />
                    ) : (
                      <div className="flex items-center gap-1">
                        {!estActions && <GripVertical size={12} className="shrink-0 cursor-grab text-slate-300" />}
                        {colonne?.tri && onTri ? (
                          <button type="button" className="inline-flex items-center gap-1 hover:text-slate-900" onClick={() => basculerTri(colonne.tri!)}>
                            {header.column.columnDef.header as string}
                            {tri === colonne.tri && <ArrowUp size={12} />}
                            {tri === `-${colonne.tri}` && <ArrowDown size={12} />}
                          </button>
                        ) : <span>{header.column.columnDef.header as string}</span>}
                        {!estActions && (
                          <button type="button" className="ms-auto shrink-0 text-slate-300 hover:text-marque-600" onClick={() => basculerEpingle(header.column.id)}
                            aria-label={t(epingle ? 'Détacher la colonne' : 'Figer la colonne')} title={t(epingle ? 'Détacher' : 'Figer à gauche')}>
                            {epingle ? <PinOff size={12} /> : <Pin size={12} />}
                          </button>
                        )}
                        {header.column.getCanResize() && (
                          <div onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()}
                            className="absolute end-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-marque-300" />
                        )}
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
            {colonnesFiltrables.length > 0 && (
              <tr className="border-t border-slate-200 bg-white">
                {table.getHeaderGroups()[0].headers.map((header) => {
                  const colonne = colonnesParCle[header.column.id]
                  if (!colonne?.filtrable) return <th key={header.id} className="px-3 py-1.5" />
                  return (
                    <th key={header.id} className="px-2 py-1.5">
                      {colonne.optionsFiltre ? (
                        <select className="champ py-1 text-xs" value={filtresColonnes[colonne.cle] ?? ''} onChange={(e) => onFiltreColonne?.(colonne.cle, e.target.value)}>
                          <option value="">{t('Tous')}</option>
                          {colonne.optionsFiltre.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
                        </select>
                      ) : (
                        <div className="relative">
                          <input className="champ py-1 pe-6 text-xs" value={filtresColonnes[colonne.cle] ?? ''} placeholder={t('Filtrer…')} onChange={(e) => onFiltreColonne?.(colonne.cle, e.target.value)} />
                          {filtresColonnes[colonne.cle] && (
                            <button type="button" className="absolute end-1.5 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => onFiltreColonne?.(colonne.cle, '')} aria-label={t('Effacer le filtre')}><X size={12} /></button>
                          )}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={onClicLigne ? 'cursor-pointer hover:bg-marque-50/40' : 'hover:bg-slate-50'}
                onClick={onClicLigne ? () => onClicLigne(row.original) : undefined}>
                {row.getVisibleCells().map((cell) => {
                  const colonne = colonnesParCle[cell.column.id]
                  const epingle = cell.column.getIsPinned()
                  return (
                    <td key={cell.id} style={{ width: cell.column.getSize(), left: epingle === 'left' ? cell.column.getStart('left') : undefined, right: epingle === 'right' ? cell.column.getAfter('right') : undefined }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5 align-middle ${alignements[colonne?.alignement ?? 'gauche']} ${epingle ? 'sticky z-[5] bg-white' : ''}`}
                      onClick={cell.column.id === CLE_SELECTION ? (e) => e.stopPropagation() : undefined}>
                      {cell.column.id === CLE_SELECTION
                        ? <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} aria-label={t('Sélectionner la ligne')} />
                        : flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {chargement && lignes.length === 0 && <Chargement />}
      {!chargement && lignes.length === 0 && !erreur && <EtatVide titre={messageVide} />}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500 sans-impression">
        <span>{total} {' '}{t(total > 1 ? 'résultats' : 'résultat')}{chargement && lignes.length > 0 ? t(' — mise à jour…') : ''}</span>
        {nombrePages > 1 && (
          <div className="flex items-center gap-1">
            <button className="btn-discret btn-petit" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('Page précédente')}><ChevronLeft size={14} className="rtl:-scale-x-100" /></button>
            <span>{t('Page')}{' '}{page} / {nombrePages}</span>
            <button className="btn-discret btn-petit" disabled={page >= nombrePages} onClick={() => onPage(page + 1)} aria-label={t('Page suivante')}><ChevronRight size={14} className="rtl:-scale-x-100" /></button>
          </div>
        )}
      </div>
      {exporter && (
        <ModaleExport ouverte={modaleExport} onFermer={() => setModaleExport(false)} titre={titre}
          colonnes={colonnesExportables} colonnesVisibles={colonnesVisiblesExport}
          lignesPage={lignes} lignesSelection={lignesSelectionnees} endpoint={endpoint} parametresRequete={parametresRequete} />
      )}
    </div>
  )
}
