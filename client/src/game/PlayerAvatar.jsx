import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Box3, MeshStandardMaterial, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import { DEFAULT_PROPORTIONS } from '../bloxity/store'
import {
  ACCESSORY_SLOTS,
  assetUrls,
  BASE_BODY_URL,
  HEAD_ITEM_KEYS,
  isRealId,
  PART_SLOTS,
  skinIdOrDefault,
  skinTextureUrl,
} from '../bloxity/avatarAssets'
import { loadOBJ, loadPartGLB, loadTexture } from '../bloxity/avatarLoader'
import { API_URL } from '../bloxity/boxity'
import {
  applyEmote,
  applyPart,
  applyProportions,
  applySkin,
  attachAccessory,
  attachBodyAccessory,
  collectRig,
  dropPairedAccessories,
  poseRig,
  updatePairedAccessories,
} from './avatarRig'
import { advanceEmote } from './pose'

/**
 * A Bloxity avatar, assembled at runtime from the base `player.glb` plus the
 * equipped parts/skin/accessories. Used for the local player (equipped ids
 * from the SDK) and for remote players (ids relayed through the server).
 *
 * Assembly per equipped slot:
 *   - body parts  -> swap the matching mesh's geometry
 *   - hat / back  -> attach an OBJ to the Neck1 / Spine2 bone
 *   - skin        -> set one texture as the map on every skinned mesh
 * Any slot that is unequipped or 404s leaves the base body's own part in place.
 *
 * @param {{
 *   equipped?: object, proportions?: object,
 *   poseRef?: React.MutableRefObject<object>,
 *   targetHeight?: number,
 *   onRig?: (rig: object) => void,
 *   onReady?: () => void,
 * }} props
 *   `targetHeight` is the world height to fit the avatar into: Bloxity authors
 *   the rig ~6.4 units tall with feet at y=0, so it is measured and rescaled.
 */
