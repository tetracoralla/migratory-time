import React from 'react'
import ReactDOM from 'react-dom'
import { initializeTemporal } from '../../../src/lib/temporal'
import App from './App'

async function startApplication() {
  await initializeTemporal()

  ReactDOM.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
    document.getElementById('root') as HTMLElement,
  )
}

void startApplication()
