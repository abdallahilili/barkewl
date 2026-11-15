import { Badge } from '../composants/Badge'
import { PageCrud } from '../composants/PageCrud'
import { useAuth } from '../hooks/useAuth'
import type { Depot } from '../types'
import { desactiverEnMasse } from '../utilitaires/actionsMasse'

import { t } from '../i18n'
export default function Depots() {
  const { utilisateur } = useAuth()
  const admin = utilisateur?.role === 'ADMIN'
  return (
    <PageCrud<Depot>
      titre={t('Dépôts')} description={t('Lieux de stockage : pharmacie, magasin, réserve…')}
      endpoint="/depots/" nomElement={t('Dépôt')} libelleNouveau={t('Nouveau dépôt')} placeholderRecherche={t('Rechercher un dépôt…')}
      peutCreer={admin} peutModifier={admin}
      filtres={[{ nom: 'actif', libelle: t('Tous les états'), options: [{ valeur: 1, libelle: t('Actifs') }, { valeur: 0, libelle: t('Désactivés') }] }]}
      actionsMasse={admin ? [{ libelle: t('Désactiver'), danger: true, confirmation: t('Désactiver les dépôts sélectionnés ?'), executer: desactiverEnMasse<Depot>('/depots/', 'actif', (d) => d.nom) }] : undefined}
      colonnes={[
        { cle: 'nom', titre: t('Nom'), tri: 'nom', rendu: (d) => <span className="font-medium">{d.nom}</span> },
        { cle: 'description', titre: t('Description') },
        { cle: 'actif', titre: t('État'), rendu: (d) => <Badge ton={d.actif ? 'vert' : 'gris'}>{d.actif ? t('Actif') : t('Désactivé')}</Badge> },
      ]}
      champs={[
        { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
        { nom: 'description', libelle: t('Description'), type: 'texte' },
        { nom: 'actif', libelle: t('État'), type: 'case', aide: t('Dépôt actif'), defaut: true },
      ]}
    />
  )
}
