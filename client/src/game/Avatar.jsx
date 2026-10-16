import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Box3, Matrix4, Vector3 } from 'three'

import { runtime } from '../state/runtime.js'
import { BlockyAvatar } from './BlockyAvatar.jsx'
import { ChatBubble } from './chatBubble.js'
import { createJetpack } from './jetpackModel.js'
import PlayerAvatar from './PlayerAvatar.jsx'
import { LabelSprite } from './props.js'

/** Falls back to the blocky avatar if the Bloxity model can't load. */
class AvatarBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err) {
    console.warn('[avatar] Bloxity avatar unavailable, using blocky fallback:', err?.message || err)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const _inv = new Matrix4()
const _sparkle = new Vector3()
/** Whole-body rotations pivot here (roughly the hips of a 5.2-stud avatar). */
const HIP_HEIGHT = 2.6

/** Puts the jetpack on the avatar's back and returns it. */
function attachJetpack(rig, outer, jetpack, skin) {
  const pack = createJetpack(jetpack, skin)
  if (rig.blocky) {
    pack.position.set(0, 1.05, -1.05)
    rig.blocky.torso.add(pack)
    return pack
  }
  outer.updateWorldMatrix(true, true)
  _inv.copy(outer.matrixWorld).invert()
  let center = new Vector3(0, 3, 0)
  let backZ = -0.5
  const torso = rig.partMeshes?.torso
  if (torso) {
    const box = new Box3().setFromObject(torso).applyMatrix4(_inv)
    if (!box.isEmpty() && Number.isFinite(box.min.z)) {
      center = box.getCenter(new Vector3())
      backZ = box.min.z
    }
  }
  pack.position.set(center.x, center.y, backZ - 0.52)
  outer.add(pack)
  pack.updateMatrixWorld(true)
  ;(rig.backBone || outer).attach(pack)
  return pack
}

/**
 * An avatar (Bloxity model, or blocky fallback) wearing the right jetpack,
 * with a nameplate and chat bubble. Its local frame faces +Z with feet at 0;
 * the parent group handles position and yaw.
 *
 * @param {{ name: string, equipped?: object, proportions?: object, jetpack: string,
 *   skin?: string, poseRef, thrustRef, vip?: number, showName?: boolean,
 *   chatRef?: React.MutableRefObject<{text:string, until:number}|null>, onReady?: () => void }} props
 */
export function Avatar({ name, equipped, proportions, jetpack, skin, poseRef, thrustRef, vip = 0, showName = true, chatRef, onReady }) {
  const outerRef = useRef(null)
  const tiltRef = useRef(null)
  const packRef = useRef(null)
  const [rig, setRig] = useState(null)
  const [nameplate] = useState(() => new LabelSprite(7, 4, { depthTest: true }))
  const [bubble] = useState(() => new ChatBubble())
  const onRig = useCallback((r) => setRig(r), [])

  // Jetpack, re-attached whenever the rig, jetpack or skin changes.
  useEffect(() => {
    if (!rig || !outerRef.current) return undefined
    const pack = attachJetpack(rig, outerRef.current, jetpack, skin)
    packRef.current = pack
    return () => {
      pack.parent?.remove(pack)
      pack.userData.dispose()
      if (packRef.current === pack) packRef.current = null
    }
  }, [rig, jetpack, skin])

  useEffect(() => {
    nameplate.set(vip ? [{ text: name, icon: 'crown' }] : [{ text: name }])
  }, [nameplate, name, vip])

  useFrame((state) => {
    const pose = poseRef?.current
    packRef.current?.userData.setThrust(thrustRef?.current ? 1 : 0, state.clock.elapsedTime)
    bubble.update(chatRef?.current)
    const tilt = tiltRef.current
    if (!tilt || !pose) return
    // Dive, bank and spin about the hips. Order: spin about the body's own
    // long axis, then pitch forward, then bank - so a spin while diving is a
    // proper barrel roll.
    tilt.rotation.set(pose.bodyPitch, pose.spin, pose.bodyBank, 'ZXY')
    if (pose.spinning && runtime.effects) {
      tilt.getWorldPosition(_sparkle)
      const a = state.clock.elapsedTime * 25
      for (const side of [0, Math.PI]) {
        runtime.effects.sparkle(_sparkle.x + Math.cos(a + side) * 2.6, _sparkle.y + Math.sin(a * 0.7) * 1.5, _sparkle.z + Math.sin(a + side) * 2.6)
      }
    }
  })

  const fallback = <BlockyAvatar name={name} poseRef={poseRef} onRig={onRig} />
  return (
    <group>
      <group ref={tiltRef} position={[0, HIP_HEIGHT, 0]}>
        <group ref={outerRef} position={[0, -HIP_HEIGHT, 0]}>
          <AvatarBoundary fallback={fallback}>
            <Suspense fallback={fallback}>
              <PlayerAvatar equipped={equipped} proportions={proportions} poseRef={poseRef} targetHeight={5.2} onRig={onRig} onReady={onReady} />
            </Suspense>
          </AvatarBoundary>
        </group>
      </group>
      {showName && <primitive object={nameplate.sprite} position={[0, 6.9, 0]} />}
      <primitive object={bubble.sprite} />
    </group>
  )
}

export default Avatar
