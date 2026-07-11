import React, { useState, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  ScrollView, Animated, NativeSyntheticEvent, NativeScrollEvent
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Feather from '@expo/vector-icons/Feather'
import { useQuickStore } from '@/stores/quickStore'

const { width } = Dimensions.get('window')

interface Page {
  icon: string
  iconColor: string
  title: string
  desc: string
}

const PAGES: Page[] = [
  {
    icon: 'smartphone',
    iconColor: '#58a6ff',
    title: 'AI 操控手机',
    desc: '一句话让 AI 帮你截屏、打开应用、发消息、设闹钟——解放双手。'
  },
  {
    icon: 'cpu',
    iconColor: '#3fb950',
    title: 'DeepSeek 驱动',
    desc: '由 DeepSeek V4 Pro 深度思考模型驱动，理解你的意图，自主完成任务。'
  },
  {
    icon: 'tool',
    iconColor: '#bc8cff',
    title: '20+ 工具能力',
    desc: '截屏、点击、输入、滑动、打开应用、发短信、定位、文件管理……一应俱全。'
  },
  {
    icon: 'shield',
    iconColor: '#f85149',
    title: '安全可控',
    desc: '高危操作需确认，悬浮球实时反馈状态，一切尽在掌握。'
  }
]

export default function OnboardingScreen() {
  const [pageIndex, setPageIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const dotAnim = useRef(new Animated.Value(0)).current
  const setOnboarded = useQuickStore((s) => s.setOnboarded)

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width)
    setPageIndex(idx)
    Animated.spring(dotAnim, { toValue: idx, useNativeDriver: true, friction: 8 }).start()
  }

  const handleNext = () => {
    if (pageIndex < PAGES.length - 1) {
      scrollRef.current?.scrollTo({ x: (pageIndex + 1) * width, animated: true })
    } else {
      handleFinish()
    }
  }

  const handleSkip = () => {
    handleFinish()
  }

  const handleFinish = () => {
    setOnboarded()
    router.replace('/')
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 跳过按钮 */}
      <View style={styles.skipBar}>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skipText}>跳过</Text>
        </TouchableOpacity>
      </View>

      {/* 轮播页 */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
      >
        {PAGES.map((page, i) => (
          <View key={i} style={styles.page}>
            <View style={[styles.iconWrap, { borderColor: page.iconColor + '33' }]}>
              <Feather name={page.icon as any} size={64} color={page.iconColor} />
            </View>
            <Text style={styles.title}>{page.title}</Text>
            <Text style={styles.desc}>{page.desc}</Text>
          </View>
        ))}
      </ScrollView>

      {/* 指示点 */}
      <View style={styles.dots}>
        {PAGES.map((_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              i === pageIndex ? styles.dotActive : styles.dotInactive
            ]}
          />
        ))}
      </View>

      {/* 底部按钮 */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.btn} onPress={handleNext}>
          <Text style={styles.btnText}>
            {pageIndex === PAGES.length - 1 ? '开始使用' : '下一步'}
          </Text>
          <Feather name="arrow-right" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  skipBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 },
  skipText: { color: '#8b949e', fontSize: 14 },
  scroll: { flex: 1 },
  page: { width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  iconWrap: {
    width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#161b22', borderWidth: 2, marginBottom: 32
  },
  title: { color: '#e6edf3', fontSize: 26, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  desc: { color: '#8b949e', fontSize: 16, lineHeight: 26, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotInactive: { backgroundColor: '#30363d' },
  dotActive: { backgroundColor: '#58a6ff', width: 24 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#238636', paddingVertical: 16, borderRadius: 12
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
})