export const PlayerAvatar = forwardRef(function PlayerAvatar(
  { equipped, proportions, poseRef, targetHeight = 5, onRig, onReady, ...props },
  ref,
) {
  const { scene: baseScene } = useGLTF(BASE_BODY_URL)
  const [assembled, setAssembled] = useState(false)
  /** The fit-scale wrapper: parent of the character and of paired accessories. */
  const fitRef = useRef(null)

  // The GLTF cache hands back one shared scene. Clone via SkeletonUtils so this
  // instance gets an independent, still-working skeleton.
  const character = useMemo(() => cloneSkeleton(baseScene), [baseScene])

  const rig = useMemo(() => {
    const collected = collectRig(character)
    // Own material per mesh so one avatar's skin can't leak into another.
    for (const mesh of collected.skinnedMeshes) {
      mesh.material = new MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 1 })
    }
    if (!collected.skeleton) console.warn('[bloxity] player.glb has no skeleton - avatar will not deform')
    return collected
  }, [character])

  // Measured once, from the bind pose, before proportions touch the root scale.
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(character)
    const size = box.getSize(new Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) return { scale: 1, footOffset: 0 }
    const scale = targetHeight / size.y
    return { scale, footOffset: -box.min.y * scale }
  }, [character, targetHeight])

  useEffect(() => {
    onRig?.(rig)
  }, [rig, onRig])

  // --- Assemble equipped cosmetics --------------------------------------------
  const equippedKey = JSON.stringify(equipped || {})
  useEffect(() => {
    let cancelled = false
    const attached = []
    const ids = JSON.parse(equippedKey)
    const jobs = []

    // Skin with the worn shirt, pants and face painted on; plain skin if that fails.
    const baseSkin = assetUrls.skinTexture(skinIdOrDefault(ids.skinId))
    const dressedSkin = skinTextureUrl(ids, API_URL)
    jobs.push(
      loadTexture(dressedSkin)
        .then((texture) => texture || (dressedSkin !== baseSkin ? loadTexture(baseSkin) : null))
        .then((texture) => ({ kind: 'skin', texture })),
    )

    for (const [slot, cfg] of Object.entries(PART_SLOTS)) {
      const id = ids[cfg.idKey]
      if (!isRealId(id)) {
        jobs.push(Promise.resolve({ kind: 'part', slot, scene: null }))
        continue
      }
      jobs.push(loadPartGLB(assetUrls.part(slot, id)).then((scene) => ({ kind: 'part', slot, scene })))
    }

    // Hat, hair and mask all sit on the head bone; back items on the spine.
    const headAndBack = [
      ...HEAD_ITEM_KEYS.map((key) => ['hat', key, assetUrls.hatMesh, assetUrls.hatTexture]),
      ['back', 'backId', assetUrls.backMesh, assetUrls.backTexture],
    ]
    for (const [kind, idKey, meshUrl, texUrl] of headAndBack) {
      const id = ids[idKey]
      if (!isRealId(id)) continue
      jobs.push(
        Promise.all([loadOBJ(meshUrl(id)), loadTexture(texUrl(id))]).then(([object, texture]) => ({ kind: 'accessory', accessory: kind, object, texture })),
      )
    }
    // Neck, chest, waist, hands and shoes.
    for (const slot of ACCESSORY_SLOTS) {
      const id = ids[slot.idKey]
      if (!isRealId(id)) continue
      jobs.push(
        Promise.all([loadOBJ(assetUrls.itemMesh(slot.dir, id)), loadTexture(assetUrls.itemTexture(slot.dir, id))]).then(([object, texture]) => ({
          kind: 'body',
          slot,
          object,
          texture,
        })),
      )
    }

    Promise.all(jobs)
      .then((results) => {
        if (cancelled) return
        for (const result of results) {
          // One bad slot must not take the rest of the character down.
          try {
            if (result.kind === 'skin') applySkin(rig, result.texture)
            else if (result.kind === 'part') applyPart(rig, result.slot, result.scene)
            else if ((result.kind === 'accessory' || result.kind === 'body') && result.object) {
              if (result.texture) {
                result.object.traverse((child) => {
                  if (child.isMesh) child.material = new MeshStandardMaterial({ map: result.texture })
                })
              }
              if (result.kind === 'body') {
                attached.push(...attachBodyAccessory(rig, result.slot, result.object, fitRef.current))
              } else {
                const added = attachAccessory(rig, result.accessory, result.object)
                if (added) attached.push(added)
              }
            }
          } catch (err) {
            console.warn(`[bloxity] failed to apply ${result.kind}`, err)
          }
        }
        setAssembled(true)
      })
      .catch((err) => {
        console.warn('[bloxity] avatar assembly failed; showing base body', err)
        if (!cancelled) setAssembled(true)
      })

    return () => {
      cancelled = true
      dropPairedAccessories(rig, attached)
      for (const object of attached) {
        object.parent?.remove(object)
        object.traverse((child) => child.geometry?.dispose())
      }
    }
  }, [rig, equippedKey])

  const proportionsRef = useRef(proportions)
  proportionsRef.current = proportions

  useFrame((_state, delta) => {
    try {
      // Proportions reset every bone to its rest pose; the pose rotates on top,
      // then a Boxity emote (if one is playing) blends over that.
      applyProportions(rig, { ...DEFAULT_PROPORTIONS, ...(proportionsRef.current || {}) })
      const pose = poseRef?.current
      poseRig(rig, pose, 1 / fit.scale)
      const emote = pose ? advanceEmote(pose, delta) : null
      if (emote) applyEmote(rig, emote.clip, emote.t, emote.w)
      updatePairedAccessories(rig, fitRef.current)
    } catch {
      // A malformed payload must not kill the render loop.
    }
  })

  useEffect(() => {
    if (assembled) onReady?.()
  }, [assembled, onReady])

  return (
    <group ref={ref} {...props}>
      {/* Fit scale lives on this wrapper - applyProportions overwrites the character's own scale. */}
      <group ref={fitRef} scale={fit.scale} position={[0, fit.footOffset, 0]}>
        <primitive object={character} />
      </group>
    </group>
  )
})

useGLTF.preload(BASE_BODY_URL)

export default PlayerAvatar
