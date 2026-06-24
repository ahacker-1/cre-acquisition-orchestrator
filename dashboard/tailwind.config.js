/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // WCAG AA contrast fix: the default Tailwind gray-500/600 used for de-emphasized
        // body text failed AA on the near-black (#050505) surfaces (gray-500 4.22:1,
        // gray-600 2.70:1). These minimally-brighter cool grays clear 4.5:1 (gray-500
        // 5.28:1, gray-600 4.85:1) while staying on the dark-mode brand palette and keeping
        // the 600<500<400 hierarchy. Non-text uses (bg-/border-gray-500/600 status markers)
        // are pinned to their original hex at call sites so surfaces stay unchanged.
        gray: {
          500: '#7C828E',
          600: '#757C88',
        },
        'cre-primary': '#FFFFFF',
        'cre-accent': '#FFFFFF',
        'cre-success': '#2DB87A',
        'cre-danger': '#EF4444',
        'cre-warning': '#D9B56C',
        'cre-info': '#A3A5B3',
        'cre-live': '#3B82F6',
        'cre-bg': '#000000',
        'cre-surface': '#050505',
        'cre-elevated': '#0A0A0A',
        'cre-border': 'rgba(255,255,255,0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
