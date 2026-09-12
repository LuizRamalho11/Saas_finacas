import type { Config } from "tailwindcss";

/**
 * Design tokens do Finora.
 * Todas as cores vivem em variveis CSS (app/globals.css) para que o tema
 * claro/escuro troque sem duplicar classes. Nenhum hex solto nos componentes.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
    },
    extend: {
      colors: {
        canvas: "hsl(var(--canvas))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          raised: "hsl(var(--surface-2))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        foreground: "hsl(var(--fg))",
        muted: {
          DEFAULT: "hsl(var(--surface-2))",
          foreground: "hsl(var(--fg-muted))",
        },
        subtle: "hsl(var(--fg-subtle))",
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-fg))",
          soft: "hsl(var(--brand) / 0.14)",
        },
        cyan: { DEFAULT: "hsl(var(--cyan))" },
        violet: { DEFAULT: "hsl(var(--violet))" },
        coral: { DEFAULT: "hsl(var(--coral))" },
        success: { DEFAULT: "hsl(var(--success))" },
        danger: { DEFAULT: "hsl(var(--danger))" },
        warning: { DEFAULT: "hsl(var(--warning))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        card: "var(--radius-card)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        glow: "0 0 0 1px hsl(var(--brand) / 0.35), 0 8px 30px -8px hsl(var(--brand) / 0.45)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        kpi: ["1.75rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "fade-up": "fade-up 0.35s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
