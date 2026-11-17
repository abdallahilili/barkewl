import { useLayoutEffect, useRef, useState } from 'react'
import type { FormatRecu, LangueRecu, Recu } from '../types'
import { htmlSur, texteVide } from '../utilitaires/texteRiche'
import { formaterDateHeure, formaterNombre, libelleDeviseVers } from '../utilitaires/formatage'
import { Bilingue } from './Bilingue'
import { PiedLogiciel } from './PiedLogiciel'

/** Largeur imprimable (en mm) de chaque ticket : un peu moins que le rouleau, les imprimantes thermiques rognent les bords. */
const LARGEURS: Record<'80mm' | '58mm', number> = { '80mm': 72, '58mm': 50 }
const PAPIER: Record<'80mm' | '58mm', number> = { '80mm': 80, '58mm': 58 }
const PX_EN_MM = 25.4 / 96

/** Ticket de caisse thermique 80 mm ou 58 mm.
 * Organisation : en-tête centré, lignes « étiquette … valeur » (l'étiquette peut passer à la ligne, la valeur jamais),
 * articles sur deux lignes, total court sur une seule ligne, paiements, message. La hauteur du papier est celle du ticket. */
export function RecuTicket({ recu, format, langue }: { recu: Recu; format: Exclude<FormatRecu, 'demi_a4'>; langue: LangueRecu }) {
  const devise = libelleDeviseVers(recu.pharmacie.devise, langue === 'ar' ? 'ar' : 'fr')
  const montant = (n: number) => `${formaterNombre(n)} ${devise}`
  const L = ({ texte, fin }: { texte: string; fin?: string }) => <Bilingue texte={texte} fin={fin} langue={langue} />
  const identite = recu.pharmacie
  const telephones = [identite.telephone, identite.telephone_2, identite.telephone_3].filter(Boolean)
  const etroit = format === '58mm'

  // « size: 80mm auto » n'existe pas en CSS : on mesure le ticket pour donner au papier sa hauteur exacte (sinon le navigateur
  // imprime sur une page A4 et le ticket n'occupe qu'un coin).
  const ticket = useRef<HTMLDivElement>(null)
  const [hauteurMm, setHauteurMm] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (ticket.current) setHauteurMm(Math.ceil(ticket.current.getBoundingClientRect().height * PX_EN_MM) + 6)
  }, [recu, format, langue])

  const Ligne = ({ etiquette, valeur }: { etiquette: React.ReactNode; valeur: React.ReactNode }) => (
    <p className="ticket-ligne"><span className="ticket-etiquette">{etiquette}</span><bdi dir="ltr" className="ticket-valeur">{valeur}</bdi></p>
  )

  return (
    <div className="zone-impression impression-multipage ticket-zone" dir={langue === 'ar' ? 'rtl' : 'ltr'}>
      <style>{`
        @media print {
          @page { size: ${PAPIER[format]}mm ${hauteurMm ?? 297}mm; margin: 0; }
          html, body { width: ${PAPIER[format]}mm !important; }
        }
      `}</style>
      <div ref={ticket} className={`ticket ${etroit ? 'ticket--58' : 'ticket--80'}`} style={{ width: `${LARGEURS[format]}mm` }}>
        <div className="ticket-entete">
          {identite.logo && <img src={identite.logo} alt="" className="ticket-logo" />}
          <p className="ticket-nom">{identite.nom}</p>
          {identite.nom_ar && langue !== 'fr' && <p className="ticket-nom" dir="rtl" lang="ar">{identite.nom_ar}</p>}
          {identite.adresse && <p><bdi>{identite.adresse}</bdi></p>}
          {telephones.length > 0 && <p><L texte="Tél" /> <bdi dir="ltr">{telephones.join(' / ')}</bdi></p>}
          {identite.nif && <p><L texte="NIF" /> <bdi dir="ltr">{identite.nif}</bdi></p>}
        </div>

        <div className="ticket-separateur" />
        <div className="ticket-infos">
          <Ligne etiquette={<L texte="Reçu N° :" />} valeur={recu.reference} />
          <Ligne etiquette={<L texte="Date :" />} valeur={formaterDateHeure(recu.date_vente)} />
          <Ligne etiquette={<L texte="Caissier :" />} valeur={<bdi dir="auto">{recu.caissier}</bdi>} />
          {recu.client && <Ligne etiquette={<L texte="Client :" />} valeur={<bdi dir="auto">{recu.client}</bdi>} />}
        </div>
        {recu.statut === 'ANNULEE' && <p className="ticket-annule">★ <L texte="VENTE ANNULÉE" /> ★</p>}
        <div className="ticket-separateur" />

        <div className="ticket-articles">
          {recu.lignes.map((l, i) => (
            <div key={i} className="ticket-article">
              <p className="ticket-article-nom">
                <bdi>{l.medicament}</bdi>{l.dosage && <bdi> ({l.dosage})</bdi>}
              </p>
              <p className="ticket-article-detail">
                <bdi dir="ltr">{l.quantite}{l.conditionnement_libelle ? ` ${l.conditionnement_libelle}` : ''} × {formaterNombre(l.prix_unitaire)}</bdi>
                <strong dir="ltr">{formaterNombre(l.total)}</strong>
              </p>
            </div>
          ))}
        </div>

        <div className="ticket-separateur" />
        {/* Libellé court (« TOTAL / المجموع ») et montant sur une seule ligne : le montant ne passe jamais à la ligne. */}
        <p className="ticket-total"><span className="ticket-total-etiquette"><L texte="Total" /></span><bdi dir="ltr" className="ticket-valeur">{montant(recu.total)}</bdi></p>
        <div className="ticket-paiements">
          {recu.paiements.map((p, i) => <Ligne key={i} etiquette={p.mode_paiement} valeur={montant(p.montant)} />)}
          {recu.montant_recu != null && <Ligne etiquette={<L texte="Reçu :" />} valeur={montant(recu.montant_recu)} />}
          {recu.rendu != null && <Ligne etiquette={<L texte="Rendu :" />} valeur={montant(recu.rendu)} />}
        </div>

        {!texteVide(identite.message) && (
          <>
            <div className="ticket-separateur" />
            <div className="ticket-message" dangerouslySetInnerHTML={{ __html: htmlSur(identite.message) }} />
          </>
        )}
        <PiedLogiciel />
      </div>
    </div>
  )
}
