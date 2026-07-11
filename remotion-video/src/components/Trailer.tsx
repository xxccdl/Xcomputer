import { AbsoluteFill, Sequence, Audio, interpolate, useCurrentFrame, random } from 'remotion'
import { staticFile } from 'remotion'
import { Intro } from './Intro'
import { PainPoint } from './PainPoint'
import { Solution } from './Solution'
import { FeatureShowcase } from './FeatureShowcase'
import { Outro } from './Outro'

const TOTAL_FRAMES = 828
const FADE_IN_FRAMES = 30 // 1 秒淡入
const FADE_OUT_FRAMES = 45 // 1.5 秒淡出
const BGM_VOLUME = 0.7
const TRANSITION = 18 // 场景交叉淡化帧数

/**
 * 场景入场淡入 wrapper —— 让相邻场景重叠时形成交叉淡化
 */
const FadeIn: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
}

/**
 * 全局环境粒子层 —— 贯穿整个视频的淡色流动粒子，提供视觉连贯性
 */
const AmbientLayer: React.FC = () => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 25 }).map((_, i) => {
        const seed = random(i + 500)
        const seed2 = random(i + 600)
        const seed3 = random(i + 700)

        // 缓慢漂移
        const x = (seed * 1920 + Math.sin(frame * 0.008 + seed3 * 6) * 80) % 1920
        const y = (seed2 * 1080 + frame * (0.3 + seed3 * 0.4) * (seed2 > 0.5 ? 1 : -1)) % 1080
        const yFinal = y < 0 ? y + 1080 : y

        const opacity = interpolate(
          frame,
          [0, 60, TOTAL_FRAMES - 60, TOTAL_FRAMES],
          [0, 0.25 + seed * 0.2, 0.25 + seed * 0.2, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        )

        const size = 1.5 + seed3 * 2.5
        const colors = ['#2f81f7', '#a371f7', '#58a6ff']
        const color = colors[Math.floor(seed2 * colors.length)]

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: yFinal,
              width: size,
              height: size,
              borderRadius: '50%',
              background: color,
              opacity,
              boxShadow: `0 0 ${size * 6}px ${color}`,
            }}
          />
        )
      })}
    </AbsoluteFill>
  )
}

export const Trailer: React.FC = () => {
  const frame = useCurrentFrame()

  // BGM 音量曲线：淡入 → 满音量 → 淡出
  const bgmVolume = interpolate(
    frame,
    [0, FADE_IN_FRAMES, TOTAL_FRAMES - FADE_OUT_FRAMES, TOTAL_FRAMES],
    [0, BGM_VOLUME, BGM_VOLUME, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0e14' }}>
      {/* 动感背景音乐（Sports Highlights - Hard Rock 风格，Mixkit 免费授权） */}
      <Audio src={staticFile('bgm.mp3')} volume={bgmVolume} />

      {/* 全局环境粒子层 —— 贯穿始终的视觉线索 */}
      <AmbientLayer />

      {/* 场景序列：相邻场景重叠 18 帧交叉淡化 */}
      <Sequence from={0} durationInFrames={120}>
        <Intro />
      </Sequence>

      <Sequence from={102} durationInFrames={150}>
        <FadeIn duration={TRANSITION}>
          <PainPoint />
        </FadeIn>
      </Sequence>

      <Sequence from={234} durationInFrames={120}>
        <FadeIn duration={TRANSITION}>
          <Solution />
        </FadeIn>
      </Sequence>

      <Sequence from={336} durationInFrames={330}>
        <FadeIn duration={TRANSITION}>
          <FeatureShowcase />
        </FadeIn>
      </Sequence>

      <Sequence from={648} durationInFrames={180}>
        <FadeIn duration={TRANSITION}>
          <Outro />
        </FadeIn>
      </Sequence>
    </AbsoluteFill>
  )
}
