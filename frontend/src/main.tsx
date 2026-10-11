import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { FournisseurAuth } from './hooks/useAuth'
import { FournisseurConfirmation } from './composants/Confirmation'
import { FournisseurNotifications } from './composants/Notifications'
import './index.css'

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
