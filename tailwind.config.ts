import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Client brand colors — to be updated with actual palette
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#b9dffd',
          300: '#7cc8fc',
          400: '#36adf8',
          500: '#0c93e9',
          600: '#0074c7',
          700: '#015ca1',
          800: '#064f85',
          900: '#0b426e',
        },
        // Status colors for alerts (VAT threshold, bill anomalies)
        status: {
          safe: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
