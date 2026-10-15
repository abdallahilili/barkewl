import { Plus, X } from 'lucide-react'
import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import type { Medicament, ReponsePaginee } from '../types'
import { ModaleNouveauMedicament } from './ModaleNouveauMedicament'

export function SelectionMedicament({ valeur, onChoisir, placeholder = 'Rechercher un médicament (nom, code, code-barres)…' }: {
  valeur: { id: number; nom: string } | null
  onChoisir: (m: Medicament | null) => void
  placeholder?: string
}) {
  const [texte, setTexte] = useState('')
  const [resultats, setResultats] = useState<Medicament[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0)
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const conteneur = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!texte.trim()) { setResultats([]); return }
    const t = setTimeout(() => {
      api.get<ReponsePaginee<Medicament>>('/medicaments/', { params: { recherche: texte, actif: 1, taille_page: 12 } })
        .then((r) => { setResultats(r.data.resultats); setActif(0); setOuvert(true) })
        .catch(() => undefined)
    }, 250)
    return () => clearTimeout(t)
  }, [texte])

  useEffect(() => {
    const dehors = (e: MouseEvent) => { if (!conteneur.current?.contains(e.target as Node)) setOuvert(false) }
    document.addEventListener('mousedown', dehors)
    return () => document.removeEventListener('mousedown', dehors)
  }, [])

  const choisir = (m: Medicament) => { onChoisir(m); setTexte(''); setOuvert(false) }

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
      <input className="champ" value={texte} placeholder={placeholder} onChange={(e) => setTexte(e.target.value)} onKeyDown={surTouche}
        onFocus={() => resultats.length > 0 && setOuvert(true)} />
      {ouvert && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {resultats.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Aucun médicament trouvé.</li>}
          {resultats.map((m, i) => (
            <li key={m.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(m)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm ${i === actif ? 'bg-marque-50' : 'hover:bg-slate-50'}`}>
                <span className="w-full truncate font-medium">{m.nom}</span>
                <span className="flex w-full items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="truncate">{m.dosage} {m.forme}</span>
                  <span className="shrink-0 whitespace-nowrap text-slate-400">{m.code}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-slate-100">
            <button type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setAjoutOuvert(true); setOuvert(false) }}
              className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-marque-700 hover:bg-marque-50">
              <Plus size={14} /> {texte.trim() ? `Ajouter « ${texte.trim()} » comme nouveau médicament` : 'Ajouter un nouveau médicament'}
            </button>
          </li>
        </ul>
      )}
      <ModaleNouveauMedicament ouverte={ajoutOuvert} nomInitial={texte.trim()} onFermer={() => setAjoutOuvert(false)}
        onCree={(m) => { choisir(m); setAjoutOuvert(false) }} />
    </div>
  )
}
