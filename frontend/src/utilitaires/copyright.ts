import { t } from '../i18n'
import { EDITEUR_PAR_DEFAUT, TELEPHONE_EDITEUR } from '../services/licence'
import { copyrightDocumentsAffiche } from './formatage'

/** Ligne de copyright imprimée en tout petit en bas des documents ; null si le paramètre l'a désactivée. */
export function texteCopyright(): string | null {
  if (!copyrightDocumentsAffiche()) return null
  return t('Développé par : {editeur} · {telephone}', { editeur: t(EDITEUR_PAR_DEFAUT), telephone: TELEPHONE_EDITEUR })
}
