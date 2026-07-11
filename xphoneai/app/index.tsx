import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
  ScrollView, Image, Modal
} from 'react-native'
import { router } from 'expo-router'
import Markdown from 'react-native-markdown-display'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { useSessionStore, type ChatMessage } from '@/stores/sessionStore'
import { useQuickStore } from '@/stores/quickStore'
import { useScheduleStore, getDueTasks } from '@/stores/scheduleStore'
import { useTodoStore, type TodoItem } from '@/stores/todoStore'
import { useSkillStore, type Skill } from '@/stores/skillStore'
import { useRecordStore } from '@/stores/recordStore'
import type { ToolStep } from '@/services/AIService'
import { NativeAccessibility, isAccessibilityAvailable } from '@/services/NativeAccessibility'
import { runPermissionsGuide } from '@/services/PermissionsGuide'
import { canDrawOverlays, isFloatingServiceRunning, startFloatingService, startSpeechRecognition } from '@/services/NativeXphoneai'
import { SessionDrawer } from '@/components/SessionDrawer'

/** 斜杠命令定义 */
const SLASH_COMMANDS: Array<{ cmd: string; label: string; desc: string; icon: string; command: string }> = [
  { cmd: '/screenshot', label: '截屏', desc: '截取当前屏幕', icon: 'camera', command: '截屏看看我的手机屏幕' },
  { cmd: '/weather', label: '天气', desc: '查看今天天气', icon: 'sun', command: '打开天气应用查看今天天气' },
  { cmd: '/clean', label: '清理', desc: '清理后台应用', icon: 'zap', command: '清理后台运行的应用释放内存' },
  { cmd: '/battery', label: '电池', desc: '查看电量状态', icon: 'battery', command: '查看电池电量和充电状态' },
  { cmd: '/location', label: '位置', desc: 'GPS定位', icon: 'map-pin', command: '获取我当前的GPS位置' },
  { cmd: '/apps', label: '应用', desc: '列出已安装应用', icon: 'grid', command: '列出手机上安装的应用' },
  { cmd: '/device', label: '设备', desc: '设备信息', icon: 'info', command: '获取设备信息' },
  { cmd: '/clipboard', label: '剪贴板', desc: '读取剪贴板', icon: 'clipboard', command: '读取剪贴板内容' },
  { cmd: '/ui', label: 'UI元素', desc: '识别屏幕UI元素', icon: 'layout', command: '识别当前屏幕的UI元素坐标和文字' },
  { cmd: '/record', label: '录屏', desc: '录制操作过程', icon: 'video', command: '开始录制接下来的操作过程' },
]

