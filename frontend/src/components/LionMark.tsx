// ─────────────────────────────────────────────────────────────────────────────
// LionMark — Day 16 Session XLVII (rev 2)
//
// Mark's tuning notes after the v1 SVG ship:
//   1. Lion head 1/3 larger — face was too small, facial features and the
//      HAL-eye anatomy weren't readable at the orb's render size.
//   2. Eye pulse wasn't visible enough — bump amplitude + speed.
//   3. Add a reddish/amber glow emanating from the face into the area.
//
// Also from the prior spec (still in effect):
//   • Color: gold (was pink). Pink overlapped with the eye-glow vocabulary.
//   • Eyes glow. Lion silhouette stays static.
//   • No outer pink halo on the orb — face glow + eye glow carry presence.
//
// HAL-eye render path is still preserved behind USE_LION_ORB in Layout.tsx.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';

interface LionMarkProps {
  /** Pulse the eye glow harder when the chat panel is open. */
  active?: boolean;
  className?: string;
}

const GOLD = '#fbbf24'; // Tailwind amber-400 — warm regal gold
const GOLD_DIM = '#d97706'; // amber-600 — for inner shading lines

export const LionMark: React.FC<LionMarkProps> = ({ active = false, className }) => {
  // ── Mane geometry ────────────────────────────────────────────────────────
  // 14 leaf-shaped petals radiating from an inner ring around the face.
  // Center shifted slightly down (cy=55) and inner radius pulled out (27)
  // to make room for the larger head.
  const PETALS = 14;
  const cx = 50, cy = 55;
  const rInner = 27;
  const rOuter = 47;
  const manePath = Array.from({ length: PETALS }, (_, i) => {
    const a = (i * (360 / PETALS) - 90) * (Math.PI / 180);
    const half = (Math.PI / PETALS) * 0.85;
    const x1 = cx + rInner * Math.cos(a - half);
    const y1 = cy + rInner * Math.sin(a - half);
    const tipX = cx + rOuter * Math.cos(a);
    const tipY = cy + rOuter * Math.sin(a);
    const x2 = cx + rInner * Math.cos(a + half);
    const y2 = cy + rInner * Math.sin(a + half);
    const ctrlR = (rInner + rOuter) * 0.55;
    const cax = cx + ctrlR * Math.cos(a - half * 0.4);
    const cay = cy + ctrlR * Math.sin(a - half * 0.4);
    const cbx = cx + ctrlR * Math.cos(a + half * 0.4);
    const cby = cy + ctrlR * Math.sin(a + half * 0.4);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${cax.toFixed(2)} ${cay.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)} Q ${cbx.toFixed(2)} ${cby.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }).join(' ');

  // ── Eye geometry ─────────────────────────────────────────────────────────
  // Spread further apart and scaled up so the HAL-eye anatomy reads.
  // Was: (43,53)/(57,53), core r=2.2, halo r=4.2
  // Now: (40,52)/(60,52), core r=3.0, halo r=6.5 — and pulsing harder.
  const eyeY = 52;
  const eyeLX = 40;
  const eyeRX = 60;

  // ── Pulse timing ─────────────────────────────────────────────────────────
  // Mark's call after rev2: amplitude is good, but the cycle was too fast.
  // Slowed to 4.5s idle / 3s active — calmer breathing, still visible.
  const pulseDur = active ? '3s' : '4.5s';

  // Halo opacity: idle 0.30→0.95, active 0.55→1.00
  const haloOpacity = active ? '0.55;1.0;0.55' : '0.30;0.95;0.30';
  // Halo radius pulse: bigger amplitude so the throb reads
  const haloR = active ? '6.5;9.0;6.5' : '6.0;8.0;6.0';
  // Core radius pulse — small but synced
  const coreR = active ? '3.0;3.6;3.0' : '2.9;3.3;2.9';

  // Face-glow opacity pulse — emanates from behind the lion's face
  const faceGlowOp = active ? '0.75;1.0;0.75' : '0.55;0.95;0.55';

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Ari — Lion sigil"
      // Allow the face glow to spill outside the 100×100 box
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Face-glow gradient — amber core fading through red to nothing.
            Sits BEHIND everything else and pulses in sync with the eyes
            so the whole orb feels alive. This is what carries the
            "reddish/amber glow emanating from the face into the area"
            per Mark's spec. */}
        <radialGradient id="lionFaceGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#fbbf24" stopOpacity="0.55" />
          <stop offset="20%"  stopColor="#ea580c" stopOpacity="0.55" />
          <stop offset="50%"  stopColor="#dc2626" stopOpacity="0.32" />
          <stop offset="80%"  stopColor="#7f1d1d" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <filter id="lionFaceGlowBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>

        {/* Eye gradient — red coal with the amber kiss baked in at ~22%,
            same anatomy as the HAL eye render path. */}
        <radialGradient id="lionEyeGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#fed7aa" />
          <stop offset="10%" stopColor="#ef4444" />
          <stop offset="22%" stopColor="#ea580c" />
          <stop offset="42%" stopColor="#b91c1c" />
          <stop offset="68%" stopColor="#450a0a" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>

        {/* Strong eye-halo blur — bigger spread than v1 so the pulse
            visibly bleeds out past the eye edges. */}
        <filter id="lionEyeGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* ════════════════════════════════════════════════════════════════════
          FACE GLOW — sits behind the entire lion. A large blurred ellipse
          using the amber-to-red radial gradient, pulsing in sync with the
          eyes. This is the "reddish/amber glow emanating from the face
          into the area" Mark asked for.
          ════════════════════════════════════════════════════════════════════ */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={42}
        ry={42}
        fill="url(#lionFaceGlow)"
        filter="url(#lionFaceGlowBlur)"
      >
        <animate
          attributeName="opacity"
          values={faceGlowOp}
          dur={pulseDur}
          repeatCount="indefinite"
        />
      </ellipse>

      {/* ── MANE — 14 petal tufts radiating around the head ──────────────── */}
      <path
        d={manePath}
        stroke={GOLD}
        strokeWidth={1.3}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inner mane ring — boundary between mane and face. */}
      <circle
        cx={cx}
        cy={cy}
        r={rInner - 1}
        stroke={GOLD_DIM}
        strokeWidth={0.8}
        fill="none"
        opacity={0.55}
      />

      {/* ── EARS — pointed triangles peeking up through the mane ─────────── */}
      <path
        d="M 32 41 L 28 30 L 40 38 Z"
        stroke={GOLD}
        strokeWidth={1.2}
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M 68 41 L 72 30 L 60 38 Z"
        stroke={GOLD}
        strokeWidth={1.2}
        fill="none"
        strokeLinejoin="round"
      />
      {/* Inner ear shading lines */}
      <path d="M 32.5 39 L 34 34" stroke={GOLD_DIM} strokeWidth={0.7} opacity={0.7} />
      <path d="M 67.5 39 L 66 34" stroke={GOLD_DIM} strokeWidth={0.7} opacity={0.7} />

      {/* ════════════════════════════════════════════════════════════════════
          FACE — scaled ~1.33× from v1 so facial features are readable.
          Was: rx=17 ry=19 cy=56  →  Now: rx=22 ry=25 cy=55
          The chin pokes a couple px below the mane inner ring, which reads
          natural rather than buggy.
          ════════════════════════════════════════════════════════════════════ */}
      <ellipse
        cx={50}
        cy={55}
        rx={22}
        ry={25}
        stroke={GOLD}
        strokeWidth={1.5}
        fill="none"
      />

      {/* Brow ridges — give Ari a focused expression. Wider apart now. */}
      <path
        d="M 33 47 Q 39 44 45 47"
        stroke={GOLD}
        strokeWidth={1.1}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 55 47 Q 61 44 67 47"
        stroke={GOLD}
        strokeWidth={1.1}
        fill="none"
        strokeLinecap="round"
      />

      {/* ── NOSE — heraldic inverted-shield/heart shape, larger ─────────── */}
      <path
        d="M 50 67 Q 45 66.5 45 62.5 Q 45 60 50 61.5 Q 55 60 55 62.5 Q 55 66.5 50 67 Z"
        stroke={GOLD}
        strokeWidth={1}
        fill={GOLD}
      />

      {/* Bridge of nose — connects brow to nose for that lion silhouette. */}
      <line x1={50} y1={55} x2={50} y2={61.5} stroke={GOLD_DIM} strokeWidth={0.8} opacity={0.75} />

      {/* ── MOUTH — philtrum + two lip curves, scaled to the bigger face ── */}
      <path
        d="M 50 67 L 50 73"
        stroke={GOLD}
        strokeWidth={1.1}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 50 73 Q 44 76 38 74"
        stroke={GOLD}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 50 73 Q 56 76 62 74"
        stroke={GOLD}
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />

      {/* ── WHISKERS — three each side, longer + bolder ───────────────── */}
      <g stroke={GOLD_DIM} strokeWidth={0.7} fill="none" opacity={0.6} strokeLinecap="round">
        <line x1={40} y1={69} x2={30} y2={68} />
        <line x1={40} y1={71} x2={30} y2={72} />
        <line x1={40} y1={73} x2={31} y2={75} />
        <line x1={60} y1={69} x2={70} y2={68} />
        <line x1={60} y1={71} x2={70} y2={72} />
        <line x1={60} y1={73} x2={69} y2={75} />
      </g>

      {/* ════════════════════════════════════════════════════════════════════
          THE EYES — the only animated element. Per Mark's spec:
            "The eyes glow not the lion itself."

          v2 tuning:
            • Bigger eyes (core 3.0, halo up to 9.0 in pulse — was 4.2 max)
            • Bigger amplitude (halo opacity 0.30→0.95, was 0.25→0.6)
            • Faster cycle (2.2s idle, 1.4s active — was 3s/1.8s)
            • Wider blur on the halo filter (stdDev 2.4, was 1.6)
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Left eye — outer halo, then core ────────────────────────────── */}
      <circle cx={eyeLX} cy={eyeY} r={6} fill="#dc2626" filter="url(#lionEyeGlow)" opacity={0.4}>
        <animate
          attributeName="opacity"
          values={haloOpacity}
          dur={pulseDur}
          repeatCount="indefinite"
        />
        <animate
          attributeName="r"
          values={haloR}
          dur={pulseDur}
          repeatCount="indefinite"
        />
      </circle>
      <circle cx={eyeLX} cy={eyeY} r={3} fill="url(#lionEyeGrad)">
        <animate
          attributeName="r"
          values={coreR}
          dur={pulseDur}
          repeatCount="indefinite"
        />
      </circle>

      {/* ── Right eye — outer halo, then core ───────────────────────────── */}
      <circle cx={eyeRX} cy={eyeY} r={6} fill="#dc2626" filter="url(#lionEyeGlow)" opacity={0.4}>
        <animate
          attributeName="opacity"
          values={haloOpacity}
          dur={pulseDur}
          repeatCount="indefinite"
        />
        <animate
          attributeName="r"
          values={haloR}
          dur={pulseDur}
          repeatCount="indefinite"
        />
      </circle>
      <circle cx={eyeRX} cy={eyeY} r={3} fill="url(#lionEyeGrad)">
        <animate
          attributeName="r"
          values={coreR}
          dur={pulseDur}
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
};

export default LionMark;