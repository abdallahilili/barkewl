import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  ColonneExportable, exporterCsv, exporterExcel, exporterPdf, exporterWord, genererNomFichier, recupererTout, valeurExport,
} from '../utilitaires/exports'
import { extraireErreur } from '../utilitaires/erreurs'
import { Champ } from './Champ'
import { MessageErreur } from './EnTetePage'
import { Modale } from './Modale'

type Format = 'csv' | 'excel' | 'pdf' | 'word'
type Portee = 'page' | 'filtre' | 'tout' | 'selection'

const FORMATS: { cle: Format; libelle: string }[] = [
  { cle: 'csv', libelle: 'CSV' }, { cle: 'excel', libelle: 'Excel (.xlsx)' },
  { cle: 'pdf', libelle: 'PDF' }, { cle: 'word', libelle: 'Word (.docx)' },
]

export function ModaleExport<T>({
  ouverte, onFermer, titre, colonnes, colonnesVisibles, lignesPage, lignesSelection, endpoint, parametresRequete,
}: {
  ouverte: boolean
  onFermer: () => void
  titre: string
  colonnes: ColonneExportable<T>[]
  colonnesVisibles: string[]
  lignesPage: T[]
  lignesSelection: T[]
  endpoint?: string
  parametresRequete?: Record<string, unknown>
}) {
  const { utilisateur } = useAuth()
  const [format, setFormat] = useState<Format>('excel')
  const [portee, setPortee] = useState<Portee>('page')
  const [colonnesChoisies, setColonnesChoisies] = useState<string[]>(colonnesVisibles)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const bascculerColonne = (cle: string) => setColonnesChoisies((x) => (x.includes(cle) ? x.filter((c) => c !== cle) : [...x, cle]))

  const exporter = async () => {
    if (colonnesChoisies.length === 0) { setErreur('Choisissez au moins une colonne.'); return }
    setOccupe(true); setErreur(null)
    try {
      let source: T[]
      if (portee === 'page') source = lignesPage
      else if (portee === 'selection') source = lignesSelection
      else if (portee === 'filtre') source = await recupererTout<T>(endpoint!, parametresRequete ?? {})
      else source = await recupererTout<T>(endpoint!, {})

      const colonnesFinales = colonnes.filter((c) => colonnesChoisies.includes(c.cle))
      const entetes = colonnesFinales.map((c) => c.titre)
      const lignes = source.map((l) => colonnesFinales.map((c) => valeurExport(c, l)))
      const nomFichier = genererNomFichier(titre)

      if (format === 'csv') exporterCsv(`${nomFichier}.csv`, entetes, lignes)
      else if (format === 'pdf') exporterPdf({ titre, nomFichier, entetes, lignes, imprimePar: utilisateur?.nom_complet ?? '—' })
      else if (format === 'excel') await exporterExcel({ titre, nomFichier, entetes, lignes })
      else await exporterWord({ titre, nomFichier, entetes, lignes })
      onFermer()
    } catch (e) { setErreur(extraireErreur(e)) }
    finally { setOccupe(false) }
  }

  const porteeDesactivee = (p: Portee) => (p === 'selection' && lignesSelection.length === 0) || ((p === 'filtre' || p === 'tout') && !endpoint)

  return (
    <Modale ouverte={ouverte} onFermer={onFermer} titre="Exporter" largeur="petite"
      pied={<>
        <button type="button" className="btn-secondaire" onClick={onFermer}>Annuler</button>
        <button type="button" className="btn-primaire" disabled={occupe} onClick={exporter}>{occupe ? 'Export…' : 'Exporter'}</button>
      </>}>
      <div className="space-y-4">
        <MessageErreur message={erreur} />
        <Champ libelle="Format">
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f) => (
              <label key={f.cle} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${format === f.cle ? 'border-marque-600 bg-marque-50' : 'border-slate-300'}`}>
                <input type="radio" name="format-export" checked={format === f.cle} onChange={() => setFormat(f.cle)} /> {f.libelle}
              </label>
            ))}
          </div>
        </Champ>
        <Champ libelle="Portée">
          <div className="space-y-1.5">
            {([
              ['page', `Page actuelle (${lignesPage.length} ligne${lignesPage.length > 1 ? 's' : ''})`],
              ['filtre', 'Tous les résultats filtrés'],
              ['tout', 'Tous les enregistrements'],
              ['selection', `Lignes sélectionnées (${lignesSelection.length})`],
            ] as [Portee, string][]).map(([p, libelle]) => (
              <label key={p} className={`flex items-center gap-2 text-sm ${porteeDesactivee(p) ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer'}`}>
                <input type="radio" name="portee-export" checked={portee === p} disabled={porteeDesactivee(p)} onChange={() => setPortee(p)} /> {libelle}
              </label>
            ))}
          </div>
        </Champ>
        <Champ libelle="Colonnes à inclure">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {colonnes.map((c) => (
              <label key={c.cle} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={colonnesChoisies.includes(c.cle)} onChange={() => bascculerColonne(c.cle)} /> {c.titre}
              </label>
            ))}
          </div>
        </Champ>
      </div>
    </Modale>
  )
}
