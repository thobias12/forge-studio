import type { ForgeItemDefinition } from './forgeProject'
import { itemClassification } from './itemTaxonomy'
import type {
  ForgeGeneratorField,
  ForgeGeneratorMaterialField,
  ForgeGeneratorPreset,
  ForgeGeneratorValue,
  ForgeItemGeneratorId,
  ForgeItemGeneratorRecipe,
} from './itemGeneratorTypes'

export type ForgeItemGeneratorDefinition = {
  id: ForgeItemGeneratorId
  label: string
  description: string
  fields: ForgeGeneratorField[]
  materials: ForgeGeneratorMaterialField[]
  presets: ForgeGeneratorPreset[]
}

const metalOptions = [
  { value: 'iron', label: 'Iron' },
  { value: 'dark-iron', label: 'Dark iron' },
  { value: 'steel', label: 'Steel' },
  { value: 'weathered-steel', label: 'Weathered steel' },
  { value: 'rusted-iron', label: 'Rusted iron' },
  { value: 'blackened-steel', label: 'Blackened steel' },
  { value: 'silvered-steel', label: 'Silvered steel' },
  { value: 'bronze', label: 'Bronze' },
  { value: 'bone', label: 'Bone' },
]

const gripOptions = [
  { value: 'brown-leather', label: 'Brown leather' },
  { value: 'black-leather', label: 'Black leather' },
  { value: 'red-leather', label: 'Red leather' },
  { value: 'tan-leather', label: 'Tan leather' },
  { value: 'cloth', label: 'Dark cloth' },
  { value: 'wood', label: 'Wood' },
  { value: 'dark-wood', label: 'Dark wood' },
]

const clothOptions = [
  { value: 'cloth', label: 'Dark cloth' },
  { value: 'red-cloth', label: 'Red cloth' },
  { value: 'blue-cloth', label: 'Blue cloth' },
  { value: 'tan-leather', label: 'Tan leather' },
  { value: 'brown-leather', label: 'Brown leather' },
  { value: 'black-leather', label: 'Black leather' },
]

const finishField: ForgeGeneratorField[] = [
  { kind: 'select', key: 'wearStyle', label: 'Style', group: 'Finish', options: [
    { value: 'clean', label: 'Clean' }, { value: 'worn', label: 'Worn' }, { value: 'rusted', label: 'Rusted' },
    { value: 'crude', label: 'Crude forged' }, { value: 'noble', label: 'Noble' }, { value: 'undead', label: 'Undead / crypt' },
  ] },
  { kind: 'range', key: 'wearAmount', label: 'Wear amount', group: 'Finish', min: 0, max: 1, step: 0.01 },
]

