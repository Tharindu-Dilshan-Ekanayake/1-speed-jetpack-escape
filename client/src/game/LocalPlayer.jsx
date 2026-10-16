import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

import { JETPACK_BY_ID } from '../../../shared/config.js'
import { send } from '../net/connection.js'
import { getGame, useGame } from '../state/gameStore.js'
import { addSystem, runtime } from '../state/runtime.js'
import Avatar from './Avatar.jsx'
import { createCameraRig } from './cameraRig.js'
import { onAction } from './input.js'
import { createLocalController } from './localController.js'
import { createPose } from './pose.js'

/**
 * The player you control: controller + camera systems and the avatar mesh.
 * @param {{ identity: { name: string, equipped?: object, proportions?: object }, onReady?: () => void }} props
 */
export function LocalPlayer({ identity, onReady }) {
  const groupRef = useRef(null)
  const poseRef = useRef(createPose())
  const thrustRef = useRef(false)
  const chatRef = useRef(null)
  const camera = useThree((s) => s.camera)

  const jetpack = useGame((s) => s.profile?.jetpack || 'jp1')
  const skin = useGame((s) => s.profile?.skin || '')
  const vip = useGame((s) => (s.profile?.passes?.vip_plus ? 2 : s.profile?.passes?.vip ? 1 : 0))
  const showNames = useGame((s) => s.settings.showNames)

  useEffect(() => {
    const ctl = createLocalController({ poseRef, thrustRef, chatRef })
    // welcome/profile arrived before the canvas mounted: apply them now.
    const { welcome, profile } = getGame()
    if (welcome?.spawn) ctl.teleport(welcome.spawn, { snap: false })
    if (profile) ctl.setMaxFuel(JETPACK_BY_ID[profile.jetpack]?.fuel || 10)
    runtime.local = ctl
    ctl.attach(groupRef.current)
    const rig = createCameraRig(camera)
    rig.snap(ctl.yaw)
    runtime.cameraRig = rig
    let clock = 0
    const offCtl = addSystem({ name: 'local', order: 10, fixed: true, update: (dt) => ctl.update(dt) })
    const offCam = addSystem({
      name: 'camera',
      order: 20,
      update(dt) {
        clock += dt
        const game = getGame()
        rig.update(dt, clock, {
          c: ctl.state,
          hSpeed: ctl.hSpeed,
          moving: ctl.hSpeed > 1,
          settings: game.settings,
          shake: ctl.shakeAmount,
          zone: runtime.zone,
          collision: runtime.collision,
          treadmillYaw: ctl.treadmill >= 0 ? ctl.yaw : null,
        })
        // Like Roblox: don't render yourself when the camera is jammed against you.
        const inner = groupRef.current?.children[0]
        if (inner) inner.visible = rig.curDist > 3.5
      },
    })
    const offInteract = onAction('interact', () => ctl.interact())
    return () => {
      offCtl()
      offCam()
      offInteract()
      if (runtime.local === ctl) runtime.local = null
      runtime.cameraRig = null
    }
  }, [camera])

  // Keep the server's copy of our Bloxity look current (other players render it).
  const avatarKey = JSON.stringify({ e: identity.equipped || {}, p: identity.proportions || {} })
  useEffect(() => {
    const { e, p } = JSON.parse(avatarKey)
    send('avatar', { avatar: { equipped: e, proportions: p } })
  }, [avatarKey])

  return (
    <group ref={groupRef}>
      <Avatar
        name={identity.name}
        equipped={identity.equipped}
        proportions={identity.proportions}
        jetpack={jetpack}
        skin={skin}
        poseRef={poseRef}
        thrustRef={thrustRef}
        chatRef={chatRef}
        vip={vip}
        showName={showNames}
        onReady={onReady}
      />
    </group>
  )
}

export default LocalPlayer
