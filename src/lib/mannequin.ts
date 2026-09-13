import * as THREE from 'three'

const skin = new THREE.MeshStandardMaterial({ color: 0xb9c7d8, roughness: 0.72, metalness: 0.03 })
const suit = new THREE.MeshStandardMaterial({ color: 0x33465e, roughness: 0.6, metalness: 0.06 })
const accent = new THREE.MeshStandardMaterial({ color: 0x6faeff, roughness: 0.45, metalness: 0.08 })
const dark = new THREE.MeshStandardMaterial({ color: 0x1f2a39, roughness: 0.72, metalness: 0.04 })

function bone(name: string, x: number, y: number, z: number) {
  const b = new THREE.Bone()
  b.name = name
  b.position.set(x, y, z)
  return b
}

function segment(parent: THREE.Bone, childOffset: THREE.Vector3, radius: number, material: THREE.Material) {
  const length = childOffset.length()
  if (length < 0.001) return
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.88, radius, length, 10), material)
  mesh.position.copy(childOffset).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), childOffset.clone().normalize())
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
}

function box(parent: THREE.Object3D, size: THREE.Vector3, position: THREE.Vector3, material: THREE.Material, radius = 0) {
  const geometry = radius > 0 ? new THREE.CapsuleGeometry(radius, Math.max(0.01, size.y - radius * 2), 5, 10) : new THREE.BoxGeometry(size.x, size.y, size.z)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position)
  mesh.castShadow = true
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function addFinger(hand: THREE.Bone, side: 'Left' | 'Right', finger: string, sign: number, z: number, y = 0, length = 0.055) {
  const first = bone(`${side}Hand${finger}1`, sign * 0.045, y, z)
  const second = bone(`${side}Hand${finger}2`, sign * length, 0, 0)
  const third = bone(`${side}Hand${finger}3`, sign * length * 0.82, 0, 0)
  const tip = bone(`${side}Hand${finger}Tip`, sign * length * 0.62, 0, 0)
  hand.add(first)
  first.add(second)
  second.add(third)
  third.add(tip)
  segment(hand, first.position, 0.014, skin)
  segment(first, second.position, 0.013, skin)
  segment(second, third.position, 0.011, skin)
  segment(third, tip.position, 0.009, skin)
  return { first, second, third, tip }
}

function addHandRig(hand: THREE.Bone, side: 'Left' | 'Right', sign: number) {
  addFinger(hand, side, 'Thumb', sign, 0.065, -0.035, 0.045)
  addFinger(hand, side, 'Index', sign, 0.052, 0.025, 0.060)
  addFinger(hand, side, 'Middle', sign, 0.017, 0.032, 0.065)
  addFinger(hand, side, 'Ring', sign, -0.020, 0.025, 0.060)
  addFinger(hand, side, 'Pinky', sign, -0.052, 0.010, 0.052)
}

export function createForgeMannequin() {
  const root = new THREE.Group()
  root.name = 'ForgeMannequin'

  const hips = bone('Hips', 0, 1.02, 0)
  const spine = bone('Spine', 0, 0.20, 0)
  const chest = bone('Chest', 0, 0.30, 0)
  const neck = bone('Neck', 0, 0.31, 0)
  const head = bone('Head', 0, 0.17, 0)

  const leftUpperArm = bone('LeftUpperArm', -0.25, 0.19, 0)
  const leftLowerArm = bone('LeftLowerArm', -0.36, 0, 0)
  const leftHand = bone('LeftHand', -0.30, 0, 0)
  const rightUpperArm = bone('RightUpperArm', 0.25, 0.19, 0)
  const rightLowerArm = bone('RightLowerArm', 0.36, 0, 0)
  const rightHand = bone('RightHand', 0.30, 0, 0)

  const leftUpperLeg = bone('LeftUpperLeg', -0.13, -0.08, 0)
  const leftLowerLeg = bone('LeftLowerLeg', 0, -0.48, 0)
  const leftFoot = bone('LeftFoot', 0, -0.46, 0)
  const leftToes = bone('LeftToeBase', 0, -0.015, 0.27)
  const rightUpperLeg = bone('RightUpperLeg', 0.13, -0.08, 0)
  const rightLowerLeg = bone('RightLowerLeg', 0, -0.48, 0)
  const rightFoot = bone('RightFoot', 0, -0.46, 0)
  const rightToes = bone('RightToeBase', 0, -0.015, 0.27)

  root.add(hips)
  hips.add(spine, leftUpperLeg, rightUpperLeg)
  spine.add(chest)
  chest.add(neck, leftUpperArm, rightUpperArm)
  neck.add(head)
  leftUpperArm.add(leftLowerArm)
  leftLowerArm.add(leftHand)
  rightUpperArm.add(rightLowerArm)
  rightLowerArm.add(rightHand)
  leftUpperLeg.add(leftLowerLeg)
  leftLowerLeg.add(leftFoot)
  leftFoot.add(leftToes)
  rightUpperLeg.add(rightLowerLeg)
  rightLowerLeg.add(rightFoot)
  rightFoot.add(rightToes)

  addHandRig(leftHand, 'Left', -1)
  addHandRig(rightHand, 'Right', 1)

  box(hips, new THREE.Vector3(0.34, 0.18, 0.24), new THREE.Vector3(0, 0.03, 0), dark)
  segment(spine, chest.position, 0.17, suit)
  segment(chest, neck.position, 0.22, suit)
  box(chest, new THREE.Vector3(0.46, 0.18, 0.24), new THREE.Vector3(0, 0.08, 0), accent)
  segment(neck, head.position, 0.075, skin)

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), skin)
  headMesh.position.y = 0.11
  headMesh.scale.set(0.92, 1.08, 0.92)
  headMesh.castShadow = true
  head.add(headMesh)

  segment(leftUpperArm, leftLowerArm.position, 0.085, suit)
  segment(leftLowerArm, leftHand.position, 0.072, suit)
  segment(rightUpperArm, rightLowerArm.position, 0.085, suit)
  segment(rightLowerArm, rightHand.position, 0.072, suit)

  const handGeometry = new THREE.BoxGeometry(0.13, 0.11, 0.16)
  const leftHandMesh = new THREE.Mesh(handGeometry, skin)
  leftHandMesh.position.x = -0.015
  leftHandMesh.castShadow = true
  leftHand.add(leftHandMesh)
  const rightHandMesh = leftHandMesh.clone()
  rightHandMesh.position.x = 0.015
  rightHand.add(rightHandMesh)

  segment(leftUpperLeg, leftLowerLeg.position, 0.105, dark)
  segment(leftLowerLeg, leftFoot.position, 0.09, dark)
  segment(rightUpperLeg, rightLowerLeg.position, 0.105, dark)
  segment(rightLowerLeg, rightFoot.position, 0.09, dark)

  box(leftFoot, new THREE.Vector3(0.18, 0.10, 0.34), new THREE.Vector3(0, -0.03, 0.10), dark)
  box(rightFoot, new THREE.Vector3(0.18, 0.10, 0.34), new THREE.Vector3(0, -0.03, 0.10), dark)

  root.updateMatrixWorld(true)
  return root
}
