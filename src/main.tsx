import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initializeTemporal } from './lib/temporal'
import './styles.css'

async function startApplication() {
  await initializeTemporal()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const registerServiceWorker = () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
    }

    if (document.readyState === 'complete') {
      registerServiceWorker()
    } else {
      window.addEventListener('load', registerServiceWorker, { once: true })
    }
  }
}

void startApplication()
