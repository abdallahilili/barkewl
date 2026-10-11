import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react'
import { Modale } from './Modale'

interface Options { titre: string; message: string; libelle?: string; danger?: boolean }
type Confirmer = (options: Options) => Promise<boolean>

const Contexte = createContext<Confirmer | null>(null)

export function FournisseurConfirmation({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Options | null>(null)
  const resolution = useRef<((v: boolean) => void) | null>(null)

  const confirmer = useCallback<Confirmer>((o) => new Promise((resoudre) => {
    resolution.current = resoudre
    setOptions(o)
  }), [])

  const fermer = (valeur: boolean) => {
    resolution.current?.(valeur)
    resolution.current = null
    setOptions(null)
  }

  return (
    <Contexte.Provider value={confirmer}>
      {children}
      <Modale
        ouverte={!!options} titre={options?.titre ?? ''} onFermer={() => fermer(false)} largeur="petite"
        pied={<>
          <button className="btn-secondaire" onClick={() => fermer(false)}>Annuler</button>
          <button className={options?.danger ? 'btn-danger' : 'btn-primaire'} onClick={() => fermer(true)}>{options?.libelle ?? 'Confirmer'}</button>
        </>}
      >
        <p className="text-sm text-slate-700">{options?.message}</p>
      </Modale>
    </Contexte.Provider>
  )
}

export function useConfirmer() {
  const c = useContext(Contexte)
  if (!c) throw new Error('useConfirmer doit être utilisé dans FournisseurConfirmation')
  return c
}
