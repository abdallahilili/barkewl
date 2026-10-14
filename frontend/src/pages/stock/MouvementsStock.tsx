import { FormEvent, useState } from 'react'
import { Badge } from '../../composants/Badge'
import { BarreRecherche } from '../../composants/BarreRecherche'
import { Champ } from '../../composants/Champ'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { SelectionLotStock } from '../../composants/SelectionLotStock'
import { SelectionMedicament } from '../../composants/SelectionMedicament'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe, useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Depot, LigneStock, MouvementStock } from '../../types'
import { erreursParChamp, extraireErreur } from '../../utilitaires/erreurs'
import { formaterDate, formaterDateHeure, formaterDateHeureExport } from '../../utilitaires/formatage'

type Mode = 'entree' | 'sortie' | 'tous'

const motifsEntree = [{ v: 'RETOUR_CLIENT', l: 'Retour client' }, { v: 'CORRECTION', l: 'Correction de stock' }, { v: 'AUTRE', l: 'Autre entrée' }]
const motifsSortie = [
  { v: 'PEREMPTION', l: 'Produit périmé' }, { v: 'ENDOMMAGE', l: 'Produit endommagé' }, { v: 'PERTE', l: 'Perte' },
  { v: 'CONSOMMATION_INTERNE', l: 'Consommation interne' }, { v: 'CORRECTION', l: 'Correction de stock' }, { v: 'AUTRE', l: 'Autre sortie' },
]

