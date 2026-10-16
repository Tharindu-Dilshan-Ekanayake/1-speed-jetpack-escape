/** Hand-drawn SVG icons in the chunky simulator style. All take className/size. */

const svg = (size, children, viewBox = '0 0 100 100', className = '') => (
  <svg className={`icon ${className}`} width={size} height={size} viewBox={viewBox} aria-hidden="true">
    {children}
  </svg>
)
const STROKE = '#16122b'

export const TrophyIcon = ({ size = 40, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="6" strokeLinejoin="round">
      <path d="M22 26 Q6 26 9 40 Q12 54 30 55" fill="none" stroke="#ffbf1f" strokeWidth="8" />
      <path d="M78 26 Q94 26 91 40 Q88 54 70 55" fill="none" stroke="#ffbf1f" strokeWidth="8" />
      <path d="M22 14 H78 V36 Q78 62 50 66 Q22 62 22 36 Z" fill="#ffcd2e" />
      <path d="M32 20 V38 Q33 52 42 57" fill="none" stroke="#fff3b8" strokeWidth="6" />
      <rect x="42" y="66" width="16" height="12" fill="#e9a614" />
      <rect x="28" y="78" width="44" height="12" rx="3" fill="#ffcd2e" />
    </g>,
    '0 0 100 100',
    className,
  )

/** In-game soft currency. */
export const CoinIcon = ({ size = 32, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="6">
      <ellipse cx="50" cy="54" rx="40" ry="38" fill="#e09a12" />
      <ellipse cx="50" cy="48" rx="40" ry="38" fill="#ffd23f" />
      <ellipse cx="50" cy="48" rx="27" ry="25" fill="#ffe680" strokeWidth="4" />
      <path d="M44 34 H56 V62 H44 Z" fill="#e8a412" stroke="none" />
      <path d="M26 30 Q34 18 48 16" fill="none" stroke="#fff6c8" strokeWidth="5" strokeLinecap="round" />
    </g>,
    '0 0 100 100',
    className,
  )

/** Speaker, with sound waves or a red cross when muted. */
export const SoundIcon = ({ size = 34, muted = false, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 38 H30 L54 18 V82 L30 62 H12 Z" fill="#ffffff" />
      {muted ? (
        <path d="M66 36 L90 64 M90 36 L66 64" fill="none" stroke="#ff3b4f" strokeWidth="9" />
      ) : (
        <>
          <path d="M66 36 Q76 50 66 64" fill="none" stroke="#ffffff" strokeWidth="7" />
          <path d="M76 24 Q94 50 76 76" fill="none" stroke="#ffffff" strokeWidth="7" />
        </>
      )}
    </g>,
    '0 0 100 100',
    className,
  )

/** Checklist for the daily quests. */
export const QuestIcon = ({ size = 34, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <rect x="16" y="10" width="68" height="82" rx="8" fill="#fff3c4" />
      <rect x="34" y="4" width="32" height="14" rx="4" fill="#ffcd2e" />
      <path d="M28 40 L36 48 L50 32" fill="none" stroke="#22c24c" strokeWidth="7" />
      <path d="M56 42 H72 M28 68 H72" fill="none" strokeWidth="6" />
    </g>,
    '0 0 100 100',
    className,
  )

export const ShoeIcon = ({ size = 40, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="6" strokeLinejoin="round">
      <path d="M8 62 L20 22 L44 28 Q52 46 72 50 Q94 54 94 68 L8 68 Z" fill="#2f8cff" />
      <path d="M6 68 H96 V80 H6 Z" fill="#ffffff" />
      <path d="M30 36 L44 32 M34 46 L48 42" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
      <path d="M58 52 Q72 58 90 60" fill="none" stroke="#9fd0ff" strokeWidth="4" />
    </g>,
    '0 0 100 100',
    className,
  )

export const FuelIcon = ({ size = 40, className }) =>
  svg(
    size,
    <g transform="rotate(-22 50 50)" stroke={STROKE} strokeWidth="6" strokeLinejoin="round">
      <rect x="26" y="8" width="48" height="84" rx="22" fill="#ffc91f" />
      <rect x="35" y="22" width="30" height="56" rx="12" fill="#2fa8ff" stroke="none" />
      <path d="M54 28 L40 52 H50 L46 72 L62 46 H52 Z" fill="#ffffff" stroke="none" />
    </g>,
    '0 0 100 100',
    className,
  )

/** Rebirth: a pink and a light-blue arrow chasing each other round a circle. */
const PINK_ARC = 'M22.8 37.3 A30 30 0 0 1 77.2 37.3'
const BLUE_ARC = 'M77.2 62.7 A30 30 0 0 1 22.8 62.7'
const PINK_HEAD = 'M89 31.8 L83.5 50.9 L65.4 42.8 Z'
const BLUE_HEAD = 'M11 68.2 L16.5 49.1 L34.6 57.2 Z'
export const RebirthIcon = ({ size = 56, className }) =>
  svg(
    size,
    <g strokeLinejoin="round">
      {/* dark outline under both arrows */}
      <path d={PINK_ARC} fill="none" stroke={STROKE} strokeWidth="25" />
      <path d={BLUE_ARC} fill="none" stroke={STROKE} strokeWidth="25" />
      <path d={PINK_HEAD} fill={STROKE} stroke={STROKE} strokeWidth="10" />
      <path d={BLUE_HEAD} fill={STROKE} stroke={STROKE} strokeWidth="10" />
      {/* colour */}
      <path d={BLUE_ARC} fill="none" stroke="#8fdcff" strokeWidth="15" />
      <path d={BLUE_HEAD} fill="#8fdcff" stroke="#8fdcff" strokeWidth="2" />
      <path d={PINK_ARC} fill="none" stroke="#ff5fa2" strokeWidth="15" />
      <path d={PINK_HEAD} fill="#ff5fa2" stroke="#ff5fa2" strokeWidth="2" />
      {/* shine */}
      <path d="M28 35 A24 24 0 0 1 50 25" fill="none" stroke="#ffd0e6" strokeWidth="4" strokeLinecap="round" />
      <path d="M72 65 A24 24 0 0 1 50 75" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
    </g>,
    '0 0 100 100',
    className,
  )

export const WingsIcon = ({ size = 56, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="5" strokeLinejoin="round">
      <path d="M50 70 Q20 76 10 52 Q30 56 34 44 Q14 42 12 22 Q36 30 44 20 Q52 36 50 70 Z" fill="#ffffff" />
      <path d="M50 70 Q80 76 90 52 Q70 56 66 44 Q86 42 88 22 Q64 30 56 20 Q48 36 50 70 Z" fill="#ffffff" />
      <path d="M50 70 Q62 50 86 46" fill="none" stroke="#ff5ccf" strokeWidth="6" />
      <path d="M50 70 Q66 40 84 28" fill="none" stroke="#5cc9ff" strokeWidth="6" />
      <path d="M50 70 Q38 50 14 46" fill="none" stroke="#ffd23f" strokeWidth="6" />
    </g>,
    '0 0 100 100',
    className,
  )

export const GlobeIcon = ({ size = 56, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="5">
      <circle cx="50" cy="50" r="40" fill="#3aa4ff" />
      <path d="M26 30 Q36 22 46 28 Q50 38 40 42 Q30 46 32 58 Q22 52 20 42 Z" fill="#49d66a" strokeWidth="4" />
      <path d="M58 54 Q70 48 80 56 Q78 72 64 80 Q58 70 62 62 Z" fill="#49d66a" strokeWidth="4" />
      <path d="M60 22 Q70 22 76 30 Q68 34 60 30 Z" fill="#49d66a" strokeWidth="4" />
      <ellipse cx="38" cy="66" rx="10" ry="5" fill="#ffffff" stroke="none" opacity="0.9" />
      <ellipse cx="68" cy="36" rx="9" ry="4" fill="#ffffff" stroke="none" opacity="0.9" />
    </g>,
    '0 0 100 100',
    className,
  )

export const TrailIcon = ({ size = 56, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="5" strokeLinejoin="round">
      <path d="M8 74 L40 40 L36 58 L64 30" fill="none" stroke="#c45cff" strokeWidth="10" strokeLinecap="round" />
      <path d="M52 30 Q52 12 70 12 Q88 12 88 32 V62 L82 56 L76 62 L70 56 L64 62 L58 56 L52 62 Z" fill="#ffffff" />
      <circle cx="64" cy="30" r="4" fill={STROKE} stroke="none" />
      <circle cx="76" cy="30" r="4" fill={STROKE} stroke="none" />
      <path d="M18 18 L22 26 L30 28 L22 31 L19 39 L16 31 L8 28 L16 26 Z" fill="#ffe14d" strokeWidth="3" />
    </g>,
    '0 0 100 100',
    className,
  )

export const GearIcon = ({ size = 40, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="5">
      <path
        d="M44 8 H56 L58 20 L68 24 L78 16 L86 24 L78 34 L82 44 L94 46 V56 L82 58 L78 68 L86 78 L78 86 L68 78 L58 82 L56 94 H44 L42 82 L32 78 L22 86 L14 78 L22 68 L18 58 L6 56 V44 L18 42 L22 32 L14 22 L22 14 L32 22 L42 18 Z"
        fill="#e7eefc"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="50" r="13" fill="#5aa9ff" />
    </g>,
    '0 0 100 100',
    className,
  )

export const ChevronRankIcon = ({ size = 34, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="6" strokeLinejoin="round">
      <path d="M50 8 L86 30 V50 L50 30 L14 50 V30 Z" fill="#ffd23f" />
      <path d="M50 40 L86 62 V82 L50 62 L14 82 V62 Z" fill="#ffbf1f" />
    </g>,
    '0 0 100 100',
    className,
  )

export const PencilIcon = ({ size = 56, className }) =>
  svg(
    size,
    <g transform="rotate(45 50 50)" stroke={STROKE} strokeWidth="5" strokeLinejoin="round">
      <rect x="38" y="4" width="24" height="16" rx="4" fill="#ff7aa8" />
      <rect x="38" y="20" width="24" height="52" fill="#ffc21a" />
      <path d="M38 72 H62 L50 96 Z" fill="#f7d9b0" />
      <path d="M46 88 L50 96 L54 88 Z" fill={STROKE} />
    </g>,
    '0 0 100 100',
    className,
  )

export const LockIcon = ({ size = 28, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="6">
      <path d="M30 44 V32 Q30 12 50 12 Q70 12 70 32 V44" fill="none" stroke="#dfe6ff" strokeWidth="10" />
      <rect x="20" y="42" width="60" height="46" rx="10" fill="#ffc21a" />
      <circle cx="50" cy="62" r="7" fill={STROKE} stroke="none" />
    </g>,
    '0 0 100 100',
    className,
  )

export const StarIcon = ({ size = 28, className, color = '#ffd23f' }) =>
  svg(
    size,
    <path d="M50 6 L62 36 L94 38 L69 58 L77 90 L50 72 L23 90 L31 58 L6 38 L38 36 Z" fill={color} stroke={STROKE} strokeWidth="6" strokeLinejoin="round" />,
    '0 0 100 100',
    className,
  )

export const GiftIcon = ({ size = 40, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="5" strokeLinejoin="round">
      <rect x="12" y="40" width="76" height="50" rx="6" fill="#ff4f7a" />
      <rect x="8" y="28" width="84" height="16" rx="4" fill="#ff6f95" />
      <rect x="44" y="28" width="12" height="62" fill="#ffd23f" />
      <path d="M50 28 Q30 4 22 18 Q18 28 50 28 Q82 28 78 18 Q70 4 50 28 Z" fill="#ffd23f" />
    </g>,
    '0 0 100 100',
    className,
  )

export const PumpkinIcon = ({ size = 40, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="5" strokeLinejoin="round">
      <path d="M50 22 Q50 10 60 8" fill="none" stroke="#3a9a2a" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="50" cy="58" rx="42" ry="34" fill="#ff8a1a" />
      <path d="M50 24 Q36 58 50 92 M50 24 Q64 58 50 92" fill="none" stroke="#d96a0a" strokeWidth="4" />
      <path d="M28 50 L38 40 L44 52 Z M72 50 L62 40 L56 52 Z" fill="#ffe14d" strokeWidth="3" />
      <path d="M28 66 H72 L66 78 L58 72 L50 80 L42 72 L34 78 Z" fill="#ffe14d" strokeWidth="3" />
    </g>,
    '0 0 100 100',
    className,
  )

export const CrownIcon = ({ size = 22, className }) =>
  svg(size, <path d="M10 78 L6 26 L32 48 L50 16 L68 48 L94 26 L90 78 Z" fill="#ffd23f" stroke={STROKE} strokeWidth="7" strokeLinejoin="round" />, '0 0 100 100', className)

export const CloseIcon = ({ size = 34, className }) =>
  svg(
    size,
    <g stroke="#ffffff" strokeWidth="16" strokeLinecap="round">
      <path d="M24 24 L76 76 M76 24 L24 76" />
    </g>,
    '0 0 100 100',
    className,
  )

export const ClockIcon = ({ size = 28, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="6">
      <circle cx="50" cy="50" r="40" fill="#ffffff" />
      <path d="M50 50 V26 M50 50 L66 60" stroke="#1f7ae0" strokeWidth="9" strokeLinecap="round" />
    </g>,
    '0 0 100 100',
    className,
  )

export const BagIcon = ({ size = 40, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="5" strokeLinejoin="round">
      <path d="M34 34 V26 Q34 10 50 10 Q66 10 66 26 V34" fill="none" strokeWidth="7" />
      <path d="M16 32 H84 L78 90 H22 Z" fill="#3fd1ff" />
      <path d="M40 56 L50 66 L64 48" fill="none" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
    </g>,
    '0 0 100 100',
    className,
  )

export const FlagIcon = ({ size = 40, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="5" strokeLinejoin="round">
      <path d="M22 92 V8" strokeWidth="8" strokeLinecap="round" />
      <path d="M24 12 H84 L72 32 L84 52 H24 Z" fill="#ffffff" />
      <path d="M24 12 H44 V32 H24 Z M44 32 H64 V52 H44 Z M64 12 H84 L78 22 H64 Z" fill={STROKE} stroke="none" />
    </g>,
    '0 0 100 100',
    className,
  )

export const HeartIcon = ({ size = 28, className }) =>
  svg(
    size,
    <path d="M50 86 C20 64 8 48 8 32 Q8 14 27 12 Q42 11 50 26 Q58 11 73 12 Q92 14 92 32 C92 48 80 64 50 86 Z" fill="#ff5c8a" stroke={STROKE} strokeWidth="6" strokeLinejoin="round" />,
    '0 0 100 100',
    className,
  )

export const UsersIcon = ({ size = 28, className }) =>
  svg(
    size,
    <g stroke={STROKE} strokeWidth="5">
      <circle cx="36" cy="34" r="16" fill="#ffffff" />
      <path d="M8 86 Q10 56 36 56 Q62 56 64 86 Z" fill="#ffffff" />
      <circle cx="70" cy="38" r="12" fill="#bcd4ff" />
      <path d="M58 60 Q66 54 74 56 Q92 60 92 84 H70" fill="#bcd4ff" />
    </g>,
    '0 0 100 100',
    className,
  )
