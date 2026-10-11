import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../services/api'
import * as auth from '../services/auth'
import type { Parametre, Utilisateur } from '../types'
import { definirDevise, definirGestionRayonnages, definirLogoPharmacie, definirNomPharmacie } from '../utilitaires/formatage'

interface ContexteAuth {
  utilisateur: Utilisateur | null
  chargement: boolean
  connecter: (identifiant: string, motDePasse: string) => Promise<void>
  deconnecter: () => void
  peut: (module: string) => boolean
}

const Contexte = createContext<ContexteAuth | null>(null)

async function chargerParametresGlobaux() {
  try {
    const { data } = await api.get<Parametre[]>('/parametres/')
    definirDevise(data.find((p) => p.cle === 'devise')?.valeur ?? 'MRU')
    definirGestionRayonnages(data.find((p) => p.cle === 'gestion_rayonnages_active')?.valeur === '1')
    definirNomPharmacie(data.find((p) => p.cle === 'nom_pharmacie')?.valeur ?? 'PHARMACIE')
    definirLogoPharmacie(data.find((p) => p.cle === 'logo_pharmacie')?.valeur ?? '')
  } catch { /* les valeurs par défaut restent utilisées */ }
}

export function FournisseurAuth({ children }: { children: ReactNode }) {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    auth.restaurerSession().then(async (u) => {
      if (u) await chargerParametresGlobaux()
      setUtilisateur(u)
      setChargement(false)
    })
    const surExpiration = () => setUtilisateur(null)
    window.addEventListener('session-expiree', surExpiration)
    return () => window.removeEventListener('session-expiree', surExpiration)
  }, [])

  const connecter = useCallback(async (identifiant: string, motDePasse: string) => {
    const u = await auth.connexion(identifiant, motDePasse)
    await chargerParametresGlobaux()
    setUtilisateur(u)
  }, [])

  const deconnecter = useCallback(() => {
    auth.deconnexion()
    setUtilisateur(null)
  }, [])

  const peut = useCallback((module: string) => !!utilisateur?.modules.includes(module), [utilisateur])

  return <Contexte.Provider value={{ utilisateur, chargement, connecter, deconnecter, peut }}>{children}</Contexte.Provider>
}

export function useAuth() {
  const contexte = useContext(Contexte)
  if (!contexte) throw new Error('useAuth doit être utilisé dans FournisseurAuth')
  return contexte
}
