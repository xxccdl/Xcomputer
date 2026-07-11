package com.xxccdl.xphoneai

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

/**
 * 无障碍服务原生模块
 * 提供 JS 端调用接口：检查状态、跳转设置、执行UI操作
 */
@ReactModule(name = AccessibilityModule.NAME)
class AccessibilityModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "XphoneaiAccessibility"
    }

    override fun getName(): String = NAME

    /** 检查无障碍服务是否已开启 */
    @ReactMethod
    fun isAccessibilityEnabled(promise: Promise) {
        try {
            val enabled = isAccessibilitySettingsOn(reactContext)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("A11Y_CHECK_ERROR", e.message)
        }
    }

    /** 跳转到无障碍设置页面 */
    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("A11Y_OPEN_ERROR", e.message)
        }
    }

    /** 执行点击 */
    @ReactMethod
    fun performTap(x: Double, y: Double, promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val result = service.performTap(x.toFloat(), y.toFloat())
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("A11Y_TAP_ERROR", e.message)
        }
    }

    /** 执行滑动 */
    @ReactMethod
    fun performSwipe(
        startX: Double, startY: Double, endX: Double, endY: Double,
        duration: Double, promise: Promise
    ) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val result = service.performSwipe(
                startX.toFloat(), startY.toFloat(),
                endX.toFloat(), endY.toFloat(),
                duration.toLong()
            )
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("A11Y_SWIPE_ERROR", e.message)
        }
    }

    /** 截屏 (返回 base64 JPEG) */
    @ReactMethod
    fun takeScreenshot(promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            service.takeScreenshot { base64 ->
                if (base64 != null) {
                    promise.resolve(base64)
                } else {
                    promise.reject("A11Y_SCREENSHOT_FAILED", "截屏失败，可能系统版本不支持")
                }
            }
        } catch (e: Exception) {
            promise.reject("A11Y_SCREENSHOT_ERROR", e.message)
        }
    }

    /** 获取屏幕文字 */
    @ReactMethod
    fun getScreenText(promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val text = service.getScreenText()
            promise.resolve(text)
        } catch (e: Exception) {
            promise.reject("A11Y_TEXT_ERROR", e.message)
        }
    }

    /** 在指定坐标输入文本 */
    @ReactMethod
    fun inputText(x: Double, y: Double, text: String, promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val result = service.inputTextAt(x.toFloat(), y.toFloat(), text)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("A11Y_INPUT_ERROR", e.message)
        }
    }

    /** 按键 (back/home/recents) */
    @ReactMethod
    fun pressKey(key: String, promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val result = when (key.lowercase()) {
                "back" -> service.pressBack()
                "home" -> service.pressHome()
                "recents", "recent" -> service.pressRecents()
                else -> false
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("A11Y_KEY_ERROR", e.message)
        }
    }

    /** 获取当前前台App包名 */
    @ReactMethod
    fun getCurrentApp(promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val pkg = service.getCurrentApp()
            promise.resolve(pkg ?: "unknown")
        } catch (e: Exception) {
            promise.reject("A11Y_APP_ERROR", e.message)
        }
    }

    /** 获取屏幕尺寸 */
    @ReactMethod
    fun getScreenSize(promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val (w, h) = service.getScreenSize()
            val map = Arguments.createMap()
            map.putInt("width", w)
            map.putInt("height", h)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("A11Y_SIZE_ERROR", e.message)
        }
    }

    /** 启动App（通过包名） */
    @ReactMethod
    fun launchApp(packageName: String, promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val intent = pm.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                // 先 resolve，让 JS 线程能立即处理回调并发送 WebSocket 响应
                promise.resolve(true)
                // 延迟 300ms 再启动 Activity，给 JS 线程足够时间完成 WebSocket 响应发送
                // 否则 App 切到后台后 JS 线程暂停，WebSocket 响应无法发出，桌面端超时
                Handler(Looper.getMainLooper()).postDelayed({
                    try {
                        reactContext.startActivity(intent)
                    } catch (e: Exception) {
                        Log.e("AccessibilityModule", "延迟启动App失败: ${e.message}")
                    }
                }, 300)
            } else {
                promise.reject("APP_NOT_FOUND", "未找到App: $packageName（可能未安装或无启动入口）")
            }
        } catch (e: Exception) {
            promise.reject("APP_LAUNCH_ERROR", e.message)
        }
    }

    /** 列出已安装的App */
    @ReactMethod
    fun listInstalledApps(promise: Promise) {
        try {
            val pm = reactContext.packageManager
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            val result = Arguments.createArray()
            for (app in apps) {
                // 过滤系统应用，只返回第三方应用和常用系统应用
                val isSystem = (app.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                if (isSystem && app.packageName !in setOf(
                        "com.android.settings", "com.android.contacts",
                        "com.android.dialer", "com.android.camera",
                        "com.android.calendar", "com.android.chrome",
                        "com.android.email", "com.android.mms"
                    )) continue

                val map = Arguments.createMap()
                map.putString("package", app.packageName)
                map.putString("name", pm.getApplicationLabel(app).toString())
                map.putBoolean("isSystem", isSystem)
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("APP_LIST_ERROR", e.message)
        }
    }

    /** 在当前焦点输入文本（无需坐标） */
    @ReactMethod
    fun inputTextFocused(text: String, promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val result = service.inputTextFocused(text)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("A11Y_INPUT_ERROR", e.message)
        }
    }

    /** 获取坐标处的节点信息（点击反馈用） */
    @ReactMethod
    fun getNodeInfoAt(x: Double, y: Double, promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val info = service.getNodeInfoAt(x.toFloat(), y.toFloat())
            promise.resolve(info ?: "未知节点")
        } catch (e: Exception) {
            promise.reject("A11Y_NODE_ERROR", e.message)
        }
    }

    /** 获取 UI 元素树（JSON），供 AI 识别屏幕元素坐标 */
    @ReactMethod
    fun getUiTree(promise: Promise) {
        val service = XphoneaiAccessibilityService.instance
        if (service == null) {
            promise.reject("A11Y_NOT_ENABLED", "无障碍服务未开启")
            return
        }
        try {
            val tree = service.getUiTree()
            promise.resolve(tree)
        } catch (e: Exception) {
            promise.reject("A11Y_TREE_ERROR", e.message)
        }
    }

    /** 检查无障碍服务是否在设置列表中已开启 */
    private fun isAccessibilitySettingsOn(context: Context): Boolean {
        val expectedComponent = ComponentName(context, XphoneaiAccessibilityService::class.java)
        val expectedFlat = expectedComponent.flattenToString()
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val splitter = TextUtils.SimpleStringSplitter(':').apply { setString(enabledServices) }
        while (splitter.hasNext()) {
            if (splitter.next().equals(expectedFlat, ignoreCase = true)) {
                return true
            }
        }
        return false
    }
}
