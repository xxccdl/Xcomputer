import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, random } from 'remotion'
import { SharedBackground, glassCard } from './SharedBackground'
import { LogoIcon, DownloadIcon } from './Icons'
import { useBeat, useBeatScale, useBeatGlow } from '../hooks/useBeat'

export const Outro: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const beat = useBeat()
  const beatScale = useBeatScale(130, 0.006)
  const beatGlow = useBeatGlow(130, 0.08)

  // 镜头缓慢收束
  const cameraScale = interpolate(frame, [0, durationInFrames], [1.05, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })

  // Logo
  const logoSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  })
  const logoScale = interpolate(logoSpring, [0, 1], [0, 1])
  const logoOpacity = interpolate(logoSpring, [0, 1], [0, 1])

  // 标题
  const titleSpring = spring({
    frame: frame - 25,
    fps,
    config: { damping: 14, stiffness: 90 },
  })
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1])
  const titleScale = interpolate(titleSpring, [0, 1], [0.85, 1])

  // 副标题
  const subtitleSpring = spring({
    frame: frame - 45,
    fps,
    config: { damping: 16, stiffness: 70 },
  })
  const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1])
  const subtitleY = interpolate(subtitleSpring, [0, 1], [20, 0])

  // 下载按钮
  const btnSpring = spring({
    frame: frame - 60,
    fps,
    config: { damping: 10, stiffness: 100, mass: 0.6 },
  })
  const btnOpacity = interpolate(btnSpring, [0, 1], [0, 1])
  const btnScale = interpolate(btnSpring, [0, 1], [0.7, 1])
  const pulseScale = 1 + beat * 0.02

  // 网址
  const urlSpring = spring({
    frame: frame - 80,
    fps,
    config: { damping: 16, stiffness: 60 },
  })
  const urlOpacity = interpolate(urlSpring, [0, 1], [0, 1])
  const urlY = interpolate(urlSpring, [0, 1], [15, 0])

  // 底部标签
  const tagSpring = spring({
    frame: frame - 95,
    fps,
    config: { damping: 14, stiffness: 70 },
  })
  const tagOpacity = interpolate(tagSpring, [0, 1], [0, 1])

  // 最终淡出
  const finalOpacity = interpolate(frame, [durationInFrames - 30, durationInFrames], [1, 0], {
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
          opacity: finalOpacity,
        }}
      >
        {/* Logo */}
        <div
          style={{
            opacity: logoOpacity,
            transform: `scale(${logoScale * (1 + beatScale)})`,
            marginBottom: 28,
            padding: 20,
            borderRadius: 28,
            background: 'rgba(22,27,34,0.5)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: `0 8px 32px rgba(47,129,247,${0.15 + beatGlow}), inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}
        >
          <LogoIcon size={90} />
        </div>

        {/* 标题 */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `scale(${titleScale * (1 + beatScale)})`,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 78,
              fontWeight: 800,
              letterSpacing: -3,
              margin: 0,
              background: 'linear-gradient(135deg, #2f81f7, #a371f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: `drop-shadow(0 0 ${24 + beatGlow * 30}px rgba(47,129,247,0.35))`,
            }}
          >
            Xcomputer
          </h1>
        </div>

        {/* 副标题 */}
        <div
          style={{
            opacity: subtitleOpacity,
            transform: `translateY(${subtitleY}px)`,
            marginTop: 12,
          }}
        >
          <p
            style={{
              fontSize: 22,
              color: '#8b949e',
              margin: 0,
              letterSpacing: 4,
              fontWeight: 300,
            }}
          >
            你的 AI 电脑管家
          </p>
        </div>

        {/* 下载按钮 */}
        <div
          style={{
            opacity: btnOpacity,
            transform: `scale(${btnScale * pulseScale})`,
            marginTop: 45,
          }}
        >
          <div
            style={{
              padding: '18px 52px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, #2f81f7, #1a6fe8)',
              boxShadow: `0 8px 40px rgba(47,129,247,${0.3 + beatGlow}), inset 0 1px 0 rgba(255,255,255,0.2)`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <DownloadIcon size={26} color="white" />
            <span style={{ fontSize: 26, fontWeight: 700, color: 'white' }}>立即下载</span>
          </div>
        </div>

        {/* 网址 */}
        <div
          style={{
            opacity: urlOpacity,
            transform: `translateY(${urlY}px)`,
            marginTop: 30,
          }}
        >
          <p
            style={{
              fontSize: 20,
              color: '#8b949e',
              fontFamily: 'monospace',
              margin: 0,
              letterSpacing: 1,
            }}
          >
            xxccdl.cn
          </p>
        </div>

        {/* 底部标签 */}
        <div
          style={{
            opacity: tagOpacity,
            position: 'absolute',
            bottom: 55,
            display: 'flex',
            gap: 18,
          }}
        >
          {['免费', '开箱即用', '无需 Python'].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 14,
                color: '#3fb950',
                padding: '8px 18px',
                borderRadius: 20,
                background: 'rgba(63,185,80,0.08)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(63,185,80,0.15)',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
