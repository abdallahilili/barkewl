import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, tonStatut } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { useConfirmer } from '../../composants/Confirmation'
import { Chargement, EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { DocumentVenteImpression } from '../../composants/DocumentVenteImpression'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { SelectionMedicament } from '../../composants/SelectionMedicament'
import { useAuth } from '../../hooks/useAuth'
import { useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Client, Depot, DocumentVente, EtapeDocumentVente, ModePaiement } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { formaterDateHeure, formaterMontant } from '../../utilitaires/formatage'

interface LigneSaisie {
  cle: number
  medicament: { id: number; nom: string } | null
  prixAchat: number | null
  quantite_devis: string
  prix_unitaire: string
}

let compteur = 0
const nouvelleLigne = (): LigneSaisie => ({ cle: ++compteur, medicament: null, prixAchat: null, quantite_devis: '1', prix_unitaire: '' })

export default function DocumentVenteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notifier = useNotifier()
  const confirmer = useConfirmer()
  const { utilisateur } = useAuth()
  const admin = utilisateur?.role === 'ADMIN'
  const caissier = utilisateur?.role === 'CAISSIER'
  const magasinier = utilisateur?.role === 'MAGASINIER'

  const clients = useOptions<Client>('/clients/', { actif: 1 })
  const depots = useOptions<Depot>('/depots/', { actif: 1 })
  const modes = useOptions<ModePaiement>('/modes-paiement/', { actif: 1 })

  const [doc, setDoc] = useState<DocumentVente | null>(null)
  const [chargement, setChargement] = useState(!!id)
  const [client, setClient] = useState('')
  const [depot, setDepot] = useState('')
  const [note, setNote] = useState('')
  const [lignes, setLignes] = useState<LigneSaisie[]>([nouvelleLigne()])
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  const [modaleBL, setModaleBL] = useState(false)
  const [quantitesLivrees, setQuantitesLivrees] = useState<Record<number, string>>({})
  const [modalePaiement, setModalePaiement] = useState(false)
  const [paye, setPaye] = useState({ montant: '', mode: '' })
  const [impression, setImpression] = useState<EtapeDocumentVente | null>(null)
  const [marge, setMarge] = useState('')

  const modifiable = !doc || (doc.etape === 'DEVIS' && !doc.annule)

  const charger = (d: DocumentVente) => {
    setDoc(d); setClient(String(d.client)); setDepot(String(d.depot)); setNote(d.note ?? '')
    setLignes((d.lignes ?? []).map((l) => ({
      cle: ++compteur, medicament: l.medicament ? { id: l.medicament, nom: l.medicament_nom ?? l.designation ?? '' } : null,
      prixAchat: l.medicament_prix_achat ?? null,
      quantite_devis: String(l.quantite_devis), prix_unitaire: String(l.prix_unitaire),
    })))
  }

  useEffect(() => {
    if (!id) return
    api.get<DocumentVente>(`/documents-vente/${id}/`).then((r) => charger(r.data)).catch((e) => setErreur(extraireErreur(e))).finally(() => setChargement(false))
  }, [id])

  const total = useMemo(() => lignes.reduce((s, l) => s + (Number(l.quantite_devis) || 0) * (Number(l.prix_unitaire) || 0), 0), [lignes])

  const charge = () => ({
    client: Number(client), depot: Number(depot), note,
    lignes: lignes.map((l) => ({
      medicament: l.medicament?.id, quantite_devis: Number(l.quantite_devis),
      prix_unitaire: l.prix_unitaire === '' ? undefined : Number(l.prix_unitaire),
    })),
  })

  const verifier = () => {
    if (!client || !depot) return 'Choisissez le client et le dépôt.'
    if (lignes.some((l) => !l.medicament || !(Number(l.quantite_devis) > 0))) return 'Chaque ligne doit indiquer un médicament et une quantité.'
    const ids = lignes.map((l) => l.medicament!.id)
    if (new Set(ids).size !== ids.length) return 'Un même médicament ne peut apparaître que sur une seule ligne : regroupez les quantités.'
    return null
  }

  const enregistrer = async (): Promise<DocumentVente | null> => {
    const probleme = verifier()
    if (probleme) { setErreur(probleme); return null }
    setOccupe(true); setErreur(null)
    try {
      const { data } = doc ? await api.put<DocumentVente>(`/documents-vente/${doc.id}/`, charge()) : await api.post<DocumentVente>('/documents-vente/', charge())
      return data
    } catch (e) { setErreur(extraireErreur(e)); return null }
    finally { setOccupe(false) }
  }

  const enregistrerDevis = async (e?: FormEvent) => {
    e?.preventDefault()
    const d = await enregistrer()
    if (!d) return
    notifier.succes(`Devis ${d.reference} enregistré.`)
    if (!doc) navigate(`/facturation/${d.id}`, { replace: true }); else charger(d)
  }

  const annulerDevis = async () => {
    if (!doc) return
    const ok = await confirmer({ titre: 'Annuler le devis', message: 'Ce devis sera marqué comme annulé et ne pourra plus être modifié ni livré.', libelle: 'Annuler le devis', danger: true })
    if (!ok) return
    try { const { data } = await api.post<DocumentVente>(`/documents-vente/${doc.id}/annuler/`); charger(data); notifier.succes('Devis annulé.') }
    catch (e) { setErreur(extraireErreur(e)) }
  }

  const ouvrirBL = async () => {
    const d = await enregistrer()
    if (!d) return
    if (!doc) navigate(`/facturation/${d.id}`, { replace: true })
    charger(d)
    setQuantitesLivrees(Object.fromEntries((d.lignes ?? []).map((l) => [l.id!, String(l.quantite_devis)])))
    setModaleBL(true)
  }

  const validerBL = async () => {
    if (!doc) return
    setOccupe(true)
    try {
      const payload = { lignes: (doc.lignes ?? []).map((l) => ({ ligne: l.id, quantite_livree: Number(quantitesLivrees[l.id!]) || 0 })) }
      const { data } = await api.post<DocumentVente>(`/documents-vente/${doc.id}/valider-bl/`, payload)
      notifier.succes(`Bon de livraison ${data.numero_bl} créé. Le stock a été mis à jour.`)
      setModaleBL(false); charger(data); setImpression('BON_LIVRAISON')
    } catch (e) { setErreur(extraireErreur(e)); setModaleBL(false) }
    finally { setOccupe(false) }
  }

  const facturer = async () => {
    if (!doc) return
    const ok = await confirmer({ titre: 'Créer la facture', message: `Créer la facture du bon de livraison ${doc.numero_bl} (${formaterMontant(doc.total)}) ?`, libelle: 'Facturer' })
    if (!ok) return
    try {
      const { data } = await api.post<DocumentVente>(`/documents-vente/${doc.id}/valider-facture/`)
      notifier.succes(`Facture ${data.numero_facture} créée.`)
      charger(data)
    } catch (e) { setErreur(extraireErreur(e)) }
  }

  const payer = async (e: FormEvent) => {
    e.preventDefault()
    if (!doc) return
    try {
      const { data } = await api.post<DocumentVente>(`/documents-vente/${doc.id}/payer/`, { montant: Number(paye.montant), mode_paiement: Number(paye.mode) })
      notifier.succes('Paiement enregistré.')
      setModalePaiement(false); charger(data)
    } catch (err) { setErreur(extraireErreur(err)); setModalePaiement(false) }
  }

  if (chargement) return <Chargement />
  const majLigne = (cle: number, partiel: Partial<LigneSaisie>) => setLignes((x) => x.map((l) => (l.cle === cle ? { ...l, ...partiel } : l)))
  const peutGererDevis = admin || magasinier
  const peutPayer = admin || caissier

  const appliquerMarge = () => {
    const pourcentage = Number(marge)
    if (!marge || Number.isNaN(pourcentage)) { notifier.erreur('Indiquez un pourcentage valide.'); return }
    setLignes((x) => x.map((l) => (
      l.prixAchat != null ? { ...l, prix_unitaire: (l.prixAchat * (1 + pourcentage / 100)).toFixed(2) } : l
    )))
    const sansPrixAchat = lignes.filter((l) => l.medicament && l.prixAchat == null).length
    if (sansPrixAchat > 0) notifier.erreur(`${sansPrixAchat} ligne(s) sans prix d'achat connu n'ont pas été modifiées.`)
  }

  return (
    <div>
      <Link to="/facturation" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft size={14} /> Retour à la facturation</Link>
      <EnTetePage titre={doc ? `${doc.etape === 'FACTURE' ? 'Facture' : doc.etape === 'BON_LIVRAISON' ? 'Bon de livraison' : 'Devis'} ${doc.etape === 'FACTURE' ? doc.numero_facture : doc.etape === 'BON_LIVRAISON' ? doc.numero_bl : doc.reference}` : 'Nouveau devis'}
        description={doc ? `Devis d'origine : ${doc.reference}` : undefined}
        actions={<>
          {doc && <Badge ton={tonStatut(doc.annule ? 'ANNULE' : doc.etape)}>{doc.annule ? 'Annulé' : doc.etape_libelle}</Badge>}
          {doc && <button className="btn-secondaire" onClick={() => setImpression('DEVIS')}>Imprimer le devis</button>}
          {doc && doc.etape !== 'DEVIS' && <button className="btn-secondaire" onClick={() => setImpression('BON_LIVRAISON')}>Imprimer le BL</button>}
          {doc && doc.etape === 'FACTURE' && <button className="btn-secondaire" onClick={() => setImpression('FACTURE')}>Imprimer la facture</button>}
          {doc && modifiable && peutGererDevis && <button className="btn-secondaire" onClick={annulerDevis}>Annuler le devis</button>}
          {modifiable && peutGererDevis && <button className="btn-secondaire" disabled={occupe} onClick={() => enregistrerDevis()}>Enregistrer le devis</button>}
          {modifiable && peutGererDevis && <button className="btn-primaire" disabled={occupe} onClick={ouvrirBL}>Valider en bon de livraison</button>}
          {doc?.etape === 'BON_LIVRAISON' && admin && <button className="btn-primaire" onClick={facturer}>Facturer</button>}
          {doc?.etape === 'FACTURE' && Number(doc.reste_a_payer) > 0 && peutPayer && (
            <button className="btn-primaire" onClick={() => { setPaye({ montant: String(doc.reste_a_payer), mode: modes.find((m) => m.type === 'ESPECES')?.id?.toString() ?? '' }); setModalePaiement(true) }}>Enregistrer un paiement</button>
          )}
        </>} />
      <MessageErreur message={erreur} />

      <div className="carte mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle="Client" requis>
          <select className="champ" value={client} onChange={(e) => setClient(e.target.value)} disabled={!modifiable}><option value="">— Choisir —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
        </Champ>
        <Champ libelle="Dépôt" requis>
          <select className="champ" value={depot} onChange={(e) => setDepot(e.target.value)} disabled={!modifiable}><option value="">— Choisir —</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
        </Champ>
        <Champ libelle="Note"><input className="champ" value={note} onChange={(e) => setNote(e.target.value)} disabled={!modifiable} /></Champ>
      </div>

      {modifiable && peutGererDevis && (
        <div className="carte mb-4 flex flex-wrap items-end gap-3 p-4">
          <Champ libelle="Marge sur prix d'achat (%)" aide="Recalcule le prix unitaire de toutes les lignes : prix d'achat × (1 + marge/100).">
            <input className="champ w-40" type="number" step="0.1" placeholder="ex. 20" value={marge} onChange={(e) => setMarge(e.target.value)} />
          </Champ>
          <button type="button" className="btn-secondaire" onClick={appliquerMarge}>Appliquer à toutes les lignes</button>
        </div>
      )}

      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="w-72 px-3 py-2.5">Médicament</th>
              <th className="px-3 py-2.5 text-right">Qté devis</th>
              {doc && doc.etape !== 'DEVIS' && <th className="px-3 py-2.5 text-right">Qté livrée</th>}
              <th className="px-3 py-2.5 text-right">Prix unitaire</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map((l, i) => (
              <tr key={l.cle} className="align-top">
                <td className="px-3 py-2">
                  {modifiable
                    ? <SelectionMedicament valeur={l.medicament} onChoisir={(m) => {
                        if (m && lignes.some((autre) => autre.cle !== l.cle && autre.medicament?.id === m.id)) {
                          notifier.erreur(`« ${m.nom} » est déjà présent dans ce devis. Modifiez plutôt la quantité de la ligne existante.`)
                          return
                        }
                        majLigne(l.cle, m ? { medicament: { id: m.id, nom: `${m.nom} ${m.dosage}`.trim() }, prixAchat: m.prix_achat ?? null, prix_unitaire: l.prix_unitaire || String(m.prix_vente ?? '') } : { medicament: null, prixAchat: null })
                      }} placeholder="Rechercher…" />
                    : l.medicament?.nom}
                </td>
                <td className="px-3 py-2 text-right">{modifiable ? <input className="champ w-24 text-right" type="number" min={1} value={l.quantite_devis} onChange={(e) => majLigne(l.cle, { quantite_devis: e.target.value })} aria-label="Quantité devis" /> : l.quantite_devis}</td>
                {doc && doc.etape !== 'DEVIS' && <td className="px-3 py-2 text-right font-medium">{doc.lignes?.[i]?.quantite_livree ?? 0}</td>}
                <td className="px-3 py-2 text-right">{modifiable ? <input className="champ w-28 text-right" type="number" min={0} step="0.01" value={l.prix_unitaire} onChange={(e) => majLigne(l.cle, { prix_unitaire: e.target.value })} aria-label="Prix unitaire" /> : formaterMontant(Number(l.prix_unitaire))}</td>
                <td className="px-3 py-2 pt-4 text-right font-medium">{formaterMontant((Number(l.quantite_devis) || 0) * (Number(l.prix_unitaire) || 0))}</td>
                <td className="px-3 py-2 pt-3">{modifiable && lignes.length > 1 && <button className="text-slate-400 hover:text-red-600" onClick={() => setLignes((x) => x.filter((y) => y.cle !== l.cle))} aria-label="Retirer la ligne"><Trash2 size={16} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-3">
          {modifiable ? <button className="btn-secondaire btn-petit" onClick={() => setLignes((x) => [...x, nouvelleLigne()])}><Plus size={14} /> Ajouter une ligne</button> : <span />}
          <p className="text-lg font-semibold">Total : {formaterMontant(doc && !modifiable ? doc.total : total)}</p>
        </div>
      </div>

      {doc?.etape === 'FACTURE' && (
        <div className="carte mt-4 p-4">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><h2 className="font-semibold">Paiements</h2><p>Payé : <strong>{formaterMontant(doc.montant_paye)}</strong> · Reste : <strong className={Number(doc.reste_a_payer) > 0 ? 'text-red-700' : 'text-emerald-700'}>{formaterMontant(doc.reste_a_payer)}</strong></p></div>
          {(doc.paiements ?? []).length === 0 ? <p className="text-sm text-slate-500">Aucun paiement enregistré.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {doc.paiements!.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{formaterDateHeure(p.date_paiement)} · {p.mode_paiement_nom} · {p.utilisateur_nom}</span><span className="font-medium">{formaterMontant(p.montant)}</span></li>)}
            </ul>
          )}
        </div>
      )}

      <Modale ouverte={modaleBL} titre="Valider le bon de livraison" onFermer={() => setModaleBL(false)} largeur="moyenne"
        pied={<><button className="btn-secondaire" onClick={() => setModaleBL(false)}>Retour</button><button className="btn-primaire" disabled={occupe} onClick={validerBL}>Valider et sortir le stock</button></>}>
        <div className="space-y-3">
          <p className="text-sm text-amber-700">Indiquez les quantités réellement livrées : elles sortent du stock immédiatement et servent de base à la facture.</p>
          {(doc?.lignes ?? []).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">{l.medicament_nom} <span className="text-slate-400">(commandé : {l.quantite_devis})</span></span>
              <input className="champ w-24 text-right" type="number" min={0} max={l.quantite_devis}
                value={quantitesLivrees[l.id!] ?? ''} onChange={(e) => setQuantitesLivrees((q) => ({ ...q, [l.id!]: e.target.value }))} />
            </div>
          ))}
        </div>
      </Modale>

      <Modale ouverte={modalePaiement} titre="Paiement de la facture" onFermer={() => setModalePaiement(false)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setModalePaiement(false)}>Annuler</button><button className="btn-primaire" type="submit" form="formulaire-paiement-facture">Enregistrer le paiement</button></>}>
        <form id="formulaire-paiement-facture" onSubmit={payer} className="space-y-3">
          <Champ libelle="Montant" requis aide={doc ? `Reste à payer : ${formaterMontant(doc.reste_a_payer)}` : undefined}>
            <input className="champ" type="number" min={0.01} max={doc?.reste_a_payer} step="0.01" value={paye.montant} onChange={(e) => setPaye({ ...paye, montant: e.target.value })} required />
          </Champ>
          <Champ libelle="Mode de paiement" requis><select className="champ" value={paye.mode} onChange={(e) => setPaye({ ...paye, mode: e.target.value })} required><option value="">—</option>{modes.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></Champ>
        </form>
      </Modale>

      <DocumentVenteImpression document={impression ? doc : null} type={impression ?? 'DEVIS'} onFermer={() => setImpression(null)} />
    </div>
  )
}
