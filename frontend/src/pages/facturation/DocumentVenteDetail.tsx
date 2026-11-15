import { ArrowLeft, Plus, RotateCcw, Trash2 } from 'lucide-react'
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

import { t } from '../../i18n'
interface LigneSaisie {
  cle: number
  medicament: { id: number; nom: string } | null
  prixAchat: number | null
  quantite_devis: string
  prix_unitaire: string
  margeAppliquee: boolean
}

let compteur = 0
const nouvelleLigne = (): LigneSaisie => ({ cle: ++compteur, medicament: null, prixAchat: null, quantite_devis: '1', prix_unitaire: '', margeAppliquee: false })

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
      quantite_devis: String(l.quantite_devis), prix_unitaire: String(l.prix_unitaire), margeAppliquee: false,
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
    notifier.succes(t('Devis {reference} enregistré.', { reference: d.reference }))
    if (!doc) navigate(`/facturation/${d.id}`, { replace: true }); else charger(d)
  }

  const annulerDevis = async () => {
    if (!doc) return
    const ok = await confirmer({ titre: t('Annuler le devis'), message: t('Ce devis sera marqué comme annulé et ne pourra plus être modifié ni livré.'), libelle: t('Annuler le devis'), danger: true })
    if (!ok) return
    try { const { data } = await api.post<DocumentVente>(`/documents-vente/${doc.id}/annuler/`); charger(data); notifier.succes(t('Devis annulé.')) }
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
      notifier.succes(t('Bon de livraison {reference} créé. Le stock a été mis à jour.', { reference: data.numero_bl }))
      setModaleBL(false); charger(data); setImpression('BON_LIVRAISON')
    } catch (e) { setErreur(extraireErreur(e)); setModaleBL(false) }
    finally { setOccupe(false) }
  }

  const facturer = async () => {
    if (!doc) return
    const ok = await confirmer({ titre: t('Créer la facture'), message: t('Créer la facture du bon de livraison {reference} ({montant}) ?', { reference: doc.numero_bl, montant: formaterMontant(doc.total) }), libelle: t('Facturer') })
    if (!ok) return
    try {
      const { data } = await api.post<DocumentVente>(`/documents-vente/${doc.id}/valider-facture/`)
      notifier.succes(t('Facture {reference} créée.', { reference: data.numero_facture }))
      charger(data)
    } catch (e) { setErreur(extraireErreur(e)) }
  }

  const payer = async (e: FormEvent) => {
    e.preventDefault()
    if (!doc) return
    try {
      const { data } = await api.post<DocumentVente>(`/documents-vente/${doc.id}/payer/`, { montant: Number(paye.montant), mode_paiement: Number(paye.mode) })
      notifier.succes(t('Paiement enregistré.'))
      setModalePaiement(false); charger(data)
    } catch (err) { setErreur(extraireErreur(err)); setModalePaiement(false) }
  }

  if (chargement) return <Chargement />
  const majLigne = (cle: number, partiel: Partial<LigneSaisie>) => setLignes((x) => x.map((l) => (l.cle === cle ? { ...l, ...partiel } : l)))
  const peutGererDevis = admin || magasinier || caissier
  const peutPayer = admin || caissier

  const appliquerMarge = () => {
    const pourcentage = Number(marge)
    if (!marge || Number.isNaN(pourcentage)) { notifier.erreur(t('Indiquez un pourcentage valide.')); return }
    setLignes((x) => x.map((l) => (
      l.prixAchat != null ? { ...l, prix_unitaire: (l.prixAchat * (1 + pourcentage / 100)).toFixed(2), margeAppliquee: true } : l
    )))
    const sansPrixAchat = lignes.filter((l) => l.medicament && l.prixAchat == null).length
    if (sansPrixAchat > 0) notifier.erreur(t("{n} ligne(s) sans prix d'achat connu n'ont pas été modifiées.", { n: sansPrixAchat }))
  }

  const annulerMarge = () => {
    setLignes((x) => x.map((l) => (
      l.prixAchat != null ? { ...l, prix_unitaire: l.prixAchat.toFixed(2), margeAppliquee: false } : l
    )))
    setMarge('')
  }

  return (
    <div>
      <Link to="/facturation" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft size={14} className="rtl:-scale-x-100" /> {' '}{t('Retour à la facturation')}</Link>
      <EnTetePage titre={doc ? `${doc.etape === 'FACTURE' ? t('Facture') : doc.etape === 'BON_LIVRAISON' ? t('Bon de livraison') : t('Devis')} ${doc.etape === 'FACTURE' ? doc.numero_facture : doc.etape === 'BON_LIVRAISON' ? doc.numero_bl : doc.reference}` : t('Nouveau devis')}
        description={doc ? t('Devis d\'origine : {reference}', { reference: doc.reference }) : undefined}
        actions={<>
          {doc && <Badge ton={tonStatut(doc.annule ? 'ANNULE' : doc.etape)}>{doc.annule ? t('Annulé') : doc.etape_libelle}</Badge>}
          {doc && <button className="btn-secondaire" onClick={() => setImpression('DEVIS')}>{t('Imprimer le devis')}</button>}
          {doc && doc.etape !== 'DEVIS' && <button className="btn-secondaire" onClick={() => setImpression('BON_LIVRAISON')}>{t('Imprimer le BL')}</button>}
          {doc && doc.etape === 'FACTURE' && <button className="btn-secondaire" onClick={() => setImpression('FACTURE')}>{t('Imprimer la facture')}</button>}
          {doc && modifiable && peutGererDevis && <button className="btn-secondaire" onClick={annulerDevis}>{t('Annuler le devis')}</button>}
          {modifiable && peutGererDevis && <button className="btn-secondaire" disabled={occupe} onClick={() => enregistrerDevis()}>{t('Enregistrer le devis')}</button>}
          {modifiable && peutGererDevis && <button className="btn-primaire" disabled={occupe} onClick={ouvrirBL}>{t('Valider en bon de livraison')}</button>}
          {doc?.etape === 'BON_LIVRAISON' && (admin || (caissier && doc.personnel === utilisateur?.id)) && <button className="btn-primaire" onClick={facturer}>{t('Facturer')}</button>}
          {doc?.etape === 'FACTURE' && Number(doc.reste_a_payer) > 0 && peutPayer && (
            <button className="btn-primaire" onClick={() => { setPaye({ montant: String(doc.reste_a_payer), mode: modes.find((m) => m.type === 'ESPECES')?.id?.toString() ?? '' }); setModalePaiement(true) }}>{t('Enregistrer un paiement')}</button>
          )}
        </>} />
      <MessageErreur message={erreur} />

      <div className="carte mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ libelle={t('Client')} requis>
          <select className="champ" value={client} onChange={(e) => setClient(e.target.value)} disabled={!modifiable}><option value="">{t('— Choisir —')}</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
        </Champ>
        <Champ libelle={t('Dépôt')} requis aide={t('Choisis-le avant d\'ajouter des lignes : seuls les médicaments en stock dans ce dépôt seront proposés.')}>
          <select className="champ" value={depot} onChange={(e) => setDepot(e.target.value)} disabled={!modifiable}><option value="">{t('— Choisir —')}</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
        </Champ>
        <Champ libelle={t('Note')}><input className="champ" value={note} onChange={(e) => setNote(e.target.value)} disabled={!modifiable} /></Champ>
      </div>

      {modifiable && peutGererDevis && (
        <div className="carte mb-4 flex flex-wrap items-end gap-3 p-4">
          <Champ libelle={t('Marge sur prix d\'achat (%)')} aide={t('Recalcule le prix unitaire de toutes les lignes : prix d\'achat × (1 + marge/100).')}>
            <input className="champ w-40" type="number" step="0.1" placeholder={t('ex. 20')} value={marge} onChange={(e) => setMarge(e.target.value)} />
          </Champ>
          <button type="button" className="btn-secondaire" onClick={appliquerMarge}>{t('Appliquer à toutes les lignes')}</button>
          <button type="button" className="btn-discret" onClick={annulerMarge} title={t('Remet le prix d\'achat brut (sans marge) sur chaque ligne')}>
            <RotateCcw size={14} /> {' '}{t('Annuler la marge')}
          </button>
        </div>
      )}

      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-start text-slate-600">
            <tr>
              <th className="px-3 py-2.5 whitespace-nowrap">{t('Médicament')}</th>
              <th className="w-28 px-3 py-2.5 text-end whitespace-nowrap">{t('Qté devis')}</th>
              {doc && doc.etape !== 'DEVIS' && <th className="w-28 px-3 py-2.5 text-end whitespace-nowrap">{t('Qté livrée')}</th>}
              <th className="w-32 px-3 py-2.5 text-end whitespace-nowrap">{t('Prix unitaire')}</th>
              <th className="w-32 px-3 py-2.5 text-end whitespace-nowrap">{t('Total')}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map((l, i) => (
              <tr key={l.cle} className="align-top">
                <td className="px-3 py-2">
                  {modifiable
                    ? <SelectionMedicament valeur={l.medicament} depot={depot ? Number(depot) : undefined} onChoisir={(m) => {
                        if (m && lignes.some((autre) => autre.cle !== l.cle && autre.medicament?.id === m.id)) {
                          notifier.erreur(t('« {nom} » est déjà présent dans ce devis. Modifiez plutôt la quantité de la ligne existante.', { nom: m.nom }))
                          return
                        }
                        majLigne(l.cle, m ? { medicament: { id: m.id, nom: `${m.nom} ${m.dosage}`.trim() }, prixAchat: m.prix_achat ?? null, prix_unitaire: l.prix_unitaire || String(m.prix_vente ?? ''), margeAppliquee: false } : { medicament: null, prixAchat: null, margeAppliquee: false })
                      }} placeholder={t('Rechercher…')} />
                    : l.medicament?.nom}
                </td>
                <td className="px-3 py-2 text-end">{modifiable ? <div className="flex justify-end"><input className="champ w-24 text-end" type="number" min={1} value={l.quantite_devis} onChange={(e) => majLigne(l.cle, { quantite_devis: e.target.value })} aria-label={t('Quantité devis')} /></div> : l.quantite_devis}</td>
                {doc && doc.etape !== 'DEVIS' && <td className="px-3 py-2 text-end font-medium">{doc.lignes?.[i]?.quantite_livree ?? 0}</td>}
                <td className="px-3 py-2 text-end">
                  {modifiable ? (
                    <div className="flex items-center justify-end gap-1">
                      {l.margeAppliquee && <span title={t('Prix calculé automatiquement par la marge')} className="text-xs text-emerald-600">%</span>}
                      <input className={`champ w-28 text-end ${l.margeAppliquee ? 'border-emerald-300 bg-emerald-50' : ''}`} type="number" min={0} step="0.01" value={l.prix_unitaire}
                        onChange={(e) => majLigne(l.cle, { prix_unitaire: e.target.value, margeAppliquee: false })} aria-label={t('Prix unitaire')} />
                    </div>
                  ) : formaterMontant(Number(l.prix_unitaire))}
                </td>
                <td className="px-3 py-2 pt-4 text-end font-medium">{formaterMontant((Number(l.quantite_devis) || 0) * (Number(l.prix_unitaire) || 0))}</td>
                <td className="px-3 py-2 pt-3">{modifiable && lignes.length > 1 && <button className="text-slate-400 hover:text-red-600" onClick={() => setLignes((x) => x.filter((y) => y.cle !== l.cle))} aria-label={t('Retirer la ligne')}><Trash2 size={16} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-3">
          {modifiable ? <button className="btn-secondaire btn-petit" onClick={() => setLignes((x) => [...x, nouvelleLigne()])}><Plus size={14} /> {' '}{t('Ajouter une ligne')}</button> : <span />}
          <p className="text-lg font-semibold">{t('Total :')}{' '}{formaterMontant(doc && !modifiable ? doc.total : total)}</p>
        </div>
      </div>

      {doc?.etape === 'FACTURE' && (
        <div className="carte mt-4 p-4">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><h2 className="font-semibold">{t('Paiements')}</h2><p>{t('Payé :')}{' '}<strong>{formaterMontant(doc.montant_paye)}</strong> {' '}{t('· Reste :')}{' '}<strong className={Number(doc.reste_a_payer) > 0 ? 'text-red-700' : 'text-emerald-700'}>{formaterMontant(doc.reste_a_payer)}</strong></p></div>
          {(doc.paiements ?? []).length === 0 ? <p className="text-sm text-slate-500">{t('Aucun paiement enregistré.')}</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {doc.paiements!.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{formaterDateHeure(p.date_paiement)} · {p.mode_paiement_nom} · {p.utilisateur_nom}</span><span className="font-medium">{formaterMontant(p.montant)}</span></li>)}
            </ul>
          )}
        </div>
      )}

      <Modale ouverte={modaleBL} titre={t('Valider le bon de livraison')} onFermer={() => setModaleBL(false)} largeur="moyenne"
        pied={<><button className="btn-secondaire" onClick={() => setModaleBL(false)}>{t('Retour')}</button><button className="btn-primaire" disabled={occupe} onClick={validerBL}>{t('Valider et sortir le stock')}</button></>}>
        <div className="space-y-3">
          <p className="text-sm text-amber-700">{t('Indiquez les quantités réellement livrées : elles sortent du stock immédiatement et servent de base à la facture.')}</p>
          {(doc?.lignes ?? []).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">{l.medicament_nom} <span className="text-slate-400">{t('(commandé :')}{' '}{l.quantite_devis})</span></span>
              <input className="champ w-24 text-end" type="number" min={0} max={l.quantite_devis}
                value={quantitesLivrees[l.id!] ?? ''} onChange={(e) => setQuantitesLivrees((q) => ({ ...q, [l.id!]: e.target.value }))} />
            </div>
          ))}
        </div>
      </Modale>

      <Modale ouverte={modalePaiement} titre={t('Paiement de la facture')} onFermer={() => setModalePaiement(false)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setModalePaiement(false)}>{t('Annuler')}</button><button className="btn-primaire" type="submit" form="formulaire-paiement-facture">{t('Enregistrer le paiement')}</button></>}>
        <form id="formulaire-paiement-facture" onSubmit={payer} className="space-y-3">
          <Champ libelle={t('Montant')} requis aide={doc ? t('Reste à payer : {montant}', { montant: formaterMontant(doc.reste_a_payer) }) : undefined}>
            <input className="champ" type="number" min={0.01} max={doc?.reste_a_payer} step="0.01" value={paye.montant} onChange={(e) => setPaye({ ...paye, montant: e.target.value })} required />
          </Champ>
          <Champ libelle={t('Mode de paiement')} requis><select className="champ" value={paye.mode} onChange={(e) => setPaye({ ...paye, mode: e.target.value })} required><option value="">—</option>{modes.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></Champ>
        </form>
      </Modale>

      <DocumentVenteImpression document={impression ? doc : null} type={impression ?? 'DEVIS'} onFermer={() => setImpression(null)} />
    </div>
  )
}
