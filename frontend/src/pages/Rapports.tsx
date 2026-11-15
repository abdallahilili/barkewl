import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { Chargement, EnTetePage, MessageErreur } from '../composants/EnTetePage'
import { PiedLogiciel } from '../composants/PiedLogiciel'
import { useAuth } from '../hooks/useAuth'
import { useOptions } from '../hooks/useListe'
import { api } from '../services/api'
import type { Caisse, DetailModePaiement, Depot, ModePaiement } from '../types'
import { extraireErreur } from '../utilitaires/erreurs'
import { exporterCsv, exporterExcel, exporterPdf, exporterWord } from '../utilitaires/exports'
import { aujourdhui, formaterDate, formaterDateExport, formaterDateHeure, formaterMontant, formaterNombre, ilYaJours } from '../utilitaires/formatage'

import { Langue, langueCourante, t, traduireServeur, tVers } from '../i18n'
type Onglet = 'ventes' | 'achats' | 'caisse' | 'stock' | 'mouvements'
type Ligne = Record<string, string | number | null>

/** `titre` est le texte français brut (pas de `t(...)`) : traduit à l'affichage et, indépendamment,
 * à l'export dans la langue choisie dans le tableau (voir `TableauRapport`). */
interface ColonneRapport { cle: string; titre: string; format?: 'montant' | 'nombre' | 'date' | 'texte'; alignement?: 'droite' }

function formater(valeur: unknown, format?: ColonneRapport['format']) {
  if (valeur == null || valeur === '') return '—'
  if (format === 'montant') return formaterMontant(Number(valeur))
  if (format === 'nombre') return formaterNombre(Number(valeur))
  if (format === 'date') return formaterDate(String(valeur))
  return String(valeur)
}

function formaterExport(valeur: unknown, format?: ColonneRapport['format']) {
  if (valeur == null || valeur === '') return ''
  if (format === 'date') return formaterDateExport(String(valeur))
  return formater(valeur, format)
}

