import { useState } from 'react'
import type { TaskStep } from '@shared/types'
import { Wrench, Clock, AlertCircle, Brain, ChevronDown, ChevronRight } from 'lucide-react'

export function StepDetail({ step }: { step: TaskStep }): JSX.Element {
  const duration =
    step.finishedAt && step.startedAt ? `${step.finishedAt - step.startedAt}ms` : '进行中...'
  const isDeepThinking = step.type === 'deep_thinking'
  const [expanded, setExpanded] = useState(false)

  // 深度思考内容预览（折叠时显示前 80 字符）
  const previewLength = 80
  const hasFullContent = step.content && step.content.length > previewLength

  return (
    <div className="animate-blur-in p-3">
      <div className="mb-3 flex items-center gap-2">
        {isDeepThinking ? (
          <Brain size={14} className="text-purple-400" />
        ) : (
          <Wrench size={14} className="text-accent" />
        )}
        <span
          className={`font-mono text-sm font-semibold ${
            isDeepThinking ? 'text-purple-400' : 'text-text-primary'
          }`}
        >
          {isDeepThinking ? '深度思考' : step.toolName || step.type}
        </span>
      </div>

      <div className="mb-3 flex items-center gap-3 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {new Date(step.startedAt).toLocaleString('zh-CN')}
        </span>
        <span>·</span>
        <span>耗时 {duration}</span>
      </div>

      {step.content && (
        <div className="animate-fade-in mb-3">
          {isDeepThinking ? (
            <div className="rounded-md border border-purple-400/20 bg-purple-400/5">
              {/* 折叠头部 */}
              <button
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-purple-400 transition-colors hover:bg-purple-400/10"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                推理过程
                <span className="ml-auto text-[10px] text-text-muted">
                  {step.content.length} 字
                </span>
              </button>
              {/* 折叠内容 */}
              {expanded ? (
                <div className="border-t border-purple-400/20 p-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                    {step.content}
                  </p>
                </div>
              ) : (
                <div className="px-3 pb-2">
                  <p className="text-xs leading-relaxed text-text-muted line-clamp-2">
                    {step.content}
                  </p>
                  {hasFullContent && (
                    <span className="mt-1 inline-block text-[10px] text-purple-400/70">
                      点击展开完整内容...
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-1 text-xs font-medium text-text-secondary">说明</div>
              <p className="text-sm text-text-primary">{step.content}</p>
            </>
          )}
        </div>
      )}

      {step.toolArgs != null && (
        <div className="animate-fade-in mb-3">
          <div className="mb-1 text-xs font-medium text-text-secondary">参数</div>
          <pre className="overflow-x-auto rounded-md border border-border bg-bg-input p-2 font-mono text-xs text-text-secondary">
            {JSON.stringify(step.toolArgs, null, 2)}
          </pre>
        </div>
      )}

      {step.toolResult != null && (
        <div className="animate-fade-in mb-3">
          <div className="mb-1 text-xs font-medium text-text-secondary">结果</div>
          <pre className="overflow-x-auto rounded-md border border-border bg-bg-input p-2 font-mono text-xs text-text-secondary max-h-60">
            {typeof step.toolResult === 'string'
              ? step.toolResult
              : JSON.stringify(step.toolResult, null, 2)}
          </pre>
        </div>
      )}

      {step.screenshotPath && (
        <div className="animate-scale-in mb-3">
          <div className="mb-1 text-xs font-medium text-text-secondary">截图</div>
          <img
            src={(() => {
              // 将 Windows 路径转为 file:// URL
              const normalized = step.screenshotPath!.replace(/\\/g, '/')
              // UNC 网络路径（\\server\share\...）需要 file://// 前缀（4 个斜杠）
              if (normalized.startsWith('//')) {
                return `file:////${normalized.slice(2)}`
              }
              // 本地路径（C:\...）使用 file:/// 前缀（3 个斜杠）
              return `file:///${normalized.replace(/^\/+/, '')}`
            })()}
            alt="screenshot"
            className="w-full rounded-md border border-border"
          />
        </div>
      )}

      {step.error && (
        <div className="animate-shake rounded-md border border-danger/30 bg-danger/5 p-2">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-danger">
            <AlertCircle size={12} />
            错误
          </div>
          <p className="text-xs text-danger">{step.error}</p>
        </div>
      )}
    </div>
  )
}
