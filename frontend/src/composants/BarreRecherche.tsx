import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

export function BarreRecherche({ valeur, onChange, placeholder = 'Rechercher…', children }: {
  valeur: string; onChange: (v: string) => void; placeholder?: string; children?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 sans-impression">
      <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
        <input className="champ pl-9" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </div>
      {children}
    </div>
  )
}
