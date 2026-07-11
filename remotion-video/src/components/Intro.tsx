import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from 'remotion'
import { SharedBackground } from './SharedBackground'
import { LogoIcon } from './Icons'
import { useBeat, useBeatScale, useBeatGlow } from '../hooks/useBeat'

export const Intro: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const beatScale = useBeatScale(130, 0.008)
  const beatGlow = useBeatGlow(130, 0.08)

  // 镜头推进：从远景缓推到正常
  const cameraScale = interpolate(frame, [0, durationInFrames], [1.12, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })

  // Logo 弹性入场
  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  })
  const logoScale = interpolate(logoSpring, [0, 1], [0, 1])
  const logoRotate = interpolate(logoSpring, [0, 1], [-160, 0])

  // 标题入场
  const titleSpring = spring({
    frame: frame - 30,
    fps,
    config: { damping: 14, stiffness: 90 },
  })
  const titleOpacity = interpolate(titleSpring, [0, 1], [0, 1])
  const titleScale = interpolate(titleSpring, [0, 1], [0.8, 1])
  const titleY = interpolate(titleSpring, [0, 1], [30, 0])

  // 副标题入场
  const subtitleSpring = spring({
    frame: frame - 50,
    fps,
    config: { damping: 16, stiffness: 70 },
  })
  const subtitleOpacity = interpolate(subtitleSpring, [0, 1], [0, 1])
  const subtitleY = interpolate(subtitleSpring, [0, 1], [20, 0])

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
        {/* Logo */}
        <div
          style={{
            opacity: logoSpring,
            transform: `scale(${logoScale * (1 + beatScale)}) rotate(${logoRotate}deg)`,
            marginBottom: 36,
            padding: 22,
            borderRadius: 28,
            background: 'rgba(22,27,34,0.5)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: `0 8px 32px rgba(47,129,247,${0.15 + beatGlow}), inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}
        >
          <LogoIcon size={100} />
        </div>

        {/* 标题 */}
        <div
          style={{
            opacity: titleOpacity,
            transform: `translateY(${titleY}px) scale(${titleScale * (1 + beatScale)})`,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: 84,
              fontWeight: 800,
              letterSpacing: -3,
              margin: 0,
              background: 'linear-gradient(135deg, #2f81f7 0%, #a371f7 100%)',
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
            marginTop: 18,
          }}
        >
          <p
            style={{
              fontSize: 24,
              color: '#8b949e',
              margin: 0,
              letterSpacing: 6,
              fontWeight: 300,
            }}
          >
            一句话，让 AI 操控你的电脑
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
