import { useState } from 'react'
import AudioStudio from './AudioStudio'
import AudioLayerMixer from './AudioLayerMixer'
import '../audio-mixer.css'

type AudioMode = 'editor' | 'mixer'

export default function AudioStudioWorkspace() {
  const [mode, setMode] = useState<AudioMode>('editor')
  return (
    <div className="audio-workspace">
      <div className="audio-workspace-tabs">
        <button className={mode === 'editor' ? 'active' : ''} onClick={() => setMode('editor')}>Recorder & Sound Designer</button>
        <button className={mode === 'mixer' ? 'active' : ''} onClick={() => setMode('mixer')}>Layer Mixer</button>
      </div>
      <div className="audio-workspace-body">
        {mode === 'editor' ? <AudioStudio /> : <AudioLayerMixer />}
      </div>
    </div>
  )
}
