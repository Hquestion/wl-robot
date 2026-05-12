export type WeeklyScheduleRule = {
  type: 'weekly'
  time: string
  weekdays: number[]
}

export type MonthlyScheduleRule = {
  type: 'monthly'
  time: string
  daysOfMonth: number[]
}

export type RobotScheduleRule = WeeklyScheduleRule | MonthlyScheduleRule

export type RobotScheduleTask = {
  id: string
  enabled: boolean
  roomId: string
  message: string
  mentionAll: boolean
  schedule: RobotScheduleRule
  timezone?: string
}

type ValidationResult = {
  tasks: RobotScheduleTask[]
  errors: string[]
}

type ScheduleDateParts = {
  year: number
  month: number
  day: number
  hour: string
  minute: string
  isoWeekday: number
}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export function validateRobotScheduleTasks(input: unknown): ValidationResult {
  if (!Array.isArray(input)) {
    return {
      tasks: [],
      errors: ['[robot] schedule config must export an array of tasks.'],
    }
  }

  const errors: string[] = []
  const seenIds = new Set<string>()
  const tasks: RobotScheduleTask[] = []

  input.forEach((rawTask, index) => {
    const label = `task[${index}]`

    if (!isRecord(rawTask)) {
      errors.push(`[robot] ${label} must be an object.`)
      return
    }

    const id = readRequiredString(rawTask.id, `${label}.id`, errors)
    const roomId = readRequiredString(rawTask.roomId, `${label}.roomId`, errors)
    const message = readRequiredString(rawTask.message, `${label}.message`, errors)
    const enabled = typeof rawTask.enabled === 'boolean' ? rawTask.enabled : true
    const mentionAll = typeof rawTask.mentionAll === 'boolean' ? rawTask.mentionAll : true
    const timezone = readOptionalString(rawTask.timezone)

    if (id) {
      if (seenIds.has(id)) {
        errors.push(`[robot] duplicate schedule task id "${id}".`)
      }
      else {
        seenIds.add(id)
      }
    }

    if (timezone && !isValidTimeZone(timezone)) {
      errors.push(`[robot] ${label}.timezone "${timezone}" is not a valid IANA time zone.`)
    }

    const schedule = validateScheduleRule(rawTask.schedule, label, errors)
    if (!id || !roomId || !message || !schedule) {
      return
    }

    tasks.push({
      id,
      enabled,
      roomId,
      message,
      mentionAll,
      schedule,
      timezone,
    })
  })

  return {
    tasks: tasks.filter(task => task.enabled),
    errors,
  }
}

export function isRobotScheduleTaskDue(task: RobotScheduleTask, now: Date, defaultTimeZone?: string) {
  const timeZone = task.timezone || defaultTimeZone
  const parts = getScheduleDateParts(now, timeZone)
  const [hour, minute] = task.schedule.time.split(':')

  if (parts.hour !== hour || parts.minute !== minute) {
    return false
  }

  if (task.schedule.type === 'weekly') {
    return task.schedule.weekdays.includes(parts.isoWeekday)
  }

  return task.schedule.daysOfMonth.includes(parts.day)
}

export function buildRobotScheduleTriggerKey(task: RobotScheduleTask, now: Date, defaultTimeZone?: string) {
  const timeZone = task.timezone || defaultTimeZone
  const parts = getScheduleDateParts(now, timeZone)

  return `${parts.year}-${padNumber(parts.month)}-${padNumber(parts.day)} ${parts.hour}:${parts.minute}:${task.id}`
}

export function resolveRobotScheduleMentions(task: RobotScheduleTask) {
  return task.mentionAll ? ['notify@all'] : []
}

export function resolveRobotScheduleMessage(task: RobotScheduleTask) {
  if (!task.mentionAll) {
    return task.message
  }

  const normalizedMessage = task.message.trimStart()
  if (normalizedMessage.startsWith('@所有人')) {
    return task.message
  }

  return `@所有人\n${task.message}`
}

function validateScheduleRule(input: unknown, label: string, errors: string[]): RobotScheduleRule | undefined {
  if (!isRecord(input)) {
    errors.push(`[robot] ${label}.schedule must be an object.`)
    return
  }

  const type = input.type
  const time = readRequiredString(input.time, `${label}.schedule.time`, errors)
  if (!time) {
    return
  }

  if (!timePattern.test(time)) {
    errors.push(`[robot] ${label}.schedule.time "${time}" must use HH:mm format.`)
    return
  }

  if (type === 'weekly') {
    const weekdays = readIntegerList(input.weekdays, `${label}.schedule.weekdays`, errors, 1, 7)
    if (!weekdays) {
      return
    }

    return {
      type,
      time,
      weekdays,
    }
  }

  if (type === 'monthly') {
    const daysOfMonth = readIntegerList(input.daysOfMonth, `${label}.schedule.daysOfMonth`, errors, 1, 31)
    if (!daysOfMonth) {
      return
    }

    return {
      type,
      time,
      daysOfMonth,
    }
  }

  errors.push(`[robot] ${label}.schedule.type must be "weekly" or "monthly".`)
}

function readIntegerList(input: unknown, label: string, errors: string[], min: number, max: number) {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push(`[robot] ${label} must be a non-empty array.`)
    return
  }

  const values = input
    .map(value => typeof value === 'number' && Number.isInteger(value) ? value : Number.NaN)

  if (values.some(value => Number.isNaN(value) || value < min || value > max)) {
    errors.push(`[robot] ${label} must contain integers between ${min} and ${max}.`)
    return
  }

  return Array.from(new Set(values)).sort((left, right) => left - right)
}

function readRequiredString(input: unknown, label: string, errors: string[]) {
  if (typeof input !== 'string' || !input.trim()) {
    errors.push(`[robot] ${label} must be a non-empty string.`)
    return
  }

  return input.trim()
}

function readOptionalString(input: unknown) {
  if (typeof input !== 'string') {
    return
  }

  const trimmed = input.trim()
  return trimmed || undefined
}

function getScheduleDateParts(date: Date, timeZone?: string): ScheduleDateParts {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: padNumber(date.getHours()),
      minute: padNumber(date.getMinutes()),
      isoWeekday: toIsoWeekday(date.getDay()),
    }
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })

  const parts = formatter.formatToParts(date)
  const weekday = parts.find(part => part.type === 'weekday')?.value

  return {
    year: Number(parts.find(part => part.type === 'year')?.value),
    month: Number(parts.find(part => part.type === 'month')?.value),
    day: Number(parts.find(part => part.type === 'day')?.value),
    hour: parts.find(part => part.type === 'hour')?.value || '00',
    minute: parts.find(part => part.type === 'minute')?.value || '00',
    isoWeekday: weekdayToIsoWeekday(weekday),
  }
}

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  }
  catch {
    return false
  }
}

function weekdayToIsoWeekday(weekday: string | undefined) {
  switch (weekday) {
    case 'Mon':
      return 1
    case 'Tue':
      return 2
    case 'Wed':
      return 3
    case 'Thu':
      return 4
    case 'Fri':
      return 5
    case 'Sat':
      return 6
    case 'Sun':
      return 7
    default:
      return 0
  }
}

function toIsoWeekday(day: number) {
  return day === 0 ? 7 : day
}

function padNumber(value: number) {
  return String(value).padStart(2, '0')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
