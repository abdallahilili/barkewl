import { ArrowRight, BarChart3, Boxes, Eye, EyeOff, Lock, Pill, ShieldCheck, ShoppingCart, Truck, User } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { MessageErreur } from '../composants/EnTetePage'
import { ChoixLangue } from '../composants/ChoixLangue'
import { LogoRaqeem, SymboleRaqeem } from '../composants/LogoRaqeem'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { EDITEUR_PAR_DEFAUT, EtatLicence, lireLicence, NOM_LOGICIEL } from '../services/licence'
import { extraireErreur } from '../utilitaires/erreurs'

import { estArabe, t } from '../i18n'
export default function Connexion() {
  const { connecter } = useAuth()
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [afficherMotDePasse, setAfficherMotDePasse] = useState(false)
  const [identite, setIdentite] = useState<{ nom: string; logo: string } | null>(null)

  const [licence, setLicence] = useState<EtatLicence | null>(null)

  useEffect(() => {
    api.get<{ nom: string; logo: string }>('/identite-pharmacie/').then((r) => setIdentite(r.data)).catch(() => undefined)
    lireLicence().then(setLicence).catch(() => undefined)
  }, [])

  const soumettre = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreur(null)
    try { await connecter(identifiant.trim(), motDePasse) }
    catch (err) { setErreur(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  const nomPharmacie = identite?.nom || t('Gestion de pharmacie')

  return (
    <div className="flex min-h-screen items-stretch bg-slate-100">
      {/* Panneau de marque (masqué sur mobile) */}
      <div className="relative hidden w-1/2 overflow-hidden bg-nuit-800 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute -bottom-24 -end-24 opacity-[0.07]" aria-hidden="true">
          <SymboleRaqeem taille={460} fond="sombre" />
        </div>

        <div className="relative">
          <LogoRaqeem taille={52} fond="sombre" />
        </div>

        <div className="relative max-w-md space-y-7 text-white">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold leading-tight text-white xl:text-4xl">{t('La gestion intelligente de votre pharmacie.')}</h2>
            {/* Le slogan dans l'autre langue de la marque, en écho au titre. */}
            {estArabe()
              ? <p lang="fr" dir="ltr" className="text-lg font-semibold text-marque-300">La gestion intelligente de votre pharmacie.</p>
              : <p lang="ar" dir="rtl" className="text-xl font-semibold text-marque-300">إدارة صيدليتك بذكاء</p>}
          </div>
          <p className="text-nuit-100">{t('Ventes, stock, achats et caisse réunis dans un seul système fiable — même sans Internet.')}</p>
          <ul className="space-y-4 text-sm text-slate-200">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marque-500/20 text-marque-300"><ShoppingCart size={16} /></span>
              
              {t('Vente à la boîte, à la plaquette ou à l\'unité, et caisse sans écart')}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marque-500/20 text-marque-300"><Boxes size={16} /></span>
              
              {t('Stock multi-dépôts avec alertes de péremption')}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marque-500/20 text-marque-300"><Truck size={16} /></span>
              
              {t('Achats fournisseurs et suivi des règlements')}
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marque-500/20 text-marque-300"><BarChart3 size={16} /></span>
              
              {t('Rapports et tableau de bord en temps réel')}
            </li>
          </ul>
        </div>

        <div className="relative flex items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs text-nuit-200">
          <span className="flex items-center gap-2.5">
            {identite?.logo && <img src={identite.logo} alt="" className="h-8 w-8 rounded-md bg-white object-contain p-1" />}
            <span className="font-medium text-white">{nomPharmacie}</span>
          </span>
          <span>© {new Date().getFullYear()} {NOM_LOGICIEL} · {licence?.editeur.nom ?? EDITEUR_PAR_DEFAUT}</span>
        </div>
      </div>

      {/* Formulaire */}
      <div className="relative flex w-full flex-col items-center justify-center overflow-hidden p-4 lg:w-1/2">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -end-32 -top-32 h-80 w-80 rounded-full bg-marque-100/60 blur-3xl" />
          <div className="absolute -bottom-32 -start-16 h-72 w-72 rounded-full bg-marque-50 blur-3xl lg:hidden" />
        </div>

        <div className="absolute end-4 top-4 z-10">
          <ChoixLangue />
        </div>
        <div className="relative w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center lg:hidden">
            <LogoRaqeem taille={44} compact />
            <p className="text-sm font-medium text-slate-600">{nomPharmacie}</p>
          </div>

          <div className="relative rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-300/30">
            <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-marque-600 via-marque-500 to-marque-700" />

            <div className="flex flex-col items-center px-6 pb-7 pt-8 text-center sm:px-8">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-marque-50 text-marque-700 ring-4 ring-marque-50/60">
                <Lock size={20} />
              </span>
              <h1 className="text-xl font-bold text-nuit-800">{t('Bon retour')}</h1>
              <p className="mt-1 text-sm text-slate-500">{t('Connectez-vous à')}{' '}<span className="font-medium text-nuit-800">{nomPharmacie}</span>.</p>

              <form onSubmit={soumettre} className="mt-6 w-full space-y-4 text-start">
                <MessageErreur message={erreur} />
                <div>
                  <label className="etiquette" htmlFor="identifiant">{t('Identifiant')}</label>
                  <div className="relative">
                    <User size={17} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input id="identifiant" className="champ bg-slate-50 py-2.5 ps-10" placeholder={t('Votre identifiant')} value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="username" autoFocus required />
                  </div>
                </div>
                <div>
                  <label className="etiquette" htmlFor="mot-de-passe">{t('Mot de passe')}</label>
                  <div className="relative">
                    <Lock size={17} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      id="mot-de-passe"
                      className="champ bg-slate-50 py-2.5 ps-10 pe-10"
                      type={afficherMotDePasse ? 'text' : 'password'}
                      placeholder={t('Votre mot de passe')}
                      value={motDePasse}
                      onChange={(e) => setMotDePasse(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setAfficherMotDePasse((v) => !v)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={afficherMotDePasse ? t('Masquer le mot de passe') : t('Afficher le mot de passe')}
                      tabIndex={-1}
                    >
                      {afficherMotDePasse ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
                <button className="btn-primaire group w-full py-2.5" disabled={envoi}>
                  {envoi ? t('Connexion…') : <>{t('Se connecter')}{' '}<ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" /></>}
                </button>
              </form>
            </div>
          </div>

          {licence && licence.statut !== 'ACTIVE' && (
            <div className={`mt-4 rounded-lg border px-3 py-2 text-xs ${licence.lecture_seule ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              <p>{licence.message}</p>
              <p className="mt-1">{t('Code du PC :')}{' '}<strong className="tracking-wider">{licence.empreinte}</strong></p>
            </div>
          )}

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <ShieldCheck size={14} /> {' '}{t('Accès réservé au personnel autorisé de la pharmacie.')}
          </p>
          <p className="mt-2 text-center text-xs text-slate-500 lg:hidden">{NOM_LOGICIEL} {' '}{t('— par')}{' '}{licence?.editeur.nom ?? EDITEUR_PAR_DEFAUT}</p>
        </div>
      </div>
    </div>
  )
}
