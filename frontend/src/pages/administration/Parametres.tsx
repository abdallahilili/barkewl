import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { Badge } from '../../composants/Badge'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { useNotifier } from '../../composants/Notifications'
import { PageCrud } from '../../composants/PageCrud'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Caisse, ModePaiement, Parametre } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { definirDevise, definirGestionRayonnages, definirLogoPharmacie, definirNomPharmacie, formaterDateHeure, formaterDateHeureExport } from '../../utilitaires/formatage'
import type { Depot } from '../../types'

type Onglet = 'general' | 'caisses' | 'paiements' | 'audit'

const libellesParametres: Record<string, string> = {
  logo_pharmacie: 'Logo de la pharmacie',
  nom_pharmacie: 'Nom de la pharmacie',
  adresse_pharmacie: 'Adresse',
  telephone_pharmacie: 'Téléphone',
  telephone_pharmacie_2: 'Téléphone 2',
  telephone_pharmacie_3: 'Téléphone 3',
  devise: 'Devise',
  message_recu: 'Message en bas du reçu',
  jours_alerte_peremption: "Alerte « bientôt périmé » (jours avant péremption)",
  stock_negatif_autorise: 'Autoriser un stock négatif',
  gestion_rayonnages_active: 'Gestion des rayonnages',
}

const TAILLE_LOGO_MAX = 500 * 1024

