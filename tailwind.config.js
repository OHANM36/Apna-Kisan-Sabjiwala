/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "सुबह की मंडी" पैलेट — जंगली हरा, हल्दी/मैरीगोल्ड, टमाटर-टेराकोटा, कागज़ी क्रीम
        kisan: {
          dark: '#1F4D34',    // गहरा जंगली हरा (header, active states)
          DEFAULT: '#2D6B45', // मुख्य हरा (primary buttons)
          light: '#4C8C5B',   // हल्का पत्ती हरा (hover/secondary)
          orange: '#E8A33D',  // हल्दी/मैरीगोल्ड (browse/category accent)
          tomato: '#C1442E',  // टमाटर-टेराकोटा (ऑफर/छूट/अर्जेंट)
          bg: '#FBF6EC',      // गर्म कागज़ी क्रीम (पेज बैकग्राउंड)
          crate: '#F1EAD9',   // गहरा कागज़ी तन (कार्ड ट्रे, बॉर्डर)
          ink: '#2A2318',     // गर्म स्याही-काला (हेडिंग टेक्स्ट)
        },
      },
      fontFamily: {
        sans: ['Mukta', 'Noto Sans Devanagari', 'sans-serif'],
        display: ['"Baloo 2"', 'Mukta', 'sans-serif'],
      },
      keyframes: {
        fadeSlideIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bump: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.35)' },
          '100%': { transform: 'scale(1)' },
        },
        stampIn: {
          '0%': { transform: 'scale(1.15) rotate(-3deg)', opacity: '0' },
          '100%': { transform: 'scale(1) rotate(var(--tilt, 0deg))', opacity: '1' },
        },
        veggieBob: {
          '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' },
          '50%': { transform: 'translateY(-6px) rotate(2deg)' },
        },
        veggieBlink: {
          '0%, 90%, 100%': { transform: 'scaleY(1)' },
          '95%': { transform: 'scaleY(0.1)' },
        },
      },
      animation: {
        'fade-slide-in': 'fadeSlideIn 0.35s ease-out both',
        'bump': 'bump 0.35s ease-out',
        'stamp-in': 'stampIn 0.3s ease-out both',
        'veggie-bob': 'veggieBob 2.6s ease-in-out infinite',
        'veggie-blink': 'veggieBlink 3.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