const swordPresets: ForgeGeneratorPreset[] = [
  preset('rusted-soldier', 'Rusted Soldier', 'Old infantry sword with a worn broad blade.', {
    bladeStyle: 'arming', bladeLength: 1.5, bladeWidth: 0.25, bladeThickness: 0.075, bladeTaper: 0.42, crossSection: 'diamond',
    tipStyle: 'point', fuller: 'single-long', guardStyle: 'downturned', guardWidth: 0.64, guardThickness: 0.075, guardTip: 'plain',
    gripLength: 0.48, gripThickness: 0.078, gripTaper: 0.14, gripStyle: 'leather-bands', pommelStyle: 'scent-stopper',
    wearStyle: 'rusted', wearAmount: 0.62,
  }, { blade: 'rusted-iron', guard: 'dark-iron', grip: 'brown-leather', accent: 'bronze' }),
  preset('knight', 'Knight', 'Balanced arming sword with polished faceted steel.', {
    bladeStyle: 'arming', bladeLength: 1.68, bladeWidth: 0.205, bladeThickness: 0.065, bladeTaper: 0.56, crossSection: 'diamond',
    tipStyle: 'spear', fuller: 'single-short', guardStyle: 'straight', guardWidth: 0.72, guardThickness: 0.06, guardTip: 'knob',
    gripLength: 0.52, gripThickness: 0.068, gripTaper: 0.08, gripStyle: 'spiral', pommelStyle: 'wheel',
    wearStyle: 'clean', wearAmount: 0.08,
  }, { blade: 'steel', guard: 'steel', grip: 'black-leather', accent: 'bronze' }),
  preset('raider', 'Raider', 'Heavy crude sword with aggressive asymmetry.', {
    bladeStyle: 'jagged', bladeLength: 1.38, bladeWidth: 0.31, bladeThickness: 0.105, bladeTaper: 0.22, crossSection: 'hex',
    tipStyle: 'broken', fuller: 'none', guardStyle: 'asymmetric', guardWidth: 0.8, guardThickness: 0.1, guardTip: 'spike',
    gripLength: 0.46, gripThickness: 0.095, gripTaper: 0.18, gripStyle: 'cloth-wrap', pommelStyle: 'spiked',
    wearStyle: 'crude', wearAmount: 0.82,
  }, { blade: 'dark-iron', guard: 'rusted-iron', grip: 'red-leather', accent: 'iron' }),
  preset('duelist', 'Duelist', 'Narrow elegant blade with swept fittings.', {
    bladeStyle: 'tapered', bladeLength: 1.78, bladeWidth: 0.15, bladeThickness: 0.05, bladeTaper: 0.72, crossSection: 'diamond',
    tipStyle: 'spear', fuller: 'double', guardStyle: 'swept', guardWidth: 0.58, guardThickness: 0.052, guardTip: 'knob',
    gripLength: 0.6, gripThickness: 0.06, gripTaper: 0.04, gripStyle: 'smooth', pommelStyle: 'faceted',
    wearStyle: 'noble', wearAmount: 0.04,
  }, { blade: 'silvered-steel', guard: 'blackened-steel', grip: 'black-leather', accent: 'silvered-steel' }),
  preset('militia', 'Militia', 'Short practical sword built from sturdy cheap parts.', {
    bladeStyle: 'straight', bladeLength: 1.28, bladeWidth: 0.2, bladeThickness: 0.08, bladeTaper: 0.3, crossSection: 'flat-bevel',
    tipStyle: 'point', fuller: 'none', guardStyle: 'block', guardWidth: 0.5, guardThickness: 0.09, guardTip: 'plain',
    gripLength: 0.42, gripThickness: 0.085, gripTaper: 0.12, gripStyle: 'wood-ribbed', pommelStyle: 'cap',
    wearStyle: 'worn', wearAmount: 0.45,
  }, { blade: 'weathered-steel', guard: 'iron', grip: 'wood', accent: 'iron' }),
  preset('crypt-blade', 'Crypt Blade', 'Ancient funerary blade with unsettling proportions.', {
    bladeStyle: 'leaf', bladeLength: 1.58, bladeWidth: 0.24, bladeThickness: 0.075, bladeTaper: 0.52, crossSection: 'diamond',
    tipStyle: 'spear', fuller: 'single-short', guardStyle: 'upturned', guardWidth: 0.66, guardThickness: 0.065, guardTip: 'spike',
    gripLength: 0.5, gripThickness: 0.072, gripTaper: 0.1, gripStyle: 'leather-bands', pommelStyle: 'diamond',
    wearStyle: 'undead', wearAmount: 0.7,
  }, { blade: 'blackened-steel', guard: 'dark-iron', grip: 'black-leather', accent: 'bronze' }),
  preset('noble-guard', 'Noble Guard', 'Ceremonial sword with bright trim.', {
    bladeStyle: 'broad', bladeLength: 1.64, bladeWidth: 0.22, bladeThickness: 0.06, bladeTaper: 0.48, crossSection: 'hex',
    tipStyle: 'spear', fuller: 'double', guardStyle: 'crescent', guardWidth: 0.7, guardThickness: 0.055, guardTip: 'knob',
    gripLength: 0.54, gripThickness: 0.068, gripTaper: 0.06, gripStyle: 'spiral', pommelStyle: 'wheel',
    wearStyle: 'noble', wearAmount: 0.02,
  }, { blade: 'silvered-steel', guard: 'bronze', grip: 'tan-leather', accent: 'bronze' }),
]

const sword: ForgeItemGeneratorDefinition = {
  id: 'weapon.sword', label: 'Sword Generator',
  description: 'Silhouette-driven blades, guards, grips, wear and material families.',
  fields: [
    select('bladeStyle', 'Blade family', 'Blade silhouette', ['arming','straight','broad','tapered','falchion','leaf','jagged']),
    range('bladeLength','Length','Blade silhouette',1.05,2.05,0.01),
    range('bladeWidth','Base width','Blade silhouette',0.11,0.36,0.005),
    range('bladeTaper','Taper','Blade silhouette',0,1,0.01),
    range('bladeThickness','Thickness','Blade construction',0.04,0.12,0.005),
    select('crossSection','Cross section','Blade construction',['diamond','hex','flat-bevel']),
    select('tipStyle','Tip','Blade construction',['point','spear','chisel','rounded','broken']),
    select('fuller','Fuller','Blade construction',['none','single-short','single-long','double']),
    select('guardStyle','Guard family','Guard',['straight','downturned','upturned','swept','crescent','block','asymmetric']),
    range('guardWidth','Width','Guard',0.32,0.94,0.01),
    range('guardThickness','Thickness','Guard',0.045,0.12,0.005),
    select('guardTip','Quillon tips','Guard',['plain','knob','spike']),
    range('gripLength','Length','Grip',0.34,0.72,0.01),
    range('gripThickness','Thickness','Grip',0.05,0.115,0.005),
    range('gripTaper','Taper','Grip',0,0.32,0.01),
    select('gripStyle','Wrap','Grip',['leather-bands','spiral','smooth','wood-ribbed','cloth-wrap']),
    select('pommelStyle','Pommel','Pommel',['wheel','faceted','scent-stopper','diamond','round','cap','spiked']),
    ...finishField,
  ],
  materials: [materialField('blade','Blade',metalOptions), materialField('guard','Guard',metalOptions), materialField('grip','Grip',gripOptions), materialField('accent','Accent',metalOptions)],
  presets: swordPresets,
}

