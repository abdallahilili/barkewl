import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, tonStatut } from '../../composants/Badge'
import { useConfirmer } from '../../composants/Confirmation'
import { Chargement, EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { useNotifier } from '../../composants/Notifications'
import { api } from '../../services/api'
import type { Inventaire } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { formaterDate, formaterDateHeure, libelleStatut } from '../../utilitaires/formatage'

import { t } from '../../i18n'
export default function InventaireDetail() {
  const { id } = useParams()
  const notifier = useNotifier()
  const confirmer = useConfirmer()
  const [inventaire, setInventaire] = useState<Inventaire | null>(null)
  const [saisies, setSaisies] = useState<Record<number, string>>({})
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [occupe, setOccupe] = useState(false)

  const appliquer = useCallback((inv: Inventaire) => {
    setInventaire(inv)
    setSaisies(Object.fromEntries((inv.lignes ?? []).map((l) => [l.id, l.quantite_physique == null ? '' : String(l.quantite_physique)])))
  }, [])

  useEffect(() => {
    api.get<Inventaire>(`/inventaires/${id}/`).then((r) => appliquer(r.data)).catch((e) => setErreur(extraireErreur(e)))
  }, [id, appliquer])

  const modifiable = inventaire?.statut === 'BROUILLON'
  const lignes = useMemo(() => (inventaire?.lignes ?? []).filter((l) => `${l.medicament_nom} ${l.numero_lot}`.toLowerCase().includes(recherche.toLowerCase())), [inventaire, recherche])
  const nonComptees = (inventaire?.lignes ?? []).filter((l) => saisies[l.id] === '' || saisies[l.id] == null).length
  const ecarts = (inventaire?.lignes ?? []).filter((l) => saisies[l.id] !== '' && Number(saisies[l.id]) !== l.quantite_theorique).length

  const enregistrer = async (silencieux = false) => {
    if (!inventaire) return false
    setOccupe(true); setErreur(null)
    try {
      const { data } = await api.post<Inventaire>(`/inventaires/${inventaire.id}/saisir/`, {
        lignes: (inventaire.lignes ?? []).map((l) => ({ id: l.id, quantite_physique: saisies[l.id] === '' ? null : Number(saisies[l.id]) })),
      })
      appliquer(data)
      if (!silencieux) notifier.succes(t('Saisies enregistrées.'))
      return true
    } catch (e) { setErreur(extraireErreur(e)); return false }
    finally { setOccupe(false) }
  }

  const action = async (nom: 'recharger' | 'valider' | 'annuler') => {
    if (!inventaire) return
    if (nom === 'valider') {
      const ok = await confirmer({ titre: t('Valider l\'inventaire'), message: t("{n} écart(s) seront corrigés par des mouvements d'ajustement. Cette opération est définitive. Continuer ?", { n: ecarts }), libelle: t('Valider') })
      if (!ok || !(await enregistrer(true))) return
    }
    if (nom === 'annuler') {
      const ok = await confirmer({ titre: t('Annuler l\'inventaire'), message: t('Aucune correction de stock ne sera appliquée. Continuer ?'), libelle: t('Annuler l\'inventaire'), danger: true })
      if (!ok) return
    }
    if (nom === 'recharger') {
      const ok = await confirmer({ titre: t('Recharger le stock théorique'), message: t('Les quantités théoriques seront relues depuis le stock actuel. Vos quantités déjà comptées sont conservées.'), libelle: t('Recharger') })
      if (!ok || !(await enregistrer(true))) return
    }
    setOccupe(true); setErreur(null)
    try {
      const { data } = await api.post<Inventaire>(`/inventaires/${inventaire.id}/${nom}/`)
      appliquer(data)
      notifier.succes(nom === 'valider' ? t('Inventaire validé : le stock a été ajusté.') : nom === 'annuler' ? t('Inventaire annulé.') : t('Stock théorique rechargé.'))
    } catch (e) { setErreur(extraireErreur(e)) }
    finally { setOccupe(false) }
  }

  if (!inventaire) return erreur ? <MessageErreur message={erreur} /> : <Chargement />

  return (
    <div>
      <Link to="/stock/inventaires" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft size={14} className="rtl:-scale-x-100" /> {' '}{t('Retour aux inventaires')}</Link>
      <EnTetePage titre={t('Inventaire {reference}', { reference: inventaire.reference })} description={t('{depot} · créé le {date} par {nom}', { depot: inventaire.depot_nom, date: formaterDateHeure(inventaire.date_creation), nom: inventaire.utilisateur_nom })}
        actions={<>
          <Badge ton={tonStatut(inventaire.statut)}>{inventaire.statut === 'BROUILLON' ? t('En cours') : libelleStatut(inventaire.statut)}</Badge>
          {modifiable && <>
            <button className="btn-secondaire" disabled={occupe} onClick={() => action('recharger')}>{t('Recharger le stock')}</button>
            <button className="btn-secondaire" disabled={occupe} onClick={() => enregistrer()}>{t('Enregistrer les saisies')}</button>
            <button className="btn-secondaire" disabled={occupe} onClick={() => action('annuler')}>{t('Annuler')}</button>
            <button className="btn-primaire" disabled={occupe || nonComptees > 0} onClick={() => action('valider')}>{t('Valider l\'inventaire')}</button>
          </>}
        </>} />
      <MessageErreur message={erreur} />
      {modifiable && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          <span>{nonComptees} {' '}{t('ligne(s) non comptée(s) ·')}{' '}{ecarts} {' '}{t('écart(s)')}</span>
          <button className="btn-discret btn-petit" onClick={() => setSaisies((s) => { const n = { ...s }; for (const l of inventaire.lignes ?? []) if (n[l.id] === '') n[l.id] = String(l.quantite_theorique); return n })}>
            
            {t('Remplir les lignes vides avec la quantité théorique')}
          </button>
          <span className="text-slate-500">{t('La validation n\'est possible que lorsque toutes les lignes sont comptées.')}</span>
        </div>
      )}
      <input className="champ mb-3 max-w-sm" placeholder={t('Filtrer par médicament ou lot…')} value={recherche} onChange={(e) => setRecherche(e.target.value)} aria-label={t('Filtrer les lignes')} />
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-start text-slate-600">
            <tr><th className="px-3 py-2.5">{t('Médicament')}</th><th className="px-3 py-2.5">{t('Lot')}</th><th className="px-3 py-2.5">{t('Péremption')}</th><th className="px-3 py-2.5 text-end">{t('Théorique')}</th><th className="px-3 py-2.5 text-end">{t('Compté')}</th><th className="px-3 py-2.5 text-end">{t('Écart')}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">{t('Aucune ligne.')}</td></tr>}
            {lignes.map((l) => {
              const compte = saisies[l.id]
              const ecart = compte === '' || compte == null ? null : Number(compte) - l.quantite_theorique
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-medium">{l.medicament_nom}{l.unites_par_boite > 1 && <span className="block text-xs font-normal text-slate-500">{t('à compter en unités (1 boîte =')}{' '}{l.unites_par_boite})</span>}</td><td className="px-3 py-2">{l.numero_lot}</td><td className="px-3 py-2">{formaterDate(l.date_peremption)}</td>
                  <td className="px-3 py-2 text-end">{l.quantite_theorique}</td>
                  <td className="px-3 py-2 text-end">
                    {modifiable ? <input type="number" min={0} className="champ w-24 py-1 text-end" value={compte ?? ''} onChange={(e) => setSaisies((s) => ({ ...s, [l.id]: e.target.value }))} aria-label={t('Quantité comptée {nom}', { nom: l.medicament_nom })} /> : (l.quantite_physique ?? '—')}
                  </td>
                  <td className={`px-3 py-2 text-end font-semibold ${!ecart ? 'text-slate-400' : ecart > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{ecart == null ? '—' : ecart > 0 ? `+${ecart}` : ecart}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
