import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installPropSelectionAssist } from './lib/propSelectionAssist'
import './gameplay-content-management.css'
import './hud-runtime-layout.css'

// Keep the only safe global Three.js helper here. Dungeon visual/reference styling
// is handled by the Map Studio renderer itself; globally patching Object3D.add
// made the Maps route capable of doing huge amounts of work during scene creation.
installPropSelectionAssist()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
