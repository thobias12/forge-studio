import ProceduralItemGeneratorPanel from '../components/ProceduralItemGeneratorPanel'
import ItemForgeV2 from './ItemForgeV2'

type Props = { onOpenModelCreator?: () => void }

export default function ItemForge({ onOpenModelCreator }: Props) {
  return <div className="item-forge-procedural-shell">
    <div className="item-forge-procedural-dock"><ProceduralItemGeneratorPanel/></div>
    <ItemForgeV2 onOpenModelCreator={onOpenModelCreator}/>
  </div>
}
