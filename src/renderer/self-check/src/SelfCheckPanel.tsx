import { useState, useEffect, useRef } from 'react'
import { Search, X, AlertTriangle, CheckCircle, Check, CircleSlash } from 'lucide-react'
import type { SelfCheckItem, SelfCheckProgressPayload, SelfCheckResultPayload } from '@shared/types'

interface SelfCheckAPI {
  onProgress(cb: (p: SelfCheckProgressPayload) => void): () => void
  onComplete(cb: (r: SelfCheckResultPayload) => void): () => void
  close(): void
}

declare global {
  interface Window {
    selfCheckApi?: SelfCheckAPI
  }
}

export function SelfCheckPanel(): JSX.Element {
  const [phase, setPhase] = useState<'pre-check' | 'ai-check' | 'done'>('pre-check')
  const [message, setMessage] = useState('正在准备...')
  const [items, setItems] = useState<SelfCheckItem[]>([])
  const [result, setResult] = useState<SelfCheckResultPayload | null>(null)
  const itemsRef = useRef<SelfCheckItem[]>([])

  useEffect(() => {
    const api = window.selfCheckApi
    if (!api) return

    const unsubProgress = api.onProgress((p) => {
      setPhase(p.phase)
      setMessage(p.message)
    })

    const unsubComplete = api.onComplete((r) => {
      setResult(r)
      setItems(r.items)
      itemsRef.current = r.items
      setPhase('done')
    })

    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [])

  const passed = items.filter((i) => i.status === 'pass').length
  const failed = items.filter((i) => i.status === 'fail').length
  const skipped = items.filter((i) => i.status === 'skip').length

  const phaseLabel = phase === 'pre-check' ? '环境预检' : phase === 'ai-check' ? 'AI 工具自检' : '自检完成'
  const progressPercent = phase === 'pre-check' ? 30 : phase === 'ai-check' ? 70 : 100

  return (
    <div className="sc-panel">
      <div className="sc-header">
        <div className="sc-title">
          <Search size={16} className="sc-icon" />
          <span>系统自检</span>
          <span className="sc-phase-tag">{phaseLabel}</span>
        </div>
        <button className="sc-close-btn" onClick={() => window.selfCheckApi?.close()} title="关闭">
          <X size={16} />
        </button>
      </div>

      {phase !== 'done' && (
        <>
          <div className="sc-message">{message}</div>
          <div className="sc-progress-track">
            <div
              className="sc-progress-bar"
              style={{ width: `${progressPercent}%`, transition: 'width 0.4s ease' }}
            />
          </div>
        </>
      )}

      {phase === 'done' && result && (
        <div className={`sc-summary ${failed > 0 ? 'sc-summary-has-fail' : 'sc-summary-all-pass'}`}>
          <span className="inline-flex items-center gap-1">
            {failed > 0 ? (
              <>
                <AlertTriangle size={14} />
                通过 {passed} 项，失败 {failed} 项
              </>
            ) : (
              <>
                <CheckCircle size={14} />
                全部通过（{passed} 项）
              </>
            )}
          </span>
          {skipped > 0 && (
            <span className="ml-1">，跳过 {skipped} 项</span>
          )}
        </div>
      )}

      <div className="sc-items">
        {items.map((it, i) => (
          <div key={i} className={`sc-item sc-item-${it.status}`}>
            <span className="sc-item-icon">
              {it.status === 'pass' ? (
                <Check size={14} />
              ) : it.status === 'fail' ? (
                <X size={14} />
              ) : (
                <CircleSlash size={14} />
              )}
            </span>
            <span className="sc-item-name">{it.name}</span>
            <span className="sc-item-detail">{it.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}