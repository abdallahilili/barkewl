import { X } from 'lucide-react'
import { ReactNode, useEffect } from 'react'

const largeurs = { petite: 'max-w-md', moyenne: 'max-w-2xl', grande: 'max-w-4xl', tresGrande: 'max-w-6xl' }

export function Modale({ ouverte, titre, onFermer, children, pied, largeur = 'moyenne' }: {
  ouverte: boolean; titre: string; onFermer: () => void; children: ReactNode; pied?: ReactNode; largeur?: keyof typeof largeurs
}) {
  useEffect(() => {
    if (!ouverte) return
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    document.addEventListener('keydown', surTouche)
    return () => document.removeEventListener('keydown', surTouche)
  }, [ouverte, onFermer])

  if (!ouverte) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={titre}>
      <div className={`w-full ${largeurs[largeur]} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">{titre}</h2>
          <button type="button" onClick={onFermer} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {pied && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 rounded-b-lg">{pied}</div>}
      </div>
    </div>
  )
}
