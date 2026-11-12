import { MapPin, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../composants/Badge'
import { Chargement, EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { RecuImpression } from '../../composants/RecuImpression'
import { SelectionClient } from '../../composants/SelectionClient'
import { useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Client, Conditionnement, ModePaiement, OptionConditionnement, Recu, ResultatCaisse, SessionCaisse } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { formaterDate, formaterMontant, formaterNombre, gestionRayonnagesActive } from '../../utilitaires/formatage'

import { t } from '../../i18n'
/** Une ligne du panier = un médicament dans un conditionnement (boîte, plaquette ou unité). */
interface LignePanier {
  cle: string
  medicament: number
  nom: string
  dosage: string
  conditionnement: Conditionnement
  options: OptionConditionnement[]
  stockUnites: number
  prix: number
  quantite: number
}
type RefLigne = Pick<LignePanier, 'cle' | 'medicament' | 'options' | 'conditionnement' | 'stockUnites'>
interface PaiementSaisi { mode_paiement: string; montant: string; reference_transaction: string }
interface Apercu { total: number; lignes: { medicament_nom: string; numero_lot: string; date_peremption: string; quantite: number; conditionnement: Conditionnement; conditionnement_libelle: string; prix_unitaire: number; total: number }[] }

const cleLigne = (medicament: number, conditionnement: Conditionnement) => `${medicament}-${conditionnement}`
const option = (l: Pick<LignePanier, 'options' | 'conditionnement'>) => l.options.find((o) => o.code === l.conditionnement)!
/** Par défaut on vend à la boîte ; s'il n'y a plus de boîte complète, au détail. */
const conditionnementParDefaut = (r: ResultatCaisse) => (r.conditionnements.find((o) => o.disponible > 0) ?? r.conditionnements[0]).code
const libelleOption = (o: OptionConditionnement, quantite: number) => (quantite > 1 ? o.libelle_pluriel : o.libelle)

/** Unités de stock déjà dans le panier pour un médicament (toutes lignes confondues), hors une ligne donnée. */
const unitesDansPanier = (p: LignePanier[], medicament: number, sauf?: string) =>
  p.filter((l) => l.medicament === medicament && l.cle !== sauf).reduce((s, l) => s + l.quantite * option(l).unites, 0)

/** Quantité maximale vendable pour une ligne : conditionnements complets disponibles et stock total du médicament. */
const maximum = (p: LignePanier[], l: RefLigne) => {
  const o = option(l)
  return Math.min(o.disponible, Math.floor((l.stockUnites - unitesDansPanier(p, l.medicament, l.cle)) / o.unites))
}

export default function NouvelleVente() {
  const notifier = useNotifier()
  const champRecherche = useRef<HTMLInputElement>(null)
  const [session, setSession] = useState<SessionCaisse | null>(null)
  const [chargement, setChargement] = useState(true)
  const [texte, setTexte] = useState('')
  const [resultats, setResultats] = useState<ResultatCaisse[]>([])
  const [recherche, setRecherche] = useState(false)
  const [panier, setPanier] = useState<LignePanier[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const modes = useOptions<ModePaiement>('/modes-paiement/', { actif: 1 })

  const [modalePaiement, setModalePaiement] = useState(false)
  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [paiements, setPaiements] = useState<PaiementSaisi[]>([])
  const [montantRecu, setMontantRecu] = useState('')
  const [erreurPaiement, setErreurPaiement] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [recu, setRecu] = useState<Recu | null>(null)

  const rayonnages = gestionRayonnagesActive()
  const total = useMemo(() => panier.reduce((s, l) => s + l.prix * l.quantite, 0), [panier])
  const modesActifs = modes.filter((m) => m.actif)
  const modeEspeces = modesActifs.find((m) => m.type === 'ESPECES')

  useEffect(() => {
    api.get<{ session: SessionCaisse | null }>('/sessions-caisse/actuelle/').then((r) => setSession(r.data.session)).finally(() => setChargement(false))
  }, [])

  useEffect(() => {
    if (!session) { setResultats([]); return }
    if (!texte.trim()) {
      // Pas de recherche en cours : on affiche les médicaments les plus vendus.
      setRecherche(true)
      api.get<ResultatCaisse[]>('/medicaments/recherche-caisse/', { params: { depot: session.depot } })
        .then((r) => setResultats(r.data)).catch(() => setResultats([])).finally(() => setRecherche(false))
      return
    }
    const t = setTimeout(() => {
      setRecherche(true)
      api.get<ResultatCaisse[]>('/medicaments/recherche-caisse/', { params: { q: texte.trim(), depot: session.depot } })
        .then((r) => setResultats(r.data)).catch(() => setResultats([])).finally(() => setRecherche(false))
    }, 200)
    return () => clearTimeout(t)
  }, [texte, session])

  const ajouter = useCallback((r: ResultatCaisse, conditionnement?: Conditionnement) => {
    if (r.stock_disponible <= 0) { notifier.erreur(t('« {nom} » n\'est pas disponible en stock (lots périmés exclus).', { nom: r.nom })); return }
    const code = conditionnement ?? conditionnementParDefaut(r)
    const o = r.conditionnements.find((x) => x.code === code)!
    const cle = cleLigne(r.id, code)
    setPanier((p) => {
      const existant = p.find((l) => l.cle === cle)
      const max = maximum(p, existant ?? { cle, medicament: r.id, options: r.conditionnements, conditionnement: code, stockUnites: r.stock_disponible })
      if ((existant?.quantite ?? 0) >= max) {
        notifier.erreur(t('Plus de {conditionnement} disponibles pour « {nom} » (stock : {stock}).', { conditionnement: o.libelle_pluriel, nom: r.nom, stock: r.stock_texte }))
        return p
      }
      if (existant) return p.map((l) => (l.cle === cle ? { ...l, quantite: l.quantite + 1 } : l))
      return [...p, { cle, medicament: r.id, nom: r.nom, dosage: r.dosage, conditionnement: code, options: r.conditionnements,
        stockUnites: r.stock_disponible, prix: Number(o.prix), quantite: 1 }]
    })
    setTexte(''); setResultats([])
    champRecherche.current?.focus()
  }, [notifier])

  const surEntree = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || resultats.length === 0) return
    e.preventDefault()
    const t = texte.trim()
    const exact = resultats.find((r) => r.code_barre === t || r.code === t)
    if (exact) ajouter(exact)
    else if (resultats.length === 1) ajouter(resultats[0])
    else ajouter(resultats[0])
  }

  const changerQuantite = (cle: string, valeur: number) => {
    setPanier((p) => p.map((l) => {
      if (l.cle !== cle) return l
      const max = Math.max(1, maximum(p, l))
      if (valeur > max) notifier.erreur(t('Disponible : {quantite} {conditionnement}.', { quantite: max, conditionnement: libelleOption(option(l), max) }))
      return { ...l, quantite: Math.max(1, Math.min(Math.floor(valeur) || 1, max)) }
    }))
  }

  /** Change le conditionnement d'une ligne (boîte, plaquette, unité) ; fusionne avec une ligne existante. */
  const changerConditionnement = (cle: string, code: Conditionnement) => {
    setPanier((p) => {
      const l = p.find((x) => x.cle === cle)
      if (!l || l.conditionnement === code) return p
      const nouvelleCle = cleLigne(l.medicament, code)
      const o = l.options.find((x) => x.code === code)!
      const existante = p.find((x) => x.cle === nouvelleCle)
      const reste = p.filter((x) => x.cle !== cle && x.cle !== nouvelleCle)
      const nouvelle: LignePanier = { ...l, cle: nouvelleCle, conditionnement: code, prix: Number(o.prix), quantite: (existante?.quantite ?? 0) + 1 }
      const max = maximum(reste, nouvelle)
      if (max < 1) { notifier.erreur(t('Aucun(e) {conditionnement} disponible pour « {nom} ».', { conditionnement: o.libelle, nom: l.nom })); return p }
      nouvelle.quantite = Math.min(nouvelle.quantite, max)
      return [...reste, nouvelle]
    })
  }

  const ouvrirPaiement = useCallback(async () => {
    if (panier.length === 0 || !session) return
    setErreurPaiement(null); setApercu(null); setMontantRecu('')
    try {
      const { data } = await api.post<Apercu>('/ventes/apercu/', { articles: panier.map((l) => ({ medicament: l.medicament, conditionnement: l.conditionnement, quantite: l.quantite })) })
      setApercu(data)
      setPaiements([{ mode_paiement: modeEspeces ? String(modeEspeces.id) : '', montant: String(data.total), reference_transaction: '' }])
      setModalePaiement(true)
    } catch (e) { notifier.erreur(extraireErreur(e)) }
  }, [panier, session, modeEspeces, notifier])

  useEffect(() => {
    const surTouche = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); champRecherche.current?.focus() }
      if (e.key === 'F9' && !modalePaiement && !recu) { e.preventDefault(); ouvrirPaiement() }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [ouvrirPaiement, modalePaiement, recu])

  const totalVente = apercu?.total ?? total
  const sommePaiements = paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0)
  const reste = Math.round((totalVente - sommePaiements) * 100) / 100
  const especes = paiements.filter((p) => modes.find((m) => String(m.id) === p.mode_paiement)?.type === 'ESPECES').reduce((s, p) => s + (Number(p.montant) || 0), 0)
  const rendu = montantRecu !== '' ? Number(montantRecu) - especes : null

  const encaisser = async () => {
    setEnvoi(true); setErreurPaiement(null)
    try {
      const { data } = await api.post<Recu>('/ventes/', {
        client: client ? client.id : null,
        articles: panier.map((l) => ({ medicament: l.medicament, conditionnement: l.conditionnement, quantite: l.quantite })),
        paiements: paiements.filter((p) => Number(p.montant) > 0).map((p) => ({
          mode_paiement: Number(p.mode_paiement), montant: Number(p.montant), reference_transaction: p.reference_transaction,
        })),
        montant_recu: especes > 0 && montantRecu !== '' ? Number(montantRecu) : null,
      })
      setModalePaiement(false); setPanier([]); setClient(null); setRecu(data)
      notifier.succes(t('Vente {reference} enregistrée.', { reference: data.reference }))
    } catch (e) { setErreurPaiement(extraireErreur(e)) }
    finally { setEnvoi(false) }
  }

  if (chargement) return <Chargement />
  if (!session) {
    return (
      <div>
        <EnTetePage titre={t('Nouvelle vente')} />
        <div className="carte mx-auto max-w-md p-6 text-center">
          <ShoppingCart className="mx-auto mb-2 text-slate-400" />
          <p className="font-medium">{t('Aucune session de caisse ouverte')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('Ouvrez une session pour pouvoir encaisser des ventes.')}</p>
          <Link to="/caisse" className="btn-primaire mt-4">{t('Ouvrir une session')}</Link>
        </div>
      </div>
    )
  }

  const paiementOk = Math.abs(reste) < 0.005 && paiements.every((p) => p.mode_paiement) && (montantRecu === '' || especes === 0 || Number(montantRecu) >= especes)

  return (
    <div>
      <EnTetePage titre={t('Nouvelle vente')} description={`${session.caisse_nom} — dépôt : ${session.depot_nom}`}
        actions={<span className="text-xs text-slate-500">{t('F2 : rechercher · F9 : encaisser')}</span>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <section>
          <div className="relative">
            <input ref={champRecherche} autoFocus className="champ py-3 text-base" value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={surEntree}
              placeholder={t('Scannez un code-barres ou tapez le nom du médicament…')} aria-label={t('Recherche de médicament')} />
            {recherche && <span className="absolute end-3 top-3.5 text-xs text-slate-400">{t('Recherche…')}</span>}
          </div>
          {resultats.length > 0 && (
            <p className="mb-2 mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              {texte.trim() ? t('Résultats') : t('Tous les médicaments (les plus vendus en premier)')}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {resultats.map((r) => (
              <div key={r.id} className={`carte p-3 ${r.stock_disponible <= 0 ? 'opacity-60' : 'hover:border-marque-500'}`}>
              <button onClick={() => ajouter(r)} disabled={r.stock_disponible <= 0}
                className="flex w-full items-start justify-between gap-2 text-start disabled:cursor-not-allowed">
                <span>
                  <span className="block font-medium">{r.nom}</span>
                  <span className="block text-xs text-slate-500">{r.dosage} {r.forme}</span>
                  {rayonnages && r.emplacement && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      <MapPin size={11} /> {r.emplacement}
                    </span>
                  )}
                  {r.prochaine_peremption && <span className="block text-xs text-slate-400">{t('Péremption :')}{' '}{formaterDate(r.prochaine_peremption)}</span>}
                  {r.frequence_vente > 0 && <span className="block text-xs text-slate-400">{t('Vendu')}{' '}{formaterNombre(r.frequence_vente)} {' '}{t('fois')}</span>}
                </span>
                <span className="shrink-0 text-end">
                  <span className="block font-semibold">{formaterMontant(r.prix_vente)}</span>
                  {r.stock_disponible > 0
                    ? <Badge ton={r.stock_disponible <= 5 * r.unites_par_boite ? 'orange' : 'vert'}>{r.stock_texte} {' '}{t('en stock')}</Badge>
                    : <Badge ton="rouge">{t('Indisponible')}</Badge>}
                </span>
              </button>
              {r.conditionnements.length > 1 && r.stock_disponible > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                  {r.conditionnements.map((o) => (
                    <button key={o.code} type="button" disabled={o.disponible <= 0} onClick={() => ajouter(r, o.code)}
                      className="btn-secondaire btn-petit disabled:opacity-40" title={`${o.disponible} ${libelleOption(o, o.disponible)} disponible(s)`}>
                      + {o.libelle} <span className="font-semibold">{formaterMontant(o.prix)}</span>
                    </button>
                  ))}
                </div>
              )}
              </div>
            ))}
            {texte.trim() && !recherche && resultats.length === 0 && <p className="text-sm text-slate-500">{t('Aucun médicament trouvé pour «')}{' '}{texte} ».</p>}
          </div>
        </section>

        <aside className="carte flex flex-col self-start">
          <div className="border-b border-slate-200 px-4 py-3"><h2 className="font-semibold">{t('Panier')}</h2></div>
          <div className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto">
            {panier.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t('Le panier est vide. Recherchez un médicament pour l\'ajouter.')}</p>}
            {panier.map((l) => (
              <div key={l.cle} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-sm font-medium">{l.nom} <span className="font-normal text-slate-500">{l.dosage}</span></p><p className="text-xs text-slate-500">{formaterMontant(l.prix)} / {option(l).libelle}</p></div>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => setPanier((p) => p.filter((x) => x.cle !== l.cle))} aria-label={t('Retirer {nom}', { nom: l.nom })}><Trash2 size={16} /></button>
                </div>
                {l.options.length > 1 && (
                  <div className="mt-2 inline-flex overflow-hidden rounded-md border border-slate-200 text-xs" role="group" aria-label={t('Conditionnement')}>
                    {l.options.map((o) => (
                      <button key={o.code} type="button" onClick={() => changerConditionnement(l.cle, o.code)}
                        className={`px-2 py-1 ${o.code === l.conditionnement ? 'bg-marque-600 font-medium text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                        {o.libelle}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button className="btn-secondaire btn-petit" onClick={() => changerQuantite(l.cle, l.quantite - 1)} aria-label={t('Diminuer')}><Minus size={14} /></button>
                    <input type="number" min={1} className="champ w-16 px-2 py-1 text-center" value={l.quantite} onChange={(e) => changerQuantite(l.cle, Number(e.target.value))} aria-label={t('Quantité')} />
                    <button className="btn-secondaire btn-petit" onClick={() => changerQuantite(l.cle, l.quantite + 1)} aria-label={t('Augmenter')}><Plus size={14} /></button>
                    <span className="ms-1 text-xs text-slate-500">{libelleOption(option(l), l.quantite)}</span>
                  </div>
                  <span className="font-semibold">{formaterMontant(l.prix * l.quantite)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3 border-t border-slate-200 p-4">
            <div>
              <label className="etiquette">{t('Client (facultatif)')}</label>
              <SelectionClient valeur={client} onChoisir={setClient} />
            </div>
            <div className="flex items-baseline justify-between"><span className="text-sm text-slate-600">{t('Total')}</span><span className="text-2xl font-bold">{formaterMontant(total)}</span></div>
            <div className="flex gap-2">
              <button className="btn-secondaire" disabled={panier.length === 0} onClick={() => setPanier([])}>{t('Vider')}</button>
              <button className="btn-succes flex-1 py-2.5 text-base" disabled={panier.length === 0} onClick={ouvrirPaiement}>{t('Encaisser')}</button>
            </div>
          </div>
        </aside>
      </div>

      <Modale ouverte={modalePaiement} titre={t('Encaissement')} onFermer={() => setModalePaiement(false)} largeur="moyenne"
        pied={<><button className="btn-secondaire" onClick={() => setModalePaiement(false)}>{t('Retour au panier')}</button>
          <button className="btn-succes" disabled={!paiementOk || envoi} onClick={encaisser}>{envoi ? t('Enregistrement…') : t('Valider la vente — {montant}', { montant: formaterMontant(totalVente) })}</button></>}>
        <div className="space-y-4">
          <MessageErreur message={erreurPaiement} />
          {apercu && (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-start text-slate-600"><tr><th className="px-3 py-2">{t('Médicament')}</th><th className="px-3 py-2">{t('Lot (péremption)')}</th><th className="px-3 py-2 text-end">{t('Qté')}</th><th className="px-3 py-2 text-end">{t('Prix')}</th><th className="px-3 py-2 text-end">{t('Total')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {apercu.lignes.map((l, i) => (
                    <tr key={i}><td className="px-3 py-2">{l.medicament_nom}</td><td className="px-3 py-2 text-slate-500">{l.numero_lot} ({formaterDate(l.date_peremption)})</td>
                      <td className="px-3 py-2 text-end">{l.quantite}{l.conditionnement !== 'BOITE' && <span className="text-slate-500"> {l.conditionnement_libelle}</span>}</td><td className="px-3 py-2 text-end">{formaterNombre(l.prix_unitaire)}</td><td className="px-3 py-2 text-end">{formaterNombre(l.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">{t('Les lots sont choisis automatiquement : celui qui expire en premier est vendu en premier.')}</p>
          <div className="space-y-2">
            <p className="text-sm font-semibold">{t('Paiement')}</p>
            {paiements.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_130px_auto] items-center gap-2">
                <select className="champ" value={p.mode_paiement} aria-label={t('Mode de paiement')}
                  onChange={(e) => setPaiements((x) => x.map((y, j) => (j === i ? { ...y, mode_paiement: e.target.value } : y)))}>
                  <option value="">{t('— Mode de paiement —')}</option>
                  {modesActifs.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
                <input className="champ text-end" type="number" min={0} step="0.01" value={p.montant} aria-label={t('Montant')}
                  onChange={(e) => setPaiements((x) => x.map((y, j) => (j === i ? { ...y, montant: e.target.value } : y)))} />
                {paiements.length > 1 ? <button className="text-slate-400 hover:text-red-600" onClick={() => setPaiements((x) => x.filter((_, j) => j !== i))} aria-label={t('Retirer ce paiement')}><Trash2 size={16} /></button> : <span />}
                {modes.find((m) => String(m.id) === p.mode_paiement)?.type === 'MOBILE' && (
                  <input className="champ col-span-3 text-sm" placeholder={t('Référence de la transaction (facultatif)')} value={p.reference_transaction}
                    onChange={(e) => setPaiements((x) => x.map((y, j) => (j === i ? { ...y, reference_transaction: e.target.value } : y)))} />
                )}
              </div>
            ))}
            <button className="btn-discret btn-petit" onClick={() => setPaiements((x) => [...x, { mode_paiement: '', montant: reste > 0 ? String(reste) : '', reference_transaction: '' }])}><Plus size={14} /> {' '}{t('Ajouter un mode de paiement')}</button>
            <p className={`text-sm ${Math.abs(reste) < 0.005 ? 'text-emerald-700' : 'text-red-700'}`}>
              {Math.abs(reste) < 0.005 ? t('Le montant couvre exactement le total.') : reste > 0 ? t('Reste à encaisser : {montant}', { montant: formaterMontant(reste) }) : t('Trop-perçu : {montant} (le total des paiements doit être égal au total)', { montant: formaterMontant(-reste) })}
            </p>
          </div>
          {especes > 0 && (
            <div className="grid grid-cols-2 items-end gap-3">
              <div><label className="etiquette">{t('Montant remis par le client (espèces)')}</label><input className="champ" type="number" min={0} step="0.01" value={montantRecu} onChange={(e) => setMontantRecu(e.target.value)} /></div>
              <p className="pb-2 text-sm">{t('Rendu :')}{' '}<strong className={rendu != null && rendu < 0 ? 'text-red-700' : ''}>{rendu != null ? formaterMontant(rendu) : '—'}</strong></p>
            </div>
          )}
        </div>
      </Modale>

      <RecuImpression recu={recu} onFermer={() => { setRecu(null); champRecherche.current?.focus() }} />
    </div>
  )
}
