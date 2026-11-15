import { Eye } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../composants/Badge'
import { PageCrud } from '../../composants/PageCrud'
import { DetailMedicament } from '../../fonctionnalites/DetailMedicament'
import { useAuth } from '../../hooks/useAuth'
import type { Categorie, Dosage, Forme, Medicament } from '../../types'
import { desactiverEnMasse } from '../../utilitaires/actionsMasse'
import { formaterMontant, formaterNombre, gestionRayonnagesActive } from '../../utilitaires/formatage'

import { t } from '../../i18n'
export default function Medicaments() {
  const { utilisateur } = useAuth()
  const admin = utilisateur?.role === 'ADMIN'
  const [detail, setDetail] = useState<Medicament | null>(null)
  const rayonnages = gestionRayonnagesActive()

  return (
    <>
      <PageCrud<Medicament>
        titre={t('Médicaments')} description={t('Fiche produit : prix, conditionnement (boîte, plaquette, unité), code-barres, seuil d\'alerte.')}
        endpoint="/medicaments/" nomElement={t('Médicament')} libelleNouveau={t('Nouveau médicament')}
        placeholderRecherche={t('Nom, code, code-barres, forme, dosage, laboratoire…')} triInitial="nom"
        peutCreer={admin} peutModifier={admin} largeurModale="grande"
        actionsMasse={admin ? [{ libelle: t('Désactiver'), danger: true, confirmation: t('Désactiver les médicaments sélectionnés ?'), executer: desactiverEnMasse<Medicament>('/medicaments/', 'actif', (m) => m.nom) }] : undefined}
        filtres={[
          { nom: 'actif', libelle: t('Tous les états'), options: [{ valeur: 1, libelle: t('Actifs') }, { valeur: 0, libelle: t('Désactivés') }] },
          { nom: 'categorie', libelle: t('Toutes les catégories'), source: { endpoint: '/categories/', libelle: (c: Categorie) => c.nom } },
        ]}
        colonnes={[
          { cle: 'code', titre: 'Code', tri: 'code' },
          { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (m) => <span><span className="font-medium">{m.nom}</span> <span className="text-slate-500">{m.dosage} {m.forme}</span></span> },
          { cle: 'nom_generique', titre: 'Nom générique (DCI)', tri: 'nom_generique', cacheParDefaut: true },
          { cle: 'forme', titre: 'Forme', tri: 'forme', cacheParDefaut: true },
          { cle: 'dosage', titre: 'Dosage', tri: 'dosage', cacheParDefaut: true },
          { cle: 'laboratoire', titre: 'Laboratoire', tri: 'laboratoire', cacheParDefaut: true },
          { cle: 'categorie_nom', titre: 'Catégorie', rendu: (m) => m.categorie_nom ?? '—' },
          ...(admin ? [{ cle: 'prix_achat', titre: 'Prix d\'achat', alignement: 'droite' as const, tri: 'prix_achat', rendu: (m: Medicament) => formaterMontant(m.prix_achat) }] : []),
          { cle: 'prix_vente', titre: 'Prix de vente', alignement: 'droite', tri: 'prix_vente', rendu: (m) => formaterMontant(m.prix_vente) },
          { cle: 'stock_total', titre: 'Stock', alignement: 'droite', tri: 'stock_total',
            rendu: (m) => <span className={m.stock_minimum > 0 && m.stock_total <= m.stock_minimum * m.unites_par_boite ? 'font-semibold text-red-700' : ''}>{m.unites_par_boite > 1 ? m.stock_texte : formaterNombre(m.stock_total)}</span> },
          { cle: 'conditionnement', titre: 'Conditionnement', cacheParDefaut: true,
            rendu: (m) => (m.unites_par_boite > 1
              ? `${m.unites_par_boite} ${m.nom_unite_detail || t('unités')}${m.unites_par_plaquette ? ` (${m.unites_par_boite / m.unites_par_plaquette} × ${m.unites_par_plaquette})` : ''}`
              : t('Boîte uniquement')) },
          { cle: 'stock_minimum', titre: 'Stock minimum', alignement: 'droite', cacheParDefaut: true },
          { cle: 'code_barre', titre: 'Code-barres', cacheParDefaut: true },
          ...(rayonnages ? [{ cle: 'emplacement', titre: 'Emplacement', cacheParDefaut: true }] : []),
          { cle: 'actif', titre: 'État', rendu: (m) => <Badge ton={m.actif ? 'vert' : 'gris'}>{m.actif ? t('Actif') : t('Désactivé')}</Badge> },
        ]}
        champs={[
          { nom: 'nom', libelle: t('Nom commercial'), type: 'texte', requis: true },
          { nom: 'nom_generique', libelle: t('Nom générique (DCI)'), type: 'texte' },
          { nom: 'dosage', libelle: t('Dosage'), type: 'select', aide: t('Rechercher, ou ajouter au référentiel si absent (ex. 500 mg).'),
            source: { endpoint: '/dosages/', params: { actif: 1 }, libelle: (d: Dosage) => d.nom, valeur: (d: Dosage) => d.nom, vide: t('— Aucun —'), ajoutPossible: true } },
          { nom: 'forme', libelle: t('Forme'), type: 'select', aide: t('Rechercher, ou ajouter au référentiel si absent (ex. comprimé, sirop, gélule).'),
            source: { endpoint: '/formes/', params: { actif: 1 }, libelle: (f: Forme) => f.nom, valeur: (f: Forme) => f.nom, vide: t('— Aucune —'), ajoutPossible: true } },
          { nom: 'unite', libelle: t('Nom du conditionnement'), type: 'texte', aide: t('Ex. boîte, flacon, tube (par défaut : boîte)') },
          { nom: 'laboratoire', libelle: t('Laboratoire'), type: 'texte' },
          { nom: 'categorie', libelle: t('Catégorie'), type: 'select', source: { endpoint: '/categories/', libelle: (c: Categorie) => c.nom, vide: t('— Sans catégorie —'), ajoutPossible: true } },
          { nom: 'code', libelle: t('Code interne'), type: 'texte', aide: t('Laissez vide pour le générer automatiquement.') },
          { nom: 'code_barre', libelle: t('Code-barres'), type: 'texte' },
          ...(rayonnages ? [{ nom: 'emplacement', libelle: t('Emplacement (rayon)'), type: 'texte' as const, aide: t('Ex. Rayon A3, Étagère 2') }] : []),
          { nom: 'prix_achat', libelle: t('Prix d\'achat (boîte)'), type: 'decimal', requis: true, defaut: 0 },
          { nom: 'prix_vente', libelle: t('Prix de vente (boîte)'), type: 'decimal', requis: true, defaut: 0,
            aide: t('Suggéré automatiquement (+25% si achat < 200, +15% sinon) — modifiable.'),
            suggererDepuis: { champ: 'prix_achat', calcul: (achat) => Math.round(achat * (achat < 200 ? 1.25 : 1.15) * 100) / 100 } },
          { nom: 'unites_par_boite', libelle: t('Unités par boîte'), type: 'nombre', requis: true, defaut: 1,
            aide: t('Ex. 30 comprimés. Laissez 1 si le médicament ne se vend qu\'à la boîte. Une modification convertit le stock existant.') },
          { nom: 'nom_unite_detail', libelle: t('Nom de l\'unité'), type: 'texte', aide: t('Ex. comprimé, gélule, sachet, ampoule'),
            masque: (f) => Number(f.unites_par_boite) > 1 },
          { nom: 'unites_par_plaquette', libelle: t('Unités par plaquette'), type: 'nombre', aide: t('Ex. 10. Vide = pas de vente à la plaquette.'),
            masque: (f) => Number(f.unites_par_boite) > 1 },
          { nom: 'prix_vente_plaquette', libelle: t('Prix de la plaquette'), type: 'decimal', aide: t('Vide = calculé à partir du prix de la boîte.'),
            masque: (f) => Number(f.unites_par_boite) > 1 },
          { nom: 'prix_vente_unite', libelle: t('Prix de l\'unité'), type: 'decimal', aide: t('Vide = calculé à partir du prix de la boîte.'),
            masque: (f) => Number(f.unites_par_boite) > 1 },
          { nom: 'stock_minimum', libelle: t('Stock minimum (en boîtes)'), type: 'nombre', defaut: 0 },
          { nom: 'actif', libelle: t('État'), type: 'case', aide: t('Médicament actif (vendable)'), defaut: true },
        ]}
        actionsLigne={(m) => (
          <button className="btn-discret btn-petit" onClick={() => setDetail(m)}><Eye size={14} /> {' '}{t('Détails')}</button>
        )}
      />
      <DetailMedicament medicament={detail} onFermer={() => setDetail(null)} />
    </>
  )
}