const dagger: ForgeItemGeneratorDefinition = {
  id: 'weapon.dagger', label: 'Dagger Generator', description: 'Compact blades ranging from practical knives to ritual and assassin daggers.',
  fields: [select('bladeStyle','Blade family','Blade',['stiletto','leaf','broad','hooked','serrated']),range('bladeLength','Blade length','Blade',0.42,1.05,0.01),range('bladeWidth','Blade width','Blade',0.07,0.24,0.005),range('bladeThickness','Thickness','Blade',0.025,0.075,0.005),select('guardStyle','Guard','Fittings',['none','straight','ring','hooked']),range('guardWidth','Guard width','Fittings',0.16,0.48,0.01),range('gripLength','Grip length','Grip',0.25,0.52,0.01),range('gripThickness','Grip thickness','Grip',0.045,0.095,0.005),select('pommelStyle','Pommel','Grip',['cap','round','diamond','ring','spike']),...finishField],
  materials: [materialField('blade','Blade',metalOptions),materialField('guard','Guard',metalOptions),materialField('grip','Grip',gripOptions),materialField('accent','Accent',metalOptions)],
  presets: [
    preset('assassin','Assassin','Slim dark thrusting dagger.',{bladeStyle:'stiletto',bladeLength:0.82,bladeWidth:0.09,bladeThickness:0.04,guardStyle:'ring',guardWidth:0.24,gripLength:0.36,gripThickness:0.055,pommelStyle:'cap',wearStyle:'clean',wearAmount:0.08},{blade:'blackened-steel',guard:'dark-iron',grip:'black-leather',accent:'silvered-steel'}),
    preset('scout','Scout Knife','Practical field knife.',{bladeStyle:'broad',bladeLength:0.64,bladeWidth:0.17,bladeThickness:0.055,guardStyle:'straight',guardWidth:0.28,gripLength:0.34,gripThickness:0.07,pommelStyle:'round',wearStyle:'worn',wearAmount:0.34},{blade:'weathered-steel',guard:'iron',grip:'brown-leather',accent:'iron'}),
    preset('ritual','Ritual Dagger','Leaf-shaped ceremonial weapon.',{bladeStyle:'leaf',bladeLength:0.72,bladeWidth:0.2,bladeThickness:0.05,guardStyle:'hooked',guardWidth:0.36,gripLength:0.32,gripThickness:0.065,pommelStyle:'diamond',wearStyle:'undead',wearAmount:0.48},{blade:'silvered-steel',guard:'bronze',grip:'red-leather',accent:'bronze'}),
    preset('rusted-shiv','Rusted Shiv','Crude damaged close-range blade.',{bladeStyle:'serrated',bladeLength:0.52,bladeWidth:0.12,bladeThickness:0.05,guardStyle:'none',guardWidth:0.18,gripLength:0.3,gripThickness:0.065,pommelStyle:'cap',wearStyle:'rusted',wearAmount:0.86},{blade:'rusted-iron',guard:'rusted-iron',grip:'cloth',accent:'iron'}),
  ],
}

const axe: ForgeItemGeneratorDefinition = {
  id: 'weapon.axe', label: 'Axe Generator', description: 'Bearded, crescent, broad and brutal axe silhouettes with configurable backs.',
  fields: [select('headStyle','Head family','Head',['bearded','crescent','broad','cleaver','double','pick']),range('handleLength','Handle length','Handle',0.72,1.9,0.01),range('handleThickness','Handle thickness','Handle',0.045,0.11,0.005),range('headWidth','Head width','Head',0.28,0.9,0.01),range('headHeight','Head height','Head',0.2,0.62,0.01),range('headThickness','Head thickness','Head',0.05,0.16,0.005),select('backStyle','Back','Head',['none','spike','hammer','second-blade']),range('wrapLength','Grip wrap','Handle',0,0.55,0.01),...finishField],
  materials: [materialField('head','Head',metalOptions),materialField('handle','Handle',gripOptions),materialField('grip','Wrap',gripOptions),materialField('accent','Accent',metalOptions)],
  presets: [
    preset('woodsman','Woodsman','Reliable bearded axe.',{headStyle:'bearded',handleLength:1.1,handleThickness:0.065,headWidth:0.5,headHeight:0.36,headThickness:0.08,backStyle:'none',wrapLength:0.24,wearStyle:'worn',wearAmount:0.32},{head:'weathered-steel',handle:'wood',grip:'brown-leather',accent:'iron'}),
    preset('raider','Raider Axe','Wide aggressive crescent head.',{headStyle:'crescent',handleLength:1.25,handleThickness:0.075,headWidth:0.68,headHeight:0.46,headThickness:0.1,backStyle:'spike',wrapLength:0.34,wearStyle:'crude',wearAmount:0.7},{head:'dark-iron',handle:'dark-wood',grip:'red-leather',accent:'rusted-iron'}),
    preset('war-axe','War Axe','Heavy double-bladed battlefield axe.',{headStyle:'double',handleLength:1.42,handleThickness:0.085,headWidth:0.82,headHeight:0.5,headThickness:0.11,backStyle:'second-blade',wrapLength:0.38,wearStyle:'clean',wearAmount:0.12},{head:'steel',handle:'dark-wood',grip:'black-leather',accent:'bronze'}),
    preset('crypt-cleaver','Crypt Cleaver','Ancient executioner-like axe.',{headStyle:'cleaver',handleLength:1.02,handleThickness:0.08,headWidth:0.62,headHeight:0.52,headThickness:0.12,backStyle:'hammer',wrapLength:0.3,wearStyle:'undead',wearAmount:0.74},{head:'rusted-iron',handle:'dark-wood',grip:'cloth',accent:'bronze'}),
  ],
}

