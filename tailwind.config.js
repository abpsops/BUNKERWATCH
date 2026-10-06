/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#EBEFF2", // harbour fog — page canvas
          900: "#F6F8FA",
          800: "#EDF1F4", // hover / zebra / table header fill
          700: "#D5DDE4", // hairlines
          600: "#BAC6D0",
          500: "#7F8E9C",
        },
        // Deep marine-navy chrome — sidebar, header, and other fixed
        // structural surfaces. Distinct from `ink` (the warm paper tone
        // used for content surfaces), so light content cards keep good
        // contrast against a dark instrument-panel frame.
        navy: {
          900: "#0A1A2A", // hull navy — rail and fixed chrome
          800: "#112B42",
          700: "#1B3A55",
          600: "#2C5478",
          500: "#8FA6BA", // muted text on navy (passes AA on 900)
        },
        chart: {
          line: "#D5DDE4",
          text: "#5B6C7E",
        },
        signal: {
          bunker: "#0D9488",   // teal-600 — STS Bunkering
          supply: "#B45309",   // amber-700 — STS Supply
          warn: "#D97706",
          crit: "#DC2626",
          ok: "#16A34A",
        },
        paper: {
          100: "#0C1B2A",
          300: "#3B4B5C",
          500: "#5B6C7E",
        },
        // Marine flag-blue — the operator's primary action colour. Chosen
        // to sit tonally between navy and the bunker teal rather than the
        // generic Tailwind indigo, so it reads as this product's own
        // identity, not a template default.
        brand: {
          500: "#0B5E8E", // fathom blue — primary action
          600: "#084A71",
        },
        // The one accent in the chrome: the signal lamp from the logo mark.
        lamp: "#F2B134",
        // A curated, saturated palette used deliberately across KPI cards,
        // nav icons, and chart series so the app reads as colourful and
        // alive rather than the earlier all-navy/amber restraint. Each
        // hue has a `DEFAULT` (icon/text/bar) and a `tint` (soft card
        // background) so colour carries real information (which KPI,
        // which competitor) instead of being decorative.
        vivid: {
          blue:   { DEFAULT: "#2563EB", tint: "#EAF1FE" },
          cyan:   { DEFAULT: "#0891B2", tint: "#E5F6F9" },
          teal:   { DEFAULT: "#0D9488", tint: "#E3F5F2" },
          green:  { DEFAULT: "#16A34A", tint: "#E9F8EE" },
          amber:  { DEFAULT: "#D97706", tint: "#FCF1E1" },
          orange: { DEFAULT: "#EA580C", tint: "#FDECE3" },
          pink:   { DEFAULT: "#DB2777", tint: "#FCE9F1" },
          purple: { DEFAULT: "#7C3AED", tint: "#F1EBFD" },
          red:    { DEFAULT: "#DC2626", tint: "#FCEAEA" },
        },
      },
      fontFamily: {
        display: ["IBM Plex Sans Condensed", "IBM Plex Sans", "system-ui", "sans-serif"],
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      // Tighter, instrument-panel radii instead of Tailwind's soft defaults.
      borderRadius: {
        md: "3px",
        lg: "4px",
        xl: "6px",
        "2xl": "8px",
      },
    },
  },
  plugins: [],
}
