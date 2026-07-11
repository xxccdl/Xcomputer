import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { useSessionStore } from '@/stores/sessionStore'
import { useQuickStore } from '@/stores/quickStore'
import { useScheduleStore } from '@/stores/scheduleStore'
import { useSkillStore } from '@/stores/skillStore'
import { requestAllPermissions } from '@/services/permissions'

// 配置通知显示行为
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
})

export default function RootLayout() {
  const init = useSessionStore((s) => s.init)
  const quickInit = useQuickStore((s) => s.init)
  const scheduleInit = useScheduleStore((s) => s.init)
  const skillInit = useSkillStore((s) => s.init)
  const onboarded = useQuickStore((s) => s.onboarded)

  useEffect(() => {
    // 初始化 AI 服务、命令执行器、加载历史会话和 API Key
    init()
    quickInit()
    scheduleInit()
    skillInit()
    // 自动请求所有运行时权限
    requestAllPermissions()
      .then((results) => {
        const granted = results.filter((r) => r.granted).length
        const total = results.length
        console.log(`[Permissions] ${granted}/${total} 已授予`)
      })
      .catch((err) => console.error('[Permissions] 请求失败:', err))
  }, [init, quickInit, scheduleInit, skillInit])

  // 首次启动跳转引导页
  useEffect(() => {
    if (onboarded === false) {
      const t = setTimeout(() => router.replace('/onboarding'), 300)
      return () => clearTimeout(t)
    }
  }, [onboarded])

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0d1117' },
          headerTintColor: '#e6edf3',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#0d1117' }
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="status" options={{ title: '设置' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="schedule" options={{ title: '定时任务' }} />
        <Stack.Screen name="skills" options={{ title: '技能市场' }} />
      </Stack>
    </>
  )
}
