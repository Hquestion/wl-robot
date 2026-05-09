import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { archiveWechatMessage } from '../server/utils/message-archive'

const messageTypes = {
  Text: 1,
  Image: 3,
  Voice: 34,
  Video: 43,
  File: 2004,
}

describe('archiveWechatMessage', () => {
  it('archives text messages with metadata', async () => {
    const inboxDir = await mkdtemp(join(tmpdir(), 'wl-robot-'))

    try {
      const result = await archiveWechatMessage({
        message: {
          id: 'msg:1',
          type: 1,
          ts: 1_700_000_000,
          sender: 'wxid_sender',
          roomid: 'room@chatroom',
          content: 'hello',
        },
        messageTypes,
        inboxDir,
        downloadTimeoutSeconds: 30,
        downloadFile: async () => {
          throw new Error('download should not be called')
        },
      })

      const metadata = JSON.parse(await readFile(join(result.messageDir, 'message.json'), 'utf8'))
      const text = await readFile(join(result.messageDir, 'text.txt'), 'utf8')

      expect(text).toBe('hello')
      expect(metadata).toMatchObject({
        id: 'msg:1',
        type: 1,
        typeName: 'Text',
        sender: 'wxid_sender',
        room: 'room@chatroom',
        text: 'hello',
      })
    }
    finally {
      await rm(inboxDir, { recursive: true, force: true })
    }
  })

  it('archives downloadable media with sanitized names', async () => {
    const inboxDir = await mkdtemp(join(tmpdir(), 'wl-robot-'))

    try {
      const result = await archiveWechatMessage({
        message: {
          id: 'media/1',
          type: 3,
          ts: 1_700_000_000_000,
          content: 'image content',
        },
        messageTypes,
        inboxDir,
        downloadTimeoutSeconds: 30,
        downloadFile: async () => ({
          name: 'bad:name?.jpg',
          toFile: async (path: string) => {
            await writeFile(path, 'binary image')
          },
        }),
      })

      expect(result.mediaPath).toMatch(/bad_name_\.jpg$/)
      expect(await readFile(result.mediaPath!, 'utf8')).toBe('binary image')
    }
    finally {
      await rm(inboxDir, { recursive: true, force: true })
    }
  })
})
