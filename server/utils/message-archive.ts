import { mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

type FileBoxLike = {
  name?: string
  toFile: (path: string) => Promise<void>
}

export type WechatMessageLike = {
  id?: string | number
  type?: number | string
  content?: string
  text?: string
  sender?: unknown
  room?: unknown
  roomid?: unknown
  timestamp?: number
  createTime?: number
  ts?: number
  [key: string]: unknown
}

type ArchiveInput = {
  message: WechatMessageLike
  messageTypes: Record<string, number | string>
  inboxDir: string
  downloadTimeoutSeconds: number
  downloadFile: () => Promise<FileBoxLike>
}

const mediaTypeNames = new Set(['Image', 'Video', 'Voice', 'File'])

export async function archiveWechatMessage(input: ArchiveInput) {
  const createdAt = getMessageDate(input.message)
  const messageId = String(input.message.id || crypto.randomUUID())
  const messageTypeName = getMessageTypeName(input.message.type, input.messageTypes)
  const messageDir = join(input.inboxDir, toDatePart(createdAt), `${createdAt.getTime()}-${sanitizePathPart(messageId)}`)

  await mkdir(messageDir, { recursive: true })

  const text = getMessageText(input.message)
  if (text) {
    await writeFile(join(messageDir, 'text.txt'), text, 'utf8')
  }

  let mediaPath: string | undefined
  if (mediaTypeNames.has(messageTypeName)) {
    mediaPath = await archiveMedia(input, messageDir, messageTypeName)
  }

  const metadata = {
    id: input.message.id,
    type: input.message.type,
    typeName: messageTypeName,
    sender: input.message.sender,
    room: input.message.room || input.message.roomid,
    createdAt: createdAt.toISOString(),
    text,
    mediaPath,
    raw: input.message,
  }

  await writeFile(join(messageDir, 'message.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

  return {
    messageDir,
    mediaPath,
  }
}

function getMessageDate(message: WechatMessageLike) {
  const secondsOrMs = message.timestamp || message.createTime || message.ts

  if (typeof secondsOrMs !== 'number') {
    return new Date()
  }

  return new Date(secondsOrMs < 10_000_000_000 ? secondsOrMs * 1000 : secondsOrMs)
}

function getMessageText(message: WechatMessageLike) {
  if (typeof message.content === 'string') {
    return message.content
  }

  if (typeof message.text === 'string') {
    return message.text
  }

  return ''
}

function getMessageTypeName(type: WechatMessageLike['type'], messageTypes: Record<string, number | string>) {
  const matched = Object.entries(messageTypes).find(([, value]) => value === type)

  return matched?.[0] || String(type || 'Unknown')
}

async function archiveMedia(input: ArchiveInput, messageDir: string, messageTypeName: string) {
  const fileBox = await input.downloadFile()
  const filename = resolveMediaFilename(fileBox.name, messageTypeName)
  const mediaPath = join(messageDir, filename)

  await fileBox.toFile(mediaPath)

  return mediaPath
}

function resolveMediaFilename(name: string | undefined, messageTypeName: string) {
  if (name) {
    return sanitizePathPart(name)
  }

  const fallbackExt: Record<string, string> = {
    File: '.bin',
    Image: '.jpg',
    Video: '.mp4',
    Voice: '.mp3',
  }

  return `media${fallbackExt[messageTypeName] || extname(name || '') || '.bin'}`
}

function toDatePart(date: Date) {
  return date.toISOString().slice(0, 10)
}

function sanitizePathPart(value: string) {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0)

      return code <= 31 || '<>:"/\\|?*'.includes(char) ? '_' : char
    })
    .join('')
    .slice(0, 120)
}
