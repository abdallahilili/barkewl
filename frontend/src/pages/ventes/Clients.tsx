import { History } from 'lucide-react'
import { useState } from 'react'
import { Badge, tonStatut } from '../../composants/Badge'
import { Modale } from '../../composants/Modale'
import { PageCrud } from '../../composants/PageCrud'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe } from '../../hooks/useListe'
import type { Client, Vente } from '../../types'
import { formaterDateHeure, formaterDateHeureExport, formaterMontant, libelleStatut } from '../../utilitaires/formatage'

import { t } from '../../i18n'
function HistoriqueClient({ client, onFermer }: { client: Client | null; onFermer: () => void }) {
  const liste = useListe<Vente>(client ? `/clients/${client.id}/historique/` : '/clients/', { actif: !!client, taillePage: 10 })
  return (
    <Modale ouverte={!!client} titre={client ? t('Historique d\'achats — {nom}', { nom: client.nom }) : ''} onFermer={onFermer} largeur="grande"
      pied={<button className="btn-secondaire" onClick={onFermer}>{t('Fermer')}</button>}>
      <TableauDonnees<Vente> colonnes={[
        { cle: 'reference', titre: t('Reçu') },
        { cle: 'date_vente', titre: t('Date'), rendu: (v) => formaterDateHeure(v.date_vente), exportRendu: (v) => formaterDateHeureExport(v.date_vente) },
        { cle: 'total', titre: t('Total'), alignement: 'droite', rendu: (v) => formaterMontant(v.total) },
        { cle: 'modes_paiement', titre: t('Paiement') },
        { cle: 'statut', titre: t('État'), rendu: (v) => <Badge ton={tonStatut(v.statut)}>{libelleStatut(v.statut)}</Badge> },
      ]} lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
        nombrePages={liste.nombrePages} onPage={liste.setPage} cleLigne={(v) => v.id} messageVide={t('Aucun achat pour ce client.')}
        titre={client ? t('Achats — {nom}', { nom: client.nom }) : t('Achats')} />
    </Modale>
  )
}

export default function Clients() {
  const [client, setClient] = useState<Client | null>(null)
  return (
    <>
      <PageCrud<Client>
        titre={t('Clients')} description={t('Fichier client facultatif : sert uniquement à retrouver l\'historique des achats.')}
        endpoint="/clients/" nomElement={t('Client')} libelleNouveau={t('Nouveau client')} placeholderRecherche={t('Nom ou téléphone…')}
        colonnes={[
          { cle: 'nom', titre: t('Nom'), tri: 'nom', rendu: (c) => <span className="font-medium">{c.nom}</span> },
          { cle: 'telephone', titre: t('Téléphone') },
          { cle: 'adresse', titre: t('Adresse'), cacheParDefaut: false },
          { cle: 'actif', titre: t('État'), rendu: (c) => <Badge ton={c.actif ? 'vert' : 'gris'}>{c.actif ? t('Actif') : t('Désactivé')}</Badge> },
        ]}
        champs={[
          { nom: 'nom', libelle: t('Nom'), type: 'texte', requis: true },
          { nom: 'telephone', libelle: t('Téléphone'), type: 'texte' },
          { nom: 'adresse', libelle: t('Adresse'), type: 'texte' },
          { nom: 'actif', libelle: t('État'), type: 'case', aide: t('Client actif'), defaut: true },
          { nom: 'notes', libelle: t('Notes'), type: 'zone' },
        ]}
        actionsLigne={(c) => <button className="btn-discret btn-petit" onClick={() => setClient(c)}><History size={14} /> {' '}{t('Achats')}</button>}
      />
      <HistoriqueClient client={client} onFermer={() => setClient(null)} />
    </>
  )
}
