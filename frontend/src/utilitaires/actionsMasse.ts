import type { ResultatActionMasse } from '../composants/TableauDonnees'
import { api } from '../services/api'
import { extraireErreur } from './erreurs'

async function executerParLigne<T>(lignes: T[], libelle: (l: T) => string, appel: (l: T) => Promise<unknown>): Promise<ResultatActionMasse> {
  const resultats = await Promise.allSettled(lignes.map(appel))
  const echecs: { libelle: string; raison: string }[] = []
  resultats.forEach((r, i) => { if (r.status === 'rejected') echecs.push({ libelle: libelle(lignes[i]), raison: extraireErreur(r.reason) }) })
  return { reussies: lignes.length - echecs.length, echecs }
}

/** Désactive chaque ligne sélectionnée via PATCH {champ: false} (ex. actif/active). */
export function desactiverEnMasse<T extends { id: number }>(endpoint: string, champ: string, libelle: (l: T) => string) {
  return (lignes: T[]) => executerParLigne(lignes, libelle, (l) => api.patch(`${endpoint}${l.id}/`, { [champ]: false }))
}

/** Annule chaque ligne sélectionnée via POST {endpoint}{id}/annuler/. */
export function annulerEnMasse<T extends { id: number }>(endpoint: string, libelle: (l: T) => string, corps: Record<string, unknown> = {}) {
  return (lignes: T[]) => executerParLigne(lignes, libelle, (l) => api.post(`${endpoint}${l.id}/annuler/`, corps))
}
