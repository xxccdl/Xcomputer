import { type ReactElement } from 'react'

interface MobileFeature {
  icon: string
  title: string
  desc: string
  color: string
}

const mobileFeatures: MobileFeature[] = [
  {
    icon: '👆',
    title: 'UI 自动化',
    desc: '截屏、点击、输入、滑动 — AI 像真人一样操控你的手机界面。',
    color: 'var(--accent)',
  },
  {
    icon: '📦',
    title: 'App 管理',
    desc: '一句话打开、切换或关闭应用，支持微信、抖音、浏览器等所有 App。',
    color: 'var(--accent-2)',
  },
  {
    icon: '📷',
    title: '硬件能力',
    desc: '调用 GPS、拍照、短信、通知等系统能力，扩展 AI 的触达范围。',
    color: 'var(--accent-3)',
  },
  {
    icon: '🛡️',
    title: '被动监控',
    desc: '手机端只显示 AI 操作日志，你始终掌握发生了什么，安全可控。',
    color: 'var(--success)',
  },
]

export default function MobileShowcase(): ReactElement {
  return (
    <section
      id="mobile"
      style={{
        padding: '120px 0',
        position: 'relative',
        overflow: 'hidden',
        background:
          'linear-gradient(180deg, var(--bg) 0%, rgba(13, 17, 23, 0.6) 50%, var(--bg) 100%)',
      }}
    >
      {/* 背景光效 */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          right: '-10%',
          width: '600px',
          height: '600px',
          background:
            'radial-gradient(circle, rgba(163, 113, 247, 0.1) 0%, transparent 70%)',
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
        {/* 左侧：手机 Mockup */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            animation: 'fadeInUp 1s ease both',
          }}
        >
          <PhoneMockup />
        </div>

        {/* 右侧：文案 + 功能 */}
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              background: 'rgba(163, 113, 247, 0.1)',
              border: '1px solid rgba(163, 113, 247, 0.3)',
              fontSize: '13px',
              color: 'var(--accent-3)',
              marginBottom: '24px',
              fontFamily: 'var(--font-mono)',
              animation: 'fadeIn 0.6s ease',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--accent-3)',
                animation: 'blink 2s infinite',
              }}
            />
            xphoneai · ANDROID APP
          </div>

          <h2
            style={{
              fontSize: '44px',
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: '-1.5px',
              marginBottom: '20px',
              animation: 'fadeInUp 0.8s ease',
            }}
          >
            一句话，
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg, var(--accent-3), var(--accent))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              让 AI 操控你的手机
            </span>
          </h2>

          <p
            style={{
              fontSize: '17px',
              color: 'var(--text-secondary)',
              marginBottom: '36px',
              maxWidth: '480px',
              lineHeight: 1.7,
              animation: 'fadeInUp 0.8s ease 0.1s both',
            }}
          >
            xphoneai 是 Xcomputer 的手机搭档。在电脑端用自然语言下指令，
            AI 就能截屏、点击、打开 App — 跨端协同，让自动化无处不在。
          </p>

          {/* 功能列表 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px',
              animation: 'fadeInUp 0.8s ease 0.2s both',
            }}
          >
            {mobileFeatures.map((f) => (
              <div
                key={f.title}
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = f.color
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>{f.icon}</div>
                <h3
                  style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    marginBottom: '6px',
                    color: 'var(--text)',
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>

          {/* 配对流程提示 */}
          <div
            style={{
              marginTop: '32px',
              padding: '16px 20px',
              borderRadius: '12px',
              background: 'rgba(47, 129, 247, 0.05)',
              border: '1px dashed rgba(47, 129, 247, 0.3)',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              animation: 'fadeInUp 0.8s ease 0.3s both',
            }}
          >
            <strong style={{ color: 'var(--accent)' }}>配对流程：</strong>
            电脑端启动手机远程服务 → 手机安装 xphoneai → 输入 6 位配对码 → 开始用 AI 操控手机
          </div>
        </div>
      </div>
    </section>
  )
}

/** 手机外框 Mockup，展示 xphoneai 监控界面 */
function PhoneMockup(): ReactElement {
  return (
    <div
      style={{
        position: 'relative',
        width: '280px',
        height: '560px',
        borderRadius: '40px',
        background: 'linear-gradient(145deg, #1a1f2e, #0d1117)',
        border: '2px solid var(--border-light)',
        padding: '12px',
        boxShadow:
          '0 30px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(163, 113, 247, 0.15), inset 0 0 0 2px rgba(255, 255, 255, 0.03)',
        animation: 'float 6s ease-in-out infinite',
      }}
    >
      {/* 屏幕区域 */}
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '30px',
          background: 'var(--bg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* 顶部刘海 */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80px',
            height: '18px',
            borderRadius: '12px',
            background: '#000',
            zIndex: 2,
          }}
        />

        {/* 状态栏 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 20px 8px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>9:41</span>
          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{ color: 'var(--success)' }}>●</span> 已连接
          </span>
        </div>

        {/* App 标题 */}
        <div
          style={{
            padding: '16px 20px 12px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, var(--accent-3), var(--accent))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
              }}
            >
              📱
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                xphoneai
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                AI 正在监控
              </div>
            </div>
          </div>
        </div>

        {/* AI 操作日志 */}
        <div
          style={{
            flex: 1,
            padding: '12px 16px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {[
            { type: 'command', text: '截取手机屏幕', time: '14:32' },
            { type: 'result', text: '✅ 截图成功 (1080×2400)', time: '14:32' },
            { type: 'command', text: '打开微信', time: '14:33' },
            { type: 'result', text: '✅ 微信已启动', time: '14:33' },
            { type: 'command', text: '点击"通讯录"', time: '14:34' },
            { type: 'result', text: '✅ 已切换到通讯录', time: '14:34' },
          ].map((log, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
                animation: `fadeInUp 0.4s ease ${0.5 + i * 0.15}s both`,
              }}
            >
              <span
                style={{
                  fontSize: '9px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                  marginTop: '2px',
                  background:
                    log.type === 'command'
                      ? 'rgba(47, 129, 247, 0.15)'
                      : 'rgba(63, 185, 80, 0.15)',
                  color: log.type === 'command' ? 'var(--accent)' : 'var(--success)',
                }}
              >
                {log.time}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: log.type === 'command' ? 'var(--text)' : 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                {log.text}
              </span>
            </div>
          ))}
        </div>

        {/* 底部状态 */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              padding: '8px 24px',
              borderRadius: '8px',
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid rgba(248, 81, 73, 0.3)',
              fontSize: '11px',
              color: 'var(--danger)',
              fontWeight: 500,
            }}
          >
            断开连接
          </div>
        </div>
      </div>
    </div>
  )
}
