/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cre-primary': '#FFFFFF',
        'cre-accent': '#FFFFFF',
        'cre-success': '#2DB87A',
        'cre-danger': '#EF4444',
        'cre-warning': '#D9B56C',
        'cre-info': '#A3A5B3',
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
