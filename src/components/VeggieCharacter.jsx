/**
 * हाथ से बनाए गए एनिमेटेड सब्ज़ी कैरेक्टर (SVG) — जब सब्ज़ी की असली फोटो अपलोड न हो
 * तब यह दिखते हैं। सब कुछ मौलिक कोड है, कोई बाहरी इमेज/कॉपीराइट सामग्री नहीं।
 */

function Face({ eyeY = 46, eyeDx = 10, mouthY = 58, mouthWidth = 13, mouthCurve = 6, blush = true }) {
  return (
    <>
      <g className="animate-veggie-blink" style={{ transformOrigin: `50px ${eyeY}px` }}>
        <circle cx={50 - eyeDx} cy={eyeY} r="3.4" fill="#2A2318" />
        <circle cx={50 + eyeDx} cy={eyeY} r="3.4" fill="#2A2318" />
        <circle cx={50 - eyeDx + 1.1} cy={eyeY - 1.1} r="1.1" fill="#fff" />
        <circle cx={50 + eyeDx + 1.1} cy={eyeY - 1.1} r="1.1" fill="#fff" />
      </g>
      <path
        d={`M ${50 - mouthWidth / 2} ${mouthY} Q 50 ${mouthY + mouthCurve} ${50 + mouthWidth / 2} ${mouthY}`}
        stroke="#2A2318"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
      {blush && (
        <>
          <ellipse cx={50 - eyeDx - 6} cy={eyeY + 7} rx="4" ry="2.4" fill="#C1442E" opacity="0.25" />
          <ellipse cx={50 + eyeDx + 6} cy={eyeY + 7} rx="4" ry="2.4" fill="#C1442E" opacity="0.25" />
        </>
      )}
    </>
  )
}

