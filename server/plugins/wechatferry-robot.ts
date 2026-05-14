import EventEmitter from 'node:events'
import { access, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Socket } from '@rustup/nng'
import { archiveWechatMessage } from '../utils/message-archive'
import { createRobotScheduler } from '../utils/robot-scheduler'
import { delay } from '../utils'

async function resolveWechatferrySdkRoot() {
  const bundledSdkBaseDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../node_modules/@wechatferry/core/sdk',
  )
  const workspaceSdkBaseDir = resolve(
    process.cwd(),
    'node_modules/@wechatferry/core/sdk',
  )

  for (const baseDir of [bundledSdkBaseDir, workspaceSdkBaseDir]) {
    try {
      await access(resolve(baseDir, 'sdk.dll'))
      return baseDir
    }
    catch {
      try {
        const entries = await readdir(baseDir, { withFileTypes: true })

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue
          }

          const sdkRoot = resolve(baseDir, entry.name)
          await access(resolve(sdkRoot, 'sdk.dll'))
          return sdkRoot
        }
      }
      catch {
        continue
      }
    }
  }

  throw new Error(
    `WeChatFerry SDK directory not found. Checked: ${bundledSdkBaseDir}, ${workspaceSdkBaseDir}`,
  )
}

export default defineNitroPlugin(async (nitroApp) => {
  const config = useRuntimeConfig()

  if (!config.robot.enabled) {
    console.info('[robot] disabled. Set ROBOT_ENABLED=true to start WeChatFerry listener.')
    return
  }

  let agentModule: typeof import('@wechatferry/agent')
  let coreModule: typeof import('@wechatferry/core')
  let agent: import('@wechatferry/agent').WechatferryAgent

  try {
    agentModule = await import('@wechatferry/agent')
    coreModule = await import('@wechatferry/core')
    const sdkRoot = await resolveWechatferrySdkRoot()
    const sdk = new coreModule.WechatferrySDK({ sdkRoot })
    const wcf = Object.create(coreModule.Wechatferry.prototype) as import('@wechatferry/core').Wechatferry
    EventEmitter.call(wcf)
    Object.assign(wcf, {
      sdk,
      socket: new Socket({}),
    })
    agent = Object.create(agentModule.WechatferryAgent.prototype) as import('@wechatferry/agent').WechatferryAgent
    EventEmitter.call(agent)
    Object.assign(agent, {
      intervalId: null,
      isLoggedIn: false,
      isChecking: false,
      aliveCounter: 0,
      wcf,
      keepalive: false,
    })
  }
  catch (error) {
    console.error('[robot] failed to initialize WeChatFerry SDK. Robot features are disabled.', error)
    return
  }

  agent.on('message', async (message) => {
    const receivedMessage = message as Parameters<typeof agent.downloadFile>[0]
    console.log('++++++++++++++receive messages: ', JSON.stringify(message))
    try {
      await delay(5)
      await archiveWechatMessage({
        message: message as unknown as Record<string, unknown>,
        messageTypes: coreModule.WechatMessageType,
        inboxDir: config.robot.inboxDir,
        downloadTimeoutSeconds: config.robot.downloadTimeoutSeconds,
        downloadFile: async () => {
          if (!receivedMessage.extra) {
            receivedMessage.extra = receivedMessage.thumb.replace('.jpg', '.mp4')
          }
          return agent.downloadFile(receivedMessage, config.robot.downloadTimeoutSeconds)
        },
      })
    }
    catch (error) {
      console.error('[robot] failed to archive message', error)
    }
  })

  try {
    agent.start()
  }
  catch (error) {
    console.error('[robot] failed to start WeChatFerry agent. Robot features are disabled.', error)
    return
  }

  console.info('[robot] WeChatFerry listener started.')
  
  const scheduler = createRobotScheduler({
    sender: agent,
    tickSeconds: config.robot.scheduleTickSeconds,
    defaultTimeZone: config.robot.timezone || undefined,
  })

  await scheduler.start()

  nitroApp.hooks.hook('close', () => {
    scheduler.stop()
    agent.stop()
  })
})
