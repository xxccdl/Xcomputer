import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion'
import { random } from 'remotion'

/**
 * 统一的电影感深空背景 —— 所有场景共享
 * 缓慢流动的光斑 + 极淡网格 + 整体冷暖渐变
 */
export const SharedBackground: React.FC<{ accent?: 'blue' | 'red' | 'purple' }> = ({ accent = 'blue' }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  const progress = frame / durationInFrames

  // 背景缓慢旋转角度
  const bgAngle = interpolate(frame, [0, durationInFrames], [0, 45])

  // 光斑位置随时间缓慢流动
  const blob1X = interpolate(frame, [0, durationInFrames], [150, 350])
  const blob1Y = interpolate(frame, [0, durationInFrames], [250, 180])
  const blob2X = interpolate(frame, [0, durationInFrames], [1700, 1500])
  const blob2Y = interpolate(frame, [0, durationInFrames], [750, 850])
  const blob3X = interpolate(frame, [0, durationInFrames], [960, 1000])
  const blob3Y = interpolate(frame, [0, durationInFrames], [540, 500])

  const accentColor = accent === 'red' ? '248,81,73' : accent === 'purple' ? '163,113,247' : '47,129,247'

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${bgAngle}deg, #080b10 0%, #0d1117 40%, #111820 60%, #0a0e14 100%)`,
      }}
    >
      {/* 大光斑 1 */}
      <div
        style={{
          position: 'absolute',
          left: blob1X,
          top: blob1Y,
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${accentColor},0.10) 0%, transparent 55%)`,
          filter: 'blur(80px)',
        }}
      />
      {/* 大光斑 2 */}
      <div
        style={{
          position: 'absolute',
          left: blob2X,
          top: blob2Y,
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(163,113,247,0.08) 0%, transparent 55%)`,
          filter: 'blur(90px)',
        }}
      />
      {/* 中心弱光 */}
      <div
        style={{
          position: 'absolute',
          left: blob3X - 400,
          top: blob3Y - 400,
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(47,129,247,0.05) 0%, transparent 50%)`,
          filter: 'blur(100px)',
        }}
      />

      {/* 极淡网格 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.025,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '100px 100px',
        }}
      />

      {/* 上下暗角 vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  )
}

/**
 * 玻璃卡片通用样式
 */
export const glassCard = (
  accent = 'rgba(255,255,255,0.06)',
  borderOpacity = '12'
): React.CSSProperties => ({
  background: 'rgba(22,27,34,0.55)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderRadius: 20,
  border: `1px solid ${accent.replace(')', ',0.' + borderOpacity + ')').replace('rgb', 'rgba').replace('#', '') || 'rgba(255,255,255,0.06)'}`,
  boxShadow: '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
})

// 简单十六进制辅助：如果 accent 是 #rrggbb
export const hexToRgba = (hex: string, alpha: string): string => {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},0.${alpha})`
}
