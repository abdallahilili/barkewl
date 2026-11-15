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
    <>
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
      {r.par_mode.length > 0 && (
        <div className="carte mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">Mode de paiement</th>
                <th className="px-3 py-2 text-right">Ventes</th>
                <th className="px-3 py-2 text-right">Remboursements</th>
                <th className="px-3 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.par_mode.map((m) => (
                <tr key={m.mode_paiement}>
                  <td className="px-3 py-2">{m.mode_paiement_nom}</td>
                  <td className="px-3 py-2 text-right">{formaterMontant(m.ventes)}</td>
                  <td className="px-3 py-2 text-right text-red-700">{m.remboursements > 0 ? `−${formaterMontant(m.remboursements)}` : formaterMontant(0)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formaterMontant(m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
