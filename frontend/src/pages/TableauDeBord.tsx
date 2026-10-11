import { AlertTriangle } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../composants/Badge'
import { Chargement, EnTetePage, MessageErreur } from '../composants/EnTetePage'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import type { MouvementStock, Vente } from '../types'
import { extraireErreur } from '../utilitaires/erreurs'
import { formaterDate, formaterDateHeure, formaterMontant, formaterNombre } from '../utilitaires/formatage'

interface Donnees {
  ventes_aujourdhui?: { nombre: number; total: number }
  achats_aujourdhui?: { nombre: number; total: number }
  dettes_fournisseurs?: number
  dernieres_ventes?: Vente[]
  session_caisse?: { id: number; caisse: string; date_ouverture: string; montant_attendu: number } | null
  stock?: { valeur_totale?: number; nombre_ruptures: number; nombre_stock_faible: number; nombre_bientot_perimes: number; nombre_perimes: number; nombre_medicaments?: number }
  alertes?: {
    stock_faible: { medicament_id: number; medicament: string; stock: number; minimum: number }[]
    ruptures: { medicament_id: number; medicament: string }[]
    peremption_proche: { lot_id: number; medicament: string; numero_lot: string; depot: string; quantite: number; date_peremption: string; jours_restants: number }[]
    perimes: { lot_id: number; medicament: string; numero_lot: string; depot: string; quantite: number; date_peremption: string }[]
  }
  derniers_mouvements?: MouvementStock[]
}

