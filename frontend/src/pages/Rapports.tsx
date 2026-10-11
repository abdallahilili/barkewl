import { Download, FileText, Printer } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { Chargement, EnTetePage, MessageErreur } from '../composants/EnTetePage'
import { useAuth } from '../hooks/useAuth'
import { useOptions } from '../hooks/useListe'
import { api } from '../services/api'
import type { Depot } from '../types'
import { extraireErreur } from '../utilitaires/erreurs'
import { exporterCsv, exporterPdf } from '../utilitaires/exports'
import { aujourdhui, formaterDate, formaterDateExport, formaterDateHeure, formaterMontant, formaterNombre, ilYaJours } from '../utilitaires/formatage'

type Onglet = 'ventes' | 'achats' | 'caisse' | 'stock' | 'mouvements'
type Ligne = Record<string, string | number | null>

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
  const titre = nomFichier.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
  return (
    <div className="carte">
      <div className="flex justify-end gap-2 border-b border-slate-100 px-3 py-2 sans-impression">
        <button className="btn-secondaire btn-petit" onClick={() => exporterCsv(`${nomFichier}.csv`, colonnes.map((c) => c.titre), lignes.map((l) => colonnes.map((c) => formaterExport(l[c.cle], c.format))))}><Download size={14} /> Exporter en CSV</button>
        <button className="btn-secondaire btn-petit" onClick={() => exporterPdf({
          titre, nomFichier, imprimePar: utilisateur?.nom_complet ?? '—',
          entetes: colonnes.map((c) => c.titre), lignes: lignes.map((l) => colonnes.map((c) => formaterExport(l[c.cle], c.format))),
        })}><FileText size={14} /> Exporter en PDF</button>
        <button className="btn-secondaire btn-petit" onClick={() => window.print()}><Printer size={14} /> Imprimer</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>{colonnes.map((c) => <th key={c.cle} className={`whitespace-nowrap px-3 py-2.5 font-medium ${c.alignement === 'droite' ? 'text-right' : 'text-left'}`}>{c.titre}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.length === 0 && <tr><td colSpan={colonnes.length} className="px-3 py-8 text-center text-slate-500">Aucune donnée pour cette période.</td></tr>}
            {lignes.map((l, i) => (
              <tr key={i}>{colonnes.map((c) => <td key={c.cle} className={`px-3 py-2 ${c.alignement === 'droite' ? 'text-right' : ''}`}>{formater(l[c.cle], c.format)}</td>)}</tr>
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
      <div><label className="etiquette">Du</label><input type="date" className="champ" value={debut} onChange={(e) => setDebut(e.target.value)} /></div>
      <div><label className="etiquette">Au</label><input type="date" className="champ" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
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
      <Periode {...p}><div><label className="etiquette">Regrouper par</label><select className="champ" value={regroupement} onChange={(e) => setRegroupement(e.target.value)}>{Object.entries(titres).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></Periode>
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <>
          <Totaux elements={[{ titre: "Chiffre d'affaires", valeur: formaterMontant(donnees.chiffre_affaires) }, { titre: 'Nombre de ventes', valeur: formaterNombre(donnees.nombre_ventes) }]} />
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
      <Periode {...p}><div><label className="etiquette">Regrouper par</label><select className="champ" value={regroupement} onChange={(e) => setRegroupement(e.target.value)}><option value="jour">Jour</option><option value="fournisseur">Fournisseur</option></select></div></Periode>
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <>
          <Totaux elements={[{ titre: 'Total des achats', valeur: formaterMontant(donnees.total_achats) }, { titre: 'Payé', valeur: formaterMontant(donnees.total_paye) }, { titre: 'Reste à payer', valeur: formaterMontant(donnees.reste_a_payer) }, { titre: "Nombre d'achats", valeur: formaterNombre(donnees.nombre_achats) }]} />
          <TableauRapport nomFichier={`achats-par-${regroupement}`} lignes={donnees.lignes}
            colonnes={[{ cle: 'libelle', titre: regroupement === 'jour' ? 'Jour' : 'Fournisseur' }, { cle: 'nombre', titre: 'Achats', format: 'nombre', alignement: 'droite' }, { cle: 'total', titre: 'Total', format: 'montant', alignement: 'droite' }, { cle: 'paye', titre: 'Payé', format: 'montant', alignement: 'droite' }, { cle: 'reste', titre: 'Reste', format: 'montant', alignement: 'droite' }]} />
        </>
      )}
    </div>
  )
}

function RapportCaisse() {
  const p = usePeriode()
  interface Reponse { sessions: { id: number; date_ouverture: string; caissier_nom: string; caisse_nom: string; statut: string; montant_initial: number; montant_attendu: number | null; montant_reel: number | null; ecart: number | null; resume: { total_ventes: number; total_especes: number; total_autres_paiements: number } }[]; total_ventes: number; total_especes: number; total_autres_paiements: number; total_ecarts: number; total_manquants: number }
  const { donnees, chargement, erreur } = useRapport<Reponse>('caisse', { date_debut: p.debut, date_fin: p.fin })
  return (
    <div>
      <Periode {...p} />
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <>
          <Totaux elements={[{ titre: 'Ventes (sessions clôturées)', valeur: formaterMontant(donnees.total_ventes) }, { titre: 'Encaissé en espèces', valeur: formaterMontant(donnees.total_especes) }, { titre: 'Autres paiements', valeur: formaterMontant(donnees.total_autres_paiements) }, { titre: 'Écarts cumulés (manquants)', valeur: `${formaterMontant(donnees.total_ecarts)} (${formaterMontant(donnees.total_manquants)})` }]} />
          <TableauRapport nomFichier="sessions-de-caisse"
            lignes={donnees.sessions.map((s) => ({ id: s.id, date: s.date_ouverture, caissier: s.caissier_nom, caisse: s.caisse_nom, statut: s.statut === 'OUVERTE' ? 'Ouverte' : 'Clôturée', ventes: s.resume.total_ventes, especes: s.resume.total_especes, autres: s.resume.total_autres_paiements, attendu: s.montant_attendu ?? s.resume.total_especes, compte: s.montant_reel, ecart: s.ecart }))}
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
  const types = { etat: 'État du stock', valeur: 'Valeur du stock', faible: 'Stock faible', ruptures: 'Ruptures', peremption: 'Péremptions' }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 sans-impression">
        <div><label className="etiquette">Rapport</label><select className="champ" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(types).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="etiquette">Dépôt</label><select className="champ" value={depot} onChange={(e) => setDepot(e.target.value)}><option value="">Tous</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select></div>
      </div>
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <>
          {type === 'etat' && <TableauRapport nomFichier="etat-du-stock" lignes={donnees.lignes} colonnes={[{ cle: 'medicament', titre: 'Médicament' }, { cle: 'numero_lot', titre: 'Lot' }, { cle: 'depot', titre: 'Dépôt' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'date_peremption', titre: 'Péremption', format: 'date' }, { cle: 'valeur', titre: 'Valeur', format: 'montant', alignement: 'droite' }]} />}
          {type === 'valeur' && (
            <div className="space-y-4">
              <Totaux elements={[{ titre: "Valeur totale (prix d'achat)", valeur: formaterMontant(donnees.synthese.valeur_totale) }, { titre: 'Médicaments en stock', valeur: formaterNombre(donnees.synthese.nombre_medicaments) }, { titre: 'Lots en stock', valeur: formaterNombre(donnees.synthese.nombre_lots) }]} />
              <TableauRapport nomFichier="valeur-par-depot" lignes={donnees.par_depot} colonnes={[{ cle: 'libelle', titre: 'Dépôt' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'valeur', titre: 'Valeur', format: 'montant', alignement: 'droite' }]} />
              <TableauRapport nomFichier="valeur-par-categorie" lignes={donnees.par_categorie} colonnes={[{ cle: 'libelle', titre: 'Catégorie' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'valeur', titre: 'Valeur', format: 'montant', alignement: 'droite' }]} />
            </div>
          )}
          {type === 'faible' && <TableauRapport nomFichier="stock-faible" lignes={donnees.lignes} colonnes={[{ cle: 'medicament', titre: 'Médicament' }, { cle: 'stock', titre: 'Stock', format: 'nombre', alignement: 'droite' }, { cle: 'minimum', titre: 'Minimum', format: 'nombre', alignement: 'droite' }]} />}
          {type === 'ruptures' && <TableauRapport nomFichier="ruptures" lignes={donnees.lignes} colonnes={[{ cle: 'medicament', titre: 'Médicament' }, { cle: 'stock', titre: 'Stock', format: 'nombre', alignement: 'droite' }]} />}
          {type === 'peremption' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Périmés</h3>
              <TableauRapport nomFichier="perimes" lignes={donnees.perimes} colonnes={[{ cle: 'medicament', titre: 'Médicament' }, { cle: 'numero_lot', titre: 'Lot' }, { cle: 'depot', titre: 'Dépôt' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'date_peremption', titre: 'Péremption', format: 'date' }]} />
              <h3 className="text-sm font-semibold">Bientôt périmés (dans {donnees.seuil_jours} jours)</h3>
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
      <Periode {...p}><div><label className="etiquette">Catégorie</label><select className="champ" value={categorie} onChange={(e) => setCategorie(e.target.value)}><option value="">Tous les mouvements</option><option value="entrees">Entrées</option><option value="sorties">Sorties</option><option value="transferts">Transferts</option><option value="ajustements">Ajustements</option></select></div></Periode>
      <MessageErreur message={erreur} />
      {chargement && !donnees ? <Chargement /> : donnees && (
        <div className="space-y-4">
          <TableauRapport nomFichier="mouvements-synthese" lignes={donnees.synthese} colonnes={[{ cle: 'libelle', titre: 'Type de mouvement' }, { cle: 'nombre', titre: 'Mouvements', format: 'nombre', alignement: 'droite' }, { cle: 'quantite', titre: 'Quantité nette', format: 'nombre', alignement: 'droite' }]} />
          <h3 className="text-sm font-semibold">Derniers mouvements (200 maximum)</h3>
          <TableauRapport nomFichier="mouvements-detail" lignes={donnees.mouvements.map((m) => ({ ...m, date: formaterDateHeure(m.date_mouvement) }))}
            colonnes={[{ cle: 'date', titre: 'Date' }, { cle: 'medicament_nom', titre: 'Médicament' }, { cle: 'numero_lot', titre: 'Lot' }, { cle: 'depot_nom', titre: 'Dépôt' }, { cle: 'type_libelle', titre: 'Type' }, { cle: 'quantite', titre: 'Quantité', format: 'nombre', alignement: 'droite' }, { cle: 'reference', titre: 'Référence' }, { cle: 'utilisateur_nom', titre: 'Utilisateur' }]} />
        </div>
      )}
    </div>
  )
}

export default function Rapports() {
  const [onglet, setOnglet] = useState<Onglet>('ventes')
  const onglets: { cle: Onglet; libelle: string }[] = [
    { cle: 'ventes', libelle: 'Ventes' }, { cle: 'achats', libelle: 'Achats' }, { cle: 'caisse', libelle: 'Caisse' },
    { cle: 'stock', libelle: 'Stock' }, { cle: 'mouvements', libelle: 'Mouvements' },
  ]
  return (
    <div>
      <EnTetePage titre="Rapports" description="Chiffres essentiels, exportables en CSV ou imprimables." />
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
      </div>
    </div>
  )
}
