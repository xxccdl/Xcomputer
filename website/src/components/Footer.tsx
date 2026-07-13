export default function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-card)',
        padding: '48px 0 32px',
      }}
    >
      <div className="container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr',
            gap: '48px',
            marginBottom: '40px',
          }}
        >
          {/* 品牌 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
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
                }}
              >
                X
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  fontSize: '18px',
                }}
              >
                Xcomputer
              </span>
            </div>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                maxWidth: '300px',
                lineHeight: 1.7,
              }}
            >
              AI 驱动的 Windows 桌面自动化助手。用自然语言操控你的电脑，让 AI 成为你的管家。
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              {['GitHub', 'Email', 'Discord'].map((s) => (
                <a
                  key={s}
                  href="#"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.color = 'var(--accent)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text-muted)'
                  }}
                >
                  {s[0]}
                </a>
              ))}
            </div>
          </div>

          {/* 产品 */}
          <div>
            <h4
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: '16px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              产品
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['功能特性', '下载', '更新日志', '路线图'].map((l) => (
                <a
                  key={l}
                  href="#"
                  style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  {l}
                </a>
              ))}
            </div>
          </div>

          {/* 资源 */}
          <div>
            <h4
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: '16px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              资源
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['使用文档', 'API 参考', '技能市场', '常见问题'].map((l) => (
                <a
                  key={l}
                  href="#"
                  style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  {l}
                </a>
              ))}
            </div>
          </div>

          {/* 关于 */}
          <div>
            <h4
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: '16px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              关于
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: '项目介绍', href: '#' },
                { label: '开源协议', href: '#' },
                { label: '隐私政策', href: '#/privacy' },
                { label: '用户条款', href: '#/terms' },
                { label: '联系我们', href: '#' },
              ].map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* 底部版权 */}
        <div
          style={{
            paddingTop: '24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            © 2026 Xcomputer. All rights reserved.
          </p>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--success)',
                  animation: 'blink 2s infinite',
                }}
              />
              Powered by DeepSeek AI
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
