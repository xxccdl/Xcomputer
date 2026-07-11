import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion'
import { SharedBackground, glassCard } from './SharedBackground'
import { MouseIcon, ClipboardIcon, ClockIcon, SearchLostIcon } from './Icons'
import { useBeat, useBeatScale, useBeatGlow } from '../hooks/useBeat'

const painPoints = [
  { Icon: MouseIcon, text: '反复点击，繁琐操作' },
  { Icon: ClipboardIcon, text: '复制粘贴，来回切换' },
  { Icon: ClockIcon, text: '重复任务，浪费时间' },
  { Icon: SearchLostIcon, text: '记不住路径，找不到文件' },
]

export const PainPoint: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const beat = useBeat()
  const beatScale = useBeatScale(130, 0.005)
  const beatGlow = useBeatGlow(130, 0.06)

  // 镜头从左侧平移到中心
  const cameraX = interpolate(frame, [0, durationInFrames], [60, 0], {
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
  const titleY = interpolate(titleSpring, [0, 1], [30, 0])

  // 退出
  const exitOpacity = interpolate(frame, [durationInFrames - 24, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <SharedBackground accent="red" />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateX(${cameraX}px)`,
          opacity: exitOpacity,
        }}
      >
        {/* 标题 */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
            marginBottom: 70,
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: '#f85149',
              margin: 0,
              letterSpacing: -2,
              textShadow: `0 0 ${40 + beatGlow * 30}px rgba(248,81,73,0.35)`,
            }}
          >
            还在这样用电脑？
          </h2>
        </div>

        {/* 痛点列表 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: 620 }}>
          {painPoints.map((p, i) => {
            const delay = 20 + i * 16
            const cardSpring = spring({
              frame: frame - delay,
              fps,
              config: { damping: 12, stiffness: 80, mass: 0.8 },
            })
            const opacity = interpolate(cardSpring, [0, 1], [0, 1])
            const x = interpolate(cardSpring, [0, 1], [-60, 0])
            const scale = interpolate(cardSpring, [0, 1], [0.92, 1])

            return (
              <div
                key={i}
                style={{
                  opacity,
                  transform: `translateX(${x}px) scale(${scale * (1 + beatScale)})`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  padding: '20px 32px',
                  ...glassCard('#f85149', '08'),
                  borderColor: `rgba(248,81,73,${0.1 + beatGlow * 0.15})`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44 }}>
                  <p.Icon size={28} color="#f85149" />
                </div>
                <span style={{ fontSize: 24, color: '#c9d1d9', fontWeight: 500 }}>{p.text}</span>
              </div>
            )
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
