import { Badge } from '../../composants/Badge'
import { PageCrud } from '../../composants/PageCrud'
import type { Fournisseur } from '../../types'
import { formaterMontant } from '../../utilitaires/formatage'

export default function Fournisseurs() {
  return (
    <PageCrud<Fournisseur>
      titre="Fournisseurs" description="Grossistes et laboratoires. Le solde indique ce qui reste à payer sur les achats validés."
      endpoint="/fournisseurs/" nomElement="Fournisseur" libelleNouveau="Nouveau fournisseur" placeholderRecherche="Nom, téléphone, e-mail…"
      filtres={[{ nom: 'actif', libelle: 'Tous les états', options: [{ valeur: 1, libelle: 'Actifs' }, { valeur: 0, libelle: 'Désactivés' }] }]}
      colonnes={[
        { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (f) => <span className="font-medium">{f.nom}</span> },
        { cle: 'telephone', titre: 'Téléphone' },
        { cle: 'email', titre: 'E-mail', cacheParDefaut: true },
        { cle: 'solde', titre: 'Solde dû', alignement: 'droite', tri: 'solde', rendu: (f) => <span className={Number(f.solde) > 0 ? 'font-semibold text-red-700' : ''}>{formaterMontant(f.solde)}</span> },
        { cle: 'actif', titre: 'État', rendu: (f) => <Badge ton={f.actif ? 'vert' : 'gris'}>{f.actif ? 'Actif' : 'Désactivé'}</Badge> },
      ]}
      champs={[
        { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true },
        { nom: 'telephone', libelle: 'Téléphone', type: 'texte' },
        { nom: 'email', libelle: 'E-mail', type: 'email' },
        { nom: 'adresse', libelle: 'Adresse', type: 'texte' },
        { nom: 'identifiant_fiscal', libelle: 'Identifiant fiscal', type: 'texte' },
        { nom: 'actif', libelle: 'État', type: 'case', aide: 'Fournisseur actif', defaut: true },
        { nom: 'notes', libelle: 'Notes', type: 'zone' },
      ]}
    />
  )
}
