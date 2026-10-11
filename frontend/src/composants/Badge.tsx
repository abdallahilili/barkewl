import type { ReactNode } from 'react'

export type Ton = 'gris' | 'bleu' | 'vert' | 'rouge' | 'orange'

const classes: Record<Ton, string> = {
  gris: 'bg-slate-100 text-slate-700 ring-slate-200',
  bleu: 'bg-marque-50 text-marque-800 ring-marque-200',
  vert: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rouge: 'bg-red-50 text-red-800 ring-red-200',
  orange: 'bg-amber-50 text-amber-800 ring-amber-200',
}

export function Badge({ ton = 'gris', children }: { ton?: Ton; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${classes[ton]}`}>
      {children}
    </span>
  )
}

export const tonEtatStock = (etat: string): Ton =>
  ({ DISPONIBLE: 'vert', STOCK_FAIBLE: 'orange', RUPTURE: 'rouge', EPUISE: 'gris', BIENTOT_PERIME: 'orange', PERIME: 'rouge' } as Record<string, Ton>)[etat] ?? 'gris'

export const tonStatut = (statut: string): Ton =>
  ({
    BROUILLON: 'gris', VALIDE: 'vert', VALIDEE: 'vert', ANNULE: 'rouge', ANNULEE: 'rouge', OUVERTE: 'bleu', FERMEE: 'gris',
  } as Record<string, Ton>)[statut] ?? 'gris'
