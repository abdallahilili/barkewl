import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import type { ReponsePaginee } from '../types'
import { extraireErreur } from '../utilitaires/erreurs'

export interface OptionsListe {
  taillePage?: number
  filtres?: Record<string, string | number | boolean | null | undefined>
  triInitial?: string
  actif?: boolean
}

/** Liste paginée côté serveur, avec recherche (temporisée), tri et filtres. */
export function useListe<T>(endpoint: string, options: OptionsListe = {}) {
  const { taillePage = 25, filtres = {}, triInitial, actif = true } = options
  const [lignes, setLignes] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [nombrePages, setNombrePages] = useState(1)
  const [page, setPage] = useState(1)
  const [recherche, setRecherche] = useState('')
  const [rechercheEffective, setRechercheEffective] = useState('')
  const [tri, setTri] = useState<string | undefined>(triInitial)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const cleFiltres = JSON.stringify(filtres)
  const numeroRequete = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => { setRechercheEffective(recherche); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [recherche])

  useEffect(() => { setPage(1) }, [cleFiltres, endpoint])

  useEffect(() => {
    if (!actif) return
    const numero = ++numeroRequete.current
    const params: Record<string, unknown> = { page, taille_page: taillePage }
    for (const [cle, valeur] of Object.entries(JSON.parse(cleFiltres))) {
      if (valeur !== '' && valeur != null) params[cle] = valeur
    }
    if (rechercheEffective) params.recherche = rechercheEffective
    if (tri) params.tri = tri
    setChargement(true)
    api.get<ReponsePaginee<T>>(endpoint, { params })
      .then((r) => {
        if (numero !== numeroRequete.current) return
        setLignes(r.data.resultats); setTotal(r.data.total); setNombrePages(r.data.nombre_pages); setErreur(null)
      })
      .catch((e) => { if (numero === numeroRequete.current) setErreur(extraireErreur(e)) })
      .finally(() => { if (numero === numeroRequete.current) setChargement(false) })
  }, [endpoint, page, taillePage, rechercheEffective, tri, cleFiltres, version, actif])

  const recharger = useCallback(() => setVersion((v) => v + 1), [])
  return { lignes, total, nombrePages, page, setPage, recherche, setRecherche, tri, setTri, chargement, erreur, recharger }
}

const cache: Record<string, unknown[]> = {}

/** Charge une petite liste complète (dépôts, catégories, modes de paiement…) pour alimenter des menus déroulants. */
export function useOptions<T>(endpoint: string, params: Record<string, string | number> = {}, actif = true) {
  const cle = endpoint + JSON.stringify(params)
  const [donnees, setDonnees] = useState<T[]>((cache[cle] as T[]) ?? [])
  useEffect(() => {
    if (!actif) return
    let annule = false
    api.get<ReponsePaginee<T>>(endpoint, { params: { taille_page: 500, ...params } }).then((r) => {
      cache[cle] = r.data.resultats
      if (!annule) setDonnees(r.data.resultats)
    }).catch(() => undefined)
    return () => { annule = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, actif])
  return donnees
}

export const viderCacheOptions = () => { for (const k of Object.keys(cache)) delete cache[k] }
