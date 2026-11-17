import { Pencil, Plus } from 'lucide-react'
import { FormEvent, ReactNode, useState } from 'react'
import { useListe, useOptions, viderCacheOptions } from '../hooks/useListe'
import { api } from '../services/api'
import { erreursParChamp, extraireErreur } from '../utilitaires/erreurs'
import { BarreRecherche } from './BarreRecherche'
import { Champ } from './Champ'
import { ChoixRecherchable } from './ChoixRecherchable'
import { EnTetePage, MessageErreur } from './EnTetePage'
import { Modale } from './Modale'
import { useNotifier } from './Notifications'
import { ActionMasse, Colonne, TableauDonnees } from './TableauDonnees'

import { t } from '../i18n'
export type Valeur = string | number | boolean | null | undefined
export type Formulaire = Record<string, Valeur>

export interface ChampDef {
  nom: string
  libelle: string
  type: 'texte' | 'email' | 'nombre' | 'decimal' | 'date' | 'select' | 'case' | 'zone' | 'motdepasse'
  requis?: boolean
  aide?: string
  defaut?: Valeur
  options?: { valeur: string | number; libelle: string }[]
  /** `valeur` : valeur enregistrée pour une option (par défaut son id) ; pour un champ texte alimenté par un référentiel
   * (forme, dosage), c'est le nom. */
  source?: { endpoint: string; libelle: (o: any) => string; params?: Record<string, string | number>; vide?: string; valeur?: (o: any) => string; /** Liste avec recherche et ajout d'une valeur absente au référentiel (administrateur). */ ajoutPossible?: boolean } // eslint-disable-line @typescript-eslint/no-explicit-any
  masque?: (f: Formulaire, enEdition: boolean) => boolean
  desactiveEnEdition?: boolean
  entiere?: boolean
  /** Suggère automatiquement la valeur de ce champ à partir d'un autre (ex. prix de vente depuis le prix d'achat).
   * Suspendu dès que l'utilisateur modifie ce champ directement, pour ne jamais écraser une saisie manuelle. */
  suggererDepuis?: { champ: string; calcul: (valeurSource: number, formulaire: Formulaire) => number }
}

/** Applique les suggestions dépendant du champ `nom` qui vient de changer (voir `ChampDef.suggererDepuis`). */
export function appliquerSuggestions(champs: ChampDef[], nom: string, formulaire: Formulaire, champsModifies: Set<string>): Formulaire {
  let suivant = formulaire
  for (const c of champs) {
    if (c.suggererDepuis?.champ === nom && !champsModifies.has(c.nom)) {
      suivant = { ...suivant, [c.nom]: c.suggererDepuis.calcul(Number(formulaire[nom]) || 0, suivant) }
    }
  }
  return suivant
}

export interface FiltreDef {
  nom: string
  libelle: string
  options?: { valeur: string | number; libelle: string }[]
  source?: { endpoint: string; libelle: (o: any) => string } // eslint-disable-line @typescript-eslint/no-explicit-any
}

function SelectSource({ source, valeur, onChange, vide, disabled }: {
  source: NonNullable<ChampDef['source']>; valeur: Valeur; onChange: (v: string) => void; vide?: string; disabled?: boolean
}) {
  const options = useOptions<{ id: number }>(source.endpoint, source.params)
  const courant = String(valeur ?? '')
  const valeurDe = (o: { id: number }) => (source.valeur ? source.valeur(o) : o.id)
  // Valeur déjà enregistrée mais absente de la liste (référentiel désactivé ou modifié) : on la garde plutôt que de l'effacer.
  const absente = !!source.valeur && courant !== '' && !options.some((o) => String(valeurDe(o)) === courant)
  return (
    <select className="champ" value={courant} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{vide ?? source.vide ?? t('— Choisir —')}</option>
      {absente && <option value={courant}>{courant}</option>}
      {options.map((o) => <option key={o.id} value={valeurDe(o)}>{source.libelle(o)}</option>)}
    </select>
  )
}

