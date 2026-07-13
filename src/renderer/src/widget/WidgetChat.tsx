import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const ICONS = {
  send: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2z" />
    </svg>
  ),
  stop: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  ),
  sparkle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2z" />
    </svg>
  )
}

export function WidgetChat(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingText, scrollToBottom])

  useEffect(() => {
    const unsubDelta = window.widgetApi.onChatDelta((delta) => {
      setStreamingText((prev) => prev + delta)
    })
    const unsubDone = window.widgetApi.onChatDone((response) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: response }])
      setStreamingText('')
      setIsStreaming(false)
    })
    const unsubError = window.widgetApi.onChatError((error) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: `[错误] ${error}` }])
      setStreamingText('')
      setIsStreaming(false)
    })
    return () => {
      unsubDelta()
      unsubDone()
      unsubError()
    }
  }, [])

  const adjustTextareaHeight = () => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 80) + 'px'
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    setStreamingText('')
    setIsStreaming(true)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      await window.widgetApi.chatSend(text)
    } catch (err) {
      setIsStreaming(false)
      setStreamingText('')
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '[错误] 发送失败，请重试' }
      ])
    }
  }

  const handleStop = () => {
    void window.widgetApi.chatStop()
    if (streamingText) {
      setMessages((prev) => [...prev, { role: 'assistant', content: streamingText }])
    }
    setStreamingText('')
    setIsStreaming(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="chat-area">
      <div className="messages-scroll" ref={scrollRef}>
        {messages.length === 0 && !isStreaming ? (
          <div className="empty-state">
            <div className="icon">{ICONS.sparkle}</div>
            <div className="title">XC 快捷对话</div>
            <div className="hint">输入问题，快速获取 AI 回答</div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            {isStreaming && (
              <div className="message assistant">
                {streamingText ? (
                  <>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamingText}
                    </ReactMarkdown>
                    <span className="streaming-cursor" />
                  </>
                ) : (
                  <div className="thinking-ripple">
                    <span className="thinking-ripple-text">正在思考</span>
                    <span className="thinking-ripple-dot" />
                    <span className="thinking-ripple-dot" />
                    <span className="thinking-ripple-dot" />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="input-bar">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              adjustTextareaHeight()
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送)"
            rows={1}
            autoFocus
          />
        </div>
        {isStreaming ? (
          <button className="send-btn stop" onClick={handleStop} title="停止">
            {ICONS.stop}
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
            title="发送"
          >
            {ICONS.send}
          </button>
        )}
      </div>
    </div>
  )
}
