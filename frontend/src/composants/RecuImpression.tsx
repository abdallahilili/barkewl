import { Printer } from 'lucide-react'
import type { Recu } from '../types'
import { formaterDateHeure, formaterNombre } from '../utilitaires/formatage'
import { Modale } from './Modale'

export function RecuImpression({ recu, onFermer }: { recu: Recu | null; onFermer: () => void }) {
  return (
    <Modale ouverte={!!recu} titre={recu ? `Reçu ${recu.reference}` : 'Reçu'} onFermer={onFermer} largeur="grande"
      pied={<>
        <button className="btn-secondaire" onClick={onFermer}>Fermer</button>
        <button className="btn-primaire" onClick={() => window.print()}><Printer size={16} /> Imprimer</button>
      </>}>
      {recu && (
        <div className="zone-impression w-full bg-white text-black">
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 8mm;
              }
              html, body {
                height: 100% !important;
                max-height: 100% !important;
                overflow: hidden !important;
              }
            }
          `}</style>
          <div className="recu-conteneur">
            {/* ── Outer frame = top half of A4 with rounded border ── */}
            <div className="recu-cadre">

              {/* ── Header: logo & name left, address & phone list right ── */}
              {(() => {
                const telephones = [
                  recu.pharmacie.telephone,
                  recu.pharmacie.telephone_2,
                  recu.pharmacie.telephone_3,
                ].filter(Boolean) as string[]

                return (
                  <div className="recu-entete">
                    <div className="recu-entete-gauche">
                      {recu.pharmacie.logo ? (
                        <img src={recu.pharmacie.logo} alt="" className="recu-logo" />
                      ) : (
                        <div className="recu-icone-pharmacie">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2v20M2 12h20" />
                          </svg>
                        </div>
                      )}
                      <h1 className="recu-pharmacie-nom">{recu.pharmacie.nom}</h1>
                    </div>

                    <div className="recu-entete-droite">
                      {recu.pharmacie.adresse && (
                        <div className="recu-entete-ligne">
                          <span className="recu-entete-label">Adresse :</span>
                          <span className="recu-entete-valeur">{recu.pharmacie.adresse}</span>
                        </div>
                      )}
                      {telephones.map((tel, idx) => (
                        <div key={idx} className="recu-entete-ligne">
                          <span className="recu-entete-label">{telephones.length === 1 ? 'Tél :' : `Tél ${idx + 1} :`}</span>
                          <span className="recu-entete-valeur">{tel}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* ── Info grid: 2 columns, clean labels & values without dotted lines ── */}
              <div className="recu-info-grille">
                <div className="recu-info-col">
                  <div className="recu-info-ligne">
                    <span className="recu-info-label">Reçu N° :</span>
                    <span className="recu-info-valeur">{recu.reference}</span>
                  </div>
                  <div className="recu-info-ligne">
                    <span className="recu-info-label">Client :</span>
                    <span className="recu-info-valeur">{recu.client ?? '—'}</span>
                  </div>
                </div>
                <div className="recu-info-col">
                  <div className="recu-info-ligne">
                    <span className="recu-info-label">Date :</span>
                    <span className="recu-info-valeur">{formaterDateHeure(recu.date_vente)}</span>
                  </div>
                  <div className="recu-info-ligne">
                    <span className="recu-info-label">Caissier :</span>
                    <span className="recu-info-valeur">{recu.caissier}</span>
                  </div>
                </div>
              </div>

              {/* ── Cancelled banner ── */}
              {recu.statut === 'ANNULEE' && (
                <div className="recu-annulee">★★★ VENTE ANNULÉE ★★★</div>
              )}

              {/* ── Items table with rounded corners ── */}
              <table className="recu-table">
                <thead>
                  <tr>
                    <th className="recu-th recu-th-gauche">Médicament</th>
                    <th className="recu-th recu-th-centre">Qté</th>
                    <th className="recu-th recu-th-droite">P.U.</th>
                    <th className="recu-th recu-th-droite">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recu.lignes.map((l, i) => (
                    <tr key={i} className={i % 2 === 1 ? 'recu-tr-alt' : ''}>
                      <td className="recu-td recu-td-nom">
                        <span className="recu-med-nom">{l.medicament}</span>
                        {l.dosage && <span className="recu-med-dosage"> ({l.dosage})</span>}
                      </td>
                      <td className="recu-td recu-td-centre">{l.quantite}</td>
                      <td className="recu-td recu-td-droite">{formaterNombre(l.prix_unitaire)}</td>
                      <td className="recu-td recu-td-droite recu-td-gras">{formaterNombre(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* ── Total row ── */}
              <div className="recu-total-ligne">
                <span className="recu-total-label">TOTAL À PAYER</span>
                <span className="recu-total-montant">{formaterNombre(recu.total)} {recu.pharmacie.devise}</span>
              </div>

              {/* ── Payment details (aligned right under total) ── */}
              <div className="recu-paiement-section">
                {recu.paiements.map((p, i) => (
                  <div key={i} className="recu-paiement-ligne">
                    <span className="recu-paiement-mode">{p.mode_paiement} :</span>
                    <span className="recu-paiement-montant">{formaterNombre(p.montant)} {recu.pharmacie.devise}</span>
                  </div>
                ))}
                {recu.montant_recu != null && (
                  <div className="recu-paiement-ligne">
                    <span className="recu-paiement-mode">Reçu :</span>
                    <span className="recu-paiement-montant">{formaterNombre(recu.montant_recu)} {recu.pharmacie.devise}</span>
                  </div>
                )}
                {recu.rendu != null && (
                  <div className="recu-paiement-ligne">
                    <span className="recu-paiement-mode">Rendu :</span>
                    <span className="recu-paiement-montant">{formaterNombre(recu.rendu)} {recu.pharmacie.devise}</span>
                  </div>
                )}
              </div>

              {/* ── Footer message: alone at the bottom ── */}
              {recu.pharmacie.message && (
                <div className="recu-pied-message">
                  <p className="recu-message">{recu.pharmacie.message}</p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </Modale>
  )
}
