import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion'
import { SharedBackground, glassCard } from './SharedBackground'
import { BrainIcon, DesktopIcon, MemoryIcon, AgentsIcon, SkillsIcon, ShieldIcon } from './Icons'
import { useBeat, useBeatScale, useBeatGlow } from '../hooks/useBeat'

const features = [
  { Icon: BrainIcon, title: '深度思考', desc: 'AI 推理过程可视化', color: '#a371f7' },
  { Icon: DesktopIcon, title: '桌面自动化', desc: '打开应用 · 文件操作 · 系统管理', color: '#2f81f7' },
  { Icon: MemoryIcon, title: '记忆系统', desc: '记住你的偏好与习惯', color: '#3fb950' },
  { Icon: AgentsIcon, title: '子代理协作', desc: '多任务并行处理', color: '#f0883e' },
  { Icon: SkillsIcon, title: '技能系统', desc: '自定义 AI 能力扩展', color: '#f778ba' },
  { Icon: ShieldIcon, title: '安全确认', desc: '高风险操作需你授权', color: '#58a6ff' },
]

export const FeatureShowcase: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const beat = useBeat()
  const beatScale = useBeatScale(130, 0.004)
  const beatGlow = useBeatGlow(130, 0.06)

  // 镜头缓慢推进
  const cameraScale = interpolate(frame, [0, durationInFrames], [1, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })

  // 标题入场
  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
  })
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1])
  const titleY = interpolate(titleSpring, [0, 1], [20, 0])

  // 退出
  const exitOpacity = interpolate(frame, [durationInFrames - 24, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <SharedBackground accent="purple" />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${cameraScale})`,
          opacity: exitOpacity,
        }}
      >
        {/* 标题 */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px) scale(${1 + beatScale})`,
            marginBottom: 55,
          }}
        >
          <h2
            style={{
              fontSize: 58,
              fontWeight: 800,
              color: '#c9d1d9',
              margin: 0,
              letterSpacing: -2,
            }}
          >
            强大能力，{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #2f81f7, #a371f7)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              尽在掌握
            </span>
          </h2>
        </div>

        {/* 功能网格 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 22,
            maxWidth: 1100,
          }}
        >
          {features.map((f, i) => {
            const delay = 18 + i * 10
            const cardSpring = spring({
              frame: frame - delay,
              fps,
              config: { damping: 12, stiffness: 80, mass: 0.7 },
            })
            const opacity = interpolate(cardSpring, [0, 1], [0, 1])
            const scale = interpolate(cardSpring, [0, 1], [0.88, 1])
            const y = interpolate(cardSpring, [0, 1], [40, 0])

            // 高亮脉冲 —— 按节拍依次高亮
            const beatCycle = Math.floor(frame / 56) % features.length
            const isHighlighting = beatCycle === i
            const highlightBoost = isHighlighting ? beat : 0

            return (
              <div
                key={i}
                style={{
                  opacity,
                  transform: `translateY(${y}px) scale(${scale * (1 + beatScale * 0.3 + highlightBoost * 0.02)})`,
                  padding: '30px 26px',
                  ...glassCard(f.color, isHighlighting ? '18' : '08'),
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: `${f.color}15`,
                  }}
                >
                  <f.Icon size={28} color={f.color} />
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: f.color,
                  }}
                >
                  {f.title}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: '#8b949e',
                    textAlign: 'center',
                    lineHeight: 1.5,
                  }}
                >
                  {f.desc}
                </div>
              </div>
            )
          })}
        </div>

        {/* 底部统计 */}
        {(() => {
          const statsSpring = spring({
            frame: frame - 220,
            fps,
            config: { damping: 14, stiffness: 70 },
          })
          const statsOpacity = interpolate(statsSpring, [0, 1], [0, 1])
          const statsY = interpolate(statsSpring, [0, 1], [30, 0])

          return (
            <div
              style={{
                opacity: statsOpacity,
                transform: `translateY(${statsY}px)`,
                marginTop: 45,
                display: 'flex',
                gap: 70,
              }}
            >
              {[
                { num: '50+', label: 'MCP 工具' },
                { num: '1000', label: '最大循环' },
                { num: '0', label: '代码门槛' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 40,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #2f81f7, #a371f7)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    {s.num}
                  </div>
                  <div style={{ fontSize: 14, color: '#8b949e', marginTop: 4, letterSpacing: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )
        })()}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
