import { Navigate, Route, Routes } from 'react-router-dom'
import { Chargement } from './composants/EnTetePage'
import { useAuth } from './hooks/useAuth'
import { MiseEnPagePrincipale } from './miseEnPage/MiseEnPagePrincipale'
import Connexion from './pages/Connexion'
import { routesProtegees } from './routes'

export default function App() {
  const { utilisateur, chargement, peut } = useAuth()
  if (chargement) return <Chargement texte="Ouverture de la session…" />

  if (!utilisateur) {
    return (
      <Routes>
        <Route path="/connexion" element={<Connexion />} />
        <Route path="*" element={<Navigate to="/connexion" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/connexion" element={<Navigate to="/" replace />} />
      <Route element={<MiseEnPagePrincipale />}>
        {routesProtegees.filter((r) => peut(r.module)).map((r) => (
          <Route key={r.chemin} path={r.chemin} element={r.element} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
