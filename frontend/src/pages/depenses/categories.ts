import { t } from '../../i18n'
import type { CategorieDepense } from '../../types'

/** Catégories de dépenses (codes du serveur) avec leur libellé dans la langue de l'interface. */
export const categoriesDepense = (): { valeur: CategorieDepense; libelle: string }[] => [
  { valeur: 'LOYER', libelle: t('Loyer') },
  { valeur: 'ELECTRICITE', libelle: t('Électricité') },
  { valeur: 'EAU', libelle: t('Eau') },
  { valeur: 'SALAIRES', libelle: t('Salaires') },
  { valeur: 'INTERNET_TELEPHONE', libelle: t('Internet et téléphone') },
  { valeur: 'TRANSPORT', libelle: t('Transport') },
  { valeur: 'ENTRETIEN', libelle: t('Entretien et réparations') },
  { valeur: 'TAXES', libelle: t('Taxes et impôts') },
  { valeur: 'FOURNITURES', libelle: t('Fournitures') },
  { valeur: 'AUTRE', libelle: t('Autre') },
]

export const libelleCategorieDepense = (code: string) => categoriesDepense().find((c) => c.valeur === code)?.libelle ?? code
