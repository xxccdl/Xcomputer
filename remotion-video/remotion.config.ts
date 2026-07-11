import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setConcurrency(4)
Config.setCodec('h264')
Config.setCrf(18)
Config.setPixelFormat('yuv420p')
// 使用本地 Chrome 浏览器，避免下载 Chromium
Config.setBrowserExecutable('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
