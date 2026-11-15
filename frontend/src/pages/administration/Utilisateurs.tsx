import { KeyRound, ShieldCheck } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { Badge } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { PageCrud } from '../../composants/PageCrud'
import { t } from '../../i18n'
import { api } from '../../services/api'
import { EtatLicence, lireLicence } from '../../services/licence'
import type { ReponsePaginee, Role, Utilisateur } from '../../types'
import { desactiverEnMasse } from '../../utilitaires/actionsMasse'
import { extraireErreur } from '../../utilitaires/erreurs'
import { libelleRole } from '../../utilitaires/formatage'

/** Les quatre rôles, chacun expliqué en une phrase. */
const ROLES: { code: Role; description: string; ton: 'bleu' | 'vert' | 'orange' | 'gris' }[] = [
  { code: 'ADMIN', description: 'Voit et fait tout : argent, prix, personnel.', ton: 'bleu' },
  { code: 'PHARMACIEN', description: 'Vend, gère le stock et approuve les annulations. Ne voit pas vos marges et ne change pas les prix.', ton: 'vert' },
  { code: 'CAISSIER', description: 'Vend et encaisse, rien d\'autre.', ton: 'orange' },
  { code: 'MAGASINIER', description: 'Reçoit les marchandises, fait les inventaires, retire les produits périmés.', ton: 'gris' },
]
const tonRole = (role: Role) => ROLES.find((r) => r.code === role)?.ton ?? 'gris'
const peutApprouver = (role: Role) => role === 'ADMIN' || role === 'PHARMACIEN'

