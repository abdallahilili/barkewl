import type { ReactNode } from 'react'
import type { IdentiteDocument } from '../types'
import { t } from '../i18n'
import { htmlSur, texteVide } from '../utilitaires/texteRiche'

/** Libellé d'une ligne de l'en-tête : `fin` (« : », « 1 : »…) est ajouté au texte traduit. */
export type TraduireEntete = (texte: string, fin?: string) => ReactNode

function Ligne({ libelle, valeur }: { libelle: ReactNode; valeur: string }) {
  return <div className="recu-entete-ligne"><span className="recu-entete-label">{libelle}</span><span className="recu-entete-valeur">{valeur}</span></div>
}

/** Libellé numéroté seulement s'il y a plusieurs valeurs (« Tél : » ou « Tél 1 : », « Tél 2 : »). */
const numerote = (traduire: TraduireEntete, libelle: string, valeurs: (string | undefined)[]) =>
  valeurs.filter(Boolean).map((valeur, i, tout) => (
    <Ligne key={`${libelle}${i}`} libelle={traduire(libelle, tout.length === 1 ? ' :' : ` ${i + 1} :`)} valeur={valeur!} />
  ))

const traduireSimple: TraduireEntete = (texte, fin = '') => t(texte) + fin

/** En-tête commun des reçus, devis, bons de livraison et factures : image personnalisée si elle est
 * définie dans les paramètres, sinon logo, nom (arabe au-dessus, plus grand ; français dessous) et coordonnées.
 * `traduire` permet d'imposer une langue (ou les deux à la fois) indépendamment de l'interface courante. */
export function EnTeteDocument({ identite, traduire = traduireSimple }: { identite: IdentiteDocument; traduire?: TraduireEntete }) {
  if (identite.entete_image) {
    return (
      <div className="recu-entete-personnalise">
        <img src={identite.entete_image} alt={identite.nom} className="recu-entete-image" />
      </div>
    )
  }
  return (
    <div className="recu-entete">
      <div className="recu-entete-gauche">
        {identite.logo ? (
          <img src={identite.logo} alt="" className="recu-logo" />
        ) : (
          <div className="recu-icone-pharmacie">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </div>
        )}
        <div className={identite.nom_ar ? 'recu-pharmacie-noms recu-pharmacie-noms--bi' : 'recu-pharmacie-noms'}>
          {identite.nom_ar && <p className="recu-pharmacie-nom-ar" dir="rtl" lang="ar">{identite.nom_ar}</p>}
          <h1 className="recu-pharmacie-nom">{identite.nom}</h1>
        </div>
      </div>
      <div className="recu-entete-droite">
        {identite.adresse && <Ligne libelle={traduire('Adresse', ' :')} valeur={identite.adresse} />}
        {numerote(traduire, 'Tél', [identite.telephone, identite.telephone_2, identite.telephone_3])}
        {numerote(traduire, 'WhatsApp', [identite.whatsapp, identite.whatsapp_2])}
        {identite.email && <Ligne libelle={traduire('Email', ' :')} valeur={identite.email} />}
        {identite.nif && <Ligne libelle={traduire('NIF', ' :')} valeur={identite.nif} />}
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
