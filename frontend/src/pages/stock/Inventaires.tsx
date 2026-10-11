import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, tonStatut } from '../../composants/Badge'
import { Champ } from '../../composants/Champ'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { Modale } from '../../composants/Modale'
import { useNotifier } from '../../composants/Notifications'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe, useOptions } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Depot, Inventaire } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { formaterDateHeure, formaterDateHeureExport, libelleStatut } from '../../utilitaires/formatage'

export default function Inventaires() {
  const navigate = useNavigate()
  const notifier = useNotifier()
  const depots = useOptions<Depot>('/depots/', { actif: 1 })
  const [statut, setStatut] = useState('')
  const liste = useListe<Inventaire>('/inventaires/', { filtres: { statut }, triInitial: '-date_creation' })
  const [modale, setModale] = useState(false)
  const [depot, setDepot] = useState('')
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const creer = async (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    try {
      const { data } = await api.post<Inventaire>('/inventaires/', { depot: Number(depot), note })
      notifier.succes(`Inventaire ${data.reference} créé : le stock théorique a été chargé.`)
      navigate(`/stock/inventaires/${data.id}`)
    } catch (err) { setErreur(extraireErreur(err)) }
  }

  return (
    <div>
      <EnTetePage titre="Inventaires" description="Comptez le stock réel d'un dépôt. Les écarts sont corrigés par des mouvements d'ajustement tracés."
        actions={<button className="btn-primaire" onClick={() => { setErreur(null); setModale(true) }}>Nouvel inventaire</button>} />
      <div className="mb-3"><select className="champ w-auto" value={statut} onChange={(e) => setStatut(e.target.value)} aria-label="État"><option value="">Tous les états</option><option value="BROUILLON">En cours</option><option value="VALIDE">Validés</option><option value="ANNULE">Annulés</option></select></div>
      <TableauDonnees<Inventaire>
        colonnes={[
          { cle: 'reference', titre: 'Référence', tri: 'reference', rendu: (i) => <span className="font-medium">{i.reference}</span> },
          { cle: 'date_creation', titre: 'Date', tri: 'date_creation', rendu: (i) => formaterDateHeure(i.date_creation), exportRendu: (i) => formaterDateHeureExport(i.date_creation) },
          { cle: 'depot_nom', titre: 'Dépôt' },
          { cle: 'nombre_lignes', titre: 'Lignes', alignement: 'droite' },
          { cle: 'nombre_ecarts', titre: 'Écarts', alignement: 'droite', rendu: (i) => (i.nombre_ecarts ? <span className="font-semibold text-amber-700">{i.nombre_ecarts}</span> : 0) },
          { cle: 'utilisateur_nom', titre: 'Créé par' },
          { cle: 'statut', titre: 'État', rendu: (i) => <Badge ton={tonStatut(i.statut)}>{i.statut === 'BROUILLON' ? 'En cours' : libelleStatut(i.statut)}</Badge> },
        ]}
        lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} tri={liste.tri} onTri={liste.setTri} cleLigne={(i) => i.id}
        onClicLigne={(i) => navigate(`/stock/inventaires/${i.id}`)} messageVide="Aucun inventaire." titre="Inventaires" />
      <Modale ouverte={modale} titre="Nouvel inventaire" onFermer={() => setModale(false)} largeur="petite"
        pied={<><button className="btn-secondaire" onClick={() => setModale(false)}>Annuler</button><button className="btn-primaire" type="submit" form="formulaire-inventaire">Créer l'inventaire</button></>}>
        <form id="formulaire-inventaire" onSubmit={creer} className="space-y-3">
          <MessageErreur message={erreur} />
          <Champ libelle="Dépôt à inventorier" requis>
            <select className="champ" value={depot} onChange={(e) => setDepot(e.target.value)} required><option value="">— Choisir —</option>{depots.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}</select>
          </Champ>
          <Champ libelle="Note"><input className="champ" value={note} onChange={(e) => setNote(e.target.value)} /></Champ>
          <p className="text-xs text-slate-500">Le stock actuel du dépôt est copié comme « quantité théorique ». Vous saisirez ensuite les quantités comptées.</p>
        </form>
      </Modale>
    </div>
  )
}
