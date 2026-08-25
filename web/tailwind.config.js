/** @type {import('tailwindcss').Config} */
// Empty on purpose. The token names (Peek's, verbatim) land in the next step;
// their values are Ship's own theme and come later as a design pass.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}