export function ChampFormulaire({ def, formulaire, maj, erreur, enEdition }: {
  def: ChampDef; formulaire: Formulaire; maj: (nom: string, v: Valeur) => void; erreur?: string; enEdition: boolean
}) {
  const valeur = formulaire[def.nom]
  const desactive = enEdition && def.desactiveEnEdition
  let entree: ReactNode
  if (def.type === 'case') {
    entree = (
      <label className="flex items-center gap-2 pt-1 text-sm">
        <input type="checkbox" checked={!!valeur} onChange={(e) => maj(def.nom, e.target.checked)} /> {def.aide ?? t('Oui')}
      </label>
    )
  } else if (def.type === 'select' && def.source?.ajoutPossible) {
    entree = <ChoixRecherchable source={def.source} valeur={valeur} onChange={(v) => maj(def.nom, v)} disabled={desactive} />
  } else if (def.type === 'select' && def.source) {
    entree = <SelectSource source={def.source} valeur={valeur} onChange={(v) => maj(def.nom, v)} disabled={desactive} />
  } else if (def.type === 'select') {
    entree = (
      <select className="champ" value={String(valeur ?? '')} onChange={(e) => maj(def.nom, e.target.value)} disabled={desactive}>
        {!def.requis && <option value="">{t('— Aucun —')}</option>}
        {def.options?.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
      </select>
    )
  } else if (def.type === 'zone') {
    entree = <textarea className="champ" rows={3} value={String(valeur ?? '')} onChange={(e) => maj(def.nom, e.target.value)} />
  } else {
    const type = { texte: 'text', email: 'email', nombre: 'number', decimal: 'number', date: 'date', motdepasse: 'password' }[def.type]
    entree = (
      <input className="champ" type={type} value={String(valeur ?? '')} disabled={desactive}
        min={def.type === 'nombre' || def.type === 'decimal' ? 0 : undefined}
        step={def.type === 'decimal' ? '0.01' : def.type === 'nombre' ? '1' : undefined}
        autoComplete={def.type === 'motdepasse' ? 'new-password' : 'off'}
        onChange={(e) => maj(def.nom, e.target.value)} />
    )
  }
  return (
    <Champ libelle={def.type === 'case' ? def.libelle : def.libelle} requis={def.requis && !(enEdition && def.type === 'motdepasse')}
      erreur={erreur} aide={def.type === 'case' ? undefined : def.aide}>
      {entree}
    </Champ>
  )
}

export function construireCharge(champs: ChampDef[], formulaire: Formulaire, enEdition: boolean): Record<string, unknown> {
  const charge: Record<string, unknown> = {}
  for (const c of champs) {
    if (c.masque && !c.masque(formulaire, enEdition)) continue
    const v = formulaire[c.nom]
    if (c.type === 'motdepasse' && enEdition && !v) continue
    if (c.type === 'nombre' || c.type === 'decimal') charge[c.nom] = v === '' || v == null ? (c.requis ? v : null) : Number(v)
    else if (c.type === 'date') charge[c.nom] = v || null
    else if (c.type === 'select') {
      const texte = !!c.source?.valeur  // la valeur est un texte (nom d'un référentiel), jamais un identifiant
      charge[c.nom] = v === '' || v == null ? (texte ? '' : null) : (texte || c.options?.some((o) => typeof o.valeur === 'string') ? v : Number(v))
    }
    else charge[c.nom] = v
  }
  return charge
}

interface Props<T extends { id: number }> {
  titre: string
  description?: string
  endpoint: string
  nomElement: string
  colonnes: Colonne<T>[]
  champs: ChampDef[]
  filtres?: FiltreDef[]
  filtresInitiaux?: Record<string, string>
  libelleNouveau?: string
  peutCreer?: boolean
  peutModifier?: boolean
  placeholderRecherche?: string
  triInitial?: string
  taillePage?: number
  actionsLigne?: (ligne: T, recharger: () => void) => ReactNode
  actionsEntete?: ReactNode
  largeurModale?: 'petite' | 'moyenne' | 'grande'
  sansEntete?: boolean
  /** Identifiant stable pour mémoriser l'agencement des colonnes (localStorage). Par défaut dérivé de `endpoint`. */
  idTableau?: string
  /** Sélection multiple + actions groupées (désactiver, annuler…) — aucune par défaut. */
  actionsMasse?: ActionMasse<T>[]
  /** Tableau resserré : une hauteur fixe par ligne. */
  compact?: boolean
}

/** Page de gestion générique : liste paginée + recherche + filtres + création/modification en fenêtre modale. */
export function PageCrud<T extends { id: number }>({
  titre, description, endpoint, nomElement, colonnes, champs, filtres = [], filtresInitiaux = {}, libelleNouveau,
  peutCreer = true, peutModifier = true, placeholderRecherche, triInitial, taillePage = 25, actionsLigne, actionsEntete, compact,
  largeurModale = 'moyenne', sansEntete, idTableau, actionsMasse,
}: Props<T>) {
  const notifier = useNotifier()
  const [valeursFiltres, setValeursFiltres] = useState<Record<string, string>>(filtresInitiaux)
  const liste = useListe<T>(endpoint, { filtres: valeursFiltres, triInitial, taillePage })
  const [ouvert, setOuvert] = useState(false)
  const [enEdition, setEnEdition] = useState<T | null>(null)
  const [formulaire, setFormulaire] = useState<Formulaire>({})
  const [champsModifies, setChampsModifies] = useState<Set<string>>(new Set())
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const valeursParDefaut = (): Formulaire => Object.fromEntries(champs.map((c) => [c.nom, c.defaut ?? (c.type === 'case' ? false : '')]))

  const ouvrirCreation = () => { setEnEdition(null); setFormulaire(valeursParDefaut()); setChampsModifies(new Set()); setErreurs({}); setErreurGlobale(null); setOuvert(true) }
  const ouvrirEdition = (ligne: T) => {
    const f: Formulaire = valeursParDefaut()
    for (const c of champs) { if (c.type !== 'motdepasse') f[c.nom] = (ligne as unknown as Formulaire)[c.nom] ?? f[c.nom] }
    setEnEdition(ligne); setFormulaire(f); setChampsModifies(new Set()); setErreurs({}); setErreurGlobale(null); setOuvert(true)
  }

  const majChamp = (nom: string, v: Valeur) => {
    setChampsModifies((s) => new Set(s).add(nom))
    setFormulaire((f) => appliquerSuggestions(champs, nom, { ...f, [nom]: v }, champsModifies))
  }

  const soumettre = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreurs({}); setErreurGlobale(null)
    const charge = construireCharge(champs, formulaire, !!enEdition)
    try {
      if (enEdition) await api.patch(`${endpoint}${enEdition.id}/`, charge)
      else await api.post(endpoint, charge)
      viderCacheOptions()
      notifier.succes(t('Enregistré : {element}.', { element: nomElement }))
      setOuvert(false)
      liste.recharger()
    } catch (err) {
      setErreurs(erreursParChamp(err))
      setErreurGlobale(extraireErreur(err))
    } finally { setEnvoi(false) }
  }

  const actionsMasseAvecRecharge = actionsMasse?.map((a) => ({
    ...a,
    executer: async (lignes: T[]) => { const r = await a.executer(lignes); liste.recharger(); return r },
  }))

  const colonnesFinales: Colonne<T>[] = [
    ...colonnes,
    ...((peutModifier || actionsLigne) ? [{
      cle: '_actions', titre: '', alignement: 'droite' as const,
      rendu: (ligne: T) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {actionsLigne?.(ligne, liste.recharger)}
          {peutModifier && <button className="btn-discret btn-petit" onClick={() => ouvrirEdition(ligne)} aria-label={t('Modifier')}><Pencil size={14} /> {' '}{t('Modifier')}</button>}
        </div>
      ),
    }] : []),
  ]

  return (
    <div>
      {!sansEntete && (
        <EnTetePage titre={titre} description={description} actions={<>
          {actionsEntete}
          {peutCreer && <button className="btn-primaire" onClick={ouvrirCreation}><Plus size={16} /> {libelleNouveau ?? t('Ajouter')}</button>}
        </>} />
      )}
      {sansEntete && peutCreer && <div className="mb-3 flex justify-end"><button className="btn-primaire" onClick={ouvrirCreation}><Plus size={16} /> {libelleNouveau ?? t('Ajouter')}</button></div>}
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={placeholderRecherche ?? t('Rechercher…')}>
        {filtres.map((f) => (
          <select key={f.nom} className="champ w-auto" aria-label={f.libelle} value={valeursFiltres[f.nom] ?? ''}
            onChange={(e) => setValeursFiltres((v) => ({ ...v, [f.nom]: e.target.value }))}>
            <option value="">{f.libelle}</option>
            {f.options?.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
            {f.source && <FiltreSource source={f.source} />}
          </select>
        ))}
      </BarreRecherche>
      <TableauDonnees colonnes={colonnesFinales} lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur}
        total={liste.total} page={liste.page} nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri}
        cleLigne={(l) => l.id} titre={titre} compact={compact} idTableau={idTableau ?? endpoint} actionsMasse={actionsMasseAvecRecharge}
        endpoint={endpoint} parametresRequete={{ ...valeursFiltres, ...(liste.recherche ? { recherche: liste.recherche } : {}), ...(liste.tri ? { tri: liste.tri } : {}) }} />

      <Modale ouverte={ouvert} onFermer={() => setOuvert(false)} largeur={largeurModale}
        titre={enEdition ? t('Modifier — {element}', { element: nomElement.toLowerCase() }) : (libelleNouveau ?? t('Ajouter'))}
        pied={<>
          <button type="button" className="btn-secondaire" onClick={() => setOuvert(false)}>{t('Annuler')}</button>
          <button type="submit" form="formulaire-crud" className="btn-primaire" disabled={envoi}>{envoi ? t('Enregistrement…') : t('Enregistrer')}</button>
        </>}>
        <form id="formulaire-crud" onSubmit={soumettre}>
          <MessageErreur message={erreurGlobale} />
          <div className="grid gap-4 sm:grid-cols-2">
            {champs.filter((c) => !c.masque || c.masque(formulaire, !!enEdition)).map((c) => (
              <div key={c.nom} className={c.type === 'zone' ? 'sm:col-span-2' : ''}>
                <ChampFormulaire def={c} formulaire={formulaire} enEdition={!!enEdition} erreur={erreurs[c.nom]}
                  maj={majChamp} />
              </div>
            ))}
          </div>
        </form>
      </Modale>
    </div>
  )
}

function FiltreSource({ source }: { source: NonNullable<FiltreDef['source']> }) {
  const options = useOptions<{ id: number }>(source.endpoint)
  return <>{options.map((o) => <option key={o.id} value={o.id}>{source.libelle(o)}</option>)}</>
}
