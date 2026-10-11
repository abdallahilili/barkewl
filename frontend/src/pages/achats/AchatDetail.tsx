import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, tonStatut } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { useConfirmer } from '../../composants/Confirmation'
import { Chargement, EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { SelectionMedicament } from '../../composants/SelectionMedicament'
import { useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Achat, Depot, Fournisseur, ModePaiement } from '../../types'
import { aujourdhui, formaterDateHeure, formaterMontant, libelleStatut } from '../../utilitaires/formatage'
import { extraireErreur } from '../../utilitaires/erreurs'

interface LigneSaisie {
  cle: number
  medicament: { id: number; nom: string } | null
  numero_lot: string
  date_fabrication: string
  date_peremption: string
  quantite: string
  prix_achat: string
  prix_vente: string
}

interface Paiement { id: number; montant: number; date_paiement: string; mode_paiement_nom: string | null; utilisateur_nom: string; reference: string }

let compteur = 0
const nouvelleLigne = (): LigneSaisie => ({ cle: ++compteur, medicament: null, numero_lot: '', date_fabrication: '', date_peremption: '', quantite: '', prix_achat: '', prix_vente: '' })

export default function AchatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notifier = useNotifier()
  const confirmer = useConfirmer()
  const fournisseurs = useOptions<Fournisseur>('/fournisseurs/', { actif: 1 })
  const depots = useOptions<Depot>('/depots/', { actif: 1 })
  const modes = useOptions<ModePaiement>('/modes-paiement/', { actif: 1 })

  const [achat, setAchat] = useState<Achat | null>(null)
  const [chargement, setChargement] = useState(!!id)
  const [fournisseur, setFournisseur] = useState('')
  const [depot, setDepot] = useState('')
  const [dateAchat, setDateAchat] = useState(aujourdhui())
  const [referenceFacture, setReferenceFacture] = useState('')
  const [note, setNote] = useState('')
  const [lignes, setLignes] = useState<LigneSaisie[]>([nouvelleLigne()])
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [modaleValidation, setModaleValidation] = useState(false)
  const [modalePaiement, setModalePaiement] = useState(false)
  const [paye, setPaye] = useState({ montant: '', mode: '', reference: '' })

  const modifiable = !achat || achat.statut === 'BROUILLON'

  const charger = (a: Achat) => {
    setAchat(a); setFournisseur(String(a.fournisseur)); setDepot(String(a.depot)); setDateAchat(a.date_achat)
    setReferenceFacture(a.reference_facture); setNote(a.note ?? '')
    setLignes((a.lignes ?? []).map((l) => ({
      cle: ++compteur, medicament: l.medicament ? { id: l.medicament, nom: l.medicament_nom ?? '' } : null, numero_lot: l.numero_lot,
      date_fabrication: l.date_fabrication ?? '', date_peremption: l.date_peremption, quantite: String(l.quantite),
      prix_achat: String(l.prix_achat), prix_vente: l.prix_vente == null ? '' : String(l.prix_vente),
    })))
    if (a.statut === 'VALIDE') api.get<Paiement[]>(`/achats/${a.id}/paiements/`).then((r) => setPaiements(r.data)).catch(() => undefined)
  }

  useEffect(() => {
    if (!id) return
    api.get<Achat>(`/achats/${id}/`).then((r) => charger(r.data)).catch((e) => setErreur(extraireErreur(e))).finally(() => setChargement(false))
  }, [id])

  const total = useMemo(() => lignes.reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_achat) || 0), 0), [lignes])

  const charge = () => ({
    fournisseur: Number(fournisseur), depot: Number(depot), date_achat: dateAchat, reference_facture: referenceFacture, note,
    lignes: lignes.map((l) => ({
      medicament: l.medicament?.id, numero_lot: l.numero_lot.trim(), date_fabrication: l.date_fabrication || null, date_peremption: l.date_peremption,
      quantite: Number(l.quantite), prix_achat: Number(l.prix_achat), prix_vente: l.prix_vente === '' ? null : Number(l.prix_vente),
    })),
  })

  const verifier = () => {
    if (!fournisseur || !depot) return 'Choisissez le fournisseur et le dépôt de réception.'
    if (lignes.some((l) => !l.medicament || !l.numero_lot.trim() || !l.date_peremption || !(Number(l.quantite) > 0) || l.prix_achat === '')) {
      return 'Chaque ligne doit indiquer le médicament, le lot, la péremption, la quantité et le prix d’achat.'
    }
    return null
  }

  const enregistrer = async (): Promise<Achat | null> => {
    const probleme = verifier()
    if (probleme) { setErreur(probleme); return null }
    setOccupe(true); setErreur(null)
    try {
      const { data } = achat ? await api.put<Achat>(`/achats/${achat.id}/`, charge()) : await api.post<Achat>('/achats/', charge())
      return data
    } catch (e) { setErreur(extraireErreur(e)); return null }
    finally { setOccupe(false) }
  }

  const surBrouillon = async (e?: FormEvent) => {
    e?.preventDefault()
    const a = await enregistrer()
    if (!a) return
    notifier.succes(`Achat ${a.reference} enregistré en brouillon.`)
    if (!achat) navigate(`/achats/${a.id}`, { replace: true }); else charger(a)
  }

  const ouvrirValidation = () => {
    const probleme = verifier()
    if (probleme) { setErreur(probleme); return }
    setPaye({ montant: '', mode: modes.find((m) => m.type === 'ESPECES')?.id?.toString() ?? '', reference: '' })
    setModaleValidation(true)
  }

  const valider = async () => {
    const a = await enregistrer()
    if (!a) { setModaleValidation(false); return }
    setOccupe(true)
    try {
      const { data } = await api.post<Achat>(`/achats/${a.id}/valider/`, { montant_paye: Number(paye.montant) || 0, mode_paiement: paye.mode ? Number(paye.mode) : null })
      notifier.succes(`Achat ${data.reference} validé : les lots ont été créés et le stock mis à jour.`)
      setModaleValidation(false)
      if (!achat) navigate(`/achats/${data.id}`, { replace: true }); else charger(data)
    } catch (e) { setModaleValidation(false); setErreur(extraireErreur(e)); navigate(`/achats/${a.id}`, { replace: true }) }
    finally { setOccupe(false) }
  }

  const payer = async (e: FormEvent) => {
    e.preventDefault()
    if (!achat) return
    try {
      const { data } = await api.post<Achat>(`/achats/${achat.id}/payer/`, { montant: Number(paye.montant), mode_paiement: paye.mode ? Number(paye.mode) : null, reference: paye.reference })
      notifier.succes('Paiement enregistré.')
      setModalePaiement(false); charger(data)
    } catch (err) { setErreur(extraireErreur(err)); setModalePaiement(false) }
  }

  const annuler = async () => {
    if (!achat) return
    const ok = await confirmer({
      titre: "Annuler l'achat",
      message: achat.statut === 'VALIDE' ? 'Les quantités reçues seront retirées du stock (mouvements inverses tracés). Impossible si elles ont déjà été vendues.' : 'Ce brouillon sera annulé.',
      libelle: "Annuler l'achat", danger: true,
    })
    if (!ok) return
    try { const { data } = await api.post<Achat>(`/achats/${achat.id}/annuler/`); charger(data); notifier.succes('Achat annulé.') } catch (e) { setErreur(extraireErreur(e)) }
  }

  if (chargement) return <Chargement />
  const majLigne = (cle: number, partiel: Partial<LigneSaisie>) => setLignes((x) => x.map((l) => (l.cle === cle ? { ...l, ...partiel } : l)))

  return (
    <div>
      <Link to="/achats" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft size={14} /> Retour aux achats</Link>
      <EnTetePage titre={achat ? `Achat ${achat.reference}` : 'Nouvel achat'}
        description={achat?.date_validation ? `Validé le ${formaterDateHeure(achat.date_validation)}` : undefined}
        actions={<>
          {achat && <Badge ton={tonStatut(achat.statut)}>{libelleStatut(achat.statut)}</Badge>}
          {achat && achat.statut !== 'ANNULE' && <button className="btn-secondaire" onClick={annuler}>Annuler l'achat</button>}
          {modifiable && <button className="btn-secondaire" disabled={occupe} onClick={() => surBrouillon()}>Enregistrer le brouillon</button>}
          {modifiable && <button className="btn-primaire" disabled={occupe} onClick={ouvrirValidation}>Valider l'achat</button>}
          {achat?.statut === 'VALIDE' && Number(achat.reste_a_payer) > 0 && <button className="btn-primaire" onClick={() => { setPaye({ montant: String(achat.reste_a_payer), mode: modes.find((m) => m.type === 'ESPECES')?.id?.toString() ?? '', reference: '' }); setModalePaiement(true) }}>Enregistrer un paiement</button>}
        </>} />
      <MessageErreur message={erreur} />

      <div className="carte mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle="Fournisseur" requis>
          <select className="champ" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} disabled={!modifiable}><option value="">— Choisir —</option>{fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}</select>
        </Champ>
        <Champ libelle="Dépôt de réception" requis>
          <select className="champ" value={depot} onChange={(e) => setDepot(e.target.value)} disabled={!modifiable}><option value="">— Choisir —</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
        </Champ>
        <Champ libelle="Date de l'achat"><input className="champ" type="date" value={dateAchat} onChange={(e) => setDateAchat(e.target.value)} disabled={!modifiable} /></Champ>
        <Champ libelle="N° de facture du fournisseur"><input className="champ" value={referenceFacture} onChange={(e) => setReferenceFacture(e.target.value)} disabled={!modifiable} /></Champ>
      </div>

      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr><th className="w-72 px-3 py-2.5">Médicament</th><th className="px-3 py-2.5">N° de lot</th><th className="px-3 py-2.5">Fabrication</th><th className="px-3 py-2.5">Péremption</th><th className="px-3 py-2.5 text-right">Quantité</th><th className="px-3 py-2.5 text-right">Prix d'achat</th><th className="px-3 py-2.5 text-right">Prix de vente</th><th className="px-3 py-2.5 text-right">Total</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map((l) => (
              <tr key={l.cle} className="align-top">
                <td className="px-3 py-2">
                  {modifiable
                    ? <SelectionMedicament valeur={l.medicament} onChoisir={(m) => majLigne(l.cle, m ? { medicament: { id: m.id, nom: `${m.nom} ${m.dosage}`.trim() }, prix_achat: l.prix_achat || String(m.prix_achat ?? ''), prix_vente: l.prix_vente || '' } : { medicament: null })} placeholder="Rechercher…" />
                    : l.medicament?.nom}
                </td>
                <td className="px-3 py-2">{modifiable ? <input className="champ" value={l.numero_lot} onChange={(e) => majLigne(l.cle, { numero_lot: e.target.value })} aria-label="Numéro de lot" /> : l.numero_lot}</td>
                <td className="px-3 py-2">{modifiable ? <input className="champ" type="date" value={l.date_fabrication} onChange={(e) => majLigne(l.cle, { date_fabrication: e.target.value })} aria-label="Date de fabrication" /> : l.date_fabrication || '—'}</td>
                <td className="px-3 py-2">{modifiable ? <input className="champ" type="date" value={l.date_peremption} onChange={(e) => majLigne(l.cle, { date_peremption: e.target.value })} aria-label="Date de péremption" /> : l.date_peremption}</td>
                <td className="px-3 py-2 text-right">{modifiable ? <input className="champ w-24 text-right" type="number" min={1} value={l.quantite} onChange={(e) => majLigne(l.cle, { quantite: e.target.value })} aria-label="Quantité" /> : l.quantite}</td>
                <td className="px-3 py-2 text-right">{modifiable ? <input className="champ w-28 text-right" type="number" min={0} step="0.01" value={l.prix_achat} onChange={(e) => majLigne(l.cle, { prix_achat: e.target.value })} aria-label="Prix d'achat" /> : formaterMontant(Number(l.prix_achat))}</td>
                <td className="px-3 py-2 text-right">{modifiable ? <input className="champ w-28 text-right" type="number" min={0} step="0.01" placeholder="Idem fiche" value={l.prix_vente} onChange={(e) => majLigne(l.cle, { prix_vente: e.target.value })} aria-label="Prix de vente" /> : (l.prix_vente ? formaterMontant(Number(l.prix_vente)) : '—')}</td>
                <td className="px-3 py-2 pt-4 text-right font-medium">{formaterMontant((Number(l.quantite) || 0) * (Number(l.prix_achat) || 0))}</td>
                <td className="px-3 py-2 pt-3">{modifiable && lignes.length > 1 && <button className="text-slate-400 hover:text-red-600" onClick={() => setLignes((x) => x.filter((y) => y.cle !== l.cle))} aria-label="Retirer la ligne"><Trash2 size={16} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-3">
          {modifiable ? <button className="btn-secondaire btn-petit" onClick={() => setLignes((x) => [...x, nouvelleLigne()])}><Plus size={14} /> Ajouter une ligne</button> : <span />}
          <p className="text-lg font-semibold">Total : {formaterMontant(achat && !modifiable ? achat.total : total)}</p>
        </div>
      </div>

      {achat?.statut === 'VALIDE' && (
        <div className="carte mt-4 p-4">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><h2 className="font-semibold">Paiements</h2><p>Payé : <strong>{formaterMontant(achat.montant_paye)}</strong> · Reste : <strong className={Number(achat.reste_a_payer) > 0 ? 'text-red-700' : 'text-emerald-700'}>{formaterMontant(achat.reste_a_payer)}</strong></p></div>
          {paiements.length === 0 ? <p className="text-sm text-slate-500">Aucun paiement enregistré.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {paiements.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{formaterDateHeure(p.date_paiement)} · {p.mode_paiement_nom ?? '—'} · {p.utilisateur_nom}{p.reference && ` · ${p.reference}`}</span><span className="font-medium">{formaterMontant(p.montant)}</span></li>)}
            </ul>
          )}
        </div>
      )}
      <div className="mt-4"><Champ libelle="Note"><input className="champ max-w-xl" value={note} onChange={(e) => setNote(e.target.value)} disabled={!modifiable} /></Champ></div>

      <Modale ouverte={modaleValidation} titre="Valider l'achat" onFermer={() => setModaleValidation(false)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setModaleValidation(false)}>Retour</button><button className="btn-primaire" disabled={occupe} onClick={valider}>Valider et mettre en stock</button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Total : <strong>{formaterMontant(total)}</strong>. La validation crée les lots, ajoute les quantités au stock et ne peut plus être modifiée (seulement annulée).</p>
          <Champ libelle="Montant payé maintenant (facultatif)"><input className="champ" type="number" min={0} max={total} step="0.01" value={paye.montant} onChange={(e) => setPaye({ ...paye, montant: e.target.value })} /></Champ>
          {Number(paye.montant) > 0 && <Champ libelle="Mode de paiement"><select className="champ" value={paye.mode} onChange={(e) => setPaye({ ...paye, mode: e.target.value })}><option value="">—</option>{modes.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></Champ>}
        </div>
      </Modale>

      <Modale ouverte={modalePaiement} titre="Paiement fournisseur" onFermer={() => setModalePaiement(false)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setModalePaiement(false)}>Annuler</button><button className="btn-primaire" type="submit" form="formulaire-paiement">Enregistrer le paiement</button></>}>
        <form id="formulaire-paiement" onSubmit={payer} className="space-y-3">
          <Champ libelle="Montant" requis aide={achat ? `Reste à payer : ${formaterMontant(achat.reste_a_payer)}` : undefined}><input className="champ" type="number" min={0.01} max={achat?.reste_a_payer} step="0.01" value={paye.montant} onChange={(e) => setPaye({ ...paye, montant: e.target.value })} required /></Champ>
          <Champ libelle="Mode de paiement"><select className="champ" value={paye.mode} onChange={(e) => setPaye({ ...paye, mode: e.target.value })}><option value="">—</option>{modes.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></Champ>
          <Champ libelle="Référence (chèque, virement…)"><input className="champ" value={paye.reference} onChange={(e) => setPaye({ ...paye, reference: e.target.value })} /></Champ>
        </form>
      </Modale>
    </div>
  )
}
