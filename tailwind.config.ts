import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cayo: {
          burgundy: '#4A0E1C',
          dark: '#1A0A10',
          cream: '#F2E6D0',
          copper: '#C4784A',
          teal: '#2D6B5E',
          gold: '#D4A84B',
        },
      },
      fontFamily: {
        heebo: ['var(--font-heebo)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
