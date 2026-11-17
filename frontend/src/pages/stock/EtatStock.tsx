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
// Onglets d'état : le compteur vient de la synthèse du serveur ; la clé est le filtre envoyé à l'API.
type CleEtat = '' | 'stock_faible' | 'rupture' | 'proche_peremption' | 'perime'

function Indicateur({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="carte p-3">
      <p className="text-xs text-slate-500">{titre}</p>
      <p className="mt-1 text-xl font-semibold">{valeur}</p>
    </div>
  )
}

export default function EtatStock() {
  const { utilisateur } = useAuth()
  const voirPrixAchat = utilisateur?.role !== 'CAISSIER'
  const depots = useOptions<Depot>('/depots/', { actif: 1 })
  const categories = useOptions<Categorie>('/categories/')
  const [depot, setDepot] = useState('')
  const [categorie, setCategorie] = useState('')
  const [etat, setEtat] = useState<CleEtat>('')
  const [synthese, setSynthese] = useState<SyntheseStock | null>(null)
  const onglets: { cle: CleEtat; libelle: string; ton: string; compteur?: (x: SyntheseStock | null) => number | undefined }[] = [
    { cle: '', libelle: t('Tous'), ton: '' },
    { cle: 'stock_faible', libelle: t('Stock faible'), ton: 'bg-amber-100 text-amber-800', compteur: (x) => x?.nombre_stock_faible },
    { cle: 'rupture', libelle: t('Ruptures'), ton: 'bg-red-100 text-red-800', compteur: (x) => x?.nombre_ruptures },
    { cle: 'proche_peremption', libelle: t('Bientôt périmés'), ton: 'bg-amber-100 text-amber-800', compteur: (x) => x?.nombre_bientot_perimes },
    { cle: 'perime', libelle: t('Périmés'), ton: 'bg-red-100 text-red-800', compteur: (x) => x?.nombre_perimes },
  ]
  const filtres: Record<string, string> = { depot, categorie }
  if (etat) filtres[etat] = '1'
  const liste = useListe<LigneStock>('/stocks/', { filtres, triInitial: 'lot__medicament__nom' })

  useEffect(() => {
    api.get<SyntheseStock>('/stocks/synthese/', { params: depot ? { depot } : {} }).then((r) => setSynthese(r.data)).catch(() => setSynthese(null))
  }, [depot])

  return (
    <div>
      <EnTetePage titre={t('État du stock')} description={t('Une ligne par lot et par dépôt. Les lots sont classés du plus proche de la péremption au plus lointain.')} />
      {synthese && (voirPrixAchat && synthese.valeur_totale != null) && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:max-w-lg">
          <Indicateur titre={t('Valeur du stock (prix d\'achat)')} valeur={formaterMontant(synthese.valeur_totale)} />
          <Indicateur titre={t('Médicaments en stock')} valeur={formaterNombre(synthese.nombre_medicaments)} />
        </div>
      )}
      <div role="tablist" aria-label={t('État du stock')} className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 sans-impression">
        {onglets.map((o) => {
          const actif = etat === o.cle
          const n = o.compteur?.(synthese)
          return (
            <button key={o.cle || 'tous'} type="button" role="tab" aria-selected={actif} onClick={() => setEtat(o.cle)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${actif ? 'border-marque-600 font-semibold text-marque-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
              {o.libelle}
              {n != null && <span className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${n > 0 ? o.ton : 'bg-slate-100 text-slate-500'}`}>{formaterNombre(n)}</span>}
            </button>
          )
        })}
      </div>
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={t('Médicament, code, code-barres ou lot…')}>
        <select className="champ w-auto" value={depot} onChange={(e) => setDepot(e.target.value)} aria-label={t('Dépôt')}><option value="">{t('Tous les dépôts')}</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
        <select className="champ w-auto" value={categorie} onChange={(e) => setCategorie(e.target.value)} aria-label={t('Catégorie')}><option value="">{t('Toutes les catégories')}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
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