function Indicateur({ titre, valeur, detail, ton = '', vers }: { titre: string; valeur: string; detail?: string; ton?: string; vers?: string }) {
  const contenu = (
    <div className="carte h-full p-4">
      <p className="text-sm text-slate-500">{titre}</p>
      <p className={`mt-1 text-2xl font-semibold ${ton}`}>{valeur}</p>
      {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
    </div>
  )
  return vers ? <Link to={vers} className="block hover:opacity-90">{contenu}</Link> : contenu
}

function Panneau({ titre, vers, children }: { titre: string; vers?: string; children: ReactNode }) {
  return (
    <section className="carte">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-semibold">{titre}</h2>{vers && <Link to={vers} className="lien text-xs">Tout voir</Link>}</div>
      <div className="p-4 text-sm">{children}</div>
    </section>
  )
}

export default function TableauDeBord() {
  const { utilisateur, peut } = useAuth()
  const [donnees, setDonnees] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    api.get<Donnees>('/tableau-de-bord/').then((r) => setDonnees(r.data)).catch((e) => setErreur(extraireErreur(e)))
  }, [])

  if (!donnees) return erreur ? <MessageErreur message={erreur} /> : <Chargement />
  const s = donnees.stock
  const a = donnees.alertes
  const vide = <p className="text-slate-500">Rien à signaler.</p>

  return (
    <div>
      <EnTetePage titre={`Bonjour ${utilisateur?.prenom || utilisateur?.nom}`} description={`Situation du ${formaterDate(new Date().toISOString().slice(0, 10))}`} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {donnees.ventes_aujourdhui && <Indicateur titre="Ventes du jour" valeur={formaterMontant(donnees.ventes_aujourdhui.total)} detail={`${donnees.ventes_aujourdhui.nombre} vente(s)`} vers={peut('ventes') ? '/ventes' : undefined} />}
        {donnees.achats_aujourdhui && <Indicateur titre="Achats du jour" valeur={formaterMontant(donnees.achats_aujourdhui.total)} detail={`${donnees.achats_aujourdhui.nombre} achat(s)`} vers="/achats" />}
        {donnees.dettes_fournisseurs != null && <Indicateur titre="Dettes fournisseurs" valeur={formaterMontant(donnees.dettes_fournisseurs)} ton={donnees.dettes_fournisseurs > 0 ? 'text-red-700' : ''} vers="/achats" />}
        {s?.valeur_totale != null && <Indicateur titre="Valeur du stock" valeur={formaterMontant(s.valeur_totale)} detail={`${formaterNombre(s.nombre_medicaments)} médicaments`} vers="/stock" />}
        {s && <Indicateur titre="Ruptures" valeur={formaterNombre(s.nombre_ruptures)} ton={s.nombre_ruptures ? 'text-red-700' : ''} vers={peut('stock_etat') ? '/stock' : undefined} />}
        {s && <Indicateur titre="Stock faible" valeur={formaterNombre(s.nombre_stock_faible)} ton={s.nombre_stock_faible ? 'text-amber-700' : ''} vers="/stock" />}
        {s && <Indicateur titre="Bientôt périmés" valeur={formaterNombre(s.nombre_bientot_perimes)} ton={s.nombre_bientot_perimes ? 'text-amber-700' : ''} vers="/stock" />}
        {s && <Indicateur titre="Périmés en stock" valeur={formaterNombre(s.nombre_perimes)} ton={s.nombre_perimes ? 'text-red-700' : ''} vers="/stock" />}
      </div>

      {donnees.session_caisse !== undefined && (
        <div className="mb-5">
          {donnees.session_caisse ? (
            <div className="carte flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm"><Badge ton="bleu">Session ouverte</Badge> <span className="ml-2">{donnees.session_caisse.caisse} depuis {formaterDateHeure(donnees.session_caisse.date_ouverture)} · espèces attendues : <strong>{formaterMontant(donnees.session_caisse.montant_attendu)}</strong></span></p>
              <div className="flex gap-2"><Link to="/ventes/nouvelle" className="btn-succes">Nouvelle vente</Link><Link to="/caisse" className="btn-secondaire">Voir la caisse</Link></div>
            </div>
          ) : (
            <div className="carte flex flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm text-amber-900"><AlertTriangle size={16} /> Aucune session de caisse ouverte : vous ne pouvez pas encaisser de vente.</p>
              <Link to="/caisse" className="btn-primaire">Ouvrir une session</Link>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {a && (
          <Panneau titre="Bientôt périmés" vers="/stock">
            {a.peremption_proche.length === 0 ? vide : <ul className="divide-y divide-slate-100">{a.peremption_proche.map((l) => <li key={l.lot_id + l.depot} className="flex justify-between gap-2 py-1.5"><span>{l.medicament} <span className="text-slate-500">— lot {l.numero_lot}, {l.quantite} u.</span></span><Badge ton="orange">{l.jours_restants} j</Badge></li>)}</ul>}
          </Panneau>
        )}
        {a && (
          <Panneau titre="Stock faible et ruptures" vers="/stock">
            {a.stock_faible.length + a.ruptures.length === 0 ? vide : (
              <ul className="divide-y divide-slate-100">
                {a.ruptures.map((r) => <li key={`r${r.medicament_id}`} className="flex justify-between gap-2 py-1.5"><span>{r.medicament}</span><Badge ton="rouge">Rupture</Badge></li>)}
                {a.stock_faible.map((r) => <li key={`f${r.medicament_id}`} className="flex justify-between gap-2 py-1.5"><span>{r.medicament}</span><Badge ton="orange">{r.stock} / min. {r.minimum}</Badge></li>)}
              </ul>
            )}
          </Panneau>
        )}
        {a && a.perimes.length > 0 && (
          <Panneau titre="Périmés à retirer du stock" vers="/stock/sorties">
            <ul className="divide-y divide-slate-100">{a.perimes.map((l) => <li key={l.lot_id + l.depot} className="flex justify-between gap-2 py-1.5"><span>{l.medicament} <span className="text-slate-500">— lot {l.numero_lot}, {l.quantite} u. ({l.depot})</span></span><Badge ton="rouge">{formaterDate(l.date_peremption)}</Badge></li>)}</ul>
          </Panneau>
        )}
        {donnees.dernieres_ventes && (
          <Panneau titre="Dernières ventes" vers={peut('ventes') ? '/ventes' : undefined}>
            {donnees.dernieres_ventes.length === 0 ? <p className="text-slate-500">Aucune vente aujourd'hui.</p> : <ul className="divide-y divide-slate-100">{donnees.dernieres_ventes.map((v) => <li key={v.id} className="flex justify-between gap-2 py-1.5"><span>{v.reference} <span className="text-slate-500">{formaterDateHeure(v.date_vente)}</span></span><span className="font-medium">{formaterMontant(v.total)}</span></li>)}</ul>}
          </Panneau>
        )}
        {donnees.derniers_mouvements && (
          <Panneau titre="Derniers mouvements de stock" vers="/stock/historique">
            {donnees.derniers_mouvements.length === 0 ? <p className="text-slate-500">Aucun mouvement.</p> : <ul className="divide-y divide-slate-100">{donnees.derniers_mouvements.map((m) => <li key={m.id} className="flex justify-between gap-2 py-1.5"><span>{m.medicament_nom} <span className="text-slate-500">— {m.type_libelle}</span></span><span className={`font-medium ${m.quantite > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{m.quantite > 0 ? '+' : ''}{m.quantite}</span></li>)}</ul>}
          </Panneau>
        )}
      </div>
    </div>
  )
}