export default function Utilisateurs() {
  const notifier = useNotifier()
  const [licence, setLicence] = useState<EtatLicence | null>(null)
  const [actifs, setActifs] = useState<number | null>(null)
  const [cible, setCible] = useState<Utilisateur | null>(null)
  const [motDePasse, setMotDePasse] = useState('')
  const [ciblePin, setCiblePin] = useState<Utilisateur | null>(null)
  const [pin, setPin] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    lireLicence().then(setLicence).catch(() => undefined)
    api.get<ReponsePaginee<Utilisateur>>('/utilisateurs/', { params: { taille_page: 500 } })
      .then((r) => setActifs(r.data.resultats.filter((u) => u.actif).length)).catch(() => undefined)
  }, [version])

  const offre = licence?.offre_details
  const rolesOffre = offre?.roles ?? ROLES.map((r) => r.code)

  const reinitialiser = async (e: FormEvent) => {
    e.preventDefault()
    if (!cible) return
    try {
      await api.post(`/utilisateurs/${cible.id}/reinitialiser-mot-de-passe/`, { mot_de_passe: motDePasse })
      notifier.succes(t('Mot de passe de {nom} réinitialisé.', { nom: cible.nom_complet }))
      setCible(null); setMotDePasse(''); setErreur(null)
    } catch (err) { setErreur(extraireErreur(err)) }
  }

  const enregistrerPin = async (e: FormEvent | null, supprimer = false) => {
    e?.preventDefault()
    if (!ciblePin) return
    try {
      await api.post(`/utilisateurs/${ciblePin.id}/definir-pin/`, { code_pin: supprimer ? '' : pin })
      notifier.succes(supprimer ? t('Code PIN supprimé.') : t('Code PIN de {nom} enregistré.', { nom: ciblePin.nom_complet }))
      setCiblePin(null); setPin(''); setErreur(null); setVersion((v) => v + 1)
    } catch (err) { setErreur(extraireErreur(err)) }
  }

  return (
    <>
      {offre && (
        <div className="carte mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="flex items-center gap-2 text-sm">
            <ShieldCheck size={18} className="text-marque-600" />
            <span>{t('Votre offre :')}{' '}<strong className="text-nuit-800">{t(offre.nom)}</strong></span>
            {offre.max_utilisateurs != null && actifs != null && (
              <Badge ton={actifs >= offre.max_utilisateurs ? 'orange' : 'vert'}>
                {t('{n} / {max} comptes actifs', { n: actifs, max: offre.max_utilisateurs })}
              </Badge>
            )}
          </p>
          <p className="text-xs text-slate-500">{t('Pour plus de comptes ou de rôles, passez à l\'offre supérieure auprès de Rawafid Digital Services.')}</p>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => {
          const inclus = rolesOffre.includes(r.code)
          return (
            <div key={r.code} className={`carte p-4 ${inclus ? '' : 'opacity-50'}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <Badge ton={r.ton}>{libelleRole(r.code)}</Badge>
                {!inclus && <span className="text-xs text-slate-500">{t('Offre supérieure')}</span>}
              </div>
              <p className="text-sm text-slate-600">{t(r.description)}</p>
            </div>
          )
        })}
      </div>

      <PageCrud<Utilisateur>
        key={version}
        titre={t('Utilisateurs')} description={t('Un compte par personne : chacun ne voit que ce qui le concerne, et tout est tracé.')}
        endpoint="/utilisateurs/" nomElement={t('Utilisateur')} libelleNouveau={t('Nouvel utilisateur')} placeholderRecherche={t('Nom ou identifiant…')}
        actionsMasse={[{ libelle: t('Désactiver'), danger: true, confirmation: t('Désactiver les comptes sélectionnés ?'), executer: desactiverEnMasse<Utilisateur>('/utilisateurs/', 'actif', (u) => u.nom_complet) }]}
        colonnes={[
          { cle: 'nom_complet', titre: t('Nom'), tri: 'nom', rendu: (u) => <span className="font-medium">{u.nom_complet}</span> },
          { cle: 'identifiant', titre: t('Identifiant'), tri: 'identifiant' },
          { cle: 'role', titre: t('Rôle'), tri: 'role', rendu: (u) => <Badge ton={tonRole(u.role)}>{libelleRole(u.role)}</Badge> },
          { cle: 'pin', titre: t('Code PIN'), rendu: (u) => (peutApprouver(u.role)
            ? <Badge ton={u.pin_defini ? 'vert' : 'orange'}>{u.pin_defini ? t('Défini') : t('À définir')}</Badge>
            : <span className="text-slate-400">—</span>) },
          { cle: 'telephone', titre: t('Téléphone'), cacheParDefaut: true },
          { cle: 'actif', titre: t('État'), rendu: (u) => <Badge ton={u.actif ? 'vert' : 'gris'}>{u.actif ? t('Actif') : t('Désactivé')}</Badge> },
        ]}
        champs={[
          { nom: 'identifiant', libelle: t('Identifiant'), type: 'texte', requis: true, desactiveEnEdition: true },
          { nom: 'prenom', libelle: t('Prénom'), type: 'texte' },
          { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
          { nom: 'role', libelle: t('Rôle'), type: 'select', requis: true, defaut: 'CAISSIER',
            aide: t('Propriétaire : tout. Pharmacien : vente + stock + approbations. Vendeur : vente. Magasinier : stock.'),
            options: ROLES.filter((r) => rolesOffre.includes(r.code)).map((r) => ({ valeur: r.code, libelle: libelleRole(r.code) })) },
          { nom: 'email', libelle: t('E-mail'), type: 'email' },
          { nom: 'telephone', libelle: t('Téléphone'), type: 'texte' },
          { nom: 'mot_de_passe', libelle: t('Mot de passe'), type: 'motdepasse', requis: true, aide: t('8 caractères minimum.'), masque: (_f, enEdition) => !enEdition },
          { nom: 'actif', libelle: t('État'), type: 'case', aide: t('Compte actif'), defaut: true },
        ]}
        actionsLigne={(u) => (
          <>
            {peutApprouver(u.role) && (
              <button className="btn-discret btn-petit" onClick={() => { setCiblePin(u); setPin(''); setErreur(null) }}>
                <ShieldCheck size={14} />{' '}{t('Code PIN')}
              </button>
            )}
            <button className="btn-discret btn-petit" onClick={() => { setCible(u); setErreur(null) }}><KeyRound size={14} />{' '}{t('Mot de passe')}</button>
          </>
        )}
      />

      <Modale ouverte={!!cible} titre={t('Réinitialiser le mot de passe — {nom}', { nom: cible?.nom_complet ?? '' })} onFermer={() => setCible(null)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setCible(null)}>{t('Annuler')}</button><button className="btn-primaire" type="submit" form="formulaire-reinit">{t('Réinitialiser')}</button></>}>
        <form id="formulaire-reinit" onSubmit={reinitialiser} className="space-y-3">
          <MessageErreur message={erreur} />
          <Champ libelle={t('Nouveau mot de passe')} aide={t('8 caractères minimum. Communiquez-le à l\'utilisateur de manière sûre.')}>
            <input className="champ" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} minLength={8} autoComplete="new-password" required />
          </Champ>
        </form>
      </Modale>

      <Modale ouverte={!!ciblePin} titre={t('Code PIN d\'approbation — {nom}', { nom: ciblePin?.nom_complet ?? '' })} onFermer={() => setCiblePin(null)} largeur="petite"
        pied={<>
          {ciblePin?.pin_defini && <button className="btn-discret text-red-600" onClick={() => enregistrerPin(null, true)}>{t('Supprimer le code')}</button>}
          <button className="btn-secondaire" onClick={() => setCiblePin(null)}>{t('Annuler')}</button>
          <button className="btn-primaire" type="submit" form="formulaire-pin">{t('Enregistrer')}</button>
        </>}>
        <form id="formulaire-pin" onSubmit={(e) => enregistrerPin(e)} className="space-y-3">
          <p className="text-sm text-slate-600">{t('Ce code permet d\'approuver sur place, sur l\'écran d\'un vendeur, une opération sensible comme l\'annulation d\'une vente. Il ne doit être connu que de cette personne.')}</p>
          <MessageErreur message={erreur} />
          <Champ libelle={t('Nouveau code PIN')} aide={t('4 à 6 chiffres.')}>
            <input className="champ max-w-[180px] text-center text-lg tracking-[0.5em]" type="password" inputMode="numeric" pattern="\d{4,6}"
              maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" required dir="ltr" />
          </Champ>
        </form>
      </Modale>
    </>
  )
}
