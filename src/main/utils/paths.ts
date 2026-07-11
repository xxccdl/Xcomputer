import { app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export function getPreloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

export function getRendererPath(): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return process.env['ELECTRON_RENDERER_URL']
  }
  return join(__dirname, '../renderer/index.html')
}

export function getUserDataDir(): string {
  return app.getPath('userData')
}

export function getSessionsDir(): string {
  return join(getUserDataDir(), 'sessions')
}

export function getTempDir(): string {
  return join(getUserDataDir(), 'temp')
}
