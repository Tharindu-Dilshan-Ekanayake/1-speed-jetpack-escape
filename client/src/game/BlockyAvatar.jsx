import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'

import { createBlockyRig, poseBlocky } from './blockyRig.js'

/** Blocky stand-in avatar (see blockyRig.js). */
export function BlockyAvatar({ name, poseRef, onRig }) {
  const rig = useMemo(() => createBlockyRig(name), [name])
  useEffect(() => {
    onRig?.({ blocky: rig, backBone: rig.torso })
  }, [rig, onRig])
  useFrame(() => poseBlocky(rig, poseRef?.current))
  return <primitive object={rig.root} />
}

export default BlockyAvatar
