import { Vector3 } from 'three'

import { input } from './input.js'

const MIN_PITCH = -0.35
const MAX_PITCH = 1.35
const MIN_DIST = 7
const MAX_DIST = 80
/** Radians per second the camera swings while A or D is held. */
const TURN_RATE = 2.1

const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/**
 * Third-person orbit camera. Drag to orbit, wheel/pinch to zoom. It is pulled
 * in front of walls (raycast against the collision world) so it never shows
 * the outside of the enclosed rooms, eases in behind fast runs, widens the FOV
 * with speed and shakes on big impacts.
 */
export function createCameraRig(camera) {
  const focus = new Vector3()
  const dir = new Vector3()
  let snapNext = true
  let lastDrag = -10
  let fov = 70
  let far = camera.far
  /** Current A/D turn speed; eases in and out so steering feels smooth. */
  let turnVel = 0

  const rig = {
    yaw: 0,
    pitch: 0.3,
    dist: 24,
    curDist: 24,

    /** Puts the camera straight behind a player facing `playerYaw`. */
    snap(playerYaw) {
      rig.yaw = playerYaw + Math.PI
      snapNext = true
    },

    update(dt, now, { c, hSpeed, moving, settings, shake, zone, collision, treadmillYaw = null }) {
      const sens = settings.camSensitivity || 1
      if (input.lookX || input.lookY) {
        rig.yaw -= input.lookX * 0.0055 * sens
        rig.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, rig.pitch + input.lookY * 0.0045 * sens))
        lastDrag = now
      }
      if (input.zoom) rig.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, rig.dist * Math.exp(input.zoom * 0.0012)))

      // Steering: A / D swing the camera (and so "forward") round with the
      // player, on the ground and in the air. Increasing yaw turns left.
      const steer = settings.turnCamera === false ? 0 : (input.left ? 1 : 0) - (input.right ? 1 : 0)
      turnVel += (steer * TURN_RATE - turnVel) * (1 - Math.exp(-dt * 10))
      if (Math.abs(turnVel) > 1e-3) rig.yaw += turnVel * dt

      // Ease in behind fast forward motion unless the player is steering the camera.
      if (settings.autoCamera && hSpeed > 8 && moving && now - lastDrag > 1.5) {
        const fx = -Math.sin(rig.yaw)
        const fz = -Math.cos(rig.yaw)
        const forwardness = (c.vx * fx + c.vz * fz) / hSpeed
        if (forwardness > 0.2) {
          const desired = Math.atan2(-c.vx, -c.vz)
          rig.yaw = angleLerp(rig.yaw, desired, 1 - Math.exp(-dt * 1.4 * Math.min(1, hSpeed / 60)))
        }
      }

      // On a treadmill: swing round behind the runner so the console is in view.
      if (treadmillYaw !== null && now - lastDrag > 1.5) {
        rig.yaw = angleLerp(rig.yaw, treadmillYaw + Math.PI, 1 - Math.exp(-dt * 2.5))
      }

      const fy = c.y + 4.4
      if (snapNext) {
        focus.set(c.x, fy, c.z)
        rig.curDist = rig.dist
      } else {
        focus.x = c.x
        focus.z = c.z
        focus.y += (fy - focus.y) * (1 - Math.exp(-20 * dt))
      }

      const cp = Math.cos(rig.pitch)
      dir.set(Math.sin(rig.yaw) * cp, Math.sin(rig.pitch), Math.cos(rig.yaw) * cp)
      let want = rig.dist
      if (collision) {
        const hit = collision.raycast(focus.x, focus.y, focus.z, dir.x, dir.y, dir.z, rig.dist + 1)
        want = Math.max(1.5, Math.min(rig.dist, hit - 0.9))
      }
      if (snapNext || want < rig.curDist) rig.curDist += (want - rig.curDist) * (snapNext ? 1 : 1 - Math.exp(-30 * dt))
      else rig.curDist += (want - rig.curDist) * (1 - Math.exp(-4 * dt))
      snapNext = false

      camera.position.copy(focus).addScaledVector(dir, rig.curDist)
      if (shake > 0) {
        const s = shake * shake * 1.6
        camera.position.x += (Math.random() - 0.5) * s
        camera.position.y += (Math.random() - 0.5) * s
        camera.position.z += (Math.random() - 0.5) * s
      }
      camera.lookAt(focus)

      const wantFov = 70 + Math.min(20, hSpeed / 14)
      fov += (wantFov - fov) * (1 - Math.exp(-3 * dt))
      const wantFar = zone?.far || 2400
      let dirty = false
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov
        dirty = true
      }
      if (Math.abs(far - wantFar) > 1) {
        far = wantFar
        camera.far = far
        dirty = true
      }
      if (dirty) camera.updateProjectionMatrix()
    },
  }
  return rig
}
