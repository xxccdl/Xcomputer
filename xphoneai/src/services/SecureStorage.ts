import * as SecureStore from 'expo-secure-store'

const KEY_API_KEY = 'deepseek_api_key'
const KEY_BASE_URL = 'deepseek_base_url'
const KEY_MODEL_PRESET = 'deepseek_model_preset'
const KEY_CUSTOM_MODEL = 'deepseek_custom_model'

/** 默认 DeepSeek API 地址（OpenAI 兼容格式） */
export const DEFAULT_BASE_URL = 'https://api.deepseek.com'

/** 模型预设 */
export type ModelPreset = 'pro' | 'flash' | 'custom'

export interface ModelConfig {
  preset: ModelPreset
  /** 自定义模型名（preset='custom' 时使用） */
  customModel: string
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  preset: 'pro',
  customModel: ''
}

/** 根据预设返回实际模型名 */
export function resolveModelName(config: ModelConfig): string {
  if (config.preset === 'pro') return 'deepseek-v4-pro'
  if (config.preset === 'flash') return 'deepseek-v4-flash'
  return config.customModel || 'deepseek-v4-pro'
}

/** 是否开启深度思考（pro 默认开，flash 默认关，custom 跟随 pro 行为） */
export function shouldEnableThinking(config: ModelConfig): boolean {
  return config.preset !== 'flash'
}

/** 读取 API Key（加密存储于 Keychain/Keystore） */
export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_API_KEY)
  } catch {
    return null
  }
}

/** 保存 API Key */
export async function setApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_API_KEY, key)
}

/** 删除 API Key */
export async function deleteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_API_KEY)
}

/** 读取自定义 Base URL（默认 https://api.deepseek.com） */
export async function getBaseUrl(): Promise<string> {
  try {
    const url = await SecureStore.getItemAsync(KEY_BASE_URL)
    return url || DEFAULT_BASE_URL
  } catch {
    return DEFAULT_BASE_URL
  }
}

/** 保存自定义 Base URL */
export async function setBaseUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_BASE_URL, url)
}

/** 读取模型配置 */
export async function getModelConfig(): Promise<ModelConfig> {
  try {
    const preset = (await SecureStore.getItemAsync(KEY_MODEL_PRESET)) as ModelPreset | null
    const customModel = await SecureStore.getItemAsync(KEY_CUSTOM_MODEL) || ''
    if (preset === 'pro' || preset === 'flash' || preset === 'custom') {
      return { preset, customModel }
    }
    return DEFAULT_MODEL_CONFIG
  } catch {
    return DEFAULT_MODEL_CONFIG
  }
}

/** 保存模型配置 */
export async function setModelConfig(config: ModelConfig): Promise<void> {
  await SecureStore.setItemAsync(KEY_MODEL_PRESET, config.preset)
  await SecureStore.setItemAsync(KEY_CUSTOM_MODEL, config.customModel)
}
