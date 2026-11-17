import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, tonStatut } from '../../composants/Badge'
import { BonCommandeImpression } from '../../composants/BonCommandeImpression'
import { Champ } from '../../composants/Champ'
import { useConfirmer } from '../../composants/Confirmation'
import { Chargement, EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { useNotifier } from '../../composants/Notifications'
import { SelectionMedicament } from '../../composants/SelectionMedicament'
import { useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { BonCommande, Depot, Fournisseur } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { aujourdhui, formaterMontant, libelleStatut } from '../../utilitaires/formatage'

import { t } from '../../i18n'
interface LigneSaisie {
  cle: number
  medicament: { id: number; nom: string } | null
  quantite: string
  prix_achat: string
}

let compteur = 0
const nouvelleLigne = (): LigneSaisie => ({ cle: ++compteur, medicament: null, quantite: '1', prix_achat: '' })

/** Formulaire de bon de commande fournisseur, construit comme celui du devis : on choisit le fournisseur, puis les
 * médicaments et les quantités ; le bon s'imprime (PDF) ou s'exporte en Excel, en français, en arabe ou dans les deux. */
export default function BonCommandeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notifier = useNotifier()
  const confirmer = useConfirmer()
  const fournisseurs = useOptions<Fournisseur>('/fournisseurs/', { actif: 1 })
  const depots = useOptions<Depot>('/depots/', { actif: 1 })

  const [bon, setBon] = useState<BonCommande | null>(null)
  const [chargement, setChargement] = useState(!!id)
  const [fournisseur, setFournisseur] = useState('')
  const [depot, setDepot] = useState('')
  const [dateCommande, setDateCommande] = useState(aujourdhui())
  const [dateLivraison, setDateLivraison] = useState('')
  const [note, setNote] = useState('')
  const [lignes, setLignes] = useState<LigneSaisie[]>([nouvelleLigne()])
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [impression, setImpression] = useState(false)

  const modifiable = !bon || bon.statut === 'BROUILLON'

  const charger = (b: BonCommande) => {
    setBon(b); setFournisseur(String(b.fournisseur)); setDepot(String(b.depot)); setDateCommande(b.date_commande)
    setDateLivraison(b.date_livraison_prevue ?? ''); setNote(b.note ?? '')
    setLignes((b.lignes ?? []).map((l) => ({
      cle: ++compteur, medicament: l.medicament ? { id: l.medicament, nom: [l.medicament_nom, l.medicament_dosage].filter(Boolean).join(' ') || (l.designation ?? '') } : null,
      quantite: String(l.quantite), prix_achat: String(l.prix_achat),
    })))
  }

  useEffect(() => {
    if (!id) return
    api.get<BonCommande>(`/bons-commande/${id}/`).then((r) => charger(r.data)).catch((e) => setErreur(extraireErreur(e))).finally(() => setChargement(false))
  }, [id])

  const total = useMemo(() => lignes.reduce((s, l) => s + (Number(l.quantite) || 0) * (Number(l.prix_achat) || 0), 0), [lignes])

  const charge = () => ({
    fournisseur: Number(fournisseur), depot: Number(depot), date_commande: dateCommande,
    date_livraison_prevue: dateLivraison || null, note,
    lignes: lignes.map((l) => ({
      medicament: l.medicament?.id, quantite: Number(l.quantite),
      prix_achat: l.prix_achat === '' ? undefined : Number(l.prix_achat),
    })),
  })

  const verifier = () => {
    if (!fournisseur || !depot) return t('Choisissez le fournisseur et le dépôt de livraison.')
    if (lignes.some((l) => !l.medicament || !(Number(l.quantite) > 0))) return t('Chaque ligne doit indiquer un médicament et une quantité.')
    const ids = lignes.map((l) => l.medicament!.id)
    if (new Set(ids).size !== ids.length) return t('Un même médicament ne peut apparaître que sur une seule ligne : regroupez les quantités.')
    return null
  }

  const enregistrer = async (): Promise<BonCommande | null> => {
    const probleme = verifier()
    if (probleme) { setErreur(probleme); return null }
    setOccupe(true); setErreur(null)
    try {
      const { data } = bon ? await api.put<BonCommande>(`/bons-commande/${bon.id}/`, charge()) : await api.post<BonCommande>('/bons-commande/', charge())
      return data
    } catch (e) { setErreur(extraireErreur(e)); return null }
    finally { setOccupe(false) }
  }

  const surBrouillon = async () => {
    const b = await enregistrer()
    if (!b) return
    notifier.succes(t('Bon de commande {reference} enregistré.', { reference: b.reference }))
    if (!bon) navigate(`/achats/commandes/${b.id}`, { replace: true }); else charger(b)
  }

  const apercu = async () => {
    // Le document imprimé reflète toujours ce qui est enregistré : on enregistre d'abord le brouillon en cours.
    if (modifiable) {
      const b = await enregistrer()
      if (!b) return
      if (!bon) navigate(`/achats/commandes/${b.id}`, { replace: true })
      charger(b)
    }
    setImpression(true)
  }

  const transition = async (action: 'envoyer' | 'recu' | 'annuler', messageSucces: string) => {
    if (!bon) return
    setErreur(null)
    try {
      const { data } = await api.post<BonCommande>(`/bons-commande/${bon.id}/${action}/`)
      charger(data); notifier.succes(messageSucces)
    } catch (e) { setErreur(extraireErreur(e)) }
  }

  const envoyer = async () => {
    const probleme = verifier()
    if (probleme) { setErreur(probleme); return }
    const ok = await confirmer({ titre: t('Marquer comme envoyé'), message: t('Une fois envoyé, le bon de commande ne pourra plus être modifié.'), libelle: t('Marquer comme envoyé') })
    if (!ok) return
    const b = await enregistrer()
    if (!b) return
    if (!bon) navigate(`/achats/commandes/${b.id}`, { replace: true })
    try {
      const { data } = await api.post<BonCommande>(`/bons-commande/${b.id}/envoyer/`)
      charger(data); notifier.succes(t('Bon de commande marqué comme envoyé.'))
    } catch (e) { setErreur(extraireErreur(e)); charger(b) }
  }

  const annuler = async () => {
    const ok = await confirmer({ titre: t('Annuler le bon de commande'), message: t('Ce bon de commande sera marqué comme annulé.'), libelle: t('Annuler le bon de commande'), danger: true })
    if (ok) await transition('annuler', t('Bon de commande annulé.'))
  }

  if (chargement) return <Chargement />
  const majLigne = (cle: number, partiel: Partial<LigneSaisie>) => setLignes((x) => x.map((l) => (l.cle === cle ? { ...l, ...partiel } : l)))

  return (
    <div>
      <Link to="/achats/commandes" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft size={14} className="rtl:-scale-x-100" /> {' '}{t('Retour aux bons de commande')}</Link>
      <EnTetePage titre={bon ? t('Bon de commande {reference}', { reference: bon.reference }) : t('Nouveau bon de commande')}
        description={bon ? t('Créé par {nom}', { nom: bon.utilisateur_nom }) : undefined}
        actions={<>
          {bon && <Badge ton={tonStatut(bon.statut)}>{libelleStatut(bon.statut)}</Badge>}
          <button className="btn-secondaire" disabled={occupe} onClick={apercu}>{t('Imprimer / Exporter')}</button>
          {bon && (bon.statut === 'BROUILLON' || bon.statut === 'ENVOYE') && <button className="btn-secondaire" onClick={annuler}>{t('Annuler le bon de commande')}</button>}
          {modifiable && <button className="btn-secondaire" disabled={occupe} onClick={surBrouillon}>{t('Enregistrer')}</button>}
          {modifiable && <button className="btn-primaire" disabled={occupe} onClick={envoyer}>{t('Marquer comme envoyé')}</button>}
          {bon?.statut === 'ENVOYE' && <button className="btn-primaire" onClick={() => transition('recu', t('Bon de commande marqué comme reçu.'))}>{t('Marquer la marchandise comme reçue')}</button>}
        </>} />
      <MessageErreur message={erreur} />

      <div className="carte mb-4 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Champ libelle={t('Fournisseur')} requis>
          <select className="champ" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} disabled={!modifiable}><option value="">{t('— Choisir —')}</option>{fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}</select>
        </Champ>
        <Champ libelle={t('Dépôt de livraison')} requis>
          <select className="champ" value={depot} onChange={(e) => setDepot(e.target.value)} disabled={!modifiable}><option value="">{t('— Choisir —')}</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
        </Champ>
        <Champ libelle={t('Date de la commande')}><input className="champ" type="date" value={dateCommande} onChange={(e) => setDateCommande(e.target.value)} disabled={!modifiable} /></Champ>
        <Champ libelle={t('Livraison prévue le')}><input className="champ" type="date" min={dateCommande} value={dateLivraison} onChange={(e) => setDateLivraison(e.target.value)} disabled={!modifiable} /></Champ>
      </div>

      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-start text-slate-600">
            <tr>
              <th className="px-3 py-2.5 whitespace-nowrap">{t('Médicament')}</th>
              <th className="w-36 px-3 py-2.5 text-end whitespace-nowrap">{t('Quantité (boîtes)')}</th>
              <th className="w-40 px-3 py-2.5 text-end whitespace-nowrap">{t('Prix d\'achat estimé')}</th>
              <th className="w-32 px-3 py-2.5 text-end whitespace-nowrap">{t('Total')}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map((l) => (
              <tr key={l.cle} className="align-top">
                <td className="px-3 py-2">
                  {modifiable
                    ? <SelectionMedicament valeur={l.medicament} onChoisir={(m) => {
                        if (m && lignes.some((autre) => autre.cle !== l.cle && autre.medicament?.id === m.id)) {
                          notifier.erreur(t('« {nom} » est déjà présent dans ce bon de commande. Modifiez plutôt la quantité de la ligne existante.', { nom: m.nom }))
                          return
                        }
                        majLigne(l.cle, m ? { medicament: { id: m.id, nom: `${m.nom} ${m.dosage}`.trim() }, prix_achat: l.prix_achat || String(m.prix_achat ?? '') } : { medicament: null })
                      }} placeholder={t('Rechercher…')} />
                    : l.medicament?.nom}
                </td>
                <td className="px-3 py-2 text-end">{modifiable ? <div className="flex justify-end"><input className="champ w-28 text-end" type="number" min={1} value={l.quantite} onChange={(e) => majLigne(l.cle, { quantite: e.target.value })} aria-label={t('Quantité')} /></div> : l.quantite}</td>
                <td className="px-3 py-2 text-end">{modifiable ? <div className="flex justify-end"><input className="champ w-32 text-end" type="number" min={0} step="0.01" value={l.prix_achat} placeholder={t('Idem fiche')} onChange={(e) => majLigne(l.cle, { prix_achat: e.target.value })} aria-label={t('Prix d\'achat estimé')} /></div> : formaterMontant(Number(l.prix_achat))}</td>
                <td className="px-3 py-2 pt-4 text-end font-medium">{formaterMontant((Number(l.quantite) || 0) * (Number(l.prix_achat) || 0))}</td>
                <td className="px-3 py-2 pt-3">{modifiable && lignes.length > 1 && <button className="text-slate-400 hover:text-red-600" onClick={() => setLignes((x) => x.filter((y) => y.cle !== l.cle))} aria-label={t('Retirer la ligne')}><Trash2 size={16} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-3">
          {modifiable ? <button className="btn-secondaire btn-petit" onClick={() => setLignes((x) => [...x, nouvelleLigne()])}><Plus size={14} /> {' '}{t('Ajouter une ligne')}</button> : <span />}
          <p className="text-lg font-semibold">{t('Total estimé :')}{' '}{formaterMontant(bon && !modifiable ? bon.total : total)}</p>
        </div>
      </div>
      <div className="mt-4"><Champ libelle={t('Note')}><input className="champ max-w-xl" value={note} onChange={(e) => setNote(e.target.value)} disabled={!modifiable} /></Champ></div>

      <BonCommandeImpression bon={impression ? bon : null} onFermer={() => setImpression(false)} />
    </div>
  )
}
