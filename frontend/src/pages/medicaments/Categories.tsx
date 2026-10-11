import { PageCrud } from '../../composants/PageCrud'
import { useAuth } from '../../hooks/useAuth'
import type { Categorie } from '../../types'

export default function Categories() {
  const { utilisateur } = useAuth()
  const admin = utilisateur?.role === 'ADMIN'
  return (
    <PageCrud<Categorie>
      titre="Catégories" description="Regroupez les médicaments (antibiotiques, antalgiques…)."
      endpoint="/categories/" nomElement="Catégorie" libelleNouveau="Nouvelle catégorie" placeholderRecherche="Rechercher une catégorie…"
      peutCreer={admin} peutModifier={admin}
      colonnes={[
        { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (c) => <span className="font-medium">{c.nom}</span> },
        { cle: 'description', titre: 'Description' },
      ]}
      champs={[
        { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true },
        { nom: 'description', libelle: 'Description', type: 'texte' },
      ]}
    />
  )
}
