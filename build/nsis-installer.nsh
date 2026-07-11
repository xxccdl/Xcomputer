; ═══════════════════════════════════════════════════════════════
;  Xcomputer 现代化 NSIS 安装程序 - 浅色现代风格
;  ═══════════════════════════════════════════════════════════════

; ── 头部品牌图片 ──
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${BUILD_RESOURCES_DIR}\nsis\header.bmp"
!define MUI_HEADERIMAGE_BITMAP_STRETCH "NoStretchNoCrop"
!define MUI_HEADERIMAGE_RIGHT

; ── 覆盖 electron-builder 预设的 metro 位图为自定义品牌位图 ──
!undef MUI_WELCOMEFINISHPAGE_BITMAP
!define MUI_WELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\nsis\sidebar.bmp"
!undef MUI_UNWELCOMEFINISHPAGE_BITMAP
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\nsis\sidebar-uninstall.bmp"

; ── 隐藏 welcome/finish 页底部 NSIS 品牌文字 ──
!define MUI_WELCOMEFINISHPAGE_SHOWPAGE_AFTER_WELCOMEPAGE_SHOW "!insertmacro HideBranding"
!define MUI_UNWELCOMEFINISHPAGE_SHOWPAGE_AFTER_UNWELCOMEPAGE_SHOW "!insertmacro HideBranding"

!macro HideBranding
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $1 $0 1201
  ShowWindow $1 ${SW_HIDE}
  GetDlgItem $1 $0 1202
  ShowWindow $1 ${SW_HIDE}
!macroend

; ── 欢迎页文案 ──
!define MUI_WELCOMEPAGE_TITLE "欢迎安装 Xcomputer"
!define MUI_WELCOMEPAGE_TEXT "本向导将引导您完成 Xcomputer AI 桌面自动化助手的安装。$\r$\n$\r$\nXcomputer 支持自然语言指令控制电脑操作，让日常任务更高效。$\r$\n$\r$\n点击「下一步」继续。"

; ── 完成页文案 ──
!define MUI_FINISHPAGE_TITLE "安装完成！"
!define MUI_FINISHPAGE_TEXT "Xcomputer 已成功安装到您的计算机。$\r$\n$\r$\n您可以从开始菜单或桌面快捷方式启动 Xcomputer。"
!define MUI_FINISHPAGE_LINK "访问官网 xxccdl.cn"
!define MUI_FINISHPAGE_LINK_LOCATION "http://xxccdl.cn"

; ── 卸载页文案 ──
!define MUI_UNWELCOMEFINISHPAGE_TEXT "此向导将从您的计算机中卸载 Xcomputer。$\r$\n$\r$\n点击「卸载」开始移除程序。"
