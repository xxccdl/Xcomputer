import { useCurrentFrame } from 'remotion'

const FPS = 30

/**
 * 节拍脉冲 hook —— 让视觉效果与 BGM 节拍同步
 * Hard Rock 风格 BGM，BPM 约 130，每拍约 14 帧
 *
 * @param bpm 每分钟节拍数
 * @returns 脉冲值 0-1（每拍开始时为 1，平缓衰减到 0）
 */
export const useBeat = (bpm = 130): number => {
  const frame = useCurrentFrame()
  const beatFrames = Math.round((60 * FPS) / bpm)
  const phase = (frame % beatFrames) / beatFrames
  // 更平缓的衰减曲线，避免机械的尖锐脉冲
  return Math.exp(-phase * 4) * 0.65
}

/**
 * 节拍缩放增量
 * @returns 缩放增量（0 到 intensity），叠加到基础缩放上
 */
export const useBeatScale = (bpm = 130, intensity = 0.012): number => {
  return useBeat(bpm) * intensity
}

/**
 * 节拍发光强度
 * @returns 发光值（0 到 maxGlow）
 */
export const useBeatGlow = (bpm = 130, maxGlow = 0.15): number => {
  return useBeat(bpm) * maxGlow
}

/**
 * 节拍透明度脉冲（用于闪烁效果）
 * @returns 透明度增量（0 到 intensity）
 */
export const useBeatFlash = (bpm = 130, intensity = 0.08): number => {
  return useBeat(bpm) * intensity
}
