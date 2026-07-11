/**
 * Minimal test: load base model + LoRA adapter using node-llama-cpp.
 * Run: node scripts/test-lora-load.mjs
 */
import { getLlama } from 'node-llama-cpp'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const APPDATA = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
const BASE_MODEL = join(APPDATA, 'xcomputer', 'local-models', 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf')
const LORA_PATH = join(process.cwd(), 'resources', 'local-models', 'litex-lora.gguf')

console.log('[1/5] Checking files...')
console.log('  Base model:', BASE_MODEL, existsSync(BASE_MODEL) ? '✓' : '✗ MISSING')
console.log('  LoRA:', LORA_PATH, existsSync(LORA_PATH) ? '✓' : '✗ MISSING')
if (!existsSync(BASE_MODEL) || !existsSync(LORA_PATH)) {
  console.error('Required files missing. Aborting.')
  process.exit(1)
}

console.log('\n[2/5] Initializing llama.cpp...')
const llama = await getLlama({ maxThreads: 0 })
console.log('  GPU:', llama.gpu || 'cpu')

console.log('\n[3/5] Loading base model...')
const model = await llama.loadModel({
  modelPath: BASE_MODEL,
  gpuLayers: 'auto',
  useMmap: true
})
console.log('  Model loaded successfully')

console.log('\n[4/5] Creating context WITH LoRA (flashAttention=true)...')
const context = await model.createContext({
  contextSize: 4096,
  flashAttention: true,
  batchSize: 2048,
  threads: 0,
  lora: {
    adapters: [{ filePath: LORA_PATH, scale: 1.0 }],
    onLoadProgress: (p) => {
      if (Math.round(p * 100) % 25 === 0) {
        console.log(`  LoRA loading: ${Math.round(p * 100)}%`)
      }
    }
  }
})
console.log('  Context created successfully — LoRA loaded without crash!')

console.log('\n[5/5] Running inference test...')
const { LlamaCompletion } = await import('node-llama-cpp')
const sequence = context.getSequence()
const completion = new LlamaCompletion({ contextSequence: sequence })
try {
  const response = await completion.generateCompletion(
    '请用中文回复"模型运行正常"五个字。',
    { maxTokens: 32, temperature: 0.1 }
  )
  console.log('  Response:', response)
  console.log('\n✅ SUCCESS: LoRA loaded and inference works!')
} finally {
  sequence.dispose()
}

await context.dispose()
await model.dispose()
await llama.dispose()
process.exit(0)
