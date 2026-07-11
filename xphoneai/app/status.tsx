import { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { useSessionStore } from '@/stores/sessionStore'
import { NativeAccessibility, isAccessibilityAvailable } from '@/services/NativeAccessibility'
import { DEFAULT_BASE_URL, getBaseUrl, setBaseUrl, getModelConfig, setModelConfig, type ModelConfig, type ModelPreset } from '@/services/SecureStorage'
import {
  canDrawOverlays, requestOverlayPermission, isFloatingServiceRunning,
  startFloatingService, stopFloatingService, isIgnoringBatteryOptimizations,
  requestBatteryOptimizationWhitelist, isNativeXphoneaiAvailable
} from '@/services/NativeXphoneai'

export default function StatusScreen() {
  const apiKey = useSessionStore((s) => s.apiKey)
  const saveKey = useSessionStore((s) => s.saveKey)
  const clearKey = useSessionStore((s) => s.clearKey)
  const clearSession = useSessionStore((s) => s.clearAllSessions)

  const [keyInput, setKeyInput] = useState('')
  const [baseUrl, setBaseUrlInput] = useState(DEFAULT_BASE_URL)
  const [modelConfig, setModelConfigState] = useState<ModelConfig>({ preset: 'pro', customModel: '' })
  const [a11yEnabled, setA11yEnabled] = useState(false)
  const [overlayAllowed, setOverlayAllowed] = useState(false)
  const [floatingRunning, setFloatingRunning] = useState(false)
  const [batteryIgnored, setBatteryIgnored] = useState(false)
  const [notifyAllowed, setNotifyAllowed] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // 同步当前 Key 到输入框
    setKeyInput(apiKey || '')
    // 加载 Base URL 和模型配置
    getBaseUrl().then(setBaseUrlInput)
    getModelConfig().then(setModelConfigState)
  }, [apiKey])

  const checkA11y = async () => {
    if (!isAccessibilityAvailable()) return
    try {
      setA11yEnabled(await NativeAccessibility!.isAccessibilityEnabled())
    } catch { /* ignore */ }
  }

  const refreshPermissions = async () => {
    if (!isNativeXphoneaiAvailable()) return
    try {
      setOverlayAllowed(await canDrawOverlays())
      setFloatingRunning(await isFloatingServiceRunning())
      setBatteryIgnored(await isIgnoringBatteryOptimizations())
    } catch { /* ignore */ }
    try {
      const { status } = await Notifications.getPermissionsAsync()
      setNotifyAllowed(status === 'granted')
    } catch { /* ignore */ }
  }

  useEffect(() => {
    checkA11y()
    refreshPermissions()
    const t = setInterval(() => {
      checkA11y()
      refreshPermissions()
    }, 3000)
    return () => clearInterval(t)
  }, [])

  const handleSaveKey = async () => {
    const trimmed = keyInput.trim()
    if (!trimmed) {
      Alert.alert('提示', '请输入 API Key')
      return
    }
    // 自定义模型必须填模型名
    if (modelConfig.preset === 'custom' && !modelConfig.customModel.trim()) {
      Alert.alert('提示', '选择自定义模型时，请填写模型名称')
      return
    }
    setSaving(true)
    try {
      await saveKey(trimmed)
      await setBaseUrl(baseUrl.trim() || DEFAULT_BASE_URL)
      await setModelConfig({
        preset: modelConfig.preset,
        customModel: modelConfig.customModel.trim()
      })
      Alert.alert('成功', '配置已保存')
    } catch (e) {
      Alert.alert('错误', String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleClearKey = () => {
    Alert.alert('清除 API Key', '确定清除已保存的 API Key 吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定', style: 'destructive', onPress: async () => {
          await clearKey()
          setKeyInput('')
        }
      }
    ])
  }

  const handleOpenAccessibility = () => {
    if (!isAccessibilityAvailable()) {
      Alert.alert('提示', '无障碍服务仅支持 Android 平台')
      return
    }
    Alert.alert(
      '开启无障碍服务',
      '请找到"xphoneai"并开启，开启后AI才能截屏、点击、输入等。',
      [
        { text: '取消', style: 'cancel' },
        { text: '去设置', onPress: () => NativeAccessibility!.openAccessibilitySettings() }
      ]
    )
  }

  const handleClearSession = () => {
    Alert.alert('清除会话', '确定清除所有对话记录吗？此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      { text: '确定', style: 'destructive', onPress: () => clearSession() }
    ])
  }

  const handleToggleFloating = async () => {
    try {
      if (floatingRunning) {
        await stopFloatingService()
      } else {
        if (!overlayAllowed) {
          Alert.alert('需要悬浮窗权限', '开启后可在其他应用上方显示悬浮球。', [
            { text: '取消', style: 'cancel' },
            { text: '去开启', onPress: () => requestOverlayPermission() }
          ])
          return
        }
        await startFloatingService()
      }
      refreshPermissions()
    } catch (e) {
      Alert.alert('错误', String(e))
    }
  }

  const handleRequestNotify = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync()
      setNotifyAllowed(status === 'granted')
    } catch { /* ignore */ }
  }

  const handleBatteryWhitelist = () => {
    if (batteryIgnored) return
    Alert.alert('电池优化白名单', '允许 xphoneai 后台运行，防止 AI 任务执行中被系统杀死。', [
      { text: '取消', style: 'cancel' },
      { text: '去设置', onPress: () => requestBatteryOptimizationWhitelist() }
    ])
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* API Key 配置 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="key" size={18} color="#58a6ff" />
            <Text style={styles.sectionTitle}>DeepSeek API 配置</Text>
          </View>
          <Text style={styles.hint}>
            App 直连 DeepSeek，API Key 加密存储于本机，不会上传服务器。
          </Text>

          <Text style={styles.label}>API Key</Text>
          <TextInput
            style={styles.input}
            value={keyInput}
            onChangeText={setKeyInput}
            placeholder="sk-xxxxxxxx"
            placeholderTextColor="#484f58"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>API 地址（可选）</Text>
          <TextInput
            style={styles.input}
            value={baseUrl}
            onChangeText={setBaseUrlInput}
            placeholder={DEFAULT_BASE_URL}
            placeholderTextColor="#484f58"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>模型</Text>
          <View style={styles.modelPicker}>
            {([
              { key: 'pro' as ModelPreset, name: 'V4 Pro', desc: '深度思考' },
              { key: 'flash' as ModelPreset, name: 'V4 Flash', desc: '快速响应' },
              { key: 'custom' as ModelPreset, name: '自定义', desc: '自填模型' }
            ]).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.modelOption, modelConfig.preset === opt.key && styles.modelOptionActive]}
                onPress={() => setModelConfigState((s) => ({ ...s, preset: opt.key }))}
              >
                <Text style={[styles.modelName, modelConfig.preset === opt.key && styles.modelNameActive]}>{opt.name}</Text>
                <Text style={[styles.modelDesc, modelConfig.preset === opt.key && styles.modelDescActive]}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {modelConfig.preset === 'custom' && (
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={modelConfig.customModel}
              onChangeText={(t) => setModelConfigState((s) => ({ ...s, customModel: t }))}
              placeholder="模型名称，如 deepseek-v4-pro"
              placeholderTextColor="#484f58"
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, saving && styles.btnDisabled]}
              onPress={handleSaveKey}
              disabled={saving}
            >
              <Text style={styles.btnPrimaryText}>{saving ? '保存中...' : '保存配置'}</Text>
            </TouchableOpacity>
            {apiKey ? (
              <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleClearKey}>
                <Text style={styles.btnDangerText}>清除 Key</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {apiKey && (
            <Text style={styles.configuredHint}>✓ 已配置（Key 末尾：...{apiKey.slice(-4)}）</Text>
          )}
        </View>

        {/* 权限与后台运行 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="shield" size={18} color="#58a6ff" />
            <Text style={styles.sectionTitle}>权限与后台运行</Text>
          </View>

          <View style={styles.permRow}>
            <View style={styles.permInfo}>
              <Text style={styles.permName}>悬浮球</Text>
              <Text style={styles.permDesc}>{overlayAllowed ? '已授权' : '未授权，可在其他应用上方显示'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.permBtn, floatingRunning ? styles.btnDanger : styles.btnPrimary]}
              onPress={handleToggleFloating}
            >
              <Text style={floatingRunning ? styles.btnDangerText : styles.btnPrimaryText}>
                {floatingRunning ? '关闭' : overlayAllowed ? '开启' : '去授权'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.permRow}>
            <View style={styles.permInfo}>
              <Text style={styles.permName}>通知</Text>
              <Text style={styles.permDesc}>{notifyAllowed ? '已授权' : '未授权，任务完成时提醒'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.permBtn, notifyAllowed ? styles.btnSecondary : styles.btnPrimary]}
              onPress={handleRequestNotify}
              disabled={notifyAllowed}
            >
              <Text style={notifyAllowed ? styles.btnSecondaryText : styles.btnPrimaryText}>
                {notifyAllowed ? '已开启' : '去授权'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.permRow}>
            <View style={styles.permInfo}>
              <Text style={styles.permName}>电池优化白名单</Text>
              <Text style={styles.permDesc}>{batteryIgnored ? '已允许' : '未允许，可能被系统杀后台'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.permBtn, batteryIgnored ? styles.btnSecondary : styles.btnPrimary]}
              onPress={handleBatteryWhitelist}
              disabled={batteryIgnored}
            >
              <Text style={batteryIgnored ? styles.btnSecondaryText : styles.btnPrimaryText}>
                {batteryIgnored ? '已允许' : '去设置'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 无障碍服务 */}
        <View style={[styles.section, a11yEnabled ? styles.sectionGreen : styles.sectionRed]}>
          <View style={styles.sectionHeader}>
            <Feather name={a11yEnabled ? 'check-circle' : 'alert-circle'} size={18} color={a11yEnabled ? '#3fb950' : '#f85149'} />
            <Text style={styles.sectionTitle}>无障碍服务</Text>
            <View style={[styles.badge, a11yEnabled ? styles.badgeGreen : styles.badgeRed]}>
              <Text style={styles.badgeText}>{a11yEnabled ? '已开启' : '未开启'}</Text>
            </View>
          </View>
          <Text style={styles.hint}>
            {a11yEnabled
              ? '无障碍服务已开启，AI可执行截屏、点击、输入、滑动等操作。'
              : '未开启，AI无法截取屏幕和执行UI操作。请点击下方按钮开启。'}
          </Text>
          <TouchableOpacity
            style={a11yEnabled ? styles.btnSecondary : styles.btnPrimary}
            onPress={handleOpenAccessibility}
          >
            <Text style={a11yEnabled ? styles.btnSecondaryText : styles.btnPrimaryText}>
              {a11yEnabled ? '前往无障碍设置' : '开启无障碍服务'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 设备信息 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="smartphone" size={18} color="#8b949e" />
            <Text style={styles.sectionTitle}>设备信息</Text>
          </View>
          <View style={styles.row}><Text style={styles.label}>品牌</Text><Text style={styles.value}>{Device.brand || '-'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>型号</Text><Text style={styles.value}>{Device.modelName || '-'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>系统</Text><Text style={styles.value}>{Device.osName} {Device.osVersion}</Text></View>
        </View>

        {/* 会话管理 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Feather name="message-square" size={18} color="#8b949e" />
            <Text style={styles.sectionTitle}>会话管理</Text>
          </View>
          <Text style={styles.hint}>清除所有对话记录和上下文历史。</Text>
          <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleClearSession}>
            <Text style={styles.btnDangerText}>清除会话记录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  scroll: { padding: 16 },
  section: { backgroundColor: '#161b22', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionGreen: { borderColor: '#3fb950', borderWidth: 1 },
  sectionRed: { borderColor: '#f85149', borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: '#e6edf3', flex: 1 },
  hint: { color: '#8b949e', fontSize: 13, lineHeight: 20, marginBottom: 12 },
  label: { color: '#8b949e', fontSize: 13, marginTop: 8, marginBottom: 6 },
  value: { color: '#e6edf3', fontSize: 14 },
  input: {
    backgroundColor: '#0d1117', borderWidth: 1, borderColor: '#30363d', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, color: '#e6edf3', fontSize: 14
  },
  readonlyField: {
    backgroundColor: '#0d1117', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#21262d'
  },
  readonlyText: { color: '#8b949e', fontSize: 14 },
  modelPicker: { flexDirection: 'row', gap: 8 },
  modelOption: {
    flex: 1, backgroundColor: '#0d1117', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 8,
    borderWidth: 1, borderColor: '#30363d', alignItems: 'center'
  },
  modelOptionActive: { borderColor: '#58a6ff', backgroundColor: '#1a2332' },
  modelName: { color: '#8b949e', fontSize: 14, fontWeight: 'bold' },
  modelNameActive: { color: '#58a6ff' },
  modelDesc: { color: '#484f58', fontSize: 11, marginTop: 4 },
  modelDescActive: { color: '#8b949e' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { borderRadius: 10, padding: 14, alignItems: 'center', justifyContent: 'center', flex: 1 },
  btnPrimary: { backgroundColor: '#238636' },
  btnSecondary: { backgroundColor: '#21262d', borderWidth: 1, borderColor: '#30363d' },
  btnDanger: { backgroundColor: '#da3633' },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  btnSecondaryText: { color: '#8b949e', fontSize: 14 },
  btnDangerText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  permRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  permInfo: { flex: 1, paddingRight: 12 },
  permName: { color: '#e6edf3', fontSize: 14, fontWeight: '500' },
  permDesc: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  permBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, minWidth: 76, alignItems: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeGreen: { backgroundColor: '#238636' },
  badgeRed: { backgroundColor: '#da3633' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  configuredHint: { color: '#3fb950', fontSize: 12, marginTop: 8, textAlign: 'center' }
})
