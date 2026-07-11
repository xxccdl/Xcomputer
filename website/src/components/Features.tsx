interface Feature {
  icon: string
  title: string
  desc: string
  color: string
}

const features: Feature[] = [
  {
    icon: '💬',
    title: '自然语言交互',
    desc: '用日常语言告诉 Xcomputer 你想做什么，无需学习命令行。AI 理解你的意图并自动执行。',
    color: 'var(--accent)',
  },
  {
    icon: '🖥️',
    title: '桌面自动化',
    desc: '点击、输入、截图、窗口管理 — MCP 协议赋予 AI 操控 Windows 的完整能力。',
    color: 'var(--accent-2)',
  },
  {
    icon: '🎁',
    title: '限免模式',
    desc: '无需 API Key 即可免费使用，每日 50 次额度。内置 xskillhub 中继调用 DeepSeek，开箱即用零门槛。',
    color: 'var(--accent-3)',
  },
  {
    icon: '🧠',
    title: '长期记忆系统',
    desc: 'Xmemory 自动记住你的偏好、习惯和常用操作，越用越懂你。',
    color: 'var(--accent-3)',
  },
  {
    icon: '⚡',
    title: '子代理并行',
    desc: '复杂任务自动拆分给子代理并行处理，前台等待或后台运行，效率翻倍。',
    color: 'var(--warning)',
  },
  {
    icon: '🎯',
    title: '技能系统',
    desc: '上传自定义技能或让 AI 自动生成，按需触发，让 Xcomputer 适配你的工作流。',
    color: 'var(--danger)',
  },
  {
    icon: '⏰',
    title: '定时任务',
    desc: '设置一次性、间隔、每日或每周任务，Xcomputer 按计划自动执行。',
    color: 'var(--success)',
  },
  {
    icon: '🛡️',
    title: '安全确认机制',
    desc: '高危操作（删除、注册表、进程管理）自动弹出确认，你始终拥有最终控制权。',
    color: '#00d4aa',
  },
  {
    icon: '🔄',
    title: '自动更新检查',
    desc: '启动后自动检测新版本，应用内流式下载安装，一键升级，始终享受最新功能。',
    color: '#f0883e',
  },
  {
    icon: '🔴',
    title: '悬浮球快捷入口',
    desc: '桌面悬浮球实时显示 AI 状态，一键唤起主窗口或执行快捷操作。',
    color: '#f0883e',
  },
  {
    icon: '📱',
    title: '手机远程控制',
    desc: '安装 xphoneai 配对后，用手机发送指令远程操控电脑，随时随地执行任务。',
    color: '#a371f7',
  },
  {
    icon: '📦',
    title: '零依赖打包',
    desc: '内置 Python 运行时和 MCP 服务，下载即用，无需额外安装任何环境。',
    color: '#a371f7',
  },
]

export default function Features() {
  return (
    <section id="features" style={{ padding: '120px 0', position: 'relative' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: '20px',
              background: 'rgba(47, 129, 247, 0.1)',
              border: '1px solid rgba(47, 129, 247, 0.3)',
              fontSize: '13px',
              color: 'var(--accent)',
              marginBottom: '16px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            FEATURES
          </span>
          <h2
            style={{
              fontSize: '40px',
              fontWeight: 700,
              letterSpacing: '-1px',
              marginBottom: '12px',
            }}
          >
            强大功能，简单使用
          </h2>
          <p style={{ fontSize: '17px', color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto' }}>
            从日常操作到复杂自动化流程，Xcomputer 都能帮你搞定
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '24px',
          }}
        >
          {features.map((f, i) => (
            <div
              key={f.title}
              style={{
                padding: '28px',
                borderRadius: '14px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden',
                animation: `fadeInUp 0.6s ease ${i * 0.08}s both`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = f.color
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = `0 12px 40px rgba(0, 0, 0, 0.3)`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {/* 顶部光带 */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: `linear-gradient(90deg, transparent, ${f.color}, transparent)`,
                  opacity: 0,
                  transition: 'opacity 0.3s',
                }}
                className="feature-glow"
              />
              <div style={{ fontSize: '32px', marginBottom: '16px' }}>{f.icon}</div>
              <h3
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: 'var(--text)',
                }}
              >
                {f.title}
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
