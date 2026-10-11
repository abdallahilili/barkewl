import type { SessionCaisse } from '../types'
import { formaterMontant } from '../utilitaires/formatage'

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
      <Carte titre="Fond de caisse" valeur={formaterMontant(session.montant_initial)} />
      <Carte titre={`Ventes (${r.nombre_ventes})`} valeur={formaterMontant(r.total_ventes)} />
      <Carte titre="Encaissé en espèces" valeur={formaterMontant(r.total_especes)} />
      <Carte titre="Autres paiements" valeur={formaterMontant(r.total_autres_paiements)} />
      <Carte titre="Remboursements (espèces)" valeur={formaterMontant(r.remboursements_especes)} />
      <Carte titre="Entrées manuelles" valeur={formaterMontant(r.entrees_manuelles)} />
      <Carte titre="Sorties manuelles" valeur={formaterMontant(r.sorties_manuelles)} />
      <Carte titre="Espèces attendues" valeur={formaterMontant(r.montant_attendu)} ton="text-marque-700" />
      {ferme && <Carte titre="Espèces comptées" valeur={formaterMontant(session.montant_reel)} />}
      {ferme && (
        <Carte titre="Écart" valeur={`${(session.ecart ?? 0) > 0 ? '+' : ''}${formaterMontant(session.ecart)}`}
          ton={session.ecart === 0 ? 'text-emerald-700' : 'text-red-700'} />
      )}
    </div>
  )
}
