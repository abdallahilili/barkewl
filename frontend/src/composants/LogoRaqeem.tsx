/**
 * Identité RAQEEM (direction C, « le registre relié ») : une colonne verte relie les lignes du registre.
 * Produit PHARMA : la pastille de fin de registre devient la croix verte de pharmacie.
 */

const VERT = '#0D9B83'
const NUIT = '#102D46'
const NUAGE = '#F3F6F8'

interface PropsSymbole {
  taille?: number
  /** clair = sur fond clair (lignes bleu nuit) ; sombre = sur fond bleu nuit (lignes blanches). */
  fond?: 'clair' | 'sombre'
  produit?: 'pharma' | 'aucun'
  titre?: string
}

export function SymboleRaqeem({ taille = 40, fond = 'clair', produit = 'pharma', titre }: PropsSymbole) {
  const lignes = fond === 'clair' ? NUIT : NUAGE
  return (
    <svg width={taille} height={taille} viewBox="0 0 120 120" role={titre ? 'img' : undefined}
      aria-label={titre} aria-hidden={titre ? undefined : true} className="shrink-0">
      <rect x="18" y="18" width="16" height="84" rx="8" fill={VERT} />
      <rect x="42" y="18" width="60" height="16" rx="8" fill={lignes} />
      <rect x="42" y="52" width="44" height="16" rx="8" fill={lignes} />
      <rect x="42" y="86" width="28" height="16" rx="8" fill={lignes} />
      {produit === 'pharma' ? (
        <>
          <rect x="88" y="80" width="10" height="28" rx="3" fill={VERT} />
          <rect x="79" y="89" width="28" height="10" rx="3" fill={VERT} />
        </>
      ) : <circle cx="94" cy="94" r="8" fill={VERT} />}
    </svg>
  )
}

/** Logo complet : symbole + « رَقِيم فارما » avec RAQEEM PHARMA dessous. */
export function LogoRaqeem({ taille = 44, fond = 'clair', compact = false, grand = false }: { taille?: number; fond?: 'clair' | 'sombre'; compact?: boolean; grand?: boolean }) {
  const sombre = fond === 'sombre'
  return (
    <span className={`inline-flex items-center ${grand ? 'gap-6' : 'gap-3'}`} dir="ltr">
      <SymboleRaqeem taille={taille} fond={fond} titre="RAQEEM PHARMA" />
      <span className="flex flex-col items-center leading-none">
        <span lang="ar" dir="rtl" className={`font-bold ${grand ? 'text-6xl xl:text-7xl' : compact ? 'text-2xl' : 'text-3xl'} ${sombre ? 'text-white' : 'text-nuit-800'}`}
          style={{ fontFamily: "'Cairo', sans-serif", lineHeight: 1.25 }}>
          رَقِيم <span className={sombre ? 'text-marque-300' : 'text-marque-600'}>فارما</span>
        </span>
        <span className={`${grand ? 'mt-2 text-lg tracking-[0.4em] xl:text-xl' : `mt-0.5 tracking-[0.28em] ${compact ? 'text-[10px]' : 'text-[11px]'}`} font-semibold ${sombre ? 'text-nuit-200' : 'text-slate-500'}`}>
          RAQEEM PHARMA
        </span>
      </span>
    </span>
  )
}
