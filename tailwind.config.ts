import type { Config } from 'tailwindcss'
import tailwindAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Semantic status colors (token-driven)
        status: {
          safe: 'hsl(var(--status-safe))',
          warning: 'hsl(var(--status-warning))',
          danger: 'hsl(var(--status-danger))',
          info: 'hsl(var(--status-info))',
          neutral: 'hsl(var(--status-neutral))',
        },
        // Financial colors (invariant)
        financial: {
          income: 'hsl(var(--fin-income))',
          expense: 'hsl(var(--fin-expense))',
          net: 'hsl(var(--fin-net))',
        },
        // Brand
        brand: {
          copper: 'hsl(var(--brand-copper))',
          charcoal: 'hsl(var(--brand-charcoal))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: 'var(--radius-card)',
        badge: 'var(--radius-badge)',
        button: 'var(--radius-button)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      minHeight: {
        touch: 'var(--touch-min)',
        'touch-primary': 'var(--touch-primary)',
      },
    },
  },
  plugins: [tailwindAnimate],
}

export default config
