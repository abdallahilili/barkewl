import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Badge } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { Chargement, EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Caisse, MouvementCaisse, SessionCaisse } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { formaterDateHeure, formaterMontant } from '../../utilitaires/formatage'
import { ResumeSession } from '../../fonctionnalites/ResumeSession'

function OuvertureSession({ surOuverte }: { surOuverte: () => void }) {
  const notifier = useNotifier()
  const caisses = useOptions<Caisse>('/caisses/', { active: 1 })
  const [caisse, setCaisse] = useState('')
  const [montant, setMontant] = useState('0')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const ouvrir = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreur(null)
    try {
      await api.post('/sessions-caisse/', { caisse: Number(caisse), montant_initial: Number(montant || 0) })
      notifier.succes('Session de caisse ouverte.')
      surOuverte()
    } catch (err) { setErreur(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  return (
    <form onSubmit={ouvrir} className="carte mx-auto max-w-md space-y-4 p-6">
      <div>
        <h2 className="text-base font-semibold">Ouvrir une session de caisse</h2>
        <p className="mt-1 text-sm text-slate-500">Aucune session n'est ouverte. Vous devez en ouvrir une pour enregistrer des ventes.</p>
      </div>
      <MessageErreur message={erreur} />
      <Champ libelle="Caisse" requis>
        <select className="champ" value={caisse} onChange={(e) => setCaisse(e.target.value)} required>
          <option value="">— Choisir une caisse —</option>
          {caisses.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.nom} ({c.depot_nom})</option>)}
        </select>
      </Champ>
      <Champ libelle="Fond de caisse (espèces au départ)" requis>
        <input className="champ" type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} required />
      </Champ>
      <button className="btn-primaire w-full" disabled={envoi || !caisse}>{envoi ? 'Ouverture…' : 'Ouvrir la session'}</button>
    </form>
  )
}

