import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  // One glob over the whole of `src`, deliberately.
  //
  // This previously listed `./src/pages`, `./src/components` and `./src/app`. The first
  // two do not exist in this codebase — the layers are `app` / `frontend` / `backend` /
  // `shared` — so every Tailwind class used only inside `src/frontend/**` (68 component
  // files, i.e. nearly all of the UI) was never scanned and never generated.
  //
  // The failure looked like anything except a build-config bug: colours, fonts and
  // borders were fine because those classes also appear under `src/app/**`, while
  // `lg:grid-cols-[1.5fr_repeat(4,1fr)]`, `gap-*` and the calendar's `h-9 w-9` silently
  // vanished. The footer collapsed into one very long column, filter rows lost their
  // spacing, and calendar dates rendered as "2627282930311".
  //
  // Enumerating layer directories here means a future layer is invisible until someone
  // notices the CSS is wrong. Scanning `src` once cannot drift.
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        // "The Programme": a Didone display, a text serif for reading, a mono for marks.
        headline: ['var(--font-display)', 'Georgia', 'Times New Roman', 'serif'],
        body: ['var(--font-body)', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
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
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
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
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'splash-in': {
          '0%': { opacity: '0', transform: 'translateY(-40px) scale(0.9)' },
          '60%': { opacity: '1', transform: 'translateY(8px) scale(1.02)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in-up': 'fade-in-up 0.6s ease-out both',
        'splash-in': 'splash-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
