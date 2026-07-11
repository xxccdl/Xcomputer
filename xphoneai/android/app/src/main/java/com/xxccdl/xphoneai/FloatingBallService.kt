package com.xxccdl.xphoneai

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import android.view.*
import android.view.LayoutInflater
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.*

/**
 * 前台服务 + 悬浮球
 * 启动时显示持久通知，同时在其他应用上方显示可拖动悬浮球。
 * 点击悬浮球唤起 MainActivity。
 */
class FloatingBallService : Service() {

    companion object {
        const val CHANNEL_ID = "xphoneai_foreground"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.xxccdl.xphoneai.START_FLOATING"
        const val ACTION_STOP = "com.xxccdl.xphoneai.STOP_FLOATING"
        const val ACTION_UPDATE_STATE = "com.xxccdl.xphoneai.UPDATE_STATE"
        const val EXTRA_STATE = "state"
        const val EXTRA_TEXT = "text"

        var instance: FloatingBallService? = null
        var isRunning = false

        fun canDrawOverlays(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }
    }

    private var windowManager: WindowManager? = null
    private var floatView: View? = null
    private var params: WindowManager.LayoutParams? = null
    private var statusTextView: TextView? = null
    private var initialX = 0
    private var initialY = 0
    private var touchX = 0f
    private var touchY = 0f

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        isRunning = true
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        Log.d("FloatingBall", "服务 onCreate")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("FloatingBall", "onStartCommand action=${intent?.action}")
        when (intent?.action) {
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_UPDATE_STATE -> {
                val state = intent.getStringExtra(EXTRA_STATE) ?: "idle"
                val text = intent.getStringExtra(EXTRA_TEXT) ?: ""
                updateBallState(state, text)
                return START_STICKY
            }
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        addFloatingBall()
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        removeFloatingBall()
        isRunning = false
        instance = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "xphoneai 后台服务",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "保持 xphoneai 在后台运行，并显示悬浮球"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("xphoneai 运行中")
            .setContentText("悬浮球已显示，点击可快速唤起")
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun addFloatingBall() {
        Log.d("FloatingBall", "addFloatingBall 被调用，已有视图=${floatView != null}，权限=${canDrawOverlays(this)}")
        if (floatView != null) return
        if (!canDrawOverlays(this)) {
            Log.w("FloatingBall", "无悬浮窗权限，无法添加悬浮球")
            return
        }

        val inflater = LayoutInflater.from(this)
        val view = inflater.inflate(R.layout.floating_ball, null)
        floatView = view
        Log.d("FloatingBall", "悬浮球视图已创建")

        val icon = view.findViewById<ImageView>(R.id.floating_icon)
        statusTextView = view.findViewById(R.id.floating_status)
        val badge = view.findViewById<View>(R.id.floating_badge)

        params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE
            },
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = resources.displayMetrics.heightPixels / 3
        }

        icon.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params?.x ?: 0
                    initialY = params?.y ?: 0
                    touchX = event.rawX
                    touchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params?.x = initialX + (event.rawX - touchX).toInt()
                    params?.y = initialY + (event.rawY - touchY).toInt()
                    if (params != null && floatView != null) {
                        windowManager?.updateViewLayout(floatView, params)
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val dx = event.rawX - touchX
                    val dy = event.rawY - touchY
                    if (kotlin.math.abs(dx) < 10 && kotlin.math.abs(dy) < 10) {
                        // 点击唤起 App
                        badge.visibility = View.GONE
                        val launch = Intent(this, MainActivity::class.java).apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                        }
                        startActivity(launch)
                    }
                    true
                }
                else -> false
            }
        }

        try {
            windowManager?.addView(view, params)
            Log.d("FloatingBall", "悬浮球已添加到 WindowManager")
        } catch (e: Exception) {
            Log.e("FloatingBall", "添加悬浮球失败: ${e.message}")
        }
    }

    private fun removeFloatingBall() {
        floatView?.let {
            try { windowManager?.removeView(it) } catch (e: Exception) { /* ignore */ }
            floatView = null
        }
    }

    private fun updateBallState(state: String, text: String) {
        Log.d("FloatingBall", "updateBallState state=$state text=$text")
        val ctx = this
        val mainHandler = android.os.Handler(mainLooper)
        mainHandler.post {
            if (floatView == null && canDrawOverlays(ctx)) {
                addFloatingBall()
            }
            val badge = floatView?.findViewById<View>(R.id.floating_badge) ?: return@post
            val status = statusTextView ?: return@post

            when (state) {
                "thinking" -> {
                    badge.visibility = View.VISIBLE
                    status.text = "思考中..."
                }
                "tool" -> {
                    badge.visibility = View.VISIBLE
                    status.text = text.ifBlank { "执行中" }
                }
                "done" -> {
                    badge.visibility = View.VISIBLE
                    status.text = "完成"
                }
                else -> {
                    badge.visibility = View.GONE
                    status.text = ""
                }
            }
        }
    }
}
