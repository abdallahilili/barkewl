import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, tonStatut } from '../../composants/Badge'
import { BarreRecherche } from '../../composants/BarreRecherche'
import { EnTetePage } from '../../composants/EnTetePage'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe, useOptions } from '../../hooks/useListe'
import type { Achat, Fournisseur } from '../../types'
import { formaterDate, formaterDateExport, formaterMontant, libelleStatut } from '../../utilitaires/formatage'

export default function Achats() {
  const navigate = useNavigate()
  const fournisseurs = useOptions<Fournisseur>('/fournisseurs/')
  const [statut, setStatut] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [impaye, setImpaye] = useState('')
  const liste = useListe<Achat>('/achats/', { filtres: { statut, fournisseur, impaye }, triInitial: '-date_achat' })

  return (
    <div>
      <EnTetePage titre="Achats" description="Factures fournisseurs. La validation crée les lots et fait entrer les quantités en stock."
        actions={<button className="btn-primaire" onClick={() => navigate('/achats/nouveau')}>Nouvel achat</button>} />
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder="Référence, n° de facture, fournisseur…">
        <select className="champ w-auto" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="État"><option value="">Tous les états</option><option value="BROUILLON">Brouillons</option><option value="VALIDE">Validés</option><option value="ANNULE">Annulés</option></select>
        <select className="champ w-auto" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} aria-label="Fournisseur"><option value="">Tous les fournisseurs</option>{fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}</select>
        <select className="champ w-auto" value={impaye} onChange={(e) => setImpaye(e.target.value)} aria-label="Paiement"><option value="">Payés ou non</option><option value="1">Reste à payer</option></select>
      </BarreRecherche>
      <TableauDonnees<Achat>
        colonnes={[
          { cle: 'reference', titre: 'Référence', tri: 'reference', rendu: (a) => <span className="font-medium">{a.reference}</span> },
          { cle: 'date_achat', titre: 'Date', tri: 'date_achat', rendu: (a) => formaterDate(a.date_achat), exportRendu: (a) => formaterDateExport(a.date_achat) },
          { cle: 'fournisseur_nom', titre: 'Fournisseur', tri: 'fournisseur__nom' },
          { cle: 'reference_facture', titre: 'N° de facture' },
          { cle: 'depot_nom', titre: 'Dépôt' },
          { cle: 'total', titre: 'Total', alignement: 'droite', tri: 'total', rendu: (a) => formaterMontant(a.total) },
          { cle: 'reste_a_payer', titre: 'Reste à payer', alignement: 'droite', rendu: (a) => (a.statut === 'VALIDE' && Number(a.reste_a_payer) > 0 ? <span className="font-semibold text-red-700">{formaterMontant(a.reste_a_payer)}</span> : '—') },
          { cle: 'statut', titre: 'État', rendu: (a) => <Badge ton={tonStatut(a.statut)}>{libelleStatut(a.statut)}</Badge> },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(a) => a.id}
        onClicLigne={(a) => navigate(`/achats/${a.id}`)} messageVide="Aucun achat enregistré." titre="Achats" />
    </div>
  )
}
