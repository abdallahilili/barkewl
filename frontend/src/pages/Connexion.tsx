import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { BoutonAssistance } from '../composants/BoutonAssistance'
import { ChoixLangue } from '../composants/ChoixLangue'
import { MessageErreur } from '../composants/EnTetePage'
import { LogoRaqeem, SymboleRaqeem } from '../composants/LogoRaqeem'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import { EDITEUR_PAR_DEFAUT, EtatLicence, lireLicence, NOM_LOGICIEL } from '../services/licence'
import { extraireErreur } from '../utilitaires/erreurs'

import { t, traduireServeur } from '../i18n'

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
  const editeur = licence?.editeur.nom ?? EDITEUR_PAR_DEFAUT

  return (
    <div className="flex min-h-screen items-stretch bg-white">
      {/* ── Formulaire ── */}
      <div className="relative flex w-full flex-col lg:w-1/2">
        <div className="flex items-center justify-between gap-3 p-4 sm:p-6">
          <BoutonAssistance pharmacie={identite?.nom} />
          <ChoixLangue />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-8">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center text-center">
              {identite?.logo
                ? <img src={identite.logo} alt="" className="mb-3 h-20 w-20 rounded-2xl object-contain" />
                : <span className="mb-3"><SymboleRaqeem taille={72} /></span>}
              <p className="text-sm font-semibold text-marque-700">{nomPharmacie}</p>
              <h1 className="mt-4 text-3xl font-bold text-nuit-800">{t('Connexion')}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{t('Saisissez vos identifiants pour accéder au système.')}</p>
            </div>

            <form onSubmit={soumettre} className="space-y-5">
              <MessageErreur message={erreur} />
              <div>
                <label className="etiquette" htmlFor="identifiant">{t('Identifiant')}</label>
                <div className="relative">
                  <User size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input id="identifiant" className="champ rounded-xl py-3 ps-11" placeholder={t('Votre identifiant')} value={identifiant}
                    onChange={(e) => setIdentifiant(e.target.value)} autoComplete="username" autoFocus required />
                </div>
              </div>
              <div>
                <label className="etiquette" htmlFor="mot-de-passe">{t('Mot de passe')}</label>
                <div className="relative">
                  <Lock size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="mot-de-passe"
                    className="champ rounded-xl py-3 pe-11 ps-11"
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
                    className="absolute end-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={afficherMotDePasse ? t('Masquer le mot de passe') : t('Afficher le mot de passe')}
                    tabIndex={-1}
                  >
                    {afficherMotDePasse ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button className="btn group w-full rounded-xl bg-nuit-800 py-3 text-base font-semibold text-white shadow-lg shadow-nuit-800/20 hover:bg-nuit-700" disabled={envoi}>
                {envoi ? t('Connexion…') : <>{t('Se connecter')} <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" /></>}
              </button>
            </form>

            {licence && licence.statut !== 'ACTIVE' && (
              <div className={`mt-5 rounded-xl border px-3 py-2 text-xs ${licence.lecture_seule ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                <p>{traduireServeur(licence.message)}</p>
                <p className="mt-1">{t('Code du PC :')} <strong className="tracking-wider">{licence.empreinte}</strong></p>
              </div>
            )}

            <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
              <ShieldCheck size={14} /> {t('Accès réservé au personnel autorisé de la pharmacie.')}
            </p>
          </div>
        </div>

        {/* Pied : le copyright de l'éditeur, centré (l'assistance est dans le menu en haut). */}
        <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-500 sm:px-6">
          <SymboleRaqeem taille={22} />
          <span>{t('Tous droits réservés à Rawafid Digital Services © {annee}', { annee: new Date().getFullYear() })}</span>
        </div>
      </div>

      {/* ── Panneau de marque (masqué sur mobile) : fond uni, le logo en grand occupe tout l'espace ── */}
      <div className="hidden w-1/2 items-center justify-center bg-nuit-800 p-12 lg:flex">
        <LogoRaqeem taille={150} fond="sombre" grand />
      </div>
    </div>
  )
}
