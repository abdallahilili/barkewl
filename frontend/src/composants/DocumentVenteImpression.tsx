import { Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DocumentVente, EtapeDocumentVente } from '../types'
import { formaterDate, formaterDateHeure, formaterNombre, libelleDeviseVers } from '../utilitaires/formatage'
import { EnTeteDocument, MessagePied } from './EnTeteDocument'
import { Modale } from './Modale'
import { PiedLogiciel } from './PiedLogiciel'
import { Langue, langueCourante, t, tVers } from '../i18n'

const TITRES: Record<EtapeDocumentVente, string> = { DEVIS: 'Devis', BON_LIVRAISON: 'Bon de livraison', FACTURE: 'Facture' }

export function DocumentVenteImpression({ document, type, onFermer }: {
  document: DocumentVente | null
  type: EtapeDocumentVente
  onFermer: () => void
}) {
  const [langueDoc, setLangueDoc] = useState<Langue>(langueCourante())
  useEffect(() => { if (document) setLangueDoc(langueCourante()) }, [document])
  const td = (texte: string, parametres?: Record<string, string | number | null | undefined>) => tVers(langueDoc, texte, parametres)

  const numero = document ? (type === 'FACTURE' ? document.numero_facture : type === 'BON_LIVRAISON' ? document.numero_bl : document.reference) : ''
  const date = document ? (type === 'FACTURE' ? document.date_facture : type === 'BON_LIVRAISON' ? document.date_bl : document.date_devis) : null
  const devise = libelleDeviseVers(document?.pharmacie?.devise ?? 'MRU', langueDoc)
  const titre = td(TITRES[type])
  // Le bon de livraison n'affiche prix et total que si le paramètre l'autorise.
  const sansPrix = type === 'BON_LIVRAISON' && document?.pharmacie?.bl_afficher_prix === false

  return (
    <Modale ouverte={!!document} titre={document ? `${titre} ${numero}` : titre} onFermer={onFermer} largeur="grande"
      pied={<>
        <button className="btn-secondaire" onClick={onFermer}>{t('Fermer')}</button>
        <button className="btn-primaire" onClick={() => window.print()}><Printer size={16} /> {' '}{t('Imprimer')}</button>
      </>}>
      {document && document.pharmacie && (
        <>
          <div className="sans-impression mb-3 flex items-center gap-2 text-sm">
            <span className="text-slate-600">{t('Langue du document :')}</span>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              <button type="button" onClick={() => setLangueDoc('fr')} className={`px-3 py-1.5 ${langueDoc === 'fr' ? 'bg-marque-600 font-medium text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>Français</button>
              <button type="button" onClick={() => setLangueDoc('ar')} className={`px-3 py-1.5 ${langueDoc === 'ar' ? 'bg-marque-600 font-medium text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>العربية</button>
            </div>
          </div>
          <div className="zone-impression impression-multipage w-full bg-white text-black" dir={langueDoc === 'ar' ? 'rtl' : 'ltr'}>
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 8mm; }
            }
          `}</style>
          <div className="recu-conteneur">
            <div className="recu-cadre recu-cadre--pleine-page">
              <EnTeteDocument identite={document.pharmacie} />

              <div className="recu-info-grille">
                <div className="recu-info-col">
                  <div className="recu-info-ligne"><span className="recu-info-label">{titre} {td('N° :')}</span><span className="recu-info-valeur">{numero}</span></div>
                  <div className="recu-info-ligne"><span className="recu-info-label">{td('Client :')}</span><span className="recu-info-valeur">{document.client_nom}</span></div>
                  {document.client_telephone && <div className="recu-info-ligne"><span className="recu-info-label">{td('Téléphone :')}</span><span className="recu-info-valeur">{document.client_telephone}</span></div>}
                  {document.client_adresse && <div className="recu-info-ligne"><span className="recu-info-label">{td('Adresse :')}</span><span className="recu-info-valeur">{document.client_adresse}</span></div>}
                </div>
                <div className="recu-info-col">
                  <div className="recu-info-ligne"><span className="recu-info-label">{td('Date :')}</span><span className="recu-info-valeur">{date ? formaterDateHeure(date) : '—'}</span></div>
                  {type !== 'DEVIS' && <div className="recu-info-ligne"><span className="recu-info-label">{td("Devis d'origine :")}</span><span className="recu-info-valeur">{document.reference}</span></div>}
                  {type === 'FACTURE' && <div className="recu-info-ligne"><span className="recu-info-label">{td('Bon de livraison :')}</span><span className="recu-info-valeur">{document.numero_bl}</span></div>}
                </div>
              </div>

              {document.annule && <div className="recu-annulee">★★★ {td('DEVIS ANNULÉ')} ★★★</div>}

              <table className="recu-table">
                <thead>
                  <tr>
                    <th className="recu-th recu-th-gauche">{td('Médicament')}</th>
                    {type === 'BON_LIVRAISON' ? (
                      <><th className="recu-th recu-th-centre">{td('Commandé')}</th><th className="recu-th recu-th-centre">{td('Livré')}</th></>
                    ) : (
                      <th className="recu-th recu-th-centre">{td('Qté')}</th>
                    )}
                    {!sansPrix && <th className="recu-th recu-th-droite">{td('P.U.')}</th>}
                    {!sansPrix && <th className="recu-th recu-th-droite">{td('Total')}</th>}
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
                  <span className="recu-total-label">{td('TOTAL')}</span>
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
                    <span className="recu-paiement-mode">{td('Déjà payé :')}</span>
                    <span className="recu-paiement-montant">{formaterNombre(document.montant_paye)} {devise}</span>
                  </div>
                  <div className="recu-paiement-ligne">
                    <span className="recu-paiement-mode">{td('Reste à payer :')}</span>
                    <span className="recu-paiement-montant">{formaterNombre(document.reste_a_payer)} {devise}</span>
                  </div>
                </div>
              )}

              {type === 'BON_LIVRAISON' && (
                <div className="mt-6 grid grid-cols-2 gap-8 text-sm">
                  <div className="border-t border-slate-400 pt-1 text-center text-slate-600">{td('Livré par')}</div>
                  <div className="border-t border-slate-400 pt-1 text-center text-slate-600">{td('Reçu par le client')}</div>
                </div>
              )}

              <MessagePied message={{
                DEVIS: document.pharmacie.message_devis, BON_LIVRAISON: document.pharmacie.message_bl, FACTURE: document.pharmacie.message_facture,
              }[type]} />
              <PiedLogiciel />
            </div>
          </div>
          </div>
        </>
      )}
    </Modale>
  )
}