const mace: ForgeItemGeneratorDefinition = {
  id: 'weapon.mace', label: 'Mace Generator', description: 'Flanged, spiked, hammer and ceremonial blunt weapons.',
  fields: [select('headStyle','Head family','Head',['flanged','spiked','hammer','bulb','star']),range('shaftLength','Shaft length','Shaft',0.65,1.55,0.01),range('shaftThickness','Shaft thickness','Shaft',0.045,0.105,0.005),range('headRadius','Head radius','Head',0.12,0.34,0.01),range('headHeight','Head height','Head',0.16,0.46,0.01),range('flangeCount','Flange / spike count','Head',4,10,1),range('spikeSize','Spike size','Head',0,0.24,0.01),range('gripLength','Grip wrap','Shaft',0.18,0.55,0.01),...finishField],
  materials: [materialField('head','Head',metalOptions),materialField('shaft','Shaft',metalOptions),materialField('grip','Grip',gripOptions),materialField('accent','Accent',metalOptions)],
  presets: [
    preset('guard-mace','Guard Mace','Compact flanged steel mace.',{headStyle:'flanged',shaftLength:0.88,shaftThickness:0.06,headRadius:0.2,headHeight:0.28,flangeCount:6,spikeSize:0.03,gripLength:0.28,wearStyle:'clean',wearAmount:0.12},{head:'steel',shaft:'dark-iron',grip:'black-leather',accent:'bronze'}),
    preset('morning-star','Morning Star','Rigid spiked crushing head.',{headStyle:'spiked',shaftLength:0.92,shaftThickness:0.065,headRadius:0.22,headHeight:0.26,flangeCount:8,spikeSize:0.16,gripLength:0.3,wearStyle:'worn',wearAmount:0.4},{head:'weathered-steel',shaft:'iron',grip:'brown-leather',accent:'dark-iron'}),
    preset('war-hammer','War Hammer','Square hammer with rear spike.',{headStyle:'hammer',shaftLength:1.08,shaftThickness:0.07,headRadius:0.23,headHeight:0.3,flangeCount:4,spikeSize:0.12,gripLength:0.34,wearStyle:'crude',wearAmount:0.45},{head:'dark-iron',shaft:'steel',grip:'brown-leather',accent:'iron'}),
    preset('bone-crusher','Bone Crusher','Undead star-headed mace.',{headStyle:'star',shaftLength:1.0,shaftThickness:0.075,headRadius:0.26,headHeight:0.32,flangeCount:7,spikeSize:0.1,gripLength:0.36,wearStyle:'undead',wearAmount:0.72},{head:'rusted-iron',shaft:'dark-iron',grip:'cloth',accent:'bone'}),
  ],
}

const staff: ForgeItemGeneratorDefinition = {
  id: 'weapon.staff', label: 'Staff Generator', description: 'Caster staves with crystals, cages, forks, orbs and ritual fittings.',
  fields: [select('headStyle','Focus family','Focus',['crystal','orb','fork','cage','crook','skull']),range('shaftLength','Staff length','Shaft',1.5,2.8,0.02),range('shaftThickness','Shaft thickness','Shaft',0.035,0.095,0.005),range('headScale','Focus scale','Focus',0.12,0.52,0.01),range('crookedness','Crookedness','Shaft',0,0.4,0.01),range('ringCount','Rings','Details',0,5,1),range('wrapLength','Grip wrap','Details',0.1,0.7,0.01),...finishField],
  materials: [materialField('shaft','Shaft',gripOptions),materialField('head','Focus',metalOptions),materialField('grip','Wrap',gripOptions),materialField('accent','Crystal / accent',[{value:'arcane-blue',label:'Arcane blue'},{value:'blood-red',label:'Blood red'},{value:'poison-green',label:'Poison green'},...metalOptions])],
  presets: [
    preset('apprentice','Apprentice','Simple orb staff.',{headStyle:'orb',shaftLength:2.0,shaftThickness:0.05,headScale:0.2,crookedness:0.04,ringCount:1,wrapLength:0.3,wearStyle:'clean',wearAmount:0.08},{shaft:'wood',head:'bronze',grip:'brown-leather',accent:'arcane-blue'}),
    preset('bone-mage','Bone Mage','Crooked crypt caster staff.',{headStyle:'skull',shaftLength:2.2,shaftThickness:0.065,headScale:0.32,crookedness:0.24,ringCount:2,wrapLength:0.42,wearStyle:'undead',wearAmount:0.66},{shaft:'dark-wood',head:'bone',grip:'cloth',accent:'poison-green'}),
    preset('arcane','Arcane Crystal','Tall crystal focus staff.',{headStyle:'crystal',shaftLength:2.35,shaftThickness:0.055,headScale:0.34,crookedness:0.03,ringCount:3,wrapLength:0.36,wearStyle:'noble',wearAmount:0.04},{shaft:'dark-wood',head:'silvered-steel',grip:'blue-cloth',accent:'arcane-blue'}),
    preset('cult','Cult Fork','Forked ritual staff.',{headStyle:'fork',shaftLength:2.08,shaftThickness:0.06,headScale:0.3,crookedness:0.12,ringCount:2,wrapLength:0.4,wearStyle:'worn',wearAmount:0.46},{shaft:'dark-wood',head:'blackened-steel',grip:'red-leather',accent:'blood-red'}),
  ],
}

