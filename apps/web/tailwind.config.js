/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: 'var(--bg-surface)',
          alt: 'var(--bg-surface-alt)',
        },
        main: 'var(--text-primary)',
        dim: 'var(--text-secondary)',
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* Crisis-specific semantic tokens */
        crisis: {
          medical: "hsl(var(--crisis-medical, 0 72% 51%))",
          fire: "hsl(var(--crisis-fire, 25 90% 50%))",
          security: "hsl(var(--crisis-security, 40 92% 48%))",
        },
        status: {
          safe: "hsl(var(--status-safe, 152 60% 42%))",
          ack: "hsl(var(--status-ack, 262 55% 55%))",
          ai: "hsl(var(--ai-accent, 210 85% 48%))",
        },
        ops: {
          clear: "hsl(var(--ops-all-clear, 152 60% 42%))",
          active: "hsl(var(--ops-active, 0 72% 51%))",
          escalated: "hsl(var(--ops-escalated, 340 70% 50%))",
          info: "hsl(var(--ops-info, 195 75% 48%))",
          warning: "hsl(var(--ops-warning, 40 92% 48%))",
          ack: "hsl(var(--ops-ack, 262 55% 55%))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}
