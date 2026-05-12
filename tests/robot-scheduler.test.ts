import { describe, expect, it, vi } from 'vitest'
import {
  buildRobotScheduleTriggerKey,
  isRobotScheduleTaskDue,
  resolveRobotScheduleMessage,
  resolveRobotScheduleMentions,
  validateRobotScheduleTasks,
  type RobotScheduleTask,
} from '../server/utils/robot-schedule'
import { executeRobotScheduleTick } from '../server/utils/robot-scheduler'

describe('robot schedule validation', () => {
  it('accepts valid weekly and monthly tasks and filters disabled ones', () => {
    const { tasks, errors } = validateRobotScheduleTasks([
      {
        id: 'weekly-1',
        enabled: true,
        roomId: 'room-a',
        message: 'hello',
        mentionAll: true,
        schedule: {
          type: 'weekly',
          time: '09:30',
          weekdays: [1, 3],
        },
      },
      {
        id: 'monthly-off',
        enabled: false,
        roomId: 'room-b',
        message: 'skip',
        mentionAll: true,
        schedule: {
          type: 'monthly',
          time: '10:00',
          daysOfMonth: [1, 15],
        },
      },
    ])

    expect(errors).toEqual([])
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.id).toBe('weekly-1')
  })

  it('rejects invalid configs', () => {
    const { tasks, errors } = validateRobotScheduleTasks([
      {
        id: 'dup',
        enabled: true,
        roomId: '',
        message: 'hello',
        mentionAll: true,
        schedule: {
          type: 'weekly',
          time: '9:00',
          weekdays: [],
        },
      },
      {
        id: 'dup',
        enabled: true,
        roomId: 'room-b',
        message: '',
        mentionAll: true,
        schedule: {
          type: 'monthly',
          time: '10:00',
          daysOfMonth: [32],
        },
      },
    ])

    expect(tasks).toEqual([])
    expect(errors).toEqual(expect.arrayContaining([
      '[robot] task[0].roomId must be a non-empty string.',
      '[robot] task[0].schedule.time "9:00" must use HH:mm format.',
      '[robot] task[1].message must be a non-empty string.',
      '[robot] duplicate schedule task id "dup".',
      '[robot] task[1].schedule.daysOfMonth must contain integers between 1 and 31.',
    ]))
  })
})

describe('robot schedule matching', () => {
  it('matches weekly task on configured weekday and time', () => {
    const task = createWeeklyTask({ weekdays: [2], time: '09:30' })
    const now = new Date('2026-05-12T09:30:00')

    expect(isRobotScheduleTaskDue(task, now)).toBe(true)
  })

  it('does not match weekly task when weekday or time differs', () => {
    const task = createWeeklyTask({ weekdays: [1], time: '09:30' })

    expect(isRobotScheduleTaskDue(task, new Date('2026-05-12T09:30:00'))).toBe(false)
    expect(isRobotScheduleTaskDue(task, new Date('2026-05-11T09:31:00'))).toBe(false)
  })

  it('matches monthly task on configured day and time', () => {
    const task = createMonthlyTask({ daysOfMonth: [12], time: '18:45' })

    expect(isRobotScheduleTaskDue(task, new Date('2026-05-12T18:45:00'))).toBe(true)
  })

  it('does not match monthly task when day differs, including short months', () => {
    const task = createMonthlyTask({ daysOfMonth: [31], time: '08:00' })

    expect(isRobotScheduleTaskDue(task, new Date('2026-04-30T08:00:00'))).toBe(false)
    expect(isRobotScheduleTaskDue(task, new Date('2026-02-28T08:00:00'))).toBe(false)
  })
})

describe('robot scheduler execution', () => {
  it('deduplicates triggers within the same minute', () => {
    const sendText = vi.fn(() => 0)
    const task = createWeeklyTask({ weekdays: [2], time: '09:30' })
    const triggeredKeys = new Set<string>()
    const now = new Date('2026-05-12T09:30:05')

    executeRobotScheduleTick({
      sender: { sendText },
      tasks: [task],
      triggeredKeys,
      now,
      logger: createSilentLogger(),
    })

    executeRobotScheduleTick({
      sender: { sendText },
      tasks: [task],
      triggeredKeys,
      now: new Date('2026-05-12T09:30:45'),
      logger: createSilentLogger(),
    })

    expect(sendText).toHaveBeenCalledTimes(1)
    expect(triggeredKeys).toEqual(new Set([buildRobotScheduleTriggerKey(task, now)]))
  })

  it('passes notify@all mention ids when mentionAll is enabled', () => {
    const sendText = vi.fn(() => 1)
    const task = createMonthlyTask({ daysOfMonth: [12], time: '18:45' })

    executeRobotScheduleTick({
      sender: { sendText },
      tasks: [task],
      triggeredKeys: new Set<string>(),
      now: new Date('2026-05-12T18:45:00'),
      logger: createSilentLogger(),
    })

    expect(sendText).toHaveBeenCalledWith(task.roomId, '@所有人\nmonthly message', ['notify@all'])
    expect(resolveRobotScheduleMentions(task)).toEqual(['notify@all'])
    expect(resolveRobotScheduleMessage(task)).toBe('@所有人\nmonthly message')
  })

  it('does not duplicate @所有人 when message already starts with it', () => {
    const task = {
      ...createMonthlyTask({ daysOfMonth: [12], time: '18:45' }),
      message: '@所有人\nalready included',
    }

    expect(resolveRobotScheduleMessage(task)).toBe('@所有人\nalready included')
  })
})

function createWeeklyTask(input: { weekdays: number[], time: string }): RobotScheduleTask {
  return {
    id: 'weekly-task',
    enabled: true,
    roomId: 'room@chatroom',
    message: 'weekly message',
    mentionAll: true,
    schedule: {
      type: 'weekly',
      time: input.time,
      weekdays: input.weekdays,
    },
  }
}

function createMonthlyTask(input: { daysOfMonth: number[], time: string }): RobotScheduleTask {
  return {
    id: 'monthly-task',
    enabled: true,
    roomId: 'room@chatroom',
    message: 'monthly message',
    mentionAll: true,
    schedule: {
      type: 'monthly',
      time: input.time,
      daysOfMonth: input.daysOfMonth,
    },
  }
}

function createSilentLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}
