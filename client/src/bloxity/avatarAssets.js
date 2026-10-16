/**
 * URL construction and slot metadata for Bloxity avatar assets.
 *
 * The shapes here are not guesses: they mirror the assembly logic inside
 * legion-sdk.min.js (the same code that renders the avatar preview in the Bloxity
 * portal), so an avatar built with this file matches what the player sees there.
 *
 * `avatar.getEquipped()` returns:
 *   { hatId, backId, skinId, headId, armLId, armRId, legLId, legRId, torsoId }
 */

export const AVATAR_CDN = 'https://static.bloxity.io/avatars'

/** The base humanoid body + skeleton. All other assets modify this. */
export const BASE_BODY_URL = `${AVATAR_CDN}/player.glb`

/** Bone that hats attach to, from player.glb's skeleton. */
export const HAT_BONE = 'Neck1'
/** Bone that back items attach to. */
export const BACK_BONE = 'Spine2'
/** Bone whose bind-pose Y drives the neckHeight proportion. */
export const NECK_OFFSET_BONE = 'Neck_Offset'

/** Skin id used when nothing is equipped — the base body has no baked-in texture. */
export const DEFAULT_SKIN_ID = '0'

/**
 * Body-part slots.
 *
 * Each maps an equipped id onto a named skinned mesh already present in player.glb.
 * A part is applied by swapping that mesh's *geometry*, not by attaching a new
 * object — that is what keeps it bound to the shared skeleton.
 */
export const PART_SLOTS = {
  head: { idKey: 'headId', mesh: 'default_head', dir: 'head', suffix: '' },
  arm_L: { idKey: 'armLId', mesh: 'default_arm_L', dir: 'arms', suffix: '_L' },
  arm_R: { idKey: 'armRId', mesh: 'default_arm_R', dir: 'arms', suffix: '_R' },
  leg_L: { idKey: 'legLId', mesh: 'default_leg_L', dir: 'legs', suffix: '_L' },
  leg_R: { idKey: 'legRId', mesh: 'default_leg_R', dir: 'legs', suffix: '_R' },
  torso: { idKey: 'torsoId', mesh: 'default_torso', dir: 'torso', suffix: '' },
}

/** Values that all mean "nothing equipped". Superset of the SDK's own check. */
const EMPTY_IDS = new Set(['-1', '', 'undefined', 'null'])

/**
 * @param {unknown} id
 * @returns {boolean} true when the id names a real asset worth fetching
 */
export function isRealId(id) {
  if (id === null || id === undefined) return false
  return !EMPTY_IDS.has(String(id).trim())
}

export const assetUrls = {
  part: (slot, id) => {
    const { dir, suffix } = PART_SLOTS[slot]
    return `${AVATAR_CDN}/parts/${dir}/${id}${suffix}.glb`
  },
  skinTexture: (id) => `${AVATAR_CDN}/skins/${id}.png`,
  hatMesh: (id) => `${AVATAR_CDN}/items/hats/${id}.obj`,
  hatTexture: (id) => `${AVATAR_CDN}/textures/hats/${id}.png`,
  backMesh: (id) => `${AVATAR_CDN}/items/back/${id}.obj`,
  backTexture: (id) => `${AVATAR_CDN}/textures/back/${id}.png`,
  itemMesh: (dir, id) => `${AVATAR_CDN}/items/${dir}/${id}.obj`,
  itemTexture: (dir, id) => `${AVATAR_CDN}/textures/${dir}/${id}.png`,
}

/** Skin ids fall back to "0" rather than being skipped. */
export const skinIdOrDefault = (id) => (isRealId(id) ? String(id) : DEFAULT_SKIN_ID)

/** Hats, hair and masks: all worn on the head bone, all from the hats folder. */
export const HEAD_ITEM_KEYS = ['hatId', 'hairId', 'maskId']

/**
 * Body accessories. Single items hang off `bone`; hands and shoes are worn as
 * a pair - the mesh on `bone` plus a mirrored copy on `mirrorBone`.
 * Origins are in player.glb model space (Boxity's own values).
 */
export const ACCESSORY_SLOTS = [
  { idKey: 'neckId', dir: 'neck', bone: 'Spine2', origin: [0, 4.8, 0] },
  { idKey: 'chestId', dir: 'chest', bone: 'Spine2', origin: [0, 3.6, 0] },
  { idKey: 'waistId', dir: 'waist', bone: 'Spine1', origin: [0, 2.4, 0] },
  { idKey: 'handId', dir: 'hand', bone: 'ArmL2_leaf', mirrorBone: 'ArmR2_leaf', origin: [0, 0, 0] },
  { idKey: 'shoesId', dir: 'shoes', bone: 'LegL2_leaf', mirrorBone: 'LegR2_leaf', origin: [0, 0, 0] },
]

/** Pants, shirt and face are painted into the skin texture by Boxity's API. */
const CLOTHING = [
  ['pantsId', 'pn'],
  ['shirtId', 'sh'],
  ['faceId', 'fc'],
]
const worn = (id) => isRealId(id) && String(id) !== '0'

/**
 * The body texture with the worn face, shirt and pants drawn on - the same
 * URL Legion.SDK.avatar.getSkinTextureUrl() gives for the local player.
 */
export function skinTextureUrl(equipped = {}, apiUrl = 'https://api.bloxity.io') {
  const segments = CLOTHING.filter(([key]) => worn(equipped[key])).map(([key, tag]) => `_${tag}${equipped[key]}`)
  if (!segments.length) return assetUrls.skinTexture(skinIdOrDefault(equipped.skinId))
  const skin = worn(equipped.skinId) ? equipped.skinId : '0'
  return `${apiUrl}/v1/avatar/skin-texture/s${skin}${segments.join('')}.png`
}