const spear: ForgeItemGeneratorDefinition = {
  id: 'weapon.spear', label: 'Spear Generator', description: 'Spears and polearms with varied points, lugs, wraps and counterweights.',
  fields: [select('headStyle','Point family','Head',['leaf','diamond','barbed','pike','trident']),range('shaftLength','Shaft length','Shaft',1.5,3.1,0.02),range('shaftThickness','Shaft thickness','Shaft',0.035,0.085,0.005),range('headLength','Head length','Head',0.24,0.72,0.01),range('headWidth','Head width','Head',0.08,0.34,0.01),select('lugStyle','Lugs / wings','Head',['none','short','wide','hooked']),range('wrapLength','Grip wrap','Shaft',0.1,0.8,0.01),select('buttStyle','Butt cap','Shaft',['plain','metal-cap','spike','counterweight']),...finishField],
  materials: [materialField('head','Head',metalOptions),materialField('shaft','Shaft',gripOptions),materialField('grip','Wrap',gripOptions),materialField('accent','Accent',metalOptions)],
  presets: [
    preset('militia','Militia Spear','Simple leaf spear for infantry.',{headStyle:'leaf',shaftLength:2.25,shaftThickness:0.05,headLength:0.38,headWidth:0.17,lugStyle:'none',wrapLength:0.3,buttStyle:'metal-cap',wearStyle:'worn',wearAmount:0.3},{head:'weathered-steel',shaft:'wood',grip:'brown-leather',accent:'iron'}),
    preset('pike','Guard Pike','Long narrow anti-charge pike.',{headStyle:'pike',shaftLength:2.85,shaftThickness:0.055,headLength:0.55,headWidth:0.1,lugStyle:'short',wrapLength:0.42,buttStyle:'spike',wearStyle:'clean',wearAmount:0.08},{head:'steel',shaft:'dark-wood',grip:'black-leather',accent:'steel'}),
    preset('barbed','Raider Harpoon','Barbed brutal polearm.',{headStyle:'barbed',shaftLength:2.0,shaftThickness:0.065,headLength:0.48,headWidth:0.22,lugStyle:'hooked',wrapLength:0.44,buttStyle:'counterweight',wearStyle:'crude',wearAmount:0.72},{head:'rusted-iron',shaft:'dark-wood',grip:'red-leather',accent:'dark-iron'}),
    preset('crypt-trident','Crypt Trident','Three-pronged ceremonial spear.',{headStyle:'trident',shaftLength:2.3,shaftThickness:0.06,headLength:0.5,headWidth:0.3,lugStyle:'wide',wrapLength:0.38,buttStyle:'spike',wearStyle:'undead',wearAmount:0.62},{head:'blackened-steel',shaft:'dark-wood',grip:'cloth',accent:'bronze'}),
  ],
}

const bow: ForgeItemGeneratorDefinition = {
  id: 'weapon.bow', label: 'Bow Generator', description: 'Longbows, recurves and compact hunting bows with real curved limbs and strings.',
  fields: [select('bowStyle','Bow family','Limbs',['longbow','recurve','shortbow','tribal']),range('bowLength','Bow height','Limbs',1.25,2.25,0.01),range('limbThickness','Limb thickness','Limbs',0.025,0.075,0.0025),range('curve','Curve','Limbs',0.08,0.48,0.01),range('recurve','Tip recurve','Limbs',0,0.38,0.01),range('gripLength','Grip length','Grip',0.14,0.38,0.01),range('gripThickness','Grip thickness','Grip',0.045,0.1,0.005),select('tipStyle','Tip fittings','Details',['plain','horn','metal']),...finishField],
  materials: [materialField('limb','Limbs',gripOptions),materialField('grip','Grip',gripOptions),materialField('string','String',[{value:'string-light',label:'Light cord'},{value:'string-dark',label:'Dark cord'},{value:'red-cloth',label:'Red cord'}]),materialField('accent','Tip fittings',metalOptions)],
  presets: [
    preset('hunter','Hunter Bow','Balanced wooden hunting bow.',{bowStyle:'longbow',bowLength:1.75,limbThickness:0.045,curve:0.22,recurve:0.02,gripLength:0.24,gripThickness:0.065,tipStyle:'plain',wearStyle:'worn',wearAmount:0.26},{limb:'wood',grip:'brown-leather',string:'string-light',accent:'iron'}),
    preset('recurve','Guard Recurve','Compact powerful recurved bow.',{bowStyle:'recurve',bowLength:1.55,limbThickness:0.05,curve:0.3,recurve:0.24,gripLength:0.22,gripThickness:0.07,tipStyle:'horn',wearStyle:'clean',wearAmount:0.1},{limb:'dark-wood',grip:'black-leather',string:'string-dark',accent:'bone'}),
    preset('tribal','Tribal Bow','Asymmetric wrapped bow.',{bowStyle:'tribal',bowLength:1.62,limbThickness:0.055,curve:0.28,recurve:0.12,gripLength:0.3,gripThickness:0.075,tipStyle:'horn',wearStyle:'crude',wearAmount:0.6},{limb:'wood',grip:'cloth',string:'red-cloth',accent:'bone'}),
  ],
}

