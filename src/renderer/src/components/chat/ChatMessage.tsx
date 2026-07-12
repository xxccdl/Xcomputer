import { useState, useMemo, memo } from 'react'
import { clsx } from 'clsx'
import { User, Sparkles, Copy, Check, AlertTriangle, Info } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { Message } from '@shared/types'
import { extractTextFromContent } from '@shared/types'
import { replaceEmojiWithSvg } from '../../utils/emoji-icons'
import { useThrottledValue } from '../../hooks/useThrottledValue'

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <h1 className="mb-2 text-base font-bold">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <h2 className="mb-2 text-sm font-bold">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <h3 className="mb-1 text-sm font-semibold">{children}</h3>
  ),
  strong: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <strong className="font-semibold">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <ul className="mb-2 list-disc pl-4 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <ol className="mb-2 list-decimal pl-4 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <li className="text-text-primary">{children}</li>
  ),
  code: ({ className, children }: { className?: string; children?: React.ReactNode }): JSX.Element => {
    const text = String(children ?? '')
    const isBlock = /language-/.test(className ?? '') || text.includes('\n')
    if (!isBlock) {
      return (
        <code className="rounded bg-bg-input px-1 py-0.5 font-mono text-[0.85em] text-accent">
          {children}
        </code>
      )
    }
    const langMatch = /language-(\w+)/.exec(className ?? '')
    const lang = langMatch ? langMatch[1] : ''
    return (
      <div className="group/code my-2 overflow-hidden rounded-lg border border-border bg-bg-input">
        {lang && (
          <div className="flex items-center justify-between border-b border-border/50 bg-bg-hover/40 px-3 py-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{lang}</span>
          </div>
        )}
        <pre className="overflow-x-auto p-3">
          <code className={clsx('font-mono text-xs leading-relaxed text-text-secondary', className)}>{children}</code>
        </pre>
      </div>
    )
  },
  pre: ({ children }: { children?: React.ReactNode }): JSX.Element => <>{children}</>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }): JSX.Element => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline hover:opacity-80">
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-text-muted">{children}</blockquote>
  ),
  hr: (): JSX.Element => <hr className="my-2 border-border" />,
  table: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse border border-border text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <th className="border border-border bg-bg-hover px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }): JSX.Element => (
    <td className="border border-border px-2 py-1">{children}</td>
  )
}

/** 检测文本是否为系统错误/警告类型消息（用于样式选择）。
 *  注意：text 已经经过 replaceEmojiWithSvg 处理，emoji 已变为带 CSS class 的 <svg>，
 *  因此用 class 名（emoji-warning / emoji-error）检测，而非原始 emoji 字符。
 */
function detectMessageType(text: string): { isError: boolean; isWarning: boolean } {
  const hasWarning = text.includes('emoji-warning')
  const hasError = text.includes('emoji-error')
  return { isError: hasError, isWarning: hasWarning }
}

function ChatMessageImpl({ message }: { message: Message }): JSX.Element {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const [copied, setCopied] = useState(false)
  const rawText = useMemo(() => extractTextFromContent(message.content), [message.content])

  // 节流：流式时 Markdown 解析限制在 ~12fps（80ms），历史消息值稳定无影响
  // 削减 80%+ 的 rehype/remark 解析开销
  const throttledRaw = useThrottledValue(rawText, 80)

  // 缓存 emoji 替换（仅 AI/系统消息需要；用户消息用原生 emoji 渲染，
  // 避免在 <p> 文本节点中显示原始 SVG HTML 字符串）
  const textContent = useMemo(
    () => (isUser ? throttledRaw : replaceEmojiWithSvg(throttledRaw)),
    [throttledRaw, isUser]
  )
  const { isError, isWarning } = useMemo(
    () => (isSystem ? detectMessageType(textContent) : { isError: false, isWarning: false }),
    [textContent, isSystem]
  )

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(textContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('[ChatMessage] 复制失败:', err)
    }
  }

  if (isSystem) {
    return (
      <div className="group relative my-4 flex justify-center animate-fade-in">
        <div
          className={clsx(
            'flex max-w-[90%] items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-sm',
            isWarning || isError
              ? 'border-amber-500/30 bg-amber-500/5 text-amber-200'
              : 'border-border bg-bg-panel/70 text-text-muted'
          )}
        >
          {isWarning ? (
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
          ) : isError ? (
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
          ) : (
            <Info size={16} className="mt-0.5 shrink-0 text-text-muted" />
          )}
          <div className="flex-1 break-words leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={markdownComponents}
            >
              {textContent}
            </ReactMarkdown>
          </div>
          <button
            className="shrink-0 rounded p-1 opacity-0 transition-all hover:bg-white/10 group-hover:opacity-60"
            onClick={() => void handleCopy()}
            title="复制"
          >
            {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('group relative mb-4 flex gap-3 animate-spring-up', isUser && 'flex-row-reverse')}>
      <div
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-bg-hover to-bg-input ring-1 ring-border'
            : 'bg-gradient-to-br from-accent/20 to-accent/5 ring-1 ring-accent/20'
        )}
      >
        {isUser ? (
          <User size={15} className="text-text-secondary" />
        ) : (
          <Sparkles size={15} className="text-accent" />
        )}
      </div>
      <div className={clsx('flex max-w-[85%] flex-col', isUser && 'items-end')}>
        <div
          className={clsx(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm transition-shadow hover:shadow-md',
            isUser
              ? 'rounded-br-md bg-gradient-to-br from-accent to-accent-hover text-white'
              : 'rounded-bl-md border border-border bg-bg-panel text-text-primary'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{textContent}</p>
          ) : (
            <div className="min-h-[1em] break-words">
              {textContent.length > 0 ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={markdownComponents}
                >
                  {textContent}
                </ReactMarkdown>
              ) : (
                <span className="inline-block h-4 w-1 animate-pulse bg-accent/60" />
              )}
            </div>
          )}
        </div>
        {textContent.length > 0 && (
          <button
            className={clsx(
              'mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-text-muted opacity-0 transition-all hover:bg-bg-hover hover:text-text-secondary group-hover:opacity-100',
              isUser && 'flex-row-reverse'
            )}
            onClick={() => void handleCopy()}
            title="复制消息内容"
          >
            {copied ? (
              <>
                <Check size={11} className="text-success" />
                <span className="text-success">已复制</span>
              </>
            ) : (
              <>
                <Copy size={11} />
                <span>复制</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * React.memo 包裹：冻结历史消息组件，流式时只重渲染最后一条 streamingMessage。
 * 自定义比较函数：仅在 id/role/content/stepIds 变化时重渲染，
 * 避免父组件 MainPanel 因 streamingMessage/steps 变化导致的全量重渲染。
 */
export const ChatMessage = memo(
  ChatMessageImpl,
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.role === next.message.role &&
    prev.message.content === next.message.content &&
    prev.message.stepIds === next.message.stepIds
)