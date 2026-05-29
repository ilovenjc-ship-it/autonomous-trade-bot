// ─────────────────────────────────────────────────────────────────────────────
// LionMark — Day 16 Session XLIV
//
// Mark's call: pink lion PNG kept fighting the surrounding chrome (background
// bled through in the halo, screen-blend leaked the sidebar tint, chroma-key
// left soft edges). Solution: draw the lion from scratch as inline SVG so we
// own every pixel.
//
// Design rules (Mark's spec, verbatim):
//   1. Color: gold (was pink). Pink overlapped with the eye-glow vocabulary;
//      gold gives the lion its own register and matches the existing amber
//      accents in the UI (Top Stake, Paper-Trading badge).
//   2. The EYES glow. The lion itself does NOT. Static gold linework, animated
//      red+amber eye coals.
//   3. No outer pink/red halo on the orb — the eyes carry the presence now.
//
// The eye anatomy uses the same red-coal-with-amber-kiss gradient as the
// HAL-eye render path (preserved behind USE_LION_ORB in Layout.tsx) so the
// two render paths still rhyme visually if Mark ever flips the flag back.
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
  // Procedurally generate the 14 outer mane petals so the geometry stays
  // perfectly symmetrical. Petals are leaf-shaped (two arcs meeting at the
  // tip), radiating from an inner ring around the face.
  const PETALS = 14;
  const cx = 50, cy = 52;
  const rInner = 26;
  const rOuter = 46;
  const manePath = Array.from({ length: PETALS }, (_, i) => {
    const a = (i * (360 / PETALS) - 90) * (Math.PI / 180);
    const half = (Math.PI / PETALS) * 0.85; // petal half-width in radians
    const x1 = cx + rInner * Math.cos(a - half);
    const y1 = cy + rInner * Math.sin(a - half);
    const tipX = cx + rOuter * Math.cos(a);
    const tipY = cy + rOuter * Math.sin(a);
    const x2 = cx + rInner * Math.cos(a + half);
    const y2 = cy + rInner * Math.sin(a + half);
    // Control points for the petal sides — bowed outward slightly
    const ctrlR = (rInner + rOuter) * 0.55;
    const cax = cx + ctrlR * Math.cos(a - half * 0.4);
    const cay = cy + ctrlR * Math.sin(a - half * 0.4);
    const cbx = cx + ctrlR * Math.cos(a + half * 0.4);
    const cby = cy + ctrlR * Math.sin(a + half * 0.4);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${cax.toFixed(2)} ${cay.toFixed(2)} ${tipX.toFixed(2)} ${tipY.toFixed(2)} Q ${cbx.toFixed(2)} ${cby.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }).join(' ');

  // Eye coordinates (symmetric about x=50)
  const eyeY = 53;
  const eyeLX = 43;
  const eyeRX = 57;

  // Pulse timing — gentler when idle, brisker when active
  const pulseDur = active ? '1.8s' : '3s';

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Ari — Lion sigil"
    >
      <defs>
        {/* Eye gradient — red coal with the amber kiss baked in at ~14%, same
            anatomy as the HAL eye render path so the two visuals rhyme. */}
        <radialGradient id="lionEyeGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#fca5a5" />
          <stop offset="8%"  stopColor="#ef4444" />
          <stop offset="22%" stopColor="#ea580c" />
          <stop offset="40%" stopColor="#b91c1c" />
          <stop offset="65%" stopColor="#450a0a" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>

        {/* Soft Gaussian blur for the eye halo glow. */}
        <filter id="lionEyeGlow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* ── MANE — 14 petal tufts radiating around the head ──────────────── */}
      <path
        d={manePath}
        stroke={GOLD}
        strokeWidth={1.3}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Inner mane ring — the boundary between mane and face. */}
      <circle
        cx={cx}
        cy={cy}
        r={rInner - 1}
        stroke={GOLD_DIM}
        strokeWidth={0.8}
        fill="none"
        opacity={0.55}
      />

      {/* ── EARS — two pointed triangles peeking up through the mane ───── */}
      <path
        d="M 34 41 L 31 32 L 41 38 Z"
        stroke={GOLD}
        strokeWidth={1.2}
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M 66 41 L 69 32 L 59 38 Z"
        stroke={GOLD}
        strokeWidth={1.2}
        fill="none"
        strokeLinejoin="round"
      />
      {/* Inner ear shading lines */}
      <path d="M 34.5 39 L 36 35" stroke={GOLD_DIM} strokeWidth={0.7} opacity={0.7} />
      <path d="M 65.5 39 L 64 35" stroke={GOLD_DIM} strokeWidth={0.7} opacity={0.7} />

      {/* ── FACE — soft rounded muzzle silhouette ───────────────────────── */}
      <ellipse
        cx={50}
        cy={56}
        rx={17}
        ry={19}
        stroke={GOLD}
        strokeWidth={1.4}
        fill="none"
      />

      {/* Brow ridges — give the lion a focused expression. */}
      <path
        d="M 38 49 Q 43 47 47 49"
        stroke={GOLD}
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 53 49 Q 57 47 62 49"
        stroke={GOLD}
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
      />

      {/* ── NOSE — heraldic inverted-shield/heart shape ─────────────────── */}
      <path
        d="M 50 65 Q 46.5 64.5 46.5 61.5 Q 46.5 59.5 50 60.5 Q 53.5 59.5 53.5 61.5 Q 53.5 64.5 50 65 Z"
        stroke={GOLD}
        strokeWidth={0.9}
        fill={GOLD}
      />

      {/* Bridge of nose */}
      <line x1={50} y1={56} x2={50} y2={60} stroke={GOLD_DIM} strokeWidth={0.7} opacity={0.7} />

      {/* ── MOUTH — philtrum + two lip curves ───────────────────────────── */}
      <path
        d="M 50 65 L 50 70"
        stroke={GOLD}
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 50 70 Q 45 72.5 41 71"
        stroke={GOLD}
        strokeWidth={1.1}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 50 70 Q 55 72.5 59 71"
        stroke={GOLD}
        strokeWidth={1.1}
        fill="none"
        strokeLinecap="round"
      />

      {/* ── WHISKERS — three each side, subtle ──────────────────────────── */}
      <g stroke={GOLD_DIM} strokeWidth={0.6} fill="none" opacity={0.55} strokeLinecap="round">
        <line x1={42} y1={67} x2={34} y2={66} />
        <line x1={42} y1={68.5} x2={34} y2={69} />
        <line x1={42} y1={70} x2={35} y2={72} />
        <line x1={58} y1={67} x2={66} y2={66} />
        <line x1={58} y1={68.5} x2={66} y2={69} />
        <line x1={58} y1={70} x2={65} y2={72} />
      </g>

      {/* ════════════════════════════════════════════════════════════════
          THE EYES — the ONLY animated element. Per Mark's spec:
            "The eyes glow not the lion itself."
          Each eye = soft red halo blob (filtered Gaussian) under a sharp
          red-coal-with-amber-kiss radial-gradient sphere. Halo opacity
          breathes between ~0.25 and ~0.65 on a 3s cycle (1.8s when active).
          ════════════════════════════════════════════════════════════════ */}

      {/* Left eye halo */}
      <circle cx={eyeLX} cy={eyeY} r={4.2} fill="#dc2626" filter="url(#lionEyeGlow)" opacity={0.35}>
        <animate
          attributeName="opacity"
          values={active ? '0.45;0.85;0.45' : '0.25;0.6;0.25'}
          dur={pulseDur}
          repeatCount="indefinite"
        />
        <animate
          attributeName="r"
          values={active ? '4.2;5.0;4.2' : '4.0;4.5;4.0'}
          dur={pulseDur}
          repeatCount="indefinite"
        />
      </circle>
      {/* Left eye core */}
      <circle cx={eyeLX} cy={eyeY} r={2.2} fill="url(#lionEyeGrad)">
        <animate
          attributeName="r"
          values={active ? '2.2;2.5;2.2' : '2.1;2.3;2.1'}
          dur={pulseDur}
          repeatCount="indefinite"
        />
      </circle>

      {/* Right eye halo */}
      <circle cx={eyeRX} cy={eyeY} r={4.2} fill="#dc2626" filter="url(#lionEyeGlow)" opacity={0.35}>
        <animate
          attributeName="opacity"
          values={active ? '0.45;0.85;0.45' : '0.25;0.6;0.25'}
          dur={pulseDur}
          repeatCount="indefinite"
        />
        <animate
          attributeName="r"
          values={active ? '4.2;5.0;4.2' : '4.0;4.5;4.0'}
          dur={pulseDur}
          repeatCount="indefinite"
        />
      </circle>
      {/* Right eye core */}
      <circle cx={eyeRX} cy={eyeY} r={2.2} fill="url(#lionEyeGrad)">
        <animate
          attributeName="r"
          values={active ? '2.2;2.5;2.2' : '2.1;2.3;2.1'}
          dur={pulseDur}
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
};

export default LionMark;