const CHARACTERS = {
  aloo: () => (
    <g>
      <ellipse cx="50" cy="56" rx="34" ry="28" fill="#D9A15C" />
      <ellipse cx="38" cy="34" rx="4" ry="3" fill="#C98A42" opacity="0.6" />
      <ellipse cx="64" cy="70" rx="5" ry="3.5" fill="#C98A42" opacity="0.6" />
      <Face eyeY={52} mouthY={64} />
    </g>
  ),
  pyaz: () => (
    <g>
      <ellipse cx="50" cy="58" rx="30" ry="30" fill="#C97FA0" />
      <path d="M50 28 Q47 16 50 8 Q53 16 50 28 Z" fill="#4C8C5B" />
      <path d="M42 30 Q50 20 58 30" stroke="#B0567F" strokeWidth="2" fill="none" opacity="0.5" />
      <Face eyeY={54} mouthY={66} />
    </g>
  ),
  tamatar: () => (
    <g>
      <circle cx="50" cy="58" r="30" fill="#C1442E" />
      <path d="M50 26 L54 34 L44 34 Z M40 30 L46 36 L36 38 Z M60 30 L54 36 L64 38 Z" fill="#4C8C5B" />
      <ellipse cx="38" cy="46" rx="6" ry="4" fill="#fff" opacity="0.18" />
      <Face eyeY={54} mouthY={66} />
    </g>
  ),
  gajar: () => (
    <g>
      <path d="M50 20 Q30 22 20 8 M50 20 Q50 14 50 6 M50 20 Q70 22 80 8" stroke="#4C8C5B" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M50 22 C70 22 74 46 62 78 C58 88 42 88 38 78 C26 46 30 22 50 22 Z" fill="#E8A33D" />
      <Face eyeY={50} mouthY={62} eyeDx={9} />
    </g>
  ),
  phoolgobhi: () => (
    <g>
      <ellipse cx="50" cy="70" rx="24" ry="10" fill="#4C8C5B" />
      <circle cx="38" cy="42" r="12" fill="#F1EAD9" />
      <circle cx="62" cy="42" r="12" fill="#F1EAD9" />
      <circle cx="50" cy="32" r="14" fill="#F8F3E6" />
      <circle cx="50" cy="52" r="16" fill="#F8F3E6" />
      <Face eyeY={50} mouthY={60} blush={false} />
    </g>
  ),
  palak: () => (
    <g>
      <path d="M50 78 C30 70 20 40 34 20 C40 34 44 50 50 78 Z" fill="#4C8C5B" />
      <path d="M50 78 C70 70 80 40 66 20 C60 34 56 50 50 78 Z" fill="#5C9E6C" />
      <path d="M50 78 L50 40" stroke="#3A6B47" strokeWidth="2" opacity="0.5" />
      <Face eyeY={56} mouthY={66} eyeDx={8} blush={false} />
    </g>
  ),
  kheera: () => (
    <g>
      <rect x="18" y="38" width="64" height="36" rx="18" fill="#5C9E6C" />
      <rect x="26" y="44" width="4" height="24" rx="2" fill="#4C8C5B" opacity="0.5" />
      <rect x="70" y="44" width="4" height="24" rx="2" fill="#4C8C5B" opacity="0.5" />
      <Face eyeY={54} mouthY={64} eyeDx={11} />
    </g>
  ),
  mirch: () => (
    <g>
      <path d="M30 22 Q40 16 46 24 C60 30 66 54 54 72 C46 82 32 78 30 66 C24 50 22 34 30 22 Z" fill="#4C8C5B" />
      <path d="M30 22 Q26 14 32 8" stroke="#3A6B47" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Face eyeY={48} mouthY={58} eyeDx={7} blush={false} />
    </g>
  ),
  baingan: () => (
    <g>
      <path d="M50 26 C68 26 74 48 66 66 C60 80 40 80 34 66 C26 48 32 26 50 26 Z" fill="#6B4C7A" />
      <path d="M42 24 Q50 14 58 24" stroke="#4C8C5B" strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="20" rx="10" ry="4" fill="#4C8C5B" />
      <Face eyeY={52} mouthY={64} />
    </g>
  ),
  pattagobhi: () => (
    <g>
      <circle cx="50" cy="54" r="30" fill="#8FBF6E" />
      <circle cx="50" cy="54" r="21" fill="#7CB35C" />
      <circle cx="50" cy="54" r="12" fill="#6FA84F" />
      <Face eyeY={50} mouthY={60} blush={false} />
    </g>
  ),
  matar: () => (
    <g>
      <path d="M20 50 C20 30 40 24 50 30 C60 24 80 30 80 50 C80 68 60 78 50 68 C40 78 20 68 20 50 Z" fill="#4C8C5B" />
      <circle cx="38" cy="48" r="8" fill="#79B863" />
      <circle cx="50" cy="52" r="8" fill="#79B863" />
      <circle cx="62" cy="48" r="8" fill="#79B863" />
      <Face eyeY={50} mouthY={62} eyeDx={0} mouthWidth={0} blush={false} />
    </g>
  ),
  nimbu: () => (
    <g>
      <path d="M50 22 C68 22 76 40 76 54 C76 74 64 84 50 84 C36 84 24 74 24 54 C24 40 32 22 50 22 Z" fill="#E8C23D" />
      <ellipse cx="42" cy="40" rx="6" ry="4" fill="#fff" opacity="0.25" />
      <Face eyeY={54} mouthY={66} />
    </g>
  ),
  shimla: () => (
    <g>
      <path d="M50 24 C70 22 78 42 74 60 C70 80 52 82 46 80 C30 78 22 60 28 42 C32 28 42 24 50 24 Z" fill="#4C8C5B" />
      <path d="M46 22 Q50 12 56 22" stroke="#3A6B47" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Face eyeY={50} mouthY={62} />
    </g>
  ),
  bhindi: () => (
    <g>
      <path d="M40 20 C34 20 30 26 32 34 L46 82 C48 88 56 88 58 82 L64 40 C66 26 56 18 48 22 Z" fill="#4C8C5B" />
      <Face eyeY={46} mouthY={56} eyeDx={7} mouthWidth={9} blush={false} />
    </g>
  ),
  dhaniya: () => (
    <g>
      <path d="M50 80 L48 30 M50 80 L34 40 M50 80 L66 40 M50 80 L28 55 M50 80 L72 55" stroke="#4C8C5B" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="48" cy="30" r="6" fill="#5C9E6C" />
      <circle cx="34" cy="40" r="6" fill="#5C9E6C" />
      <circle cx="66" cy="40" r="6" fill="#5C9E6C" />
      <Face eyeY={68} mouthY={76} eyeDx={6} mouthWidth={8} blush={false} />
    </g>
  ),
  generic: (hueColor) => (
    <g>
      <ellipse cx="50" cy="58" rx="30" ry="27" fill={hueColor} />
      <path d="M44 26 Q50 16 56 26" stroke="#4C8C5B" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Face eyeY={54} mouthY={64} />
    </g>
  ),
}

const NAME_MAP = [
  [/आलू/, 'aloo'],
  [/प्याज/, 'pyaz'],
  [/टमाटर/, 'tamatar'],
  [/गाजर/, 'gajar'],
  [/फूलगोभी|फूल गोभी/, 'phoolgobhi'],
  [/पालक/, 'palak'],
  [/खीरा/, 'kheera'],
  [/मिर्च/, 'mirch'],
  [/बैंगन/, 'baingan'],
  [/पत्ता\s?गोभी/, 'pattagobhi'],
  [/मटर/, 'matar'],
  [/नींबू/, 'nimbu'],
  [/शिमला/, 'shimla'],
  [/भिंडी/, 'bhindi'],
  [/धनिया/, 'dhaniya'],
]

const FALLBACK_COLORS = ['#7CB35C', '#E8A33D', '#C1442E', '#5C9E6C', '#D9A15C']

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  return hash
}

export default function VeggieCharacter({ name = '', className = '' }) {
  const match = NAME_MAP.find(([re]) => re.test(name))
  const id = match ? match[1] : null

  return (
    <svg
      viewBox="0 0 100 100"
      className={`animate-veggie-bob ${className}`}
      style={{ transformOrigin: '50% 85%' }}
      aria-hidden="true"
    >
      {id ? CHARACTERS[id]() : CHARACTERS.generic(FALLBACK_COLORS[hashString(name) % FALLBACK_COLORS.length])}
    </svg>
  )
}
