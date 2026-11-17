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
import { useOptions, viderCacheOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Achat, Depot, Fournisseur, ModePaiement } from '../../types'
import { aujourdhui, formaterDateHeure, formaterMontant, libelleStatut } from '../../utilitaires/formatage'
import { extraireErreur } from '../../utilitaires/erreurs'

import { prixVenteSuggereTexte } from '../../utilitaires/prix'
import { t } from '../../i18n'
interface LigneSaisie {
  cle: number
  medicament: { id: number; nom: string } | null
  numero_lot: string
  date_fabrication: string
  date_peremption: string
  quantite: string
  prix_achat: string
  prix_vente: string
  /** Vrai dès que l'utilisateur saisit lui-même le prix de vente : on ne le recalcule plus. */
  prix_vente_manuel: boolean
}

interface Paiement { id: number; montant: number; date_paiement: string; mode_paiement_nom: string | null; utilisateur_nom: string; reference: string }

let compteur = 0
const nouvelleLigne = (): LigneSaisie => ({ cle: ++compteur, medicament: null, numero_lot: '', date_fabrication: '', date_peremption: '', quantite: '', prix_achat: '', prix_vente: '', prix_vente_manuel: false })

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
  const [nouveauxFournisseurs, setNouveauxFournisseurs] = useState<Fournisseur[]>([])
  const [modaleFournisseur, setModaleFournisseur] = useState(false)
  const [nouveauFournisseur, setNouveauFournisseur] = useState({ nom: '', telephone: '', adresse: '', email: '' })
  const [erreurFournisseur, setErreurFournisseur] = useState<string | null>(null)
  const [envoiFournisseur, setEnvoiFournisseur] = useState(false)

  const optionsFournisseurs = useMemo(() => {
    const base = [...fournisseurs]
    for (const f of nouveauxFournisseurs) if (!base.some((x) => x.id === f.id)) base.unshift(f)
    return base
  }, [fournisseurs, nouveauxFournisseurs])

  const ouvrirCreationFournisseur = () => {
    setNouveauFournisseur({ nom: '', telephone: '', adresse: '', email: '' }); setErreurFournisseur(null); setModaleFournisseur(true)
  }

  const creerFournisseur = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoiFournisseur(true); setErreurFournisseur(null)
    try {
      const { data } = await api.post<Fournisseur>('/fournisseurs/', {
        nom: nouveauFournisseur.nom.trim(), telephone: nouveauFournisseur.telephone.trim(),
        adresse: nouveauFournisseur.adresse.trim(), email: nouveauFournisseur.email.trim(),
      })
      viderCacheOptions()
      setNouveauxFournisseurs((f) => [data, ...f])
      setFournisseur(String(data.id))
      setModaleFournisseur(false)
      notifier.succes(t('« {nom} » ajouté.', { nom: data.nom }))
    } catch (err) { setErreurFournisseur(extraireErreur(err)) }
    finally { setEnvoiFournisseur(false) }
  }

  const modifiable = !achat || achat.statut === 'BROUILLON'

  const charger = (a: Achat) => {
    setAchat(a); setFournisseur(String(a.fournisseur)); setDepot(String(a.depot)); setDateAchat(a.date_achat)
    setReferenceFacture(a.reference_facture); setNote(a.note ?? '')
    setLignes((a.lignes ?? []).map((l) => ({
      cle: ++compteur, medicament: l.medicament ? { id: l.medicament, nom: l.medicament_nom ?? '' } : null, numero_lot: l.numero_lot,
      date_fabrication: l.date_fabrication ?? '', date_peremption: l.date_peremption, quantite: String(l.quantite),
      prix_achat: String(l.prix_achat), prix_vente: l.prix_vente == null ? '' : String(l.prix_vente), prix_vente_manuel: l.prix_vente != null,
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
    if (!fournisseur || !depot) return t('Choisissez le fournisseur et le dépôt de réception.')
    if (lignes.some((l) => !l.medicament || !l.numero_lot.trim() || !l.date_peremption || !(Number(l.quantite) > 0) || l.prix_achat === '')) {
      return t("Chaque ligne doit indiquer le médicament, le lot, la péremption, la quantité et le prix d'achat.")
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
    notifier.succes(t('Achat {reference} enregistré en brouillon.', { reference: a.reference }))
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
      notifier.succes(t('Achat {reference} validé : les lots ont été créés et le stock mis à jour.', { reference: data.reference }))
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
      notifier.succes(t('Paiement enregistré.'))
      setModalePaiement(false); charger(data)
    } catch (err) { setErreur(extraireErreur(err)); setModalePaiement(false) }
  }

  const annuler = async () => {
    if (!achat) return
    const ok = await confirmer({
      titre: t('Annuler l\'achat'),
      message: achat.statut === 'VALIDE' ? t('Les quantités reçues seront retirées du stock (mouvements inverses tracés). Impossible si elles ont déjà été vendues.') : t('Ce brouillon sera annulé.'),
      libelle: t('Annuler l\'achat'), danger: true,
    })
    if (!ok) return
    try { const { data } = await api.post<Achat>(`/achats/${achat.id}/annuler/`); charger(data); notifier.succes(t('Achat annulé.')) } catch (e) { setErreur(extraireErreur(e)) }
  }

  if (chargement) return <Chargement />
  const majLigne = (cle: number, partiel: Partial<LigneSaisie>) => setLignes((x) => x.map((l) => (l.cle === cle ? { ...l, ...partiel } : l)))

  return (
    <div>
      <Link to="/achats" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft size={14} className="rtl:-scale-x-100" /> {' '}{t('Retour aux achats')}</Link>
      <EnTetePage titre={achat ? t('Achat {reference}', { reference: achat.reference }) : t('Nouvel achat')}
        description={achat?.date_validation ? t('Validé le {date}', { date: formaterDateHeure(achat.date_validation) }) : undefined}
        actions={<>
          {achat && <Badge ton={tonStatut(achat.statut)}>{libelleStatut(achat.statut)}</Badge>}
          {achat && achat.statut !== 'ANNULE' && <button className="btn-secondaire" onClick={annuler}>{t('Annuler l\'achat')}</button>}
          {modifiable && <button className="btn-secondaire" disabled={occupe} onClick={() => surBrouillon()}>{t('Enregistrer le brouillon')}</button>}
          {modifiable && <button className="btn-primaire" disabled={occupe} onClick={ouvrirValidation}>{t('Valider l\'achat')}</button>}
          {achat?.statut === 'VALIDE' && Number(achat.reste_a_payer) > 0 && <button className="btn-primaire" onClick={() => { setPaye({ montant: String(achat.reste_a_payer), mode: modes.find((m) => m.type === 'ESPECES')?.id?.toString() ?? '', reference: '' }); setModalePaiement(true) }}>{t('Enregistrer un paiement')}</button>}
        </>} />
      <MessageErreur message={erreur} />

      <div className="carte mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle={t('Fournisseur')} requis>
          <div className="flex gap-2">
            <select className="champ" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} disabled={!modifiable}><option value="">{t('— Choisir —')}</option>{optionsFournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}</select>
            {modifiable && <button type="button" className="btn-secondaire shrink-0 px-2.5" onClick={ouvrirCreationFournisseur} aria-label={t('Nouveau fournisseur')} title={t('Nouveau fournisseur')}><Plus size={16} /></button>}
          </div>
        </Champ>
        <Champ libelle={t('Dépôt de réception')} requis>
          <select className="champ" value={depot} onChange={(e) => setDepot(e.target.value)} disabled={!modifiable}><option value="">{t('— Choisir —')}</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
        </Champ>
        <Champ libelle={t('Date de l\'achat')}><input className="champ" type="date" value={dateAchat} onChange={(e) => setDateAchat(e.target.value)} disabled={!modifiable} /></Champ>
        <Champ libelle={t('N° de facture du fournisseur')}><input className="champ" value={referenceFacture} onChange={(e) => setReferenceFacture(e.target.value)} disabled={!modifiable} /></Champ>
      </div>

      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-start text-slate-600">
            <tr><th className="w-72 px-3 py-2.5">{t('Médicament')}</th><th className="px-3 py-2.5">{t('N° de lot')}</th><th className="px-3 py-2.5">{t('Fabrication')}</th><th className="px-3 py-2.5">{t('Péremption')}</th><th className="px-3 py-2.5 text-end">{t('Quantité (boîtes)')}</th><th className="px-3 py-2.5 text-end">{t('Prix d\'achat (boîte)')}</th><th className="px-3 py-2.5 text-end">{t('Prix de vente (boîte)')}</th><th className="px-3 py-2.5 text-end">{t('Total')}</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map((l) => (
              <tr key={l.cle} className="align-top">
                <td className="px-3 py-2">
                  {modifiable
                    ? <SelectionMedicament valeur={l.medicament} onChoisir={(m) => majLigne(l.cle, m ? { medicament: { id: m.id, nom: `${m.nom} ${m.dosage}`.trim() } } : { medicament: null })} placeholder={t('Rechercher…')} />
                    : l.medicament?.nom}
                </td>
                <td className="px-3 py-2">{modifiable ? <input className="champ" value={l.numero_lot} onChange={(e) => majLigne(l.cle, { numero_lot: e.target.value })} aria-label={t('Numéro de lot')} /> : l.numero_lot}</td>
                <td className="px-3 py-2">{modifiable ? <input className="champ" type="date" value={l.date_fabrication} onChange={(e) => majLigne(l.cle, { date_fabrication: e.target.value })} aria-label={t('Date de fabrication')} /> : l.date_fabrication || '—'}</td>
                <td className="px-3 py-2">{modifiable ? <input className="champ" type="date" value={l.date_peremption} onChange={(e) => majLigne(l.cle, { date_peremption: e.target.value })} aria-label={t('Date de péremption')} /> : l.date_peremption}</td>
                <td className="px-3 py-2 text-end">{modifiable ? <input className="champ w-24 text-end" type="number" min={1} value={l.quantite} onChange={(e) => majLigne(l.cle, { quantite: e.target.value })} aria-label={t('Quantité')} /> : l.quantite}</td>
                <td className="px-3 py-2 text-end">{modifiable ? <input className="champ w-28 text-end" type="number" min={0} step="0.01" value={l.prix_achat} onChange={(e) => majLigne(l.cle, { prix_achat: e.target.value, ...(l.prix_vente_manuel ? {} : { prix_vente: prixVenteSuggereTexte(e.target.value) }) })} aria-label={t('Prix d\'achat')} /> : formaterMontant(Number(l.prix_achat))}</td>
                <td className="px-3 py-2 text-end">{modifiable ? <input className="champ w-28 text-end" type="number" min={0} step="0.01" placeholder={t('Idem fiche')} value={l.prix_vente} onChange={(e) => majLigne(l.cle, { prix_vente: e.target.value, prix_vente_manuel: e.target.value !== '' })} aria-label={t('Prix de vente')} /> : (l.prix_vente ? formaterMontant(Number(l.prix_vente)) : '—')}</td>
                <td className="px-3 py-2 pt-4 text-end font-medium">{formaterMontant((Number(l.quantite) || 0) * (Number(l.prix_achat) || 0))}</td>
                <td className="px-3 py-2 pt-3">{modifiable && lignes.length > 1 && <button className="text-slate-400 hover:text-red-600" onClick={() => setLignes((x) => x.filter((y) => y.cle !== l.cle))} aria-label={t('Retirer la ligne')}><Trash2 size={16} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {modifiable && <p className="border-t border-slate-100 px-3 pt-2 text-xs text-slate-500">{t('Prix de vente calculé automatiquement (+25 % si le prix d\'achat est inférieur à 200, +15 % sinon) — modifiable.')}</p>}
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-3">
          {modifiable ? <button className="btn-secondaire btn-petit" onClick={() => setLignes((x) => [...x, nouvelleLigne()])}><Plus size={14} /> {' '}{t('Ajouter une ligne')}</button> : <span />}
          <p className="text-lg font-semibold">{t('Total :')}{' '}{formaterMontant(achat && !modifiable ? achat.total : total)}</p>
        </div>
      </div>

      {achat?.statut === 'VALIDE' && (
        <div className="carte mt-4 p-4">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><h2 className="font-semibold">{t('Paiements')}</h2><p>{t('Payé :')}{' '}<strong>{formaterMontant(achat.montant_paye)}</strong> {' '}{t('· Reste :')}{' '}<strong className={Number(achat.reste_a_payer) > 0 ? 'text-red-700' : 'text-emerald-700'}>{formaterMontant(achat.reste_a_payer)}</strong></p></div>
          {paiements.length === 0 ? <p className="text-sm text-slate-500">{t('Aucun paiement enregistré.')}</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {paiements.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{formaterDateHeure(p.date_paiement)} · {p.mode_paiement_nom ?? '—'} · {p.utilisateur_nom}{p.reference && ` · ${p.reference}`}</span><span className="font-medium">{formaterMontant(p.montant)}</span></li>)}
            </ul>
          )}
        </div>
      )}
      <div className="mt-4"><Champ libelle={t('Note')}><input className="champ max-w-xl" value={note} onChange={(e) => setNote(e.target.value)} disabled={!modifiable} /></Champ></div>

      <Modale ouverte={modaleValidation} titre={t('Valider l\'achat')} onFermer={() => setModaleValidation(false)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setModaleValidation(false)}>{t('Retour')}</button><button className="btn-primaire" disabled={occupe} onClick={valider}>{t('Valider et mettre en stock')}</button></>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t('Total :')}{' '}<strong>{formaterMontant(total)}</strong>{t('. La validation crée les lots, ajoute les quantités au stock et ne peut plus être modifiée (seulement annulée).')}</p>
          <Champ libelle={t('Montant payé maintenant (facultatif)')}><input className="champ" type="number" min={0} max={total} step="0.01" value={paye.montant} onChange={(e) => setPaye({ ...paye, montant: e.target.value })} /></Champ>
          {Number(paye.montant) > 0 && <Champ libelle={t('Mode de paiement')}><select className="champ" value={paye.mode} onChange={(e) => setPaye({ ...paye, mode: e.target.value })}><option value="">—</option>{modes.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></Champ>}
        </div>
      </Modale>

      <Modale ouverte={modalePaiement} titre={t('Paiement fournisseur')} onFermer={() => setModalePaiement(false)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setModalePaiement(false)}>{t('Annuler')}</button><button className="btn-primaire" type="submit" form="formulaire-paiement">{t('Enregistrer le paiement')}</button></>}>
        <form id="formulaire-paiement" onSubmit={payer} className="space-y-3">
          <Champ libelle={t('Montant')} requis aide={achat ? t('Reste à payer : {montant}', { montant: formaterMontant(achat.reste_a_payer) }) : undefined}><input className="champ" type="number" min={0.01} max={achat?.reste_a_payer} step="0.01" value={paye.montant} onChange={(e) => setPaye({ ...paye, montant: e.target.value })} required /></Champ>
          <Champ libelle={t('Mode de paiement')}><select className="champ" value={paye.mode} onChange={(e) => setPaye({ ...paye, mode: e.target.value })}><option value="">—</option>{modes.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></Champ>
          <Champ libelle={t('Référence (chèque, virement…)')}><input className="champ" value={paye.reference} onChange={(e) => setPaye({ ...paye, reference: e.target.value })} /></Champ>
        </form>
      </Modale>

      <Modale ouverte={modaleFournisseur} titre={t('Nouveau fournisseur')} onFermer={() => setModaleFournisseur(false)} largeur="petite"
        pied={<>
          <button className="btn-secondaire" onClick={() => setModaleFournisseur(false)}>{t('Annuler')}</button>
          <button className="btn-primaire" type="submit" form="formulaire-nouveau-fournisseur" disabled={envoiFournisseur}>{envoiFournisseur ? t('Création…') : t('Créer')}</button>
        </>}>
        <form id="formulaire-nouveau-fournisseur" onSubmit={creerFournisseur} className="space-y-3">
          <MessageErreur message={erreurFournisseur} />
          <Champ libelle={t('Nom')} requis><input className="champ" value={nouveauFournisseur.nom} onChange={(e) => setNouveauFournisseur((f) => ({ ...f, nom: e.target.value }))} required autoFocus /></Champ>
          <Champ libelle={t('Téléphone')}><input className="champ" value={nouveauFournisseur.telephone} onChange={(e) => setNouveauFournisseur((f) => ({ ...f, telephone: e.target.value }))} /></Champ>
          <Champ libelle={t('Adresse')}><input className="champ" value={nouveauFournisseur.adresse} onChange={(e) => setNouveauFournisseur((f) => ({ ...f, adresse: e.target.value }))} /></Champ>
          <Champ libelle={t('E-mail')}><input className="champ" type="email" value={nouveauFournisseur.email} onChange={(e) => setNouveauFournisseur((f) => ({ ...f, email: e.target.value }))} /></Champ>
        </form>
      </Modale>
    </div>
  )
}
