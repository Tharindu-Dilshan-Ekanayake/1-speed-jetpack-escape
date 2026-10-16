import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three'

import { BOOST_BY_ID, EVENT, JETPACK_BY_ID, PRODUCT_BY_SKU } from '../../../shared/config.js'
import { formatNumber } from '../../../shared/format.js'
import { zoneAt } from '../../../shared/world.js'
import { makeSignTexture } from './canvasArt.js'
import { createJetpack } from './jetpackModel.js'
import { LabelSprite, createBeacons, createCoins, createGhost, createInstancedDecor, createProp, createPumpkins } from './props.js'
import { getHazardTexture, getSurfaceTexture } from './textures.js'
import { createCrushers } from './crusherModel.js'
import { GhostsView } from './ghostsView.js'
import { createTreadmills } from './treadmillModel.js'
import { runtime } from '../state/runtime.js'
import { GeometryBucket, bucketTexture, writeBox } from './worldGeometry.js'

const CHUNK = 2500

const materialCache = new Map()
function surfaceMaterial(key) {
  if (materialCache.has(key)) return materialCache.get(key)
  const texKey = bucketTexture(key)
  let mat
  if (key === 'glow') {
    mat = new MeshBasicMaterial({ vertexColors: true })
  } else if (key.startsWith('belt')) {
    const map = getSurfaceTexture('belt').clone()
    map.needsUpdate = true
    mat = new MeshLambertMaterial({ vertexColors: true, map })
  } else {
    mat = new MeshLambertMaterial({ vertexColors: true, map: getSurfaceTexture(texKey) })
  }
  materialCache.set(key, mat)
  return mat
}

