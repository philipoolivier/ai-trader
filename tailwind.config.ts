import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef9ff',
          100: '#d9f1ff',
          200: '#bce8ff',
          300: '#8edaff',
          400: '#59c3ff',
          500: '#33a5ff',
          600: '#1b86f5',
          700: '#146fe1',
          800: '#1759b6',
          900: '#194c8f',
          950: '#142f57',
        },
        profit: '#22c55e',
        loss: '#ef4444',
        surface: {
          0: '#0a0a0f',
          1: '#111118',
          2: '#1a1a24',
          3: '#232330',
          4: '#2d2d3d',
        },
        text: {
          primary: '#f0f0f5',
          secondary: '#9494a8',
          muted: '#5e5e72',
        },
      },
    },
  },
  plugins: [],
}
export default config
