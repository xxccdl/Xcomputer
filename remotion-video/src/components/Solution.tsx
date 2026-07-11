import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion'
import { SharedBackground, glassCard } from './SharedBackground'
import { useBeat, useBeatScale, useBeatGlow } from '../hooks/useBeat'

export const Solution: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const beat = useBeat()
  const beatScale = useBeatScale(130, 0.006)
  const beatGlow = useBeatGlow(130, 0.08)

  // 镜头轻微缩放推进
  const cameraScale = interpolate(frame, [0, durationInFrames], [1, 1.04], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })

  // 标题入场
  const titleSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.7 },
  })
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1])
  const titleScale = interpolate(titleSpring, [0, 1], [0.85, 1])

  // 命令输入框入场
  const cmdSpring = spring({
    frame: frame - 35,
    fps,
    config: { damping: 14, stiffness: 70 },
  })
  const cmdOpacity = interpolate(cmdSpring, [0, 1], [0, 1])
  const cmdY = interpolate(cmdSpring, [0, 1], [40, 0])

  // 打字效果
  const fullCommand = '帮我整理桌面文件并打开 Chrome 搜索今天的新闻'
  const typedChars = Math.floor(
    interpolate(frame, [40, 90], [0, fullCommand.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  )
  const cursorVisible = Math.floor(frame / 15) % 2 === 0

  // 提示入场
  const hintSpring = spring({
    frame: frame - 75,
    fps,
    config: { damping: 16, stiffness: 60 },
  })
  const hintOpacity = interpolate(hintSpring, [0, 1], [0, 1])
  const hintY = interpolate(hintSpring, [0, 1], [20, 0])

  // 退出
  const exitOpacity = interpolate(frame, [durationInFrames - 24, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <SharedBackground accent="blue" />

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
            transform: `scale(${titleScale * (1 + beatScale)})`,
            marginBottom: 60,
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 64,
              fontWeight: 800,
              margin: 0,
              letterSpacing: -2,
              background: 'linear-gradient(135deg, #2f81f7, #a371f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: `drop-shadow(0 0 ${24 + beatGlow * 30}px rgba(47,129,247,0.35))`,
            }}
          >
            告别繁琐，一句话搞定
          </h2>
        </div>

        {/* 命令输入框 */}
        <div
          style={{
            opacity: cmdOpacity,
            transform: `translateY(${cmdY}px) scale(${1 + beatScale * 0.4})`,
            padding: '28px 44px',
            minWidth: 780,
            ...glassCard('#2f81f7', '12'),
            borderColor: `rgba(47,129,247,${0.25 + beatGlow * 0.25})`,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', gap: 6, marginRight: 8 }}>
            {['#f85149', '#d29922', '#3fb950'].map((c) => (
              <div
                key={c}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: c,
                  opacity: 0.8 + beat * 0.15,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 28, color: '#2f81f7', fontFamily: 'monospace' }}>{'>'}</span>
          <span style={{ fontSize: 28, color: '#c9d1d9', fontFamily: 'monospace' }}>
            {fullCommand.slice(0, typedChars)}
            {cursorVisible && typedChars < fullCommand.length ? (
              <span style={{ color: '#2f81f7', fontWeight: 700 }}>|</span>
            ) : null}
          </span>
        </div>

        {/* 提示 */}
        <div
          style={{
            opacity: hintOpacity,
            transform: `translateY(${hintY}px)`,
            marginTop: 32,
          }}
        >
          <p
            style={{
              fontSize: 20,
              color: '#8b949e',
              margin: 0,
              letterSpacing: 1,
            }}
          >
            AI 自动理解意图 · 规划步骤 · 执行操作
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
