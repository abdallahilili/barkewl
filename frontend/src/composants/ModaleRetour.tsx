import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../services/api'
import type { EtatRetour, RetourClient, Vente } from '../types'
import { extraireErreur } from '../utilitaires/erreurs'
import { formaterMontant } from '../utilitaires/formatage'
import { Champ } from './Champ'
import { MessageErreur } from './EnTetePage'
import { Modale } from './Modale'

import { t } from '../i18n'

interface Saisie { quantite: string; etat: EtatRetour }

/** Retour partiel d'une vente : articles rendus, motif, état (revendable ou non) ; un vendeur a besoin du PIN
 * du propriétaire ou du pharmacien. Le remboursement est enregistré en caisse par le serveur. */
export function ModaleRetour({ vente, onFermer, onFait }: { vente: Vente | null; onFermer: () => void; onFait: (retour: RetourClient) => void }) {
  const { utilisateur } = useAuth()
  const [saisies, setSaisies] = useState<Record<number, Saisie>>({})
  const [motif, setMotif] = useState('')
  const [modePaiement, setModePaiement] = useState('')
  const [approbateur, setApprobateur] = useState('')
  const [pin, setPin] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const besoinApprobation = utilisateur?.role === 'CAISSIER'

  useEffect(() => {
    setSaisies({}); setMotif(''); setApprobateur(''); setPin(''); setErreur(null)
    setModePaiement(vente?.paiements?.length ? String(vente.paiements[0].mode_paiement) : '')
  }, [vente])

  const lignes = vente?.lignes ?? []
  const choisies = useMemo(
    () => lignes.filter((l) => Number(saisies[l.id]?.quantite) > 0),
    [lignes, saisies],
  )
  const total = choisies.reduce((somme, l) => somme + Number(saisies[l.id].quantite) * Number(l.prix_unitaire), 0)
  const modes = useMemo(() => {
    const vus = new Map<number, string>()
    for (const p of vente?.paiements ?? []) vus.set(p.mode_paiement, p.mode_paiement_nom)
    return [...vus]
  }, [vente])

  const maj = (id: number, valeurs: Partial<Saisie>) =>
    setSaisies((s) => ({ ...s, [id]: { ...(s[id] ?? { quantite: '', etat: 'REVENDABLE' as EtatRetour }), ...valeurs } }))

  const envoyer = async (e: FormEvent) => {
    e.preventDefault()
    if (!vente) return
    setEnvoi(true); setErreur(null)
    try {
      const { data } = await api.post<RetourClient>('/retours-clients/', {
        vente: vente.id, motif,
        mode_paiement: modePaiement ? Number(modePaiement) : null,
        articles: choisies.map((l) => ({ ligne_vente: l.id, quantite: Number(saisies[l.id].quantite), etat: saisies[l.id].etat })),
        ...(besoinApprobation ? { approbateur_identifiant: approbateur, approbateur_pin: pin } : {}),
      })
      onFait(data)
    } catch (err) { setErreur(extraireErreur(err)) }
    finally { setEnvoi(false) }
  }

  return (
    <Modale ouverte={!!vente} titre={vente ? t('Retour sur la vente {reference}', { reference: vente.reference }) : ''} onFermer={onFermer} largeur="grande"
      pied={<>
        <button type="button" className="btn-secondaire" onClick={onFermer}>{t('Annuler')}</button>
        <button type="submit" form="formulaire-retour" className="btn-primaire" disabled={envoi || choisies.length === 0 || !motif.trim()}>
          {envoi ? t('Enregistrement…') : t('Enregistrer le retour')}
        </button>
      </>}>
      {vente && (
        <form id="formulaire-retour" onSubmit={envoyer} className="space-y-4">
          <p className="text-sm text-slate-600">{t('Indiquez la quantité rendue pour chaque article. Revendable : le produit retourne en stock. Non revendable : il ne revient pas en stock. Le remboursement est enregistré en caisse.')}</p>
          <MessageErreur message={erreur} />
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-start text-slate-600">
                <tr>
                  <th className="px-3 py-2">{t('Médicament')}</th>
                  <th className="px-3 py-2 text-end">{t('Vendu')}</th>
                  <th className="px-3 py-2 text-end">{t('Déjà rendu')}</th>
                  <th className="px-3 py-2 text-end">{t('Prix')}</th>
                  <th className="px-3 py-2">{t('Quantité rendue')}</th>
                  <th className="px-3 py-2">{t('État du produit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lignes.map((l) => (
                  <tr key={l.id} className={l.retournable === 0 ? 'text-slate-400' : ''}>
                    <td className="px-3 py-2">{l.medicament_nom}<span className="block text-xs text-slate-500">{t('Lot')} {l.numero_lot}{l.conditionnement !== 'BOITE' && ` · ${l.conditionnement_libelle}`}</span></td>
                    <td className="px-3 py-2 text-end">{l.quantite}</td>
                    <td className="px-3 py-2 text-end">{l.deja_retourne}</td>
                    <td className="px-3 py-2 text-end">{formaterMontant(l.prix_unitaire)}</td>
                    <td className="px-3 py-2">
                      <input className="champ w-24" type="number" min={0} max={l.retournable} step={1} disabled={l.retournable === 0}
                        value={saisies[l.id]?.quantite ?? ''} onChange={(e) => maj(l.id, { quantite: e.target.value })} aria-label={t('Quantité rendue')} />
                    </td>
                    <td className="px-3 py-2">
                      <select className="champ w-auto" disabled={l.retournable === 0} value={saisies[l.id]?.etat ?? 'REVENDABLE'}
                        onChange={(e) => maj(l.id, { etat: e.target.value as EtatRetour })} aria-label={t('État du produit')}>
                        <option value="REVENDABLE">{t('Revendable (retour en stock)')}</option>
                        <option value="NON_REVENDABLE">{t('Non revendable')}</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ libelle={t('Motif du retour')} requis className="sm:col-span-2">
              <input className="champ" value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={255} required />
            </Champ>
            {modes.length > 1 && (
              <Champ libelle={t('Remboursé en')}>
                <select className="champ" value={modePaiement} onChange={(e) => setModePaiement(e.target.value)}>
                  {modes.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
                </select>
              </Champ>
            )}
            <p className="self-end text-lg font-semibold sm:text-end">{t('À rembourser :')}{' '}{formaterMontant(total)}</p>
          </div>
          {besoinApprobation && (
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-medium text-nuit-800">{t('Approbation du propriétaire ou du pharmacien')}</p>
              <p className="text-xs text-slate-500">{t('Il saisit lui-même son identifiant et son code PIN sur cet écran.')}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Champ libelle={t('Identifiant')} requis><input className="champ" value={approbateur} onChange={(e) => setApprobateur(e.target.value)} autoComplete="off" required /></Champ>
                <Champ libelle={t('Code PIN')} requis><input className="champ text-center tracking-[0.4em]" type="password" inputMode="numeric" maxLength={6} dir="ltr"
                  value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="off" required /></Champ>
              </div>
            </div>
          )}
        </form>
      )}
    </Modale>
  )
}
