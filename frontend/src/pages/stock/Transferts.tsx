import { Trash2 } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Badge, tonStatut } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { useConfirmer } from '../../composants/Confirmation'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { SelectionLotStock } from '../../composants/SelectionLotStock'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe, useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Depot, LigneStock, Transfert } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { formaterDate, formaterDateHeure, formaterDateHeureExport, libelleStatut } from '../../utilitaires/formatage'

interface LigneSaisie { lot: number; medicament: string; numero_lot: string; date_peremption: string; disponible: number; quantite: string }

function FormulaireTransfert({ ouvert, onFermer, apres }: { ouvert: boolean; onFermer: () => void; apres: () => void }) {
  const notifier = useNotifier()
  const depots = useOptions<Depot>('/depots/', { actif: 1 })
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const [note, setNote] = useState('')
  const [lignes, setLignes] = useState<LigneSaisie[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  const ajouter = (l: LigneStock) =>
    setLignes((x) => [...x, { lot: l.lot, medicament: `${l.medicament} ${l.dosage}`, numero_lot: l.numero_lot, date_peremption: l.date_peremption, disponible: l.quantite, quantite: '1' }])

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    if (lignes.length === 0) { setErreur('Ajoutez au moins un lot à transférer.'); return }
    try {
      await api.post('/transferts/', { depot_source: Number(source), depot_destination: Number(destination), note, lignes: lignes.map((l) => ({ lot: l.lot, quantite: Number(l.quantite) })) })
      notifier.succes('Transfert enregistré en brouillon. Validez-le pour déplacer le stock.')
      setLignes([]); setNote(''); setSource(''); setDestination(''); onFermer(); apres()
    } catch (err) { setErreur(extraireErreur(err)) }
  }

  return (
    <Modale ouverte={ouvert} titre="Nouveau transfert entre dépôts" onFermer={onFermer} largeur="grande"
      pied={<><button className="btn-secondaire" onClick={onFermer}>Annuler</button><button className="btn-primaire" type="submit" form="formulaire-transfert">Enregistrer le brouillon</button></>}>
      <form id="formulaire-transfert" onSubmit={enregistrer} className="space-y-4">
        <MessageErreur message={erreur} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="Dépôt source" requis>
            <select className="champ" value={source} onChange={(e) => { setSource(e.target.value); setLignes([]) }} required><option value="">— Choisir —</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
          </Champ>
          <Champ libelle="Dépôt destination" requis>
            <select className="champ" value={destination} onChange={(e) => setDestination(e.target.value)} required><option value="">— Choisir —</option>{depots.filter((d) => String(d.id) !== source).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
          </Champ>
        </div>
        <Champ libelle="Ajouter un lot à transférer"><SelectionLotStock depot={source ? Number(source) : ''} onChoisir={ajouter} exclus={lignes.map((l) => l.lot)} /></Champ>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Médicament</th><th className="px-3 py-2">Lot</th><th className="px-3 py-2">Péremption</th><th className="px-3 py-2 text-right">Disponible</th><th className="px-3 py-2 text-right">Quantité</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {lignes.length === 0 && <tr><td colSpan={6} className="px-3 py-5 text-center text-slate-500">Aucun lot ajouté.</td></tr>}
              {lignes.map((l, i) => (
                <tr key={l.lot}>
                  <td className="px-3 py-2">{l.medicament}</td><td className="px-3 py-2">{l.numero_lot}</td><td className="px-3 py-2">{formaterDate(l.date_peremption)}</td>
                  <td className="px-3 py-2 text-right">{l.disponible}</td>
                  <td className="px-3 py-2 text-right"><input type="number" min={1} max={l.disponible} className="champ w-24 py-1 text-right" value={l.quantite} onChange={(e) => setLignes((x) => x.map((y, j) => (j === i ? { ...y, quantite: e.target.value } : y)))} /></td>
                  <td className="px-3 py-2"><button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setLignes((x) => x.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Champ libelle="Note"><input className="champ" value={note} onChange={(e) => setNote(e.target.value)} /></Champ>
      </form>
    </Modale>
  )
}

export default function Transferts() {
  const notifier = useNotifier()
  const confirmer = useConfirmer()
  const [statut, setStatut] = useState('')
  const liste = useListe<Transfert>('/transferts/', { filtres: { statut }, triInitial: '-date_transfert' })
  const [modale, setModale] = useState(false)
  const [detail, setDetail] = useState<Transfert | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const agir = async (action: 'valider' | 'annuler') => {
    if (!detail) return
    const ok = await confirmer(action === 'valider'
      ? { titre: 'Valider le transfert', message: `Le stock de ${detail.depot_source_nom} sera déplacé vers ${detail.depot_destination_nom}. Continuer ?`, libelle: 'Valider' }
      : { titre: 'Annuler le transfert', message: detail.statut === 'VALIDE' ? 'Le stock sera remis dans le dépôt source (mouvements inverses tracés). Continuer ?' : 'Ce brouillon sera annulé. Continuer ?', libelle: 'Annuler le transfert', danger: true })
    if (!ok) return
    try {
      await api.post(`/transferts/${detail.id}/${action}/`)
      notifier.succes(action === 'valider' ? 'Transfert validé : le stock a été déplacé.' : 'Transfert annulé.')
      setDetail(null); liste.recharger()
    } catch (e) { setErreur(extraireErreur(e)) }
  }

  return (
    <div>
      <EnTetePage titre="Transferts entre dépôts" description="Déplacez du stock d'un dépôt à l'autre en conservant les lots et les dates de péremption."
        actions={<button className="btn-primaire" onClick={() => setModale(true)}>Nouveau transfert</button>} />
      <div className="mb-3 flex gap-2">
        <select className="champ w-auto" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="État"><option value="">Tous les états</option><option value="BROUILLON">Brouillons</option><option value="VALIDE">Validés</option><option value="ANNULE">Annulés</option></select>
      </div>
      <TableauDonnees<Transfert>
        colonnes={[
          { cle: 'reference', titre: 'Référence', tri: 'reference', rendu: (t) => <span className="font-medium">{t.reference}</span> },
          { cle: 'date_transfert', titre: 'Date', tri: 'date_transfert', rendu: (t) => formaterDateHeure(t.date_transfert), exportRendu: (t) => formaterDateHeureExport(t.date_transfert) },
          { cle: 'trajet', titre: 'Trajet', rendu: (t) => `${t.depot_source_nom} → ${t.depot_destination_nom}`, exportRendu: (t) => `${t.depot_source_nom} -> ${t.depot_destination_nom}` },
          { cle: 'lignes', titre: 'Lots', alignement: 'droite', rendu: (t) => t.lignes.length, exportRendu: (t) => t.lignes.length },
          { cle: 'utilisateur_nom', titre: 'Utilisateur' },
          { cle: 'statut', titre: 'État', rendu: (t) => <Badge ton={tonStatut(t.statut)}>{libelleStatut(t.statut)}</Badge> },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(t) => t.id}
        onClicLigne={(t) => { setDetail(t); setErreur(null) }} messageVide="Aucun transfert." titre="Transferts" />
      <FormulaireTransfert ouvert={modale} onFermer={() => setModale(false)} apres={liste.recharger} />
      <Modale ouverte={!!detail} titre={detail ? `Transfert ${detail.reference}` : ''} onFermer={() => setDetail(null)} largeur="grande"
        pied={<>
          <button className="btn-secondaire" onClick={() => setDetail(null)}>Fermer</button>
          {detail && detail.statut !== 'ANNULE' && <button className="btn-secondaire" onClick={() => agir('annuler')}>Annuler le transfert</button>}
          {detail?.statut === 'BROUILLON' && <button className="btn-primaire" onClick={() => agir('valider')}>Valider le transfert</button>}
        </>}>
        {detail && (
          <div className="space-y-3">
            <MessageErreur message={erreur} />
            <p className="text-sm text-slate-600">{detail.depot_source_nom} → {detail.depot_destination_nom} · {formaterDateHeure(detail.date_transfert)} · {detail.utilisateur_nom} · <Badge ton={tonStatut(detail.statut)}>{libelleStatut(detail.statut)}</Badge></p>
            {detail.note && <p className="text-sm">Note : {detail.note}</p>}
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Médicament</th><th className="px-3 py-2">Lot</th><th className="px-3 py-2">Péremption</th><th className="px-3 py-2 text-right">Quantité</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lignes.map((l) => <tr key={l.id}><td className="px-3 py-2">{l.medicament_nom}</td><td className="px-3 py-2">{l.numero_lot}</td><td className="px-3 py-2">{formaterDate(l.date_peremption)}</td><td className="px-3 py-2 text-right">{l.quantite}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modale>
    </div>
  )
}
