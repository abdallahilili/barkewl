import { ArrowRight, BarChart3, Boxes, Lock, Pill, ShieldCheck, ShoppingCart, Truck, User } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { MessageErreur } from '../composants/EnTetePage'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { extraireErreur } from '../utilitaires/erreurs'

export default function Connexion() {
  const { connecter } = useAuth()
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [identite, setIdentite] = useState<{ nom: string; logo: string } | null>(null)

  useEffect(() => {
    api.get<{ nom: string; logo: string }>('/identite-pharmacie/').then((r) => setIdentite(r.data)).catch(() => undefined)
  }, [])

  const soumettre = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreur(null)
    try { await connecter(identifiant.trim(), motDePasse) }
    catch (err) { setErreur(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  const nomPharmacie = identite?.nom || 'Gestion de pharmacie'

  return (
    <div className="flex min-h-screen items-stretch bg-slate-100">
      {/* Panneau de marque (masqué sur mobile) */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-marque-600/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 translate-y-1/3 rounded-full bg-marque-500/10 blur-3xl" />
          <Pill className="absolute -right-6 top-1/3 h-40 w-40 rotate-12 text-white/5" strokeWidth={1} />
        </div>

        <div className="relative flex items-center gap-3">
          {identite?.logo ? (
            <img src={identite.logo} alt="Logo" className="h-12 w-12 rounded-xl bg-white/95 object-contain p-1.5" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-marque-600 text-white"><Pill size={26} /></span>
          )}
          <span className="text-lg font-semibold text-white">{nomPharmacie}</span>
        </div>

        <div className="relative max-w-md space-y-7 text-white">
          <h2 className="text-3xl font-bold leading-tight xl:text-4xl">Gérez votre pharmacie, simplement.</h2>
          <p className="text-slate-300">Tout ce qu'il faut pour faire tourner votre officine, réuni dans un seul outil.</p>
          <ul className="space-y-4 text-sm text-slate-200">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marque-500/20 text-marque-300"><ShoppingCart size={16} /></span>
              Ventes au comptoir et gestion des sessions de caisse
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marque-500/20 text-marque-300"><Boxes size={16} /></span>
              Stock multi-dépôts avec alertes de péremption
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marque-500/20 text-marque-300"><Truck size={16} /></span>
              Achats fournisseurs et suivi des règlements
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marque-500/20 text-marque-300"><BarChart3 size={16} /></span>
              Rapports et tableau de bord en temps réel
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">© {new Date().getFullYear()} {nomPharmacie}</p>
      </div>

      {/* Formulaire */}
      <div className="relative flex w-full flex-col items-center justify-center overflow-hidden p-4 lg:w-1/2">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-marque-100/60 blur-3xl" />
          <div className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-marque-50 blur-3xl lg:hidden" />
        </div>

        <div className="relative w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center lg:hidden">
            {identite?.logo ? (
              <img src={identite.logo} alt="Logo" className="h-14 w-14 rounded-xl object-contain" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-marque-600 text-white"><Pill size={28} /></span>
            )}
            <h1 className="text-xl font-semibold text-slate-900">{nomPharmacie}</h1>
          </div>

          <div className="relative rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-300/30">
            <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-marque-600 via-marque-500 to-marque-700" />

            <div className="flex flex-col items-center px-6 pb-7 pt-8 text-center sm:px-8">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-marque-50 text-marque-700 ring-4 ring-marque-50/60">
                <Lock size={20} />
              </span>
              <h1 className="text-xl font-bold text-slate-900">Bon retour</h1>
              <p className="mt-1 text-sm text-slate-500">Connectez-vous pour accéder à votre espace.</p>

              <form onSubmit={soumettre} className="mt-6 w-full space-y-4 text-left">
                <MessageErreur message={erreur} />
                <div>
                  <label className="etiquette" htmlFor="identifiant">Identifiant</label>
                  <div className="relative">
                    <User size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input id="identifiant" className="champ bg-slate-50 py-2.5 pl-10" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="username" autoFocus required />
                  </div>
                </div>
                <div>
                  <label className="etiquette" htmlFor="mot-de-passe">Mot de passe</label>
                  <div className="relative">
                    <Lock size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input id="mot-de-passe" className="champ bg-slate-50 py-2.5 pl-10" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="current-password" required />
                  </div>
                </div>
                <button className="btn-primaire group w-full py-2.5" disabled={envoi}>
                  {envoi ? 'Connexion…' : <>Se connecter <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /></>}
                </button>
              </form>
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <ShieldCheck size={14} /> Accès réservé au personnel autorisé de la pharmacie.
          </p>
        </div>
      </div>
    </div>
  )
}
