import { useEffect, useState } from 'react'
import { Badge, tonEtatStock } from '../../composants/Badge'
import { BarreRecherche } from '../../composants/BarreRecherche'
import { EnTetePage } from '../../composants/EnTetePage'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useAuth } from '../../hooks/useAuth'
import { useListe, useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Categorie, Depot, LigneStock, SyntheseStock } from '../../types'
import { formaterDate, formaterDateExport, formaterMontant, formaterNombre, libelleEtatStock } from '../../utilitaires/formatage'

import { t } from '../../i18n'
const filtresEtat = [
  { valeur: '', libelle: t('Tous les états') },
  { valeur: 'stock_faible', libelle: t('Stock faible') },
  { valeur: 'rupture', libelle: t('Rupture') },
  { valeur: 'proche_peremption', libelle: t('Bientôt périmés') },
  { valeur: 'perime', libelle: t('Périmés') },
]

function Indicateur({ titre, valeur, ton = '', onClic, actif }: { titre: string; valeur: string; ton?: string; onClic?: () => void; actif?: boolean }) {
  return (
    <button type="button" onClick={onClic} disabled={!onClic}
      className={`carte p-3 text-start ${onClic ? 'hover:border-marque-500' : ''} ${actif ? 'border-marque-600 ring-1 ring-marque-600' : ''}`}>
      <p className="text-xs text-slate-500">{titre}</p>
      <p className={`mt-1 text-xl font-semibold ${ton}`}>{valeur}</p>
    </button>
  )
}

export default function EtatStock() {
  const { utilisateur } = useAuth()
  const voirPrixAchat = utilisateur?.role !== 'CAISSIER'
  const depots = useOptions<Depot>('/depots/', { actif: 1 })
  const categories = useOptions<Categorie>('/categories/')
  const [depot, setDepot] = useState('')
  const [categorie, setCategorie] = useState('')
  const [etat, setEtat] = useState('')
  const [synthese, setSynthese] = useState<SyntheseStock | null>(null)
  const filtres: Record<string, string> = { depot, categorie }
  if (etat) filtres[etat] = '1'
  const liste = useListe<LigneStock>('/stocks/', { filtres, triInitial: 'lot__medicament__nom' })

  useEffect(() => {
    api.get<SyntheseStock>('/stocks/synthese/', { params: depot ? { depot } : {} }).then((r) => setSynthese(r.data)).catch(() => setSynthese(null))
  }, [depot])

  return (
    <div>
      <EnTetePage titre={t('État du stock')} description={t('Une ligne par lot et par dépôt. Les lots sont classés du plus proche de la péremption au plus lointain.')} />
      {synthese && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {voirPrixAchat && synthese.valeur_totale != null && <Indicateur titre={t('Valeur du stock (prix d\'achat)')} valeur={formaterMontant(synthese.valeur_totale)} />}
          <Indicateur titre={t('Médicaments en stock')} valeur={formaterNombre(synthese.nombre_medicaments)} />
          <Indicateur titre={t('Stock faible')} valeur={formaterNombre(synthese.nombre_stock_faible)} ton={synthese.nombre_stock_faible ? 'text-amber-700' : ''} onClic={() => setEtat(etat === 'stock_faible' ? '' : 'stock_faible')} actif={etat === 'stock_faible'} />
          <Indicateur titre={t('Ruptures')} valeur={formaterNombre(synthese.nombre_ruptures)} ton={synthese.nombre_ruptures ? 'text-red-700' : ''} onClic={() => setEtat(etat === 'rupture' ? '' : 'rupture')} actif={etat === 'rupture'} />
          <Indicateur titre={t('Bientôt périmés')} valeur={formaterNombre(synthese.nombre_bientot_perimes)} ton={synthese.nombre_bientot_perimes ? 'text-amber-700' : ''} onClic={() => setEtat(etat === 'proche_peremption' ? '' : 'proche_peremption')} actif={etat === 'proche_peremption'} />
          <Indicateur titre={t('Périmés')} valeur={formaterNombre(synthese.nombre_perimes)} ton={synthese.nombre_perimes ? 'text-red-700' : ''} onClic={() => setEtat(etat === 'perime' ? '' : 'perime')} actif={etat === 'perime'} />
        </div>
      )}
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={t('Médicament, code, code-barres ou lot…')}>
        <select className="champ w-auto" value={depot} onChange={(e) => setDepot(e.target.value)} aria-label={t('Dépôt')}><option value="">{t('Tous les dépôts')}</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
        <select className="champ w-auto" value={categorie} onChange={(e) => setCategorie(e.target.value)} aria-label={t('Catégorie')}><option value="">{t('Toutes les catégories')}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
        <select className="champ w-auto" value={etat} onChange={(e) => setEtat(e.target.value)} aria-label={t('État')}>{filtresEtat.map((f) => <option key={f.valeur} value={f.valeur}>{f.libelle}</option>)}</select>
      </BarreRecherche>
      <TableauDonnees<LigneStock>
        colonnes={[
          { cle: 'medicament', titre: 'Médicament', tri: 'lot__medicament__nom', rendu: (s) => <span><span className="font-medium">{s.medicament}</span> <span className="text-slate-500">{s.dosage} {s.forme}</span></span> },
          { cle: 'categorie', titre: 'Catégorie', cacheParDefaut: true, rendu: (s) => s.categorie ?? '—' },
          { cle: 'numero_lot', titre: 'Lot' },
          { cle: 'depot_nom', titre: 'Dépôt', tri: 'depot__nom' },
          { cle: 'quantite', titre: 'Quantité', alignement: 'droite', tri: 'quantite', rendu: (s) => <span className="font-medium">{s.unites_par_boite > 1 ? s.quantite_texte : formaterNombre(s.quantite)}</span>, exportRendu: (s) => s.quantite_texte },
          { cle: 'prix_vente', titre: 'Prix de vente', alignement: 'droite', rendu: (s) => formaterMontant(s.prix_vente) },
          ...(voirPrixAchat ? [{ cle: 'valeur_stock', titre: 'Valeur', alignement: 'droite' as const, cacheParDefaut: true, rendu: (s: LigneStock) => formaterMontant(s.valeur_stock) }] : []),
          { cle: 'date_peremption', titre: 'Péremption', tri: 'lot__date_peremption', rendu: (s) => <span>{formaterDate(s.date_peremption)} <span className="whitespace-nowrap text-xs text-slate-400">({t('{n} j', { n: s.jours_restants })})</span></span>, exportRendu: (s) => formaterDateExport(s.date_peremption) },
          { cle: 'etat', titre: 'État', rendu: (s) => <Badge ton={tonEtatStock(s.etat)}>{libelleEtatStock(s.etat)}</Badge> },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(s) => s.id} messageVide={t('Aucune ligne de stock pour ces critères.')} titre={t('État du stock')} idTableau="etat-stock"
        endpoint="/stocks/" parametresRequete={{ ...filtres, ...(liste.recherche ? { recherche: liste.recherche } : {}), ...(liste.tri ? { tri: liste.tri } : {}) }} />
    </div>
  )
}
