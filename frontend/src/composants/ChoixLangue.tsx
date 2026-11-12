import { Languages } from 'lucide-react'
import { changerLangue, langueCourante, t } from '../i18n'

/** Bascule français / arabe (chaque langue est écrite dans sa propre langue, comme le veut l'usage). */
export function ChoixLangue({ sombre = false }: { sombre?: boolean }) {
  const langue = langueCourante()
  const options = [{ code: 'fr' as const, libelle: 'FR', titre: 'Français' }, { code: 'ar' as const, libelle: 'ع', titre: 'العربية' }]
  return (
    <div role="group" aria-label={t('Langue')}
      className={`inline-flex items-center gap-0.5 rounded-md border p-0.5 ${sombre ? 'border-white/20 bg-white/5' : 'border-slate-200 bg-white'}`}>
      <Languages size={15} className={`mx-1 ${sombre ? 'text-nuit-200' : 'text-slate-400'}`} aria-hidden="true" />
      {options.map((o) => {
        const actif = o.code === langue
        return (
          <button key={o.code} type="button" lang={o.code} title={o.titre} aria-pressed={actif} onClick={() => changerLangue(o.code)}
            className={`min-w-[32px] rounded px-2 py-1 text-sm font-semibold transition-colors ${actif
              ? 'bg-marque-600 text-white'
              : sombre ? 'text-nuit-100 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'}`}>
            {o.libelle}
          </button>
        )
      })}
    </div>
  )
}
