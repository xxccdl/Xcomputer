import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  Modal, Alert, Switch
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { useScheduleStore, type ScheduleTask } from '@/stores/scheduleStore'

const TYPE_OPTIONS: Array<{ key: ScheduleTask['type']; label: string; icon: string }> = [
  { key: 'interval', label: '间隔触发', icon: 'repeat' },
  { key: 'daily', label: '每日定点', icon: 'clock' },
  { key: 'once', label: '单次定时', icon: 'one-time' }
]

export default function ScheduleScreen() {
  const tasks = useScheduleStore((s) => s.tasks)
  const addTask = useScheduleStore((s) => s.addTask)
  const removeTask = useScheduleStore((s) => s.removeTask)
  const toggleTask = useScheduleStore((s) => s.toggleTask)

  const [modalVisible, setModalVisible] = useState(false)
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [type, setType] = useState<ScheduleTask['type']>('daily')
  const [intervalMin, setIntervalMin] = useState('60')
  const [dailyTime, setDailyTime] = useState('09:00')

  const handleAdd = () => {
    if (!name.trim() || !command.trim()) {
      Alert.alert('提示', '请填写任务名称和指令')
      return
    }
    addTask({
      name: name.trim(),
      command: command.trim(),
      type,
      intervalMin: type === 'interval' ? Number(intervalMin) || 60 : undefined,
      dailyTime: type === 'daily' ? dailyTime : undefined,
      onceTime: type === 'once' ? Date.now() + 60000 : undefined
    })
    setName('')
    setCommand('')
    setModalVisible(false)
  }

  const handleDelete = (task: ScheduleTask) => {
    Alert.alert('删除任务', `确定删除「${task.name}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => removeTask(task.id) }
    ])
  }

  const formatNext = (ts: number): string => {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const renderTypeBadge = (task: ScheduleTask): string => {
    if (task.type === 'interval') return `每 ${task.intervalMin} 分钟`
    if (task.type === 'daily') return `每日 ${task.dailyTime}`
    return '单次'
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* 头部 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>定时任务</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Feather name="plus" size={18} color="#3fb950" />
          <Text style={styles.addBtnText}>新建</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="clock" size={48} color="#30363d" />
            <Text style={styles.emptyTitle}>暂无定时任务</Text>
            <Text style={styles.emptyDesc}>点击右上角"新建"创建定时执行的 AI 指令</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.taskCard, !item.enabled && styles.taskCardDisabled]}>
            <View style={styles.taskHeader}>
              <View style={styles.taskHeaderLeft}>
                <Feather name="clock" size={16} color={item.enabled ? '#58a6ff' : '#484f58'} />
                <Text style={styles.taskName}>{item.name}</Text>
              </View>
              <Switch
                value={item.enabled}
                onValueChange={() => toggleTask(item.id)}
                trackColor={{ false: '#30363d', true: '#238636' }}
                thumbColor="#fff"
              />
            </View>
            <Text style={styles.taskCommand} numberOfLines={2}>{item.command}</Text>
            <View style={styles.taskMeta}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{renderTypeBadge(item)}</Text>
              </View>
              <Text style={styles.taskNext}>下次: {formatNext(item.nextRun)}</Text>
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
                <Feather name="trash-2" size={14} color="#f85149" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* 新建任务弹窗 */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>新建定时任务</Text>

            <Text style={styles.fieldLabel}>任务名称</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="如：早安播报" placeholderTextColor="#484f58" />

            <Text style={styles.fieldLabel}>AI 指令</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={command}
              onChangeText={setCommand}
              placeholder="如：播报今天天气和日程"
              placeholderTextColor="#484f58"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.fieldLabel}>触发方式</Text>
            <View style={styles.typePicker}>
              {TYPE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.typeOption, type === opt.key && styles.typeOptionActive]}
                  onPress={() => setType(opt.key)}
                >
                  <Feather name={opt.icon as any} size={14} color={type === opt.key ? '#58a6ff' : '#8b949e'} />
                  <Text style={[styles.typeOptionText, type === opt.key && styles.typeOptionTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {type === 'interval' && (
              <>
                <Text style={styles.fieldLabel}>间隔（分钟）</Text>
                <TextInput style={styles.input} value={intervalMin} onChangeText={setIntervalMin} keyboardType="numeric" placeholder="60" placeholderTextColor="#484f58" />
              </>
            )}
            {type === 'daily' && (
              <>
                <Text style={styles.fieldLabel}>每日触发时间（HH:MM）</Text>
                <TextInput style={styles.input} value={dailyTime} onChangeText={setDailyTime} placeholder="09:00" placeholderTextColor="#484f58" />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnConfirm]} onPress={handleAdd}>
                <Text style={styles.modalBtnConfirmText}>创建</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#21262d'
  },
  headerTitle: { color: '#e6edf3', fontSize: 18, fontWeight: 'bold' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#161b22', borderRadius: 8 },
  addBtnText: { color: '#3fb950', fontSize: 13, fontWeight: 'bold' },
  list: { padding: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { color: '#8b949e', fontSize: 18, fontWeight: 'bold' },
  emptyDesc: { color: '#484f58', fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  taskCard: {
    backgroundColor: '#161b22', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#21262d'
  },
  taskCardDisabled: { opacity: 0.5 },
  taskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  taskHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  taskName: { color: '#e6edf3', fontSize: 15, fontWeight: '600' },
  taskCommand: { color: '#8b949e', fontSize: 13, lineHeight: 20, marginBottom: 10 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { backgroundColor: '#1a2332', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#58a6ff', fontSize: 11 },
  taskNext: { color: '#8b949e', fontSize: 11, flex: 1 },
  deleteBtn: { padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0d1117', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalTitle: { color: '#e6edf3', fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  fieldLabel: { color: '#8b949e', fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#161b22', borderWidth: 1, borderColor: '#21262d', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#e6edf3', fontSize: 14 },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  typePicker: { flexDirection: 'row', gap: 8 },
  typeOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#30363d', backgroundColor: '#0d1117' },
  typeOptionActive: { borderColor: '#58a6ff', backgroundColor: '#1a2332' },
  typeOptionText: { color: '#8b949e', fontSize: 12 },
  typeOptionTextActive: { color: '#58a6ff' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#21262d' },
  modalBtnCancelText: { color: '#8b949e', fontSize: 14, fontWeight: '600' },
  modalBtnConfirm: { backgroundColor: '#238636' },
  modalBtnConfirmText: { color: '#fff', fontSize: 14, fontWeight: 'bold' }
})
