import React from 'react'
import ReactDOM from 'react-dom'
import { initializeTemporal } from '../../../src/lib/temporal'
import ModalApp from './ModalApp'

async function startApplication() {
  await initializeTemporal()

  ReactDOM.render(
    <React.StrictMode>
      <ModalApp />
    </React.StrictMode>,
    document.getElementById('root') as HTMLElement,
  )
}

void startApplication()
