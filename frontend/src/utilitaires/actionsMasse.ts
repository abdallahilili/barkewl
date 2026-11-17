import type { ActionMasse, ResultatActionMasse } from '../composants/TableauDonnees'
import { api } from '../services/api'
import { t } from '../i18n'
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

/** Les deux actions groupées d'activation : « Désactiver » n'est proposée que si la sélection contient des lignes actives,
 * « Activer » que si elle contient des lignes désactivées (chacune ne touche que les lignes concernées). */
export function actionsActivation<T extends { id: number }>(endpoint: string, champ: string, libelle: (l: T) => string,
  confirmations: { desactiver: string; activer: string }): ActionMasse<T>[] {
  const estActif = (l: T) => Boolean((l as Record<string, unknown>)[champ])
  return [
    { libelle: t('Désactiver'), danger: true, confirmation: confirmations.desactiver, applicable: estActif, executer: desactiverEnMasse<T>(endpoint, champ, libelle) },
    { libelle: t('Activer'), confirmation: confirmations.activer, applicable: (l) => !estActif(l),
      executer: (lignes) => executerParLigne(lignes, libelle, (l) => api.patch(`${endpoint}${l.id}/`, { [champ]: true })) },
  ]
}
