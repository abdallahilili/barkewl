import { Badge } from '../../composants/Badge'
import { PageCrud } from '../../composants/PageCrud'
import type { Fournisseur } from '../../types'
import { formaterMontant } from '../../utilitaires/formatage'

import { t } from '../../i18n'
export default function Fournisseurs() {
  return (
    <PageCrud<Fournisseur>
      titre={t('Fournisseurs')} description={t('Grossistes et laboratoires. Le solde indique ce qui reste à payer sur les achats validés.')}
      endpoint="/fournisseurs/" nomElement={t('Fournisseur')} libelleNouveau={t('Nouveau fournisseur')} placeholderRecherche={t('Nom, téléphone, e-mail…')}
      filtres={[{ nom: 'actif', libelle: t('Tous les états'), options: [{ valeur: 1, libelle: t('Actifs') }, { valeur: 0, libelle: t('Désactivés') }] }]}
      colonnes={[
        { cle: 'nom', titre: t('Nom'), tri: 'nom', rendu: (f) => <span className="font-medium">{f.nom}</span> },
        { cle: 'telephone', titre: t('Téléphone') },
        { cle: 'email', titre: t('E-mail'), cacheParDefaut: true },
        { cle: 'solde', titre: t('Solde dû'), alignement: 'droite', tri: 'solde', rendu: (f) => <span className={Number(f.solde) > 0 ? 'font-semibold text-red-700' : ''}>{formaterMontant(f.solde)}</span> },
        { cle: 'actif', titre: t('État'), rendu: (f) => <Badge ton={f.actif ? 'vert' : 'gris'}>{f.actif ? t('Actif') : t('Désactivé')}</Badge> },
      ]}
      champs={[
        { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
        { nom: 'telephone', libelle: t('Téléphone'), type: 'texte' },
        { nom: 'email', libelle: t('E-mail'), type: 'email' },
        { nom: 'adresse', libelle: t('Adresse'), type: 'texte' },
        { nom: 'identifiant_fiscal', libelle: t('Identifiant fiscal'), type: 'texte' },
        { nom: 'actif', libelle: t('État'), type: 'case', aide: t('Fournisseur actif'), defaut: true },
        { nom: 'notes', libelle: t('Notes'), type: 'zone' },
      ]}
    />
  )
}
