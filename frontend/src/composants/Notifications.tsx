import { CheckCircle2, XCircle } from 'lucide-react'
import { createContext, ReactNode, useCallback, useContext, useState } from 'react'

interface Toast { id: number; type: 'succes' | 'erreur'; message: string }
interface ContexteNotif { succes: (m: string) => void; erreur: (m: string) => void }

const Contexte = createContext<ContexteNotif | null>(null)
let compteur = 0

export function FournisseurNotifications({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const ajouter = useCallback((type: Toast['type'], message: string) => {
    const id = ++compteur
    setToasts((t) => [...t, { id, type, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'erreur' ? 7000 : 4000)
  }, [])
  const valeur = { succes: (m: string) => ajouter('succes', m), erreur: (m: string) => ajouter('erreur', m) }
  return (
    <Contexte.Provider value={valeur}>
      {children}
      <div className="fixed right-4 top-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 sans-impression" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-md ${t.type === 'succes' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
            {t.type === 'succes' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <XCircle size={18} className="mt-0.5 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Contexte.Provider>
  )
}

export function useNotifier() {
  const c = useContext(Contexte)
  if (!c) throw new Error('useNotifier doit être utilisé dans FournisseurNotifications')
  return c
}
