/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 深色主题色板
        bg: {
          DEFAULT: '#0a0e14',
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
        // 主色调：蓝紫渐变两端
        accent: {
          blue: '#2f81f7',
          purple: '#a371f7',
          hover: '#79b8ff'
        },
        success: '#3fb950',
        warning: '#d29922',
        danger: '#f85149'
      },
      fontFamily: {
        sans: ['Space Grotesk', '-apple-system', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace']
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #2f81f7 0%, #a371f7 100%)',
        'gradient-brand-soft': 'linear-gradient(135deg, rgba(47,129,247,0.15) 0%, rgba(163,113,247,0.15) 100%)'
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(47, 129, 247, 0.35)',
        'glow-purple': '0 0 20px rgba(163, 113, 247, 0.35)',
        'glow-brand': '0 8px 32px rgba(47, 129, 247, 0.25), 0 8px 32px rgba(163, 113, 247, 0.15)'
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        floatGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' }
        }
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
        'float-glow': 'floatGlow 6s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
