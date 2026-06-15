/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        bg2: "rgb(var(--bg2) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        surface2: "rgb(var(--surface2) / <alpha-value>)",
        primary: "rgb(var(--primary) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        cyan: "rgb(var(--cyan) / <alpha-value>)",
        txt: "rgb(var(--txt) / <alpha-value>)",
        txt2: "rgb(var(--txt2) / <alpha-value>)",
        txt3: "rgb(var(--txt3) / <alpha-value>)",
        line: "rgb(var(--border) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)", "var(--font-sans)"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--primary) / 0.25), 0 8px 40px -8px rgb(var(--primary) / 0.35)",
        glowv: "0 0 0 1px rgb(var(--accent) / 0.25), 0 8px 40px -8px rgb(var(--accent) / 0.35)",
        soft: "0 10px 40px -12px rgba(2, 6, 23, 0.55)"
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(4vw,3vh) scale(1.08)" },
          "66%": { transform: "translate(-3vw,-2vh) scale(.96)" }
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        routeIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        blink: {
          "50%": { opacity: "0" }
        },
        sh: {
          "0%": { backgroundPosition: "100% 0" },
          "100%": { backgroundPosition: "0 0" }
        }
      },
      animation: {
        drift: "drift 22s ease-in-out infinite",
        fadeUp: "fadeUp .5s cubic-bezier(.22,1,.36,1) both",
        routeIn: "routeIn .45s cubic-bezier(.22,1,.36,1) both",
        blink: "blink 1s steps(2) infinite",
        shimmer: "sh 1.4s ease infinite"
      }
    }
  },
  plugins: []
};
