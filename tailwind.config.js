/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        kisan: {
          dark: '#14532d',
          DEFAULT: '#1e7d32',
          light: '#3fa34d',
          orange: '#f5820b',
          bg: '#f4faf3',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'Noto Sans Devanagari', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
