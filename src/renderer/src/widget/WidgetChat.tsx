import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function WidgetChat(): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingText, scrollToBottom])

  // 监听流式事件
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
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ ${error}` }
      ])
      setStreamingText('')
      setIsStreaming(false)
    })
    return () => {
      unsubDelta()
      unsubDone()
      unsubError()
    }
  }, [])

  // 自适应输入框高度
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
    // 重置输入框高度
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
        { role: 'assistant', content: '⚠️ 发送失败，请重试' }
      ])
    }
  }

  const handleStop = () => {
    void window.widgetApi.chatStop()
    // 保留已接收的部分作为回复
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
      {/* 消息列表 */}
      <div className="messages-scroll" ref={scrollRef}>
        {messages.length === 0 && !isStreaming ? (
          <div className="empty-state">
            <div className="icon">
              <Sparkles size={20} style={{ color: '#a5b4fc' }} />
            </div>
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
            {/* 流式输出 */}
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
                  <span style={{ opacity: 0.5 }}>思考中...</span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 输入栏 */}
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
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            rows={1}
            autoFocus
          />
        </div>
        {isStreaming ? (
          <button className="send-btn stop" onClick={handleStop} title="停止">
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
            title="发送"
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
