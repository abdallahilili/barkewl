import type { IdentiteDocument } from '../types'
import { htmlSur, texteVide } from '../utilitaires/texteRiche'

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return <div className="recu-entete-ligne"><span className="recu-entete-label">{libelle} :</span><span className="recu-entete-valeur">{valeur}</span></div>
}

/** Libellé numéroté seulement s'il y a plusieurs valeurs (« Tél : » ou « Tél 1 : », « Tél 2 : »). */
const numerote = (libelle: string, valeurs: (string | undefined)[]) =>
  valeurs.filter(Boolean).map((valeur, i, tout) => <Ligne key={`${libelle}${i}`} libelle={tout.length === 1 ? libelle : `${libelle} ${i + 1}`} valeur={valeur!} />)

/** En-tête commun des reçus, devis, bons de livraison et factures : image personnalisée si elle est
 * définie dans les paramètres, sinon logo, nom et coordonnées de la pharmacie. */
export function EnTeteDocument({ identite }: { identite: IdentiteDocument }) {
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
        <h1 className="recu-pharmacie-nom">{identite.nom}</h1>
      </div>
      <div className="recu-entete-droite">
        {identite.adresse && <Ligne libelle="Adresse" valeur={identite.adresse} />}
        {numerote('Tél', [identite.telephone, identite.telephone_2, identite.telephone_3])}
        {numerote('WhatsApp', [identite.whatsapp, identite.whatsapp_2])}
        {identite.email && <Ligne libelle="Email" valeur={identite.email} />}
        {identite.nif && <Ligne libelle="NIF" valeur={identite.nif} />}
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
