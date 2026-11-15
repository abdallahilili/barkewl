import { PageCrud } from '../../composants/PageCrud'
import { useAuth } from '../../hooks/useAuth'
import type { Categorie } from '../../types'

import { t } from '../../i18n'
export default function Categories() {
  const { utilisateur } = useAuth()
  const admin = utilisateur?.role === 'ADMIN'
  return (
    <PageCrud<Categorie>
      titre={t('Catégories')} description={t('Regroupez les médicaments (antibiotiques, antalgiques…).')}
      endpoint="/categories/" nomElement={t('Catégorie')} libelleNouveau={t('Nouvelle catégorie')} placeholderRecherche={t('Rechercher une catégorie…')}
      peutCreer={admin} peutModifier={admin}
      colonnes={[
        { cle: 'nom', titre: t('Nom'), tri: 'nom', rendu: (c) => <span className="font-medium">{c.nom}</span> },
        { cle: 'description', titre: t('Description') },
      ]}
      champs={[
        { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
        { nom: 'description', libelle: t('Description'), type: 'texte' },
      ]}
    />
  )
}
