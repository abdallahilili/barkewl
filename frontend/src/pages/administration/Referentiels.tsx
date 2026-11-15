import { Pill, Ruler, Store, Tags, Wallet, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Badge } from '../../composants/Badge'
import { EnTetePage } from '../../composants/EnTetePage'
import { PageCrud } from '../../composants/PageCrud'
import type { Caisse, Categorie, Depot, Dosage, Forme, ModePaiement } from '../../types'
import { desactiverEnMasse } from '../../utilitaires/actionsMasse'

import { t } from '../../i18n'

type Onglet = 'categories' | 'formes' | 'dosages' | 'depots' | 'caisses' | 'paiements'

const filtreEtat = () => [{ nom: 'actif', libelle: t('Tous les états'), options: [{ valeur: 1, libelle: t('Actifs') }, { valeur: 0, libelle: t('Désactivés') }] }]

/** Liste de référence composée d'un nom et d'un état (forme, dosage) : même écran pour les deux. */
function ListeNomEtat<T extends { id: number; nom: string; actif: boolean }>({ endpoint, nomElement, libelleNouveau, placeholder, messageDesactivation }: {
  endpoint: string; nomElement: string; libelleNouveau: string; placeholder: string; messageDesactivation: string
}) {
  return (
    <PageCrud<T> sansEntete titre={nomElement} endpoint={endpoint} nomElement={nomElement} libelleNouveau={libelleNouveau} placeholderRecherche={placeholder}
      triInitial="nom" filtres={filtreEtat()}
      actionsMasse={[{ libelle: t('Désactiver'), danger: true, confirmation: messageDesactivation, executer: desactiverEnMasse<T>(endpoint, 'actif', (x) => x.nom) }]}
      colonnes={[
        { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (x) => <span className="font-medium">{x.nom}</span> },
        { cle: 'actif', titre: 'État', rendu: (x) => <Badge ton={x.actif ? 'vert' : 'gris'}>{x.actif ? t('Actif') : t('Désactivé')}</Badge> },
      ]}
      champs={[
        { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
        { nom: 'actif', libelle: t('État'), type: 'case', aide: t('Proposé dans la fiche médicament'), defaut: true },
      ]} />
  )
}

/** Gestion des listes de référence : catégories, formes, dosages, dépôts, caisses et modes de paiement. */
export default function Referentiels() {
  const etatNavigation = useLocation().state as { onglet?: Onglet } | null
  const [onglet, setOnglet] = useState<Onglet>(etatNavigation?.onglet ?? 'categories')
  const onglets: { cle: Onglet; libelle: string; icone: typeof Tags; description: string }[] = [
    { cle: 'categories', libelle: t('Catégories'), icone: Tags, description: t('Regroupez les médicaments (antibiotiques, antalgiques…).') },
    { cle: 'formes', libelle: t('Formes'), icone: Pill, description: t('Présentations des médicaments : comprimé, sirop, gélule…') },
    { cle: 'dosages', libelle: t('Dosages'), icone: Ruler, description: t('Teneurs proposées dans la fiche médicament : 500 mg, 1 g…') },
    { cle: 'depots', libelle: t('Dépôts'), icone: Store, description: t('Lieux de stockage : pharmacie, magasin, réserve…') },
    { cle: 'caisses', libelle: t('Caisses'), icone: Wallet, description: t('Postes d\'encaissement, chacun rattaché à un dépôt de vente.') },
    { cle: 'paiements', libelle: t('Modes de paiement'), icone: WalletCards, description: t('Façons d\'encaisser : espèces, paiement mobile, carte…') },
  ]
  const courant = onglets.find((o) => o.cle === onglet)!

  return (
    <div>
      <EnTetePage titre={t('Référentiels')} description={t('Listes de référence utilisées dans toute l\'application : catégories, formes, dosages, dépôts, caisses et modes de paiement.')} />
      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-slate-200">
        {onglets.map((o) => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm ${onglet === o.cle ? 'border-marque-600 font-medium text-marque-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            <o.icone size={16} /> {o.libelle}
          </button>
        ))}
      </div>
      <p className="mb-4 text-sm text-slate-500">{courant.description}</p>

      {onglet === 'categories' && (
        <PageCrud<Categorie> key="categories" sansEntete titre={t('Catégories')} endpoint="/categories/" nomElement={t('Catégorie')} libelleNouveau={t('Nouvelle catégorie')}
          placeholderRecherche={t('Rechercher une catégorie…')} triInitial="nom"
          colonnes={[
            { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (c) => <span className="font-medium">{c.nom}</span> },
            { cle: 'description', titre: 'Description' },
          ]}
          champs={[
            { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
            { nom: 'description', libelle: t('Description'), type: 'texte' },
          ]} />
      )}

      {onglet === 'formes' && (
        <ListeNomEtat<Forme> key="formes" endpoint="/formes/" nomElement={t('Forme')} libelleNouveau={t('Nouvelle forme')}
          placeholder={t('Rechercher une forme…')} messageDesactivation={t('Désactiver les formes sélectionnées ?')} />
      )}

      {onglet === 'dosages' && (
        <ListeNomEtat<Dosage> key="dosages" endpoint="/dosages/" nomElement={t('Dosage')} libelleNouveau={t('Nouveau dosage')}
          placeholder={t('Rechercher un dosage…')} messageDesactivation={t('Désactiver les dosages sélectionnés ?')} />
      )}

      {onglet === 'depots' && (
        <PageCrud<Depot> key="depots" sansEntete titre={t('Dépôts')} endpoint="/depots/" nomElement={t('Dépôt')} libelleNouveau={t('Nouveau dépôt')}
          placeholderRecherche={t('Rechercher un dépôt…')} filtres={filtreEtat()}
          actionsMasse={[{ libelle: t('Désactiver'), danger: true, confirmation: t('Désactiver les dépôts sélectionnés ?'), executer: desactiverEnMasse<Depot>('/depots/', 'actif', (d) => d.nom) }]}
          colonnes={[
            { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (d) => <span className="font-medium">{d.nom}</span> },
            { cle: 'description', titre: 'Description' },
            { cle: 'actif', titre: 'État', rendu: (d) => <Badge ton={d.actif ? 'vert' : 'gris'}>{d.actif ? t('Actif') : t('Désactivé')}</Badge> },
          ]}
          champs={[
            { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
            { nom: 'description', libelle: t('Description'), type: 'texte' },
            { nom: 'actif', libelle: t('État'), type: 'case', aide: t('Dépôt actif'), defaut: true },
          ]} />
      )}

      {onglet === 'caisses' && (
        <PageCrud<Caisse> key="caisses" sansEntete titre={t('Caisses')} endpoint="/caisses/" nomElement={t('Caisse')} libelleNouveau={t('Nouvelle caisse')}
          placeholderRecherche={t('Rechercher une caisse…')}
          actionsMasse={[{ libelle: t('Désactiver'), danger: true, confirmation: t('Désactiver les caisses sélectionnées ?'), executer: desactiverEnMasse<Caisse>('/caisses/', 'active', (c) => c.nom) }]}
          colonnes={[
            { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (c) => <span className="font-medium">{c.nom}</span> },
            { cle: 'depot_nom', titre: 'Dépôt de vente' },
            { cle: 'active', titre: 'État', rendu: (c) => <Badge ton={c.active ? 'vert' : 'gris'}>{c.active ? t('Active') : t('Désactivée')}</Badge> },
          ]}
          champs={[
            { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
            { nom: 'depot', libelle: t('Dépôt de vente'), type: 'select', requis: true, source: { endpoint: '/depots/', libelle: (d: Depot) => d.nom } },
            { nom: 'active', libelle: t('État'), type: 'case', aide: t('Caisse active'), defaut: true },
          ]} />
      )}

      {onglet === 'paiements' && (
        <PageCrud<ModePaiement> key="paiements" sansEntete titre={t('Modes de paiement')} endpoint="/modes-paiement/" nomElement={t('Mode de paiement')} libelleNouveau={t('Nouveau mode de paiement')}
          placeholderRecherche={t('Rechercher…')}
          actionsMasse={[{ libelle: t('Désactiver'), danger: true, confirmation: t('Désactiver les modes de paiement sélectionnés ?'), executer: desactiverEnMasse<ModePaiement>('/modes-paiement/', 'actif', (m) => m.nom) }]}
          colonnes={[
            { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (m) => <span className="font-medium">{m.nom}</span> },
            { cle: 'type', titre: 'Type', rendu: (m) => ({ ESPECES: t('Espèces'), MOBILE: t('Paiement mobile'), CARTE: t('Carte'), VIREMENT: t('Virement'), AUTRE: t('Autre') }[m.type]) },
            { cle: 'actif', titre: 'État', rendu: (m) => <Badge ton={m.actif ? 'vert' : 'gris'}>{m.actif ? t('Actif') : t('Désactivé')}</Badge> },
          ]}
          champs={[
            { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
            { nom: 'type', libelle: t('Type'), type: 'select', requis: true, defaut: 'ESPECES',
              options: [{ valeur: 'ESPECES', libelle: t('Espèces') }, { valeur: 'MOBILE', libelle: t('Paiement mobile') }, { valeur: 'CARTE', libelle: t('Carte bancaire') }, { valeur: 'VIREMENT', libelle: t('Virement') }, { valeur: 'AUTRE', libelle: t('Autre') }] },
            { nom: 'actif', libelle: t('État'), type: 'case', aide: t('Mode de paiement actif'), defaut: true },
          ]} />
      )}
    </div>
  )
}