export default function ChatScreen() {
  const messages = useSessionStore((s) => {
    const session = s.currentSessionId ? s.sessions[s.currentSessionId] : null
    return session?.messages ?? []
  })
  const loading = useSessionStore((s) => s.loading)
  const thinking = useSessionStore((s) => s.thinking)
  const reasoning = useSessionStore((s) => s.reasoning)
  const apiKey = useSessionStore((s) => s.apiKey)
  const streamingId = useSessionStore((s) => s.streamingId)
  const sendMessage = useSessionStore((s) => s.sendMessage)
  const stopGeneration = useSessionStore((s) => s.stopGeneration)
  const createSession = useSessionStore((s) => s.createSession)

  const [input, setInput] = useState('')
  const [a11yEnabled, setA11yEnabled] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const scrollTimer = useRef<NodeJS.Timeout | null>(null)

  const templates = useQuickStore((s) => s.templates)
  const history = useQuickStore((s) => s.history)
  const recordCommand = useQuickStore((s) => s.recordCommand)
  const toggleStar = useQuickStore((s) => s.toggleStar)
  const scheduleTasks = useScheduleStore((s) => s.tasks)
  const markScheduleRun = useScheduleStore((s) => s.markRun)
  const todoItems = useTodoStore((s) => s.items)
  const todoVisible = useTodoStore((s) => s.visible)
  const installedSkills = useSkillStore((s) => s.installed)

  const scrollToEndThrottled = () => {
    if (scrollTimer.current) return
    scrollTimer.current = setTimeout(() => {
      scrollTimer.current = null
      flatListRef.current?.scrollToEnd({ animated: true })
    }, 150)
  }

  const checkA11y = async () => {
    if (!isAccessibilityAvailable()) return
    try {
      setA11yEnabled(await NativeAccessibility!.isAccessibilityEnabled())
    } catch { /* ignore */ }
  }

  useEffect(() => {
    checkA11y()
    runPermissionsGuide()

    // 定期检查并自动启动悬浮球服务（用户授权后无需手动点开启）
    const ensureFloating = setInterval(async () => {
      try {
        const overlay = await canDrawOverlays()
        const running = await isFloatingServiceRunning()
        if (overlay && !running) {
          await startFloatingService()
        }
      } catch { /* ignore */ }
    }, 5000)

    const t = setInterval(checkA11y, 3000)
    return () => {
      clearInterval(t)
      clearInterval(ensureFloating)
    }
  }, [])

  useEffect(() => {
    if (apiKey === null) return
    if (!apiKey) {
      const timer = setTimeout(() => {
        Alert.alert('配置 API Key', '使用前需配置 DeepSeek API Key', [
          { text: '稍后', style: 'cancel' },
          { text: '去设置', onPress: () => router.push('/status') }
        ])
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [apiKey])

  const handleSend = async (textArg?: string) => {
    const text = (textArg ?? input).trim()
    if (!text || loading) return
    if (!apiKey) {
      Alert.alert('提示', '请先配置 DeepSeek API Key', [
        { text: '去设置', onPress: () => router.push('/status') }
      ])
      return
    }
    // 特殊命令：/record 启动/停止录屏模式
    if (text === '/record') {
      const isRecording = useRecordStore.getState().isRecording
      if (isRecording) {
        useRecordStore.getState().stop()
        Alert.alert('录屏已停止', '录屏截图会保存在下一条 AI 回复中')
      } else {
        useRecordStore.getState().start()
        Alert.alert('录屏已启动', '接下来 AI 执行任务时会自动截屏记录操作过程')
      }
      setInput('')
      return
    }
    setInput('')
    recordCommand(text)
    await sendMessage(text)
  }

  /** 语音输入 */
  const handleVoiceInput = async () => {
    if (listening) return
    setListening(true)
    try {
      const text = await startSpeechRecognition()
      if (text.trim()) {
        setInput(text)
      }
    } catch (e) {
      Alert.alert('语音识别失败', e instanceof Error ? e.message : String(e))
    } finally {
      setListening(false)
    }
  }

  /** 定时任务到期检查（前台每 30 秒） */
  useEffect(() => {
    if (loading) return
    const check = () => {
      const due = getDueTasks(scheduleTasks)
      due.forEach((task) => {
        markScheduleRun(task.id)
        sendMessage(task.command).catch(() => {})
      })
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [scheduleTasks, loading, sendMessage, markScheduleRun])

  const handleOpenAccessibility = () => {
    if (!isAccessibilityAvailable()) return
    Alert.alert(
      '开启无障碍服务',
      '请在无障碍设置中找到"xphoneai"并开启，AI才能截屏和操控手机。',
      [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => NativeAccessibility!.openAccessibilitySettings() }
      ]
    )
  }

  const handleNewSession = () => {
    if (loading) {
      Alert.alert('提示', '当前有任务进行中，请先停止')
      return
    }
    createSession()
    setDrawerOpen(false)
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 顶部标题栏 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setDrawerOpen(true)}>
          <Feather name="menu" size={22} color="#8b949e" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={[styles.dot, styles.dotGreen]} />
          <Text style={styles.headerTitle} numberOfLines={1}>xphoneai</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={handleNewSession}>
          <Feather name="edit" size={20} color="#8b949e" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/schedule')}>
          <Feather name="clock" size={20} color="#8b949e" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/skills')}>
          <Feather name="package" size={20} color="#8b949e" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/status')}>
          <Feather name="settings" size={20} color="#8b949e" />
        </TouchableOpacity>
      </View>

      {/* 无障碍警告条 */}
      {!a11yEnabled && (
        <TouchableOpacity style={styles.a11yBar} onPress={handleOpenAccessibility} activeOpacity={0.8}>
          <Feather name="alert-triangle" size={16} color="#f85149" />
          <Text style={styles.a11yBarText}>无障碍服务未开启，AI 无法操控手机</Text>
          <Feather name="chevron-right" size={16} color="#8b949e" />
        </TouchableOpacity>
      )}

      {/* 消息列表 */}
      <FlatList
        ref={flatListRef}
        data={messages.filter((m) => m.role !== 'steps')}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={scrollToEndThrottled}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="smartphone" size={56} color="#30363d" />
            <Text style={styles.emptyTitle}>一句话，让AI操控手机</Text>
            <Text style={styles.emptyDesc}>
              输入指令，如：{'\n'}「截屏看看我的手机」{'\n'}「打开微信给张三发消息：晚上一起吃饭」{'\n'}「把屏幕调亮一点」
            </Text>
          </View>
        }
        renderItem={({ item }) => <MessageBubble msg={item} streaming={item.id === streamingId} />}
      />

      {/* 思考状态条 */}
      {loading && (thinking || reasoning) && (
        <View style={styles.thinkingBar}>
          <ActivityIndicator size="small" color="#58a6ff" />
          <View style={styles.thinkingContent}>
            {thinking && <Text style={styles.thinkingText}>{thinking}</Text>}
            {reasoning && (
              <Text style={styles.reasoningText} numberOfLines={3}>
                {reasoning.slice(-300)}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* AI 任务进度清单 */}
      {todoVisible && todoItems.length > 0 && (
        <View style={styles.todoBar}>
          <View style={styles.todoHeader}>
            <Feather name="check-square" size={13} color="#58a6ff" />
            <Text style={styles.todoTitle}>任务进度</Text>
            <Text style={styles.todoCount}>
              {todoItems.filter((t) => t.status === 'done').length}/{todoItems.length}
            </Text>
          </View>
          {todoItems.map((item) => (
            <TodoRow key={item.id} item={item} />
          ))}
        </View>
      )}

      {/* 底部输入区 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* 快捷指令模板横向栏 */}
        {!loading && templates.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templateBar} contentContainerStyle={styles.templateBarContent}>
            {templates.map((tpl) => (
              <TouchableOpacity
                key={tpl.id}
                style={styles.templateChip}
                onPress={() => handleSend(tpl.command)}
                activeOpacity={0.7}
              >
                <Feather name={tpl.icon as any} size={13} color="#58a6ff" />
                <Text style={styles.templateChipText}>{tpl.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {/* 已安装技能栏 */}
        {!loading && installedSkills.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.historyBar} contentContainerStyle={styles.templateBarContent}>
            {installedSkills.map((skill) => (
              <TouchableOpacity
                key={skill.id}
                style={[styles.templateChip, styles.skillChip]}
                onPress={() => handleSend(skill.prompt)}
                activeOpacity={0.7}
              >
                <Feather name={skill.icon as any} size={13} color="#bc8cff" />
                <Text style={[styles.templateChipText, { color: '#bc8cff' }]}>{skill.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        {/* 指令历史横向栏（收藏的优先） */}
        {!loading && history.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.historyBar} contentContainerStyle={styles.templateBarContent}>
            {history.filter((h) => h.starred).concat(history.filter((h) => !h.starred)).slice(0, 10).map((h) => (
              <TouchableOpacity
                key={h.id}
                style={[styles.templateChip, h.starred && styles.templateChipStarred]}
                onPress={() => handleSend(h.command)}
                onLongPress={() => { toggleStar(h.id); Alert.alert(h.starred ? '已取消收藏' : '已收藏') }}
                activeOpacity={0.7}
              >
                <Feather name={h.starred ? 'star' : 'clock'} size={12} color={h.starred ? '#d29922' : '#8b949e'} />
                <Text style={[styles.templateChipText, h.starred && { color: '#d29922' }]} numberOfLines={1}>{h.command.slice(0, 12)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={listening ? '正在聆听...' : '输入指令，让AI操控手机...'}
            placeholderTextColor="#484f58"
            multiline
            maxLength={2000}
            editable={!loading}
          />
          {/* 麦克风按钮 */}
          <TouchableOpacity
            style={[styles.micBtn, listening && styles.micBtnActive]}
            onPress={handleVoiceInput}
            disabled={loading || listening}
          >
            <Feather name={listening ? 'loader' : 'mic'} size={18} color={listening ? '#58a6ff' : '#8b949e'} />
          </TouchableOpacity>
          {loading ? (
            <TouchableOpacity style={[styles.sendBtn, styles.stopBtn]} onPress={stopGeneration}>
              <Feather name="square" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={!input.trim()}
            >
              <Feather name="arrow-up" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        {/* 斜杠命令面板 */}
        {input.startsWith('/') && !loading && (
          <View style={styles.slashPanel}>
            {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input)).slice(0, 6).map((c) => (
              <TouchableOpacity
                key={c.cmd}
                style={styles.slashItem}
                onPress={() => handleSend(c.command)}
                activeOpacity={0.7}
              >
                <View style={styles.slashIconWrap}>
                  <Feather name={c.icon as any} size={15} color="#58a6ff" />
                </View>
                <View style={styles.slashItemInfo}>
                  <Text style={styles.slashCmd}>{c.cmd}</Text>
                  <Text style={styles.slashDesc}>{c.desc}</Text>
                </View>
                <Feather name="chevron-right" size={14} color="#30363d" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* 会话抽屉 */}
      <SessionDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  )
}

/** AI 任务进度行 */
function TodoRow({ item }: { item: TodoItem }) {
  const isDone = item.status === 'done'
  const isInProgress = item.status === 'in_progress'
  return (
    <View style={styles.todoRow}>
      <View style={[styles.todoDot, isDone && styles.todoDotDone, isInProgress && styles.todoDotActive]} />
      <Text style={[styles.todoText, isDone && styles.todoTextDone]} numberOfLines={1}>
        {item.text}
      </Text>
      {isInProgress && <ActivityIndicator size="small" color="#58a6ff" />}
      {isDone && <Feather name="check" size={12} color="#3fb950" />}
    </View>
  )
}

/** 消息气泡（memo 减少 FlatList 重渲染） */
const MessageBubble = React.memo(function MessageBubble({
  msg,
  streaming
}: {
  msg: ChatMessage
  streaming: boolean
}) {
  const isUser = msg.role === 'user'
  const showCursor = streaming && !isUser
  const [showGallery, setShowGallery] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const screenshots = msg.screenshots || []

  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAI]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Feather name="cpu" size={16} color="#58a6ff" />
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI, msg.error && styles.bubbleError]}>
        {isUser ? (
          <Text style={styles.userText}>{msg.content}</Text>
        ) : (
          <>
            {/* 按顺序渲染已完成的段落（文本 / 工具步骤交替） */}
            {msg.segments?.map((seg, i) =>
              seg.type === 'text' ? (
                <Markdown key={i} style={markdownStyles}>{seg.content || ''}</Markdown>
              ) : (
                <StepsView key={i} steps={seg.steps || []} />
              )
            )}
            {/* 当前正在流式输出的文本 */}
            {msg.content ? (
              <Markdown style={markdownStyles}>{msg.content + (showCursor ? ' ▋' : '')}</Markdown>
            ) : (!msg.segments || msg.segments.length === 0) ? (
              <View style={styles.thinkingDots}>
                <ActivityIndicator size="small" color="#8b949e" />
                <Text style={styles.thinkingDotsText}>思考中...</Text>
              </View>
            ) : null}
            {/* 操作录屏截图缩略图 */}
            {screenshots.length > 0 && (
              <View style={styles.galleryRow}>
                <View style={styles.galleryHeader}>
                  <Feather name="video" size={12} color="#bc8cff" />
                  <Text style={styles.galleryTitle}>操作录屏 · {screenshots.length} 张截图</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbScroll}>
                  {screenshots.map((shot, i) => (
                    <TouchableOpacity key={i} onPress={() => { setGalleryIndex(i); setShowGallery(true) }}>
                      <Image source={{ uri: shot.path }} style={styles.thumb} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </View>
      {/* 截图大图查看器 */}
      <Modal visible={showGallery} transparent animationType="fade" onRequestClose={() => setShowGallery(false)}>
        <View style={styles.galleryModal}>
          <View style={styles.galleryModalHeader}>
            <Text style={styles.galleryModalTitle}>
              {galleryIndex + 1} / {screenshots.length} · {screenshots[galleryIndex]?.label || ''}
            </Text>
            <TouchableOpacity onPress={() => setShowGallery(false)}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <Image source={{ uri: screenshots[galleryIndex]?.path || '' }} style={styles.galleryImage} resizeMode="contain" />
          <View style={styles.galleryNav}>
            <TouchableOpacity
              onPress={() => setGalleryIndex((i) => Math.max(0, i - 1))}
              disabled={galleryIndex === 0}
            >
              <Feather name="chevron-left" size={28} color={galleryIndex === 0 ? '#30363d' : '#58a6ff'} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setGalleryIndex((i) => Math.min(screenshots.length - 1, i + 1))}
              disabled={galleryIndex === screenshots.length - 1}
            >
              <Feather name="chevron-right" size={28} color={galleryIndex === screenshots.length - 1 ? '#30363d' : '#58a6ff'} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
})

/** 工具调用过程展示（TRAE Work 风格：可折叠思考过程 + 执行状态行） */
function StepsView({ steps }: { steps: ToolStep[] }) {
  const [expanded, setExpanded] = useState(false)
  const count = steps.length
  const hasFail = steps.some((s) => !s.success)

  return (
    <View style={styles.stepsBox}>
      <View style={styles.stepsStatus}>
        <Feather name={hasFail ? 'alert-circle' : 'check-circle'} size={13} color={hasFail ? '#f85149' : '#3fb950'} />
        <Text style={styles.stepsStatusText}>已执行 {count} 个工具</Text>
      </View>
      <TouchableOpacity
        style={styles.stepsHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <Feather name={expanded ? 'chevron-down' : 'chevron-right'} size={14} color="#8b949e" />
        <Text style={styles.stepsHeaderText}>思考过程</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.stepsList}>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepItem}>
              <Feather name={step.success ? 'check-circle' : 'x-circle'} size={12} color={step.success ? '#3fb950' : '#f85149'} />
              <Text style={styles.stepText} numberOfLines={1}>{step.label} {step.argsLabel}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  // 顶部
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#21262d'
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: '#3fb950' },
  headerTitle: { color: '#e6edf3', fontSize: 17, fontWeight: 'bold' },
  iconBtn: { padding: 8 },
  // 无障碍警告条
  a11yBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#3d1f1f', paddingHorizontal: 14, paddingVertical: 8
  },
  a11yBarText: { flex: 1, color: '#f85149', fontSize: 12 },
  // 列表
  list: { paddingHorizontal: 12, paddingVertical: 12, flexGrow: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 },
  emptyTitle: { color: '#8b949e', fontSize: 20, fontWeight: 'bold', marginTop: 20 },
  emptyDesc: { color: '#484f58', fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  // 消息行
  msgRow: { flexDirection: 'row', marginVertical: 6, maxWidth: '100%' },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAI: { justifyContent: 'flex-start' },
  stepsBox: {
    backgroundColor: '#0d1117', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#21262d', gap: 8,
    marginVertical: 8
  },
  stepsDivider: { height: 1, backgroundColor: '#30363d', marginVertical: 10 },
  stepsStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepsStatusText: { color: '#8b949e', fontSize: 12 },
  stepsHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepsHeaderText: { color: '#8b949e', fontSize: 13 },
  stepsList: { marginTop: 4, gap: 6 },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepText: { color: '#c9d1d9', fontSize: 12, flex: 1 },
  avatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#161b22',
    borderWidth: 1, borderColor: '#30363d', alignItems: 'center', justifyContent: 'center',
    marginRight: 8, marginTop: 4
  },
  bubble: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '85%' },
  bubbleUser: { backgroundColor: '#1f6feb', borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d', borderBottomLeftRadius: 4 },
  bubbleError: { borderColor: '#f85149', backgroundColor: '#3d1f1f' },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  thinkingDots: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  thinkingDotsText: { color: '#8b949e', fontSize: 14 },
  // 思考状态
  thinkingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 8, backgroundColor: '#161b22', borderTopWidth: 1, borderTopColor: '#21262d'
  },
  thinkingText: { color: '#58a6ff', fontSize: 13 },
  thinkingContent: { flex: 1, gap: 2 },
  reasoningText: { color: '#8b949e', fontSize: 11, lineHeight: 16, fontFamily: 'monospace' },
  // AI 任务进度
  todoBar: {
    backgroundColor: '#161b22', borderTopWidth: 1, borderTopColor: '#21262d',
    paddingHorizontal: 14, paddingVertical: 10, gap: 6
  },
  todoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  todoTitle: { color: '#58a6ff', fontSize: 12, fontWeight: 'bold', flex: 1 },
  todoCount: { color: '#8b949e', fontSize: 11 },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  todoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#30363d' },
  todoDotActive: { backgroundColor: '#58a6ff' },
  todoDotDone: { backgroundColor: '#3fb950' },
  todoText: { flex: 1, color: '#e6edf3', fontSize: 13 },
  todoTextDone: { color: '#8b949e', textDecorationLine: 'line-through' },
  // 输入区
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#0d1117', borderTopWidth: 1, borderTopColor: '#21262d'
  },
  input: {
    flex: 1, backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d',
    borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10,
    color: '#e6edf3', fontSize: 15, maxHeight: 120, minHeight: 40
  },
  micBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#161b22',
    borderWidth: 1, borderColor: '#30363d',
    alignItems: 'center', justifyContent: 'center'
  },
  micBtnActive: { borderColor: '#58a6ff', backgroundColor: '#1a2332' },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#238636',
    alignItems: 'center', justifyContent: 'center'
  },
  stopBtn: { backgroundColor: '#da3633' },
  sendBtnDisabled: { backgroundColor: '#21262d' },
  templateBar: { backgroundColor: '#0d1117', maxHeight: 44 },
  historyBar: { backgroundColor: '#0d1117', maxHeight: 44, borderTopWidth: 0 },
  templateBarContent: { paddingHorizontal: 8, gap: 6, alignItems: 'center', paddingVertical: 6 },
  templateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d',
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5
  },
  templateChipStarred: { borderColor: '#d2992244' },
  skillChip: { borderColor: '#bc8cff44' },
  templateChipText: { color: '#8b949e', fontSize: 12, maxWidth: 100 },
  // 斜杠命令面板
  slashPanel: {
    backgroundColor: '#161b22', borderTopWidth: 1, borderTopColor: '#21262d',
    maxHeight: 240, paddingVertical: 4
  },
  slashItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10
  },
  slashIconWrap: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: '#1a2332',
    alignItems: 'center', justifyContent: 'center'
  },
  slashItemInfo: { flex: 1 },
  slashCmd: { color: '#58a6ff', fontSize: 14, fontFamily: 'monospace', fontWeight: '600' },
  slashDesc: { color: '#8b949e', fontSize: 11, marginTop: 1 },
  // 操作录屏
  galleryRow: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#21262d' },
  galleryHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  galleryTitle: { color: '#bc8cff', fontSize: 11, fontWeight: '600' },
  thumbScroll: { flexDirection: 'row' },
  thumb: { width: 60, height: 100, borderRadius: 6, marginRight: 6, backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#30363d' },
  galleryModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  galleryModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 20 },
  galleryModalTitle: { color: '#e6edf3', fontSize: 14 },
  galleryImage: { flex: 1, marginHorizontal: 10 },
  galleryNav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 30, paddingVertical: 30 }
})

const markdownStyles = {
  body: { color: '#e6edf3', fontSize: 15, lineHeight: 22 },
  paragraph: { color: '#e6edf3', fontSize: 15, lineHeight: 22, marginTop: 0, marginBottom: 10, flexWrap: 'wrap' as const },
  heading1: { color: '#e6edf3', fontSize: 20, fontWeight: 'bold' as const, marginTop: 8, marginBottom: 6 },
  heading2: { color: '#e6edf3', fontSize: 18, fontWeight: 'bold' as const, marginTop: 6, marginBottom: 4 },
  heading3: { color: '#e6edf3', fontSize: 16, fontWeight: 'bold' as const, marginTop: 4, marginBottom: 4 },
  code_inline: { color: '#f0883e', backgroundColor: '#21262d', paddingHorizontal: 4, borderRadius: 3, fontSize: 13, fontFamily: 'monospace' },
  code_block: { color: '#e6edf3', backgroundColor: '#161b22', padding: 10, borderRadius: 6, fontSize: 13, fontFamily: 'monospace' },
  fence: { color: '#e6edf3', backgroundColor: '#161b22', padding: 10, borderRadius: 6, fontSize: 13, fontFamily: 'monospace' },
  blockquote: { borderColor: '#30363d', borderLeftWidth: 3, paddingLeft: 10, color: '#8b949e' },
  strong: { color: '#e6edf3', fontWeight: 'bold' as const },
  em: { color: '#e6edf3', fontStyle: 'italic' as const },
  link: { color: '#58a6ff', textDecorationLine: 'underline' as const },
  list_item: { color: '#e6edf3', marginBottom: 4 },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 }
}
