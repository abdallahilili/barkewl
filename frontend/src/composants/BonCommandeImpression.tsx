import { FileSpreadsheet, Printer } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BonCommande } from '../types'
import { designationLigne, exporterBonCommandeExcel, LangueBon, libelleBon } from '../utilitaires/bonCommande'
import { extraireErreur } from '../utilitaires/erreurs'
import { formaterDate, formaterNombre, libelleDeviseBilingue, libelleDeviseVers } from '../utilitaires/formatage'
import { langueCourante, t } from '../i18n'
import { Bilingue } from './Bilingue'
import { EnTeteDocument } from './EnTeteDocument'
import { MessageErreur } from './EnTetePage'
import { Modale } from './Modale'
import { PiedLogiciel } from './PiedLogiciel'

const LANGUES: { cle: LangueBon; libelle: string }[] = [
  { cle: 'fr', libelle: 'Français' }, { cle: 'ar', libelle: 'العربية' }, { cle: 'bilingue', libelle: 'Français / العربية' },
]

/** Aperçu du bon de commande, à imprimer (ou enregistrer en PDF avec l'impression du navigateur) ou à exporter en Excel,
 * en français, en arabe ou dans les deux langues à la fois. */
export function BonCommandeImpression({ bon, onFermer }: { bon: BonCommande | null; onFermer: () => void }) {
  const [langue, setLangue] = useState<LangueBon>(langueCourante())
  const [avecPrix, setAvecPrix] = useState(true)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => { if (bon) { setLangue(langueCourante()); setErreur(null) } }, [bon])

  const exporterExcel = async () => {
    if (!bon) return
    setOccupe(true); setErreur(null)
    try { await exporterBonCommandeExcel(bon, langue, avecPrix) } catch (e) { setErreur(extraireErreur(e)) } finally { setOccupe(false) }
  }

  const devise = bon?.pharmacie?.devise ?? 'MRU'
  const libelleDevise = langue === 'bilingue' ? libelleDeviseBilingue(devise) : libelleDeviseVers(devise, langue)
  const L = ({ texte }: { texte: string }) => <Bilingue texte={texte} langue={langue} />

  return (
    <Modale ouverte={!!bon} titre={bon ? libelleBon(langueCourante(), 'Bon de commande') + ' ' + bon.reference : ''} onFermer={onFermer} largeur="grande"
      pied={<>
        <button className="btn-secondaire" onClick={onFermer}>{t('Fermer')}</button>
        <button className="btn-secondaire" disabled={occupe} onClick={exporterExcel}><FileSpreadsheet size={16} /> {' '}{t('Exporter en Excel')}</button>
        <button className="btn-primaire" onClick={() => window.print()}><Printer size={16} /> {' '}{t('Imprimer / PDF')}</button>
      </>}>
      {bon && bon.pharmacie && (
        <>
          <div className="sans-impression mb-3 space-y-2 text-sm">
            <MessageErreur message={erreur} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-600">{t('Langue du document :')}</span>
                <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                  {LANGUES.map((choix) => (
                    <button key={choix.cle} type="button" onClick={() => setLangue(choix.cle)}
                      className={`px-3 py-1.5 ${langue === choix.cle ? 'bg-marque-600 font-medium text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{choix.libelle}</button>
                  ))}
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                <input type="checkbox" checked={avecPrix} onChange={(e) => setAvecPrix(e.target.checked)} /> {t('Afficher les prix estimés')}
              </label>
            </div>
            <p className="text-xs text-slate-500">{t('Pour un PDF : choisissez « Enregistrer au format PDF » comme imprimante dans la fenêtre d\'impression.')}</p>
          </div>

          <div className="zone-impression impression-multipage w-full bg-white text-black" dir={langue === 'ar' ? 'rtl' : 'ltr'}>
            <style>{`
              @media print {
                @page { size: A4 portrait; margin: 8mm; }
              }
            `}</style>
            <div className="recu-conteneur">
              <div className="recu-cadre recu-cadre--pleine-page">
                <EnTeteDocument identite={bon.pharmacie} />

                <h2 className="my-3 text-center text-lg font-bold"><L texte="Bon de commande" /> <bdi>{bon.reference}</bdi></h2>

                <div className="recu-info-grille">
                  <div className="recu-info-col">
                    <div className="recu-info-ligne"><span className="recu-info-label"><L texte="Fournisseur :" /></span><span className="recu-info-valeur">{bon.fournisseur_nom}</span></div>
                    {bon.fournisseur_telephone && <div className="recu-info-ligne"><span className="recu-info-label"><L texte="Téléphone :" /></span><span className="recu-info-valeur"><bdi>{bon.fournisseur_telephone}</bdi></span></div>}
                    {bon.fournisseur_adresse && <div className="recu-info-ligne"><span className="recu-info-label"><L texte="Adresse :" /></span><span className="recu-info-valeur">{bon.fournisseur_adresse}</span></div>}
                  </div>
                  <div className="recu-info-col">
                    <div className="recu-info-ligne"><span className="recu-info-label"><L texte="Date :" /></span><span className="recu-info-valeur">{formaterDate(bon.date_commande)}</span></div>
                    {bon.date_livraison_prevue && <div className="recu-info-ligne"><span className="recu-info-label"><L texte="Livraison prévue :" /></span><span className="recu-info-valeur">{formaterDate(bon.date_livraison_prevue)}</span></div>}
                    <div className="recu-info-ligne"><span className="recu-info-label"><L texte="Livrer à :" /></span><span className="recu-info-valeur">{bon.depot_nom}</span></div>
                  </div>
                </div>

                {bon.statut === 'ANNULE' && <div className="recu-annulee">★★★ <L texte="BON DE COMMANDE ANNULÉ" /> ★★★</div>}

                <table className="recu-table">
                  <thead>
                    <tr>
                      <th className="recu-th recu-th-centre"><L texte="N°" /></th>
                      <th className="recu-th recu-th-gauche"><L texte="Désignation" /></th>
                      <th className="recu-th recu-th-centre"><L texte="Quantité (boîtes)" /></th>
                      {avecPrix && <th className="recu-th recu-th-droite"><L texte="Prix d'achat estimé" /></th>}
                      {avecPrix && <th className="recu-th recu-th-droite"><L texte="Total" /></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(bon.lignes ?? []).map((l, i) => (
                      <tr key={l.id ?? i} className={i % 2 === 1 ? 'recu-tr-alt' : ''}>
                        <td className="recu-td recu-td-centre">{i + 1}</td>
                        <td className="recu-td recu-td-nom"><span className="recu-med-nom">{designationLigne(l)}</span></td>
                        <td className="recu-td recu-td-centre recu-td-gras">{l.quantite}</td>
                        {avecPrix && <td className="recu-td recu-td-droite">{formaterNombre(l.prix_achat)}</td>}
                        {avecPrix && <td className="recu-td recu-td-droite recu-td-gras">{formaterNombre(l.total)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {avecPrix && (
                  <div className="recu-total-ligne">
                    <span className="recu-total-label"><L texte="TOTAL" /></span>
                    <span className="recu-total-montant">{formaterNombre(bon.total)} {libelleDevise}</span>
                  </div>
                )}

                {bon.note && <p className="mt-4 text-sm"><strong><L texte="Note :" /></strong> {bon.note}</p>}

                <div className="mt-8 grid grid-cols-2 gap-8 text-sm">
                  <div className="border-t border-slate-400 pt-1 text-center text-slate-600"><L texte="Cachet et signature" /></div>
                  <div className="border-t border-slate-400 pt-1 text-center text-slate-600"><L texte="Accusé de réception du fournisseur" /></div>
                </div>
                <PiedLogiciel />
              </div>
            </div>
          </div>
        </>
      )}
    </Modale>
  )
}
