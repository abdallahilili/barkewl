import { DatabaseBackup, ScrollText } from 'lucide-react'
import { useState } from 'react'
import { EnTetePage } from '../../composants/EnTetePage'
import { JournalAudit } from '../../fonctionnalites/JournalAudit'
import { Sauvegardes } from '../../fonctionnalites/Sauvegardes'

import { t } from '../../i18n'
type Onglet = 'sauvegardes' | 'audit'

/** Données de la pharmacie : sauvegardes de la base et journal d'audit (qui a fait quoi). Séparée des Paramètres. */
export default function Donnees() {
  const [onglet, setOnglet] = useState<Onglet>('sauvegardes')
  const onglets = [
    { cle: 'sauvegardes' as const, libelle: t('Sauvegardes'), icone: DatabaseBackup },
    { cle: 'audit' as const, libelle: t('Journal d\'audit'), icone: ScrollText },
  ]
  return (
    <div>
      <EnTetePage titre={t('Données')} description={t('Sauvegardes de la base et journal d\'audit (qui a fait quoi, et quand).')} />
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {onglets.map((o) => (
          <button key={o.cle} type="button" role="tab" aria-selected={onglet === o.cle} onClick={() => setOnglet(o.cle)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm ${onglet === o.cle ? 'border-marque-600 font-medium text-marque-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            <o.icone size={16} /> {o.libelle}
          </button>
        ))}
      </div>
      {onglet === 'sauvegardes' && <Sauvegardes />}
      {onglet === 'audit' && <JournalAudit />}
    </div>
  )
}
