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
          500: '#929CA4',
          600: '#7F8A93',
        },
        'cre-primary': '#F4F2EE',
        'cre-accent': '#C88768',
        'cre-success': '#78B77D',
        'cre-danger': '#EC6E5B',
        'cre-warning': '#DFB565',
        'cre-info': '#8F99A2',
        'cre-live': '#6F9DE2',
        'cre-bg': '#0F1820',
        'cre-surface': '#111C24',
        'cre-elevated': '#16232C',
        'cre-border': 'rgba(180,194,202,0.18)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
