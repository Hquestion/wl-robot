import { WechatferryAgent } from '@wechatferry/agent'
import { WechatMessageType } from '@wechatferry/core'
import { archiveWechatMessage } from '../utils/message-archive'

export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()

  if (!config.robot.enabled) {
    console.info('[robot] disabled. Set ROBOT_ENABLED=true to start WeChatFerry listener.')
    return
  }

  const agent = new WechatferryAgent()

  agent.on('message', async (message) => {
    try {
      await archiveWechatMessage({
        message: message as unknown as Record<string, unknown>,
        messageTypes: WechatMessageType,
        inboxDir: config.robot.inboxDir,
        downloadTimeoutSeconds: config.robot.downloadTimeoutSeconds,
        downloadFile: async () => agent.downloadFile(message, config.robot.downloadTimeoutSeconds),
      })
    }
    catch (error) {
      console.error('[robot] failed to archive message', error)
    }
  })

  agent.start()
  console.info('[robot] WeChatFerry listener started.')
})
