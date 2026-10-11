import { Printer } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Badge, tonStatut } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { RecuImpression } from '../../composants/RecuImpression'
import { BarreRecherche } from '../../composants/BarreRecherche'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useAuth } from '../../hooks/useAuth'
import { useListe } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Recu, Vente } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { aujourdhui, formaterDateHeure, formaterDateHeureExport, formaterMontant, libelleStatut } from '../../utilitaires/formatage'

export default function ListeVentes({ modeRecus = false }: { modeRecus?: boolean }) {
  const { utilisateur } = useAuth()
  const notifier = useNotifier()
  const [debut, setDebut] = useState(modeRecus ? '' : aujourdhui())
  const [fin, setFin] = useState(modeRecus ? '' : aujourdhui())
  const [statut, setStatut] = useState('')
  const liste = useListe<Vente>(modeRecus ? '/recus/' : '/ventes/', { filtres: modeRecus ? {} : { date_debut: debut, date_fin: fin, statut }, triInitial: '-date_vente' })
  const [detail, setDetail] = useState<Vente | null>(null)
  const [recu, setRecu] = useState<Recu | null>(null)
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [annulation, setAnnulation] = useState(false)

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
      await api.post(`/ventes/${detail.id}/annuler/`, { motif })
      notifier.succes(`Vente ${detail.reference} annulée : stock remis en place et remboursement enregistré.`)
      setDetail(null); liste.recharger()
    } catch (err) { setErreur(extraireErreur(err)) }
  }

  return (
    <div>
      <EnTetePage titre={modeRecus ? 'Reçus' : 'Historique des ventes'} description={modeRecus ? 'Retrouvez et réimprimez un reçu client.' : 'Ventes enregistrées. Une vente annulée reste visible dans l’historique.'} />
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder="N° de reçu, client…">
        {!modeRecus && <>
          <input type="date" className="champ w-auto" value={debut} onChange={(e) => setDebut(e.target.value)} aria-label="Du" />
          <input type="date" className="champ w-auto" value={fin} onChange={(e) => setFin(e.target.value)} aria-label="Au" />
          <select className="champ w-auto" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="État"><option value="">Toutes</option><option value="VALIDEE">Validées</option><option value="ANNULEE">Annulées</option></select>
        </>}
      </BarreRecherche>
      <TableauDonnees<Vente>
        colonnes={[
          { cle: 'reference', titre: 'Reçu', tri: 'reference', rendu: (v) => <span className="font-medium">{v.reference}</span> },
          { cle: 'date_vente', titre: 'Date', tri: 'date_vente', rendu: (v) => formaterDateHeure(v.date_vente), exportRendu: (v) => formaterDateHeureExport(v.date_vente) },
          { cle: 'client_nom', titre: 'Client', rendu: (v) => v.client_nom ?? '—' },
          { cle: 'caissier_nom', titre: 'Caissier' },
          { cle: 'modes_paiement', titre: 'Paiement' },
          { cle: 'total', titre: 'Total', alignement: 'droite', tri: 'total', rendu: (v) => formaterMontant(v.total) },
          { cle: 'statut', titre: 'État', rendu: (v) => <Badge ton={tonStatut(v.statut)}>{libelleStatut(v.statut)}</Badge> },
          { cle: 'actions', titre: '', alignement: 'droite', rendu: (v) => <button className="btn-discret btn-petit" onClick={(e) => { e.stopPropagation(); voirRecu(v) }}><Printer size={14} /> Reçu</button> },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(v) => v.id} onClicLigne={ouvrirDetail} messageVide="Aucune vente trouvée."
        titre={modeRecus ? 'Reçus' : 'Historique des ventes'} />

      <Modale ouverte={!!detail} titre={detail ? `Vente ${detail.reference}` : ''} onFermer={() => setDetail(null)} largeur="grande"
        pied={<>
          <button className="btn-secondaire" onClick={() => setDetail(null)}>Fermer</button>
          {detail && <button className="btn-secondaire" onClick={() => voirRecu(detail)}><Printer size={16} /> Reçu</button>}
          {detail?.statut === 'VALIDEE' && utilisateur?.role === 'ADMIN' && !annulation && <button className="btn-danger" onClick={() => setAnnulation(true)}>Annuler cette vente</button>}
        </>}>
        {detail && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">{formaterDateHeure(detail.date_vente)} · Caissier : {detail.caissier_nom} · Dépôt : {detail.depot_nom}{detail.client_nom ? ` · Client : ${detail.client_nom}` : ''}</p>
            {detail.statut === 'ANNULEE' && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">Vente annulée. Motif : {detail.motif_annulation}</p>}
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Médicament</th><th className="px-3 py-2">Lot</th><th className="px-3 py-2 text-right">Qté</th><th className="px-3 py-2 text-right">Prix</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lignes?.map((l) => <tr key={l.id}><td className="px-3 py-2">{l.medicament_nom}</td><td className="px-3 py-2">{l.numero_lot}</td><td className="px-3 py-2 text-right">{l.quantite}</td><td className="px-3 py-2 text-right">{formaterMontant(l.prix_unitaire)}</td><td className="px-3 py-2 text-right">{formaterMontant(l.total)}</td></tr>)}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <div>{detail.paiements?.map((p) => <p key={p.id}>{p.mode_paiement_nom} : {formaterMontant(p.montant)}</p>)}</div>
              <p className="text-lg font-semibold">Total : {formaterMontant(detail.total)}</p>
            </div>
            {annulation && (
              <form onSubmit={annuler} className="space-y-3 rounded-md border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-900">L'annulation remet les quantités en stock et enregistre un remboursement dans votre session de caisse. Cette action est tracée.</p>
                <MessageErreur message={erreur} />
                <Champ libelle="Motif de l'annulation" requis><input className="champ" value={motif} onChange={(e) => setMotif(e.target.value)} required /></Champ>
                <div className="flex gap-2"><button type="button" className="btn-secondaire" onClick={() => setAnnulation(false)}>Ne pas annuler</button><button className="btn-danger">Confirmer l'annulation</button></div>
              </form>
            )}
          </div>
        )}
      </Modale>
      <RecuImpression recu={recu} onFermer={() => setRecu(null)} />
    </div>
  )
}
