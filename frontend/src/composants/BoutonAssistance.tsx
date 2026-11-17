import { ChevronDown, Mail, Phone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ASSISTANCE_AFFICHAGE, ASSISTANCE_EMAIL, ASSISTANCE_TELEPHONES, lienAssistanceWhatsapp } from '../services/licence'
import { t } from '../i18n'

/** Logo WhatsApp (bulle et combiné), dessiné en SVG pour fonctionner hors ligne. */
export function IconeWhatsapp({ taille = 20 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.4.7 4.7 1.9 6.7L3 29l6.9-2.1c1.9 1 4 1.6 6.1 1.6 7 0 12.7-5.6 12.7-12.6S23 3 16 3zm0 23.1c-1.9 0-3.8-.5-5.4-1.5l-.4-.2-4.1 1.2 1.3-4-.3-.4c-1.1-1.7-1.7-3.6-1.7-5.6C5.4 9.8 10.2 5.1 16 5.1s10.6 4.7 10.6 10.5S21.8 26.1 16 26.1z" />
      <path d="M21.9 18.7c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.6.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.3-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.2 1.4 3.4c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.3 1.6.2 2.2.1.7-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.4z" />
    </svg>
  )
}

/** Une ligne de contact du menu : icône, intitulé, valeur (toujours de gauche à droite : numéros et adresses). */
function LigneContact({ href, icone, titre, valeur, externe = false }: { href: string; icone: React.ReactNode; titre: string; valeur: string; externe?: boolean }) {
  return (
    <a href={href} {...(externe ? { target: '_blank', rel: 'noreferrer' } : {})} role="menuitem"
      className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-start hover:bg-slate-50">
      {icone}
      <span className="min-w-0 leading-tight">
        <span className="block text-xs text-slate-500">{titre}</span>
        <span dir="ltr" className="block truncate text-start text-sm font-semibold text-nuit-800">{valeur}</span>
      </span>
    </a>
  )
}

const pastille = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full'

/** Assistance technique. « carte » (page de connexion) : pastille qui ouvre un menu avec le numéro WhatsApp, les
 * numéros de téléphone et l'e-mail ; « compact » : simple bouton WhatsApp d'en-tête. */
export function BoutonAssistance({ variante = 'carte', pharmacie }: { variante?: 'carte' | 'compact'; pharmacie?: string }) {
  const lien = lienAssistanceWhatsapp(pharmacie)
  const [ouvert, setOuvert] = useState(false)
  const zone = useRef<HTMLDivElement>(null)

  // Le menu se ferme au clic ailleurs ou avec Échap.
  useEffect(() => {
    if (!ouvert) return
    const clic = (e: MouseEvent) => { if (!zone.current?.contains(e.target as Node)) setOuvert(false) }
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', clic)
    document.addEventListener('keydown', touche)
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', touche) }
  }, [ouvert])

  if (variante === 'compact') {
    return (
      <a href={lien} target="_blank" rel="noreferrer" title={`${t('Assistance WhatsApp')} — ${ASSISTANCE_AFFICHAGE}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/10 px-2.5 py-1.5 text-xs font-semibold text-[#128C7E] ring-1 ring-inset ring-[#25D366]/30 hover:bg-[#25D366]/20">
        <IconeWhatsapp taille={16} /> <span className="hidden md:inline">{t('Assistance')}</span>
      </a>
    )
  }
  return (
    <div className="relative" ref={zone}>
      <button type="button" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert} aria-haspopup="menu"
        className="group inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white py-2 pe-3 ps-2 shadow-sm transition hover:shadow-md">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366] text-white">
          <IconeWhatsapp taille={22} />
          <span className="absolute -end-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
        </span>
        <span className="text-start leading-tight">
          <span className="block text-sm font-bold text-nuit-800">{t('Assistance technique')}</span>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('Disponible sur WhatsApp')}
          </span>
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>

      {ouvert && (
        <div role="menu" className="absolute start-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-nuit-800">{t('Besoin d\'aide ?')}</p>
          <div className="space-y-0.5 p-1.5">
            <LigneContact href={lien} externe titre={t('WhatsApp')} valeur={ASSISTANCE_AFFICHAGE}
              icone={<span className={`${pastille} bg-[#25D366] text-white`}><IconeWhatsapp taille={19} /></span>} />
            {ASSISTANCE_TELEPHONES.map((numero) => (
              <LigneContact key={numero.lien} href={`tel:${numero.lien}`} titre={t('Téléphone')} valeur={numero.affichage}
                icone={<span className={`${pastille} bg-marque-50 text-marque-700`}><Phone size={17} /></span>} />
            ))}
            <LigneContact href={`mailto:${ASSISTANCE_EMAIL}`} titre={t('E-mail')} valeur={ASSISTANCE_EMAIL}
              icone={<span className={`${pastille} bg-nuit-50 text-nuit-700`}><Mail size={17} /></span>} />
          </div>
        </div>
      )}
    </div>
  )
}