function ParametresGeneraux() {
  const notifier = useNotifier()
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    api.get<Parametre[]>('/parametres/').then((r) => setValeurs(Object.fromEntries(r.data.map((p) => [p.cle, p.valeur])))).catch((e) => setErreur(extraireErreur(e)))
  }, [])

  const gererLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    if (fichier.size > TAILLE_LOGO_MAX) { notifier.erreur('Image trop volumineuse (maximum 500 Ko).'); return }
    const lecteur = new FileReader()
    lecteur.onload = () => setValeurs((v) => ({ ...v, logo_pharmacie: String(lecteur.result) }))
    lecteur.readAsDataURL(fichier)
  }

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreur(null)
    try {
      await api.put('/parametres/', valeurs)
      definirDevise(valeurs.devise)
      definirGestionRayonnages(valeurs.gestion_rayonnages_active === '1')
      definirNomPharmacie(valeurs.nom_pharmacie)
      definirLogoPharmacie(valeurs.logo_pharmacie)
      notifier.succes('Paramètres enregistrés.')
    } catch (err) { setErreur(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  const ordre = [
    'logo_pharmacie',
    'nom_pharmacie',
    'adresse_pharmacie',
    'telephone_pharmacie',
    'telephone_pharmacie_2',
    'telephone_pharmacie_3',
    'devise',
    'message_recu',
    'jours_alerte_peremption',
    'stock_negatif_autorise',
    'gestion_rayonnages_active',
  ]
  return (
    <form onSubmit={enregistrer} className="carte max-w-2xl space-y-4 p-5">
      <MessageErreur message={erreur} />
      {ordre.map((cle) => (
        <div key={cle}>
          {cle === 'logo_pharmacie' ? (
            <>
              <label className="etiquette">{libellesParametres[cle]}</label>
              <div className="flex items-center gap-3">
                {valeurs.logo_pharmacie && <img src={valeurs.logo_pharmacie} alt="Logo de la pharmacie" className="h-14 w-14 rounded border border-slate-200 object-contain" />}
                <input type="file" accept="image/*" className="champ" onChange={gererLogo} />
                {valeurs.logo_pharmacie && (
                  <button type="button" className="btn-discret btn-petit" onClick={() => setValeurs((v) => ({ ...v, logo_pharmacie: '' }))}>Retirer</button>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">Affiché dans l'en-tête des reçus imprimés (image, 500 Ko maximum).</p>
            </>
          ) : cle === 'stock_negatif_autorise' || cle === 'gestion_rayonnages_active' ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={valeurs[cle] === '1'} onChange={(e) => setValeurs((v) => ({ ...v, [cle]: e.target.checked ? '1' : '0' }))} />
              <span><span className="font-medium">{libellesParametres[cle]}</span><br /><span className="text-slate-500">
                {cle === 'stock_negatif_autorise'
                  ? 'Déconseillé : une vente ne devrait jamais dépasser le stock réel.'
                  : "Affiche l'emplacement en rayon du médicament à la caisse et permet de le renseigner sur sa fiche."}
              </span></span>
            </label>
          ) : (
            <>
              <label className="etiquette" htmlFor={cle}>{libellesParametres[cle]}</label>
              <input id={cle} className="champ" type={cle === 'jours_alerte_peremption' ? 'number' : 'text'} min={1} value={valeurs[cle] ?? ''}
                onChange={(e) => setValeurs((v) => ({ ...v, [cle]: e.target.value }))} />
            </>
          )}
        </div>
      ))}
      <button className="btn-primaire" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button>
    </form>
  )
}

interface EntreeAudit { id: number; date_action: string; utilisateur: string; action: string; entite: string; reference: string; description: string; ancienne_valeur: unknown; nouvelle_valeur: unknown }

function JournalAudit() {
  const liste = useListe<EntreeAudit>('/journal-audit/', { taillePage: 25 })
  return (
    <TableauDonnees<EntreeAudit>
      colonnes={[
        { cle: 'date_action', titre: 'Date', rendu: (a) => formaterDateHeure(a.date_action), exportRendu: (a) => formaterDateHeureExport(a.date_action) },
        { cle: 'utilisateur', titre: 'Utilisateur' },
        { cle: 'action', titre: 'Action', rendu: (a) => <Badge ton="bleu">{a.action}</Badge> },
        { cle: 'entite', titre: 'Objet' },
        { cle: 'reference', titre: 'Référence' },
        { cle: 'detail', titre: 'Détail', rendu: (a) => (
          <span className="text-xs text-slate-600">{a.description || (a.ancienne_valeur ? `${JSON.stringify(a.ancienne_valeur)} → ${JSON.stringify(a.nouvelle_valeur)}` : '')}</span>
        ), exportRendu: (a) => a.description || (a.ancienne_valeur ? `${JSON.stringify(a.ancienne_valeur)} -> ${JSON.stringify(a.nouvelle_valeur)}` : '') },
      ]}
      titre="Journal d'audit"
      lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
      nombrePages={liste.nombrePages} onPage={liste.setPage} cleLigne={(a) => a.id} messageVide="Aucune opération enregistrée." />
  )
}

export default function Parametres() {
  const [onglet, setOnglet] = useState<Onglet>('general')
  const onglets: { cle: Onglet; libelle: string }[] = [
    { cle: 'general', libelle: 'Général' }, { cle: 'caisses', libelle: 'Caisses' },
    { cle: 'paiements', libelle: 'Modes de paiement' }, { cle: 'audit', libelle: "Journal d'audit" },
  ]
  return (
    <div>
      <EnTetePage titre="Paramètres" description="Informations du reçu, seuils d'alerte, caisses et modes de paiement." />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {onglets.map((o) => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm ${onglet === o.cle ? 'border-marque-600 font-medium text-marque-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            {o.libelle}
          </button>
        ))}
      </div>
      {onglet === 'general' && <ParametresGeneraux />}
      {onglet === 'caisses' && (
        <PageCrud<Caisse> sansEntete titre="Caisses" endpoint="/caisses/" nomElement="Caisse" libelleNouveau="Nouvelle caisse" placeholderRecherche="Rechercher une caisse…"
          colonnes={[
            { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (c) => <span className="font-medium">{c.nom}</span> },
            { cle: 'depot_nom', titre: 'Dépôt de vente' },
            { cle: 'active', titre: 'État', rendu: (c) => <Badge ton={c.active ? 'vert' : 'gris'}>{c.active ? 'Active' : 'Désactivée'}</Badge> },
          ]}
          champs={[
            { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true },
            { nom: 'depot', libelle: 'Dépôt de vente', type: 'select', requis: true, source: { endpoint: '/depots/', libelle: (d: Depot) => d.nom } },
            { nom: 'active', libelle: 'État', type: 'case', aide: 'Caisse active', defaut: true },
          ]} />
      )}
      {onglet === 'paiements' && (
        <PageCrud<ModePaiement> sansEntete titre="Modes de paiement" endpoint="/modes-paiement/" nomElement="Mode de paiement" libelleNouveau="Nouveau mode de paiement" placeholderRecherche="Rechercher…"
          colonnes={[
            { cle: 'nom', titre: 'Nom', tri: 'nom', rendu: (m) => <span className="font-medium">{m.nom}</span> },
            { cle: 'type', titre: 'Type', rendu: (m) => ({ ESPECES: 'Espèces', MOBILE: 'Paiement mobile', CARTE: 'Carte', VIREMENT: 'Virement', AUTRE: 'Autre' }[m.type]) },
            { cle: 'actif', titre: 'État', rendu: (m) => <Badge ton={m.actif ? 'vert' : 'gris'}>{m.actif ? 'Actif' : 'Désactivé'}</Badge> },
          ]}
          champs={[
            { nom: 'nom', libelle: 'Nom', type: 'texte', requis: true },
            { nom: 'type', libelle: 'Type', type: 'select', requis: true, defaut: 'ESPECES',
              options: [{ valeur: 'ESPECES', libelle: 'Espèces' }, { valeur: 'MOBILE', libelle: 'Paiement mobile' }, { valeur: 'CARTE', libelle: 'Carte bancaire' }, { valeur: 'VIREMENT', libelle: 'Virement' }, { valeur: 'AUTRE', libelle: 'Autre' }] },
            { nom: 'actif', libelle: 'État', type: 'case', aide: 'Mode de paiement actif', defaut: true },
          ]} />
      )}
      {onglet === 'audit' && <JournalAudit />}
    </div>
  )
}
