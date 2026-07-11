import { useEffect, useState } from 'react'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        transition: 'all 0.3s ease',
        background: scrolled ? 'rgba(10, 14, 20, 0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border)' : '1px solid transparent',
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '64px',
        }}
      >
        {/* Logo */}
        <a href="#" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-3))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: '16px',
              color: '#fff',
              boxShadow: '0 0 20px var(--accent-glow)',
            }}
          >
            X
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: '18px',
              letterSpacing: '-0.5px',
            }}
          >
            Xcomputer
          </span>
        </a>

        {/* Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <a
            href="#features"
            style={{ fontSize: '14px', color: 'var(--text-secondary)', transition: 'color 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            功能
          </a>
          <a
            href="#how"
            style={{ fontSize: '14px', color: 'var(--text-secondary)', transition: 'color 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            工作原理
          </a>
          <a
            href="#showcase"
            style={{ fontSize: '14px', color: 'var(--text-secondary)', transition: 'color 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            预览
          </a>
          <a
            href="#mobile"
            style={{ fontSize: '14px', color: 'var(--text-secondary)', transition: 'color 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            手机端
          </a>
          <a
            href="#download"
            style={{
              fontSize: '14px',
              fontWeight: 500,
              padding: '8px 20px',
              borderRadius: '8px',
              background: 'var(--accent)',
              color: '#fff',
              transition: 'all 0.2s',
              boxShadow: '0 0 16px var(--accent-glow)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 0 24px var(--accent-glow)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 0 16px var(--accent-glow)'
            }}
          >
            下载
          </a>
        </div>
      </div>
    </nav>
  )
}
