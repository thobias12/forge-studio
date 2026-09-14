import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installPropSelectionAssist } from './lib/propSelectionAssist'
import { installDungeonVisualAssist } from './lib/dungeonVisualAssist'
import { installReferenceDungeonLook } from './lib/referenceDungeonLook'

installPropSelectionAssist()
installDungeonVisualAssist()
installReferenceDungeonLook()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
