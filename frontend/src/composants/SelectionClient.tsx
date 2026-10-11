import { Plus, X } from 'lucide-react'
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import type { Client, ReponsePaginee } from '../types'
import { extraireErreur } from '../utilitaires/erreurs'
import { Champ } from './Champ'
import { MessageErreur } from './EnTetePage'
import { Modale } from './Modale'

export function SelectionClient({ valeur, onChoisir }: {
  valeur: { id: number; nom: string } | null
  onChoisir: (c: Client | null) => void
}) {
  const [texte, setTexte] = useState('')
  const [resultats, setResultats] = useState<Client[]>([])
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(0)
  const [modaleCreation, setModaleCreation] = useState(false)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauTelephone, setNouveauTelephone] = useState('')
  const [erreurCreation, setErreurCreation] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const conteneur = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!texte.trim()) { setResultats([]); return }
    const t = setTimeout(() => {
      api.get<ReponsePaginee<Client>>('/clients/', { params: { recherche: texte, actif: 1, taille_page: 8 } })
        .then((r) => { setResultats(r.data.resultats); setActif(0); setOuvert(true) })
        .catch(() => undefined)
    }, 250)
    return () => clearTimeout(t)
  }, [texte])

  useEffect(() => {
    const dehors = (e: MouseEvent) => { if (!conteneur.current?.contains(e.target as Node)) setOuvert(false) }
    document.addEventListener('mousedown', dehors)
    return () => document.removeEventListener('mousedown', dehors)
  }, [])

  const choisir = (c: Client) => { onChoisir(c); setTexte(''); setOuvert(false) }

  const surTouche = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(a + 1, resultats.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && ouvert && resultats[actif]) { e.preventDefault(); choisir(resultats[actif]) }
  }

  const ouvrirCreation = () => {
    setNouveauNom(texte.trim()); setNouveauTelephone(''); setErreurCreation(null); setOuvert(false); setModaleCreation(true)
  }

  const creer = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreurCreation(null)
    try {
      const { data } = await api.post<Client>('/clients/', { nom: nouveauNom.trim(), telephone: nouveauTelephone.trim() })
      setModaleCreation(false); setTexte('')
      onChoisir(data)
    } catch (err) { setErreurCreation(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  if (valeur) {
    return (
      <div className="champ flex items-center justify-between">
        <span className="truncate">{valeur.nom}</span>
        <button type="button" className="ml-2 text-slate-400 hover:text-slate-700" onClick={() => onChoisir(null)} aria-label="Changer de client"><X size={14} /></button>
      </div>
    )
  }

  return (
    <>
      <div className="relative" ref={conteneur}>
        <input className="champ" value={texte} placeholder="Client de passage" onChange={(e) => setTexte(e.target.value)} onKeyDown={surTouche}
          onFocus={() => texte.trim() && setOuvert(true)} aria-label="Rechercher ou ajouter un client" />
        {ouvert && (
          <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            {resultats.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Aucun client trouvé.</li>}
            {resultats.map((c, i) => (
              <li key={c.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(c)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === actif ? 'bg-marque-50' : 'hover:bg-slate-50'}`}>
                  <span>{c.nom}</span>
                  {c.telephone && <span className="text-xs text-slate-400">{c.telephone}</span>}
                </button>
              </li>
            ))}
            <li className="border-t border-slate-100">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={ouvrirCreation}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-marque-700 hover:bg-marque-50">
                <Plus size={14} /> Ajouter{texte.trim() ? ` « ${texte.trim()} »` : ' un client'}
              </button>
            </li>
          </ul>
        )}
      </div>
      <Modale ouverte={modaleCreation} titre="Nouveau client" onFermer={() => setModaleCreation(false)} largeur="petite"
        pied={<>
          <button className="btn-secondaire" onClick={() => setModaleCreation(false)}>Annuler</button>
          <button className="btn-primaire" type="submit" form="formulaire-nouveau-client" disabled={envoi}>{envoi ? 'Création…' : 'Créer'}</button>
        </>}>
        <form id="formulaire-nouveau-client" onSubmit={creer} className="space-y-3">
          <MessageErreur message={erreurCreation} />
          <Champ libelle="Nom" requis><input className="champ" value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} required autoFocus /></Champ>
          <Champ libelle="Téléphone"><input className="champ" value={nouveauTelephone} onChange={(e) => setNouveauTelephone(e.target.value)} /></Champ>
        </form>
      </Modale>
    </>
  )
}
