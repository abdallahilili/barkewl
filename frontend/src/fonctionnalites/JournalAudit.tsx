import { Badge } from '../composants/Badge'
import { TableauDonnees } from '../composants/TableauDonnees'
import { useListe } from '../hooks/useListe'
import { formaterDateHeure, formaterDateHeureExport, libelleActionAudit, libelleObjetAudit } from '../utilitaires/formatage'

import { t, traduireServeur } from '../i18n'

interface EntreeAudit { id: number; date_action: string; utilisateur: string; action: string; entite: string; reference: string; description: string; ancienne_valeur: unknown; nouvelle_valeur: unknown }

export function JournalAudit() {
  const liste = useListe<EntreeAudit>('/journal-audit/', { taillePage: 25 })
  return (
    <TableauDonnees<EntreeAudit>
      colonnes={[
        { cle: 'date_action', titre: 'Date', rendu: (a) => formaterDateHeure(a.date_action), exportRendu: (a) => formaterDateHeureExport(a.date_action) },
        { cle: 'utilisateur', titre: 'Utilisateur' },
        { cle: 'action', titre: 'Action', rendu: (a) => <Badge ton="bleu">{libelleActionAudit(a.action)}</Badge>, exportRendu: (a) => libelleActionAudit(a.action) },
        { cle: 'entite', titre: 'Objet', rendu: (a) => libelleObjetAudit(a.entite), exportRendu: (a) => libelleObjetAudit(a.entite) },
        { cle: 'reference', titre: 'Référence' },
        { cle: 'detail', titre: 'Détail', rendu: (a) => (
          <span className="text-xs text-slate-600">{traduireServeur(a.description) || (a.ancienne_valeur ? `${JSON.stringify(a.ancienne_valeur)} → ${JSON.stringify(a.nouvelle_valeur)}` : '')}</span>
        ), exportRendu: (a) => traduireServeur(a.description) || (a.ancienne_valeur ? `${JSON.stringify(a.ancienne_valeur)} -> ${JSON.stringify(a.nouvelle_valeur)}` : '') },
      ]}
      titre={t('Journal d\'audit')}
      lignes={liste.lignes} chargement={liste.chargement} erreur={liste.erreur} total={liste.total} page={liste.page}
      nombrePages={liste.nombrePages} onPage={liste.setPage} cleLigne={(a) => a.id} messageVide={t('Aucune opération enregistrée.')} idTableau="journal-audit" endpoint="/journal-audit/" />
  )
}
