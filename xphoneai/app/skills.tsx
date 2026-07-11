import React, { useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { useSkillStore, type Skill } from '@/stores/skillStore'

export default function SkillsScreen() {
  const onlineSkills = useSkillStore((s) => s.onlineSkills)
  const installed = useSkillStore((s) => s.installed)
  const loading = useSkillStore((s) => s.loading)
  const fetchOnline = useSkillStore((s) => s.fetchOnline)
  const install = useSkillStore((s) => s.install)
  const uninstall = useSkillStore((s) => s.uninstall)

  useEffect(() => {
    fetchOnline()
  }, [])

  const isInstalled = (id: string) => installed.some((s) => s.id === id)

  const renderItem = ({ item }: { item: Skill }) => {
    const installedFlag = isInstalled(item.id)
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Feather name={item.icon as any} size={20} color="#58a6ff" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardAuthor}>{item.author || '社区'} · {item.steps || '?'} 步</Text>
          </View>
          <TouchableOpacity
            style={[styles.actionBtn, installedFlag && styles.actionBtnInstalled]}
            onPress={() => installedFlag ? uninstall(item.id) : install(item)}
          >
            <Feather
              name={installedFlag ? 'check' : 'download'}
              size={14}
              color={installedFlag ? '#3fb950' : '#58a6ff'}
            />
            <Text style={[styles.actionBtnText, installedFlag && styles.actionBtnTextInstalled]}>
              {installedFlag ? '已安装' : '安装'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.cardDesc}>{item.desc}</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={onlineSkills}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchOnline} tintColor="#58a6ff" />
        }
        ListHeaderComponent={
          <View style={styles.sectionHeader}>
            <Feather name="package" size={16} color="#8b949e" />
            <Text style={styles.sectionTitle}>技能市场</Text>
            <Text style={styles.sectionCount}>{onlineSkills.length} 个可用</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyState}>
              <Feather name="loader" size={40} color="#30363d" />
              <Text style={styles.emptyText}>加载中...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Feather name="package" size={48} color="#30363d" />
              <Text style={styles.emptyText}>暂无技能</Text>
              <Text style={styles.emptyDesc}>下拉刷新重试</Text>
            </View>
          )
        }
        renderItem={renderItem}
      />

      {/* 已安装区域 */}
      {installed.length > 0 && (
        <View style={styles.installedSection}>
          <View style={styles.sectionHeader}>
            <Feather name="check-circle" size={16} color="#3fb950" />
            <Text style={styles.sectionTitle}>已安装</Text>
            <Text style={styles.sectionCount}>{installed.length} 个</Text>
          </View>
          <FlatList
            data={installed}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={renderItem}
          />
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  list: { padding: 12, paddingBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingVertical: 10 },
  sectionTitle: { color: '#e6edf3', fontSize: 15, fontWeight: 'bold', flex: 1 },
  sectionCount: { color: '#8b949e', fontSize: 12 },
  card: {
    backgroundColor: '#161b22', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#21262d'
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#1a2332',
    alignItems: 'center', justifyContent: 'center'
  },
  cardInfo: { flex: 1 },
  cardName: { color: '#e6edf3', fontSize: 15, fontWeight: '600' },
  cardAuthor: { color: '#8b949e', fontSize: 11, marginTop: 2 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    backgroundColor: '#1a2332', borderWidth: 1, borderColor: '#58a6ff44'
  },
  actionBtnInstalled: { backgroundColor: '#0d1117', borderColor: '#3fb95044' },
  actionBtnText: { color: '#58a6ff', fontSize: 12, fontWeight: '600' },
  actionBtnTextInstalled: { color: '#3fb950' },
  cardDesc: { color: '#8b949e', fontSize: 13, lineHeight: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { color: '#8b949e', fontSize: 16, fontWeight: 'bold' },
  emptyDesc: { color: '#484f58', fontSize: 13 },
  installedSection: { padding: 12, borderTopWidth: 1, borderTopColor: '#21262d' }
})
