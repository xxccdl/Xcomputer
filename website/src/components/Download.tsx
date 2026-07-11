import { useState, useEffect, type ReactElement } from 'react'

interface DownloadItem {
  filename: string
  version: string
  size: string
  sizeBytes: number
  url: string
  updatedAt: string
}

interface DownloadManifest {
  desktop: DownloadItem
  mobile: DownloadItem
}

export default function Download(): ReactElement {
  const [manifest, setManifest] = useState<DownloadManifest | null>(null)
  const [checking, setChecking] = useState(true)
  const [downloading, setDownloading] = useState<'desktop' | 'mobile' | null>(null)

  useEffect(() => {
    fetch('/download/manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error('manifest not found')
        return res.json()
      })
      .then((data: DownloadManifest) => {
        setManifest(data)
        setChecking(false)
      })
      .catch(() => {
        setChecking(false)
      })
  }, [])

  const handleDownload = (key: 'desktop' | 'mobile'): void => {
    if (!manifest) return
    const item = manifest[key]
    if (!item) return
    setDownloading(key)
    const link = document.createElement('a')
    link.href = item.url
    link.download = item.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => setDownloading(null), 3000)
  }

  return (
    <section
      id="download"
      style={{
        padding: '120px 0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 背景光效 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '800px',
          height: '600px',
          background:
            'radial-gradient(circle, rgba(47, 129, 247, 0.1) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />

      <div className="container" style={{ position: 'relative', textAlign: 'center' }}>
        <h2
          style={{
            fontSize: '48px',
            fontWeight: 700,
            letterSpacing: '-1.5px',
            marginBottom: '16px',
          }}
        >
          准备好
          <span
            style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-3))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            开始
          </span>
          了吗？
        </h2>
        <p
          style={{
            fontSize: '18px',
            color: 'var(--text-secondary)',
            marginBottom: '56px',
            maxWidth: '560px',
            margin: '0 auto 56px',
          }}
        >
          电脑端 + 移动端，双端协同。让 AI 成为你的全平台管家。
        </p>

        {/* 双下载卡片 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '24px',
            maxWidth: '880px',
            margin: '0 auto',
          }}
        >
          {/* 桌面端卡片 */}
          <DownloadCard
            icon="🪟"
            title="Xcomputer for Windows"
            tags={['x64', '.exe']}
            item={manifest?.desktop}
            checking={checking}
            downloading={downloading === 'desktop'}
            accent="var(--accent)"
            accentGlow="rgba(47, 129, 247, 0.4)"
            features={['免费', '限免模式无需 API Key', '开箱即用']}
            onClick={() => handleDownload('desktop')}
          />

          {/* 移动端卡片 */}
          <DownloadCard
            icon="📱"
            title="xphoneai for Android"
            tags={['ARM', '.apk']}
            item={manifest?.mobile}
            checking={checking}
            downloading={downloading === 'mobile'}
            accent="var(--accent-3)"
            accentGlow="rgba(163, 113, 247, 0.4)"
            features={['免费', 'Android 8.0+', '需开启无障碍']}
            onClick={() => handleDownload('mobile')}
          />
        </div>

        {/* 系统要求 */}
        <div style={{ marginTop: '56px' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            系统要求
          </p>
          <div
            style={{
              display: 'flex',
              gap: '12px 24px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {[
              'Windows 10/11 (64位)',
              'Android 8.0+',
              '4GB+ 内存',
              'API Key 可选',
            ].map((req) => (
              <span
                key={req}
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {req}
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  )
}

interface DownloadCardProps {
  icon: string
  title: string
  tags: string[]
  item: DownloadItem | undefined
  checking: boolean
  downloading: boolean
  accent: string
  accentGlow: string
  features: string[]
  onClick: () => void
}

function DownloadCard({
  icon,
  title,
  tags,
  item,
  checking,
  downloading,
  accent,
  accentGlow,
  features,
  onClick,
}: DownloadCardProps): ReactElement {
  return (
    <div
      style={{
        padding: '36px 32px',
        borderRadius: '20px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent
        e.currentTarget.style.transform = 'translateY(-4px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{ fontSize: '52px' }}>{icon}</div>
      <div>
        <h3 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '6px' }}>{title}</h3>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            fontSize: '13px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {tags.map((t, i) => (
            <span key={t}>
              {t}
              {i < tags.length - 1 && <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>}
            </span>
          ))}
          <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
          <span>{item ? item.size : '—'}</span>
          <span style={{ margin: '0 8px', opacity: 0.5 }}>·</span>
          <span>v{item ? item.version : '—'}</span>
        </div>
      </div>

      {checking ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 40px' }}>
          <span
            style={{
              width: '18px',
              height: '18px',
              border: '2px solid var(--border)',
              borderTopColor: accent,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ fontSize: '15px', color: 'var(--text-muted)' }}>检查可用性...</span>
        </div>
      ) : item ? (
        <button
          onClick={onClick}
          disabled={downloading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 40px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, ${accent}, ${accent === 'var(--accent)' ? '#1a6fe8' : '#7c3aed'})`,
            color: '#fff',
            fontSize: '16px',
            fontWeight: 600,
            transition: 'all 0.2s',
            boxShadow: `0 0 30px ${accentGlow}`,
            opacity: downloading ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!downloading) {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = `0 4px 40px ${accentGlow}`
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = `0 0 30px ${accentGlow}`
          }}
        >
          {downloading ? (
            <>
              <span
                style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              下载已开始...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              立即下载
            </>
          )}
        </button>
      ) : (
        <div
          style={{
            padding: '14px 40px',
            borderRadius: '12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            fontSize: '15px',
            color: 'var(--text-muted)',
          }}
        >
          暂无可下载的安装包
        </div>
      )}

      {/* 特性标签 */}
      {item && (
        <div
          style={{
            display: 'flex',
            gap: '16px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {features.map((f) => (
            <span key={f} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              ✅ {f}
            </span>
          ))}
        </div>
      )}

      {item && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          更新日期：{item.updatedAt}
        </div>
      )}
    </div>
  )
}
