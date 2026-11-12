import { BadgeCheck, Copy, KeyRound, MessageCircle } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { Badge } from '../composants/Badge'
import { MessageErreur } from '../composants/EnTetePage'
import { useNotifier } from '../composants/Notifications'
import { api } from '../services/api'
import { EtatLicence, EVENEMENT_LICENCE, lienWhatsappLicence, lireLicence, NOM_LOGICIEL, StatutLicence } from '../services/licence'
import { extraireErreur } from '../utilitaires/erreurs'
import { formaterDate } from '../utilitaires/formatage'

const STATUTS: Record<StatutLicence, [string, 'vert' | 'orange' | 'rouge' | 'gris']> = {
  ACTIVE: ['Active', 'vert'], EXPIRE_BIENTOT: ['Expire bientôt', 'orange'], GRACE: ['Expirée — délai de grâce', 'orange'],
  EXPIREE: ['Expirée', 'rouge'], NON_ACTIVEE: ['Non activée', 'gris'], INVALIDE: ['Invalide', 'rouge'], HORLOGE: ['Date du PC incorrecte', 'rouge'],
}
const PLANS = { MENSUEL: 'Mensuel', ANNUEL: 'Annuel', ESSAI: "Période d'essai" }

export function Licence() {
  const notifier = useNotifier()
  const [etat, setEtat] = useState<EtatLicence | null>(null)
  const [cle, setCle] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => { lireLicence().then(setEtat).catch((e) => setErreur(extraireErreur(e))) }, [])

  const copier = async () => {
    if (!etat) return
    try { await navigator.clipboard.writeText(etat.empreinte); notifier.succes('Code du PC copié.') }
    catch { notifier.erreur('Copie impossible : recopiez le code à la main.') }
  }

  const activer = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreur(null)
    try {
      const { data } = await api.post<EtatLicence>('/licence/activer/', { cle })
      setEtat(data); setCle('')
      window.dispatchEvent(new Event(EVENEMENT_LICENCE))
      notifier.succes(`Licence activée jusqu'au ${formaterDate(data.fin)}.`)
    } catch (err) { setErreur(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  if (!etat) return erreur ? <MessageErreur message={erreur} /> : <p className="text-sm text-slate-500">Chargement…</p>
  const [libelle, ton] = STATUTS[etat.statut]
  const whatsapp = lienWhatsappLicence(etat)

  return (
    <div className="max-w-3xl space-y-4">
      <div className="carte p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Logiciel</p>
            <p className="text-lg font-semibold">{NOM_LOGICIEL} <span className="text-sm font-normal text-slate-500">— un produit {etat.editeur.nom}</span></p>
          </div>
          <Badge ton={ton}>{libelle}</Badge>
        </div>
        {etat.message && <p className={`mt-3 rounded-md px-3 py-2 text-sm ${etat.lecture_seule ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>{etat.message}</p>}
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Pharmacie</dt><dd className="font-medium">{etat.client ?? '—'}</dd></div>
          <div><dt className="text-slate-500">Abonnement</dt><dd className="font-medium">{etat.plan ? PLANS[etat.plan] : '—'}</dd></div>
          <div><dt className="text-slate-500">Valable du</dt><dd className="font-medium">{etat.debut ? formaterDate(etat.debut) : '—'}</dd></div>
          <div><dt className="text-slate-500">Jusqu'au</dt><dd className="font-medium">{etat.fin ? `${formaterDate(etat.fin)}${etat.jours_restants != null && etat.jours_restants >= 0 ? ` (${etat.jours_restants} jours)` : ''}` : '—'}</dd></div>
        </dl>
      </div>

      <div className="carte space-y-3 p-5">
        <p className="text-sm font-semibold">Code de ce PC</p>
        <p className="text-sm text-slate-600">Communiquez ce code à {etat.editeur.nom} pour recevoir ou renouveler votre licence. Chaque licence ne fonctionne que sur ce PC.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-base font-semibold tracking-wider">{etat.empreinte}</code>
          <button type="button" className="btn-secondaire btn-petit" onClick={copier}><Copy size={14} /> Copier</button>
          {whatsapp && <a className="btn-succes btn-petit" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Envoyer par WhatsApp</a>}
        </div>
        {(etat.editeur.telephone || etat.editeur.email) && (
          <p className="text-xs text-slate-500">{etat.editeur.nom} : {[etat.editeur.telephone, etat.editeur.email, etat.editeur.site].filter(Boolean).join(' · ')}</p>
        )}
      </div>

      <form onSubmit={activer} className="carte space-y-3 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={16} /> Activer ou renouveler</p>
        <MessageErreur message={erreur} />
        <textarea className="champ min-h-[96px] font-mono text-xs" placeholder="Collez ici la clé reçue (elle commence par RQM1.)"
          value={cle} onChange={(e) => setCle(e.target.value)} required aria-label="Clé de licence" />
        <button className="btn-primaire" disabled={envoi || !cle.trim()}><BadgeCheck size={16} /> {envoi ? 'Vérification…' : 'Activer la licence'}</button>
      </form>
    </div>
  )
}
