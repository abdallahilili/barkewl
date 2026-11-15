import { AlertTriangle, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { EtatLicence, EVENEMENT_LICENCE, lienWhatsappLicence, lireLicence } from '../services/licence'

import { t, traduireServeur } from '../i18n'
/** Bandeau en haut de chaque page quand la licence expire bientôt, a expiré ou n'est pas activée. */
export function BandeauLicence() {
  const { utilisateur } = useAuth()
  const [etat, setEtat] = useState<EtatLicence | null>(null)

  useEffect(() => {
    const charger = () => { lireLicence().then(setEtat).catch(() => undefined) }
    charger()
    const minuteur = window.setInterval(charger, 10 * 60 * 1000)
    window.addEventListener(EVENEMENT_LICENCE, charger)
    return () => { window.clearInterval(minuteur); window.removeEventListener(EVENEMENT_LICENCE, charger) }
  }, [])

  if (!etat || etat.statut === 'ACTIVE') return null
  const bloque = etat.lecture_seule
  const whatsapp = lienWhatsappLicence(etat)
  const contact = [etat.editeur.telephone && t('Tél. {telephone}', { telephone: etat.editeur.telephone }), etat.editeur.email].filter(Boolean).join(' · ')

  return (
    <div className={`sans-impression border-b px-4 py-2.5 text-sm ${bloque ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`} role="alert">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2">
        <p className="flex items-start gap-2">
          {bloque ? <Lock size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span>
            {bloque && <strong>{t('Mode consultation —')}{' '}</strong>}{traduireServeur(etat.message)}
            {contact && <span className="ms-1 opacity-80">{etat.editeur.nom} : {contact}</span>}
          </span>
        </p>
        <div className="flex gap-2">
          {whatsapp && <a className="btn-secondaire btn-petit" href={whatsapp} target="_blank" rel="noreferrer">{t('Contacter par WhatsApp')}</a>}
          {utilisateur?.role === 'ADMIN' && (
            <Link to="/administration/parametres" state={{ onglet: 'licence' }} className="btn-primaire btn-petit">
              {etat.statut === 'NON_ACTIVEE' ? t('Activer') : t('Saisir une nouvelle clé')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
