import { useState, useRef, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload as UploadIcon,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  UploadCloud
} from 'lucide-react'
import { uploadSkill } from '../api'

// 允许的文件扩展名
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.json', '.zip']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// 表单初始值
const INITIAL_FORM = {
  name: '',
  description: '',
  author: '',
  category: '',
  tags: '',
  version: '1.0.0',
  content: ''
}

// 上传技能页面
function Upload() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [createdId, setCreatedId] = useState('')

  // 更新表单字段
  const updateField = (key: keyof typeof INITIAL_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // 校验文件类型
  const isValidFile = (f: File): boolean => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    return ALLOWED_EXTENSIONS.includes(ext)
  }

  // 处理文件选择
  const handleFileSelect = (f: File | null) => {
    if (!f) return
    if (!isValidFile(f)) {
      setErrorMsg(`不支持的文件类型，仅支持 ${ALLOWED_EXTENSIONS.join(', ')}`)
      setStatus('error')
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setErrorMsg('文件大小不能超过 10MB')
      setStatus('error')
      return
    }
    setFile(f)
    setStatus('idle')
    setErrorMsg('')
  }

  // 文件输入框 change
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    handleFileSelect(f)
  }

  // 拖拽相关
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
  }
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0] || null
    handleFileSelect(f)
  }

  // 移除已选文件
  const handleRemoveFile = () => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return bytes + ' B'
  }

  // 提交表单
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (status === 'uploading') return

    // 校验必填字段
    if (!form.name.trim() || !form.description.trim() || !form.author.trim() || !form.category.trim()) {
      setErrorMsg('请填写所有必填字段（名称、描述、作者、分类）')
      setStatus('error')
      return
    }

    setStatus('uploading')
    setProgress(0)
    setErrorMsg('')

    try {
      // 构造 FormData
      const formData = new FormData()
      formData.append('name', form.name.trim())
      formData.append('description', form.description.trim())
      formData.append('author', form.author.trim())
      formData.append('category', form.category.trim())
      formData.append('tags', form.tags.trim())
      formData.append('version', form.version.trim() || '1.0.0')
      formData.append('content', form.content)
      if (file) formData.append('file', file)

      const created = await uploadSkill(formData, (p) => setProgress(p))
      setCreatedId(created.id)
      setStatus('success')
    } catch (err) {
      setErrorMsg((err as Error).message || '上传失败')
      setStatus('error')
    }
  }

  // 重置表单
  const handleReset = () => {
    setForm(INITIAL_FORM)
    setFile(null)
    setProgress(0)
    setStatus('idle')
    setErrorMsg('')
    setCreatedId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // 成功状态
  if (status === 'success') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="glass-card p-8 text-center animate-scale-in">
          <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">上传成功！</h2>
          <p className="text-sm text-text-secondary mb-6">
            技能已成功发布到 XSkillHub 市场
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate(`/skills/${createdId}`)}
              className="btn-gradient px-5 py-2.5 rounded-lg text-sm font-medium"
            >
              查看详情
            </button>
            <button
              onClick={handleReset}
              className="px-5 py-2.5 rounded-lg text-sm font-medium border border-border text-text-secondary hover:text-text-primary hover:border-accent-blue/50 transition-colors"
            >
              继续上传
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      {/* 标题 */}
      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold text-text-primary mb-2 flex items-center gap-2">
          <UploadIcon className="w-7 h-7 text-accent-blue" />
          上传技能
        </h1>
        <p className="text-sm text-text-secondary">
          分享你的技能到 XSkillHub，让更多 Xcomputer 用户受益
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ============ 基础信息 ============ */}
        <div className="glass-card p-6 animate-fade-in-up">
          <h2 className="text-lg font-semibold text-text-primary mb-4">基础信息</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 名称 */}
            <div className="sm:col-span-2">
              <label className="block text-sm text-text-secondary mb-1.5">
                技能名称 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="例如：智能日程助手"
                className="input-base w-full px-3 py-2.5 text-sm"
                required
              />
            </div>

            {/* 描述 */}
            <div className="sm:col-span-2">
              <label className="block text-sm text-text-secondary mb-1.5">
                描述 <span className="text-danger">*</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="简要描述技能的功能和用途..."
                rows={3}
                className="input-base w-full px-3 py-2.5 text-sm resize-none"
                required
              />
            </div>

            {/* 作者 */}
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                作者 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.author}
                onChange={(e) => updateField('author', e.target.value)}
                placeholder="你的名字或昵称"
                className="input-base w-full px-3 py-2.5 text-sm"
                required
              />
            </div>

            {/* 版本 */}
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">版本</label>
              <input
                type="text"
                value={form.version}
                onChange={(e) => updateField('version', e.target.value)}
                placeholder="1.0.0"
                className="input-base w-full px-3 py-2.5 text-sm font-mono"
              />
            </div>

            {/* 分类 */}
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                分类 <span className="text-danger">*</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="input-base w-full px-3 py-2.5 text-sm cursor-pointer"
                required
              >
                <option value="">请选择分类</option>
                <option value="自动化">自动化</option>
                <option value="AI 助手">AI 助手</option>
                <option value="效率工具">效率工具</option>
                <option value="开发工具">开发工具</option>
                <option value="数据处理">数据处理</option>
                <option value="其他">其他</option>
              </select>
            </div>

            {/* 标签 */}
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">标签</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => updateField('tags', e.target.value)}
                placeholder="用逗号分隔，例如：日程,提醒,自动化"
                className="input-base w-full px-3 py-2.5 text-sm"
              />
            </div>
          </div>
        </div>

        {/* ============ 内容 ============ */}
        <div className="glass-card p-6 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <h2 className="text-lg font-semibold text-text-primary mb-4">技能内容</h2>
          <p className="text-xs text-text-muted mb-3">
            支持 Markdown 格式，描述技能的具体内容、使用方法等
          </p>
          <textarea
            value={form.content}
            onChange={(e) => updateField('content', e.target.value)}
            placeholder={'# 技能说明\n\n在这里编写技能的详细内容...\n\n## 使用方法\n\n1. ...\n2. ...'}
            rows={10}
            className="input-base w-full px-3 py-2.5 text-sm font-mono resize-y leading-relaxed"
          />
        </div>

        {/* ============ 文件上传 ============ */}
        <div className="glass-card p-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-lg font-semibold text-text-primary mb-4">技能文件</h2>
          <p className="text-xs text-text-muted mb-3">
            支持 {ALLOWED_EXTENSIONS.join(' / ')}，最大 10MB
          </p>

          {/* 拖拽区域 */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-accent-blue bg-accent-blue/5'
                : 'border-border hover:border-accent-blue/50 hover:bg-bg-hover'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleInputChange}
              accept={ALLOWED_EXTENSIONS.join(',')}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent-blue/15 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-accent-blue" />
                </div>
                <div className="text-left min-w-0">
                  <div className="text-sm text-text-primary font-mono truncate max-w-xs">
                    {file.name}
                  </div>
                  <div className="text-xs text-text-muted">{formatSize(file.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveFile()
                  }}
                  className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <UploadCloud
                  className={`w-10 h-10 mx-auto mb-3 transition-colors ${
                    dragOver ? 'text-accent-blue' : 'text-text-muted'
                  }`}
                />
                <p className="text-sm text-text-secondary mb-1">
                  拖拽文件到此处，或<span className="text-accent-blue">点击选择</span>
                </p>
                <p className="text-xs text-text-muted">
                  可选，未上传文件时仅保存内容文本
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ============ 上传进度 ============ */}
        {status === 'uploading' && (
          <div className="glass-card p-6 animate-scale-in">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 text-accent-blue animate-spin" />
              <span className="text-sm text-text-primary">正在上传... {progress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-bg-input overflow-hidden">
              <div
                className="h-full bg-gradient-brand transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* ============ 错误提示 ============ */}
        {status === 'error' && errorMsg && (
          <div className="glass-card p-4 border-danger/50 animate-scale-in">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-danger font-medium mb-1">上传失败</p>
                <p className="text-xs text-text-secondary">{errorMsg}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatus('idle')
                  setErrorMsg('')
                }}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============ 提交按钮 ============ */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={status === 'uploading'}
            className="px-5 py-2.5 rounded-lg text-sm font-medium border border-border text-text-secondary hover:text-text-primary hover:border-accent-blue/50 disabled:opacity-50 transition-colors"
          >
            重置
          </button>
          <button
            type="submit"
            disabled={status === 'uploading'}
            className="btn-gradient px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-70"
          >
            {status === 'uploading' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                上传中...
              </>
            ) : (
              <>
                <UploadIcon className="w-4 h-4" />
                发布技能
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Upload