/** Builds a small merged group (1-2 meshes) for one dynamic box, centred on its origin. */
function boxGroup(box, { transparent = false } = {}) {
  const cx = (box.min[0] + box.max[0]) / 2
  const cy = (box.min[1] + box.max[1]) / 2
  const cz = (box.min[2] + box.max[2]) / 2
  const buckets = new Map()
  writeBox(box, (k) => {
    if (!buckets.has(k)) buckets.set(k, new GeometryBucket())
    return buckets.get(k)
  }, [cx, cy, cz])
  const group = new Group()
  group.position.set(cx, cy, cz)
  for (const [key, bucket] of buckets) {
    let mat = surfaceMaterial(key)
    if (transparent) {
      mat = mat.clone()
      mat.transparent = true
    }
    const mesh = new Mesh(bucket.build(), mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  }
  return { group, base: [cx, cy, cz] }
}

export class WorldView {
  constructor(world) {
    this.world = world
    this.root = new Group()
    this.root.name = 'world'
    this.updaters = []
    this.profileHooks = []
    this.boardHooks = []
    this.stockHooks = []

    // Rooms in walking order (lobby, stage 1, reward 1, ... reward 9) plus the
    // race track. Every room is enclosed, so from inside one you can only ever
    // see it and its neighbours through the doors: the rest is not drawn.
    this.zoneIndex = new Map(world.zones.map((z, i) => [z, i]))
    this.raceRoom = world.zones.findIndex((z) => z.kind === 'race')
    this.rooms = world.zones.map((z) => {
      const g = new Group()
      g.name = `room:${z.id}`
      this.root.add(g)
      return g
    })
    /** Room visibility by index, for instanced meshes that span rooms. */
    this.roomVisible = this.rooms.map(() => true)
    this.currentRoom = -1

    this.buildStatic()
    this.buildDynamic()
    this.buildHazards()
    this.buildSigns()
    this.buildDecor()
    this.buildShops()
  }

  /** Room index of a point, or -1 (walls between rooms: always drawn). */
  roomOf(x, y, z) {
    const zone = zoneAt(this.world, x, y, z)
    return zone ? this.zoneIndex.get(zone) : -1
  }

  /** Adds an object to the group of the room it stands in; returns that group. */
  place(object, x = object.position.x, y = object.position.y, z = object.position.z) {
    const room = this.roomOf(x, y, z)
    const parent = room >= 0 ? this.rooms[room] : this.root
    parent.add(object)
    return parent
  }

  /** Shows the player's room and its neighbours; the race track only from inside it. */
  setRoom(index) {
    if (index === this.currentRoom || index < 0) return
    this.currentRoom = index
    this.rooms.forEach((g, i) => {
      const visible = index === this.raceRoom ? i === this.raceRoom : i !== this.raceRoom && Math.abs(i - index) <= 1
      g.visible = visible
      this.roomVisible[i] = visible
    })
  }

  /** False when a point is in a room that is not drawn right now (other players there are hidden too). */
  isVisibleAt(x, y, z) {
    const room = this.roomOf(x, y, z)
    return room < 0 || this.roomVisible[room]
  }

  /* -------------------------------------------------------------------- */

  buildStatic() {
    const chunks = new Map()
    for (const box of this.world.boxes) {
      if (box.raceGate || box.hidden) continue
      const cx = (box.min[0] + box.max[0]) / 2
      const cy = (box.min[1] + box.max[1]) / 2
      const cz = (box.min[2] + box.max[2]) / 2
      const room = this.roomOf(cx, cy, cz)
      const key = `${room}:${Math.round(cx / 5000)}:${Math.floor(cz / CHUNK)}`
      if (!chunks.has(key)) chunks.set(key, { room, origin: [Math.round(cx / 5000) * 5000, 0, (Math.floor(cz / CHUNK) + 0.5) * CHUNK], buckets: new Map() })
      const chunk = chunks.get(key)
      writeBox(box, (k) => {
        if (!chunk.buckets.has(k)) chunk.buckets.set(k, new GeometryBucket())
        return chunk.buckets.get(k)
      }, chunk.origin)
    }
    this.chunks = []
    for (const chunk of chunks.values()) {
      const group = new Group()
      group.position.set(...chunk.origin)
      for (const [key, bucket] of chunk.buckets) {
        if (bucket.empty) continue
        const mesh = new Mesh(bucket.build(), surfaceMaterial(key))
        mesh.receiveShadow = true
        mesh.castShadow = !key.endsWith('|ns') && key !== 'glow'
        mesh.matrixAutoUpdate = false
        mesh.updateMatrix()
        group.add(mesh)
      }
      group.matrixAutoUpdate = false
      group.updateMatrix()
      ;(chunk.room >= 0 ? this.rooms[chunk.room] : this.root).add(group)
      this.chunks.push(group)
    }
  }

  buildDynamic() {
    const W = this.world
    this.movers = W.movers.map((m) => {
      const { group, base } = boxGroup(m)
      const room = this.place(group)
      return { m, group, base, room }
    })
    this.blinkers = W.blinkers.map((b) => {
      const { group } = boxGroup(b, { transparent: true })
      const room = this.place(group)
      return { b, group, room }
    })
    this.lasers = W.lasers.map((l) => {
      const size = [l.max[0] - l.min[0], l.max[1] - l.min[1], l.max[2] - l.min[2]]
      const mat = new MeshBasicMaterial({ color: l.color || '#ff2b4f', transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false })
      const mesh = new Mesh(new BoxGeometry(...size), mat)
      mesh.position.set((l.min[0] + l.max[0]) / 2, (l.min[1] + l.max[1]) / 2, (l.min[2] + l.max[2]) / 2)
      const room = this.place(mesh)
      let marker = null
      if (l.bolt) {
        // Floor patch that flashes red before the strike lands.
        marker = new Mesh(new PlaneGeometry(size[0] - 1, size[2] - 1), new MeshBasicMaterial({ color: '#ff3048', transparent: true, opacity: 0, depthWrite: false }))
        marker.rotation.x = -Math.PI / 2
        marker.position.set(mesh.position.x, l.min[1] + 0.08, mesh.position.z)
        room.add(marker)
      }
      return { l, mesh, mat, marker, room }
    })
    const gate = W.boxes.find((b) => b.raceGate)
    if (gate) {
      const size = [gate.max[0] - gate.min[0], gate.max[1] - gate.min[1], gate.max[2] - gate.min[2]]
      this.gate = new Mesh(new BoxGeometry(...size), new MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.45, depthWrite: false }))
      this.gate.position.set((gate.min[0] + gate.max[0]) / 2, (gate.min[1] + gate.max[1]) / 2, (gate.min[2] + gate.max[2]) / 2)
      this.place(this.gate)
    }
  }

  buildHazards() {
    this.hazardMats = new Map()
    for (const h of this.world.hazards) {
      let mat = this.hazardMats.get(h.kind)
      if (!mat) {
        mat = new MeshBasicMaterial({ map: getHazardTexture(h.kind).clone() })
        mat.map.needsUpdate = true
        this.hazardMats.set(h.kind, mat)
      }
      const w = h.max[0] - h.min[0]
      const d = h.max[2] - h.min[2]
      const geo = new PlaneGeometry(w, d)
      const uv = geo.getAttribute('uv')
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (uv.getX(i) * w) / 24, (uv.getY(i) * d) / 24)
      const mesh = new Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set((h.min[0] + h.max[0]) / 2, h.max[1], (h.min[2] + h.max[2]) / 2)
      const room = this.place(mesh)
      if (!h.big) {
        // Raised strips get glowing edges so they read as "don't touch".
        const edge = new Mesh(new BoxGeometry(w, Math.max(0.3, h.max[1] - h.min[1]), d), new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25 }))
        edge.position.set(mesh.position.x, (h.min[1] + h.max[1]) / 2 - 0.02, mesh.position.z)
        room.add(edge)
      }
    }
  }

  buildSigns() {
    for (const sign of this.world.signs) {
      const { texture } = makeSignTexture(sign)
      const mesh = new Mesh(new PlaneGeometry(sign.w, sign.h), new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
      mesh.position.set(...sign.pos)
      mesh.rotation.y = sign.ry || 0
      mesh.renderOrder = 2
      this.place(mesh)
    }
  }

  buildDecor() {
    const W = this.world
    const propsByRoom = new Map()
    for (const prop of W.props) {
      const room = this.roomOf(prop.pos[0], prop.pos[1], prop.pos[2])
      if (!propsByRoom.has(room)) propsByRoom.set(room, [])
      propsByRoom.get(room).push(prop)
    }
    for (const [room, props] of propsByRoom) {
      const decor = createInstancedDecor(props)
      const parent = room >= 0 ? this.rooms[room] : this.root
      parent.add(decor.group)
      this.updaters.push((t, focus) => parent.visible && decor.update(t, focus))
    }

    for (const prop of W.props) {
      const built = createProp(prop)
      if (!built) continue
      const parent = this.place(built.object, prop.pos[0], prop.pos[1], prop.pos[2])
      if (built.update) this.updaters.push((t, focus) => parent.visible && built.update(t, focus))
      if (built.onBoards) this.boardHooks.push(built.onBoards)
      if (built.onStock) this.stockHooks.push(built.onStock)
      if (built.onProfile) this.profileHooks.push(built.onProfile)
    }

    this.ghosts = W.ghosts.map((g) => {
      const ghost = createGhost()
      ghost.scale.setScalar(g.scale)
      ghost.position.set(...g.pos)
      const room = this.place(ghost)
      return { g, ghost, room }
    })

    const stageOf = (p) => zoneAt(W, p.pos[0], p.pos[1] + 1, p.pos[2])?.stage || 0
    const roomOfItem = (p) => this.roomOf(p.pos[0], p.pos[1] + 1, p.pos[2])
    this.pumpkins = createPumpkins(W.pumpkins, stageOf, W.pumpkins.map(roomOfItem))
    this.root.add(this.pumpkins.mesh)
    this.coins = createCoins(W.coins, W.coins.map(roomOfItem))
    this.root.add(this.coins.mesh)

    const treadmills = createTreadmills(W.treadmills)
    this.rooms[this.zoneIndex.get(W.zones.find((z) => z.kind === 'lobby'))].add(treadmills.group)
    this.treadmills = treadmills

    this.hunters = new GhostsView(W.ghostSpawns)
    this.root.add(this.hunters.group)
    this.crusherViews = createCrushers(W.crushers)
    this.root.add(this.crusherViews.group)

    const beacons = createBeacons(W.beacons)
    if (beacons) {
      this.root.add(beacons.mesh)
      this.updaters.push(beacons.update)
    }
  }

  buildShops() {
    const W = this.world
    // Step boost pads (colour = owned / affordable / locked).
    this.stepPads = W.stepPads.map((p) => {
      const size = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]]
      const mat = new MeshLambertMaterial({ color: '#e8353f', emissive: '#000000' })
      const mesh = new Mesh(new BoxGeometry(...size), mat)
      mesh.position.set((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2)
      mesh.receiveShadow = true
      this.place(mesh)
      return { id: p.id, mat }
    })
    // Trophy pads in the reward rooms.
    this.trophyPads = W.pads.map((p) => {
      const size = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]]
      const mat = new MeshBasicMaterial({ color: p.vip ? '#ff3fd2' : '#ffd23f' })
      const mesh = new Mesh(new BoxGeometry(...size), mat)
      mesh.position.set((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2)
      const room = this.place(mesh)
      return { p, mat, room }
    })
    // Jetpacks on pedestals.
    this.pedestals = W.pedestals.map((p, i) => {
      const pack = createJetpack(p.id)
      pack.scale.setScalar(2.2)
      pack.position.set(p.pos[0], p.pos[1] + 3.4, p.pos[2])
      pack.rotation.y = -Math.PI / 2
      this.place(pack)
      return { id: p.id, pack, phase: i }
    })
    // Floating labels.
    this.labels = W.labels.map((l) => {
      const aspect = l.kind === 'pad' ? 2.2 : 1.7
      const label = new LabelSprite(l.kind === 'pad' ? 12 : 9, aspect)
      label.sprite.position.set(...l.pos)
      this.place(label.sprite)
      if (l.kind === 'pad') {
        const wins = { text: `+${formatNumber(l.amount)} Wins`, icon: 'trophy' }
        label.set(l.vip ? [{ text: 'VIP x2', color: '#ff7be5', size: 0.55 }, wins] : [wins])
      } else if (l.kind === 'treadmill') {
        label.set([{ text: l.type === 'vip' ? 'VIP' : 'VIP+', icon: 'crown', size: 0.8, color: l.type === 'vip' ? '#ffe36b' : '#ff9cf0' }, { text: l.type === 'vip' ? 'x2 STEPS!' : 'x4 STEPS!', color: '#7dfcff' }])
      }
      return { l, label }
    })
  }

  /* -------------------------------------------------------------------- */

  applyProfile(profile, now = Date.now()) {
    if (!profile) return
    this.profile = profile
    for (const pad of this.stepPads) {
      const boost = BOOST_BY_ID[pad.id]
      const owned = profile.boosts.includes(pad.id)
      const color = owned ? '#35d45a' : profile.trophies >= boost.price ? '#ffc21a' : '#e8353f' // trophies = Wins
      pad.mat.color.set(color)
    }
    for (const { l, label } of this.labels) {
      if (l.kind === 'boost') {
        const b = BOOST_BY_ID[l.boost]
        const owned = profile.boosts.includes(l.boost)
        label.set([
          owned ? { text: 'Owned', color: '#5cff7a', size: 0.8 } : { text: `${formatNumber(b.price)} Wins`, icon: 'trophy', color: '#ffe36b', size: 0.8 },
          { text: `+${formatNumber(b.amount)} steps`, icon: 'shoe' },
        ])
      } else if (l.kind === 'jetpack') {
        const jp = JETPACK_BY_ID[l.jetpack]
        const owned = profile.jetpacks.includes(jp.id)
        const top = profile.jetpack === jp.id
          ? { text: 'Equipped', color: '#4fe3ff', size: 0.8 }
          : owned
            ? { text: 'Owned', color: '#5cff7a', size: 0.8 }
            : { text: `${formatNumber(jp.sku ? PRODUCT_BY_SKU[jp.sku].price : jp.price)} Wins`, icon: 'trophy', color: '#ffe36b', size: 0.8 }
        label.set([top, { text: jp.name }, { text: `${jp.fuel}`, icon: 'fuel', size: 0.8 }])
      }
    }
    this.refreshPumpkins(now)
    for (const hook of this.profileHooks) hook(profile, now)
  }

  refreshPumpkins(now = Date.now()) {
    const times = this.profile?.pumpkinTimes || {}
    this.world.pumpkins.forEach((p, i) => {
      const t = times[p.id] || 0
      this.pumpkins.setHidden(i, now - t < EVENT.pumpkinRespawn * 1000)
    })
  }

  /** Hides a coin this player just took; false if it was already gone. */
  takeCoin(id) {
    return this.coins.take(id)
  }

  /** Every coin is back once the player is home (or has died). */
  resetCoins() {
    this.coins.reset()
  }

  hidePumpkin(id) {
    const i = this.world.pumpkins.findIndex((p) => p.id === id)
    if (i >= 0) this.pumpkins.setHidden(i, true)
  }

  applyBoards(boards) {
    for (const hook of this.boardHooks) hook(boards)
  }

  applyStock(stock) {
    for (const hook of this.stockHooks) hook(stock)
  }

  setRaceGateOpen(open) {
    if (this.gate) this.gate.visible = !open
  }

  /** dt seconds, t = shared world time (seconds), focus = player position. */
  update(dt, t, focus) {
    this.setRoom(runtime.zone ? this.zoneIndex.get(runtime.zone) ?? -1 : this.currentRoom < 0 ? 0 : -1)
    for (const { m, group, base, room } of this.movers) {
      if (!room.visible) continue
      const off = m.amp * Math.sin((Math.PI * 2 * t) / m.period + m.phase)
      group.position.set(base[0] + m.axis[0] * off, base[1] + m.axis[1] * off, base[2] + m.axis[2] * off)
    }
    for (const { b, group, room } of this.blinkers) {
      if (!room.visible) continue
      const phase = (((t / b.period + b.phase) % 1) + 1) % 1
      let opacity
      if (phase < b.on) {
        // Flash during the last 25% of the "on" window as a warning.
        const warn = phase > b.on * 0.75
        opacity = warn ? (Math.sin(t * 40) > 0 ? 1 : 0.35) : 1
      } else {
        opacity = 0.12
      }
      for (const mesh of group.children) {
        mesh.material.opacity = opacity
        mesh.material.depthWrite = opacity > 0.5
      }
    }
    for (const { l, mat, marker, room } of this.lasers) {
      if (!room.visible) continue
      const phase = (((t / l.period + l.phase) % 1) + 1) % 1
      const active = phase < l.on
      if (marker) {
        const warn = phase > 0.62
        mat.opacity = active ? 0.55 + Math.random() * 0.4 : 0
        marker.material.opacity = active ? 0.65 : warn ? (Math.sin(t * 24) > 0 ? 0.5 : 0.15) * ((phase - 0.62) / 0.38) + 0.1 : 0.04
        marker.material.color.set(active ? '#ffffff' : '#ff3048')
        continue
      }
      const warn = phase > 0.88
      mat.opacity = active ? 0.75 + Math.sin(t * 50) * 0.15 : warn ? (Math.sin(t * 30) > 0 ? 0.35 : 0.08) : 0.06
    }
    for (const [key, mat] of materialCache) {
      if (key === 'beltZ') mat.map.offset.y = (mat.map.offset.y + dt * 1.6) % 1
      else if (key === 'beltX+') mat.map.offset.x = (mat.map.offset.x - dt * 1.4) % 1
      else if (key === 'beltX-') mat.map.offset.x = (mat.map.offset.x + dt * 1.4) % 1
    }
    for (const [kind, mat] of this.hazardMats) {
      const speed = kind === 'water' ? 0.05 : 0.025
      mat.map.offset.x = (t * speed) % 1
      mat.map.offset.y = (t * speed * 0.6) % 1
    }
    for (const { g, ghost, room } of this.ghosts) {
      if (!room.visible) continue
      ghost.position.y = g.pos[1] + Math.sin(t * 1.3 + g.phase) * 1.5
      ghost.rotation.y = Math.sin(t * 0.4 + g.phase) * 0.8
    }
    for (const { pack, phase } of this.pedestals) {
      pack.rotation.y = -Math.PI / 2 + Math.sin(t * 0.8 + phase) * 0.6
    }
    const pulse = 0.75 + Math.sin(t * 4) * 0.25
    for (const { p, mat, room } of this.trophyPads) if (room.visible) mat.color.set(p.vip ? '#ff3fd2' : '#ffd23f').multiplyScalar(0.8 + pulse * 0.4)
    this.pumpkins.update(t, this.roomVisible)
    this.coins.update(t, this.roomVisible)
    if (this.treadmills.group.parent.visible) this.treadmills.update(dt)
    this.hunters.update(dt)
    this.crusherViews.update(t)
    for (const u of this.updaters) u(t, focus)
  }

  /** Called ~1/s: chest timers, pumpkin respawns. */
  slowUpdate(now) {
    this.refreshPumpkins(now)
    for (const hook of this.profileHooks) hook(this.profile, now)
  }
}
