import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import type { LigneStock, ReponsePaginee } from '../types'
import { formaterDate } from '../utilitaires/formatage'
import { Badge, tonEtatStock } from './Badge'
import { libelleEtatStock } from '../utilitaires/formatage'

/** Recherche un lot disponible dans un dépôt donné (médicament, lot, quantité, péremption). */
export function SelectionLotStock({ depot, onChoisir, exclus = [] }: {
  depot: number | ''
  onChoisir: (l: LigneStock) => void
  exclus?: number[]
}) {
  const [texte, setTexte] = useState('')
  const [resultats, setResultats] = useState<LigneStock[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0)
  const conteneur = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!depot || !texte.trim()) { setResultats([]); return }
    const t = setTimeout(() => {
      api.get<ReponsePaginee<LigneStock>>('/stocks/', { params: { depot, recherche: texte, taille_page: 15 } })
        .then((r) => { setResultats(r.data.resultats.filter((l) => !exclus.includes(l.lot))); setActif(0); setOuvert(true) })
        .catch(() => undefined)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texte, depot])

  useEffect(() => {
    const dehors = (e: MouseEvent) => { if (!conteneur.current?.contains(e.target as Node)) setOuvert(false) }
    document.addEventListener('mousedown', dehors)
    return () => document.removeEventListener('mousedown', dehors)
  }, [])

  const choisir = (l: LigneStock) => { onChoisir(l); setTexte(''); setOuvert(false) }
  const surTouche = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(a + 1, resultats.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && ouvert && resultats[actif]) { e.preventDefault(); choisir(resultats[actif]) }
  }

  return (
    <div className="relative" ref={conteneur}>
      <input className="champ" disabled={!depot} value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={surTouche}
        placeholder={depot ? 'Rechercher un médicament ou un lot dans ce dépôt…' : "Choisissez d'abord un dépôt"} />
      {ouvert && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {resultats.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Aucun lot en stock dans ce dépôt.</li>}
          {resultats.map((l, i) => (
            <li key={l.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(l)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${i === actif ? 'bg-marque-50' : 'hover:bg-slate-50'}`}>
                <span>
                  <span className="font-medium">{l.medicament}</span> <span className="text-slate-500">{l.dosage}</span>
                  <span className="block text-xs text-slate-500">Lot {l.numero_lot} · péremption {formaterDate(l.date_peremption)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-medium">{l.quantite} en stock</span>
                  {l.etat !== 'DISPONIBLE' && <Badge ton={tonEtatStock(l.etat)}>{libelleEtatStock(l.etat)}</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
