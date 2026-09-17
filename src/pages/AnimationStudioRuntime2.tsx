import AnimationRuntimePanel from '../components/AnimationRuntimePanel'
import AnimationStudioV2 from './AnimationStudioV2'
import '../animation-runtime-2.css'

type Props = {
  onTestGame?: () => void
}

export default function AnimationStudioRuntime2({ onTestGame }: Props) {
  return <div className="animation-runtime-2-layout">
    <AnimationStudioV2 onTestGame={onTestGame}/>
    <AnimationRuntimePanel/>
  </div>
}
