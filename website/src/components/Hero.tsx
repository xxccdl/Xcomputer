import { useEffect, useState, type ReactElement } from 'react'

const chatDemo = [
  { role: 'user', text: '帮我打开 Chrome 并搜索今天的新闻' },
  { role: 'ai', text: '正在为你执行...\n✅ 已打开 Chrome\n✅ 已搜索"今天的新闻"\n✅ 找到 15 条相关结果' },
  { role: 'user', text: '截图保存到桌面' },
  { role: 'ai', text: '✅ 已截图并保存到桌面 screenshot_001.png' },
]

interface ManifestInfo {
  desktop: { version: string }
}

export default function Hero(): ReactElement {
  const [visibleLines, setVisibleLines] = useState(0)
  const [version, setVersion] = useState<string>('')

  // 从 manifest.json 动态获取版本号
  useEffect(() => {
    fetch('/download/manifest.json')
      .then((res) => {
        if (!res.ok) throw new Error('manifest not found')
        return res.json()
      })
      .then((data: ManifestInfo) => {
        if (data?.desktop?.version) setVersion(data.desktop.version)
      })
      .catch(() => {
        // 静默失败，版本号不显示也不影响页面
      })
  }, [])

  useEffect(() => {
    if (visibleLines >= chatDemo.length) return
    const timer = setTimeout(() => {
      setVisibleLines((prev) => prev + 1)
    }, 800)
    return () => clearTimeout(timer)
  }, [visibleLines])

  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        paddingTop: '64px',
      }}
    >
      {/* 背景效果 */}
      <div
        style={{
          position: 'absolute',
          top: '0',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '800px',
          height: '800px',
          background:
            'radial-gradient(circle, rgba(47, 129, 247, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* 网格背景 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(47, 129, 247, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(47, 129, 247, 0.03) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="container"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '60px',
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* 左侧文案 */}
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              background: 'rgba(47, 129, 247, 0.1)',
              border: '1px solid rgba(47, 129, 247, 0.3)',
              fontSize: '13px',
              color: 'var(--accent)',
              marginBottom: '24px',
              animation: 'fadeIn 0.6s ease',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--accent-2)',
                animation: 'blink 2s infinite',
              }}
            />
            v{version || '...'} 已发布
          </div>

          <h1
            style={{
              fontSize: '56px',
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-2px',
              marginBottom: '20px',
              animation: 'fadeInUp 0.8s ease',
            }}
          >
            用自然语言
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-3))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              操控你的电脑
            </span>
          </h1>

          <p
            style={{
              fontSize: '18px',
              color: 'var(--text-secondary)',
              marginBottom: '36px',
              maxWidth: '480px',
              animation: 'fadeInUp 0.8s ease 0.1s both',
            }}
          >
            Xcomputer 是一款 AI 驱动的 Windows 桌面自动化助手。
            告诉它你想做什么，它就会帮你完成 — 打开应用、管理文件、执行命令，一切只需一句话。无需 API Key，开箱即用。
          </p>

          <div
            style={{
              display: 'flex',
              gap: '16px',
              animation: 'fadeInUp 0.8s ease 0.2s both',
            }}
          >
            <a
              href="#download"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 32px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, var(--accent), #1a6fe8)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 600,
                transition: 'all 0.2s',
                boxShadow: '0 0 30px var(--accent-glow)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 40px var(--accent-glow)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 0 30px var(--accent-glow)'
              }}
            >
              <DownloadIcon />
              免费下载
            </a>
            <a
              href="#how"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                borderRadius: '10px',
                border: '1px solid var(--border-light)',
                color: 'var(--text)',
                fontSize: '16px',
                fontWeight: 500,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.background = 'rgba(47, 129, 247, 0.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-light)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              了解更多 →
            </a>
          </div>

          {/* 技术栈标签 */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '40px',
              animation: 'fadeInUp 0.8s ease 0.3s both',
            }}
          >
            {['Electron', 'DeepSeek AI', 'MCP', 'TypeScript'].map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 右侧 Demo 对话 */}
        <div
          style={{
            animation: 'fadeInUp 1s ease 0.4s both',
          }}
        >
          <div
            style={{
              borderRadius: '16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* 窗口标题栏 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
              }}
            >
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f57' }} />
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#febc2e' }} />
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#28c840' }} />
              <span
                style={{
                  marginLeft: '8px',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                Xcomputer
              </span>
            </div>

            {/* 对话内容 */}
            <div style={{ padding: '20px', minHeight: '360px' }}>
              {chatDemo.slice(0, visibleLines).map((line, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: '16px',
                    animation: 'fadeInUp 0.4s ease',
                    display: 'flex',
                    gap: '12px',
                    flexDirection: line.role === 'user' ? 'row-reverse' : 'row',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 600,
                      background:
                        line.role === 'user'
                          ? 'var(--bg-elevated)'
                          : 'linear-gradient(135deg, var(--accent), var(--accent-3))',
                      color: '#fff',
                    }}
                  >
                    {line.role === 'user' ? '你' : 'AI'}
                  </div>
                  <div
                    style={{
                      maxWidth: '75%',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      fontSize: '14px',
                      whiteSpace: 'pre-wrap',
                      background:
                        line.role === 'user'
                          ? 'linear-gradient(135deg, var(--accent), #1a6fe8)'
                          : 'var(--bg-elevated)',
                      color: line.role === 'user' ? '#fff' : 'var(--text)',
                      border: line.role === 'user' ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    {line.text}
                  </div>
                </div>
              ))}
              {visibleLines < chatDemo.length && (
                <div style={{ display: 'flex', gap: '4px', padding: '8px 0' }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        animation: `blink 1.4s ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DownloadIcon(): ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
