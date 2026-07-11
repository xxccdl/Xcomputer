package com.xxccdl.xphoneai

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

/**
 * xphoneai 通用原生模块
 * - 悬浮球 / 前台服务 控制
 * - 任务完成通知
 * - 电池优化白名单检查/跳转
 */
@ReactModule(name = XphoneaiModule.NAME)
class XphoneaiModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "XphoneaiNative"
        const val NOTIFY_CHANNEL_ID = "xphoneai_task_done"
        const val NOTIFY_ID = 2001
    }

    override fun getName(): String = NAME

    /** 检查是否有悬浮窗权限 */
    @ReactMethod
    fun canDrawOverlays(promise: Promise) {
        promise.resolve(FloatingBallService.canDrawOverlays(reactContext))
    }

    /** 跳转到悬浮窗权限设置 */
    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactContext.packageName}")
            ).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_OPEN_ERROR", e.message)
        }
    }

    /** 启动悬浮球 + 前台服务 */
    @ReactMethod
    fun startFloatingService(promise: Promise) {
        try {
            if (!FloatingBallService.canDrawOverlays(reactContext)) {
                promise.reject("NO_OVERLAY_PERMISSION", "没有悬浮窗权限")
                return
            }
            val intent = Intent(reactContext, FloatingBallService::class.java).apply {
                action = FloatingBallService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("SECURITY_ERROR", "启动前台服务被拒绝: ${e.message}")
        } catch (e: Exception) {
            promise.reject("START_SERVICE_ERROR", e.message)
        }
    }

    /** 停止悬浮球 + 前台服务 */
    @ReactMethod
    fun stopFloatingService(promise: Promise) {
        try {
            val intent = Intent(reactContext, FloatingBallService::class.java).apply {
                action = FloatingBallService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_SERVICE_ERROR", e.message)
        }
    }

    /** 悬浮球是否在运行 */
    @ReactMethod
    fun isFloatingServiceRunning(promise: Promise) {
        promise.resolve(FloatingBallService.isRunning)
    }

    /** 更新悬浮球状态（thinking / tool / done / idle） */
    @ReactMethod
    fun updateFloatingState(state: String, text: String?, promise: Promise) {
        try {
            val intent = Intent(reactContext, FloatingBallService::class.java).apply {
                action = FloatingBallService.ACTION_UPDATE_STATE
                putExtra(FloatingBallService.EXTRA_STATE, state)
                putExtra(FloatingBallService.EXTRA_TEXT, text ?: "")
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_STATE_ERROR", e.message)
        }
    }

    /** 发送任务完成通知 */
    @ReactMethod
    fun sendTaskDoneNotification(title: String, message: String, promise: Promise) {
        try {
            createNotifyChannel()
            val intent = Intent(reactContext, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                reactContext,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(reactContext, NOTIFY_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(message)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build()
            val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFY_ID, notification)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIFY_ERROR", e.message)
        }
    }

    /** 检查是否在电池优化白名单中 */
    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        val ignored = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pm.isIgnoringBatteryOptimizations(reactContext.packageName)
        } else {
            true
        }
        promise.resolve(ignored)
    }

    /** 请求加入电池优化白名单（直接弹系统确认框，失败则跳转设置页） */
    @ReactMethod
    fun requestBatteryOptimizationWhitelist(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            promise.resolve(true)
            return
        }
        try {
            // 优先尝试直接弹出系统确认框
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            try {
                // fallback：跳转到电池优化设置列表页，让用户手动操作
                val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(fallback)
                promise.resolve(true)
            } catch (e2: Exception) {
                promise.reject("BATTERY_OPTIM_OPEN_ERROR", e2.message)
            }
        }
    }

    private fun createNotifyChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFY_CHANNEL_ID,
                "任务完成通知",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "AI 任务执行完成后提醒"
            }
            val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    /** 当前语音识别器实例 */
    private var speechRecognizer: SpeechRecognizer? = null

    /** 开始语音识别，返回识别到的文本 */
    @ReactMethod
    fun startSpeechRecognition(promise: Promise) {
        try {
            if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                promise.reject("SPEECH_UNAVAILABLE", "语音识别不可用")
                return
            }
            // 清理旧实例
            speechRecognizer?.destroy()
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            }

            speechRecognizer?.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}

                override fun onError(error: Int) {
                    val msg = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH -> "未识别到语音"
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "语音输入超时"
                        SpeechRecognizer.ERROR_AUDIO -> "录音错误"
                        SpeechRecognizer.ERROR_NETWORK -> "网络错误"
                        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "网络超时"
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "识别器忙碌"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "麦克风权限不足"
                        else -> "识别错误($error)"
                    }
                    speechRecognizer?.destroy()
                    speechRecognizer = null
                    promise.reject("SPEECH_ERROR", msg)
                }

                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = matches?.firstOrNull() ?: ""
                    speechRecognizer?.destroy()
                    speechRecognizer = null
                    promise.resolve(text)
                }
            })

            speechRecognizer?.startListening(intent)
        } catch (e: Exception) {
            promise.reject("SPEECH_INIT_ERROR", e.message)
        }
    }

    /** 取消语音识别 */
    @ReactMethod
    fun cancelSpeechRecognition(promise: Promise) {
        try {
            speechRecognizer?.stopListening()
            speechRecognizer?.destroy()
            speechRecognizer = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SPEECH_CANCEL_ERROR", e.message)
        }
    }
}
