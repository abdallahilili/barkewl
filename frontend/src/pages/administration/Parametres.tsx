import { Building2, FileText, KeyRound, Pill, Trash2, Upload } from 'lucide-react'
import { Licence } from '../../fonctionnalites/Licence'
import { useLocation } from 'react-router-dom'
import { ChangeEvent, FormEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { EditeurTexteRiche } from '../../composants/EditeurTexteRiche'
import { EnTetePage, MessageErreur } from '../../composants/EnTetePage'
import { useNotifier } from '../../composants/Notifications'
import { api } from '../../services/api'
import type { Parametre } from '../../types'
import { extraireErreur } from '../../utilitaires/erreurs'
import { definirCopyrightDocuments, definirDevise, definirGestionRayonnages, definirLogoPharmacie, definirNomPharmacie } from '../../utilitaires/formatage'
import { lireEntete, lireLogo } from '../../utilitaires/images'

import { t } from '../../i18n'
type Section = 'pharmacie' | 'documents' | 'medicaments'
type Onglet = Section | 'licence'
type Valeurs = Record<string, string>

// Paramètres enregistrés par chaque section (chaque onglet n'envoie que les siens).
const CLES_SECTION: Record<Section, string[]> = {
  pharmacie: [
    'logo_pharmacie', 'entete_image', 'nom_pharmacie', 'nom_pharmacie_ar', 'adresse_pharmacie', 'telephone_pharmacie', 'telephone_pharmacie_2',
    'telephone_pharmacie_3', 'whatsapp_pharmacie', 'whatsapp_pharmacie_2', 'email_pharmacie', 'nif_pharmacie',
  ],
  documents: [
    'devise', 'recu_format', 'recu_langue', 'afficher_logo_documents', 'afficher_adresse_documents', 'afficher_copyright_documents', 'bl_afficher_prix', 'message_recu', 'message_devis', 'message_bl', 'message_facture',
  ],
  medicaments: ['jours_alerte_peremption', 'stock_negatif_autorise', 'gestion_rayonnages_active'],
}

/** Applique aux valeurs globales de l'interface (devise, nom, logo…) les paramètres enregistrés. */
function appliquerGlobaux(valeurs: Valeurs) {
  definirDevise(valeurs.devise)
  definirGestionRayonnages(valeurs.gestion_rayonnages_active === '1')
  definirNomPharmacie(valeurs.nom_pharmacie)
  definirLogoPharmacie(valeurs.logo_pharmacie)
  definirCopyrightDocuments(valeurs.afficher_copyright_documents)
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

  if (!valeurs) return erreur ? <MessageErreur message={erreur} /> : <p className="text-sm text-slate-500">{t('Chargement…')}</p>

  const v = (cle: string) => valeurs[cle] ?? ''
  const maj = (cle: string, valeur: string) => setValeurs((x) => ({ ...(x ?? {}), [cle]: valeur }))
  const texte = (cle: string, type = 'text') => <input className="champ" type={type} value={v(cle)} onChange={(e) => maj(cle, e.target.value)} />

  const choisirImage = (cle: string, lire: (f: File) => Promise<string>) => async (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier) return
    if (!fichier.type.startsWith('image/')) { notifier.erreur(t('Choisissez un fichier image (PNG, JPG, SVG…).')); return }
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
      notifier.succes(t('Paramètres enregistrés.'))
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
                ? <img src={v('logo_pharmacie')} alt={t('Logo de la pharmacie')} className="max-h-full max-w-full object-contain" />
                : <span className="px-1 text-center text-xs text-slate-500">{t('Aucun logo')}</span>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('Logo')}</p>
              <p className="text-xs text-slate-500">{t('Affiché dans la barre latérale et sur les reçus, devis, bons de livraison et factures.')}</p>
              <div className="flex gap-2">
                <input ref={entreeLogo} type="file" accept="image/*" className="hidden" onChange={choisirImage('logo_pharmacie', lireLogo)} />
                <button type="button" className="btn-secondaire btn-petit" onClick={() => entreeLogo.current?.click()}><Upload size={15} /> {' '}{t('Choisir une image')}</button>
                {v('logo_pharmacie') && (
                  <button type="button" className="btn-discret btn-petit text-red-600" onClick={() => maj('logo_pharmacie', '')}><Trash2 size={15} /> {' '}{t('Retirer')}</button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded border border-slate-200 p-3">
            <p className="text-sm font-medium">{t('En-tête des documents (reçus, devis, bons de livraison, factures)')}</p>
            <p className="text-xs text-slate-500">
              
              {t('Téléversez une image d\'en-tête (largeur conseillée 1400 px) : elle remplace l\'en-tête par défaut. Sans image, l\'en-tête par défaut affiche le logo, le nom, les téléphones et les numéros WhatsApp ci-dessous.')}
            </p>
            <div className="overflow-hidden rounded border border-dashed border-slate-300 bg-white p-2">
              {v('entete_image')
                ? <img src={v('entete_image')} alt={t('En-tête')} className="mx-auto max-h-32 object-contain" />
                : <p className="py-3 text-center text-xs text-slate-500">{t('En-tête par défaut (logo, nom, téléphones, WhatsApp)')}</p>}
            </div>
            <div className="flex gap-2">
              <input ref={entreeEntete} type="file" accept="image/*" className="hidden" onChange={choisirImage('entete_image', lireEntete)} />
              <button type="button" className="btn-secondaire btn-petit" onClick={() => entreeEntete.current?.click()}><Upload size={15} /> {' '}{t('Téléverser un en-tête')}</button>
              {v('entete_image') && (
                <button type="button" className="btn-discret btn-petit text-red-600" onClick={() => maj('entete_image', '')}><Trash2 size={15} /> {' '}{t('Revenir à l\'en-tête par défaut')}</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ libelle={t('Nom de la pharmacie')} pleine>{texte('nom_pharmacie')}</Champ>
            <Champ libelle={t('Nom arabe de la pharmacie')} aide={t('Imprimé sous le nom de la pharmacie sur les reçus, devis, bons de livraison et factures.')} pleine>
              <input className="champ" type="text" dir="rtl" lang="ar" value={v('nom_pharmacie_ar')} onChange={(e) => maj('nom_pharmacie_ar', e.target.value)} />
            </Champ>
            <Champ libelle={t('Téléphone 1')}>{texte('telephone_pharmacie')}</Champ>
            <Champ libelle={t('Téléphone 2')}>{texte('telephone_pharmacie_2')}</Champ>
            <Champ libelle={t('Téléphone 3')}>{texte('telephone_pharmacie_3')}</Champ>
            <Champ libelle={t('WhatsApp 1')}>{texte('whatsapp_pharmacie')}</Champ>
            <Champ libelle={t('WhatsApp 2')}>{texte('whatsapp_pharmacie_2')}</Champ>
            <Champ libelle={t('Adresse')} pleine>{texte('adresse_pharmacie')}</Champ>
            <Champ libelle={t('Email')}>{texte('email_pharmacie', 'email')}</Champ>
            <Champ libelle={t('NIF / registre de commerce')}>{texte('nif_pharmacie')}</Champ>
          </div>
        </>
      )}

      {section === 'documents' && (
        <>
          <div className="grid grid-cols-1 gap-4 rounded border border-slate-200 p-3 sm:grid-cols-2">
            <Champ libelle={t('Format du reçu')} aide={t('Ticket thermique pour une imprimante de caisse (rouleau 80 mm ou 58 mm), ou demi-page A4 pour une imprimante classique.')}>
              <select className="champ" value={v('recu_format') || 'demi_a4'} onChange={(e) => maj('recu_format', e.target.value)}>
                <option value="80mm">{t('Ticket thermique 80 mm')}</option>
                <option value="58mm">{t('Ticket thermique 58 mm')}</option>
                <option value="demi_a4">{t('Demi-page A4')}</option>
              </select>
            </Champ>
            <Champ libelle={t('Langue du reçu')} aide={t('Langue des libellés imprimés sur le reçu (indépendante de la langue de l\'interface).')}>
              <select className="champ" value={v('recu_langue') || 'bilingue'} onChange={(e) => maj('recu_langue', e.target.value)}>
                <option value="fr">{t('Français')}</option>
                <option value="ar">{t('Arabe')}</option>
                <option value="bilingue">{t('Bilingue (français et arabe)')}</option>
              </select>
            </Champ>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Champ libelle={t('Devise')} aide={t('Affichée sur tous les montants (ex : MRU, MAD, EUR).')}>{texte('devise')}</Champ>
            <div className="self-end pb-2">
              <CaseACocher libelle={t('Afficher le logo sur les documents imprimés')} valeur={v('afficher_logo_documents') !== '0'}
                onChange={(c) => maj('afficher_logo_documents', c ? '1' : '0')} />
            </div>
          </div>
          <CaseACocher libelle={t('Afficher l\'adresse sur les documents imprimés')} valeur={v('afficher_adresse_documents') !== '0'}
            aide={t('Décochez pour ne pas imprimer l\'adresse dans l\'en-tête des reçus, devis, bons de livraison et factures.')}
            onChange={(c) => maj('afficher_adresse_documents', c ? '1' : '0')} />
          <CaseACocher libelle={t('Afficher le copyright en bas des documents')} valeur={v('afficher_copyright_documents') !== '0'}
            aide={t('Ligne très petite en bas des reçus, factures, rapports et exports : « Développé par : Rawafid Digital Services ».')}
            onChange={(c) => maj('afficher_copyright_documents', c ? '1' : '0')} />
          <CaseACocher libelle={t('Afficher les colonnes Prix et Total sur le bon de livraison')} valeur={v('bl_afficher_prix') === '1'}
            aide={t('Désactivé : le bon de livraison ne contient alors ni prix ni total.')}
            onChange={(c) => maj('bl_afficher_prix', c ? '1' : '0')} />
          <p className="text-xs text-slate-500">
            
            {t('Messages du pied de page : les retours à la ligne sont respectés. Sélectionnez un mot ou une ligne pour changer sa taille ou sa police.')}
          </p>
          <Champ libelle={t('Message sur le reçu (ticket de caisse)')}><EditeurTexteRiche valeur={v('message_recu')} onChange={(h) => maj('message_recu', h)} /></Champ>
          <Champ libelle={t('Message sur le bon de livraison (BL)')}><EditeurTexteRiche valeur={v('message_bl')} onChange={(h) => maj('message_bl', h)} /></Champ>
          <Champ libelle={t('Message sur le devis')}><EditeurTexteRiche valeur={v('message_devis')} onChange={(h) => maj('message_devis', h)} /></Champ>
          <Champ libelle={t('Message sur la facture')} aide={t('Laisser vide pour reprendre le message du reçu.')}>
            <EditeurTexteRiche valeur={v('message_facture')} onChange={(h) => maj('message_facture', h)} />
          </Champ>
        </>
      )}

      {section === 'medicaments' && (
        <>
          <Champ libelle={t('Alerte « bientôt périmé » (jours avant péremption)')} aide={t('Un lot dont la date de péremption est dans ce délai est signalé comme bientôt périmé.')}>
            <input className="champ max-w-xs" type="number" min={1} value={v('jours_alerte_peremption')} onChange={(e) => maj('jours_alerte_peremption', e.target.value)} />
          </Champ>
          <CaseACocher libelle={t('Autoriser un stock négatif')} valeur={v('stock_negatif_autorise') === '1'}
            aide={t('Déconseillé : une vente ne devrait jamais dépasser le stock réel.')}
            onChange={(c) => maj('stock_negatif_autorise', c ? '1' : '0')} />
          <CaseACocher libelle={t('Gestion des rayonnages')} valeur={v('gestion_rayonnages_active') === '1'}
            aide={t('Affiche l\'emplacement en rayon du médicament à la caisse et permet de le renseigner sur sa fiche.')}
            onChange={(c) => maj('gestion_rayonnages_active', c ? '1' : '0')} />
        </>
      )}

      <button className="btn-primaire" disabled={envoi}>{envoi ? t('Enregistrement…') : t('Enregistrer')}</button>
    </form>
  )
}

export default function Parametres() {
  const etatNavigation = useLocation().state as { onglet?: Onglet } | null
  const [onglet, setOnglet] = useState<Onglet>(etatNavigation?.onglet ?? 'pharmacie')
  const onglets: { cle: Onglet; libelle: string; icone?: typeof Building2 }[] = [
    { cle: 'pharmacie', libelle: t('Pharmacie'), icone: Building2 }, { cle: 'documents', libelle: t('Reçus et documents'), icone: FileText },
    { cle: 'medicaments', libelle: t('Médicaments et stock'), icone: Pill },
    { cle: 'licence', libelle: t('Licence'), icone: KeyRound },
  ]
  return (
    <div>
      <EnTetePage titre={t('Paramètres')} description={t('Pharmacie, reçus et documents, médicaments et stock, et licence. Sauvegardes et journal d\'audit : page Données. Les caisses et modes de paiement sont dans Référentiels.')} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {onglets.map((o) => (
          <button key={o.cle} onClick={() => setOnglet(o.cle)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm ${onglet === o.cle ? 'border-marque-600 font-medium text-marque-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            {o.icone && <o.icone size={16} />} {o.libelle}
          </button>
        ))}
      </div>
      {(onglet === 'pharmacie' || onglet === 'documents' || onglet === 'medicaments') && <ParametresSection key={onglet} section={onglet} />}
      {onglet === 'licence' && <Licence />}
    </div>
  )
}
