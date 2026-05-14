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
ROBOT_DOWNLOAD_TIMEOUT_SECONDS=30
ROBOT_TIMEZONE=
ROBOT_SCHEDULE_TICK_SECONDS=30
```

环境变量说明：

- `ROBOT_ENABLED`：是否启动 WeChatFerry 机器人与定时任务，`true` 时启用
- `ROBOT_INBOX_DIR`：消息归档目录
- `ROBOT_DOWNLOAD_TIMEOUT_SECONDS`：媒体文件下载超时时间，单位秒
- `ROBOT_TIMEZONE`：定时任务默认时区，可留空，留空时使用服务所在机器本地时区
- `ROBOT_SCHEDULE_TICK_SECONDS`：定时任务轮询间隔，单位秒；建议 `15-30`，小于 `15` 会回退到 `30`

## 归档目录

每条消息会写入一个独立目录：

```text
storage/inbox/YYYY-MM-DD/<timestamp>-<id>/
  message.json
  text.txt
  media.<ext>
```

`message.json` 保存消息类型、发送者、房间、时间、原始文本、媒体文件路径等元数据。

## 定时群通知

项目支持在服务端定时向微信群发送文本消息，并可配置 `@所有人`。

实现方式：

- 任务配置文件固定为项目根目录 `robot-schedules.json`
- 服务启动时加载任务配置并完成校验
- 调度器常驻内存，按分钟匹配任务
- 配置文件变更会在运行时自动刷新，无需重启服务

### 调度规则

当前支持两类任务：

- `weekly`：按星期几 + 时间发送
- `monthly`：按每月几号 + 时间发送

规则说明：

- 时间格式固定为 `HH:mm`
- `weekly.weekdays` 取值范围为 `1-7`，分别表示周一到周日
- `monthly.daysOfMonth` 取值范围为 `1-31`
- 月任务遇到短月不会补发，例如配置 `31` 时，2 月和部分 30 天月份会自动跳过
- 调度精度为分钟级，同一分钟内同一个任务只会触发一次

### 配置位置

在项目根目录的 `robot-schedules.json` 中配置任务数组：

```json
[
  {
    "id": "weekly-reminder",
    "enabled": true,
    "roomId": "123456@chatroom",
    "message": "记得提交周报",
    "mentionAll": true,
    "schedule": {
      "type": "weekly",
      "time": "18:00",
      "weekdays": [5]
    }
  },
  {
    "id": "monthly-summary",
    "enabled": true,
    "roomId": "123456@chatroom",
    "message": "请同步本月总结",
    "mentionAll": false,
    "schedule": {
      "type": "monthly",
      "time": "10:00",
      "daysOfMonth": [1]
    }
  }
]
```

### 任务字段

- `id`：任务唯一标识，必填，不能重复
- `enabled`：是否启用该任务
- `roomId`：目标群 ID，必填
- `message`：发送文本内容，必填
- `mentionAll`：是否 `@所有人`
- `timezone`：可选，单任务时区；未配置时使用 `ROBOT_TIMEZONE`，再未配置则使用服务本地时区
- `schedule.type`：`weekly` 或 `monthly`
- `schedule.time`：发送时间，格式 `HH:mm`
- `schedule.weekdays`：`weekly` 任务必填
- `schedule.daysOfMonth`：`monthly` 任务必填

### `@所有人` 说明

当 `mentionAll=true` 时，系统会：

- 自动把消息正文处理为 `@所有人` 加换行再加原始消息
- 调用 WeChatFerry 的 `sendText(roomId, text, ['notify@all'])`

注意事项：

- 机器人微信号通常需要在目标群中具备相应权限，`@所有人` 才会真正生效
- 如果微信本身限制该账号不能全员提醒，消息仍可能发送成功，但不会触发真正的全员提醒

### 启动日志与排查

服务启动时会输出已加载的任务摘要；非法配置会打印错误日志并跳过无效任务。

定时发送时会记录：

- `taskId`
- `roomId`
- 触发时间
- WeChatFerry 返回码

如果返回码不是 `0`，会记录告警日志，可据此优先排查微信客户端状态、WeChatFerry 连接状态和群权限问题。

## 脚本

- `npm run dev`：启动 Nuxt 开发服务
- `npm run build`：构建生产包
- `npm run preview`：预览构建产物
- `npm run lint`：代码检查
- `npm run test`：单元测试
- `npm run typecheck`：类型检查
