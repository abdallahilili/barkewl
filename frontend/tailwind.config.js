/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Identité RAQEEM : vert émeraude (#0D9B83) = action principale.
        // Le 600 (#0A7A67) est la teinte des boutons et des textes : lisible en blanc dessus et sur fond clair.
        marque: {
          50: '#ECF8F5', 100: '#D2EFE8', 200: '#A6DFD2', 300: '#6FCAB6', 400: '#34B396',
          500: '#0D9B83', 600: '#0A7A67', 700: '#086656', 800: '#075245', 900: '#063F36',
        },
        // Bleu nuit RAQEEM (#102D46) : confiance, titres, fonds sombres.
        nuit: {
          50: '#EEF3F7', 100: '#D6E1EA', 200: '#9FB3C8', 500: '#2A4A66', 700: '#173A57', 800: '#102D46', 900: '#0A1F31',
        },
      },
      fontFamily: {
        // Inter pour le latin et les chiffres, IBM Plex Sans Arabic pour l'arabe ; polices embarquées (fonctionnent hors ligne).
        sans: ['Inter', 'IBM Plex Sans Arabic', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
