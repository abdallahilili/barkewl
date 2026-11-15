import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, HardDrive, Usb } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '../composants/Badge'
import { useConfirmer } from '../composants/Confirmation'
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
  usb?: EtatUsb
}
interface LecteurExterne { racine: string; nom_volume: string; type: 'amovible' | 'disque' | null; prepare: boolean; espace_libre: number | null }
interface LecteurUsb extends LecteurExterne {
  identifiant: string
  branche: boolean
  derniere_copie: string | null
  fichiers: FichierSauvegarde[]
  en_retard: boolean
}
interface EtatUsb {
  actif: boolean
  intervalle_heures: number
  nombre_conserve: number
  lecteurs: LecteurUsb[]
  derniere_copie: string | null
  derniere_erreur: { date: string; message: string } | null
  en_retard: boolean
}
interface ResultatCopie { racine: string; nom_volume: string; ok: boolean; fichier: string | null; erreur: string | null }

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

      {etat.usb && <CarteUsb usb={etat.usb} onChange={charger} />}

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

const nomLecteur = (l: { racine: string; nom_volume: string }) => (l.nom_volume ? `${l.racine} (${l.nom_volume})` : l.racine)

function CarteUsb({ usb, onChange }: { usb: EtatUsb; onChange: () => void }) {
  const notifier = useNotifier()
  const confirmer = useConfirmer()
  const [copieEnCours, setCopieEnCours] = useState(false)
  const [disponibles, setDisponibles] = useState<LecteurExterne[] | null>(null)
  const [preparation, setPreparation] = useState(false)

  const signalerResultats = (resultats: ResultatCopie[]) => {
    if (resultats.length === 0) { notifier.erreur(t('Aucune clé préparée n\'est branchée.')); return }
    const erreurs = resultats.filter((r) => !r.ok)
    if (erreurs.length) erreurs.forEach((r) => notifier.erreur(r.erreur ?? t('Copie impossible.')))
    else notifier.succes(t('Sauvegarde copiée sur la clé.'))
  }

  const copier = async () => {
    setCopieEnCours(true)
    try { signalerResultats((await api.post<ResultatCopie[]>('/sauvegardes/usb/copier/')).data) }
    catch (e) { notifier.erreur(extraireErreur(e)) }
    finally { setCopieEnCours(false); onChange() }
  }

  const ouvrirListe = async () => {
    if (disponibles) { setDisponibles(null); return }
    try { setDisponibles((await api.get<LecteurExterne[]>('/sauvegardes/usb/lecteurs/')).data.filter((l) => !l.prepare)) }
    catch (e) { notifier.erreur(extraireErreur(e)) }
  }

  const preparer = async (lecteur: LecteurExterne) => {
    const ok = await confirmer({
      titre: t('Préparer un disque'),
      message: t('Le dossier RaqeemPharma_Sauvegardes sera créé sur {lecteur}. Les {n} sauvegardes les plus récentes y seront gardées ; les autres fichiers du disque ne sont jamais touchés.', { lecteur: nomLecteur(lecteur), n: usb.nombre_conserve }),
      libelle: t('Préparer'),
    })
    if (!ok) return
    setPreparation(true)
    try {
      const { data } = await api.post<{ copies: ResultatCopie[] }>('/sauvegardes/usb/preparer/', { racine: lecteur.racine })
      setDisponibles(null)
      signalerResultats(data.copies)
    } catch (e) { notifier.erreur(extraireErreur(e)) }
    finally { setPreparation(false); onChange() }
  }

  return (
    <div className={`carte space-y-3 p-4 text-sm ${usb.en_retard ? 'border-amber-300 bg-amber-50' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium"><Usb size={16} className="text-slate-500" /> {t('Clé USB / disque externe')}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondaire btn-petit" onClick={ouvrirListe} disabled={preparation}>{t('Préparer un disque')}</button>
          {usb.lecteurs.some((l) => l.branche) && (
            <button className="btn-primaire btn-petit" onClick={copier} disabled={copieEnCours}>
              {copieEnCours ? t('Copie en cours…') : t('Copier sur la clé maintenant')}
            </button>
          )}
        </div>
      </div>

      <p className="text-slate-600">
        {usb.actif
          ? t('Une copie est faite automatiquement toutes les {heures} h ; les {n} plus récentes sont gardées sur la clé. Laissez la clé branchée.', { heures: usb.intervalle_heures, n: usb.nombre_conserve })
          : t('Copie automatique sur la clé désactivée (SAUVEGARDE_USB_INTERVALLE_HEURES = 0).')}
      </p>

      {disponibles && (
        <div className="rounded-md border border-slate-200 bg-white p-3">
          {disponibles.length === 0
            ? <p className="text-slate-500">{t('Aucun nouveau disque détecté. Branchez une clé USB ou un disque externe, puis réessayez.')}</p>
            : <ul className="space-y-2">
                {disponibles.map((l) => (
                  <li key={l.racine} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <HardDrive size={14} className="me-1 inline text-slate-500" />{nomLecteur(l)}
                      <span className="ms-2 text-xs text-slate-500">
                        {l.type === 'disque' ? t('Disque') : t('Clé USB')}
                        {l.espace_libre != null && ` — ${t('{taille} libres', { taille: formaterTaille(l.espace_libre) })}`}
                      </span>
                    </span>
                    <button className="btn-primaire btn-petit" onClick={() => preparer(l)} disabled={preparation}>{t('Préparer')}</button>
                  </li>
                ))}
              </ul>}
        </div>
      )}

      {usb.lecteurs.length === 0 && !disponibles && (
        <p className="text-amber-700">{t('Aucun disque préparé. Branchez une clé USB, puis cliquez sur « Préparer un disque ».')}</p>
      )}

      {usb.lecteurs.map((l) => (
        <div key={l.identifiant} className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{nomLecteur(l)}</span>
            {l.branche ? <Badge ton="vert">{t('Branché')}</Badge> : <Badge ton="gris">{t('Débranché')}</Badge>}
            {l.en_retard && <Badge ton="orange">{t('En retard')}</Badge>}
          </div>
          <p className="mt-1 text-slate-600">
            {l.derniere_copie ? t('Dernière copie : {date}', { date: formaterDateHeure(l.derniere_copie) }) : t('Aucune copie pour le moment')}
            {l.espace_libre != null && <> — {t('{taille} libres', { taille: formaterTaille(l.espace_libre) })}</>}
          </p>
          {l.branche && (
            <div className="mt-2">
              <p className="text-xs text-slate-500">{t('{n} dernières sauvegardes', { n: usb.nombre_conserve })}</p>
              {l.fichiers.length === 0
                ? <p className="text-xs text-slate-500">{t('Aucune sauvegarde.')}</p>
                : <ul className="mt-1 space-y-0.5 text-xs">
                    {l.fichiers.map((f) => (
                      <li key={f.nom} className="flex flex-wrap gap-x-3">
                        <span className="whitespace-nowrap">{formaterDateHeure(f.date)}</span>
                        <span className="whitespace-nowrap text-slate-500">{formaterTaille(f.taille)}</span>
                        <span className="font-mono text-slate-600">{f.nom}</span>
                      </li>
                    ))}
                  </ul>}
            </div>
          )}
        </div>
      ))}

      {usb.derniere_erreur && (
        <p className="flex items-start gap-2 text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('Dernière erreur ({date}) : {message}', { date: formaterDateHeure(usb.derniere_erreur.date), message: usb.derniere_erreur.message })}</span>
        </p>
      )}
    </div>
  )
}
