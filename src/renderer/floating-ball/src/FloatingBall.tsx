import { useCallback, useEffect, useRef, useState } from 'react'
import type { FloatingBallState, FloatingBallStatusPayload } from '@shared/types'

interface FloatingBallAPI {
  getState(): Promise<FloatingBallStatusPayload>
  onStateChange(cb: (payload: FloatingBallStatusPayload) => void): () => void
  click(): void
  action(action: 'showMain' | 'hideMain' | 'newSession' | 'stopTask'): void
  drag(deltaX: number, deltaY: number): void
  dragStart(): void
  dragEnd(): void
  setMenuVisible(visible: boolean): void
  setMouseEventsEnabled(enabled: boolean): void
}

declare global {
  interface Window {
    floatingBallApi?: FloatingBallAPI
  }
}

/** 各状态对应的视觉配置 */
const STATE_CONFIG: Record<
  FloatingBallState,
  {
    label: string
    color: string
    glow: string
  }
> = {
  idle: {
    label: '空闲',
    color: 'linear-gradient(135deg, #58a6ff 0%, #1f6feb 100%)',
    glow: 'rgba(88, 166, 255, 0.45)'
  },
  thinking: {
    label: '思考中',
    color: 'linear-gradient(135deg, #d2a8ff 0%, #8957e5 100%)',
    glow: 'rgba(210, 168, 255, 0.6)'
  },
  working: {
    label: '执行中',
    color: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
    glow: 'rgba(255, 200, 0, 0.7)'
  },
  success: {
    label: '已完成',
    color: 'linear-gradient(135deg, #56d364 0%, #2ea043 100%)',
    glow: 'rgba(86, 211, 100, 0.7)'
  },
  error: {
    label: '出错',
    color: 'linear-gradient(135deg, #ff7b72 0%, #da3633 100%)',
    glow: 'rgba(255, 123, 114, 0.7)'
  }
}

const ICONS = {
  showMain: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 9h6v6H9z" />
    </svg>
  ),
  newSession: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  stopTask: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  ),
  hideMain: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 14l-7 7-7-7M19 10l-7-7-7 7" />
    </svg>
  )
}

