import type { ReactNode } from 'react'

export function Champ({ libelle, erreur, aide, requis, children, className = '' }: {
  libelle: string; erreur?: string; aide?: string; requis?: boolean; children: ReactNode; className?: string
}) {
  return (
    <div className={className}>
      <label className="etiquette">
        {libelle}{requis && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {aide && !erreur && <p className="mt-1 text-xs text-slate-500">{aide}</p>}
      {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
    </div>
  )
}
