import { Pencil, Plus } from 'lucide-react'
import { FormEvent, ReactNode, useState } from 'react'
import { useListe, useOptions, viderCacheOptions } from '../hooks/useListe'
import { api } from '../services/api'
import { erreursParChamp, extraireErreur } from '../utilitaires/erreurs'
import { BarreRecherche } from './BarreRecherche'
import { Champ } from './Champ'
import { EnTetePage, MessageErreur } from './EnTetePage'
import { Modale } from './Modale'
import { useNotifier } from './Notifications'
import { Colonne, TableauDonnees } from './TableauDonnees'

type Valeur = string | number | boolean | null | undefined
export type Formulaire = Record<string, Valeur>

export interface ChampDef {
  nom: string
  libelle: string
  type: 'texte' | 'email' | 'nombre' | 'decimal' | 'date' | 'select' | 'case' | 'zone' | 'motdepasse'
  requis?: boolean
  aide?: string
  defaut?: Valeur
  options?: { valeur: string | number; libelle: string }[]
  source?: { endpoint: string; libelle: (o: any) => string; params?: Record<string, string | number>; vide?: string } // eslint-disable-line @typescript-eslint/no-explicit-any
  masque?: (f: Formulaire, enEdition: boolean) => boolean
  desactiveEnEdition?: boolean
  entiere?: boolean
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
  return (
    <select className="champ" value={String(valeur ?? '')} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{vide ?? source.vide ?? '— Choisir —'}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{source.libelle(o)}</option>)}
    </select>
  )
}

