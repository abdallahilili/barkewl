import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, tonStatut } from '../../composants/Badge'
import { BarreRecherche } from '../../composants/BarreRecherche'
import { EnTetePage } from '../../composants/EnTetePage'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe, useOptions } from '../../hooks/useListe'
import type { BonCommande, Fournisseur } from '../../types'
import { formaterDate, formaterDateExport, formaterMontant, libelleStatut } from '../../utilitaires/formatage'

import { t } from '../../i18n'
export default function BonsCommande() {
  const navigate = useNavigate()
  const fournisseurs = useOptions<Fournisseur>('/fournisseurs/')
  const [statut, setStatut] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const liste = useListe<BonCommande>('/bons-commande/', { filtres: { statut, fournisseur }, triInitial: '-date_commande' })

  return (
    <div>
      <EnTetePage titre={t('Bons de commande')} description={t('Commandes adressées aux fournisseurs, à imprimer ou à exporter en PDF et Excel. Aucun effet sur le stock : la réception se fait par un achat.')}
        actions={<button className="btn-primaire" onClick={() => navigate('/achats/commandes/nouveau')}>{t('Nouveau bon de commande')}</button>} />
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={t('Référence, fournisseur, note…')}>
        <select className="champ w-auto" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label={t('État')}>
          <option value="">{t('Tous les états')}</option>
          <option value="BROUILLON">{t('Brouillons')}</option>
          <option value="ENVOYE">{t('Envoyés')}</option>
          <option value="RECU">{t('Marchandise reçue')}</option>
          <option value="ANNULE">{t('Annulés')}</option>
        </select>
        <select className="champ w-auto" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} aria-label={t('Fournisseur')}>
          <option value="">{t('Tous les fournisseurs')}</option>{fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
        </select>
      </BarreRecherche>
      <TableauDonnees<BonCommande>
        colonnes={[
          { cle: 'reference', titre: 'Référence', tri: 'reference', rendu: (b) => <span className="font-medium">{b.reference}</span> },
          { cle: 'date_commande', titre: 'Date', tri: 'date_commande', rendu: (b) => formaterDate(b.date_commande), exportRendu: (b) => formaterDateExport(b.date_commande) },
          { cle: 'fournisseur_nom', titre: 'Fournisseur', tri: 'fournisseur__nom' },
          { cle: 'depot_nom', titre: 'Dépôt' },
          { cle: 'date_livraison_prevue', titre: 'Livraison prévue', rendu: (b) => (b.date_livraison_prevue ? formaterDate(b.date_livraison_prevue) : '—'), exportRendu: (b) => formaterDateExport(b.date_livraison_prevue) },
          { cle: 'total', titre: 'Total estimé', alignement: 'droite', tri: 'total', rendu: (b) => formaterMontant(b.total) },
          { cle: 'statut', titre: 'État', tri: 'statut', rendu: (b) => <Badge ton={tonStatut(b.statut)}>{libelleStatut(b.statut)}</Badge>, exportRendu: (b) => libelleStatut(b.statut) },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(b) => b.id}
        onClicLigne={(b) => navigate(`/achats/commandes/${b.id}`)} messageVide={t('Aucun bon de commande enregistré.')} titre={t('Bons de commande')} idTableau="bons-commande"
        endpoint="/bons-commande/" parametresRequete={{ statut, fournisseur, ...(liste.recherche ? { recherche: liste.recherche } : {}), ...(liste.tri ? { tri: liste.tri } : {}) }} />
    </div>
  )
}
