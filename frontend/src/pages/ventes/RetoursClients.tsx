import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../composants/Badge'
import { BarreRecherche } from '../../composants/BarreRecherche'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { ModaleRetour } from '../../composants/ModaleRetour'
import { useNotifier } from '../../composants/Notifications'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { RetourClient, Vente } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { formaterDateHeure, formaterDateHeureExport, formaterMontant } from '../../utilitaires/formatage'

import { t, traduireServeur } from '../../i18n'

/** Recherche d'une vente validée (n° de reçu, client) dont on veut retourner des articles. */
function ChoixVente({ ouverte, onFermer, onChoisir }: { ouverte: boolean; onFermer: () => void; onChoisir: (v: Vente) => void }) {
  const liste = useListe<Vente>('/ventes/', { filtres: { statut: 'VALIDEE' }, taillePage: 8, triInitial: '-date_vente', actif: ouverte })
  return (
    <Modale ouverte={ouverte} titre={t('Nouveau retour client')} onFermer={onFermer} largeur="grande">
      <p className="mb-3 text-sm text-slate-600">{t('Retrouvez la vente d\'origine par son numéro de reçu ou le nom du client.')}</p>
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={t('N° de reçu, client…')} />
      <MessageErreur message={liste.erreur} />
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-start text-slate-600"><tr><th className="px-3 py-2">{t('Reçu')}</th><th className="px-3 py-2">{t('Date')}</th><th className="px-3 py-2">{t('Client')}</th><th className="px-3 py-2 text-end">{t('Total')}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {!liste.chargement && liste.lignes.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">{t('Aucune vente trouvée.')}</td></tr>}
            {liste.lignes.map((v) => (
              <tr key={v.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onChoisir(v)}>
                <td className="px-3 py-2 font-medium">{v.reference}</td>
                <td className="px-3 py-2">{formaterDateHeure(v.date_vente)}</td>
                <td className="px-3 py-2">{v.client_nom ?? '—'}</td>
                <td className="px-3 py-2 text-end">{formaterMontant(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modale>
  )
}

export default function RetoursClients() {
  const notifier = useNotifier()
  const [debut, setDebut] = useState('')
  const [fin, setFin] = useState('')
  const liste = useListe<RetourClient>('/retours-clients/', { filtres: { date_debut: debut, date_fin: fin }, triInitial: '-date_retour' })
  const [choixVente, setChoixVente] = useState(false)
  const [venteRetour, setVenteRetour] = useState<Vente | null>(null)
  const [detail, setDetail] = useState<RetourClient | null>(null)

  const choisirVente = async (v: Vente) => {
    try {
      setVenteRetour((await api.get<Vente>(`/ventes/${v.id}/`)).data)
      setChoixVente(false)
    } catch (e) { notifier.erreur(extraireErreur(e)) }
  }
  const ouvrirDetail = async (r: RetourClient) => {
    try { setDetail((await api.get<RetourClient>(`/retours-clients/${r.id}/`)).data) } catch (e) { notifier.erreur(extraireErreur(e)) }
  }

  return (
    <div>
      <EnTetePage titre={t('Retours clients')} description={t('Articles rendus par les clients. Le remboursement est enregistré en caisse ; un produit revendable retourne en stock.')}
        actions={<button className="btn-primaire" onClick={() => setChoixVente(true)}><Plus size={16} /> {' '}{t('Nouveau retour')}</button>} />
      <BarreRecherche valeur={liste.recherche} onChange={liste.setRecherche} placeholder={t('N° de retour, de reçu, client…')}>
        <input type="date" className="champ w-auto" value={debut} onChange={(e) => setDebut(e.target.value)} aria-label={t('Du')} />
        <input type="date" className="champ w-auto" value={fin} onChange={(e) => setFin(e.target.value)} aria-label={t('Au')} />
      </BarreRecherche>
      <TableauDonnees<RetourClient>
        colonnes={[
          { cle: 'reference', titre: 'Retour', tri: 'reference', rendu: (r) => <span className="font-medium">{r.reference}</span> },
          { cle: 'date_retour', titre: 'Date', tri: 'date_retour', rendu: (r) => formaterDateHeure(r.date_retour), exportRendu: (r) => formaterDateHeureExport(r.date_retour) },
          { cle: 'vente_reference', titre: 'Reçu' },
          { cle: 'client_nom', titre: 'Client', rendu: (r) => r.client_nom ?? '—' },
          { cle: 'motif', titre: 'Motif' },
          { cle: 'mode_paiement_nom', titre: 'Remboursé en' },
          { cle: 'utilisateur_nom', titre: 'Fait par', cacheParDefaut: true },
          { cle: 'total', titre: 'Remboursement', alignement: 'droite', tri: 'total', rendu: (r) => formaterMontant(r.total), somme: (r) => Number(r.total) },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(r) => r.id}
        onClicLigne={ouvrirDetail} messageVide={t('Aucun retour trouvé.')} titre={t('Retours clients')} idTableau="retours-clients"
        endpoint="/retours-clients/" libelleTotal="Total remboursé"
        resume={liste.montantTotal != null ? <span className="font-semibold text-slate-700">{t('Total remboursé')}{' : '}{formaterMontant(liste.montantTotal)}</span> : undefined}
        parametresRequete={{ date_debut: debut, date_fin: fin, ...(liste.recherche ? { recherche: liste.recherche } : {}), ...(liste.tri ? { tri: liste.tri } : {}) }} />

      <ChoixVente ouverte={choixVente} onFermer={() => setChoixVente(false)} onChoisir={choisirVente} />
      <ModaleRetour vente={venteRetour} onFermer={() => setVenteRetour(null)}
        onFait={(r) => { setVenteRetour(null); notifier.succes(t('Retour {reference} enregistré : remboursement de {montant} en caisse.', { reference: r.reference, montant: formaterMontant(r.total) })); liste.recharger() }} />

      <Modale ouverte={!!detail} titre={detail ? t('Retour {reference}', { reference: detail.reference }) : ''} onFermer={() => setDetail(null)} largeur="grande"
        pied={<button className="btn-secondaire" onClick={() => setDetail(null)}>{t('Fermer')}</button>}>
        {detail && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {formaterDateHeure(detail.date_retour)} {' '}{t('· Vente :')}{' '}{detail.vente_reference}{detail.client_nom ? t(' · Client : {nom}', { nom: detail.client_nom }) : ''} {' '}{t('· Fait par :')}{' '}{detail.utilisateur_nom}
              {detail.approuve_par_nom && <>{' · '}{t('Approuvé par {nom}', { nom: detail.approuve_par_nom })}</>}
            </p>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm">{t('Motif :')}{' '}{traduireServeur(detail.motif)}</p>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-start text-slate-600"><tr><th className="px-3 py-2">{t('Médicament')}</th><th className="px-3 py-2">{t('Lot')}</th><th className="px-3 py-2 text-end">{t('Qté')}</th><th className="px-3 py-2">{t('État du produit')}</th><th className="px-3 py-2 text-end">{t('Montant')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.lignes?.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">{l.medicament_nom}</td><td className="px-3 py-2">{l.numero_lot}</td>
                      <td className="px-3 py-2 text-end">{l.quantite}{l.conditionnement !== 'BOITE' && <span className="text-slate-500"> {l.conditionnement_libelle}</span>}</td>
                      <td className="px-3 py-2"><Badge ton={l.etat === 'REVENDABLE' ? 'vert' : 'orange'}>{l.etat === 'REVENDABLE' ? t('Revendable') : t('Non revendable')}</Badge></td>
                      <td className="px-3 py-2 text-end">{formaterMontant(l.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-end text-lg font-semibold">{t('Remboursé en {mode} :', { mode: detail.mode_paiement_nom })}{' '}{formaterMontant(detail.total)}</p>
          </div>
        )}
      </Modale>
    </div>
  )
}