function ChampFormulaire({ def, formulaire, maj, erreur, enEdition }: {
  def: ChampDef; formulaire: Formulaire; maj: (nom: string, v: Valeur) => void; erreur?: string; enEdition: boolean
}) {
  const valeur = formulaire[def.nom]
  const desactive = enEdition && def.desactiveEnEdition
  let entree: ReactNode
  if (def.type === 'case') {
    entree = (
      <label className="flex items-center gap-2 pt-1 text-sm">
        <input type="checkbox" checked={!!valeur} onChange={(e) => maj(def.nom, e.target.checked)} /> {def.aide ?? 'Oui'}
      </label>
    )
  } else if (def.type === 'select' && def.source) {
    entree = <SelectSource source={def.source} valeur={valeur} onChange={(v) => maj(def.nom, v)} disabled={desactive} />
  } else if (def.type === 'select') {
    entree = (
      <select className="champ" value={String(valeur ?? '')} onChange={(e) => maj(def.nom, e.target.value)} disabled={desactive}>
        {!def.requis && <option value="">— Aucun —</option>}
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
}

/** Page de gestion générique : liste paginée + recherche + filtres + création/modification en fenêtre modale. */
export function PageCrud<T extends { id: number }>({
  titre, description, endpoint, nomElement, colonnes, champs, filtres = [], filtresInitiaux = {}, libelleNouveau,
  peutCreer = true, peutModifier = true, placeholderRecherche, triInitial, taillePage = 25, actionsLigne, actionsEntete,
  largeurModale = 'moyenne', sansEntete,
}: Props<T>) {
  const notifier = useNotifier()
  const [valeursFiltres, setValeursFiltres] = useState<Record<string, string>>(filtresInitiaux)
  const liste = useListe<T>(endpoint, { filtres: valeursFiltres, triInitial, taillePage })
  const [ouvert, setOuvert] = useState(false)
  const [enEdition, setEnEdition] = useState<T | null>(null)
  const [formulaire, setFormulaire] = useState<Formulaire>({})
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const valeursParDefaut = (): Formulaire => Object.fromEntries(champs.map((c) => [c.nom, c.defaut ?? (c.type === 'case' ? false : '')]))

  const ouvrirCreation = () => { setEnEdition(null); setFormulaire(valeursParDefaut()); setErreurs({}); setErreurGlobale(null); setOuvert(true) }
  const ouvrirEdition = (ligne: T) => {
    const f: Formulaire = valeursParDefaut()
    for (const c of champs) { if (c.type !== 'motdepasse') f[c.nom] = (ligne as unknown as Formulaire)[c.nom] ?? f[c.nom] }
    setEnEdition(ligne); setFormulaire(f); setErreurs({}); setErreurGlobale(null); setOuvert(true)
  }

  const soumettre = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreurs({}); setErreurGlobale(null)
    const charge: Record<string, unknown> = {}
    for (const c of champs) {
      if (c.masque && !c.masque(formulaire, !!enEdition)) continue
      const v = formulaire[c.nom]
      if (c.type === 'motdepasse' && enEdition && !v) continue
      if (c.type === 'nombre' || c.type === 'decimal') charge[c.nom] = v === '' || v == null ? (c.requis ? v : null) : Number(v)
      else if (c.type === 'date') charge[c.nom] = v || null
      else if (c.type === 'select') charge[c.nom] = v === '' || v == null ? null : (c.options?.some((o) => typeof o.valeur === 'string') ? v : Number(v))
      else charge[c.nom] = v
    }
    try {
      if (enEdition) await api.patch(`${endpoint}${enEdition.id}/`, charge)
      else await api.post(endpoint, charge)
      viderCacheOptions()
      notifier.succes(`${nomElement} enregistré${nomElement.endsWith('e') || nomElement.endsWith('ie') ? 'e' : ''}.`)
      setOuvert(false)
      liste.recharger()
    } catch (err) {
      setErreurs(erreursParChamp(err))
      setErreurGlobale(extraireErreur(err))
    } finally { setEnvoi(false) }
  }

  const colonnesFinales: Colonne<T>[] = [
    ...colonnes,
    ...((peutModifier || actionsLigne) ? [{
      cle: '_actions', titre: '', alignement: 'droite' as const,
      rendu: (ligne: T) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {actionsLigne?.(ligne, liste.recharger)}
          {peutModifier && <button className="btn-discret btn-petit" onClick={() => ouvrirEdition(ligne)} aria-label="Modifier"><Pencil size={14} /> Modifier</button>}
        </div>
      ),
    }] : []),
  ]

  return (
    <div>
      {!sansEntete && (
        <EnTetePage titre={titre} description={description} actions={<>
          {actionsEntete}
          {peutCreer && <button className="btn-primaire" onClick={ouvrirCreation}><Plus size={16} /> {libelleNouveau ?? 'Ajouter'}</button>}
        </>} />
      )}
      {sansEntete && peutCreer && <div className="mb-3 flex justify-end"><button className="btn-primaire" onClick={ouvrirCreation}><Plus size={16} /> {libelleNouveau ?? 'Ajouter'}</button></div>}
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={placeholderRecherche ?? 'Rechercher…'}>
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
        cleLigne={(l) => l.id} titre={titre} />

      <Modale ouverte={ouvert} onFermer={() => setOuvert(false)} largeur={largeurModale}
        titre={enEdition ? `Modifier — ${nomElement.toLowerCase()}` : (libelleNouveau ?? 'Ajouter')}
        pied={<>
          <button type="button" className="btn-secondaire" onClick={() => setOuvert(false)}>Annuler</button>
          <button type="submit" form="formulaire-crud" className="btn-primaire" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>}>
        <form id="formulaire-crud" onSubmit={soumettre}>
          <MessageErreur message={erreurGlobale} />
          <div className="grid gap-4 sm:grid-cols-2">
            {champs.filter((c) => !c.masque || c.masque(formulaire, !!enEdition)).map((c) => (
              <div key={c.nom} className={c.type === 'zone' ? 'sm:col-span-2' : ''}>
                <ChampFormulaire def={c} formulaire={formulaire} enEdition={!!enEdition} erreur={erreurs[c.nom]}
                  maj={(nom, v) => setFormulaire((f) => ({ ...f, [nom]: v }))} />
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
