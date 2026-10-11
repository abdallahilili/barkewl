import { History } from 'lucide-react'
import { useState } from 'react'
import { Badge, tonStatut } from '../../composants/Badge'
import { Modale } from '../../composants/Modale'
import { PageCrud } from '../../composants/PageCrud'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe } from '../../hooks/useListe'
import type { Client, Vente } from '../../types'
import { formaterDateHeure, formaterDateHeureExport, formaterMontant, libelleStatut } from '../../utilitaires/formatage'

function HistoriqueClient({ client, onFermer }: { client: Client | null; onFermer: () => void }) {
  const liste = useListe<Vente>(client ? `/clients/${client.id}/historique/` : '/clients/', { actif: !!client, taillePage: 10 })
  return (
    <Modale ouverte={!!client} titre={client ? `Historique d'achats — ${client.nom}` : ''} onFermer={onFermer} largeur="grande"
      pied={<button className="btn-secondaire" onClick={onFermer}>Fermer</button>}>
      <TableauDonnees<Vente> colonnes={[
        { cle: 'reference', titre: 'Reçu' },
        { cle: 'date_vente', titre: 'Date', rendu: (v) => formaterDateHeure(v.date_vente), exportRendu: (v) => formaterDateHeureExport(v.date_vente) },
        { cle: 'total', titre: 'Total', alignement: 'droite', rendu: (v) => formaterMontant(v.total) },
        { cle: 'modes_paiement', titre: 'Paiement' },
        { cle: 'statut', titre: 'État', rendu: (v) => <Badge ton={tonStatut(v.statut)}>{libelleStatut(v.statut)}</Badge> },
      ]} lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} cleLigne={(v) => v.id} messageVide="Aucun achat pour ce client."
        titre={client ? `Achats — ${client.nom}` : 'Achats'} />
    </Modale>
  )
}

export default function Clients() {
  const [client, setClient] = useState<Client | null>(null)
  return (
    <>
      <PageCrud<Client>
        titre="Clients" description="Fichier client facultatif : sert uniquement à retrouver l'historique des achats."
        endpoint="/clients/" nomElement="Client" libelleNouveau="Nouveau client" placeholderRecherche="Nom ou téléphone…"
        colonnes={[
          { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (c) => <span className="font-medium">{c.nom}</span> },
          { cle: 'telephone', titre: 'Téléphone' },
          { cle: 'adresse', titre: 'Adresse', cacheParDefaut: false },
          { cle: 'actif', titre: 'État', rendu: (c) => <Badge ton={c.actif ? 'vert' : 'gris'}>{c.actif ? 'Actif' : 'Désactivé'}</Badge> },
        ]}
        champs={[
          { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true },
          { nom: 'telephone', libelle: 'Téléphone', type: 'texte' },
          { nom: 'adresse', libelle: 'Adresse', type: 'texte' },
          { nom: 'actif', libelle: 'État', type: 'case', aide: 'Client actif', defaut: true },
          { nom: 'notes', libelle: 'Notes', type: 'zone' },
        ]}
        actionsLigne={(c) => <button className="btn-discret btn-petit" onClick={() => setClient(c)}><History size={14} /> Achats</button>}
      />
      <HistoriqueClient client={client} onFermer={() => setClient(null)} />
    </>
  )
}
