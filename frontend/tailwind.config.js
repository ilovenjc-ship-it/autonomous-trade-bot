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
      },
    },
  },
  plugins: [],
}