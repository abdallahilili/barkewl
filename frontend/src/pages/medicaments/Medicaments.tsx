import { Eye } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../composants/Badge'
import { PageCrud } from '../../composants/PageCrud'
import { DetailMedicament } from '../../fonctionnalites/DetailMedicament'
import { useAuth } from '../../hooks/useAuth'
import type { Categorie, Medicament } from '../../types'
import { formaterMontant, formaterNombre, gestionRayonnagesActive } from '../../utilitaires/formatage'

export default function Medicaments() {
  const { utilisateur } = useAuth()
  const admin = utilisateur?.role === 'ADMIN'
  const [detail, setDetail] = useState<Medicament | null>(null)
  const rayonnages = gestionRayonnagesActive()

  return (
    <>
      <PageCrud<Medicament>
        titre="Médicaments" description="Fiche produit : prix, code-barres, seuil d'alerte de stock."
        endpoint="/medicaments/" nomElement="Médicament" libelleNouveau="Nouveau médicament"
        placeholderRecherche="Nom, code ou code-barres…" triInitial="nom"
        peutCreer={admin} peutModifier={admin} largeurModale="grande"
        filtres={[
          { nom: 'actif', libelle: 'Tous les états', options: [{ valeur: 1, libelle: 'Actifs' }, { valeur: 0, libelle: 'Désactivés' }] },
          { nom: 'categorie', libelle: 'Toutes les catégories', source: { endpoint: '/categories/', libelle: (c: Categorie) => c.nom } },
        ]}
        colonnes={[
          { cle: 'code', titre: 'Code', tri: 'code' },
          { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (m) => <span><span className="font-medium">{m.nom}</span> <span className="text-slate-500">{m.dosage} {m.forme}</span></span> },
          { cle: 'categorie_nom', titre: 'Catégorie', rendu: (m) => m.categorie_nom ?? '—' },
          ...(admin ? [{ cle: 'prix_achat', titre: "Prix d'achat", alignement: 'droite' as const, tri: 'prix_achat', rendu: (m: Medicament) => formaterMontant(m.prix_achat) }] : []),
          { cle: 'prix_vente', titre: 'Prix de vente', alignement: 'droite', tri: 'prix_vente', rendu: (m) => formaterMontant(m.prix_vente) },
          { cle: 'stock_total', titre: 'Stock', alignement: 'droite', tri: 'stock_total',
            rendu: (m) => <span className={m.stock_minimum > 0 && m.stock_total <= m.stock_minimum ? 'font-semibold text-red-700' : ''}>{formaterNombre(m.stock_total)}</span> },
          { cle: 'stock_minimum', titre: 'Stock minimum', alignement: 'droite', cacheParDefaut: true },
          { cle: 'code_barre', titre: 'Code-barres', cacheParDefaut: true },
          ...(rayonnages ? [{ cle: 'emplacement', titre: 'Emplacement', cacheParDefaut: true }] : []),
          { cle: 'actif', titre: 'État', rendu: (m) => <Badge ton={m.actif ? 'vert' : 'gris'}>{m.actif ? 'Actif' : 'Désactivé'}</Badge> },
        ]}
        champs={[
          { nom: 'nom', libelle: 'Nom commercial', type: 'texte', requis: true },
          { nom: 'nom_generique', libelle: 'Nom générique (DCI)', type: 'texte' },
          { nom: 'dosage', libelle: 'Dosage', type: 'texte', aide: 'Ex. 500 mg' },
          { nom: 'forme', libelle: 'Forme', type: 'texte', aide: 'Ex. Comprimé, sirop, gélule' },
          { nom: 'unite', libelle: 'Unité de vente', type: 'texte', aide: 'Ex. boîte, flacon' },
          { nom: 'laboratoire', libelle: 'Laboratoire', type: 'texte' },
          { nom: 'categorie', libelle: 'Catégorie', type: 'select', source: { endpoint: '/categories/', libelle: (c: Categorie) => c.nom, vide: '— Sans catégorie —' } },
          { nom: 'code', libelle: 'Code interne', type: 'texte', aide: 'Laissez vide pour le générer automatiquement.' },
          { nom: 'code_barre', libelle: 'Code-barres', type: 'texte' },
          ...(rayonnages ? [{ nom: 'emplacement', libelle: 'Emplacement (rayon)', type: 'texte' as const, aide: 'Ex. Rayon A3, Étagère 2' }] : []),
          { nom: 'prix_achat', libelle: "Prix d'achat", type: 'decimal', requis: true, defaut: 0 },
          { nom: 'prix_vente', libelle: 'Prix de vente', type: 'decimal', requis: true, defaut: 0 },
          { nom: 'stock_minimum', libelle: 'Stock minimum (alerte)', type: 'nombre', defaut: 0 },
          { nom: 'actif', libelle: 'État', type: 'case', aide: 'Médicament actif (vendable)', defaut: true },
        ]}
        actionsLigne={(m) => (
          <button className="btn-discret btn-petit" onClick={() => setDetail(m)}><Eye size={14} /> Détails</button>
        )}
      />
      <DetailMedicament medicament={detail} onFermer={() => setDetail(null)} />
    </>
  )
}
