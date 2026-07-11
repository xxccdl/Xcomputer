export default function Showcase() {
  return (
    <section id="showcase" style={{ padding: '120px 0', position: 'relative' }}>
      <div className="container">
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 14px',
              borderRadius: '20px',
              background: 'rgba(0, 212, 170, 0.1)',
              border: '1px solid rgba(0, 212, 170, 0.3)',
              fontSize: '13px',
              color: 'var(--accent-2)',
              marginBottom: '16px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            SHOWCASE
          </span>
          <h2
            style={{
              fontSize: '40px',
              fontWeight: 700,
              letterSpacing: '-1px',
              marginBottom: '12px',
            }}
          >
            三栏 IDE 风格界面
          </h2>
          <p style={{ fontSize: '17px', color: 'var(--text-secondary)' }}>
            专为效率而生的暗色主题设计
          </p>
        </div>

        {/* 模拟应用界面 */}
        <div
          style={{
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            boxShadow: '0 30px 80px rgba(0, 0, 0, 0.5)',
            background: 'var(--bg-card)',
            animation: 'fadeInUp 0.8s ease',
          }}
        >
          {/* 标题栏 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f57' }} />
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#febc2e' }} />
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#28c840' }} />
            <div
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'center',
                gap: '16px',
              }}
            >
              {['会话', '聊天', '操作详情'].map((tab, i) => (
                <span
                  key={tab}
                  style={{
                    fontSize: '12px',
                    color: i === 1 ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: i === 1 ? 600 : 400,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>

          {/* 三栏内容 */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 240px', minHeight: '400px' }}>
            {/* 左栏：会话列表 */}
            <div
              style={{
                borderRight: '1px solid var(--border)',
                padding: '12px 8px',
                background: 'var(--bg-card)',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(47, 129, 247, 0.1)',
                  border: '1px solid rgba(47, 129, 247, 0.3)',
                  fontSize: '13px',
                  color: 'var(--accent)',
                  marginBottom: '8px',
                  textAlign: 'center',
                  fontWeight: 500,
                }}
              >
                + 新建会话
              </div>
              {[
                { title: '整理桌面文件', active: true },
                { title: '搜索 AI 新闻', active: false },
                { title: '配置开发环境', active: false },
                { title: '截图并保存', active: false },
              ].map((s) => (
                <div
                  key={s.title}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: s.active ? 'var(--text)' : 'var(--text-muted)',
                    background: s.active ? 'var(--bg-elevated)' : 'transparent',
                    marginBottom: '2px',
                    borderLeft: s.active ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  {s.title}
                </div>
              ))}
            </div>

            {/* 中栏：聊天 */}
            <div
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* AI 消息 */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-3))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  AI
                </div>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    color: 'var(--text)',
                    maxWidth: '80%',
                  }}
                >
                  你好！我是 Xcomputer，可以帮你操控电脑。试试说「帮我打开计算器」
                </div>
              </div>

              {/* 用户消息 */}
              <div style={{ display: 'flex', gap: '10px', flexDirection: 'row-reverse' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  你
                </div>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, var(--accent), #1a6fe8)',
                    fontSize: '13px',
                    color: '#fff',
                    maxWidth: '80%',
                  }}
                >
                  帮我打开计算器
                </div>
              </div>

              {/* AI 执行中 */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, var(--accent), var(--accent-3))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  AI
                </div>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    maxWidth: '80%',
                  }}
                >
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          animation: `blink 1.4s ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  正在打开计算器...
                </div>
              </div>

              {/* 输入框 */}
              <div style={{ marginTop: 'auto' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', flex: 1 }}>
                    输入你的指令...
                  </span>
                  <span
                    style={{
                      padding: '2px 10px',
                      borderRadius: '6px',
                      background: 'var(--accent)',
                      fontSize: '12px',
                      color: '#fff',
                      fontWeight: 500,
                    }}
                  >
                    发送
                  </span>
                </div>
              </div>
            </div>

            {/* 右栏：操作详情 */}
            <div
              style={{
                borderLeft: '1px solid var(--border)',
                padding: '16px 12px',
                background: 'var(--bg-card)',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: 'var(--text-muted)',
                  marginBottom: '12px',
                }}
              >
                操作步骤
              </div>
              {[
                { icon: '✅', text: '理解用户意图', status: 'done' },
                { icon: '✅', text: '调用 App 工具', status: 'done' },
                { icon: '🔄', text: '打开计算器', status: 'running' },
                { icon: '⏳', text: '验证窗口已打开', status: 'pending' },
              ].map((step, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 0',
                    fontSize: '12px',
                    color: step.status === 'pending' ? 'var(--text-muted)' : 'var(--text-secondary)',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{step.icon}</span>
                  <span>{step.text}</span>
                </div>
              ))}

              {/* TodoList 进度 */}
              <div
                style={{
                  marginTop: '20px',
                  padding: '10px',
                  borderRadius: '8px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  📋 任务进度
                </div>
                <div
                  style={{
                    height: '4px',
                    borderRadius: '2px',
                    background: 'var(--border)',
                    overflow: 'hidden',
                    marginBottom: '8px',
                  }}
                >
                  <div
                    style={{
                      width: '50%',
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
                      borderRadius: '2px',
                    }}
                  />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>2/4 已完成</div>
              </div>
            </div>
          </div>
        </div>

        {/* 底部特性标签 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '32px',
            marginTop: '48px',
            flexWrap: 'wrap',
          }}
        >
          {[
            { label: 'GitHub 暗色主题', icon: '🎨' },
            { label: '响应式三栏布局', icon: '📐' },
            { label: '实时操作反馈', icon: '⚡' },
            { label: 'TodoList 进度追踪', icon: '📋' },
            { label: '子代理状态监控', icon: '🤖' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                color: 'var(--text-secondary)',
              }}
            >
              <span>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
