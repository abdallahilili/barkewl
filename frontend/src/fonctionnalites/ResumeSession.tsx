import type { SessionCaisse } from '../types'
import { formaterMontant } from '../utilitaires/formatage'

import { t } from '../i18n'
function Carte({ titre, valeur, ton = '' }: { titre: string; valeur: string; ton?: string }) {
  return (
    <div className="carte p-3">
      <p className="text-xs text-slate-500">{titre}</p>
      <p className={`mt-1 text-lg font-semibold ${ton}`}>{valeur}</p>
    </div>
  )
}

export function ResumeSession({ session }: { session: SessionCaisse }) {
  const r = session.resume
  const ferme = session.statut === 'FERMEE'
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Carte titre={t('Fond de caisse')} valeur={formaterMontant(session.montant_initial)} />
      <Carte titre={t('Ventes ({nombre})', { nombre: r.nombre_ventes })} valeur={formaterMontant(r.total_ventes)} />
      <Carte titre={t('Encaissé en espèces')} valeur={formaterMontant(r.total_especes)} />
      <Carte titre={t('Autres paiements')} valeur={formaterMontant(r.total_autres_paiements)} />
      <Carte titre={t('Remboursements (espèces)')} valeur={formaterMontant(r.remboursements_especes)} />
      <Carte titre={t('Entrées manuelles')} valeur={formaterMontant(r.entrees_manuelles)} />
      <Carte titre={t('Sorties manuelles')} valeur={formaterMontant(r.sorties_manuelles)} />
      <Carte titre={t('Espèces attendues')} valeur={formaterMontant(r.montant_attendu)} ton="text-marque-700" />
      {ferme && <Carte titre={t('Espèces comptées')} valeur={formaterMontant(session.montant_reel)} />}
      {ferme && (
        <Carte titre={t('Écart')} valeur={`${(session.ecart ?? 0) > 0 ? '+' : ''}${formaterMontant(session.ecart)}`}
          ton={session.ecart === 0 ? 'text-emerald-700' : 'text-red-700'} />
      )}
    </div>
  )
}
