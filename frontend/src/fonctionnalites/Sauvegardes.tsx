import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, HardDrive } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../composants/Badge'
import { MessageErreur } from '../composants/EnTetePage'
import { useNotifier } from '../composants/Notifications'
import { api } from '../services/api'
import { extraireErreur } from '../utilitaires/erreurs'
import { formaterDateHeure } from '../utilitaires/formatage'

import { t } from '../i18n'
interface FichierSauvegarde { nom: string; taille: number; date: string; origine: 'manuelle' | 'auto' | 'restauration' }
interface EtatSauvegardes {
  derniere: FichierSauvegarde | null
  en_retard: boolean
  dossier: string
  dossier_copie: string | null
  dossier_copie_accessible: boolean
  jours_conservation: number
  intervalle_heures: number
  fichiers: FichierSauvegarde[]
}

const ORIGINES = { manuelle: [t('Manuelle'), 'bleu'], auto: [t('Automatique'), 'vert'], restauration: [t('Avant restauration'), 'orange'] } as const

export const formaterTaille = (octets: number) =>
  octets < 1024 * 1024 ? t('{n} Ko', { n: Math.max(1, Math.round(octets / 1024)) }) : t('{n} Mo', { n: (octets / 1024 / 1024).toFixed(1) })

export function Sauvegardes() {
  const notifier = useNotifier()
  const [etat, setEtat] = useState<EtatSauvegardes | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const charger = useCallback(() => {
    api.get<EtatSauvegardes>('/sauvegardes/').then((r) => setEtat(r.data)).catch((e) => setErreur(extraireErreur(e)))
  }, [])
  useEffect(charger, [charger])

  const sauvegarder = async () => {
    setEnCours(true); setErreur(null)
    try {
      const { data } = await api.post<FichierSauvegarde & { copie_erreur: string | null }>('/sauvegardes/')
      if (data.copie_erreur) notifier.erreur(t('Sauvegarde créée, mais {erreur}', { erreur: data.copie_erreur }))
      else notifier.succes(t('Sauvegarde créée.'))
      charger()
    } catch (e) { setErreur(extraireErreur(e)) }
    finally { setEnCours(false) }
  }

  const telecharger = async (nom: string) => {
    try {
      const { data } = await api.get<Blob>(`/sauvegardes/${encodeURIComponent(nom)}/telecharger/`, { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const lien = document.createElement('a')
      lien.href = url; lien.download = nom; lien.click()
      URL.revokeObjectURL(url)
    } catch (e) { notifier.erreur(extraireErreur(e)) }
  }

  if (!etat) return erreur ? <MessageErreur message={erreur} /> : <p className="text-sm text-slate-500">{t('Chargement…')}</p>

  return (
    <div className="max-w-4xl space-y-4">
      <MessageErreur message={erreur} />

      <div className={`carte flex flex-wrap items-center justify-between gap-3 p-4 ${etat.en_retard ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'}`}>
        <div className="flex items-start gap-3">
          {etat.en_retard ? <AlertTriangle className="mt-0.5 text-red-600" size={20} /> : <CheckCircle2 className="mt-0.5 text-emerald-600" size={20} />}
          <div className="text-sm">
            <p className="font-medium">
              {etat.derniere ? t('Dernière sauvegarde : {date}', { date: formaterDateHeure(etat.derniere.date) }) : t('Aucune sauvegarde pour le moment')}
            </p>
            <p className="text-slate-600">
              {etat.intervalle_heures > 0
                ? t('Sauvegarde automatique toutes les {heures} h tant que le serveur est allumé ; conservation {jours} jours.', { heures: etat.intervalle_heures, jours: etat.jours_conservation })
                : t('Sauvegarde automatique désactivée (SAUVEGARDE_INTERVALLE_HEURES = 0).')}
            </p>
          </div>
        </div>
        <button className="btn-primaire" onClick={sauvegarder} disabled={enCours}>
          <DatabaseBackup size={16} /> {enCours ? t('Sauvegarde en cours…') : t('Sauvegarder maintenant')}
        </button>
      </div>

      <div className="carte space-y-2 p-4 text-sm">
        <p className="flex items-center gap-2"><HardDrive size={16} className="text-slate-500" /> <span className="text-slate-500">{t('Dossier principal :')}</span> <code className="break-all">{etat.dossier}</code></p>
        <p className="flex items-center gap-2">
          <HardDrive size={16} className="text-slate-500" /> <span className="text-slate-500">{t('Copie de secours :')}</span>
          {etat.dossier_copie
            ? <><code className="break-all">{etat.dossier_copie}</code> {etat.dossier_copie_accessible ? <Badge ton="vert">{t('Accessible')}</Badge> : <Badge ton="rouge">{t('Introuvable (clé USB branchée ?)')}</Badge>}</>
            : <span className="text-amber-700">{t('non configurée — conseillé : une clé USB, un autre disque ou un dossier OneDrive/Google Drive (DOSSIER_SAUVEGARDES_COPIE)')}</span>}
        </p>
        <p className="text-xs text-slate-500">
          
          {t('La restauration remplace toutes les données : elle se fait par votre technicien avec la commande')}
          <code className="mx-1">restaurer_sauvegarde</code>{t(', qui conserve d\'abord une copie de l\'état actuel.')}
        </p>
      </div>

      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-start text-slate-600">
            <tr><th className="px-4 py-2">{t('Date')}</th><th className="px-4 py-2">{t('Type')}</th><th className="px-4 py-2">{t('Taille')}</th><th className="px-4 py-2">{t('Fichier')}</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {etat.fichiers.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">{t('Aucune sauvegarde.')}</td></tr>}
            {etat.fichiers.map((f) => (
              <tr key={f.nom}>
                <td className="whitespace-nowrap px-4 py-2">{formaterDateHeure(f.date)}</td>
                <td className="px-4 py-2"><Badge ton={ORIGINES[f.origine][1]}>{ORIGINES[f.origine][0]}</Badge></td>
                <td className="whitespace-nowrap px-4 py-2">{formaterTaille(f.taille)}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">{f.nom}</td>
                <td className="px-4 py-2 text-end">
                  <button className="btn-discret btn-petit" onClick={() => telecharger(f.nom)} title={t('Télécharger (pour copier sur une clé USB)')}><Download size={15} /> {' '}{t('Télécharger')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
