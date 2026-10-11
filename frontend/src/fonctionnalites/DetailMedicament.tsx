import { useEffect, useState } from 'react'
import { Badge } from '../composants/Badge'
import { Chargement } from '../composants/EnTetePage'
import { Modale } from '../composants/Modale'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import type { Lot, Medicament, MouvementStock, ReponsePaginee } from '../types'
import { formaterDate, formaterDateHeure, formaterMontant, formaterNombre, gestionRayonnagesActive } from '../utilitaires/formatage'

interface Modification {
  id: number; date_action: string; utilisateur: string; action: string
  ancienne_valeur: Record<string, unknown> | null; nouvelle_valeur: Record<string, unknown> | null
}

export function DetailMedicament({ medicament, onFermer }: { medicament: Medicament | null; onFermer: () => void }) {
  const { utilisateur } = useAuth()
  const [lots, setLots] = useState<Lot[]>([])
  const [historique, setHistorique] = useState<{ modifications: Modification[]; mouvements: MouvementStock[] } | null>(null)
  const [chargement, setChargement] = useState(false)
  const voirHistorique = utilisateur?.role !== 'CAISSIER'

  useEffect(() => {
    if (!medicament) return
    setChargement(true); setHistorique(null)
    const requetes: Promise<unknown>[] = [
      api.get<ReponsePaginee<Lot>>('/lots/', { params: { medicament: medicament.id, taille_page: 100 } }).then((r) => setLots(r.data.resultats)),
    ]
    if (voirHistorique) requetes.push(api.get(`/medicaments/${medicament.id}/historique/`).then((r) => setHistorique(r.data)))
    Promise.allSettled(requetes).finally(() => setChargement(false))
  }, [medicament, voirHistorique])

  return (
    <Modale ouverte={!!medicament} titre={medicament ? `${medicament.nom} ${medicament.dosage}` : ''} onFermer={onFermer} largeur="tresGrande"
      pied={<button className="btn-secondaire" onClick={onFermer}>Fermer</button>}>
      {medicament && (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-slate-500">Code</dt><dd className="font-medium">{medicament.code}</dd></div>
            <div><dt className="text-slate-500">Code-barres</dt><dd className="font-medium">{medicament.code_barre ?? '—'}</dd></div>
            <div><dt className="text-slate-500">Prix de vente</dt><dd className="font-medium">{formaterMontant(medicament.prix_vente)}</dd></div>
            <div><dt className="text-slate-500">Stock total</dt><dd className="font-medium">{formaterNombre(medicament.stock_total)}</dd></div>
            {gestionRayonnagesActive() && <div><dt className="text-slate-500">Emplacement</dt><dd className="font-medium">{medicament.emplacement || '—'}</dd></div>}
          </dl>
          {chargement && <Chargement />}
          <section>
            <h3 className="mb-2 text-sm font-semibold">Lots</h3>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Lot</th><th className="px-3 py-2">Péremption</th><th className="px-3 py-2 text-right">Quantité</th><th className="px-3 py-2 text-right">Prix de vente</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {lots.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">Aucun lot enregistré.</td></tr>}
                  {lots.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{l.numero_lot}</td>
                      <td className="px-3 py-2">{formaterDate(l.date_peremption)} {l.perime ? <Badge ton="rouge">Périmé</Badge> : l.jours_restants <= 90 ? <Badge ton="orange">{l.jours_restants} j</Badge> : null}</td>
                      <td className="px-3 py-2 text-right">{l.quantite_actuelle}</td>
                      <td className="px-3 py-2 text-right">{formaterMontant(l.prix_vente ?? medicament.prix_vente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {historique && (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold">Derniers mouvements de stock</h3>
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Lot</th><th className="px-3 py-2">Dépôt</th><th className="px-3 py-2 text-right">Quantité</th><th className="px-3 py-2 text-right">Avant → après</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {historique.mouvements.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-500">Aucun mouvement.</td></tr>}
                      {historique.mouvements.map((m) => (
                        <tr key={m.id}>
                          <td className="px-3 py-2">{formaterDateHeure(m.date_mouvement)}</td><td className="px-3 py-2">{m.type_libelle}</td>
                          <td className="px-3 py-2">{m.numero_lot}</td><td className="px-3 py-2">{m.depot_nom}</td>
                          <td className={`px-3 py-2 text-right font-medium ${m.quantite > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{m.quantite > 0 ? '+' : ''}{m.quantite}</td>
                          <td className="px-3 py-2 text-right">{m.stock_avant} → {m.stock_apres}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-sm font-semibold">Modifications de la fiche</h3>
                <ul className="space-y-1 text-sm">
                  {historique.modifications.length === 0 && <li className="text-slate-500">Aucune modification enregistrée.</li>}
                  {historique.modifications.map((m) => (
                    <li key={m.id} className="rounded border border-slate-100 px-3 py-2">
                      <span className="text-slate-500">{formaterDateHeure(m.date_action)} — {m.utilisateur} — {m.action === 'CREATION' ? 'création' : 'modification'}</span>
                      {m.ancienne_valeur && Object.keys(m.ancienne_valeur).map((cle) => (
                        <div key={cle}><span className="font-medium">{cle}</span> : {String(m.ancienne_valeur?.[cle] ?? '—')} → {String(m.nouvelle_valeur?.[cle] ?? '—')}</div>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </Modale>
  )
}
