import { Printer } from 'lucide-react'
import type { DocumentVente, EtapeDocumentVente } from '../types'
import { formaterDate, formaterDateHeure, formaterNombre } from '../utilitaires/formatage'
import { EnTeteDocument, MessagePied } from './EnTeteDocument'
import { Modale } from './Modale'

const TITRES: Record<EtapeDocumentVente, string> = { DEVIS: 'Devis', BON_LIVRAISON: 'Bon de livraison', FACTURE: 'Facture' }

export function DocumentVenteImpression({ document, type, onFermer }: {
  document: DocumentVente | null
  type: EtapeDocumentVente
  onFermer: () => void
}) {
  const numero = document ? (type === 'FACTURE' ? document.numero_facture : type === 'BON_LIVRAISON' ? document.numero_bl : document.reference) : ''
  const date = document ? (type === 'FACTURE' ? document.date_facture : type === 'BON_LIVRAISON' ? document.date_bl : document.date_devis) : null
  const devise = document?.pharmacie?.devise ?? 'MRU'
  // Le bon de livraison n'affiche prix et total que si le paramètre l'autorise.
  const sansPrix = type === 'BON_LIVRAISON' && document?.pharmacie?.bl_afficher_prix === false

  return (
    <Modale ouverte={!!document} titre={document ? `${TITRES[type]} ${numero}` : TITRES[type]} onFermer={onFermer} largeur="grande"
      pied={<>
        <button className="btn-secondaire" onClick={onFermer}>Fermer</button>
        <button className="btn-primaire" onClick={() => window.print()}><Printer size={16} /> Imprimer</button>
      </>}>
      {document && document.pharmacie && (
        <div className="zone-impression w-full bg-white text-black">
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 8mm; }
              html, body { height: 100% !important; max-height: 100% !important; overflow: hidden !important; }
            }
          `}</style>
          <div className="recu-conteneur">
            <div className="recu-cadre recu-cadre--pleine-page">
              <EnTeteDocument identite={document.pharmacie} />

              <div className="recu-info-grille">
                <div className="recu-info-col">
                  <div className="recu-info-ligne"><span className="recu-info-label">{TITRES[type]} N° :</span><span className="recu-info-valeur">{numero}</span></div>
                  <div className="recu-info-ligne"><span className="recu-info-label">Client :</span><span className="recu-info-valeur">{document.client_nom}</span></div>
                  {document.client_telephone && <div className="recu-info-ligne"><span className="recu-info-label">Téléphone :</span><span className="recu-info-valeur">{document.client_telephone}</span></div>}
                  {document.client_adresse && <div className="recu-info-ligne"><span className="recu-info-label">Adresse :</span><span className="recu-info-valeur">{document.client_adresse}</span></div>}
                </div>
                <div className="recu-info-col">
                  <div className="recu-info-ligne"><span className="recu-info-label">Date :</span><span className="recu-info-valeur">{date ? formaterDateHeure(date) : '—'}</span></div>
                  {type !== 'DEVIS' && <div className="recu-info-ligne"><span className="recu-info-label">Devis d'origine :</span><span className="recu-info-valeur">{document.reference}</span></div>}
                  {type === 'FACTURE' && <div className="recu-info-ligne"><span className="recu-info-label">Bon de livraison :</span><span className="recu-info-valeur">{document.numero_bl}</span></div>}
                </div>
              </div>

              {document.annule && <div className="recu-annulee">★★★ DEVIS ANNULÉ ★★★</div>}

              <table className="recu-table">
                <thead>
                  <tr>
                    <th className="recu-th recu-th-gauche">Médicament</th>
                    {type === 'BON_LIVRAISON' ? (
                      <><th className="recu-th recu-th-centre">Commandé</th><th className="recu-th recu-th-centre">Livré</th></>
                    ) : (
                      <th className="recu-th recu-th-centre">Qté</th>
                    )}
                    {!sansPrix && <th className="recu-th recu-th-droite">P.U.</th>}
                    {!sansPrix && <th className="recu-th recu-th-droite">Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {(document.lignes ?? []).map((l, i) => (
                    <tr key={l.id ?? i} className={i % 2 === 1 ? 'recu-tr-alt' : ''}>
                      <td className="recu-td recu-td-nom">
                        <span className="recu-med-nom">{l.medicament_nom ?? l.designation}</span>
                      </td>
                      {type === 'BON_LIVRAISON' ? (
                        <>
                          <td className="recu-td recu-td-centre">{l.quantite_devis}</td>
                          <td className="recu-td recu-td-centre recu-td-gras">{l.quantite_livree}</td>
                        </>
                      ) : (
                        <td className="recu-td recu-td-centre">{type === 'FACTURE' ? l.quantite_livree : l.quantite_devis}</td>
                      )}
                      {!sansPrix && <td className="recu-td recu-td-droite">{formaterNombre(l.prix_unitaire)}</td>}
                      {!sansPrix && <td className="recu-td recu-td-droite recu-td-gras">{formaterNombre(l.total)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>

              {!sansPrix && (
                <div className="recu-total-ligne">
                  <span className="recu-total-label">TOTAL</span>
                  <span className="recu-total-montant">{formaterNombre(document.total)} {devise}</span>
                </div>
              )}

              {type === 'FACTURE' && (
                <div className="recu-paiement-section">
                  {(document.paiements ?? []).map((p, i) => (
                    <div key={i} className="recu-paiement-ligne">
                      <span className="recu-paiement-mode">{p.mode_paiement_nom} ({formaterDate(p.date_paiement)}) :</span>
                      <span className="recu-paiement-montant">{formaterNombre(p.montant)} {devise}</span>
                    </div>
                  ))}
                  <div className="recu-paiement-ligne">
                    <span className="recu-paiement-mode">Déjà payé :</span>
                    <span className="recu-paiement-montant">{formaterNombre(document.montant_paye)} {devise}</span>
                  </div>
                  <div className="recu-paiement-ligne">
                    <span className="recu-paiement-mode">Reste à payer :</span>
                    <span className="recu-paiement-montant">{formaterNombre(document.reste_a_payer)} {devise}</span>
                  </div>
                </div>
              )}

              {type === 'BON_LIVRAISON' && (
                <div className="mt-6 grid grid-cols-2 gap-8 text-sm">
                  <div className="border-t border-slate-400 pt-1 text-center text-slate-600">Livré par</div>
                  <div className="border-t border-slate-400 pt-1 text-center text-slate-600">Reçu par le client</div>
                </div>
              )}

              <MessagePied message={{
                DEVIS: document.pharmacie.message_devis, BON_LIVRAISON: document.pharmacie.message_bl, FACTURE: document.pharmacie.message_facture,
              }[type]} />
            </div>
          </div>
        </div>
      )}
    </Modale>
  )
}
