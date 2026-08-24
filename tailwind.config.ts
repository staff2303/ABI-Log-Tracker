import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        abi: {
          black: "#070806",
          charcoal: "#10130f",
          panel: "#151914",
          panel2: "#1b211a",
          line: "#30372c",
          muted: "#9ca39a",
          text: "#e4e7df",
          olive: "#8b9d48",
          lime: "#b8d46b",
          green: "#78b86b",
          red: "#d45f5a",
          amber: "#d3a84b",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
