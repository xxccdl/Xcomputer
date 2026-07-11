/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0d1117',
          panel: '#161b22',
          hover: '#1c2128',
          input: '#010409'
        },
        border: {
          DEFAULT: '#30363d',
          muted: '#21262d'
        },
        text: {
          primary: '#e6edf3',
          secondary: '#8b949e',
          muted: '#6e7681'
        },
        accent: {
          DEFAULT: '#58a6ff',
          hover: '#79b8ff'
        },
        success: '#3fb950',
        warning: '#d29922',
        danger: '#f85149'
      },
      fontFamily: {
        sans: ['-apple-system', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace']
      },
      fontSize: {
        xs: ['11px', '16px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
        lg: ['16px', '24px']
      }
    }
  },
  plugins: []
}
