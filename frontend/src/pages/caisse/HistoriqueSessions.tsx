import { FormEvent, useEffect, useState } from 'react'
import { Badge, tonStatut } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { ResumeSession } from '../../fonctionnalites/ResumeSession'
import { useAuth } from '../../hooks/useAuth'
import { useListe } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { MouvementCaisse, SessionCaisse } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { formaterDateHeure, formaterDateHeureExport, formaterMontant, libelleStatut } from '../../utilitaires/formatage'

function ClotureAdmin({ session, onCloturee }: { session: SessionCaisse; onCloturee: (s: SessionCaisse) => void }) {
  const notifier = useNotifier()
  const [ouverte, setOuverte] = useState(false)
  const [montantReel, setMontantReel] = useState('')
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const ecartPrevu = montantReel !== '' ? Number(montantReel) - session.resume.montant_attendu : null

  const cloturer = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreur(null)
    try {
      const { data } = await api.post<SessionCaisse>(`/sessions-caisse/${session.id}/fermer/`, { montant_reel: Number(montantReel), note })
      notifier.succes('Session clôturée.')
      setOuverte(false); onCloturee(data)
    } catch (err) { setErreur(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  if (!ouverte) {
    return (
      <button className="btn-primaire" onClick={() => { setMontantReel(''); setNote(''); setErreur(null); setOuverte(true) }}>
        Clôturer cette session (à la place du caissier)
      </button>
    )
  }
  return (
    <form onSubmit={cloturer} className="carte space-y-3 p-4">
      <MessageErreur message={erreur} />
      <p className="text-sm text-slate-600">Espèces attendues en caisse : <strong>{formaterMontant(session.resume.montant_attendu)}</strong></p>
      <Champ libelle="Espèces comptées" requis><input className="champ" type="number" min={0} step="0.01" value={montantReel} onChange={(e) => setMontantReel(e.target.value)} required autoFocus /></Champ>
      {ecartPrevu != null && (
        <p className={`rounded-md px-3 py-2 text-sm ${ecartPrevu === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          Écart : <strong>{ecartPrevu > 0 ? '+' : ''}{formaterMontant(ecartPrevu)}</strong> {ecartPrevu === 0 ? '— la caisse est juste.' : ecartPrevu > 0 ? '(excédent)' : '(manquant)'}
        </p>
      )}
      <Champ libelle="Note (facultatif)"><input className="champ" value={note} onChange={(e) => setNote(e.target.value)} /></Champ>
      <div className="flex gap-2">
        <button type="button" className="btn-secondaire" onClick={() => setOuverte(false)}>Annuler</button>
        <button className="btn-primaire" disabled={envoi}>{envoi ? 'Clôture…' : 'Clôturer la session'}</button>
      </div>
    </form>
  )
}

function DetailSession({ session, admin, onFermer, onCloturee }: {
  session: SessionCaisse | null; admin: boolean; onFermer: () => void; onCloturee: (s: SessionCaisse) => void
}) {
  const [mouvements, setMouvements] = useState<MouvementCaisse[]>([])
  useEffect(() => {
    if (session) api.get<MouvementCaisse[]>(`/sessions-caisse/${session.id}/mouvements/`).then((r) => setMouvements(r.data)).catch(() => setMouvements([]))
  }, [session])
  return (
    <Modale ouverte={!!session} titre={session ? `Session n° ${session.id} — ${session.caisse_nom}` : ''} onFermer={onFermer} largeur="grande"
      pied={<button className="btn-secondaire" onClick={onFermer}>Fermer</button>}>
      {session && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Caissier : {session.caissier_nom} · Ouverte le {formaterDateHeure(session.date_ouverture)}{session.date_fermeture && ` · Clôturée le ${formaterDateHeure(session.date_fermeture)}`}</p>
          <ResumeSession session={session} />
          {session.note && <p className="text-sm text-slate-600">Note : {session.note}</p>}
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Heure</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Paiement</th><th className="px-3 py-2">Motif</th><th className="px-3 py-2 text-right">Montant</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {mouvements.map((m) => (
                  <tr key={m.id}><td className="px-3 py-2">{formaterDateHeure(m.date_mouvement)}</td><td className="px-3 py-2">{m.type_libelle}</td><td className="px-3 py-2">{m.mode_paiement_nom}</td><td className="px-3 py-2">{m.motif}</td><td className="px-3 py-2 text-right">{formaterMontant(m.montant)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {admin && session.statut === 'OUVERTE' && <ClotureAdmin session={session} onCloturee={onCloturee} />}
        </div>
      )}
    </Modale>
  )
}

export default function HistoriqueSessions() {
  const { utilisateur } = useAuth()
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [statut, setStatut] = useState('')
  const [detail, setDetail] = useState<SessionCaisse | null>(null)
  const liste = useListe<SessionCaisse>('/sessions-caisse/', { filtres: { date_debut: debut, date_fin: fin, statut }, triInitial: '-date_ouverture' })

  return (
    <div>
      <EnTetePage titre="Historique des sessions" description={utilisateur?.role === 'CAISSIER' ? 'Vos sessions de caisse.' : 'Toutes les sessions de caisse, avec les écarts constatés.'} />
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div><label className="etiquette">Du</label><input type="date" className="champ" value={debut} onChange={(e) => setDebut(e.target.value)} /></div>
        <div><label className="etiquette">Au</label><input type="date" className="champ" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
        <div><label className="etiquette">État</label>
          <select className="champ" value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Toutes</option><option value="OUVERTE">Ouvertes</option><option value="FERMEE">Clôturées</option></select>
        </div>
      </div>
      <TableauDonnees<SessionCaisse>
        colonnes={[
          { cle: 'id', titre: 'N°' },
          { cle: 'date_ouverture', titre: 'Ouverture', tri: 'date_ouverture', rendu: (s) => formaterDateHeure(s.date_ouverture), exportRendu: (s) => formaterDateHeureExport(s.date_ouverture) },
          { cle: 'date_fermeture', titre: 'Clôture', tri: 'date_fermeture', rendu: (s) => formaterDateHeure(s.date_fermeture), exportRendu: (s) => formaterDateHeureExport(s.date_fermeture) },
          { cle: 'caissier_nom', titre: 'Caissier' },
          { cle: 'caisse_nom', titre: 'Caisse' },
          { cle: 'total_ventes', titre: 'Ventes', alignement: 'droite', rendu: (s) => formaterMontant(s.resume.total_ventes), exportRendu: (s) => s.resume.total_ventes },
          { cle: 'montant_attendu', titre: 'Attendu', alignement: 'droite', rendu: (s) => formaterMontant(s.resume.montant_attendu), exportRendu: (s) => s.resume.montant_attendu },
          { cle: 'montant_reel', titre: 'Compté', alignement: 'droite', rendu: (s) => formaterMontant(s.montant_reel) },
          { cle: 'ecart', titre: 'Écart', alignement: 'droite', tri: 'ecart', rendu: (s) => s.ecart == null ? '—' : <span className={s.ecart === 0 ? 'text-emerald-700' : 'font-semibold text-red-700'}>{s.ecart > 0 ? '+' : ''}{formaterMontant(s.ecart)}</span> },
          { cle: 'statut', titre: 'État', rendu: (s) => <Badge ton={tonStatut(s.statut)}>{libelleStatut(s.statut)}</Badge> },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(s) => s.id}
        onClicLigne={setDetail} messageVide="Aucune session de caisse." titre="Historique des sessions" />
      <DetailSession session={detail} admin={utilisateur?.role === 'ADMIN'} onFermer={() => setDetail(null)}
        onCloturee={(s) => { setDetail(s); liste.recharger() }} />
    </div>
  )
}