const helmet = armorGenerator('helmet','Helmet Generator','Helmets, hoods and face protection built around ForgeHumanoidV1 head proportions.',
  [select('armorStyle','Helmet family','Shape',['open-helm','nasal','greathelm','skullcap','hooded']),range('width','Width','Shape',0.38,0.68,0.01),range('height','Height','Shape',0.28,0.58,0.01),range('depth','Depth','Shape',0.34,0.64,0.01),select('faceGuard','Face guard','Details',['open','nasal','brow','visor']),range('rimSize','Rim / brow','Details',0.02,0.14,0.005)],
  [preset('guard','Town Guard Helm','Practical nasal guard helmet.',{armorStyle:'nasal',width:0.5,height:0.42,depth:0.48,faceGuard:'nasal',rimSize:0.055,wearStyle:'clean',wearAmount:0.14},{base:'steel',trim:'bronze',soft:'brown-leather'}),preset('crypt','Crypt Helm','Damaged ancient helmet.',{armorStyle:'skullcap',width:0.52,height:0.38,depth:0.5,faceGuard:'brow',rimSize:0.07,wearStyle:'rusted',wearAmount:0.7},{base:'rusted-iron',trim:'dark-iron',soft:'cloth'}),preset('heavy','Heavy Greathelm','Closed heavy plate helmet.',{armorStyle:'greathelm',width:0.56,height:0.52,depth:0.54,faceGuard:'visor',rimSize:0.09,wearStyle:'worn',wearAmount:0.25},{base:'dark-iron',trim:'steel',soft:'black-leather'})])

const chest = armorGenerator('chest','Chest Armor Generator','Body-aware torso shells, shoulders, collars and belts.',
  [select('armorStyle','Armor family','Torso',['plate','brigandine','leather','bone','reinforced-cloth']),range('width','Torso width','Torso',0.52,0.92,0.01),range('height','Torso height','Torso',0.55,0.98,0.01),range('depth','Torso depth','Torso',0.28,0.56,0.01),range('waistTaper','Waist taper','Torso',0,0.42,0.01),select('shoulderStyle','Shoulders','Shoulders',['none','small','layered','large','asymmetric']),range('shoulderScale','Shoulder scale','Shoulders',0.6,1.4,0.01),select('collarStyle','Collar','Details',['none','low','raised','gorget']),range('beltSize','Belt','Details',0,0.16,0.005)],
  [preset('soldier','Soldier Plate','Balanced plate cuirass.',{armorStyle:'plate',width:0.7,height:0.76,depth:0.4,waistTaper:0.22,shoulderStyle:'small',shoulderScale:0.9,collarStyle:'low',beltSize:0.07,wearStyle:'worn',wearAmount:0.25},{base:'steel',trim:'dark-iron',soft:'brown-leather'}),preset('raider','Raider Harness','Asymmetric crude protection.',{armorStyle:'leather',width:0.72,height:0.7,depth:0.38,waistTaper:0.12,shoulderStyle:'asymmetric',shoulderScale:1.15,collarStyle:'none',beltSize:0.1,wearStyle:'crude',wearAmount:0.7},{base:'brown-leather',trim:'rusted-iron',soft:'red-cloth'}),preset('crypt','Crypt Plate','Ancient layered undead armor.',{armorStyle:'bone',width:0.74,height:0.8,depth:0.42,waistTaper:0.18,shoulderStyle:'layered',shoulderScale:1.05,collarStyle:'gorget',beltSize:0.08,wearStyle:'undead',wearAmount:0.68},{base:'dark-iron',trim:'bone',soft:'cloth'})])

const gloves = armorGenerator('gloves','Glove / Gauntlet Generator','Paired hand and forearm protection as one reusable master asset.',
  [select('armorStyle','Gauntlet family','Shape',['plate','leather','bracer','claw','bone']),range('span','Pair span','Shape',0.72,1.28,0.01),range('cuffLength','Cuff length','Shape',0.16,0.42,0.01),range('handScale','Hand scale','Shape',0.12,0.28,0.01),range('plateCount','Plate layers','Details',1,5,1),select('knuckleStyle','Knuckles','Details',['plain','ridge','studs','spikes'])],
  [preset('plate','Plate Gauntlets','Layered metal gauntlets.',{armorStyle:'plate',span:1.0,cuffLength:0.3,handScale:0.2,plateCount:3,knuckleStyle:'ridge',wearStyle:'clean',wearAmount:0.12},{base:'steel',trim:'dark-iron',soft:'black-leather'}),preset('bracer','Leather Bracers','Light wrapped forearm guards.',{armorStyle:'bracer',span:1.02,cuffLength:0.34,handScale:0.16,plateCount:2,knuckleStyle:'plain',wearStyle:'worn',wearAmount:0.35},{base:'brown-leather',trim:'iron',soft:'cloth'}),preset('crypt','Crypt Claws','Undead spiked gauntlets.',{armorStyle:'claw',span:1.05,cuffLength:0.32,handScale:0.22,plateCount:4,knuckleStyle:'spikes',wearStyle:'undead',wearAmount:0.64},{base:'dark-iron',trim:'bone',soft:'black-leather'})])

