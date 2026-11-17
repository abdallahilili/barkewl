import { Printer, Undo2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Badge, tonStatut } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { ModaleRetour } from '../../composants/ModaleRetour'
import { useNotifier } from '../../composants/Notifications'
import { RecuImpression } from '../../composants/RecuImpression'
import { BarreRecherche } from '../../composants/BarreRecherche'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useAuth } from '../../hooks/useAuth'
import { useListe, useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { ModePaiement, Recu, Vente } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { aujourdhui, formaterDateHeure, formaterDateHeureExport, formaterMontant, libelleStatut } from '../../utilitaires/formatage'

import { t } from '../../i18n'
export default function ListeVentes({ modeRecus = false }: { modeRecus?: boolean }) {
  const { utilisateur } = useAuth()
  const notifier = useNotifier()
  const [debut, setDebut] = useState(modeRecus ? '' : aujourdhui())
  const [fin, setFin] = useState(modeRecus ? '' : aujourdhui())
  const [statut, setStatut] = useState('')
  // Filtre par mode de paiement (espèces, Bankily, Masrvi…) : la liste affiche alors le montant réglé avec ce mode.
  const [modePaiement, setModePaiement] = useState('')
  const modes = useOptions<ModePaiement>('/modes-paiement/', {}, !modeRecus)
  const nomMode = modes.find((m) => String(m.id) === modePaiement)?.nom
  const liste = useListe<Vente>(modeRecus ? '/recus/' : '/ventes/', { filtres: modeRecus ? {} : { date_debut: debut, date_fin: fin, statut, mode_paiement: modePaiement }, triInitial: '-date_vente' })
  const [detail, setDetail] = useState<Vente | null>(null)
  const [venteRetour, setVenteRetour] = useState<Vente | null>(null)
  const [recu, setRecu] = useState<Recu | null>(null)
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [annulation, setAnnulation] = useState(false)
  const [approbateur, setApprobateur] = useState('')
  const [pin, setPin] = useState('')
  // Le vendeur doit faire approuver l'annulation par le propriétaire ou le pharmacien (code PIN).
  const besoinApprobation = utilisateur?.role === 'CAISSIER'

  const voirRecu = async (v: Vente) => {
    try { setRecu((await api.get<Recu>(`/recus/${v.id}/`)).data) } catch (e) { notifier.erreur(extraireErreur(e)) }
  }
  const ouvrirDetail = async (v: Vente) => {
    if (modeRecus) { voirRecu(v); return }
    try { setDetail((await api.get<Vente>(`/ventes/${v.id}/`)).data); setAnnulation(false); setMotif(''); setErreur(null) } catch (e) { notifier.erreur(extraireErreur(e)) }
  }
  const annuler = async (e: FormEvent) => {
    e.preventDefault()
    if (!detail) return
    try {
      await api.post(`/ventes/${detail.id}/annuler/`, besoinApprobation
        ? { motif, approbateur_identifiant: approbateur, approbateur_pin: pin }
        : { motif })
      setApprobateur(''); setPin('')
      notifier.succes(t('Vente {reference} annulée : stock remis en place et remboursement enregistré.', { reference: detail.reference }))
      setDetail(null); liste.recharger()
    } catch (err) { setErreur(extraireErreur(err)) }
  }

  // Une vente qui a déjà un retour ne peut plus être annulée (le serveur la refuse) : on passe par un nouveau retour.
  const aDesRetours = !!detail?.lignes?.some((l) => l.deja_retourne > 0)
  const resteARetourner = !!detail?.lignes?.some((l) => l.retournable > 0)

  return (
    <div>
      <EnTetePage titre={modeRecus ? t('Reçus') : t('Historique des ventes')} description={modeRecus ? t('Retrouvez et réimprimez un reçu client.') : t('Ventes enregistrées. Une vente annulée reste visible dans l’historique.')} />
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={t('N° de reçu, client…')}>
        {!modeRecus && <>
          <input type="date" className="champ w-auto" value={debut} onChange={(e) => setDebut(e.target.value)} aria-label={t('Du')} />
          <input type="date" className="champ w-auto" value={fin} onChange={(e) => setFin(e.target.value)} aria-label={t('Au')} />
          <select className="champ w-auto" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label={t('État')}><option value="">{t('Toutes')}</option><option value="VALIDEE">{t('Validées')}</option><option value="ANNULEE">{t('Annulées')}</option></select>
          <select className="champ w-auto" value={modePaiement} onChange={(e) => setModePaiement(e.target.value)} aria-label={t('Mode de paiement')}>
            <option value="">{t('Tous les modes')}</option>
            {modes.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </>}
      </BarreRecherche>
      <TableauDonnees<Vente>
        colonnes={[
          { cle: 'reference', titre: 'Reçu', tri: 'reference', rendu: (v) => <span className="font-medium">{v.reference}</span> },
          { cle: 'date_vente', titre: 'Date', tri: 'date_vente', rendu: (v) => formaterDateHeure(v.date_vente), exportRendu: (v) => formaterDateHeureExport(v.date_vente) },
          { cle: 'client_nom', titre: 'Client', rendu: (v) => v.client_nom ?? '—' },
          { cle: 'caissier_nom', titre: 'Caissier' },
          { cle: 'modes_paiement', titre: 'Paiement' },
          ...(!modeRecus && modePaiement ? [{
            cle: 'montant_mode', titre: 'Montant du mode', alignement: 'droite' as const,
            rendu: (v: Vente) => formaterMontant(v.montant_mode),
            exportRendu: (v: Vente) => (v.montant_mode == null ? null : Number(v.montant_mode)),
            somme: (v: Vente) => (v.statut === 'VALIDEE' ? Number(v.montant_mode ?? 0) : 0),   // une vente annulée ne compte pas
          }] : []),
          { cle: 'total', titre: 'Total', alignement: 'droite', tri: 'total', rendu: (v) => formaterMontant(v.total),
            somme: modeRecus ? undefined : (v) => (v.statut === 'VALIDEE' ? Number(v.total) : 0) },
          { cle: 'statut', titre: 'État', rendu: (v) => <Badge ton={tonStatut(v.statut)}>{libelleStatut(v.statut)}</Badge> },
          { cle: 'actions', titre: '', alignement: 'droite', rendu: (v) => <button className="btn-discret btn-petit" onClick={(e) => { e.stopPropagation(); voirRecu(v) }}><Printer size={14} /> {' '}{t('Reçu')}</button> },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(v) => v.id} onClicLigne={ouvrirDetail} messageVide={t('Aucune vente trouvée.')}
        titre={modeRecus ? t('Reçus') : t('Historique des ventes')} idTableau={modeRecus ? 'recus' : 'ventes'}
        endpoint={modeRecus ? '/recus/' : '/ventes/'}
        libelleTotal="Total (ventes validées)"
        resume={!modeRecus && liste.montantTotal != null ? (
          <span className="font-semibold text-slate-700">
            {nomMode ? t('Total encaissé en {mode}', { mode: nomMode }) : t('Total (ventes validées)')}{' : '}{formaterMontant(liste.montantTotal)}
          </span>
        ) : undefined}
        parametresRequete={{ ...(modeRecus ? {} : { date_debut: debut, date_fin: fin, statut, mode_paiement: modePaiement }), ...(liste.recherche ? { recherche: liste.recherche } : {}), ...(liste.tri ? { tri: liste.tri } : {}) }} />

      <Modale ouverte={!!detail} titre={detail ? t('Vente {reference}', { reference: detail.reference }) : ''} onFermer={() => setDetail(null)} largeur="grande"
        pied={<>
          <button className="btn-secondaire" onClick={() => setDetail(null)}>{t('Fermer')}</button>
          {detail && <button className="btn-secondaire" onClick={() => voirRecu(detail)}><Printer size={16} /> {' '}{t('Reçu')}</button>}
          {detail?.statut === 'VALIDEE' && resteARetourner && ['ADMIN', 'PHARMACIEN', 'CAISSIER'].includes(utilisateur?.role ?? '') && !annulation && <button className="btn-secondaire" onClick={() => { setVenteRetour(detail); setDetail(null) }}><Undo2 size={16} /> {' '}{t('Retour partiel')}</button>}
          {detail?.statut === 'VALIDEE' && !aDesRetours && ['ADMIN', 'PHARMACIEN', 'CAISSIER'].includes(utilisateur?.role ?? '') && !annulation && <button className="btn-danger" onClick={() => setAnnulation(true)}>{t('Annuler cette vente')}</button>}
        </>}>
        {detail && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{formaterDateHeure(detail.date_vente)} {' '}{t('· Caissier :')}{' '}{detail.caissier_nom} {' '}{t('· Dépôt :')}{' '}{detail.depot_nom}{detail.client_nom ? t(' · Client : {nom}', { nom: detail.client_nom }) : ''}</p>
            {detail.statut === 'ANNULEE' && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{t('Vente annulée. Motif :')}{' '}{detail.motif_annulation}{detail.annulation_approuvee_par_nom && <>{' · '}{t('Approuvée par {nom}', { nom: detail.annulation_approuvee_par_nom })}</>}</p>}
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-start text-slate-600"><tr><th className="px-3 py-2">{t('Médicament')}</th><th className="px-3 py-2">{t('Lot')}</th><th className="px-3 py-2 text-end">{t('Qté')}</th><th className="px-3 py-2 text-end">{t('Prix')}</th><th className="px-3 py-2 text-end">{t('Total')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lignes?.map((l) => <tr key={l.id}><td className="px-3 py-2">{l.medicament_nom}{l.deja_retourne > 0 && <span className="block text-xs text-amber-700">{t('{n} déjà rendu(s)', { n: l.deja_retourne })}</span>}</td><td className="px-3 py-2">{l.numero_lot}</td><td className="px-3 py-2 text-end">{l.quantite}{l.conditionnement !== 'BOITE' && <span className="text-slate-500"> {l.conditionnement_libelle}</span>}</td><td className="px-3 py-2 text-end">{formaterMontant(l.prix_unitaire)}</td><td className="px-3 py-2 text-end">{formaterMontant(l.total)}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <div>{detail.paiements?.map((p) => <p key={p.id}>{p.mode_paiement_nom} : {formaterMontant(p.montant)}</p>)}</div>
              <p className="text-lg font-semibold">{t('Total :')}{' '}{formaterMontant(detail.total)}</p>
            </div>
            {annulation && (
              <form onSubmit={annuler} className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-900">{t('L\'annulation remet les quantités en stock et enregistre un remboursement dans votre session de caisse. Cette action est tracée.')}</p>
                <MessageErreur message={erreur} />
                <Champ libelle={t('Motif de l\'annulation')} requis><input className="champ" value={motif} onChange={(e) => setMotif(e.target.value)} required /></Champ>
                {besoinApprobation && (
                  <div className="space-y-2 rounded-md border border-red-200 bg-white p-3">
                    <p className="text-sm font-medium text-nuit-800">{t('Approbation du propriétaire ou du pharmacien')}</p>
                    <p className="text-xs text-slate-500">{t('Il saisit lui-même son identifiant et son code PIN sur cet écran.')}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Champ libelle={t('Identifiant')} requis><input className="champ" value={approbateur} onChange={(e) => setApprobateur(e.target.value)} autoComplete="off" required /></Champ>
                      <Champ libelle={t('Code PIN')} requis><input className="champ text-center tracking-[0.4em]" type="password" inputMode="numeric" maxLength={6} dir="ltr"
                        value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="off" required /></Champ>
                    </div>
                  </div>
                )}
                <div className="flex gap-2"><button type="button" className="btn-secondaire" onClick={() => setAnnulation(false)}>{t('Ne pas annuler')}</button><button className="btn-danger">{t('Confirmer l\'annulation')}</button></div>
              </form>
            )}
          </div>
        )}
      </Modale>
      <ModaleRetour vente={venteRetour} onFermer={() => setVenteRetour(null)}
        onFait={(r) => { setVenteRetour(null); notifier.succes(t('Retour {reference} enregistré : remboursement de {montant} en caisse.', { reference: r.reference, montant: formaterMontant(r.total) })); liste.recharger() }} />
      <RecuImpression recu={recu} onFermer={() => setRecu(null)} />
    </div>
  )
}
