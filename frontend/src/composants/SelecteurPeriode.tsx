import { useState } from 'react'
import { aujourdhui, premierJourAnnee, premierJourMois } from '../utilitaires/formatage'

export type ClePeriode = 'jour' | 'mois' | 'annee' | 'personnalise'

export interface Periode { cle: ClePeriode; debut: string; fin: string }

const PRESETS: { cle: Exclude<ClePeriode, 'personnalise'>; libelle: string; debut: () => string }[] = [
  { cle: 'jour', libelle: "Aujourd'hui", debut: aujourdhui },
  { cle: 'mois', libelle: 'Ce mois-ci', debut: premierJourMois },
  { cle: 'annee', libelle: 'Cette année', debut: premierJourAnnee },
]

export function usePeriode() {
  return useState<Periode>({ cle: 'jour', debut: aujourdhui(), fin: aujourdhui() })
}

export function SelecteurPeriode({ periode, onChange }: { periode: Periode; onChange: (p: Periode) => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 sans-impression">
      <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
        {PRESETS.map((p) => (
          <button key={p.cle} type="button"
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${periode.cle === p.cle ? 'bg-marque-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            onClick={() => onChange({ cle: p.cle, debut: p.debut(), fin: aujourdhui() })}>
            {p.libelle}
          </button>
        ))}
        <button type="button"
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${periode.cle === 'personnalise' ? 'bg-marque-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          onClick={() => onChange({ cle: 'personnalise', debut: periode.debut, fin: periode.fin })}>
          Personnalisé
        </button>
      </div>
      {periode.cle === 'personnalise' && (
        <>
          <div><label className="etiquette">Du</label><input type="date" className="champ" value={periode.debut} max={periode.fin}
            onChange={(e) => onChange({ ...periode, debut: e.target.value })} /></div>
          <div><label className="etiquette">Au</label><input type="date" className="champ" value={periode.fin} min={periode.debut} max={aujourdhui()}
            onChange={(e) => onChange({ ...periode, fin: e.target.value })} /></div>
        </>
      )}
    </div>
  )
}

export const libellePeriode = (periode: Periode): string => {
  const preset = PRESETS.find((p) => p.cle === periode.cle)
  if (preset) return preset.libelle
  return periode.debut === periode.fin ? periode.debut : `Du ${periode.debut} au ${periode.fin}`
}