const legs = armorGenerator('legs','Leg Armor Generator','Paired tassets, thigh plates and greaves.',
  [select('armorStyle','Leg family','Shape',['plate','leather','tassets','bone','reinforced-cloth']),range('hipWidth','Hip width','Shape',0.34,0.72,0.01),range('thighLength','Thigh length','Shape',0.28,0.62,0.01),range('shinLength','Shin length','Shape',0.26,0.58,0.01),range('plateScale','Plate scale','Details',0.72,1.32,0.01),select('kneeStyle','Knees','Details',['none','cap','winged','spiked'])],
  [preset('soldier','Soldier Legs','Practical plate leg harness.',{armorStyle:'plate',hipWidth:0.48,thighLength:0.46,shinLength:0.44,plateScale:1,kneeStyle:'cap',wearStyle:'worn',wearAmount:0.24},{base:'steel',trim:'dark-iron',soft:'brown-leather'}),preset('scout','Scout Leggings','Light leather and cloth protection.',{armorStyle:'leather',hipWidth:0.46,thighLength:0.42,shinLength:0.38,plateScale:0.82,kneeStyle:'none',wearStyle:'worn',wearAmount:0.32},{base:'brown-leather',trim:'iron',soft:'cloth'}),preset('crypt','Crypt Greaves','Old spiked leg plates.',{armorStyle:'bone',hipWidth:0.5,thighLength:0.48,shinLength:0.46,plateScale:1.08,kneeStyle:'spiked',wearStyle:'undead',wearAmount:0.66},{base:'dark-iron',trim:'bone',soft:'black-leather'})])

const boots = armorGenerator('boots','Boot Generator','Paired boots and sabatons with controllable shafts, toes and cuffs.',
  [select('armorStyle','Boot family','Shape',['leather','plate','sabaton','fur','bone']),range('span','Pair span','Shape',0.34,0.68,0.01),range('footLength','Foot length','Shape',0.26,0.58,0.01),range('shaftHeight','Shaft height','Shape',0.16,0.48,0.01),range('width','Foot width','Shape',0.12,0.28,0.01),select('toeStyle','Toe','Details',['round','square','pointed','layered']),select('cuffStyle','Cuff','Details',['plain','folded','plate','fur'])],
  [preset('leather','Leather Boots','Simple adventurer boots.',{armorStyle:'leather',span:0.46,footLength:0.4,shaftHeight:0.3,width:0.18,toeStyle:'round',cuffStyle:'folded',wearStyle:'worn',wearAmount:0.28},{base:'brown-leather',trim:'dark-iron',soft:'cloth'}),preset('sabaton','Knight Sabatons','Layered metal foot armor.',{armorStyle:'sabaton',span:0.48,footLength:0.46,shaftHeight:0.28,width:0.19,toeStyle:'layered',cuffStyle:'plate',wearStyle:'clean',wearAmount:0.1},{base:'steel',trim:'bronze',soft:'black-leather'}),preset('crypt','Crypt Boots','Ancient pointed greave-boots.',{armorStyle:'bone',span:0.5,footLength:0.44,shaftHeight:0.36,width:0.2,toeStyle:'pointed',cuffStyle:'plate',wearStyle:'undead',wearAmount:0.65},{base:'dark-iron',trim:'bone',soft:'black-leather'})])

const generators: ForgeItemGeneratorDefinition[] = [sword, dagger, axe, mace, staff, spear, bow, helmet, chest, gloves, legs, boots]
const generatorMap = new Map<ForgeItemGeneratorId, ForgeItemGeneratorDefinition>(generators.map((entry) => [entry.id, entry]))

export const ITEM_GENERATOR_COVERAGE = { weapon: ['sword','dagger','axe','mace','staff','spear','bow'], armor: ['helmet','chest','gloves','legs','boots'] } as const

export function generatorForItem(item: ForgeItemDefinition) { const c = itemClassification(item); return generatorMap.get(`${c.itemType}.${c.subtype}` as ForgeItemGeneratorId) }
export function getItemGenerator(id: ForgeItemGeneratorId) { return generatorMap.get(id) }
export function itemGeneratorRecipe(item: ForgeItemDefinition): ForgeItemGeneratorRecipe | undefined { const generator = generatorForItem(item); if (!generator) return undefined; const stored = (item as ForgeItemDefinition & { generatorRecipe?: ForgeItemGeneratorRecipe }).generatorRecipe; if (stored?.generatorId === generator.id && stored.version === 1) return normalizeRecipe(generator, stored); return recipeFromPreset(generator, generator.presets[0], stableSeed(item.id)) }
export function recipeFromPreset(generator: ForgeItemGeneratorDefinition, source: ForgeGeneratorPreset, seed: number): ForgeItemGeneratorRecipe { return { generatorId: generator.id, version: 1, seed: normalizeSeed(seed), preset: source.id, params: { ...source.params }, materials: { ...source.materials } } }
export function applyGeneratorPreset(recipe: ForgeItemGeneratorRecipe, presetId: string) { const generator = getItemGenerator(recipe.generatorId); if (!generator) return recipe; if (presetId === 'custom') return { ...recipe, preset: 'custom' }; const source = generator.presets.find((entry) => entry.id === presetId) ?? generator.presets[0]; return recipeFromPreset(generator, source, recipe.seed) }
export function randomizeGeneratorRecipe(recipe: ForgeItemGeneratorRecipe, seed = randomSeed()) { const generator = getItemGenerator(recipe.generatorId); if (!generator) return recipe; const normalized = normalizeSeed(seed); const rng = mulberry32(normalized); const source = generator.presets[Math.floor(rng() * generator.presets.length)] ?? generator.presets[0]; return mutateRecipe(recipeFromPreset(generator, source, normalized), generator, rng) }
export function variationRecipes(recipe: ForgeItemGeneratorRecipe, count = 12) { return Array.from({ length: Math.max(1, count) }, (_, index) => randomizeGeneratorRecipe(recipe, normalizeSeed(recipe.seed + (index + 1) * 7919))) }
export function updateGeneratorParam(recipe: ForgeItemGeneratorRecipe, key: string, value: ForgeGeneratorValue): ForgeItemGeneratorRecipe { return { ...recipe, preset: 'custom', params: { ...recipe.params, [key]: value } } }
export function updateGeneratorMaterial(recipe: ForgeItemGeneratorRecipe, key: string, value: string): ForgeItemGeneratorRecipe { return { ...recipe, preset: 'custom', materials: { ...recipe.materials, [key]: value } } }
export function variationSummary(recipe: ForgeItemGeneratorRecipe) { const p = recipe.params; const first = String(p.bladeStyle ?? p.headStyle ?? p.bowStyle ?? p.armorStyle ?? 'custom'); const size = Number(p.bladeLength ?? p.handleLength ?? p.shaftLength ?? p.bowLength ?? p.height ?? p.thighLength ?? p.footLength ?? 0); const finish = String(p.wearStyle ?? 'custom'); return `${label(first)}${size ? ` · ${size.toFixed(2)}` : ''} · ${label(finish)}` }