export default function SessionActuelle() {
  const notifier = useNotifier()
  const [session, setSession] = useState<SessionCaisse | null>(null)
  const [mouvements, setMouvements] = useState<MouvementCaisse[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [modaleManuelle, setModaleManuelle] = useState(false)
  const [modaleCloture, setModaleCloture] = useState(false)
  const [manuel, setManuel] = useState({ type_mouvement: 'ENTREE_MANUELLE', montant: '', motif: '' })
  const [cloture, setCloture] = useState({ montant_reel: '', note: '' })
  const [erreurModale, setErreurModale] = useState<string | null>(null)
  const [terminee, setTerminee] = useState<SessionCaisse | null>(null)

  const charger = useCallback(async () => {
    try {
      const { data } = await api.get<{ session: SessionCaisse | null }>('/sessions-caisse/actuelle/')
      setSession(data.session)
      if (data.session) {
        const m = await api.get<MouvementCaisse[]>(`/sessions-caisse/${data.session.id}/mouvements/`)
        setMouvements(m.data)
      } else setMouvements([])
      setErreur(null)
    } catch (e) { setErreur(extraireErreur(e)) }
    finally { setChargement(false) }
  }, [])

  useEffect(() => { charger() }, [charger])

  const ajouterMouvement = async (e: FormEvent) => {
    e.preventDefault()
    if (!session) return
    setErreurModale(null)
    try {
      await api.post(`/sessions-caisse/${session.id}/mouvements/`, { ...manuel, montant: Number(manuel.montant) })
      notifier.succes('Mouvement enregistré.')
      setModaleManuelle(false); setManuel({ type_mouvement: 'ENTREE_MANUELLE', montant: '', motif: '' })
      charger()
    } catch (err) { setErreurModale(extraireErreur(err)) }
  }

  const cloturer = async (e: FormEvent) => {
    e.preventDefault()
    if (!session) return
    setErreurModale(null)
    try {
      const { data } = await api.post<SessionCaisse>(`/sessions-caisse/${session.id}/fermer/`, { montant_reel: Number(cloture.montant_reel), note: cloture.note })
      setModaleCloture(false); setTerminee(data); setSession(null)
      notifier.succes('Session clôturée.')
    } catch (err) { setErreurModale(extraireErreur(err)) }
  }

  if (chargement) return <Chargement />
  const ecartPrevu = session && cloture.montant_reel !== '' ? Number(cloture.montant_reel) - session.resume.montant_attendu : null

  return (
    <div>
      <EnTetePage titre="Session de caisse" description={session ? `${session.caisse_nom} — ouverte le ${formaterDateHeure(session.date_ouverture)}` : undefined}
        actions={session && <>
          <button className="btn-secondaire" onClick={() => { setErreurModale(null); setModaleManuelle(true) }}>Entrée / sortie manuelle</button>
          <button className="btn-primaire" onClick={() => { setErreurModale(null); setCloture({ montant_reel: '', note: '' }); setModaleCloture(true) }}>Clôturer la session</button>
        </>} />
      <MessageErreur message={erreur} />

      {terminee && (
        <div className="carte mb-5 p-5">
          <h2 className="mb-3 text-base font-semibold">Session clôturée</h2>
          <ResumeSession session={terminee} />
          <button className="btn-secondaire mt-4" onClick={() => setTerminee(null)}>Fermer ce récapitulatif</button>
        </div>
      )}

      {!session && !terminee && <OuvertureSession surOuverte={charger} />}
      {!session && terminee && <OuvertureSession surOuverte={() => { setTerminee(null); charger() }} />}

      {session && (
        <>
          <ResumeSession session={session} />
          <h2 className="mb-2 mt-6 text-sm font-semibold">Mouvements de la session</h2>
          <div className="carte overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <tr><th className="px-3 py-2">Heure</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Paiement</th><th className="px-3 py-2">Motif</th><th className="px-3 py-2 text-right">Montant</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mouvements.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Aucun mouvement pour l'instant.</td></tr>}
                {mouvements.map((m) => {
                  const negatif = m.type_mouvement === 'REMBOURSEMENT' || m.type_mouvement === 'SORTIE_MANUELLE'
                  return (
                    <tr key={m.id}>
                      <td className="px-3 py-2">{formaterDateHeure(m.date_mouvement)}</td>
                      <td className="px-3 py-2"><Badge ton={negatif ? 'rouge' : 'vert'}>{m.type_libelle}</Badge></td>
                      <td className="px-3 py-2">{m.mode_paiement_nom}</td>
                      <td className="px-3 py-2 text-slate-600">{m.motif}</td>
                      <td className={`px-3 py-2 text-right font-medium ${negatif ? 'text-red-700' : 'text-emerald-700'}`}>{negatif ? '−' : '+'}{formaterMontant(m.montant)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modale ouverte={modaleManuelle} titre="Entrée / sortie manuelle d'espèces" onFermer={() => setModaleManuelle(false)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setModaleManuelle(false)}>Annuler</button><button className="btn-primaire" type="submit" form="formulaire-manuel">Enregistrer</button></>}>
        <form id="formulaire-manuel" onSubmit={ajouterMouvement} className="space-y-3">
          <MessageErreur message={erreurModale} />
          <Champ libelle="Type" requis>
            <select className="champ" value={manuel.type_mouvement} onChange={(e) => setManuel({ ...manuel, type_mouvement: e.target.value })}>
              <option value="ENTREE_MANUELLE">Entrée d'espèces</option>
              <option value="SORTIE_MANUELLE">Sortie d'espèces</option>
            </select>
          </Champ>
          <Champ libelle="Montant" requis><input className="champ" type="number" min={0.01} step="0.01" value={manuel.montant} onChange={(e) => setManuel({ ...manuel, montant: e.target.value })} required /></Champ>
          <Champ libelle="Motif" requis aide="Obligatoire : il apparaîtra dans le journal de caisse."><input className="champ" value={manuel.motif} onChange={(e) => setManuel({ ...manuel, motif: e.target.value })} required /></Champ>
        </form>
      </Modale>

      <Modale ouverte={modaleCloture} titre="Clôturer la session" onFermer={() => setModaleCloture(false)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setModaleCloture(false)}>Annuler</button><button className="btn-primaire" type="submit" form="formulaire-cloture">Clôturer</button></>}>
        <form id="formulaire-cloture" onSubmit={cloturer} className="space-y-3">
          <MessageErreur message={erreurModale} />
          {session && <p className="text-sm text-slate-600">Espèces attendues en caisse : <strong>{formaterMontant(session.resume.montant_attendu)}</strong></p>}
          <Champ libelle="Espèces comptées" requis><input className="champ" type="number" min={0} step="0.01" value={cloture.montant_reel} onChange={(e) => setCloture({ ...cloture, montant_reel: e.target.value })} required autoFocus /></Champ>
          {ecartPrevu != null && (
            <p className={`rounded-md px-3 py-2 text-sm ${ecartPrevu === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              Écart : <strong>{ecartPrevu > 0 ? '+' : ''}{formaterMontant(ecartPrevu)}</strong> {ecartPrevu === 0 ? '— la caisse est juste.' : ecartPrevu > 0 ? '(excédent)' : '(manquant)'}
            </p>
          )}
          <Champ libelle="Note (facultatif)"><input className="champ" value={cloture.note} onChange={(e) => setCloture({ ...cloture, note: e.target.value })} /></Champ>
          <p className="text-xs text-slate-500">Une session clôturée ne peut plus être modifiée.</p>
        </form>
      </Modale>
    </div>
  )
}
