import robotSchedules from '../config/robot-schedules'
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
  tasks: RobotScheduleTask[]
  tickSeconds?: number
  defaultTimeZone?: string
  logger?: RobotScheduleLogger
}

export function loadRobotScheduleTasks(logger: RobotScheduleLogger = console) {
  const { tasks, errors } = validateRobotScheduleTasks(robotSchedules)

  for (const error of errors) {
    logger.error(error)
  }

  if (tasks.length > 0) {
    const summary = tasks.map(task => `${task.id}(${task.roomId})`).join(', ')
    logger.info(`[robot] loaded ${tasks.length} schedule task(s): ${summary}`)
  }
  else {
    logger.info('[robot] loaded 0 schedule task(s).')
  }

  return tasks
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
  let timer: NodeJS.Timeout | undefined

  const tick = () => executeRobotScheduleTick({
    sender: input.sender,
    tasks: input.tasks,
    triggeredKeys,
    defaultTimeZone: input.defaultTimeZone,
    logger,
  })

  return {
    start() {
      if (timer || input.tasks.length === 0) {
        return
      }

      tick()
      timer = setInterval(tick, tickMs)
      logger.info(`[robot] schedule scheduler started with ${input.tasks.length} task(s), tick=${tickMs}ms`)
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
