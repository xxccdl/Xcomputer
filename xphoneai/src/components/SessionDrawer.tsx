import { useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, Modal, Animated, StyleSheet,
  FlatList, Alert, Dimensions, Pressable
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { useSessionStore, type Session } from '@/stores/sessionStore'

const DRAWER_WIDTH = Dimensions.get('window').width * 0.78

interface Props {
  visible: boolean
  onClose: () => void
}

export function SessionDrawer({ visible, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  const sessions = useSessionStore((s) => s.sessions)
  const sessionOrder = useSessionStore((s) => s.sessionOrder)
  const currentSessionId = useSessionStore((s) => s.currentSessionId)
  const switchSession = useSessionStore((s) => s.switchSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const createSession = useSessionStore((s) => s.createSession)
  const clearAllSessions = useSessionStore((s) => s.clearAllSessions)
  const loading = useSessionStore((s) => s.loading)

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true })
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 220, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 220, useNativeDriver: true })
      ]).start()
    }
  }, [visible])

  const handleSelect = (id: string) => {
    if (loading) {
      Alert.alert('提示', '当前有任务进行中，请先停止')
      return
    }
    switchSession(id)
    onClose()
  }

  const handleDelete = (id: string, title: string) => {
    Alert.alert('删除会话', `确定删除「${title}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteSession(id) }
    ])
  }

  const handleNew = () => {
    if (loading) {
      Alert.alert('提示', '当前有任务进行中，请先停止')
      return
    }
    createSession()
    onClose()
  }

  const handleClearAll = () => {
    Alert.alert('清空所有会话', '确定删除全部会话记录吗？此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => clearAllSessions() }
    ])
  }

  const orderedSessions: Session[] = sessionOrder
    .map((id) => sessions[id])
    .filter((s): s is Session => Boolean(s))

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable style={styles.overlayPress} onPress={onClose} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
          <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* 顶部 */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>会话</Text>
              <TouchableOpacity style={styles.newBtn} onPress={handleNew}>
                <Feather name="plus" size={18} color="#3fb950" />
                <Text style={styles.newBtnText}>新建</Text>
              </TouchableOpacity>
            </View>

            {/* 会话列表 */}
            <FlatList
              data={orderedSessions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="message-square" size={40} color="#30363d" />
                  <Text style={styles.emptyText}>暂无会话</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isCurrent = item.id === currentSessionId
                const msgCount = item.messages.length
                return (
                  <TouchableOpacity
                    style={[styles.sessionItem, isCurrent && styles.sessionItemActive]}
                    onPress={() => handleSelect(item.id)}
                    onLongPress={() => handleDelete(item.id, item.title)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sessionRow}>
                      <Feather
                        name={isCurrent ? 'message-circle' : 'message-square'}
                        size={16}
                        color={isCurrent ? '#58a6ff' : '#8b949e'}
                      />
                      <Text style={[styles.sessionTitle, isCurrent && styles.sessionTitleActive]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {isCurrent && <View style={styles.activeDot} />}
                    </View>
                    <Text style={styles.sessionMeta}>
                      {msgCount} 条消息 · {formatTime(item.updatedAt)}
                    </Text>
                  </TouchableOpacity>
                )
              }}
            />

            {/* 底部清空 */}
            {orderedSessions.length > 0 && (
              <TouchableOpacity style={styles.clearBtn} onPress={handleClearAll}>
                <Feather name="trash-2" size={14} color="#f85149" />
                <Text style={styles.clearBtnText}>清空所有会话</Text>
              </TouchableOpacity>
            )}
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

function formatTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  overlayPress: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawer: { width: DRAWER_WIDTH, backgroundColor: '#0d1117', borderRightWidth: 1, borderRightColor: '#21262d' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#21262d'
  },
  headerTitle: { color: '#e6edf3', fontSize: 18, fontWeight: 'bold' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#161b22', borderRadius: 8 },
  newBtnText: { color: '#3fb950', fontSize: 13, fontWeight: 'bold' },
  list: { paddingHorizontal: 8, paddingVertical: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: '#484f58', fontSize: 14 },
  sessionItem: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, marginBottom: 4 },
  sessionItemActive: { backgroundColor: '#161b22', borderWidth: 1, borderColor: '#30363d' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionTitle: { flex: 1, color: '#e6edf3', fontSize: 14, fontWeight: '500' },
  sessionTitleActive: { color: '#58a6ff', fontWeight: 'bold' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#58a6ff' },
  sessionMeta: { color: '#8b949e', fontSize: 11, marginTop: 4, marginLeft: 24 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#21262d' },
  clearBtnText: { color: '#f85149', fontSize: 13 }
})
