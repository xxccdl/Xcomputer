package com.xxccdl.xphoneai

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.io.ByteArrayOutputStream

/**
 * xphoneai 无障碍服务
 * 提供 UI 自动化能力：截屏、点击、输入、滑动、获取屏幕文字
 */
class XphoneaiAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "XphoneaiA11y"
        /** 单例引用，供 AccessibilityModule 调用 */
        @Volatile
        var instance: XphoneaiAccessibilityService? = null
            private set

        /** 检查服务是否已连接（无障碍是否已开启） */
        fun isConnected(): Boolean = instance != null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "无障碍服务已连接")
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 不处理事件，只提供服务能力
    }

    override fun onInterrupt() {
        Log.w(TAG, "无障碍服务被中断")
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        Log.i(TAG, "无障碍服务已断开")
        instance = null
        return super.onUnbind(intent)
    }

    /** 执行点击 (API 24+) */
    fun performTap(x: Float, y: Float, durationMs: Long = 50): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = android.graphics.Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    /** 执行滑动 (API 24+) */
    fun performSwipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long = 300): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = android.graphics.Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    /** 执行长按 */
    fun performLongPress(x: Float, y: Float): Boolean {
        return performTap(x, y, 1500)
    }

    /** 截屏 (API 30+) */
    fun takeScreenshot(callback: (String?) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            callback(null)
            return
        }
        // 使用独立线程执行位图压缩，避免阻塞主线程
        val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
        takeScreenshot(
            android.view.Display.DEFAULT_DISPLAY,
            executor,
            object : AccessibilityService.TakeScreenshotCallback {
                override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
                    try {
                        // ScreenshotResult 没有 bitmap 属性，需通过 hardwareBuffer + colorSpace 转换
                        val bitmap = Bitmap.wrapHardwareBuffer(result.hardwareBuffer, result.colorSpace)
                        if (bitmap != null) {
                            val stream = ByteArrayOutputStream()
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                            val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
                            bitmap.recycle()
                            stream.close()
                            callback(base64)
                        } else {
                            Log.e(TAG, "wrapHardwareBuffer 返回 null")
                            callback(null)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "截屏处理失败: ${e.message}", e)
                        callback(null)
                    } finally {
                        try { result.hardwareBuffer.close() } catch (_: Exception) {}
                        executor.shutdown()
                    }
                }

                override fun onFailure(errorCode: Int) {
                    Log.e(TAG, "截屏失败: errorCode=$errorCode")
                    executor.shutdown()
                    callback(null)
                }
            }
        )
    }

    /** 获取屏幕上所有可见文字和UI结构 (API 16+) */
    fun getScreenText(): String {
        val root = rootInActiveWindow ?: return "无法获取屏幕内容（无障碍服务可能未正确连接）"
        val sb = StringBuilder()
        val screenSize = resources.displayMetrics.let { "${it.widthPixels}x${it.heightPixels}" }
        sb.appendLine("屏幕尺寸: $screenSize")
        sb.appendLine("当前应用: ${getCurrentApp()}")
        sb.appendLine("---")
        collectNodeInfo(root, sb, 0)
        val result = sb.toString().trim()
        return if (result.length < 30) {
            "屏幕上未检测到可交互内容"
        } else {
            result
        }
    }

    /** 获取 UI 元素树（JSON 格式），供 AI 识别屏幕元素坐标 */
    fun getUiTree(): String {
        val root = rootInActiveWindow ?: return "[]"
        val sb = StringBuilder()
        sb.append("[")
        collectUiNodes(root, sb, 0)
        // 移除末尾逗号
        if (sb.length > 1 && sb[sb.length - 1] == ',') sb.deleteCharAt(sb.length - 1)
        sb.append("]")
        // 限制大小，避免超大 JSON
        val result = sb.toString()
        return if (result.length > 8000) result.take(8000) + "]" else result
    }

    /** 递归收集 UI 节点为 JSON 数组元素 */
    private fun collectUiNodes(node: AccessibilityNodeInfo, sb: StringBuilder, depth: Int) {
        if (depth > 8) return // 限制深度
        val cls = node.className?.toString() ?: ""
        val simpleName = cls.substringAfterLast('.').ifEmpty { "View" }
        val text = node.text?.toString()?.trim() ?: ""
        val desc = node.contentDescription?.toString()?.trim() ?: ""
        val rect = android.graphics.Rect()
        node.getBoundsInScreen(rect)
        val clickable = node.isClickable
        val viewId = node.viewIdResourceName ?: ""

        // 只收集有意义的节点
        val hasContent = text.isNotEmpty() || desc.isNotEmpty() || clickable ||
            simpleName.contains("Button|EditText|ImageView|RecyclerView|ListView|Tab|CheckBox|Switch|Spinner|SeekBar|TextView".toRegex())

        if (hasContent && rect.width() > 0 && rect.height() > 0) {
            val escapedText = text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ")
            val escapedDesc = desc.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ")
            val centerX = (rect.left + rect.right) / 2
            val centerY = (rect.top + rect.bottom) / 2
            sb.append("{")
            sb.append("\"type\":\"$simpleName\",")
            if (text.isNotEmpty()) sb.append("\"text\":\"$escapedText\",")
            if (desc.isNotEmpty()) sb.append("\"desc\":\"$escapedDesc\",")
            if (viewId.isNotEmpty()) sb.append("\"id\":\"$viewId\",")
            sb.append("\"clickable\":$clickable,")
            sb.append("\"bounds\":[$rect.left,$rect.top,$rect.right,$rect.bottom],")
            sb.append("\"center\":[$centerX,$centerY]")
            sb.append("},")
        }

        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectUiNodes(it, sb, depth + 1) }
        }
    }

    /** 递归收集节点信息：类型 + 文字 + 位置 + 可点击性 */
    private fun collectNodeInfo(node: AccessibilityNodeInfo, sb: StringBuilder, depth: Int) {
        val indent = "  ".repeat(depth.coerceAtMost(6))
        val cls = node.className?.toString() ?: ""
        val simpleName = cls.substringAfterLast('.').ifEmpty { "View" }

        // 收集文字信息
        val text = node.text?.toString()?.trim() ?: ""
        val desc = node.contentDescription?.toString()?.trim() ?: ""

        // 获取位置
        val rect = android.graphics.Rect()
        node.getBoundsInScreen(rect)
        val bounds = if (rect.width() > 0 && rect.height() > 0) {
            "(${rect.left},${rect.top})-(${rect.right},${rect.bottom})"
        } else null

        // 只输出有内容的节点（文字、描述、可点击）
        val clickable = node.isClickable
        val hasContent = text.isNotEmpty() || desc.isNotEmpty() || clickable || simpleName.contains("Button|EditText|ImageView|RecyclerView|ListView|Tab|CheckBox|Switch|Spinner|SeekBar".toRegex())

        if (hasContent) {
            val parts = mutableListOf<String>()
            parts.add(simpleName)
            if (text.isNotEmpty()) parts.add("文字=\"$text\"")
            if (desc.isNotEmpty() && desc != text) parts.add("描述=\"$desc\"")
            if (clickable) parts.add("可点击")
            if (bounds != null) parts.add("位置=$bounds")
            sb.appendLine("$indent${parts.joinToString(" ")}")
        }

        // 递归子节点
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectNodeInfo(it, sb, depth + 1) }
        }
    }

    /** 在指定坐标查找节点并点击 */
    fun tapNodeAt(x: Float, y: Float): Boolean {
        val root = rootInActiveWindow ?: return performTap(x, y)
        // 尝试找到坐标处的节点并执行点击
        val node = findNodeAt(root, x.toInt(), y.toInt())
        if (node != null) {
            // 尝试点击节点
            if (node.isClickable) {
                val result = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                if (result) return true
            }
            // 尝试点击父节点
            var parent = node.parent
            while (parent != null) {
                if (parent.isClickable) {
                    val result = parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    if (result) return true
                }
                parent = parent.parent
            }
        }
        // 回退到手势点击
        return performTap(x, y)
    }

    /** 查找坐标处的节点 */
    private fun findNodeAt(root: AccessibilityNodeInfo, x: Int, y: Int): AccessibilityNodeInfo? {
        val rect = Rect()
        root.getBoundsInScreen(rect)
        if (!rect.contains(x, y)) return null
        for (i in 0 until root.childCount) {
            val child = root.getChild(i) ?: continue
            val found = findNodeAt(child, x, y)
            if (found != null) return found
        }
        return root
    }

    /** 在指定坐标输入文本 */
    fun inputTextAt(x: Float, y: Float, text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = findNodeAt(root, x.toInt(), y.toInt())
        if (node != null) {
            // 查找可编辑的节点
            val editableNode = findEditableNode(node) ?: findEditableNode(root)
            if (editableNode != null) {
                val args = android.os.Bundle()
                args.putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text
                )
                return editableNode.performAction(
                    AccessibilityNodeInfo.ACTION_SET_TEXT, args
                )
            }
        }
        return false
    }

    /** 在当前焦点输入文本（无需指定坐标） */
    fun inputTextFocused(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        // 优先找已聚焦的可编辑节点
        val focused = findFocusedEditable(root)
        if (focused != null) {
            val args = android.os.Bundle()
            args.putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text
            )
            return focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        }
        // 回退：搜索任意可编辑节点
        val editable = findEditableNode(root)
        if (editable != null) {
            // 先聚焦再输入
            editable.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
            val args = android.os.Bundle()
            args.putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text
            )
            return editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        }
        return false
    }

    /** 查找已聚焦的可编辑节点 */
    private fun findFocusedEditable(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isEditable && node.isFocused) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            findFocusedEditable(child)?.let { return it }
        }
        return null
    }

    /** 获取坐标处节点的描述信息（点击后反馈用） */
    fun getNodeInfoAt(x: Float, y: Float): String? {
        val root = rootInActiveWindow ?: return null
        val node = findNodeAt(root, x.toInt(), y.toInt()) ?: return null
        val parts = mutableListOf<String>()
        node.className?.let { parts.add(it.toString().substringAfterLast('.')) }
        node.text?.let { if (it.isNotBlank()) parts.add("文字=\"${it}\"") }
        node.contentDescription?.let { if (it.isNotBlank()) parts.add("描述=\"${it}\"") }
        if (node.isClickable) parts.add("可点击")
        return if (parts.isEmpty()) null else parts.joinToString(" ")
    }

    /** 递归查找可编辑节点 */
    private fun findEditableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isEditable) return node
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            findEditableNode(child)?.let { return it }
        }
        return null
    }

    /** 按返回键 */
    fun pressBack(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    /** 按Home键 */
    fun pressHome(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_HOME)
    }

    /** 按最近任务键 */
    fun pressRecents(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_RECENTS)
    }

    /** 获取当前包名（前台App） */
    fun getCurrentApp(): String? {
        val root = rootInActiveWindow ?: return null
        return root.packageName?.toString()
    }

    /** 获取当前屏幕尺寸 */
    fun getScreenSize(): Pair<Int, Int> {
        val metrics = resources.displayMetrics
        return Pair(metrics.widthPixels, metrics.heightPixels)
    }
}
