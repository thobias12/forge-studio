import AnimationRuntimePanel from '../components/AnimationRuntimePanel'
import AnimationStudioV3 from './AnimationStudioV3'
import '../animation-runtime-2.css'

type Props = {
  onTestGame?: () => void
}

export default function AnimationStudioRuntime2(_props: Props) {
  return <div className="animation-runtime-2-layout">
    <AnimationStudioV3/>
    <AnimationRuntimePanel/>
  </div>
}
