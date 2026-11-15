import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { Categorie, Dosage, Forme, Medicament } from '../types'
import { erreursParChamp, extraireErreur } from '../utilitaires/erreurs'
import { gestionRayonnagesActive } from '../utilitaires/formatage'
import { appliquerSuggestions, ChampDef, ChampFormulaire, construireCharge, Formulaire, Valeur } from './PageCrud'
import { MessageErreur } from './EnTetePage'
import { Modale } from './Modale'
import { useNotifier } from './Notifications'

import { t } from '../i18n'
export function ModaleNouveauMedicament({ ouverte, nomInitial = '', onFermer, onCree }: {
  ouverte: boolean
  nomInitial?: string
  onFermer: () => void
  onCree: (medicament: Medicament) => void
}) {
  const notifier = useNotifier()
  const rayonnages = gestionRayonnagesActive()

  const champs: ChampDef[] = [
    { nom: 'nom', libelle: t('Nom commercial'), type: 'texte', requis: true },
    { nom: 'nom_generique', libelle: t('Nom générique (DCI)'), type: 'texte' },
    { nom: 'dosage', libelle: t('Dosage'), type: 'select', aide: t('Rechercher, ou ajouter au référentiel si absent (ex. 500 mg).'),
      source: { endpoint: '/dosages/', params: { actif: 1 }, libelle: (d: Dosage) => d.nom, valeur: (d: Dosage) => d.nom, vide: t('— Aucun —'), ajoutPossible: true } },
    { nom: 'forme', libelle: t('Forme'), type: 'select', aide: t('Rechercher, ou ajouter au référentiel si absent (ex. comprimé, sirop, gélule).'),
      source: { endpoint: '/formes/', params: { actif: 1 }, libelle: (f: Forme) => f.nom, valeur: (f: Forme) => f.nom, vide: t('— Aucune —'), ajoutPossible: true } },
    { nom: 'laboratoire', libelle: t('Laboratoire'), type: 'texte' },
    { nom: 'categorie', libelle: t('Catégorie'), type: 'select', source: { endpoint: '/categories/', libelle: (c: Categorie) => c.nom, vide: t('— Sans catégorie —'), ajoutPossible: true } },
    ...(rayonnages ? [{ nom: 'emplacement', libelle: t('Emplacement (rayon)'), type: 'texte' as const, aide: t('Ex. Rayon A3, Étagère 2') }] : []),
    { nom: 'prix_achat', libelle: t('Prix d\'achat'), type: 'decimal', requis: true, defaut: 0 },
    { nom: 'prix_vente', libelle: t('Prix de vente'), type: 'decimal', requis: true, defaut: 0,
      aide: t('Suggéré automatiquement (+25% si achat < 200, +15% sinon) — modifiable.'),
      suggererDepuis: { champ: 'prix_achat', calcul: (achat) => Math.round(achat * (achat < 200 ? 1.25 : 1.15) * 100) / 100 } },
  ]

  const [formulaire, setFormulaire] = useState<Formulaire>({})
  const [champsModifies, setChampsModifies] = useState<Set<string>>(new Set())
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (!ouverte) return
    const defauts = Object.fromEntries(champs.map((c) => [c.nom, c.defaut ?? '']))
    setFormulaire({ ...defauts, nom: nomInitial })
    setChampsModifies(new Set())
    setErreurs({}); setErreurGlobale(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte, nomInitial])

  const majChamp = (nom: string, v: Valeur) => {
    setChampsModifies((s) => new Set(s).add(nom))
    setFormulaire((f) => appliquerSuggestions(champs, nom, { ...f, [nom]: v }, champsModifies))
  }

  const soumettre = async () => {
    setEnvoi(true); setErreurs({}); setErreurGlobale(null)
    const charge = construireCharge(champs, formulaire, false)
    try {
      const { data } = await api.post<Medicament>('/medicaments/', charge)
      notifier.succes(t('« {nom} » ajouté.', { nom: data.nom }))
      onCree(data)
    } catch (err) {
      setErreurs(erreursParChamp(err))
      setErreurGlobale(extraireErreur(err))
    } finally { setEnvoi(false) }
  }

  return (
    <Modale ouverte={ouverte} onFermer={onFermer} largeur="grande" titre={t('Ajouter un médicament')}
      pied={<>
        <button type="button" className="btn-secondaire" onClick={onFermer}>{t('Annuler')}</button>
        <button type="button" onClick={soumettre} className="btn-primaire" disabled={envoi}>{envoi ? t('Enregistrement…') : t('Enregistrer')}</button>
      </>}>
      <div>
        <MessageErreur message={erreurGlobale} />
        <div className="grid gap-4 sm:grid-cols-2">
          {champs.map((c) => (
            <div key={c.nom}>
              <ChampFormulaire def={c} formulaire={formulaire} enEdition={false} erreur={erreurs[c.nom]}
                maj={majChamp} />
            </div>
          ))}
        </div>
      </div>
    </Modale>
  )
}
