import daisyui from "daisyui";
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [daisyui],
  daisyui: {
    themes: [
      {
        orange: {
          primary: "orange",
          secondary: "#f97316",
          accent: "#fbbf24",
          neutral: "#111827",
          "base-100": "#fef3c7",
          info: "#d97706",
          success: "#fbbf24",
          warning: "#facc15",
          error: "#dc2626",
        },
      },
    ],
  },
};
