import Navbar from './Navbar'

interface LegalPageProps {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

export default function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <>
      <Navbar />
      <div style={{ paddingTop: '100px', paddingBottom: '80px', minHeight: '100vh' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          {/* 返回链接 */}
          <a
            href="#/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              color: 'var(--text-muted)',
              marginBottom: '32px',
              transition: 'color 0.2s',
        }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            ← 返回首页
          </a>

          {/* 标题 */}
          <h1
            style={{
              fontSize: '36px',
              fontWeight: 700,
              marginBottom: '8px',
              background: 'linear-gradient(135deg, var(--text), var(--accent))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {title}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '48px' }}>
            最后更新：{lastUpdated}
          </p>

          {/* 内容 */}
          <div
            style={{
              fontSize: '15px',
              lineHeight: 1.85,
              color: 'var(--text-secondary)',
            }}
          >
            {children}
          </div>

          {/* 联系方式卡片 */}
          <div
            style={{
              marginTop: '64px',
              padding: '32px',
              borderRadius: '16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
            }}
          >
            <h3
              style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: '16px',
              }}
            >
              联系我们
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              如对本文档有任何疑问，请通过以下方式联系：
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: '80px' }}>昵称</span>
                <span style={{ color: 'var(--text)' }}>xxccdl</span>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: '80px' }}>微信</span>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>favourite-xx</span>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: '80px' }}>邮箱</span>
                <a
                  href="mailto:6541171@qq.com"
                  style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
                >
                  6541171@qq.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
