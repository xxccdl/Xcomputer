/**
 * 远程控制中继服务器
 * 在 Xcomputer 桌面端和手机端之间双向转发 WebSocket 消息
 *
 * 支持的消息协议：
 * [控制类] registered / paired / phone_disconnected / desktop_disconnected / error
 * [手机→电脑] command / confirm_response / ask_response / phone_command_response
 * [电脑→手机] chat_message / chat_step / chat_done / chat_error / confirm_request / ask_request / phone_command
 *
 * phone_command: 电脑AI向手机下发控制指令 { type:'phone_command', commandId, action, args }
 * phone_command_response: 手机返回执行结果 { type:'phone_command_response', commandId, success, data, error }
 */

const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/** @type {WebSocketServer|null} */
let wss = null;

/** 桌面端连接：code -> { ws, phoneWs: WebSocket|null } */
const desktopClients = new Map();

/** 手机端连接：code -> WebSocket */
const phoneClients = new Map();

/**
 * 生成 6 位配对码
 */
function generatePairCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 启动 WebSocket 中继服务器
 * @param {import('http').Server} server HTTP 服务器实例
 */
function startRelayServer(server) {
  wss = new WebSocketServer({ server, path: '/remote-ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const role = url.searchParams.get('role'); // 'desktop' | 'phone'
    const code = url.searchParams.get('code');

    console.log(`[remote-relay] 新连接: role=${role}, code=${code}`);

    if (role === 'desktop') {
      handleDesktopConnection(ws);
    } else if (role === 'phone' && code) {
      handlePhoneConnection(ws, code);
    } else {
      ws.send(JSON.stringify({ type: 'error', message: '无效的连接参数' }));
      ws.close();
    }
  });

  console.log('[remote-relay] WebSocket 中继服务器已启动，路径: /remote-ws');
}

/**
 * 处理桌面端连接
 */
function handleDesktopConnection(ws) {
  const code = generatePairCode();

  // 如果配对码已存在，重新生成
  while (desktopClients.has(code)) {
    code = generatePairCode();
  }

  desktopClients.set(code, { ws, phoneWs: null });
  console.log(`[remote-relay] 桌面端已注册，配对码: ${code}`);

  // 发送配对码
  ws.send(JSON.stringify({ type: 'registered', code }));

  // 心跳
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // 转发到配对的手机端
      const desktop = desktopClients.get(code);
      if (desktop && desktop.phoneWs && desktop.phoneWs.readyState === 1) {
        desktop.phoneWs.send(JSON.stringify(msg));
      }
    } catch (err) {
      console.error('[remote-relay] 桌面端消息解析失败:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[remote-relay] 桌面端断开，配对码: ${code}`);
    const desktop = desktopClients.get(code);
    if (desktop && desktop.phoneWs && desktop.phoneWs.readyState === 1) {
      desktop.phoneWs.send(JSON.stringify({ type: 'desktop_disconnected' }));
      desktop.phoneWs.close();
    }
    desktopClients.delete(code);
    phoneClients.delete(code);
  });

  ws.on('error', (err) => {
    console.error(`[remote-relay] 桌面端错误: ${code}`, err);
  });
}

/**
 * 处理手机端连接
 */
function handlePhoneConnection(ws, code) {
  const desktop = desktopClients.get(code);

  if (!desktop) {
    ws.send(JSON.stringify({ type: 'error', message: '配对码无效或已过期' }));
    ws.close();
    return;
  }

  if (desktop.phoneWs && desktop.phoneWs.readyState === 1) {
    ws.send(JSON.stringify({ type: 'error', message: '该设备已有手机连接' }));
    ws.close();
    return;
  }

  // 配对成功
  desktop.phoneWs = ws;
  phoneClients.set(code, ws);

  console.log(`[remote-relay] 手机端已配对，配对码: ${code}`);

  // 通知双方配对成功
  ws.send(JSON.stringify({ type: 'paired' }));
  if (desktop.ws.readyState === 1) {
    desktop.ws.send(JSON.stringify({ type: 'paired' }));
  }

  // 心跳
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // 转发到配对的桌面端
      if (desktop.ws.readyState === 1) {
        desktop.ws.send(JSON.stringify(msg));
      }
    } catch (err) {
      console.error('[remote-relay] 手机端消息解析失败:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[remote-relay] 手机端断开，配对码: ${code}`);
    if (desktop.ws.readyState === 1) {
      desktop.ws.send(JSON.stringify({ type: 'phone_disconnected' }));
    }
    if (desktop.phoneWs === ws) {
      desktop.phoneWs = null;
    }
    phoneClients.delete(code);
  });

  ws.on('error', (err) => {
    console.error(`[remote-relay] 手机端错误: ${code}`, err);
  });
}

/**
 * 心跳检测：清理断开的连接
 */
const heartbeatInterval = setInterval(() => {
  if (!wss) return;

  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

/**
 * 提供移动端网页
 */
function serveMobilePage(req, res) {
  const mobileHtmlPath = path.join(__dirname, '..', 'public', 'mobile.html');
  if (fs.existsSync(mobileHtmlPath)) {
    res.sendFile(mobileHtmlPath);
  } else {
    res.status(404).send('移动端页面不存在');
  }
}

/**
 * 提供 xphoneai App 下载/配对页面
 */
function serveXPhoneAIPage(req, res) {
  const htmlPath = path.join(__dirname, '..', 'public', 'xphoneai.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).send('xphoneai 页面不存在');
  }
}

module.exports = { startRelayServer, serveMobilePage, serveXPhoneAIPage };
