import { Badge } from '../composants/Badge'
import { PageCrud } from '../composants/PageCrud'
import { useAuth } from '../hooks/useAuth'
import type { Depot } from '../types'

export default function Depots() {
  const { utilisateur } = useAuth()
  const admin = utilisateur?.role === 'ADMIN'
  return (
    <PageCrud<Depot>
      titre="Dépôts" description="Lieux de stockage : pharmacie, magasin, réserve…"
      endpoint="/depots/" nomElement="Dépôt" libelleNouveau="Nouveau dépôt" placeholderRecherche="Rechercher un dépôt…"
      peutCreer={admin} peutModifier={admin}
      filtres={[{ nom: 'actif', libelle: 'Tous les états', options: [{ valeur: 1, libelle: 'Actifs' }, { valeur: 0, libelle: 'Désactivés' }] }]}
      colonnes={[
        { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (d) => <span className="font-medium">{d.nom}</span> },
        { cle: 'description', titre: 'Description' },
        { cle: 'actif', titre: 'État', rendu: (d) => <Badge ton={d.actif ? 'vert' : 'gris'}>{d.actif ? 'Actif' : 'Désactivé'}</Badge> },
      ]}
      champs={[
        { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true },
        { nom: 'description', libelle: 'Description', type: 'texte' },
        { nom: 'actif', libelle: 'État', type: 'case', aide: 'Dépôt actif', defaut: true },
      ]}
    />
  )
}
