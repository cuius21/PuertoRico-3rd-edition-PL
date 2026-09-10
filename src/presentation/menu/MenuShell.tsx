import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import './menu.css';

function readMotion() {
  if (typeof matchMedia === 'undefined') return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return localStorage.getItem('puerto-menu-motion') !== 'off';
  } catch {
    return true;
  }
}
function Palm({
  x,
  y,
  scale = 1,
  delay = 0,
}: {
  x: number;
  y: number;
  scale?: number;
  delay?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="15" cy="6" rx="64" ry="16" fill="#184e3b" opacity=".18" />
      <g
        className="pr-menu-palm"
        style={{ '--wind-delay': delay + 's' } as CSSProperties}
      >
        <path d="M-12 0 Q28-100 1-206 L14-211 Q50-106 12 0Z" fill="#987042" />
        <path
          d="M-5-9 Q31-113 7-207"
          fill="none"
          stroke="#d5aa64"
          strokeWidth="6"
        />
        <path
          d="m5-36 15 3m-10-30 14 2m-10-29 14 1m-14-29 13-1m-16-27 11-3m-17-25 11-3"
          stroke="#604e32"
          strokeWidth="4"
          fill="none"
          opacity=".5"
        />
        <g className="pr-menu-crown">
          <path
            d="M8-205 Q-69-250-124-198 Q-78-211-38-190 Q-48-213 8-205"
            fill="#285f3e"
          />
          <path
            d="M8-205 Q-59-191-79-121 Q-27-153-15-184 Q-26-178 8-205"
            fill="#2b7844"
          />
          <path
            d="M8-205 Q70-228 114-170 Q71-175 40-192 Q46-181 8-205"
            fill="#23633f"
          />
          <path
            d="M8-205 Q75-187 83-114 Q40-139 24-181 Q24-168 8-205"
            fill="#36874a"
          />
          <path
            d="M8-205 Q-41-272-101-255 Q-79-226-39-221 Q-49-236 8-205"
            fill="#438d4e"
          />
          <path
            d="M8-205 Q10-277 76-277 Q71-240 42-224 Q43-239 8-205"
            fill="#78ab58"
          />
          <path d="M8-205 Q-12-252-3-281 Q35-258 24-224Z" fill="#92b85d" />
          <path
            d="M8-205 Q-54-227-111-203M8-205 Q-42-181-72-132M8-205 Q64-204 106-176M8-205 Q60-169 78-124M8-205 Q-43-252-90-250M8-205 Q33-256 67-267"
            fill="none"
            stroke="#b2ce75"
            strokeWidth="2.2"
            opacity=".55"
          />
          <circle cx="2" cy="-200" r="10" fill="#665237" />
          <circle cx="19" cy="-195" r="9" fill="#987341" />
          <circle cx="12" cy="-210" r="8" fill="#b0924c" />
        </g>
      </g>
    </g>
  );
}
function IslandScene() {
  const id = useId().replaceAll(':', '');
  return (
    <div className="pr-menu-scene" aria-hidden="true">
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <linearGradient id={id + '-sea'} x2="0" y2="1">
            <stop stopColor="#174f60" />
            <stop offset=".38" stopColor="#2b9698" />
            <stop offset="1" stopColor="#0e626d" />
          </linearGradient>
          <radialGradient id={id + '-light'}>
            <stop stopColor="#ffe5a3" stopOpacity=".42" />
            <stop offset="1" stopColor="#ffe5a3" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id + '-sand'} x2=".8" y2="1">
            <stop stopColor="#f5d995" />
            <stop offset="1" stopColor="#cca665" />
          </linearGradient>
          <pattern
            id={id + '-ripple'}
            width="180"
            height="90"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M12 38q22 7 44 0m75 25q15 5 30 0"
              fill="none"
              stroke="#bcf0df"
              strokeWidth="2"
              opacity=".24"
            />
          </pattern>
        </defs>
        <rect width="1600" height="1000" fill={`url(#${id}-sea)`} />
        <ellipse
          cx="1240"
          cy="80"
          rx="630"
          ry="480"
          fill={`url(#${id}-light)`}
        />
        <g className="pr-menu-water">
          <rect
            x="-80"
            y="-80"
            width="1760"
            height="1160"
            fill={`url(#${id}-ripple)`}
          />
        </g>
        <g className="pr-menu-clouds" fill="#e9f2ce" opacity=".09">
          <ellipse cx="280" cy="130" rx="170" ry="24" />
          <ellipse cx="1190" cy="220" rx="190" ry="30" />
          <ellipse cx="1530" cy="430" rx="120" ry="22" />
        </g>
        <g opacity=".72">
          <ellipse
            className="pr-menu-surf"
            cx="245"
            cy="257"
            rx="159"
            ry="32"
            fill="#8edde0"
            opacity=".22"
          />
          <path
            d="M95 258Q140 225 188 231Q249 183 299 226Q369 225 393 259Q244 294 95 258"
            fill={`url(#${id}-sand)`}
          />
          <path d="M121 252Q191 205 221 233Q274 205 358 253Z" fill="#4b945d" />
          <Palm x={221} y={246} scale={0.43} delay={-2} />
          <Palm x={286} y={253} scale={0.3} delay={-4} />
        </g>
        <g opacity=".58">
          <ellipse
            className="pr-menu-surf pr-menu-surf--late"
            cx="1420"
            cy="329"
            rx="165"
            ry="34"
            fill="#8edde0"
            opacity=".28"
          />
          <path
            d="M1260 329Q1340 268 1409 292Q1461 260 1565 330Q1418 362 1260 329"
            fill={`url(#${id}-sand)`}
          />
          <path
            d="M1290 321Q1371 280 1411 306Q1476 283 1531 324Z"
            fill="#3f7d50"
          />
          <Palm x={1390} y={319} scale={0.42} delay={-1} />
          <Palm x={1480} y={324} scale={0.28} delay={-3} />
        </g>
        <g className="pr-menu-sailing">
          <g transform="translate(1230 165) scale(.68)">
            <g className="pr-menu-boat">
              <ellipse
                className="pr-menu-surf"
                cy="26"
                rx="76"
                ry="11"
                fill="none"
                stroke="#b9ebe0"
                strokeWidth="2"
                opacity=".45"
              />
              <path d="M-65 6Q0 18 66 2L42 29Q-6 45-52 27Z" fill="#604832" />
              <path
                d="M-56 9Q1 22 60 6"
                fill="none"
                stroke="#d8ac68"
                strokeWidth="5"
              />
              <path d="M-2 6V-103" stroke="#594b37" strokeWidth="6" />
              <path d="M-9-93Q-25-61-49-16L-9-14Z" fill="#e7d69c" />
              <path d="M7-95Q47-65 46-16L7-13Z" fill="#fff0bc" />
              <path d="M-1-99 27-92 0-86Z" fill="#b66c48" />
            </g>
          </g>
        </g>
        <g
          className="pr-menu-birds"
          fill="none"
          stroke="#123f4a"
          strokeWidth="3"
          strokeLinecap="round"
          opacity=".55"
        >
          <path d="M655 156q10-9 21 0q10-9 21 0m32 31q8-7 16 0q8-7 16 0m-84 15q6-5 12 0q6-5 12 0" />
        </g>
        <path
          className="pr-menu-surf"
          d="M-90 580Q147 617 214 808Q268 899 472 1008L-90 1040Z"
          fill="#97e4c6"
          opacity=".28"
        />
        <path
          d="M-80 620Q103 644 178 818Q243 939 453 1010L-80 1010Z"
          fill={`url(#${id}-sand)`}
        />
        <path
          d="M-80 673Q88 665 135 844Q204 960 347 1010L-80 1010Z"
          fill="#427e4d"
        />
        <path
          className="pr-menu-surf pr-menu-surf--late"
          d="M1710 620Q1504 629 1426 844Q1364 947 1210 1010H1710Z"
          fill="#97e4c6"
          opacity=".22"
        />
        <path
          d="M1700 666Q1552 663 1472 852Q1410 964 1270 1010H1700Z"
          fill={`url(#${id}-sand)`}
        />
        <path
          d="M1700 719Q1552 704 1516 893Q1475 968 1370 1010H1700Z"
          fill="#3f7b4b"
        />
        <Palm x={90} y={897} scale={1.78} delay={-1} />
        <Palm x={-30} y={748} scale={1.2} delay={-3} />
        <Palm x={242} y={1001} scale={1.06} delay={-4.4} />
        <Palm x={1547} y={942} scale={1.85} delay={-3} />
        <Palm x={1665} y={775} scale={1.4} delay={-5} />
        <Palm x={1410} y={1026} scale={1.1} delay={-2} />
      </svg>
      <svg
        className="pr-menu-mobile-palm"
        viewBox="0 0 350 400"
        focusable="false"
      >
        <Palm x={160} y={360} scale={1.25} delay={-2} />
      </svg>
      <div className="pr-menu-vignette" />
    </div>
  );
}

/** Decoration and CSS animation only. Never reads or changes a game state. */
export function MenuShell({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className: string;
  as?: 'div' | 'main';
}) {
  const [motion, setMotion] = useState(readMotion);
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  );
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => {
      if (preference.matches) setMotion(false);
    };
    document.addEventListener('visibilitychange', visibility);
    preference.addEventListener('change', changed);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      preference.removeEventListener('change', changed);
    };
  }, []);
  return (
    <Tag
      className={className + ' pr-menu'}
      data-menu-paused={!motion || hidden}
    >
      <IslandScene />
      <button
        className="pr-menu-motion"
        type="button"
        aria-pressed={motion}
        aria-label="Animowane tło menu"
        onClick={() => {
          const next = !motion;
          setMotion(next);
          try {
            localStorage.setItem('puerto-menu-motion', next ? 'on' : 'off');
          } catch {}
        }}
      >
        <span aria-hidden="true">{motion ? '≈' : '☀'}</span>{' '}
        {motion ? 'Tło: animowane' : 'Tło: spokojne'}
      </button>
      {children}
    </Tag>
  );
}
