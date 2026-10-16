import { useEffect } from 'react'

import { audio } from '../game/audio.js'
import { useGame } from '../state/gameStore.js'
import { CloseIcon } from './Icons.jsx'

/** Modal window: blue header with icon + title, red X, scrollable body. */
export function PanelFrame({ title, icon, children, narrow, right }) {
  const close = useGame((s) => s.closePanel)
  useEffect(() => audio.play('open'), [])
  return (
    <div className="panel-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`panel ${narrow ? 'narrow' : ''}`}>
        <div className="panel-head">
          {icon}
          <h2 className="tx">{title}</h2>
          <div className="spacer" />
          {right}
          <button className="panel-close pressable" onClick={() => (audio.play('click'), close())} aria-label="Close">
            <CloseIcon size={38} />
          </button>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </div>
  )
}

export default PanelFrame
