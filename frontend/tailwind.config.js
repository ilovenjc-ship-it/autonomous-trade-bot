/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0d1525',
          800: '#152030',
          700: '#1c2b42',
          600: '#243450',
          500: '#2d3f60',
        },
        accent: {
          green:  '#00e5a0',
          red:    '#ff4d6d',
          blue:   '#3b82f6',
          yellow: '#f59e0b',
          purple: '#8b5cf6',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':       'fadeIn 0.4s ease-out',
        'slide-up':      'slideUp 0.3s ease-out',
        // Session XXXVII — thought-bubble label fade (subtle slide + fade)
        'thought-fade':  'thoughtFade 0.45s ease-out',
        // Session XXXVII — PageLoader progress bar slide
        'loader-slide': 'loaderSlide 1.2s ease-in-out infinite',
        // Session XXXV — HAL-eye orb (slow mystic breathing + active glow)
        'hal-breathe':   'halBreathe 4.2s ease-in-out infinite',
        'hal-active':    'halActive 2.4s ease-in-out infinite',
        'hal-ring':      'halRing 5.5s linear infinite',
      },
      keyframes: {
        fadeIn:      { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:     { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        thoughtFade: {
          from: { opacity: 0, transform: 'translateY(3px)' },
          to:   { opacity: 1, transform: 'translateY(0)' },
        },
        loaderSlide: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        // Idle breathing — subtle, mysterious, slow heartbeat. Only the
        // glow intensity changes, not the size, so the orb feels alive
        // without being attention-stealing.
        halBreathe: {
          '0%, 100%': { boxShadow: '0 0 14px 2px rgba(220,38,38,0.30), 0 0 32px 6px rgba(220,38,38,0.10), inset 0 0 12px rgba(252,165,165,0.20)' },
          '50%':      { boxShadow: '0 0 22px 4px rgba(248,113,113,0.55), 0 0 56px 14px rgba(220,38,38,0.20), inset 0 0 18px rgba(252,165,165,0.40)' },
        },
        // Active state (chat panel open) — faster, more intense, the orb
        // is "engaged". Still slower than a typical animate-pulse.
        halActive: {
          '0%, 100%': { boxShadow: '0 0 26px 6px rgba(248,113,113,0.65), 0 0 60px 16px rgba(220,38,38,0.30), inset 0 0 22px rgba(254,202,202,0.55)' },
          '50%':      { boxShadow: '0 0 36px 10px rgba(254,202,202,0.85), 0 0 84px 24px rgba(248,113,113,0.40), inset 0 0 28px rgba(254,242,242,0.75)' },
        },
        halRing: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
}