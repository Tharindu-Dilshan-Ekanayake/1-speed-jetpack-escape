import { useEffect, useMemo, useRef, useState } from 'react'

import { JETPACK_BY_ID } from '../../../shared/config.js'
import { ANIM } from '../../../shared/net.js'
import { getGame, useGame } from '../state/gameStore.js'
import { addSystem, runtime } from '../state/runtime.js'
import Avatar from './Avatar.jsx'
import { createPose, stopEmote, updatePose } from './pose.js'

const INTERP_DELAY = 110 // ms behind the newest snapshot

const lookOf = (p) => ({
  name: p.name,
  avatar: p.avatar,
  jetpack: p.jetpack || 'jp1',
  skin: p.skin || '',
  trail: p.trail || 'arrows',
  vip: p.vip || 0,
})
const sameLook = (a, b) => a.name === b.name && a.avatar === b.avatar && a.jetpack === b.jetpack && a.skin === b.skin && a.vip === b.vip

function parseAvatar(json) {
  try {
    const v = JSON.parse(json || '{}')
    return { equipped: v.equipped || {}, proportions: v.proportions || {} }
  } catch {
    return { equipped: {}, proportions: {} }
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function RemotePlayer({ id }) {
  const groupRef = useRef(null)
  const poseRef = useRef(createPose())
  const thrustRef = useRef(false)
  const chatRef = useRef(null)
  const [look, setLook] = useState(() => lookOf(runtime.room.state.players.get(id)))
  const showNames = useGame((s) => s.settings.showNames)
  const avatar = useMemo(() => parseAvatar(look.avatar), [look.avatar])

  useEffect(() => {
    const record = { chatRef, poseRef, buffer: [], prev: null, yaw: 0, lookTimer: 0, look, dead: false }
    runtime.remotes.set(id, record)
    const remove = addSystem({
      name: `remote:${id}`,
      order: 15,
      update(dt) {
        const p = runtime.room?.state.players.get(id)
        const group = groupRef.current
        if (!p || !group) return
        const now = performance.now()
        const buf = record.buffer
        const last = buf[buf.length - 1]
        if (!last || last.x !== p.x || last.y !== p.y || last.z !== p.z || last.ry !== p.ry || last.anim !== p.anim) {
          if (last && Math.hypot(p.x - last.x, p.z - last.z) > 150) buf.length = 0 // teleported
          buf.push({ t: now, x: p.x, y: p.y, z: p.z, ry: p.ry, anim: p.anim, spd: p.spd })
          if (buf.length > 30) buf.shift()
        }
        if (!buf.length) return

        // Interpolate between the two snapshots around the render time.
        const rt = now - INTERP_DELAY
        let a = buf[0]
        let b = buf[0]
        for (let i = buf.length - 1; i >= 0; i -= 1) {
          if (buf[i].t <= rt) {
            a = buf[i]
            b = buf[Math.min(i + 1, buf.length - 1)]
            break
          }
        }
        const span = b.t - a.t
        const k = span > 0 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 1
        const x = a.x + (b.x - a.x) * k
        const y = a.y + (b.y - a.y) * k
        const z = a.z + (b.z - a.z) * k
        const prev = record.prev || { x, y, z }
        const vx = (x - prev.x) / Math.max(dt, 1e-3)
        const vy = (y - prev.y) / Math.max(dt, 1e-3)
        const vz = (z - prev.z) / Math.max(dt, 1e-3)
        record.prev = { x, y, z }
        const prevYaw = record.yaw
        record.yaw = lerpAngle(record.yaw, b.ry, 1 - Math.exp(-15 * dt))
        let turn = record.yaw - prevYaw
        if (turn > Math.PI) turn -= Math.PI * 2
        else if (turn < -Math.PI) turn += Math.PI * 2
        record.turn = turn / Math.max(dt, 1e-3)
        group.position.set(x, y, z)
        group.rotation.y = record.yaw

        const anim = b.anim
        // Death: burst once, hide until they respawn.
        if (anim === ANIM.dead) {
          if (!record.dead) {
            record.dead = true
            runtime.effects?.burst('death', x, y, z)
          }
          group.visible = false
          return
        }
        record.dead = false
        const cam = runtime.camera
        const far = cam ? cam.position.distanceToSquared(group.position) > 4000 * 4000 : false
        // In a room that isn't drawn right now (behind walls): skip them entirely.
        const unseen = far || (runtime.worldView ? !runtime.worldView.isVisibleAt(x, y + 2, z) : false)
        group.visible = !unseen
        if (unseen) return

        updatePose(poseRef.current, { anim, speed: b.spd, turn: record.turn }, dt)
        if (anim !== ANIM.idle) stopEmote(poseRef.current)
        thrustRef.current = anim === ANIM.fly
        if (thrustRef.current && runtime.effects) {
          const flame = JETPACK_BY_ID[record.look.jetpack]?.flame || '#ffb347'
          runtime.effects.jetpackExhaust(x, y, z, record.yaw, poseRef.current.bodyPitch, flame)
        }
        if (getGame().settings.showOtherTrails) runtime.effects?.trail(id, record.look.trail, x, y + 2.6, z, vx, vy, vz, dt)

        record.lookTimer += dt
        if (record.lookTimer > 0.5) {
          record.lookTimer = 0
          const next = lookOf(p)
          record.look.trail = next.trail
          if (!sameLook(next, record.look)) {
            record.look = next
            setLook(next)
          }
        }
      },
    })
    return () => {
      remove()
      runtime.remotes.delete(id)
      runtime.effects?.forgetTrail(id)
    }
    // look is read through record.look after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return (
    <group ref={groupRef}>
      <Avatar
        name={look.name}
        equipped={avatar.equipped}
        proportions={avatar.proportions}
        jetpack={look.jetpack}
        skin={look.skin}
        poseRef={poseRef}
        thrustRef={thrustRef}
        chatRef={chatRef}
        vip={look.vip}
        showName={showNames}
      />
    </group>
  )
}

/** Mounts one RemotePlayer per other player in the room. */
export function RemotePlayers() {
  const [ids, setIds] = useState([])
  useEffect(() => {
    let timer = 0
    let key = ''
    return addSystem({
      name: 'remote-list',
      order: 14,
      update(dt) {
        timer -= dt
        if (timer > 0) return
        timer = 0.25
        const players = runtime.room?.state?.players
        if (!players) return
        const next = []
        players.forEach((_p, sid) => {
          if (sid !== runtime.sessionId) next.push(sid)
        })
        const k = next.join(',')
        if (k !== key) {
          key = k
          setIds(next)
        }
      },
    })
  }, [])
  return ids.map((id) => <RemotePlayer key={id} id={id} />)
}

export default RemotePlayers
