import { Building2, FileText, Pill, Trash2, Upload } from 'lucide-react'
import { ChangeEvent, FormEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { Badge } from '../../composants/Badge'
import { EditeurTexteRiche } from '../../composants/EditeurTexteRiche'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { useNotifier } from '../../composants/Notifications'
import { PageCrud } from '../../composants/PageCrud'
import { TableauDonnees } from '../../composants/TableauDonnees'
import { useListe } from '../../hooks/useListe'
import { api } from '../../services/api'
import type { Caisse, ModePaiement, Parametre } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { definirDevise, definirGestionRayonnages, definirLogoPharmacie, definirNomPharmacie, formaterDateHeure, formaterDateHeureExport } from '../../utilitaires/formatage'
import { lireEntete, lireLogo } from '../../utilitaires/images'
import type { Depot } from '../../types'

type Section = 'pharmacie' | 'documents' | 'medicaments'
type Onglet = Section | 'caisses' | 'paiements' | 'audit'
type Valeurs = Record<string, string>

// Paramètres enregistrés par chaque section (chaque onglet n'envoie que les siens).
const CLES_SECTION: Record<Section, string[]> = {
  pharmacie: [
    'logo_pharmacie', 'entete_image', 'nom_pharmacie', 'adresse_pharmacie', 'telephone_pharmacie', 'telephone_pharmacie_2',
    'telephone_pharmacie_3', 'whatsapp_pharmacie', 'whatsapp_pharmacie_2', 'email_pharmacie', 'nif_pharmacie',
  ],
  documents: [
    'devise', 'afficher_logo_documents', 'bl_afficher_prix', 'message_recu', 'message_devis', 'message_bl', 'message_facture',
  ],
  medicaments: ['jours_alerte_peremption', 'stock_negatif_autorise', 'gestion_rayonnages_active'],
}

/** Applique aux valeurs globales de l'interface (devise, nom, logo…) les paramètres enregistrés. */
function appliquerGlobaux(valeurs: Valeurs) {
  definirDevise(valeurs.devise)
  definirGestionRayonnages(valeurs.gestion_rayonnages_active === '1')
  definirNomPharmacie(valeurs.nom_pharmacie)
  definirLogoPharmacie(valeurs.logo_pharmacie)
}

function Champ({ libelle, aide, pleine, children }: { libelle: string; aide?: string; pleine?: boolean; children: ReactNode }) {
  return (
    <div className={pleine ? 'sm:col-span-2' : undefined}>
      <span className="etiquette">{libelle}</span>
      {children}
      {aide && <p className="mt-1 text-xs text-slate-500">{aide}</p>}
    </div>
  )
}

function CaseACocher({ libelle, aide, valeur, onChange }: { libelle: string; aide?: string; valeur: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={valeur} onChange={(e) => onChange(e.target.checked)} />
      <span><span className="font-medium">{libelle}</span>{aide && <><br /><span className="text-slate-500">{aide}</span></>}</span>
    </label>
  )
}

function ParametresSection({ section }: { section: Section }) {
  const notifier = useNotifier()
  const [valeurs, setValeurs] = useState<Valeurs | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const entreeLogo = useRef<HTMLInputElement>(null)
  const entreeEntete = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get<Parametre[]>('/parametres/').then((r) => setValeurs(Object.fromEntries(r.data.map((p) => [p.cle, p.valeur])))).catch((e) => setErreur(extraireErreur(e)))
  }, [])

  if (!valeurs) return erreur ? <MessageErreur message={erreur} /> : <p className="text-sm text-slate-500">Chargement…</p>

  const v = (cle: string) => valeurs[cle] ?? ''
  const maj = (cle: string, valeur: string) => setValeurs((x) => ({ ...(x ?? {}), [cle]: valeur }))
  const texte = (cle: string, type = 'text') => <input className="champ" type={type} value={v(cle)} onChange={(e) => maj(cle, e.target.value)} />

  const choisirImage = (cle: string, lire: (f: File) => Promise<string>) => async (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    if (!fichier.type.startsWith('image/')) { notifier.erreur('Choisissez un fichier image (PNG, JPG, SVG…).'); return }
    try { maj(cle, await lire(fichier)) } catch (err) { notifier.erreur(extraireErreur(err)) }
  }

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true); setErreur(null)
    try {
      const { data } = await api.put<Parametre[]>('/parametres/', Object.fromEntries(CLES_SECTION[section].map((c) => [c, v(c)])))
      const enregistres = Object.fromEntries(data.map((p) => [p.cle, p.valeur]))
      setValeurs(enregistres)
      appliquerGlobaux(enregistres)
      notifier.succes('Paramètres enregistrés.')
    } catch (err) { setErreur(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  return (
    <form onSubmit={enregistrer} className="carte max-w-3xl space-y-4 p-5">
      <MessageErreur message={erreur} />

      {section === 'pharmacie' && (
        <>
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed border-slate-300 bg-white">
              {v('logo_pharmacie')
                ? <img src={v('logo_pharmacie')} alt="Logo de la pharmacie" className="max-h-full max-w-full object-contain" />
                : <span className="px-1 text-center text-xs text-slate-500">Aucun logo</span>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Logo</p>
              <p className="text-xs text-slate-500">Affiché dans la barre latérale et sur les reçus, devis, bons de livraison et factures.</p>
              <div className="flex gap-2">
                <input ref={entreeLogo} type="file" accept="image/*" className="hidden" onChange={choisirImage('logo_pharmacie', lireLogo)} />
                <button type="button" className="btn-secondaire btn-petit" onClick={() => entreeLogo.current?.click()}><Upload size={15} /> Choisir une image</button>
                {v('logo_pharmacie') && (
                  <button type="button" className="btn-discret btn-petit text-red-600" onClick={() => maj('logo_pharmacie', '')}><Trash2 size={15} /> Retirer</button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded border border-slate-200 p-3">
            <p className="text-sm font-medium">En-tête des documents (reçus, devis, bons de livraison, factures)</p>
            <p className="text-xs text-slate-500">
              Téléversez une image d'en-tête (largeur conseillée 1400 px) : elle remplace l'en-tête par défaut.
              Sans image, l'en-tête par défaut affiche le logo, le nom, les téléphones et les numéros WhatsApp ci-dessous.
            </p>
            <div className="overflow-hidden rounded border border-dashed border-slate-300 bg-white p-2">
              {v('entete_image')
                ? <img src={v('entete_image')} alt="En-tête" className="mx-auto max-h-32 object-contain" />
                : <p className="py-3 text-center text-xs text-slate-500">En-tête par défaut (logo, nom, téléphones, WhatsApp)</p>}
            </div>
            <div className="flex gap-2">
              <input ref={entreeEntete} type="file" accept="image/*" className="hidden" onChange={choisirImage('entete_image', lireEntete)} />
              <button type="button" className="btn-secondaire btn-petit" onClick={() => entreeEntete.current?.click()}><Upload size={15} /> Téléverser un en-tête</button>
              {v('entete_image') && (
                <button type="button" className="btn-discret btn-petit text-red-600" onClick={() => maj('entete_image', '')}><Trash2 size={15} /> Revenir à l'en-tête par défaut</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ libelle="Nom de la pharmacie" pleine>{texte('nom_pharmacie')}</Champ>
            <Champ libelle="Téléphone 1">{texte('telephone_pharmacie')}</Champ>
            <Champ libelle="Téléphone 2">{texte('telephone_pharmacie_2')}</Champ>
            <Champ libelle="Téléphone 3">{texte('telephone_pharmacie_3')}</Champ>
            <Champ libelle="WhatsApp 1">{texte('whatsapp_pharmacie')}</Champ>
            <Champ libelle="WhatsApp 2">{texte('whatsapp_pharmacie_2')}</Champ>
            <Champ libelle="Adresse" pleine>{texte('adresse_pharmacie')}</Champ>
            <Champ libelle="Email">{texte('email_pharmacie', 'email')}</Champ>
            <Champ libelle="NIF / registre de commerce">{texte('nif_pharmacie')}</Champ>
          </div>
        </>
      )}

      {section === 'documents' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ libelle="Devise" aide="Affichée sur tous les montants (ex : MRU, MAD, EUR).">{texte('devise')}</Champ>
            <div className="self-end pb-2">
              <CaseACocher libelle="Afficher le logo sur les documents imprimés" valeur={v('afficher_logo_documents') !== '0'}
                onChange={(c) => maj('afficher_logo_documents', c ? '1' : '0')} />
            </div>
          </div>
          <CaseACocher libelle="Afficher les colonnes Prix et Total sur le bon de livraison" valeur={v('bl_afficher_prix') === '1'}
            aide="Désactivé : le bon de livraison ne contient alors ni prix ni total."
            onChange={(c) => maj('bl_afficher_prix', c ? '1' : '0')} />
          <p className="text-xs text-slate-500">
            Messages du pied de page : les retours à la ligne sont respectés. Sélectionnez un mot ou une ligne pour changer sa taille ou sa police.
          </p>
          <Champ libelle="Message sur le reçu (ticket de caisse)"><EditeurTexteRiche valeur={v('message_recu')} onChange={(h) => maj('message_recu', h)} /></Champ>
          <Champ libelle="Message sur le bon de livraison (BL)"><EditeurTexteRiche valeur={v('message_bl')} onChange={(h) => maj('message_bl', h)} /></Champ>
          <Champ libelle="Message sur le devis"><EditeurTexteRiche valeur={v('message_devis')} onChange={(h) => maj('message_devis', h)} /></Champ>
          <Champ libelle="Message sur la facture" aide="Laisser vide pour reprendre le message du reçu.">
            <EditeurTexteRiche valeur={v('message_facture')} onChange={(h) => maj('message_facture', h)} />
          </Champ>
        </>
      )}

      {section === 'medicaments' && (
        <>
          <Champ libelle="Alerte « bientôt périmé » (jours avant péremption)" aide="Un lot dont la date de péremption est dans ce délai est signalé comme bientôt périmé.">
            <input className="champ max-w-xs" type="number" min={1} value={v('jours_alerte_peremption')} onChange={(e) => maj('jours_alerte_peremption', e.target.value)} />
          </Champ>
          <CaseACocher libelle="Autoriser un stock négatif" valeur={v('stock_negatif_autorise') === '1'}
            aide="Déconseillé : une vente ne devrait jamais dépasser le stock réel."
            onChange={(c) => maj('stock_negatif_autorise', c ? '1' : '0')} />
          <CaseACocher libelle="Gestion des rayonnages" valeur={v('gestion_rayonnages_active') === '1'}
            aide="Affiche l'emplacement en rayon du médicament à la caisse et permet de le renseigner sur sa fiche."
            onChange={(c) => maj('gestion_rayonnages_active', c ? '1' : '0')} />
        </>
      )}

      <button className="btn-primaire" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Enregistrer'}</button>
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
  const [onglet, setOnglet] = useState<Onglet>('pharmacie')
  const onglets: { cle: Onglet; libelle: string; icone?: typeof Building2 }[] = [
    { cle: 'pharmacie', libelle: 'Pharmacie', icone: Building2 }, { cle: 'documents', libelle: 'Reçus et documents', icone: FileText },
    { cle: 'medicaments', libelle: 'Médicaments et stock', icone: Pill }, { cle: 'caisses', libelle: 'Caisses' },
    { cle: 'paiements', libelle: 'Modes de paiement' }, { cle: 'audit', libelle: "Journal d'audit" },
  ]
  return (
    <div>
      <EnTetePage titre="Paramètres" description="Pharmacie, reçus et documents, médicaments et stock, caisses et modes de paiement." />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {onglets.map((o) => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm ${onglet === o.cle ? 'border-marque-600 font-medium text-marque-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            {o.icone && <o.icone size={16} />} {o.libelle}
          </button>
        ))}
      </div>
      {(onglet === 'pharmacie' || onglet === 'documents' || onglet === 'medicaments') && <ParametresSection key={onglet} section={onglet} />}
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
