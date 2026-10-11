import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const URL_API: string = import.meta.env.VITE_URL_API ?? 'http://localhost:8000/api'
const CLE_RAFRAICHISSEMENT = 'pharmacie_rafraichissement'

// Le jeton d'accès reste en mémoire ; seul le jeton de rafraîchissement est conservé dans le navigateur.
let jetonAcces: string | null = null

export const definirJetonAcces = (jeton: string | null) => { jetonAcces = jeton }
export const lireJetonRafraichissement = () => localStorage.getItem(CLE_RAFRAICHISSEMENT)
export const definirJetonRafraichissement = (jeton: string | null) => {
  if (jeton) localStorage.setItem(CLE_RAFRAICHISSEMENT, jeton)
  else localStorage.removeItem(CLE_RAFRAICHISSEMENT)
}

export const api = axios.create({ baseURL: URL_API })

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (jetonAcces) config.headers.Authorization = `Bearer ${jetonAcces}`
  return config
})

let rafraichissementEnCours: Promise<string> | null = null

export async function rafraichirJeton(): Promise<string> {
  if (!rafraichissementEnCours) {
    const jeton = lireJetonRafraichissement()
    if (!jeton) return Promise.reject(new Error('Aucune session'))
    rafraichissementEnCours = axios
      .post(`${URL_API}/auth/rafraichir/`, { rafraichissement: jeton })
      .then((r) => {
        definirJetonAcces(r.data.acces)
        definirJetonRafraichissement(r.data.rafraichissement)
        return r.data.acces as string
      })
      .finally(() => { rafraichissementEnCours = null })
  }
  return rafraichissementEnCours
}

api.interceptors.response.use(
  (reponse) => reponse,
  async (erreur: AxiosError) => {
    const config = erreur.config as (InternalAxiosRequestConfig & { _nouvelEssai?: boolean }) | undefined
    const estAuth = config?.url?.includes('/auth/')
    if (erreur.response?.status === 401 && config && !config._nouvelEssai && !estAuth) {
      config._nouvelEssai = true
      try {
        const nouveau = await rafraichirJeton()
        config.headers.Authorization = `Bearer ${nouveau}`
        return api(config)
      } catch {
        definirJetonAcces(null)
        definirJetonRafraichissement(null)
        window.dispatchEvent(new Event('session-expiree'))
      }
    }
    return Promise.reject(erreur)
  },
)
