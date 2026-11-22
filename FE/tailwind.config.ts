import type { Config } from "tailwindcss";

/**
 * 골라잇 디자인 토큰 (p01 팔레트 8색 + 확장 토큰)
 * Tailwind v4는 globals.css @theme 과 동기화한다.
 */
const config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2F7D5A",
          light: "#E7F3EC",
          dark: "#1A4D38",
        },
        accent: {
          DEFAULT: "#F59E42",
          light: "#FFF1DF",
          text: "#B8691A",
        },
        background: "#FAFAF7",
        text: "#252A27",
        muted: "#737A76",
        error: {
          DEFAULT: "#D94C4C",
          light: "#FCEBEB",
        },
        card: "#FFFFFF",
        shell: "#E8EBE9",
        border: {
          DEFAULT: "#EEF1EF",
          strong: "#E5E8E6",
        },
      },
      maxWidth: {
        phone: "430px",
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
} satisfies Config;

export default config;
