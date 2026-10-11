import { Badge } from '../../composants/Badge'
import { PageCrud } from '../../composants/PageCrud'
import { useAuth } from '../../hooks/useAuth'
import type { Lot } from '../../types'
import { formaterDate, formaterDateExport, formaterMontant } from '../../utilitaires/formatage'

export default function Lots() {
  const { utilisateur } = useAuth()
  const voirPrixAchat = utilisateur?.role !== 'CAISSIER'
  return (
    <PageCrud<Lot>
      titre="Lots" description="Les lots sont créés à la réception d'un achat ou d'une entrée de stock. Ici, vous corrigez leurs dates et prix."
      endpoint="/lots/" nomElement="Lot" placeholderRecherche="Médicament ou numéro de lot…" triInitial="date_peremption"
      peutCreer={false} peutModifier
      filtres={[
        { nom: 'en_stock', libelle: 'Tous les lots', options: [{ valeur: 1, libelle: 'Lots en stock' }] },
        { nom: 'proche_peremption', libelle: 'Toutes les péremptions', options: [{ valeur: 1, libelle: 'Bientôt périmés' }] },
        { nom: 'perime', libelle: 'Périmés ou non', options: [{ valeur: 1, libelle: 'Périmés' }] },
      ]}
      filtresInitiaux={{ en_stock: '1' }}
      colonnes={[
        { cle: 'medicament_nom', titre: 'Médicament', tri: 'medicament__nom', rendu: (l) => <span className="font-medium">{l.medicament_nom}</span> },
        { cle: 'numero_lot', titre: 'Lot', tri: 'numero_lot' },
        { cle: 'date_peremption', titre: 'Péremption', tri: 'date_peremption',
          rendu: (l) => <span>{formaterDate(l.date_peremption)} {l.perime ? <Badge ton="rouge">Périmé</Badge> : l.jours_restants <= 90 ? <Badge ton="orange">{l.jours_restants} j</Badge> : null}</span>,
          exportRendu: (l) => formaterDateExport(l.date_peremption) },
        { cle: 'quantite_actuelle', titre: 'En stock', alignement: 'droite', tri: 'quantite_actuelle' },
        ...(voirPrixAchat ? [{ cle: 'prix_achat', titre: "Prix d'achat", alignement: 'droite' as const, rendu: (l: Lot) => formaterMontant(l.prix_achat) }] : []),
        { cle: 'prix_vente', titre: 'Prix de vente du lot', alignement: 'droite', rendu: (l) => (l.prix_vente == null ? <span className="text-slate-400">Prix du médicament</span> : formaterMontant(l.prix_vente)) },
      ]}
      champs={[
        { nom: 'date_fabrication', libelle: 'Date de fabrication', type: 'date' },
        { nom: 'date_peremption', libelle: 'Date de péremption', type: 'date', requis: true },
        { nom: 'prix_achat', libelle: "Prix d'achat", type: 'decimal', requis: true },
        { nom: 'prix_vente', libelle: 'Prix de vente du lot', type: 'decimal', aide: 'Laissez vide pour utiliser le prix du médicament.' },
      ]}
    />
  )
}
