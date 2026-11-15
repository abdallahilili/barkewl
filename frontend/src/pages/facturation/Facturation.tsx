import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, tonStatut } from '../../composants/Badge'
import { BarreRecherche } from '../../composants/BarreRecherche'
import { EnTetePage } from '../../composants/EnTetePage'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe } from '../../hooks/useListe'
import type { DocumentVente } from '../../types'
import { annulerEnMasse } from '../../utilitaires/actionsMasse'
import { formaterDate, formaterDateExport, formaterMontant } from '../../utilitaires/formatage'

import { t } from '../../i18n'
export default function Facturation() {
  const navigate = useNavigate()
  const [etape, setEtape] = useState('')
  const liste = useListe<DocumentVente>('/documents-vente/', { filtres: { etape }, triInitial: '-date_devis' })

  return (
    <div>
      <EnTetePage titre={t('Facturation')} description={t('Devis, bons de livraison et factures pour les clients à compte.')}
        actions={<button className="btn-primaire" onClick={() => navigate('/facturation/nouveau')}>{t('Nouveau devis')}</button>} />
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={t('Référence, n° BL/facture, client…')}>
        <select className="champ w-auto" value={etape} onChange={(e) => setEtape(e.target.value)} aria-label={t('Étape')}>
          <option value="">{t('Toutes les étapes')}</option>
          <option value="DEVIS">{t('Devis')}</option>
          <option value="BON_LIVRAISON">{t('Bons de livraison')}</option>
          <option value="FACTURE">{t('Factures')}</option>
        </select>
      </BarreRecherche>
      <TableauDonnees<DocumentVente>
        colonnes={[
          { cle: 'reference', titre: t('Référence'), tri: 'reference', rendu: (d) => <span className="font-medium">{d.reference}</span> },
          { cle: 'client_nom', titre: t('Client'), tri: 'client__nom' },
          { cle: 'date_devis', titre: t('Date'), tri: 'date_devis', rendu: (d) => formaterDate(d.date_devis), exportRendu: (d) => formaterDateExport(d.date_devis) },
          { cle: 'total', titre: t('Total'), alignement: 'droite', tri: 'total', rendu: (d) => formaterMontant(d.total) },
          { cle: 'reste_a_payer', titre: t('Reste à payer'), alignement: 'droite', rendu: (d) => (d.etape === 'FACTURE' && Number(d.reste_a_payer) > 0 ? <span className="font-semibold text-red-700">{formaterMontant(d.reste_a_payer)}</span> : '—') },
          { cle: 'etape', titre: t('Étape'), rendu: (d) => <Badge ton={tonStatut(d.annule ? 'ANNULE' : d.etape)}>{d.annule ? t('Devis annulé') : d.etape_libelle}</Badge> },
          { cle: 'paiement', titre: t('Paiement'), rendu: (d) => (d.etape === 'FACTURE' ? <Badge ton={Number(d.reste_a_payer) <= 0 ? 'vert' : 'rouge'}>{Number(d.reste_a_payer) <= 0 ? t('Payée') : t('Non payée')}</Badge> : '—') },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(d) => d.id}
        onClicLigne={(d) => navigate(`/facturation/${d.id}`)} messageVide={t('Aucun document de vente enregistré.')} titre={t('Facturation')} idTableau="facturation"
        endpoint="/documents-vente/" parametresRequete={{ etape, ...(liste.recherche ? { recherche: liste.recherche } : {}), ...(liste.tri ? { tri: liste.tri } : {}) }}
        actionsMasse={[{
          libelle: t('Annuler'), danger: true, confirmation: t('Annuler les devis sélectionnés ? Refusé pour ceux déjà transformés en bon de livraison.'),
          executer: async (lignes) => { const r = await annulerEnMasse<DocumentVente>('/documents-vente/', (d) => d.reference)(lignes); liste.recharger(); return r },
        }]} />
    </div>
  )
}