function FormulaireEntree({ ouvert, onFermer, apres }: { ouvert: boolean; onFermer: () => void; apres: () => void }) {
  const notifier = useNotifier()
  const depots = useOptions<Depot>('/depots/', { actif: 1 })
  const vide = { medicament: null as { id: number; nom: string } | null, numero_lot: '', date_fabrication: '', date_peremption: '', depot: '', quantite: '', prix_achat: '', prix_vente: '', motif: 'RETOUR_CLIENT', note: '' }
  const [f, setF] = useState(vide)
  const [venteManuelle, setVenteManuelle] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [erreurs, setErreurs] = useState<Record<string, string>>({})

  // Suggestion automatique du prix de vente du lot : +25% si prix d'achat < 200, +15% au-delà.
  const prixAchatChange = (valeur: string) => {
    const achat = Number(valeur)
    if (!venteManuelle && valeur !== '' && !Number.isNaN(achat)) {
      const taux = achat < 200 ? 0.25 : 0.15
      const vente = Math.round(achat * (1 + taux) * 100) / 100
      setF((p) => ({ ...p, prix_achat: valeur, prix_vente: String(vente) }))
    } else {
      setF((p) => ({ ...p, prix_achat: valeur }))
    }
  }

  const soumettre = async (e: FormEvent) => {
    e.preventDefault()
    setErreur(null); setErreurs({})
    try {
      await api.post('/stocks/entree/', {
        medicament: f.medicament?.id, numero_lot: f.numero_lot, date_fabrication: f.date_fabrication || null, date_peremption: f.date_peremption,
        depot: Number(f.depot), quantite: Number(f.quantite), prix_achat: f.prix_achat === '' ? null : Number(f.prix_achat),
        prix_vente: f.prix_vente === '' ? null : Number(f.prix_vente), motif: f.motif, note: f.note,
      })
      notifier.succes('Entrée en stock enregistrée.')
      setF(vide); setVenteManuelle(false); onFermer(); apres()
    } catch (err) { setErreur(extraireErreur(err)); setErreurs(erreursParChamp(err)) }
  }

  return (
    <Modale ouverte={ouvert} titre="Nouvelle entrée en stock" onFermer={onFermer} largeur="grande"
      pied={<><button className="btn-secondaire" onClick={onFermer}>Annuler</button><button className="btn-primaire" type="submit" form="formulaire-entree">Enregistrer l'entrée</button></>}>
      <form id="formulaire-entree" onSubmit={soumettre} className="space-y-4">
        <p className="text-sm text-slate-500">Pour une réception fournisseur, utilisez plutôt le module Achats. Ici : retours clients, corrections, autres entrées.</p>
        <MessageErreur message={erreur} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="Médicament" requis className="sm:col-span-2" erreur={erreurs.medicament}><SelectionMedicament valeur={f.medicament} onChoisir={(m) => setF({ ...f, medicament: m ? { id: m.id, nom: `${m.nom} ${m.dosage}` } : null })} /></Champ>
          <Champ libelle="Numéro de lot" requis erreur={erreurs.numero_lot}><input className="champ" value={f.numero_lot} onChange={(e) => setF({ ...f, numero_lot: e.target.value })} required /></Champ>
          <Champ libelle="Dépôt" requis erreur={erreurs.depot}>
            <select className="champ" value={f.depot} onChange={(e) => setF({ ...f, depot: e.target.value })} required><option value="">— Choisir —</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
          </Champ>
          <Champ libelle="Date de fabrication"><input className="champ" type="date" value={f.date_fabrication} onChange={(e) => setF({ ...f, date_fabrication: e.target.value })} /></Champ>
          <Champ libelle="Date de péremption" requis erreur={erreurs.date_peremption}><input className="champ" type="date" value={f.date_peremption} onChange={(e) => setF({ ...f, date_peremption: e.target.value })} required /></Champ>
          <Champ libelle="Quantité" requis erreur={erreurs.quantite}><input className="champ" type="number" min={1} value={f.quantite} onChange={(e) => setF({ ...f, quantite: e.target.value })} required /></Champ>
          <Champ libelle="Motif" requis>
            <select className="champ" value={f.motif} onChange={(e) => setF({ ...f, motif: e.target.value })}>{motifsEntree.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select>
          </Champ>
          <Champ libelle="Prix d'achat" aide="Utilisé si le lot est nouveau."><input className="champ" type="number" min={0} step="0.01" value={f.prix_achat} onChange={(e) => prixAchatChange(e.target.value)} /></Champ>
          <Champ libelle="Prix de vente du lot" aide="Calculé automatiquement (+25% si < 200, +15% sinon) — modifiable.">
            <input className="champ" type="number" min={0} step="0.01" value={f.prix_vente} onChange={(e) => { setVenteManuelle(true); setF({ ...f, prix_vente: e.target.value }) }} />
          </Champ>
          <Champ libelle="Note" className="sm:col-span-2"><input className="champ" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Champ>
        </div>
      </form>
    </Modale>
  )
}

function FormulaireSortie({ ouvert, onFermer, apres }: { ouvert: boolean; onFermer: () => void; apres: () => void }) {
  const notifier = useNotifier()
  const depots = useOptions<Depot>('/depots/', { actif: 1 })
  const [depot, setDepot] = useState('')
  const [ligne, setLigne] = useState<LigneStock | null>(null)
  const [quantite, setQuantite] = useState('')
  const [motif, setMotif] = useState('PEREMPTION')
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const soumettre = async (e: FormEvent) => {
    e.preventDefault()
    if (!ligne) { setErreur('Choisissez le lot concerné.'); return }
    setErreur(null)
    try {
      await api.post('/stocks/sortie/', { lot: ligne.lot, depot: ligne.depot, quantite: Number(quantite), motif, note })
      notifier.succes('Sortie de stock enregistrée.')
      setLigne(null); setQuantite(''); setNote(''); onFermer(); apres()
    } catch (err) { setErreur(extraireErreur(err)) }
  }

  return (
    <Modale ouverte={ouvert} titre="Nouvelle sortie de stock" onFermer={onFermer} largeur="moyenne"
      pied={<><button className="btn-secondaire" onClick={onFermer}>Annuler</button><button className="btn-primaire" type="submit" form="formulaire-sortie">Enregistrer la sortie</button></>}>
      <form id="formulaire-sortie" onSubmit={soumettre} className="space-y-4">
        <p className="text-sm text-slate-500">Les ventes se font depuis la caisse. Ici : produits périmés, endommagés, pertes, consommation interne, corrections.</p>
        <MessageErreur message={erreur} />
        <Champ libelle="Dépôt" requis>
          <select className="champ" value={depot} onChange={(e) => { setDepot(e.target.value); setLigne(null) }} required><option value="">— Choisir —</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
        </Champ>
        <Champ libelle="Médicament et lot" requis>
          {ligne ? (
            <div className="champ flex items-center justify-between"><span>{ligne.medicament} — lot {ligne.numero_lot} ({ligne.quantite} en stock, péremption {formaterDate(ligne.date_peremption)})</span><button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setLigne(null)}>Changer</button></div>
          ) : <SelectionLotStock depot={depot ? Number(depot) : ''} onChoisir={setLigne} />}
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="Quantité" requis><input className="champ" type="number" min={1} max={ligne?.quantite} value={quantite} onChange={(e) => setQuantite(e.target.value)} required /></Champ>
          <Champ libelle="Motif" requis><select className="champ" value={motif} onChange={(e) => setMotif(e.target.value)}>{motifsSortie.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></Champ>
        </div>
        <Champ libelle="Note"><input className="champ" value={note} onChange={(e) => setNote(e.target.value)} /></Champ>
      </form>
    </Modale>
  )
}

export default function MouvementsStock({ mode }: { mode: Mode }) {
  const depots = useOptions<Depot>('/depots/')
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const [depot, setDepot] = useState('')
  const [type, setType] = useState('')
  const [modale, setModale] = useState(false)
  const filtres: Record<string, string> = { date_debut: debut, date_fin: fin, depot, type_mouvement: type }
  if (mode !== 'tous') filtres.sens = mode
  const liste = useListe<MouvementStock>('/mouvements-stock/', { filtres, triInitial: '-date_mouvement' })

  const titres = { entree: 'Entrées en stock', sortie: 'Sorties de stock', tous: 'Historique du stock' }
  const descriptions = {
    entree: 'Toutes les quantités entrées : achats, retours, transferts reçus, corrections.',
    sortie: 'Toutes les quantités sorties : ventes, pertes, péremptions, transferts envoyés.',
    tous: 'Journal complet et non modifiable de chaque mouvement de stock.',
  }

  return (
    <div>
      <EnTetePage titre={titres[mode]} description={descriptions[mode]}
        actions={mode !== 'tous' && <button className="btn-primaire" onClick={() => setModale(true)}>{mode === 'entree' ? 'Nouvelle entrée' : 'Nouvelle sortie'}</button>} />
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder="Médicament, lot, référence, motif…">
        <input type="date" className="champ w-auto" value={debut} onChange={(e) => setDebut(e.target.value)} aria-label="Du" />
        <input type="date" className="champ w-auto" value={fin} onChange={(e) => setFin(e.target.value)} aria-label="Au" />
        <select className="champ w-auto" value={depot} onChange={(e) => setDepot(e.target.value)} aria-label="Dépôt"><option value="">Tous les dépôts</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
        <select className="champ w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type de mouvement">
          <option value="">Tous les types</option>
          {['ENTREE', 'SORTIE', 'VENTE', 'RETOUR', 'TRANSFERT_ENTREE', 'TRANSFERT_SORTIE', 'INVENTAIRE', 'AJUSTEMENT', 'PERTE', 'PEREMPTION', 'ENDOMMAGE', 'CONSOMMATION_INTERNE'].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</option>)}
        </select>
      </BarreRecherche>
      <TableauDonnees<MouvementStock>
        colonnes={[
          { cle: 'date_mouvement', titre: 'Date', tri: 'date_mouvement', rendu: (m) => formaterDateHeure(m.date_mouvement), exportRendu: (m) => formaterDateHeureExport(m.date_mouvement) },
          { cle: 'medicament_nom', titre: 'Médicament', tri: 'medicament__nom', rendu: (m) => <span className="font-medium">{m.medicament_nom}</span> },
          { cle: 'numero_lot', titre: 'Lot' },
          { cle: 'depot_nom', titre: 'Dépôt' },
          { cle: 'type_libelle', titre: 'Type', rendu: (m) => <Badge ton={m.quantite > 0 ? 'vert' : 'orange'}>{m.type_libelle}</Badge> },
          { cle: 'quantite', titre: 'Quantité', alignement: 'droite', tri: 'quantite', rendu: (m) => <span className={`font-semibold ${m.quantite > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{m.quantite > 0 ? '+' : ''}{m.quantite}</span> },
          { cle: 'stock', titre: 'Stock avant → après', alignement: 'droite', rendu: (m) => `${m.stock_avant} → ${m.stock_apres}`, exportRendu: (m) => `${m.stock_avant} -> ${m.stock_apres}` },
          { cle: 'reference', titre: 'Référence' },
          { cle: 'utilisateur_nom', titre: 'Utilisateur', cacheParDefaut: true },
          { cle: 'motif', titre: 'Motif', cacheParDefaut: true },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(m) => m.id} messageVide="Aucun mouvement pour ces critères." titre={titres[mode]} />
      {mode === 'entree' && <FormulaireEntree ouvert={modale} onFermer={() => setModale(false)} apres={liste.recharger} />}
      {mode === 'sortie' && <FormulaireSortie ouvert={modale} onFermer={() => setModale(false)} apres={liste.recharger} />}
    </div>
  )
}
