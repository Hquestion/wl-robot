import { WechatferryAgent } from '@wechatferry/agent'
import { WechatMessageType } from '@wechatferry/core'
import { archiveWechatMessage } from '../utils/message-archive'
import { createRobotScheduler, loadRobotScheduleTasks } from '../utils/robot-scheduler'
import { delay } from '../utils'

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()

  if (!config.robot.enabled) {
    console.info('[robot] disabled. Set ROBOT_ENABLED=true to start WeChatFerry listener.')
    return
  }

  const agent = new WechatferryAgent()

  agent.on('message', async (message) => {
    console.log("++++++++++++++receive messages: ", JSON.stringify(message));
    try {
      await delay(5);
      await archiveWechatMessage({
        message: message as unknown as Record<string, unknown>,
        messageTypes: WechatMessageType,
        inboxDir: config.robot.inboxDir,
        downloadTimeoutSeconds: config.robot.downloadTimeoutSeconds,
        downloadFile: async () => {
          if (!message.extra) {
            message.extra = message.thumb.replace(".jpg", ".mp4");
          }
          return agent.downloadFile(message, config.robot.downloadTimeoutSeconds);
        },
      })
    }
    catch (error) {
      console.error('[robot] failed to archive message', error)
    }
  })

  agent.start()
  console.info('[robot] WeChatFerry listener started.')

  const scheduler = createRobotScheduler({
    sender: agent,
    tasks: loadRobotScheduleTasks(),
    tickSeconds: config.robot.scheduleTickSeconds,
    defaultTimeZone: config.robot.timezone || undefined,
  })

  scheduler.start()

  nitroApp.hooks.hook('close', () => {
    scheduler.stop()
    agent.stop()
  })
})
