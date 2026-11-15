import type { ReactNode } from 'react'
import type { IdentiteDocument } from '../types'
import { tVers } from '../i18n'
import type { Langue } from '../i18n'
import { htmlSur, texteVide } from '../utilitaires/texteRiche'

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  // <bdi> isole la valeur (téléphone, adresse…) : elle garde son propre sens de lecture dans le bloc arabe.
  return <div className="recu-entete-ligne"><span className="recu-entete-label">{libelle} :</span><bdi className="recu-entete-valeur">{valeur}</bdi></div>
}

/** Coordonnées de la pharmacie, avec les libellés dans la langue du bloc. « Tél 1 », « Tél 2 »… seulement s'il y a plusieurs numéros. */
function Contacts({ identite, langue }: { identite: IdentiteDocument; langue: Langue }) {
  const libelle = (texte: string) => tVers(langue, texte)
  const numerote = (texte: string, valeurs: (string | undefined)[]) =>
    valeurs.filter(Boolean).map((valeur, i, tout) => <Ligne key={`${texte}${i}`} libelle={tout.length === 1 ? libelle(texte) : `${libelle(texte)} ${i + 1}`} valeur={valeur!} />)
  return (
    <div className="recu-contacts">
      {identite.adresse && <Ligne libelle={libelle('Adresse')} valeur={identite.adresse} />}
      {numerote('Tél', [identite.telephone, identite.telephone_2, identite.telephone_3])}
      {numerote('WhatsApp', [identite.whatsapp, identite.whatsapp_2])}
      {identite.email && <Ligne libelle={libelle('Email')} valeur={identite.email} />}
      {identite.nif && <Ligne libelle={libelle('NIF')} valeur={identite.nif} />}
    </div>
  )
}

/** En-tête commun des reçus, devis, bons de livraison et factures : image personnalisée si elle est définie dans les
 * paramètres ; sinon le logo au milieu, le nom et les coordonnées en français à gauche, en arabe à droite. */
export function EnTeteDocument({ identite }: { identite: IdentiteDocument }) {
  if (identite.entete_image) {
    return (
      <div className="recu-entete-personnalise">
        <img src={identite.entete_image} alt={identite.nom} className="recu-entete-image" />
      </div>
    )
  }
  const logo: ReactNode = identite.logo ? (
    <img src={identite.logo} alt="" className="recu-logo" />
  ) : (
    <div className="recu-icone-pharmacie">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M2 12h20" />
      </svg>
    </div>
  )
  // dir="ltr" sur l'en-tête : le français reste à gauche et l'arabe à droite, quelle que soit la langue du document.
  return (
    <div className="recu-entete" dir="ltr">
      <div className="recu-entete-bloc recu-entete-bloc--fr" dir="ltr" lang="fr">
        <h1 className="recu-pharmacie-nom">{identite.nom}</h1>
        <Contacts identite={identite} langue="fr" />
      </div>
      <div className="recu-entete-centre">{logo}</div>
      <div className="recu-entete-bloc recu-entete-bloc--ar" dir="rtl" lang="ar">
        {identite.nom_ar && <p className="recu-pharmacie-nom-ar">{identite.nom_ar}</p>}
        <Contacts identite={identite} langue="ar" />
      </div>
    </div>
  )
}

/** Message de pied de page (texte riche des paramètres) ; rien si le message est vide. */
export function MessagePied({ message }: { message: string }) {
  if (texteVide(message)) return null
  return (
    <div className="recu-pied-message">
      <div className="recu-message" dangerouslySetInnerHTML={{ __html: htmlSur(message) }} />
    </div>
  )
}
