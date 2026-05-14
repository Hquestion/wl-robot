import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildRobotScheduleTriggerKey,
  isRobotScheduleTaskDue,
  resolveRobotScheduleMessage,
  resolveRobotScheduleMentions,
  validateRobotScheduleTasks,
  type RobotScheduleTask,
} from './robot-schedule'

type RobotScheduleLogger = Pick<typeof console, 'info' | 'warn' | 'error'>

type RobotTextSender = {
  sendText: (conversationId: string, text: string, mentionIdList?: string[]) => number
}

type ExecuteRobotScheduleTickInput = {
  sender: RobotTextSender
  tasks: RobotScheduleTask[]
  triggeredKeys: Set<string>
  now?: Date
  defaultTimeZone?: string
  logger?: RobotScheduleLogger
}

type CreateRobotSchedulerInput = {
  sender: RobotTextSender
  tickSeconds?: number
  defaultTimeZone?: string
  logger?: RobotScheduleLogger
}

type RobotScheduleConfigStore = {
  tasks: RobotScheduleTask[]
  signature: string
}

type LoadedRobotScheduleTasks = {
  tasks: RobotScheduleTask[]
  changed: boolean
}

const robotSchedulesConfigPath = resolve(process.cwd(), 'robot-schedules.json')
type SchedulerTimer = ReturnType<typeof setInterval>

function logRobotScheduleSummary(tasks: RobotScheduleTask[], logger: RobotScheduleLogger) {
  if (tasks.length > 0) {
    const summary = tasks.map(task => `${task.id}(${task.roomId})`).join(', ')
    logger.info(`[robot] loaded ${tasks.length} schedule task(s): ${summary}`)
    return
  }

  logger.info('[robot] loaded 0 schedule task(s).')
}

async function readRobotScheduleConfigFile() {
  const fileStat = await stat(robotSchedulesConfigPath)
  const content = await readFile(robotSchedulesConfigPath, 'utf8')

  return {
    content,
    signature: `${fileStat.mtimeMs}:${fileStat.size}`,
  }
}

export async function loadRobotScheduleTasks(
  logger: RobotScheduleLogger = console,
  previous?: RobotScheduleConfigStore,
): Promise<LoadedRobotScheduleTasks> {
  let loadedConfig: Awaited<ReturnType<typeof readRobotScheduleConfigFile>>

  try {
    loadedConfig = await readRobotScheduleConfigFile()
  }
  catch (error) {
    logger.error(`[robot] failed to read schedule config from ${robotSchedulesConfigPath}`, error)
    return {
      tasks: previous?.tasks || [],
      changed: false,
    }
  }

  if (previous && previous.signature === loadedConfig.signature) {
    return {
      tasks: previous.tasks,
      changed: false,
    }
  }

  let parsedConfig: unknown

  try {
    parsedConfig = JSON.parse(loadedConfig.content)
  }
  catch (error) {
    logger.error(`[robot] failed to parse schedule config from ${robotSchedulesConfigPath}`, error)
    return {
      tasks: previous?.tasks || [],
      changed: false,
    }
  }

  const { tasks, errors } = validateRobotScheduleTasks(parsedConfig)

  for (const error of errors) {
    logger.error(error)
  }

  if (errors.length > 0) {
    logger.warn(`[robot] keeping previous schedule tasks because ${robotSchedulesConfigPath} is invalid.`)
    return {
      tasks: previous?.tasks || [],
      changed: false,
    }
  }

  logRobotScheduleSummary(tasks, logger)

  if (previous) {
    previous.tasks = tasks
    previous.signature = loadedConfig.signature
  }

  return {
    tasks,
    changed: true,
  }
}

export function executeRobotScheduleTick(input: ExecuteRobotScheduleTickInput) {
  const now = input.now || new Date()
  const logger = input.logger || console
  pruneTriggeredKeys(input.triggeredKeys, now, input.defaultTimeZone, input.tasks)

  const results: Array<{ taskId: string, roomId: string, returnCode: number }> = []

  for (const task of input.tasks) {
    if (!isRobotScheduleTaskDue(task, now, input.defaultTimeZone)) {
      continue
    }

    const triggerKey = buildRobotScheduleTriggerKey(task, now, input.defaultTimeZone)
    if (input.triggeredKeys.has(triggerKey)) {
      continue
    }

    input.triggeredKeys.add(triggerKey)

    try {
      const returnCode = input.sender.sendText(
        task.roomId,
        resolveRobotScheduleMessage(task),
        resolveRobotScheduleMentions(task),
      )
      results.push({
        taskId: task.id,
        roomId: task.roomId,
        returnCode,
      })

      if (returnCode === 0) {
        logger.info(`[robot] schedule sent taskId=${task.id} roomId=${task.roomId} at=${triggerKey.slice(0, 16)} returnCode=${returnCode}`)
      }
      else {
        logger.warn(`[robot] schedule send returned non-zero taskId=${task.id} roomId=${task.roomId} at=${triggerKey.slice(0, 16)} returnCode=${returnCode}`)
      }
    }
    catch (error) {
      logger.error(`[robot] schedule failed taskId=${task.id} roomId=${task.roomId} at=${triggerKey.slice(0, 16)}`, error)
    }
  }

  return results
}

export function createRobotScheduler(input: CreateRobotSchedulerInput) {
  const logger = input.logger || console
  const triggeredKeys = new Set<string>()
  const tickMs = normalizeTickSeconds(input.tickSeconds) * 1000
  const configStore: RobotScheduleConfigStore = {
    tasks: [],
    signature: '',
  }
  let timer: SchedulerTimer | undefined

  const tick = async () => {
    const loaded = await loadRobotScheduleTasks(logger, configStore)

    if (loaded.changed) {
      pruneTriggeredKeys(triggeredKeys, new Date(), input.defaultTimeZone, loaded.tasks)
    }

    executeRobotScheduleTick({
      sender: input.sender,
      tasks: loaded.tasks,
      triggeredKeys,
      defaultTimeZone: input.defaultTimeZone,
      logger,
    })
  }

  return {
    async start() {
      if (timer) {
        return
      }

      await tick()
      timer = setInterval(() => {
        void tick()
      }, tickMs)
      logger.info(`[robot] schedule scheduler started, tick=${tickMs}ms, config=${robotSchedulesConfigPath}`)
    },
    stop() {
      if (!timer) {
        return
      }

      clearInterval(timer)
      timer = undefined
      logger.info('[robot] schedule scheduler stopped.')
    },
  }
}

function normalizeTickSeconds(value: number | undefined) {
  if (!value || !Number.isFinite(value) || value < 15) {
    return 30
  }

  return Math.floor(value)
}

function pruneTriggeredKeys(triggeredKeys: Set<string>, now: Date, defaultTimeZone: string | undefined, tasks: RobotScheduleTask[]) {
  if (triggeredKeys.size === 0) {
    return
  }

  const activeMinutePrefixes = new Set(
    tasks.map(task => buildRobotScheduleTriggerKey(task, now, defaultTimeZone).slice(0, 16)),
  )

  for (const key of triggeredKeys) {
    if (!activeMinutePrefixes.has(key.slice(0, 16))) {
      triggeredKeys.delete(key)
    }
  }
}
