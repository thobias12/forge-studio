import { useEffect, useState } from 'react'
import { FileUp, Rotate3D } from 'lucide-react'
import ModelViewer from '../components/ModelViewer'
import type { RigInfo } from '../lib/retarget'

export default function Models() {
  const [modelUrl, setModelUrl] = useState<string>()
  const [fileName, setFileName] = useState('Forge mannequin')
  const [rigInfo, setRigInfo] = useState<RigInfo>()

  useEffect(() => () => { if (modelUrl) URL.revokeObjectURL(modelUrl) }, [modelUrl])

  const pick = (file?: File) => {
    if (!file) return
    if (modelUrl) URL.revokeObjectURL(modelUrl)
    setModelUrl(URL.createObjectURL(file))
    setFileName(file.name)
    setRigInfo(undefined)
  }

  return (
    <div className="workspace-grid">
      <section className="workspace-main">
        <div className="viewport-toolbar">
          <div><span className="eyebrow">MODEL LAB</span><strong>{fileName}</strong></div>
          <label className="secondary-button file-button"><FileUp size={16} /> Import GLB / GLTF<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(e) => pick(e.target.files?.[0])} /></label>
        </div>
        <ModelViewer src={modelUrl} onRigInfo={setRigInfo} />
      </section>
      <aside className="inspector-panel">
        <div className="inspector-heading"><Rotate3D size={17} /><span>Inspector</span></div>
        <div className="inspector-block"><span className="property-label">Asset</span><strong>{fileName}</strong></div>
        <div className="inspector-block"><span className="property-label">Preview</span><p>Orbit with left mouse, pan with right mouse and scroll to zoom. The first embedded animation plays automatically.</p></div>
        <div className="inspector-block"><span className="property-label">Humanoid rig</span><div className="mini-row"><span>Skeleton bones</span><span>{rigInfo?.totalBones ?? '—'}</span></div><div className="mini-row"><span>Mapped humanoid bones</span><span className={rigInfo && rigInfo.mappedCount >= 10 ? 'status-good' : 'status-warn'}>{rigInfo ? rigInfo.mappedCount : modelUrl ? 'Scanning…' : '—'}</span></div>{rigInfo && rigInfo.missing.length > 0 && <p>Forge maps common Mixamo, Blender and Unity-style humanoid bone names automatically. Missing: {rigInfo.missing.slice(0, 6).join(', ')}{rigInfo.missing.length > 6 ? '…' : ''}</p>}</div><div className="inspector-block"><span className="property-label">Pipeline</span><div className="mini-row"><span>GLB / glTF</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Animation playback</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Skeleton mapper</span><span className="status-good">Ready</span></div><div className="mini-row"><span>Live mocap retarget</span><span className="status-good">Ready</span></div></div>
      </aside>
    </div>
  )
}
