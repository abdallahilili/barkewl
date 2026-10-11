import { KeyRound } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Badge } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { PageCrud } from '../../composants/PageCrud'
import { api } from '../../services/api'
import type { Utilisateur } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { libelleRole } from '../../utilitaires/formatage'

export default function Utilisateurs() {
  const notifier = useNotifier()
  const [cible, setCible] = useState<Utilisateur | null>(null)
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const reinitialiser = async (e: FormEvent) => {
    e.preventDefault()
    if (!cible) return
    try {
      await api.post(`/utilisateurs/${cible.id}/reinitialiser-mot-de-passe/`, { mot_de_passe: motDePasse })
      notifier.succes(`Mot de passe de ${cible.nom_complet} réinitialisé.`)
      setCible(null); setMotDePasse(''); setErreur(null)
    } catch (err) { setErreur(extraireErreur(err)) }
  }

  return (
    <>
      <PageCrud<Utilisateur>
        titre="Utilisateurs" description="Comptes et rôles : administrateur, caissier, magasinier."
        endpoint="/utilisateurs/" nomElement="Utilisateur" libelleNouveau="Nouvel utilisateur" placeholderRecherche="Nom ou identifiant…"
        colonnes={[
          { cle: 'nom_complet', titre: 'Nom', tri: 'nom', rendu: (u) => <span className="font-medium">{u.nom_complet}</span> },
          { cle: 'identifiant', titre: 'Identifiant', tri: 'identifiant' },
          { cle: 'role', titre: 'Rôle', tri: 'role', rendu: (u) => <Badge ton="bleu">{libelleRole(u.role)}</Badge> },
          { cle: 'telephone', titre: 'Téléphone', cacheParDefaut: true },
          { cle: 'actif', titre: 'État', rendu: (u) => <Badge ton={u.actif ? 'vert' : 'gris'}>{u.actif ? 'Actif' : 'Désactivé'}</Badge> },
        ]}
        champs={[
          { nom: 'identifiant', libelle: 'Identifiant', type: 'texte', requis: true, desactiveEnEdition: true },
          { nom: 'prenom', libelle: 'Prénom', type: 'texte' },
          { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true },
          { nom: 'role', libelle: 'Rôle', type: 'select', requis: true, defaut: 'CAISSIER',
            options: [{ valeur: 'ADMIN', libelle: 'Administrateur' }, { valeur: 'CAISSIER', libelle: 'Caissier' }, { valeur: 'MAGASINIER', libelle: 'Magasinier' }] },
          { nom: 'email', libelle: 'E-mail', type: 'email' },
          { nom: 'telephone', libelle: 'Téléphone', type: 'texte' },
          { nom: 'mot_de_passe', libelle: 'Mot de passe', type: 'motdepasse', requis: true, aide: '8 caractères minimum.', masque: (_f, enEdition) => !enEdition },
          { nom: 'actif', libelle: 'État', type: 'case', aide: 'Compte actif', defaut: true },
        ]}
        actionsLigne={(u) => <button className="btn-discret btn-petit" onClick={() => setCible(u)}><KeyRound size={14} /> Mot de passe</button>}
      />
      <Modale ouverte={!!cible} titre={`Réinitialiser le mot de passe — ${cible?.nom_complet ?? ''}`} onFermer={() => setCible(null)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setCible(null)}>Annuler</button><button className="btn-primaire" type="submit" form="formulaire-reinit">Réinitialiser</button></>}>
        <form id="formulaire-reinit" onSubmit={reinitialiser} className="space-y-3">
          <MessageErreur message={erreur} />
          <Champ libelle="Nouveau mot de passe" aide="8 caractères minimum. Communiquez-le à l'utilisateur de manière sûre.">
            <input className="champ" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} minLength={8} autoComplete="new-password" required />
          </Champ>
        </form>
      </Modale>
    </>
  )
}
