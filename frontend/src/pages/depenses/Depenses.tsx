import { Plus } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Badge } from '../../composants/Badge'
import { BarreRecherche } from '../../composants/BarreRecherche'
import { Champ } from '../../composants/Champ'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe, useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { CategorieDepense, Depense, ModePaiement } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { aujourdhui, formaterDate, formaterDateExport, formaterMontant, libelleStatut, premierJourMois } from '../../utilitaires/formatage'
import { categoriesDepense, libelleCategorieDepense } from './categories'

import { t, traduireServeur } from '../../i18n'

const FORMULAIRE_VIDE = { categorie: 'LOYER' as CategorieDepense, libelle: '', montant: '', date_depense: aujourdhui(), payee_depuis_caisse: true, mode_paiement: '', note: '' }

export default function Depenses() {
  const notifier = useNotifier()
  const [debut, setDebut] = useState(premierJourMois())
  const [fin, setFin] = useState(aujourdhui())
  const [categorie, setCategorie] = useState('')
  const [statut, setStatut] = useState('')
  const [source, setSource] = useState('')
  const liste = useListe<Depense>('/depenses/', { filtres: { date_debut: debut, date_fin: fin, categorie, statut, source }, triInitial: '-date_depense' })
  const modes = useOptions<ModePaiement>('/modes-paiement/')
  const [nouvelle, setNouvelle] = useState(false)
  const [formulaire, setFormulaire] = useState(FORMULAIRE_VIDE)
  const [detail, setDetail] = useState<Depense | null>(null)
  const [annulation, setAnnulation] = useState(false)
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const ouvrirNouvelle = () => { setFormulaire({ ...FORMULAIRE_VIDE, date_depense: aujourdhui() }); setErreur(null); setNouvelle(true) }

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreur(null)
    try {
      await api.post('/depenses/', {
        categorie: formulaire.categorie, libelle: formulaire.libelle, montant: Number(formulaire.montant), date_depense: formulaire.date_depense,
        payee_depuis_caisse: formulaire.payee_depuis_caisse, note: formulaire.note,
        ...(!formulaire.payee_depuis_caisse && formulaire.mode_paiement ? { mode_paiement: Number(formulaire.mode_paiement) } : {}),
      })
      notifier.succes(formulaire.payee_depuis_caisse ? t('Dépense enregistrée : les espèces ont été déduites de la caisse.') : t('Dépense enregistrée.'))
      setNouvelle(false); liste.recharger()
    } catch (err) { setErreur(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  const annuler = async (e: FormEvent) => {
    e.preventDefault()
    if (!detail) return
    setErreur(null)
    try {
      await api.post(`/depenses/${detail.id}/annuler/`, { motif })
      notifier.succes(detail.payee_depuis_caisse ? t('Dépense annulée : l\'espèce est remise en caisse.') : t('Dépense annulée.'))
      setDetail(null); liste.recharger()
    } catch (err) { setErreur(extraireErreur(err)) }
  }

  return (
    <div>
      <EnTetePage titre={t('Dépenses')} description={t('Loyer, électricité, salaires… Une dépense n\'est jamais supprimée : on l\'annule en indiquant un motif.')}
        actions={<button className="btn-primaire" onClick={ouvrirNouvelle}><Plus size={16} /> {' '}{t('Nouvelle dépense')}</button>} />
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={t('N°, libellé…')}>
        <input type="date" className="champ w-auto" value={debut} onChange={(e) => setDebut(e.target.value)} aria-label={t('Du')} />
        <input type="date" className="champ w-auto" value={fin} onChange={(e) => setFin(e.target.value)} aria-label={t('Au')} />
        <select className="champ w-auto" value={categorie} onChange={(e) => setCategorie(e.target.value)} aria-label={t('Catégorie')}>
          <option value="">{t('Toutes les catégories')}</option>
          {categoriesDepense().map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
        </select>
        <select className="champ w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label={t('Paiement')}>
          <option value="">{t('Tous les paiements')}</option><option value="caisse">{t('Payées depuis la caisse')}</option><option value="autre">{t('Payées autrement')}</option>
        </select>
        <select className="champ w-auto" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label={t('État')}>
          <option value="">{t('Toutes')}</option><option value="VALIDEE">{t('Validées')}</option><option value="ANNULEE">{t('Annulées')}</option>
        </select>
      </BarreRecherche>
      <TableauDonnees<Depense>
        colonnes={[
          { cle: 'reference', titre: 'N°', tri: 'reference', rendu: (d) => <span className="font-medium">{d.reference}</span> },
          { cle: 'date_depense', titre: 'Date', tri: 'date_depense', rendu: (d) => formaterDate(d.date_depense), exportRendu: (d) => formaterDateExport(d.date_depense) },
          { cle: 'categorie', titre: 'Catégorie', tri: 'categorie', rendu: (d) => libelleCategorieDepense(d.categorie), exportRendu: (d) => libelleCategorieDepense(d.categorie) },
          { cle: 'libelle', titre: 'Libellé' },
          { cle: 'payee_depuis_caisse', titre: 'Paiement', rendu: (d) => d.payee_depuis_caisse ? t('Caisse (espèces)') : d.mode_paiement_nom ?? t('Autre'), exportRendu: (d) => d.payee_depuis_caisse ? t('Caisse (espèces)') : d.mode_paiement_nom ?? t('Autre') },
          { cle: 'utilisateur_nom', titre: 'Saisi par', cacheParDefaut: true },
          { cle: 'montant', titre: 'Montant', alignement: 'droite', tri: 'montant', rendu: (d) => formaterMontant(d.montant), somme: (d) => (d.statut === 'VALIDEE' ? Number(d.montant) : 0) },
          { cle: 'statut', titre: 'État', tri: 'statut', rendu: (d) => <Badge ton={d.statut === 'VALIDEE' ? 'vert' : 'rouge'}>{libelleStatut(d.statut)}</Badge>, exportRendu: (d) => libelleStatut(d.statut) },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(d) => d.id}
        onClicLigne={(d) => { setDetail(d); setAnnulation(false); setMotif(''); setErreur(null) }} messageVide={t('Aucune dépense trouvée.')}
        titre={t('Dépenses')} idTableau="depenses" endpoint="/depenses/" libelleTotal="Total (dépenses validées)"
        resume={liste.montantTotal != null ? <span className="font-semibold text-slate-700">{t('Total (dépenses validées)')}{' : '}{formaterMontant(liste.montantTotal)}</span> : undefined}
        parametresRequete={{ date_debut: debut, date_fin: fin, categorie, statut, source, ...(liste.recherche ? { recherche: liste.recherche } : {}), ...(liste.tri ? { tri: liste.tri } : {}) }} />

      <Modale ouverte={nouvelle} titre={t('Nouvelle dépense')} onFermer={() => setNouvelle(false)} largeur="moyenne"
        pied={<><button className="btn-secondaire" onClick={() => setNouvelle(false)}>{t('Annuler')}</button><button className="btn-primaire" type="submit" form="formulaire-depense" disabled={envoi}>{t('Enregistrer')}</button></>}>
        <form id="formulaire-depense" onSubmit={enregistrer} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><MessageErreur message={erreur} /></div>
          <Champ libelle={t('Catégorie')} requis>
            <select className="champ" value={formulaire.categorie} onChange={(e) => setFormulaire({ ...formulaire, categorie: e.target.value as CategorieDepense })}>
              {categoriesDepense().map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
            </select>
          </Champ>
          <Champ libelle={t('Date')} requis><input className="champ" type="date" max={aujourdhui()} value={formulaire.date_depense} onChange={(e) => setFormulaire({ ...formulaire, date_depense: e.target.value })} required /></Champ>
          <Champ libelle={t('Libellé')} requis className="sm:col-span-2"><input className="champ" value={formulaire.libelle} maxLength={200} onChange={(e) => setFormulaire({ ...formulaire, libelle: e.target.value })} placeholder={t('Ex. Loyer de novembre')} required /></Champ>
          <Champ libelle={t('Montant')} requis><input className="champ" type="number" min={0.01} step="0.01" value={formulaire.montant} onChange={(e) => setFormulaire({ ...formulaire, montant: e.target.value })} required /></Champ>
          <Champ libelle={t('Note (facultatif)')}><input className="champ" value={formulaire.note} maxLength={255} onChange={(e) => setFormulaire({ ...formulaire, note: e.target.value })} /></Champ>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={formulaire.payee_depuis_caisse} onChange={(e) => setFormulaire({ ...formulaire, payee_depuis_caisse: e.target.checked })} />
            <span><span className="font-medium">{t('Payée depuis la caisse')}</span><br /><span className="text-slate-500">{t('Les espèces sont déduites de votre session de caisse ouverte (il faut en avoir une).')}</span></span>
          </label>
          {!formulaire.payee_depuis_caisse && (
            <Champ libelle={t('Payée par')} className="sm:col-span-2" aide={t('Virement, paiement mobile, banque… (facultatif). Aucune écriture n\'est faite en caisse.')}>
              <select className="champ" value={formulaire.mode_paiement} onChange={(e) => setFormulaire({ ...formulaire, mode_paiement: e.target.value })}>
                <option value="">{t('— Non précisé —')}</option>
                {modes.filter((m) => m.type !== 'ESPECES').map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </Champ>
          )}
        </form>
      </Modale>

      <Modale ouverte={!!detail} titre={detail ? t('Dépense {reference}', { reference: detail.reference }) : ''} onFermer={() => setDetail(null)} largeur="moyenne"
        pied={<>
          <button className="btn-secondaire" onClick={() => setDetail(null)}>{t('Fermer')}</button>
          {detail?.statut === 'VALIDEE' && !annulation && <button className="btn-danger" onClick={() => setAnnulation(true)}>{t('Annuler cette dépense')}</button>}
        </>}>
        {detail && (
          <div className="space-y-3 text-sm">
            <p className="text-lg font-semibold">{formaterMontant(detail.montant)} <span className="text-sm font-normal text-slate-600">— {libelleCategorieDepense(detail.categorie)}</span></p>
            <p>{detail.libelle}</p>
            <p className="text-slate-600">{formaterDate(detail.date_depense)} {' '}{t('· Saisi par :')}{' '}{detail.utilisateur_nom} {' · '}{detail.payee_depuis_caisse ? t('Payée depuis la caisse (espèces)') : t('Payée par : {mode}', { mode: detail.mode_paiement_nom ?? t('Autre') })}</p>
            {detail.note && <p className="text-slate-600">{detail.note}</p>}
            {detail.statut === 'ANNULEE' && <p className="rounded-md bg-red-50 px-3 py-2 text-red-800">{t('Dépense annulée par {nom}. Motif :', { nom: detail.annule_par_nom ?? '—' })}{' '}{traduireServeur(detail.motif_annulation)}</p>}
            {annulation && (
              <form onSubmit={annuler} className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
                <p className="text-red-900">{detail.payee_depuis_caisse ? t('L\'annulation remet l\'espèce en caisse (dans une session ouverte). Cette action est tracée.') : t('La dépense reste visible dans la liste, marquée comme annulée. Cette action est tracée.')}</p>
                <MessageErreur message={erreur} />
                <Champ libelle={t('Motif de l\'annulation')} requis><input className="champ" value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={255} required /></Champ>
                <div className="flex gap-2"><button type="button" className="btn-secondaire" onClick={() => setAnnulation(false)}>{t('Ne pas annuler')}</button><button className="btn-danger">{t('Confirmer l\'annulation')}</button></div>
              </form>
            )}
          </div>
        )}
      </Modale>
    </div>
  )
}