export function FloatingBall(): JSX.Element {
  const [state, setState] = useState<FloatingBallState>('idle')
  const [detail, setDetail] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  // 拖拽状态用 ref，避免 React 状态异步导致 click 被误判
  const isDraggingRef = useRef(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mouseUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 鼠标是否在球体/菜单等交互元素上，用于控制透明区域点击穿透
  const overInteractiveRef = useRef(false)
  // 记录鼠标按下时间，用于区分短按（切换菜单）和长按/拖拽
  const mouseDownTimeRef = useRef(0)
  // 用 ref 跟踪菜单展开状态，避免 updateMouseEventsFromHover 读到旧值
  const showMenuRef = useRef(false)
  // 标记本次 mousedown 是否用于关闭已展开的菜单，避免关闭菜单的点击又触发 toggle
  const justClosedMenuRef = useRef(false)

  // 启用/禁用鼠标事件（透明区域点击穿透）
  // 使用 useCallback 稳定引用，因为 handleGlobalMouseUp 需要稳定引用才能在
  // addEventListener / removeEventListener 之间正确匹配（否则 cleanup 无法移除监听器）
  const updateMouseEventsFromHover = useCallback((): void => {
    // 拖拽期间保持启用
    if (isDraggingRef.current) {
      window.floatingBallApi?.setMouseEventsEnabled(true)
      return
    }
    // 菜单展开期间始终启用，避免鼠标经过透明区域时被穿透
    if (showMenuRef.current) {
      window.floatingBallApi?.setMouseEventsEnabled(true)
      return
    }
    // 使用 CSS :hover 判断鼠标是否在交互元素上，避免 enter/leave 竞态
    const hovering = Boolean(
      document.querySelector('.floating-ball:hover, .ball-menu:hover, .ball-menu-item:hover')
    )
    overInteractiveRef.current = hovering
    window.floatingBallApi?.setMouseEventsEnabled(hovering)
  }, [])

  // 全局 mouseup 处理（document 级，兜底确保拖拽一定结束）
  // 使用 useCallback 稳定引用，确保 useEffect cleanup 中的 removeEventListener
  // 能正确移除 handleMouseDown 中 addEventListener 注册的同一个监听器
  const handleGlobalMouseUp = useCallback((): void => {
    // 防止重复调用（React onMouseUp 和 document mouseup 可能同时触发）
    if (!dragStart.current) return
    window.floatingBallApi?.dragEnd()
    dragStart.current = null
    if (mouseUpTimer.current) clearTimeout(mouseUpTimer.current)
    mouseUpTimer.current = setTimeout(() => {
      isDraggingRef.current = false
      updateMouseEventsFromHover()
    }, 50)
  }, [updateMouseEventsFromHover])

  // 初始化：查询当前状态 + 监听变更
  useEffect(() => {
    const api = window.floatingBallApi
    if (!api) {
      console.error('[FloatingBall] window.floatingBallApi 不可用')
      return
    }

    void api.getState().then((payload) => {
      setState(payload.state)
      setDetail(payload.detail ?? '')
    })

    const unsub = api.onStateChange((payload) => {
      setState(payload.state)
      setDetail(payload.detail ?? '')
    })

    // 卸载时清理所有定时器和事件监听器，避免内存泄漏和卸载后状态更新
    return () => {
      unsub()
      if (menuTimer.current) {
        clearTimeout(menuTimer.current)
        menuTimer.current = null
      }
      if (mouseUpTimer.current) {
        clearTimeout(mouseUpTimer.current)
        mouseUpTimer.current = null
      }
      // 清理可能残留的全局 mouseup 监听器
      document.removeEventListener('mouseup', handleGlobalMouseUp)
      // 确保主进程拖拽轮询已停止
      window.floatingBallApi?.dragEnd()
    }
  }, [handleGlobalMouseUp])

  // 鼠标按下：开始拖拽（仅在球体区域，菜单区域会阻止冒泡）
  const handleMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    // 如果上一次拖拽未正常结束（dragStart 仍有值），先清理旧状态
    if (dragStart.current) {
      document.removeEventListener('mouseup', handleGlobalMouseUp)
      window.floatingBallApi?.dragEnd()
    }
    // 如果菜单正展开，先关闭菜单并恢复窗口大小，避免从 120x120 的大窗口开始拖动
    if (showMenuRef.current) {
      setShowMenu(false)
      window.floatingBallApi?.setMenuVisible(false)
      justClosedMenuRef.current = true
    } else {
      justClosedMenuRef.current = false
    }
    mouseDownTimeRef.current = Date.now()
    dragStart.current = { x: e.screenX, y: e.screenY }
    isDraggingRef.current = false // 先标记为未拖拽，移动后再设为 true
    window.floatingBallApi?.setMouseEventsEnabled(true) // 拖拽期间必须接收鼠标事件
    // 通知主进程接管拖拽（主进程用 screen.getCursorScreenPoint() 轮询移动窗口，
    // 解决小窗口鼠标移出后 mouseup 丢失导致拖拽卡住的问题）
    window.floatingBallApi?.dragStart()
    // 注册 document 级全局 mouseup 监听器：即使鼠标移出窗口范围也能收到释放事件
    document.addEventListener('mouseup', handleGlobalMouseUp, { once: true })
  }

  // 鼠标移动：仅检测移动距离设置拖拽标记（实际窗口移动由主进程轮询完成）
  const handleMouseMove = (e: React.MouseEvent): void => {
    if (!dragStart.current || !window.floatingBallApi) return
    // 兜底：若拖拽期间鼠标按键已释放（窗口追上鼠标后 mousemove 进入窗口），
    // 主动结束拖拽，防止 mouseup 在窗口外丢失导致卡住
    if (isDraggingRef.current && e.buttons === 0) {
      handleGlobalMouseUp()
      return
    }
    const deltaX = e.screenX - dragStart.current.x
    const deltaY = e.screenY - dragStart.current.y
    // 移动阈值 4px，避免轻微抖动被误判为拖拽；同时减少误触菜单
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      isDraggingRef.current = true
      // 一旦判定为拖拽，立即确保窗口恢复为球体大小（88x88），防止拖动大窗口
      if (showMenuRef.current) {
        setShowMenu(false)
        window.floatingBallApi.setMenuVisible(false)
      }
    }
    // 不再调用 drag()——主进程已通过 dragStart 接管轮询移动
  }

  // 鼠标抬起来：结束拖拽（调用全局处理）
  const handleMouseUp = (): void => {
    handleGlobalMouseUp()
  }

  // 单击：切换菜单（仅真正的短按，长按/拖拽后不触发）
  const handleClick = (): void => {
    if (isDraggingRef.current) return
    // 按下时间超过 250ms 视为长按/拖拽意图，不打开菜单
    if (Date.now() - mouseDownTimeRef.current > 250) return
    // 如果本次点击是用来关闭已展开的菜单，不触发 toggle
    if (justClosedMenuRef.current) {
      justClosedMenuRef.current = false
      return
    }
    console.log('[FloatingBall] click -> toggle menu')
    setShowMenu((v) => !v)
  }

  // 双击：聚焦主窗口
  const handleDoubleClick = (): void => {
    console.log('[FloatingBall] double click -> show main')
    window.floatingBallApi?.click()
    setShowMenu(false)
  }

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    setShowMenu(true)
  }

  // 鼠标离开：延迟隐藏菜单 + 恢复透明穿透
  const handleMouseLeave = (): void => {
    if (menuTimer.current) clearTimeout(menuTimer.current)
    menuTimer.current = setTimeout(() => {
      // 拖拽期间不要清除拖拽标记，也不要关闭菜单（菜单在 mousedown 时已关闭）
      if (!isDraggingRef.current) {
        setShowMenu(false)
        updateMouseEventsFromHover()
      }
    }, 400)
  }

  // 鼠标进入：取消隐藏
  const handleMouseEnter = (): void => {
    if (menuTimer.current) {
      clearTimeout(menuTimer.current)
      menuTimer.current = null
    }
    updateMouseEventsFromHover()
  }

  // 菜单展开/收起时通知主进程调整窗口大小，减小透明遮挡区域
  // 菜单展开期间强制启用鼠标事件，避免窗口放大后鼠标处于透明区域导致点击穿透
  useEffect(() => {
    // 同步 ref，让 updateMouseEventsFromHover 能正确感知菜单状态
    showMenuRef.current = showMenu
    // 拖拽期间不要通过 effect 恢复窗口大小，避免和拖拽逻辑冲突
    if (!isDraggingRef.current) {
      window.floatingBallApi?.setMenuVisible(showMenu)
    }
    if (showMenu) {
      // 菜单展开期间始终启用鼠标事件，确保点击能正常触发
      window.floatingBallApi?.setMouseEventsEnabled(true)
    } else {
      // 菜单关闭后恢复根据 hover 状态判断
      const timer = setTimeout(() => updateMouseEventsFromHover(), 100)
      return () => clearTimeout(timer)
    }
  }, [showMenu])

  // 菜单项点击
  const handleAction = (action: 'showMain' | 'hideMain' | 'newSession' | 'stopTask'): void => {
    console.log(`[FloatingBall] action: ${action}`)
    window.floatingBallApi?.action(action)
    setShowMenu(false)
  }

  const cfg = STATE_CONFIG[state]
  const isActive = state !== 'idle'

  return (
    <div
      className="floating-ball-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onContextMenu={handleContextMenu}
    >
      {/* 状态提示（球上方） */}
      <div className="ball-tooltip">
        <span className="ball-tooltip-text">{cfg.label}</span>
        {detail && <span className="ball-tooltip-detail">{detail}</span>}
      </div>

      {/* 悬浮球主体 */}
      <div
        className={`floating-ball ball-${state}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={updateMouseEventsFromHover}
        onMouseLeave={updateMouseEventsFromHover}
        style={{
          background: cfg.color,
          boxShadow: `0 0 16px ${cfg.glow}, 0 4px 10px rgba(0,0,0,0.35)`
        }}
      >
        {/* 外圈光环 */}
        <div className="ball-ring" />

        {/* 中心 X 图标 */}
        <svg
          className="ball-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 6L18 18M18 6L6 18" />
        </svg>

        {/* 工作中：旋转的弧线 */}
        {(state === 'working' || state === 'thinking') && <div className="ball-spinner" />}

        {/* 成功：对勾 */}
        {state === 'success' && (
          <svg
            className="ball-check"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}

        {/* 错误：感叹号 */}
        {state === 'error' && (
          <svg
            className="ball-error-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4M12 17h.01" />
          </svg>
        )}
      </div>

      {/* 快捷操作菜单（图标按钮，位于球体下方） */}
      {showMenu && (
        <div
          className="ball-menu"
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={updateMouseEventsFromHover}
          onMouseLeave={updateMouseEventsFromHover}
        >
          <button
            className="ball-menu-item"
            title="显示主窗口"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={() => window.floatingBallApi?.setMouseEventsEnabled(true)}
            onClick={() => handleAction('showMain')}
          >
            {ICONS.showMain}
          </button>
          <button
            className="ball-menu-item"
            title="新建会话"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={() => window.floatingBallApi?.setMouseEventsEnabled(true)}
            onClick={() => handleAction('newSession')}
          >
            {ICONS.newSession}
          </button>
          {isActive && (
            <button
              className="ball-menu-item danger"
              title="停止任务"
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => window.floatingBallApi?.setMouseEventsEnabled(true)}
              onClick={() => handleAction('stopTask')}
            >
              {ICONS.stopTask}
            </button>
          )}
          <button
            className="ball-menu-item"
            title="隐藏主窗口"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={() => window.floatingBallApi?.setMouseEventsEnabled(true)}
            onClick={() => handleAction('hideMain')}
          >
            {ICONS.hideMain}
          </button>
        </div>
      )}
    </div>
  )
}
