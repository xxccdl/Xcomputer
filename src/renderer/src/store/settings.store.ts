import { create } from 'zustand'
import type { Settings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'

interface SettingsState {
  settings: Settings
  loaded: boolean
  setSettings: (s: Settings) => void
  setLoaded: (b: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  setSettings: (s) => set({ settings: s, loaded: true }),
  setLoaded: (b) => set({ loaded: b })
}))
