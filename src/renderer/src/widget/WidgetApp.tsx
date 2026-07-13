import { useState } from 'react'
import { MessageSquare, ListTodo, X } from 'lucide-react'
import { WidgetChat } from './WidgetChat'
import { TaskProgress } from './TaskProgress'

type Tab = 'chat' | 'task'

export function WidgetApp(): JSX.Element {
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <div className="glass-container">
      {/* 顶部栏：Tab 切换 + 关闭按钮 */}
      <div className="widget-header">
        <div className="tab-group">
          <button
            className={`tab-btn ${tab === 'chat' ? 'active' : ''}`}
            onClick={() => setTab('chat')}
          >
            <MessageSquare size={13} />
            <span>对话</span>
          </button>
          <button
            className={`tab-btn ${tab === 'task' ? 'active' : ''}`}
            onClick={() => setTab('task')}
          >
            <ListTodo size={13} />
            <span>任务</span>
          </button>
        </div>
        <button
          className="close-btn"
          onClick={() => window.widgetApi.hide()}
          title="关闭"
        >
          <X size={14} />
        </button>
      </div>

      {/* 内容区 */}
      {tab === 'chat' ? <WidgetChat /> : <TaskProgress />}
    </div>
  )
}
