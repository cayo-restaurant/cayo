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
          burgundy: '#4D1423',
          dark: '#1A0A10',
          cream: '#F0E0C7',
          orange: '#E35632',
          teal: '#00AD9E',
          tealDark: '#008578',
          red: '#CB4747',
          // Keep old aliases for backward compat during migration
          copper: '#E35632',
          gold: '#CB4747',
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