function TableauRapport({ colonnes, lignes, nomFichier }: { colonnes: ColonneRapport[]; lignes: Ligne[]; nomFichier: string }) {
  const { utilisateur } = useAuth()
  const [occupe, setOccupe] = useState<'excel' | 'word' | null>(null)
  const [langueExport, setLangueExport] = useState<Langue>(langueCourante())
  const titre = tVers(langueExport, nomFichier.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()))
  const entetes = colonnes.map((c) => tVers(langueExport, c.titre))
  const lignesFormatees = () => lignes.map((l) => colonnes.map((c) => formaterExport(l[c.cle], c.format)))
  return (
    <div className="carte">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 sans-impression">
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs">
          <button type="button" onClick={() => setLangueExport('fr')} className={`px-2.5 py-1.5 ${langueExport === 'fr' ? 'bg-marque-600 font-medium text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>Français</button>
          <button type="button" onClick={() => setLangueExport('ar')} className={`px-2.5 py-1.5 ${langueExport === 'ar' ? 'bg-marque-600 font-medium text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>العربية</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondaire btn-petit" onClick={() => exporterCsv(`${nomFichier}.csv`, entetes, lignesFormatees())}><Download size={14} /> {' '}{t('Exporter en CSV')}</button>
          <button className="btn-secondaire btn-petit" disabled={occupe === 'excel'}
            onClick={async () => { setOccupe('excel'); try { await exporterExcel({ titre, nomFichier, entetes, lignes: lignesFormatees(), langue: langueExport }) } finally { setOccupe(null) } }}>
            <FileSpreadsheet size={14} /> {' '}{t('Exporter en Excel')}
          </button>
          <button className="btn-secondaire btn-petit" onClick={() => exporterPdf({
            titre, nomFichier, imprimePar: utilisateur?.nom_complet ?? '—',
            entetes, lignes: lignesFormatees(), langue: langueExport,
          })}><FileText size={14} /> {' '}{t('Exporter en PDF')}</button>
          <button className="btn-secondaire btn-petit" disabled={occupe === 'word'}
            onClick={async () => { setOccupe('word'); try { await exporterWord({ titre, nomFichier, entetes, lignes: lignesFormatees(), langue: langueExport }) } finally { setOccupe(null) } }}>
            <FileText size={14} /> {' '}{t('Exporter en Word')}
          </button>
          <button className="btn-secondaire btn-petit" onClick={() => window.print()}><Printer size={14} /> {' '}{t('Imprimer')}</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>{colonnes.map((c) => <th key={c.cle} className={`whitespace-nowrap px-3 py-2.5 font-medium ${c.alignement === 'droite' ? 'text-end' : 'text-start'}`}>{t(c.titre)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.length === 0 && <tr><td colSpan={colonnes.length} className="px-3 py-8 text-center text-slate-500">{t('Aucune donnée pour cette période.')}</td></tr>}
            {lignes.map((l, i) => (
              <tr key={i}>{colonnes.map((c) => <td key={c.cle} className={`px-3 py-2 ${c.alignement === 'droite' ? 'text-end' : ''}`}>{formater(l[c.cle], c.format)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Totaux({ elements }: { elements: { titre: string; valeur: string }[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {elements.map((e) => <div key={e.titre} className="carte p-3"><p className="text-xs text-slate-500">{e.titre}</p><p className="mt-1 text-lg font-semibold">{e.valeur}</p></div>)}
    </div>
  )
}

function useRapport<T>(chemin: string, params: Record<string, string>) {
  const [donnees, setDonnees] = useState<T | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const cle = JSON.stringify(params)
  useEffect(() => {
    setChargement(true)
    const filtres = Object.fromEntries(Object.entries(JSON.parse(cle) as Record<string, string>).filter(([, v]) => v !== ''))
    api.get<T>(`/rapports/${chemin}/`, { params: filtres }).then((r) => { setDonnees(r.data); setErreur(null) })
      .catch((e) => setErreur(extraireErreur(e))).finally(() => setChargement(false))
  }, [chemin, cle])
  return { donnees, chargement, erreur }
}

function Periode({ debut, fin, setDebut, setFin, children }: { debut: string; fin: string; setDebut: (v: string) => void; setFin: (v: string) => void; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 sans-impression">
      <div><label className="etiquette">{t('Du')}</label><input type="date" className="champ" value={debut} onChange={(e) => setDebut(e.target.value)} /></div>
      <div><label className="etiquette">{t('Au')}</label><input type="date" className="champ" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
      {children}
    </div>
  )
}

function usePeriode() {
  const [debut, setDebut] = useState(ilYaJours(30))
  const [fin, setFin] = useState(aujourdhui())
  return { debut, fin, setDebut, setFin }
}

function RapportVentes() {
  const p = usePeriode()
  const [regroupement, setRegroupement] = useState('jour')
  const { donnees, chargement, erreur } = useRapport<{ lignes: Ligne[]; nombre_ventes: number; chiffre_affaires: number }>('ventes', { date_debut: p.debut, date_fin: p.fin, regroupement })
  const titres: Record<string, string> = { jour: 'Jour', caissier: 'Caissier', depot: 'Dépôt', medicament: 'Médicament' }
  return (
    <div>
      <Periode {...p}><div><label className="etiquette">{t('Regrouper par')}</label><select className="champ" value={regroupement} onChange={(e) => setRegroupement(e.target.value)}>{Object.entries(titres).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></div></Periode>
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <>
          <Totaux elements={[{ titre: t('Chiffre d\'affaires'), valeur: formaterMontant(donnees.chiffre_affaires) }, { titre: t('Nombre de ventes'), valeur: formaterNombre(donnees.nombre_ventes) }]} />
          <TableauRapport nomFichier={`ventes-par-${regroupement}`} lignes={donnees.lignes}
            colonnes={[{ cle: 'libelle', titre: titres[regroupement] }, { cle: 'nombre', titre: regroupement === 'medicament' ? 'Quantité vendue' : 'Ventes', format: 'nombre', alignement: 'droite' }, { cle: 'total', titre: 'Total', format: 'montant', alignement: 'droite' }]} />
        </>
      )}
    </div>
  )
}

function RapportAchats() {
  const p = usePeriode()
  const [regroupement, setRegroupement] = useState('jour')
  const { donnees, chargement, erreur } = useRapport<{ lignes: Ligne[]; nombre_achats: number; total_achats: number; total_paye: number; reste_a_payer: number }>('achats', { date_debut: p.debut, date_fin: p.fin, regroupement })
  return (
    <div>
      <Periode {...p}><div><label className="etiquette">{t('Regrouper par')}</label><select className="champ" value={regroupement} onChange={(e) => setRegroupement(e.target.value)}><option value="jour">{t('Jour')}</option><option value="fournisseur">{t('Fournisseur')}</option></select></div></Periode>
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <>
          <Totaux elements={[{ titre: t('Total des achats'), valeur: formaterMontant(donnees.total_achats) }, { titre: t('Payé'), valeur: formaterMontant(donnees.total_paye) }, { titre: t('Reste à payer'), valeur: formaterMontant(donnees.reste_a_payer) }, { titre: t('Nombre d\'achats'), valeur: formaterNombre(donnees.nombre_achats) }]} />
          <TableauRapport nomFichier={`achats-par-${regroupement}`} lignes={donnees.lignes}
            colonnes={[{ cle: 'libelle', titre: regroupement === 'jour' ? 'Jour' : 'Fournisseur' }, { cle: 'nombre', titre: 'Achats', format: 'nombre', alignement: 'droite' }, { cle: 'total', titre: 'Total', format: 'montant', alignement: 'droite' }, { cle: 'paye', titre: 'Payé', format: 'montant', alignement: 'droite' }, { cle: 'reste', titre: 'Reste', format: 'montant', alignement: 'droite' }]} />
        </>
      )}
    </div>
  )
}

function RapportCaisse() {
  const p = usePeriode()
  const caisses = useOptions<Caisse>('/caisses/')
  const modes = useOptions<ModePaiement>('/modes-paiement/')
  const [caisse, setCaisse] = useState('')
  const [modePaiement, setModePaiement] = useState('')
  interface Reponse {
    sessions: { id: number; date_ouverture: string; caissier_nom: string; caisse_nom: string; statut: string; montant_initial: number; montant_attendu: number | null; montant_reel: number | null; ecart: number | null; resume: { total_ventes: number; total_especes: number; total_autres_paiements: number } }[]
    total_ventes: number; total_especes: number; total_autres_paiements: number; total_ecarts: number; total_manquants: number
    par_mode: DetailModePaiement[]
  }
  const { donnees, chargement, erreur } = useRapport<Reponse>('caisse', { date_debut: p.debut, date_fin: p.fin, caisse, mode_paiement: modePaiement })
  return (
    <div>
      <Periode {...p}>
        <div><label className="etiquette">{t('Caisse')}</label><select className="champ" value={caisse} onChange={(e) => setCaisse(e.target.value)}><option value="">{t('Toutes les caisses')}</option>{caisses.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
        <div><label className="etiquette">{t('Mode de paiement')}</label><select className="champ" value={modePaiement} onChange={(e) => setModePaiement(e.target.value)}><option value="">{t('Tous les modes')}</option>{modes.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></div>
      </Periode>
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <>
          <Totaux elements={[{ titre: t('Ventes (sessions clôturées)'), valeur: formaterMontant(donnees.total_ventes) }, { titre: t('Encaissé en espèces'), valeur: formaterMontant(donnees.total_especes) }, { titre: t('Autres paiements'), valeur: formaterMontant(donnees.total_autres_paiements) }, { titre: t('Écarts cumulés (manquants)'), valeur: `${formaterMontant(donnees.total_ecarts)} (${formaterMontant(donnees.total_manquants)})` }]} />
          <h3 className="mb-2 text-sm font-semibold">{t('Détail par mode de paiement (ventes et remboursements réels, sessions ouvertes incluses)')}</h3>
          <TableauRapport nomFichier="caisse-par-mode-paiement"
            lignes={donnees.par_mode.map((m) => ({ mode: m.mode_paiement_nom, ventes: m.ventes, remboursements: m.remboursements, net: m.net }))}
            colonnes={[{ cle: 'mode', titre: 'Mode de paiement' }, { cle: 'ventes', titre: 'Ventes', format: 'montant', alignement: 'droite' }, { cle: 'remboursements', titre: 'Remboursements', format: 'montant', alignement: 'droite' }, { cle: 'net', titre: 'Net', format: 'montant', alignement: 'droite' }]} />
          <h3 className="mb-2 mt-5 text-sm font-semibold">{t('Sessions de caisse')}</h3>
          <TableauRapport nomFichier="sessions-de-caisse"
            lignes={donnees.sessions.map((s) => ({ id: s.id, date: s.date_ouverture, caissier: s.caissier_nom, caisse: s.caisse_nom, statut: s.statut === 'OUVERTE' ? t('Ouverte') : t('Clôturée'), ventes: s.resume.total_ventes, especes: s.resume.total_especes, autres: s.resume.total_autres_paiements, attendu: s.montant_attendu ?? s.resume.total_especes, compte: s.montant_reel, ecart: s.ecart }))}
            colonnes={[{ cle: 'date', titre: 'Ouverture' }, { cle: 'caissier', titre: 'Caissier' }, { cle: 'caisse', titre: 'Caisse' }, { cle: 'statut', titre: 'État' }, { cle: 'ventes', titre: 'Ventes', format: 'montant', alignement: 'droite' }, { cle: 'especes', titre: 'Espèces', format: 'montant', alignement: 'droite' }, { cle: 'autres', titre: 'Autres', format: 'montant', alignement: 'droite' }, { cle: 'attendu', titre: 'Attendu', format: 'montant', alignement: 'droite' }, { cle: 'compte', titre: 'Compté', format: 'montant', alignement: 'droite' }, { cle: 'ecart', titre: 'Écart', format: 'montant', alignement: 'droite' }]} />
        </>
      )}
    </div>
  )
}

function RapportStock() {
  const depots = useOptions<Depot>('/depots/')
  const [type, setType] = useState('etat')
  const [depot, setDepot] = useState('')
  const { donnees, chargement, erreur } = useRapport<Record<string, any>>('stock', { type, depot }) // eslint-disable-line @typescript-eslint/no-explicit-any
  const types = { etat: t('État du stock'), valeur: t('Valeur du stock'), faible: t('Stock faible'), ruptures: t('Ruptures'), peremption: t('Péremptions') }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 sans-impression">
        <div><label className="etiquette">{t('Rapport')}</label><select className="champ" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(types).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="etiquette">{t('Dépôt')}</label><select className="champ" value={depot} onChange={(e) => setDepot(e.target.value)}><option value="">{t('Tous')}</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select></div>
      </div>
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <>
          {type === 'etat' && <TableauRapport nomFichier="etat-du-stock" lignes={donnees.lignes} colonnes={[{ cle: 'medicament', titre: 'Médicament' }, { cle: 'numero_lot', titre: 'Lot' }, { cle: 'depot', titre: 'Dépôt' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'date_peremption', titre: 'Péremption', format: 'date' }, { cle: 'valeur', titre: 'Valeur', format: 'montant', alignement: 'droite' }]} />}
          {type === 'valeur' && (
            <div className="space-y-4">
              <Totaux elements={[{ titre: t('Valeur totale (prix d\'achat)'), valeur: formaterMontant(donnees.synthese.valeur_totale) }, { titre: t('Médicaments en stock'), valeur: formaterNombre(donnees.synthese.nombre_medicaments) }, { titre: t('Lots en stock'), valeur: formaterNombre(donnees.synthese.nombre_lots) }]} />
              <TableauRapport nomFichier="valeur-par-depot" lignes={donnees.par_depot} colonnes={[{ cle: 'libelle', titre: 'Dépôt' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'valeur', titre: 'Valeur', format: 'montant', alignement: 'droite' }]} />
              <TableauRapport nomFichier="valeur-par-categorie" lignes={donnees.par_categorie} colonnes={[{ cle: 'libelle', titre: 'Catégorie' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'valeur', titre: 'Valeur', format: 'montant', alignement: 'droite' }]} />
            </div>
          )}
          {type === 'faible' && <TableauRapport nomFichier="stock-faible" lignes={donnees.lignes} colonnes={[{ cle: 'medicament', titre: 'Médicament' }, { cle: 'stock', titre: 'Stock', format: 'nombre', alignement: 'droite' }, { cle: 'minimum', titre: 'Minimum', format: 'nombre', alignement: 'droite' }]} />}
          {type === 'ruptures' && <TableauRapport nomFichier="ruptures" lignes={donnees.lignes} colonnes={[{ cle: 'medicament', titre: 'Médicament' }, { cle: 'stock', titre: 'Stock', format: 'nombre', alignement: 'droite' }]} />}
          {type === 'peremption' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">{t('Périmés')}</h3>
              <TableauRapport nomFichier="perimes" lignes={donnees.perimes} colonnes={[{ cle: 'medicament', titre: 'Médicament' }, { cle: 'numero_lot', titre: 'Lot' }, { cle: 'depot', titre: 'Dépôt' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'date_peremption', titre: 'Péremption', format: 'date' }]} />
              <h3 className="text-sm font-semibold">{t('Bientôt périmés (dans')}{' '}{donnees.seuil_jours} {' '}{t('jours)')}</h3>
              <TableauRapport nomFichier="bientot-perimes" lignes={donnees.bientot_perimes} colonnes={[{ cle: 'medicament', titre: 'Médicament' }, { cle: 'numero_lot', titre: 'Lot' }, { cle: 'depot', titre: 'Dépôt' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'date_peremption', titre: 'Péremption', format: 'date' }, { cle: 'jours_restants', titre: 'Jours restants', format: 'nombre', alignement: 'droite' }]} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RapportMouvements() {
  const p = usePeriode()
  const [categorie, setCategorie] = useState('')
  interface Reponse { synthese: { libelle: string; nombre: number; quantite: number }[]; mouvements: { date_mouvement: string; medicament_nom: string; numero_lot: string; depot_nom: string; type_libelle: string; quantite: number; reference: string; utilisateur_nom: string }[] }
  const { donnees, chargement, erreur } = useRapport<Reponse>('mouvements', { date_debut: p.debut, date_fin: p.fin, categorie })
  return (
    <div>
      <Periode {...p}><div><label className="etiquette">{t('Catégorie')}</label><select className="champ" value={categorie} onChange={(e) => setCategorie(e.target.value)}><option value="">{t('Tous les mouvements')}</option><option value="entrees">{t('Entrées')}</option><option value="sorties">{t('Sorties')}</option><option value="transferts">{t('Transferts')}</option><option value="ajustements">{t('Ajustements')}</option></select></div></Periode>
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <div className="space-y-4">
          <TableauRapport nomFichier="mouvements-synthese" lignes={donnees.synthese.map((s) => ({ ...s, libelle: traduireServeur(s.libelle) }))} colonnes={[{ cle: 'libelle', titre: 'Type de mouvement' }, { cle: 'nombre', titre: 'Mouvements', format: 'nombre', alignement: 'droite' }, { cle: 'quantite', titre: 'Quantité nette', format: 'nombre', alignement: 'droite' }]} />
          <h3 className="text-sm font-semibold">{t('Derniers mouvements (200 maximum)')}</h3>
          <TableauRapport nomFichier="mouvements-detail" lignes={donnees.mouvements.map((m) => ({ ...m, date: formaterDateHeure(m.date_mouvement), type_libelle: traduireServeur(m.type_libelle) }))}
            colonnes={[{ cle: 'date', titre: 'Date' }, { cle: 'medicament_nom', titre: 'Médicament' }, { cle: 'numero_lot', titre: 'Lot' }, { cle: 'depot_nom', titre: 'Dépôt' }, { cle: 'type_libelle', titre: 'Type' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'reference', titre: 'Référence' }, { cle: 'utilisateur_nom', titre: 'Utilisateur' }]} />
        </div>
      )}
    </div>
  )
}

export default function Rapports() {
  const [onglet, setOnglet] = useState<Onglet>('ventes')
  const onglets: { cle: Onglet; libelle: string }[] = [
    { cle: 'ventes', libelle: t('Ventes') }, { cle: 'achats', libelle: t('Achats') }, { cle: 'caisse', libelle: t('Caisse') },
    { cle: 'stock', libelle: t('Stock') }, { cle: 'mouvements', libelle: t('Mouvements') },
  ]
  return (
    <div>
      <EnTetePage titre={t('Rapports')} description={t('Chiffres essentiels, exportables en CSV ou imprimables.')} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 sans-impression">
        {onglets.map((o) => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm ${onglet === o.cle ? 'border-marque-600 font-medium text-marque-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{o.libelle}</button>
        ))}
      </div>
      <div className="zone-impression">
        {onglet === 'ventes' && <RapportVentes />}
        {onglet === 'achats' && <RapportAchats />}
        {onglet === 'caisse' && <RapportCaisse />}
        {onglet === 'stock' && <RapportStock />}
        {onglet === 'mouvements' && <RapportMouvements />}
        <PiedLogiciel />
      </div>
    </div>
  )
}
