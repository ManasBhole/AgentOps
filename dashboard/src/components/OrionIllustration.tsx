/**
 * OrionIllustration — animated space/constellation scene for auth pages.
 * Pure SVG + CSS, no external assets, CSP-safe.
 */
export default function OrionIllustration() {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: 'linear-gradient(160deg, #060b18 0%, #0a1128 50%, #0d1535 100%)' }}>
      <style>{`
        @keyframes twinkle {
          0%,100% { opacity: 0.2; r: 1; }
          50%      { opacity: 1;   r: 1.8; }
        }
        @keyframes twinkle-bright {
          0%,100% { opacity: 0.6; }
          50%      { opacity: 1; filter: drop-shadow(0 0 4px #a78bfa); }
        }
        @keyframes pulse-ring {
          0%   { r: 6; opacity: 0.6; }
          100% { r: 18; opacity: 0; }
        }
        @keyframes float-card-1 {
          0%,100% { transform: translateY(0px) translateX(0px); }
          33%     { transform: translateY(-8px) translateX(3px); }
          66%     { transform: translateY(4px) translateX(-2px); }
        }
        @keyframes float-card-2 {
          0%,100% { transform: translateY(0px) translateX(0px); }
          33%     { transform: translateY(6px) translateX(-4px); }
          66%     { transform: translateY(-10px) translateX(2px); }
        }
        @keyframes float-card-3 {
          0%,100% { transform: translateY(0px) translateX(0px); }
          33%     { transform: translateY(-6px) translateX(2px); }
          66%     { transform: translateY(8px) translateX(-3px); }
        }
        @keyframes orbit {
          from { transform: rotate(0deg) translateX(28px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(28px) rotate(-360deg); }
        }
        @keyframes orbit-reverse {
          from { transform: rotate(0deg) translateX(20px) rotate(0deg); }
          to   { transform: rotate(-360deg) translateX(20px) rotate(360deg); }
        }
        @keyframes dash-flow {
          to { stroke-dashoffset: -20; }
        }
        @keyframes glow-line {
          0%,100% { opacity: 0.15; }
          50%     { opacity: 0.45; }
        }
        .star-twinkle { animation: twinkle var(--dur, 3s) var(--delay, 0s) ease-in-out infinite; }
        .star-bright   { animation: twinkle-bright var(--dur, 2.5s) var(--delay, 0s) ease-in-out infinite; }
        .constellation-line { animation: glow-line 4s ease-in-out infinite; }
        .float-1 { animation: float-card-1 7s ease-in-out infinite; }
        .float-2 { animation: float-card-2 9s ease-in-out infinite; }
        .float-3 { animation: float-card-3 8s ease-in-out infinite; }
      `}</style>

      <svg viewBox="0 0 480 560" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">

        {/* ── Background stars ───────────────────────────── */}
        {[
          [22,18],[58,44],[90,12],[140,28],[185,8],[230,35],[275,15],[310,42],[355,20],[398,8],[440,30],[460,55],
          [12,80],[75,95],[115,70],[160,88],[200,65],[245,90],[295,72],[340,98],[385,68],[425,85],[455,100],
          [30,130],[85,145],[130,118],[175,140],[220,125],[265,148],[308,120],[350,142],[392,128],[435,155],
          [18,180],[60,195],[110,170],[155,188],[200,175],[248,192],[290,168],[335,185],[378,172],[422,195],[462,178],
          [40,240],[95,255],[138,228],[182,248],[226,235],[270,252],[315,238],[358,258],[400,242],[445,260],
          [25,300],[70,318],[118,295],[162,312],[206,298],[252,315],[298,302],[342,320],[386,308],[430,322],[468,295],
          [35,360],[82,375],[126,355],[170,372],[215,360],[258,378],[302,362],[346,380],[390,368],[434,382],
          [20,420],[68,435],[112,415],[158,432],[202,418],[248,436],[294,422],[338,438],[382,425],[426,440],[465,418],
          [42,480],[88,495],[132,475],[178,492],[222,478],[268,494],[312,480],[356,496],[400,482],[444,498],
          [28,530],[74,548],[118,528],[164,545],[208,532],[254,549],[298,535],[342,550],[386,538],[430,552],
        ].map(([x, y], i) => (
          <circle
            key={i} cx={x} cy={y}
            r={i % 7 === 0 ? 1.4 : i % 3 === 0 ? 1.1 : 0.8}
            fill={i % 5 === 0 ? '#c7d2fe' : i % 4 === 0 ? '#e0e7ff' : '#94a3b8'}
            className="star-twinkle"
            style={{ '--dur': `${2 + (i % 4) * 0.7}s`, '--delay': `${(i * 0.3) % 3}s` } as any}
          />
        ))}

        {/* ── Orion constellation ────────────────────────── */}
        {/* Stars: Betelgeuse, Bellatrix, Mintaka, Alnilam, Alnitak, Saiph, Rigel, + Meissa(head) */}
        {/* Constellation connection lines */}
        {[
          [168,168, 295,158],  // Betelgeuse — Bellatrix (shoulder line)
          [168,168, 194,248],  // Betelgeuse — Mintaka
          [295,158, 278,248],  // Bellatrix — Alnitak (right side down)
          [194,248, 236,258],  // Mintaka — Alnilam (belt)
          [236,258, 278,248],  // Alnilam — Alnitak (belt)
          [194,248, 210,335],  // Mintaka — Saiph
          [278,248, 262,335],  // Alnitak — Rigel (right leg)
          [230,132, 168,168],  // Meissa — Betelgeuse
          [230,132, 295,158],  // Meissa — Bellatrix
        ].map(([x1,y1,x2,y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.3"
            strokeDasharray="4 3"
            className="constellation-line"
            style={{ animationDelay: `${i * 0.4}s` }}
          />
        ))}

        {/* Pulsing rings on main stars */}
        {[[168,168],[295,158],[236,258]].map(([cx,cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="6" fill="none" stroke="#6366f1" strokeWidth="0.6">
            <animate attributeName="r" values="6;20;6" dur={`${3+i}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur={`${3+i}s`} repeatCount="indefinite" />
          </circle>
        ))}

        {/* Bright constellation stars */}
        {[
          [230,132, 3.5, '#e0e7ff'],  // Meissa (head)
          [168,168, 5,   '#fb923c'],  // Betelgeuse (red supergiant)
          [295,158, 4,   '#bfdbfe'],  // Bellatrix (blue-white)
          [194,248, 3.5, '#e0e7ff'],  // Mintaka (belt)
          [236,258, 4,   '#e0e7ff'],  // Alnilam (belt center)
          [278,248, 3.5, '#e0e7ff'],  // Alnitak (belt)
          [210,335, 3.8, '#bfdbfe'],  // Saiph
          [262,335, 5,   '#dbeafe'],  // Rigel (blue supergiant)
        ].map(([cx,cy,r,fill], i) => (
          <circle key={i} cx={cx as number} cy={cy as number} r={r as number}
            fill={fill as string}
            className="star-bright"
            style={{
              '--dur': `${2.5 + i * 0.3}s`,
              '--delay': `${i * 0.4}s`,
              filter: `drop-shadow(0 0 ${(r as number) * 2}px ${fill})`,
            } as any}
          />
        ))}

        {/* ── Orbiting agent dots around center ─────────── */}
        <g transform="translate(236, 258)">
          {/* Orbit ring (faint) */}
          <circle cx="0" cy="0" r="28" fill="none" stroke="#6366f1" strokeWidth="0.4" strokeOpacity="0.2" strokeDasharray="2 4" />
          <circle cx="0" cy="0" r="20" fill="none" stroke="#818cf8" strokeWidth="0.3" strokeOpacity="0.15" strokeDasharray="2 6" />
          {/* Orbiting dots */}
          <g style={{ animation: 'orbit 8s linear infinite', transformOrigin: '0 0' }}>
            <circle cx="0" cy="0" r="3" fill="#6366f1" style={{ filter: 'drop-shadow(0 0 3px #6366f1)' }} />
          </g>
          <g style={{ animation: 'orbit 12s linear infinite 3s', transformOrigin: '0 0' }}>
            <circle cx="0" cy="0" r="2.5" fill="#a78bfa" style={{ filter: 'drop-shadow(0 0 3px #a78bfa)' }} />
          </g>
          <g style={{ animation: 'orbit-reverse 10s linear infinite 1s', transformOrigin: '0 0' }}>
            <circle cx="0" cy="0" r="2" fill="#38bdf8" style={{ filter: 'drop-shadow(0 0 2px #38bdf8)' }} />
          </g>
        </g>

        {/* ── Floating metric cards ──────────────────────── */}

        {/* Card 1 — Agents online */}
        <g className="float-1" style={{ transformOrigin: '60px 140px' }}>
          <rect x="18" y="120" width="96" height="44" rx="10"
            fill="#0d1526" stroke="rgba(99,102,241,0.3)" strokeWidth="0.8"
            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }} />
          <rect x="18" y="120" width="96" height="2.5" rx="1.5" fill="#6366f1" />
          <circle cx="32" cy="134" r="4" fill="rgba(52,211,153,0.2)" />
          <circle cx="32" cy="134" r="2" fill="#34d399" />
          <text x="42" y="132" fontSize="7" fill="#94a3b8" fontFamily="Inter, sans-serif">Agents Online</text>
          <text x="42" y="143" fontSize="13" fontWeight="700" fill="#e2e8f0" fontFamily="Inter, sans-serif">24 / 24</text>
          <text x="18" y="158" fontSize="6" fill="#6366f1" fontFamily="Inter, sans-serif">  ↑ All systems nominal</text>
        </g>

        {/* Card 2 — Error rate */}
        <g className="float-2" style={{ transformOrigin: '390px 210px' }}>
          <rect x="350" y="190" width="102" height="44" rx="10"
            fill="#0d1526" stroke="rgba(251,191,36,0.25)" strokeWidth="0.8"
            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }} />
          <rect x="350" y="190" width="102" height="2.5" rx="1.5" fill="#fbbf24" />
          <text x="360" y="205" fontSize="7" fill="#94a3b8" fontFamily="Inter, sans-serif">Error Rate</text>
          <text x="360" y="219" fontSize="15" fontWeight="700" fill="#e2e8f0" fontFamily="Inter, sans-serif">0.12%</text>
          {/* Mini bar chart */}
          {[8,5,9,4,7,3,6,4,8,2].map((h, i) => (
            <rect key={i} x={360 + i*9} y={228-h} width="6" height={h} rx="1.5"
              fill={i === 9 ? '#fbbf24' : 'rgba(251,191,36,0.3)'} />
          ))}
        </g>

        {/* Card 3 — Avg latency */}
        <g className="float-3" style={{ transformOrigin: '380px 400px' }}>
          <rect x="345" y="378" width="108" height="44" rx="10"
            fill="#0d1526" stroke="rgba(56,189,248,0.25)" strokeWidth="0.8"
            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }} />
          <rect x="345" y="378" width="108" height="2.5" rx="1.5" fill="#38bdf8" />
          <text x="355" y="393" fontSize="7" fill="#94a3b8" fontFamily="Inter, sans-serif">Avg Latency</text>
          <text x="355" y="408" fontSize="15" fontWeight="700" fill="#e2e8f0" fontFamily="Inter, sans-serif">142ms</text>
          {/* Sparkline */}
          <polyline points="355,418 365,415 375,417 385,413 395,416 405,411 415,414 425,409 435,412 445,408"
            fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 2px #38bdf8)' }} />
        </g>

        {/* Card 4 — SLO */}
        <g className="float-1" style={{ transformOrigin: '55px 390px', animationDelay: '2s' }}>
          <rect x="14" y="370" width="94" height="44" rx="10"
            fill="#0d1526" stroke="rgba(52,211,153,0.25)" strokeWidth="0.8"
            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }} />
          <rect x="14" y="370" width="94" height="2.5" rx="1.5" fill="#34d399" />
          <text x="24" y="385" fontSize="7" fill="#94a3b8" fontFamily="Inter, sans-serif">SLO Compliance</text>
          <text x="24" y="400" fontSize="15" fontWeight="700" fill="#e2e8f0" fontFamily="Inter, sans-serif">99.8%</text>
          {/* Progress arc */}
          <circle cx="88" cy="395" r="10" fill="none" stroke="rgba(52,211,153,0.15)" strokeWidth="3" />
          <circle cx="88" cy="395" r="10" fill="none" stroke="#34d399" strokeWidth="3"
            strokeDasharray="59 63" strokeLinecap="round"
            transform="rotate(-90 88 395)"
            style={{ filter: 'drop-shadow(0 0 3px #34d399)' }} />
          <text x="88" y="408" fontSize="5" fill="#34d399" textAnchor="middle" fontFamily="Inter, sans-serif">30d</text>
        </g>

        {/* ── Nebula glow behind constellation ──────────── */}
        <ellipse cx="236" cy="248" rx="80" ry="90"
          fill="url(#nebula)" opacity="0.12" />
        <defs>
          <radialGradient id="nebula" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── Bottom gradient fade ───────────────────────── */}
        <defs>
          <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="100%" stopColor="#060b18" />
          </linearGradient>
        </defs>
        <rect x="0" y="440" width="480" height="120" fill="url(#bottomFade)" />
      </svg>
    </div>
  )
}
