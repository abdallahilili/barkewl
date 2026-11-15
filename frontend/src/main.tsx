import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { FournisseurAuth } from './hooks/useAuth'
import { FournisseurConfirmation } from './composants/Confirmation'
import { FournisseurNotifications } from './composants/Notifications'
// Polices de l'identité RAQEEM, embarquées dans l'application (aucune connexion Internet nécessaire).
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import './index.css'
import { appliquerLangueAuDocument } from './i18n'

// Sens de lecture et langue du document fixés avant le premier rendu (arabe = de droite à gauche).
appliquerLangueAuDocument()

ReactDOM.createRoot(document.getElementById('racine')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <FournisseurNotifications>
        <FournisseurConfirmation>
          <FournisseurAuth>
            <App />
          </FournisseurAuth>
        </FournisseurConfirmation>
      </FournisseurNotifications>
    </BrowserRouter>
  </React.StrictMode>,
)
