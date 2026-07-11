const steps = [
  {
    num: '01',
    title: '输入你的需求',
    desc: '用自然语言描述你想做的事情。比如「帮我整理桌面文件」或「打开浏览器搜索 AI 最新进展」。',
    code: '> 帮我把桌面的截图按日期归类到文件夹',
  },
  {
    num: '02',
    title: 'AI 理解并规划',
    desc: 'DeepSeek AI 模型理解你的意图，自动拆解任务步骤，选择合适的工具进行执行。限免模式无需自备 API Key。',
    code: '🤔 思考中...\n→ 扫描桌面文件\n→ 识别截图文件\n→ 按日期创建文件夹\n→ 移动文件',
  },
  {
    num: '03',
    title: '自动执行操作',
    desc: '通过 MCP 协议操控 Windows 桌面，自动完成点击、输入、文件管理等操作。高危操作需你确认。',
    code: '✅ 扫描到 12 个截图\n✅ 创建文件夹: 2026-06\n✅ 移动 8 个文件\n⏳ 确认: 移动剩余 4 个文件？',
  },
  {
    num: '04',
    title: '结果反馈与记忆',
    desc: '执行完成后汇报结果，并自动记忆你的操作习惯，下次更高效。',
    code: '✅ 完成！已归类 12 个截图\n💾 已记忆: 用户偏好按月归档截图',
  },
]

export default function HowItWorks() {
  return (
    <section
      id="how"
      style={{
        padding: '120px 0',
        background: 'var(--bg-card)',
        position: 'relative',
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* 装饰性光效 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '10%',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(163, 113, 247, 0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div className="container" style={{ position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: '20px',
              background: 'rgba(163, 113, 247, 0.1)',
              border: '1px solid rgba(163, 113, 247, 0.3)',
              fontSize: '13px',
              color: 'var(--accent-3)',
              marginBottom: '16px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            HOW IT WORKS
          </span>
          <h2
            style={{
              fontSize: '40px',
              fontWeight: 700,
              letterSpacing: '-1px',
              marginBottom: '12px',
            }}
          >
            四步开始你的 AI 自动化
          </h2>
          <p style={{ fontSize: '17px', color: 'var(--text-secondary)' }}>
            从输入到执行，全程透明可控
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {steps.map((step, i) => (
            <div
              key={step.num}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 1fr',
                gap: '32px',
                alignItems: 'center',
                animation: `fadeInUp 0.6s ease ${i * 0.1}s both`,
              }}
            >
              {/* 序号 */}
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-3))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  textAlign: 'center',
                }}
              >
                {step.num}
              </div>

              {/* 描述 */}
              <div>
                <h3
                  style={{
                    fontSize: '22px',
                    fontWeight: 600,
                    marginBottom: '8px',
                  }}
                >
                  {step.title}
                </h3>
                <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {step.desc}
                </p>
              </div>

              {/* 代码预览 */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '10px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.8,
                }}
              >
                {step.code}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
