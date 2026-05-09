# wl-robot

基于 Nuxt 和 WeChatFerry Agent 的微信机器人归档项目。机器人账号接收文本、图片、视频、语音、文件等消息后，将消息元数据和可下载媒体保存到指定目录。

## 环境要求

- Node.js >= 23
- npm >= 10.9
- Windows 微信客户端及 WeChatFerry 运行环境

## 开发

```bash
npm install
npm run dev
```

默认不会启动机器人监听，避免开发服务启动后直接连接微信。需要监听消息时复制 `.env.example` 为 `.env`，并设置：

```bash
ROBOT_ENABLED=true
ROBOT_INBOX_DIR=storage/inbox
```

## 归档目录

每条消息会写入一个独立目录：

```text
storage/inbox/YYYY-MM-DD/<timestamp>-<id>/
  message.json
  text.txt
  media.<ext>
```

`message.json` 保存消息类型、发送者、房间、时间、原始文本、媒体文件路径等元数据。

## 脚本

- `npm run dev`：启动 Nuxt 开发服务
- `npm run build`：构建生产包
- `npm run preview`：预览构建产物
- `npm run lint`：代码检查
- `npm run test`：单元测试
- `npm run typecheck`：类型检查