function normalizeRecipe(generator: ForgeItemGeneratorDefinition, recipe: ForgeItemGeneratorRecipe) { const fallback = generator.presets.find((entry) => entry.id === recipe.preset) ?? generator.presets[0]; const params: Record<string, ForgeGeneratorValue> = { ...fallback.params, ...recipe.params }; for (const field of generator.fields) { if (field.kind === 'range') { const value = Number(params[field.key]); params[field.key] = clamp(Number.isFinite(value) ? value : field.min, field.min, field.max) } else { const value = String(params[field.key] ?? ''); if (!field.options.some((entry) => entry.value === value)) params[field.key] = field.options[0]?.value ?? '' } } const materials = { ...fallback.materials, ...recipe.materials }; for (const field of generator.materials) { const value = materials[field.key]; if (!field.options.some((entry) => entry.value === value)) materials[field.key] = field.options[0]?.value ?? '' } return { ...recipe, generatorId: generator.id, version: 1 as const, seed: normalizeSeed(recipe.seed), params, materials } }
function mutateRecipe(recipe: ForgeItemGeneratorRecipe, generator: ForgeItemGeneratorDefinition, rng: () => number) { const params = { ...recipe.params }; for (const field of generator.fields) { if (field.kind === 'range') { const base = Number(params[field.key] ?? field.min); const rangeSize = field.max - field.min; const strength = field.key === 'wearAmount' ? 0.18 : 0.1; params[field.key] = quantize(clamp(base + (rng() * 2 - 1) * rangeSize * strength, field.min, field.max), field.step) } else if (rng() > 0.76 && field.options.length) params[field.key] = field.options[Math.floor(rng() * field.options.length)].value } const materials = { ...recipe.materials }; for (const field of generator.materials) if (rng() > 0.86 && field.options.length) materials[field.key] = field.options[Math.floor(rng() * field.options.length)].value; return { ...recipe, preset: 'custom', params, materials } }
function armorGenerator(subtype: 'helmet'|'chest'|'gloves'|'legs'|'boots', labelText: string, description: string, fields: ForgeGeneratorField[], presets: ForgeGeneratorPreset[]): ForgeItemGeneratorDefinition { return { id: `armor.${subtype}` as ForgeItemGeneratorId, label: labelText, description, fields: [...fields, ...finishField], materials: [materialField('base','Primary material',[...metalOptions,...gripOptions]),materialField('trim','Trim',metalOptions),materialField('soft','Soft layer',clothOptions)], presets } }
function preset(id: string, labelText: string, description: string, params: Record<string, ForgeGeneratorValue>, materials: Record<string,string>): ForgeGeneratorPreset { return { id, label: labelText, description, params, materials } }
function select(key: string, labelText: string, group: string, values: string[]): ForgeGeneratorField { return { kind: 'select', key, label: labelText, group, options: values.map((value) => ({ value, label: label(value) })) } }
function range(key: string, labelText: string, group: string, min: number, max: number, step: number): ForgeGeneratorField { return { kind: 'range', key, label: labelText, group, min, max, step } }
function materialField(key: string, labelText: string, options: Array<{value:string;label:string}>): ForgeGeneratorMaterialField { return { key, label: labelText, options } }
function label(value: string) { return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
function quantize(value: number, step: number) { return Number((Math.round(value / step) * step).toFixed(5)) }
function normalizeSeed(seed: number) { const value = Math.abs(Math.floor(Number(seed) || 1)) >>> 0; return value || 1 }
function randomSeed() { const array = new Uint32Array(1); if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(array); else array[0] = Math.floor(Math.random() * 0xffffffff); return normalizeSeed(array[0]) }
function stableSeed(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) } return normalizeSeed(hash) }
function mulberry32(seed: number) { let value = seed >>> 0; return () => { value += 0x6d2b79f5; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
