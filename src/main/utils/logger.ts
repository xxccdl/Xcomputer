import log from 'electron-log'
import { app } from 'electron'
import { join } from 'path'

log.transports.file.level = 'info'
log.transports.file.resolvePathFn = () => join(app.getPath('logs'), 'main.log')
log.transports.console.level = 'debug'

export const logger = log.scope('main')
