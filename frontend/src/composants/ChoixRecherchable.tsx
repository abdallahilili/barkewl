import { ChevronDown, Loader2, Plus } from 'lucide-react'
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useOptions, viderCacheOptions } from '../hooks/useListe'
import { api } from '../services/api'
import { extraireErreur } from '../utilitaires/erreurs'
import { useNotifier } from './Notifications'
import type { ChampDef } from './PageCrud'

import { t } from '../i18n'

/** Comparaison sans accents ni majuscules : « comprime » retrouve « Comprimé ». */
const normaliser = (texte: string) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

type Ligne = { genre: 'vide' } | { genre: 'option'; option: { id: number } } | { genre: 'ajout' }

/** Liste déroulante alimentée par un référentiel, avec recherche en tapant et, si la valeur n'existe pas, un bouton
 * « Ajouter » qui l'enregistre dans le référentiel (réservé à l'administrateur) puis la sélectionne. */
export function ChoixRecherchable({ source, valeur, onChange, disabled }: {
  source: NonNullable<ChampDef['source']>
  valeur: string | number | boolean | null | undefined
  onChange: (valeur: string) => void
  disabled?: boolean
}) {
  const notifier = useNotifier()
  const { utilisateur } = useAuth()
  const peutAjouter = utilisateur?.role === 'ADMIN'
  const chargees = useOptions<{ id: number }>(source.endpoint, source.params)
  const [ajoutees, setAjoutees] = useState<{ id: number }[]>([])
  const options = useMemo(() => [...chargees, ...ajoutees.filter((a) => !chargees.some((c) => c.id === a.id))], [chargees, ajoutees])

  const [ouvert, setOuvert] = useState(false)
  const [saisie, setSaisie] = useState('')
  const [actif, setActif] = useState(0)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const conteneur = useRef<HTMLDivElement>(null)
  const liste = useRef<HTMLUListElement>(null)

  const courant = String(valeur ?? '')
  const valeurDe = (o: { id: number }) => String(source.valeur ? source.valeur(o) : o.id)
  const selectionnee = options.find((o) => valeurDe(o) === courant)
  // Une valeur déjà enregistrée mais absente de la liste (référentiel désactivé…) reste affichée telle quelle.
  const libelleCourant = selectionnee ? source.libelle(selectionnee) : (source.valeur ? courant : '')

  const terme = normaliser(saisie)
  const trouvees = terme ? options.filter((o) => normaliser(source.libelle(o)).includes(terme)) : options
  const existeDeja = terme !== '' && options.some((o) => normaliser(source.libelle(o)) === terme)
  const lignes: Ligne[] = [
    ...(terme ? [] : [{ genre: 'vide' } as Ligne]),
    ...trouvees.map((option) => ({ genre: 'option', option }) as Ligne),
    ...(peutAjouter && terme && !existeDeja ? [{ genre: 'ajout' } as Ligne] : []),
  ]

  const fermer = () => { setOuvert(false); setSaisie(''); setErreur(null) }

  useEffect(() => {
    if (!ouvert) return
    const clicDehors = (e: MouseEvent) => { if (!conteneur.current?.contains(e.target as Node)) fermer() }
    document.addEventListener('mousedown', clicDehors)
    return () => document.removeEventListener('mousedown', clicDehors)
  }, [ouvert])

  useEffect(() => {
    liste.current?.querySelector('[data-actif="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [actif, ouvert])

  const choisir = (ligne: Ligne | undefined) => {
    if (!ligne) return
    if (ligne.genre === 'ajout') { void ajouter(); return }
    onChange(ligne.genre === 'vide' ? '' : valeurDe(ligne.option))
    fermer()
  }

  const ajouter = async () => {
    const nom = saisie.trim()
    if (!nom) return
    setEnvoi(true); setErreur(null)
    try {
      const { data } = await api.post<{ id: number }>(source.endpoint, { nom })
      viderCacheOptions()
      setAjoutees((a) => [...a, data])
      notifier.succes(t('« {nom} » ajouté au référentiel.', { nom }))
      onChange(valeurDe(data))
      fermer()
    } catch (e) {
      setErreur(extraireErreur(e))
    } finally { setEnvoi(false) }
  }

  const clavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOuvert(true); setActif((a) => Math.min(a + 1, lignes.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { if (ouvert) { e.preventDefault(); choisir(lignes[actif]) } }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (ouvert) fermer() }
  }

  return (
    <div ref={conteneur} className="relative">
      <input className="champ pe-9" type="text" role="combobox" aria-expanded={ouvert} aria-autocomplete="list" autoComplete="off" disabled={disabled}
        value={ouvert ? saisie : libelleCourant}
        placeholder={ouvert ? (libelleCourant || t('Rechercher ou ajouter…')) : (source.vide ?? t('Rechercher ou ajouter…'))}
        onFocus={() => { setOuvert(true); setSaisie(''); setActif(0) }}
        onClick={() => setOuvert(true)}
        onChange={(e) => { setOuvert(true); setSaisie(e.target.value); setActif(0) }}
        onKeyDown={clavier} />
      <ChevronDown size={16} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
      {ouvert && !disabled && (
        <ul ref={liste} role="listbox" className="absolute inset-x-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-300 bg-white py-1 text-sm shadow-lg">
          {lignes.map((ligne, i) => (
            <li key={ligne.genre === 'option' ? ligne.option.id : ligne.genre} role="option" aria-selected={ligne.genre === 'option' && valeurDe(ligne.option) === courant}
              data-actif={i === actif}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActif(i)} onClick={() => choisir(ligne)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${i === actif ? 'bg-marque-50 text-marque-900' : 'text-slate-800'} ${ligne.genre === 'option' && valeurDe(ligne.option) === courant ? 'font-semibold' : ''} ${ligne.genre === 'ajout' ? 'border-t border-slate-200 font-medium text-marque-700' : ''}`}>
              {ligne.genre === 'vide' && <span className="text-slate-500">{source.vide ?? t('— Aucun —')}</span>}
              {ligne.genre === 'option' && source.libelle(ligne.option)}
              {ligne.genre === 'ajout' && (<>{envoi ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} {t('Ajouter « {nom} »', { nom: saisie.trim() })}</>)}
            </li>
          ))}
          {terme && trouvees.length === 0 && !(peutAjouter && !existeDeja) && <li className="px-3 py-1.5 text-slate-500">{t('Aucun résultat.')}</li>}
        </ul>
      )}
      {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
    </div>
  )
}
