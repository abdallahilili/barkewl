import { Printer } from 'lucide-react'
import type { Recu } from '../types'
import { formaterDateHeure, formaterNombre, libelleDeviseBilingue } from '../utilitaires/formatage'
import { EnTeteDocument, MessagePied } from './EnTeteDocument'
import { Modale } from './Modale'
import { t } from '../i18n'
import { Bilingue } from './Bilingue'
import { PiedLogiciel } from './PiedLogiciel'

export function RecuImpression({ recu, onFermer }: { recu: Recu | null; onFermer: () => void }) {
  return (
    <Modale ouverte={!!recu} titre={recu ? `${t('Reçu')} ${recu.reference}` : t('Reçu')} onFermer={onFermer} largeur="grande"
      pied={<>
        <button className="btn-secondaire" onClick={onFermer}>{t('Fermer')}</button>
        <button className="btn-primaire" onClick={() => window.print()}><Printer size={16} /> {' '}{t('Imprimer')}</button>
      </>}>
      {recu && (
        <div className="zone-impression impression-multipage w-full bg-white text-black" dir="ltr">
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 8mm;
              }
            }
          `}</style>
          <div className="recu-conteneur">
            {/* ── Outer frame = top half of A4 with rounded border ── */}
            <div className="recu-cadre">

              <EnTeteDocument identite={recu.pharmacie} />

              {/* ── Info grid: 2 columns, clean labels & values without dotted lines ── */}
              <div className="recu-info-grille">
                <div className="recu-info-col">
                  <div className="recu-info-ligne">
                    <span className="recu-info-label"><Bilingue texte="Reçu N° :" /></span>
                    <span className="recu-info-valeur">{recu.reference}</span>
                  </div>
                  <div className="recu-info-ligne">
                    <span className="recu-info-label"><Bilingue texte="Client :" /></span>
                    <span className="recu-info-valeur">{recu.client ?? '—'}</span>
                  </div>
                </div>
                <div className="recu-info-col">
                  <div className="recu-info-ligne">
                    <span className="recu-info-label"><Bilingue texte="Date :" /></span>
                    <span className="recu-info-valeur">{formaterDateHeure(recu.date_vente)}</span>
                  </div>
                  <div className="recu-info-ligne">
                    <span className="recu-info-label"><Bilingue texte="Caissier :" /></span>
                    <span className="recu-info-valeur">{recu.caissier}</span>
                  </div>
                </div>
              </div>

              {/* ── Cancelled banner ── */}
              {recu.statut === 'ANNULEE' && (
                <div className="recu-annulee">★★★ <Bilingue texte="VENTE ANNULÉE" /> ★★★</div>
              )}

              {/* ── Items table with rounded corners ── */}
              <table className="recu-table">
                <thead>
                  <tr>
                    <th className="recu-th recu-th-gauche"><Bilingue texte="Médicament" /></th>
                    <th className="recu-th recu-th-centre"><Bilingue texte="Qté" /></th>
                    <th className="recu-th recu-th-droite"><Bilingue texte="P.U." /></th>
                    <th className="recu-th recu-th-droite"><Bilingue texte="Total" /></th>
                  </tr>
                </thead>
                <tbody>
                  {recu.lignes.map((l, i) => (
                    <tr key={i} className={i % 2 === 1 ? 'recu-tr-alt' : ''}>
                      <td className="recu-td recu-td-nom">
                        <span className="recu-med-nom">{l.medicament}</span>
                        {l.dosage && <span className="recu-med-dosage"> ({l.dosage})</span>}
                      </td>
                      <td className="recu-td recu-td-centre">{l.quantite}{l.conditionnement_libelle && <span className="recu-med-dosage"> {l.conditionnement_libelle}</span>}</td>
                      <td className="recu-td recu-td-droite">{formaterNombre(l.prix_unitaire)}</td>
                      <td className="recu-td recu-td-droite recu-td-gras">{formaterNombre(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── Total row ── */}
              <div className="recu-total-ligne">
                <span className="recu-total-label"><Bilingue texte="TOTAL À PAYER" /></span>
                <span className="recu-total-montant">{formaterNombre(recu.total)} {libelleDeviseBilingue(recu.pharmacie.devise)}</span>
              </div>

              {/* ── Payment details (aligned right under total) ── */}
              <div className="recu-paiement-section">
                {recu.paiements.map((p, i) => (
                  <div key={i} className="recu-paiement-ligne">
                    <span className="recu-paiement-mode">{p.mode_paiement} :</span>
                    <span className="recu-paiement-montant">{formaterNombre(p.montant)} {libelleDeviseBilingue(recu.pharmacie.devise)}</span>
                  </div>
                ))}
                {recu.montant_recu != null && (
                  <div className="recu-paiement-ligne">
                    <span className="recu-paiement-mode"><Bilingue texte="Reçu :" /></span>
                    <span className="recu-paiement-montant">{formaterNombre(recu.montant_recu)} {libelleDeviseBilingue(recu.pharmacie.devise)}</span>
                  </div>
                )}
                {recu.rendu != null && (
                  <div className="recu-paiement-ligne">
                    <span className="recu-paiement-mode"><Bilingue texte="Rendu :" /></span>
                    <span className="recu-paiement-montant">{formaterNombre(recu.rendu)} {libelleDeviseBilingue(recu.pharmacie.devise)}</span>
                  </div>
                )}
              </div>

              <MessagePied message={recu.pharmacie.message} />
              <PiedLogiciel />

            </div>
          </div>
        </div>
      )}
    </Modale>
  )
}
