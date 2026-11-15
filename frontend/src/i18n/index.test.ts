/** Fonction de traduction t() : langue, paramètres et repli sur le français. */
import { afterEach, describe, expect, it, vi } from 'vitest'

async function chargerAvecLangue(langue: 'fr' | 'ar' | null) {
  vi.resetModules()
  const stockage = new Map<string, string>()
  if (langue) stockage.set('raqeem_langue', langue)
  vi.stubGlobal('localStorage', {
    getItem: (cle: string) => stockage.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => void stockage.set(cle, valeur),
  })
  return import('./index')
}

afterEach(() => vi.unstubAllGlobals())

describe('t()', () => {
  it('français par défaut : le texte est rendu tel quel', async () => {
    const { t, estArabe } = await chargerAvecLangue(null)
    expect(estArabe()).toBe(false)
    expect(t('Propriétaire')).toBe('Propriétaire')
  })

  it('arabe : renvoie la traduction', async () => {
    const { t, estArabe } = await chargerAvecLangue('ar')
    expect(estArabe()).toBe(true)
    expect(t('Propriétaire')).toBe('المالك')
  })

  it('arabe : un texte sans traduction reste en français (jamais une clé technique)', async () => {
    const { t } = await chargerAvecLangue('ar')
    expect(t('Texte inexistant 123')).toBe('Texte inexistant 123')
  })

  it('remplace les {paramètres}, y compris plusieurs fois', async () => {
    const { t } = await chargerAvecLangue('fr')
    expect(t('{n} sur {n} ({total})', { n: 3, total: 'tout' })).toBe('3 sur 3 (tout)')
    expect(t('Valeur : {v}', { v: null })).toBe('Valeur : ')
  })

  it('ignore une langue enregistrée inconnue', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem: () => 'en', setItem: () => undefined })
    const { langueCourante } = await import('./index')
    expect(langueCourante()).toBe('fr')
  })
})
