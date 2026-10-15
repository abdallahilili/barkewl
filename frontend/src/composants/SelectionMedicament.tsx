import { Plus, X } from 'lucide-react'
import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../services/api'
import type { Medicament, ReponsePaginee } from '../types'
import { ModaleNouveauMedicament } from './ModaleNouveauMedicament'

export function SelectionMedicament({ valeur, onChoisir, placeholder = 'Rechercher un médicament (nom, code, code-barres)…', depot }: {
  valeur: { id: number; nom: string } | null
  onChoisir: (m: Medicament | null) => void
  placeholder?: string
  /** Si fourni, la recherche n'accepte que les médicaments ayant du stock (lots non périmés) dans ce dépôt. */
  depot?: number | null
}) {
  const [texte, setTexte] = useState('')
  const [resultats, setResultats] = useState<Medicament[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0)
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const conteneur = useRef<HTMLDivElement>(null)
  const champRef = useRef<HTMLInputElement>(null)
  const listeRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!texte.trim()) { setResultats([]); return }
    const t = setTimeout(() => {
      const params: Record<string, string | number> = { recherche: texte, actif: 1, taille_page: 12 }
      if (depot) params.depot = depot
      api.get<ReponsePaginee<Medicament>>('/medicaments/', { params })
        .then((r) => { setResultats(r.data.resultats); setActif(0); setOuvert(true) })
        .catch(() => undefined)
    }, 250)
    return () => clearTimeout(t)
  }, [texte, depot])

  // La liste est affichée via un portail (document.body) pour échapper aux tableaux
  // avec overflow-x-auto, qui sinon la découpent ou la font passer sous les colonnes voisines.
  useEffect(() => {
    if (!ouvert) return
    const majPosition = () => {
      const r = champRef.current?.getBoundingClientRect()
      if (r) setPosition({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: Math.max(r.width, 280) })
    }
    majPosition()
    window.addEventListener('scroll', majPosition, true)
    window.addEventListener('resize', majPosition)
    return () => { window.removeEventListener('scroll', majPosition, true); window.removeEventListener('resize', majPosition) }
  }, [ouvert])

  useEffect(() => {
    const dehors = (e: MouseEvent) => {
      const cible = e.target as Node
      if (!conteneur.current?.contains(cible) && !listeRef.current?.contains(cible)) setOuvert(false)
    }
    document.addEventListener('mousedown', dehors)
    return () => document.removeEventListener('mousedown', dehors)
  }, [])

  const enRupture = (m: Medicament) => depot != null && m.stock_depot != null && m.stock_depot <= 0

  const choisir = (m: Medicament) => {
    if (enRupture(m)) return
    onChoisir(m); setTexte(''); setOuvert(false)
  }

  const surTouche = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(a + 1, resultats.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && ouvert && resultats[actif]) { e.preventDefault(); choisir(resultats[actif]) }
  }

  if (valeur) {
    return (
      <div className="champ flex items-center justify-between">
        <span className="truncate">{valeur.nom}</span>
        <button type="button" className="ml-2 text-slate-400 hover:text-slate-700" onClick={() => onChoisir(null)} aria-label="Changer de médicament"><X size={14} /></button>
      </div>
    )
  }
  return (
    <div className="relative" ref={conteneur}>
      <input ref={champRef} className="champ" value={texte} placeholder={placeholder} onChange={(e) => setTexte(e.target.value)} onKeyDown={surTouche}
        onFocus={() => resultats.length > 0 && setOuvert(true)} />
      {ouvert && position && createPortal(
        <ul ref={listeRef} style={{ position: 'absolute', top: position.top, left: position.left, width: position.width }}
          className="z-50 mt-1 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {resultats.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Aucun médicament trouvé.</li>}
          {resultats.map((m, i) => {
            const rupture = enRupture(m)
            return (
              <li key={m.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(m)} disabled={rupture}
                  title={rupture ? 'Aucun stock disponible dans ce dépôt' : undefined}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm ${rupture ? 'cursor-not-allowed opacity-50' : i === actif ? 'bg-marque-50' : 'hover:bg-slate-50'}`}>
                  <span className="w-full truncate font-medium">{m.nom}</span>
                  <span className="flex w-full items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="truncate">{m.dosage} {m.forme}</span>
                    <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                      {depot != null && m.stock_depot != null && (
                        <span className={rupture ? 'font-medium text-red-600' : 'font-medium text-emerald-600'}>
                          {rupture ? 'Rupture' : `${m.stock_depot} en stock`}
                        </span>
                      )}
                      <span className="text-slate-400">{m.code}</span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          <li className="border-t border-slate-100">
            <button type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setAjoutOuvert(true); setOuvert(false) }}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-marque-700 hover:bg-marque-50">
              <Plus size={14} /> {texte.trim() ? `Ajouter « ${texte.trim()} » comme nouveau médicament` : 'Ajouter un nouveau médicament'}
            </button>
          </li>
        </ul>,
        document.body,
      )}
      <ModaleNouveauMedicament ouverte={ajoutOuvert} nomInitial={texte.trim()} onFermer={() => setAjoutOuvert(false)}
        onCree={(m) => { choisir(m); setAjoutOuvert(false) }} />
    </div>
  )
}
