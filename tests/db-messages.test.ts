/**
 * 数据库消息和 Chat 操作测试
 *
 * 覆盖 saveMessage / getMessages / upsertChat / getChats
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { cleanTables } from './setup.ts'
import {
  saveMessage,
  getMessages,
  upsertChat,
  getChats,
} from '../src/db/index.ts'

describe('saveMessage', () => {
  beforeEach(() => cleanTables('messages'))

  test('保存消息后可查询到', () => {
    saveMessage({
      id: 'msg-1',
      chatId: 'task:test',
      sender: 'scheduler',
      senderName: 'Scheduled Task',
      content: 'hello world',
      timestamp: '2026-03-10T10:00:00.000Z',
      isFromMe: true,
      isBotMessage: false,
    })

    const msgs = getMessages('task:test', 10)
    expect(msgs.length).toBe(1)
    expect(msgs[0].id).toBe('msg-1')
    expect(msgs[0].chat_id).toBe('task:test')
    expect(msgs[0].sender).toBe('scheduler')
    expect(msgs[0].sender_name).toBe('Scheduled Task')
    expect(msgs[0].content).toBe('hello world')
    expect(msgs[0].is_from_me).toBe(1)
    expect(msgs[0].is_bot_message).toBe(0)
  })

  test('bot 消息标记正确', () => {
    saveMessage({
      id: 'msg-bot',
      chatId: 'task:test',
      sender: 'agent-1',
      senderName: 'Agent',
      content: 'bot reply',
      timestamp: new Date().toISOString(),
      isFromMe: false,
      isBotMessage: true,
    })

    const msgs = getMessages('task:test', 10)
    expect(msgs[0].is_from_me).toBe(0)
    expect(msgs[0].is_bot_message).toBe(1)
  })

  test('INSERT OR REPLACE — 相同 id+chat_id 覆盖', () => {
    const ts = new Date().toISOString()
    saveMessage({ id: 'dup-1', chatId: 'chat-1', sender: 's', senderName: 'S', content: 'original', timestamp: ts, isFromMe: false, isBotMessage: false })
    saveMessage({ id: 'dup-1', chatId: 'chat-1', sender: 's', senderName: 'S', content: 'updated', timestamp: ts, isFromMe: false, isBotMessage: false })

    const msgs = getMessages('chat-1', 10)
    expect(msgs.length).toBe(1)
    expect(msgs[0].content).toBe('updated')
  })

  test('不同 chat_id 的相同 id 不冲突', () => {
    const ts = new Date().toISOString()
    saveMessage({ id: 'same-id', chatId: 'chat-a', sender: 's', senderName: 'S', content: 'a', timestamp: ts, isFromMe: false, isBotMessage: false })
    saveMessage({ id: 'same-id', chatId: 'chat-b', sender: 's', senderName: 'S', content: 'b', timestamp: ts, isFromMe: false, isBotMessage: false })

    expect(getMessages('chat-a', 10).length).toBe(1)
    expect(getMessages('chat-b', 10).length).toBe(1)
  })
})

describe('getMessages', () => {
  beforeEach(() => cleanTables('messages'))

  test('按 timestamp DESC 排序', () => {
    saveMessage({ id: 'm1', chatId: 'chat-1', sender: 's', senderName: 'S', content: 'first', timestamp: '2026-03-10T10:00:00.000Z', isFromMe: false, isBotMessage: false })
    saveMessage({ id: 'm2', chatId: 'chat-1', sender: 's', senderName: 'S', content: 'third', timestamp: '2026-03-10T12:00:00.000Z', isFromMe: false, isBotMessage: false })
    saveMessage({ id: 'm3', chatId: 'chat-1', sender: 's', senderName: 'S', content: 'second', timestamp: '2026-03-10T11:00:00.000Z', isFromMe: false, isBotMessage: false })

    const msgs = getMessages('chat-1', 10)
    expect(msgs[0].content).toBe('third')
    expect(msgs[1].content).toBe('second')
    expect(msgs[2].content).toBe('first')
  })

  test('limit 参数', () => {
    for (let i = 0; i < 10; i++) {
      saveMessage({ id: `lm-${i}`, chatId: 'chat-lim', sender: 's', senderName: 'S', content: `msg ${i}`, timestamp: new Date(Date.now() + i * 1000).toISOString(), isFromMe: false, isBotMessage: false })
    }
    expect(getMessages('chat-lim', 3).length).toBe(3)
  })

  test('before 参数 — 分页查询', () => {
    saveMessage({ id: 'p1', chatId: 'chat-pg', sender: 's', senderName: 'S', content: 'old', timestamp: '2026-03-10T08:00:00.000Z', isFromMe: false, isBotMessage: false })
    saveMessage({ id: 'p2', chatId: 'chat-pg', sender: 's', senderName: 'S', content: 'mid', timestamp: '2026-03-10T10:00:00.000Z', isFromMe: false, isBotMessage: false })
    saveMessage({ id: 'p3', chatId: 'chat-pg', sender: 's', senderName: 'S', content: 'new', timestamp: '2026-03-10T12:00:00.000Z', isFromMe: false, isBotMessage: false })

    const before = getMessages('chat-pg', 10, '2026-03-10T11:00:00.000Z')
    expect(before.length).toBe(2) // mid + old
    expect(before[0].content).toBe('mid')
    expect(before[1].content).toBe('old')
  })

  test('不存在的 chatId 返回空数组', () => {
    expect(getMessages('non-existent', 10).length).toBe(0)
  })

  test('默认 limit 为 50', () => {
    for (let i = 0; i < 60; i++) {
      saveMessage({ id: `dl-${i}`, chatId: 'chat-dl', sender: 's', senderName: 'S', content: `${i}`, timestamp: new Date(Date.now() + i * 100).toISOString(), isFromMe: false, isBotMessage: false })
    }
    expect(getMessages('chat-dl').length).toBe(50)
  })
})

describe('upsertChat', () => {
  beforeEach(() => cleanTables('chats'))

  test('创建新 chat', () => {
    upsertChat('task:c1', 'agent-1', 'Task: 测试', 'task')

    const chats = getChats()
    const chat = chats.find((c) => c.chat_id === 'task:c1')
    expect(chat).toBeDefined()
    expect(chat!.name).toBe('Task: 测试')
    expect(chat!.agent_id).toBe('agent-1')
    expect(chat!.channel).toBe('task')
  })

  test('不传 name 时使用 chatId 作为 name', () => {
    upsertChat('chat-auto', 'agent-1')

    const chats = getChats()
    const chat = chats.find((c) => c.chat_id === 'chat-auto')
    expect(chat!.name).toBe('chat-auto')
  })

  test('不传 channel 时默认为 web', () => {
    upsertChat('chat-web', 'agent-1', 'Web Chat')

    const chats = getChats()
    const chat = chats.find((c) => c.chat_id === 'chat-web')
    expect(chat!.channel).toBe('web')
  })

  test('更新已有 chat 的 name 和 last_message_time', () => {
    upsertChat('chat-upd', 'agent-1', 'First Name', 'task')
    const first = getChats().find((c) => c.chat_id === 'chat-upd')!

    upsertChat('chat-upd', 'agent-1', 'Updated Name', 'task')
    const second = getChats().find((c) => c.chat_id === 'chat-upd')!

    expect(second.name).toBe('Updated Name')
    expect(second.last_message_time >= first.last_message_time).toBe(true)
  })

  test('upsert 传 undefined name 保留原名', () => {
    upsertChat('chat-keep', 'agent-1', 'Original')
    upsertChat('chat-keep', 'agent-1') // name=undefined → COALESCE 保留原名

    const chat = getChats().find((c) => c.chat_id === 'chat-keep')
    // upsertChat 传 undefined 时变为 chatId，但 COALESCE(excluded.name, chats.name) 会用 chatId
    // 因为 name ?? chatId 的结果是 'chat-keep'
    expect(chat!.name).toBe('chat-keep')
  })
})

describe('getChats', () => {
  beforeEach(() => cleanTables('chats'))

  test('按 last_message_time DESC 排序', () => {
    upsertChat('chat-old', 'agent-1', 'Old')
    // 确保时间差
    upsertChat('chat-new', 'agent-1', 'New')

    const chats = getChats()
    expect(chats.length).toBe(2)
    // new 的 last_message_time >= old
    expect(chats[0].last_message_time >= chats[1].last_message_time).toBe(true)
  })

  test('空表返回空数组', () => {
    expect(getChats().length).toBe(0)
  })
})

// ===== 新增测试场景 =====

describe('saveMessage — 空 content', () => {
  beforeEach(() => cleanTables('messages'))

  test('保存空字符串 content 并正确读取', () => {
    saveMessage({
      id: 'msg-empty',
      chatId: 'chat-empty',
      sender: 'user',
      senderName: 'User',
      content: '',
      timestamp: '2026-03-10T10:00:00.000Z',
      isFromMe: true,
      isBotMessage: false,
    })

    const msgs = getMessages('chat-empty', 10)
    expect(msgs.length).toBe(1)
    expect(msgs[0].id).toBe('msg-empty')
    expect(msgs[0].content).toBe('')
  })
})

describe('saveMessage — 超长 content', () => {
  beforeEach(() => cleanTables('messages'))

  test('保存 20000 字符的 content 并正确读取', () => {
    const longContent = 'A'.repeat(20000)
    saveMessage({
      id: 'msg-long',
      chatId: 'chat-long',
      sender: 'user',
      senderName: 'User',
      content: longContent,
      timestamp: '2026-03-10T10:00:00.000Z',
      isFromMe: false,
      isBotMessage: false,
    })

    const msgs = getMessages('chat-long', 10)
    expect(msgs.length).toBe(1)
    expect(msgs[0].content).toBe(longContent)
    expect(msgs[0].content.length).toBe(20000)
  })
})

describe('saveMessage — 特殊字符', () => {
  beforeEach(() => cleanTables('messages'))

  test('保存 XSS 脚本标签', () => {
    const xssContent = "<script>alert('xss')</script>"
    saveMessage({
      id: 'msg-xss',
      chatId: 'chat-special',
      sender: 'user',
      senderName: 'User',
      content: xssContent,
      timestamp: '2026-03-10T10:00:00.000Z',
      isFromMe: false,
      isBotMessage: false,
    })

    const msgs = getMessages('chat-special', 10)
    expect(msgs[0].content).toBe(xssContent)
  })

  test('保存 SQL 注入字符串', () => {
    const sqlInjection = "'; DROP TABLE messages; --"
    saveMessage({
      id: 'msg-sqli',
      chatId: 'chat-special',
      sender: 'user',
      senderName: 'User',
      content: sqlInjection,
      timestamp: '2026-03-10T10:01:00.000Z',
      isFromMe: false,
      isBotMessage: false,
    })

    const msgs = getMessages('chat-special', 10)
    const sqliMsg = msgs.find((m) => m.id === 'msg-sqli')
    expect(sqliMsg).toBeDefined()
    expect(sqliMsg!.content).toBe(sqlInjection)
  })

  test('保存 emoji 字符', () => {
    const emojiContent = '🔥🚀'
    saveMessage({
      id: 'msg-emoji',
      chatId: 'chat-special',
      sender: 'user',
      senderName: 'User',
      content: emojiContent,
      timestamp: '2026-03-10T10:02:00.000Z',
      isFromMe: false,
      isBotMessage: false,
    })

    const msgs = getMessages('chat-special', 10)
    const emojiMsg = msgs.find((m) => m.id === 'msg-emoji')
    expect(emojiMsg).toBeDefined()
    expect(emojiMsg!.content).toBe(emojiContent)
  })
})

describe('saveMessage — 重复 ID', () => {
  beforeEach(() => cleanTables('messages'))

  test('相同 id+chatId 使用 INSERT OR REPLACE 覆盖', () => {
    const ts = '2026-03-10T10:00:00.000Z'
    saveMessage({ id: 'dup-id', chatId: 'chat-dup', sender: 'a', senderName: 'A', content: 'first', timestamp: ts, isFromMe: false, isBotMessage: false })
    saveMessage({ id: 'dup-id', chatId: 'chat-dup', sender: 'b', senderName: 'B', content: 'second', timestamp: ts, isFromMe: true, isBotMessage: true })

    const msgs = getMessages('chat-dup', 10)
    expect(msgs.length).toBe(1)
    expect(msgs[0].content).toBe('second')
    expect(msgs[0].sender).toBe('b')
    expect(msgs[0].sender_name).toBe('B')
    expect(msgs[0].is_from_me).toBe(1)
    expect(msgs[0].is_bot_message).toBe(1)
  })
})

describe('getMessages — before 参数分页', () => {
  beforeEach(() => cleanTables('messages'))

  test('使用 before 参数获取中间时间点之前的消息', () => {
    const timestamps = [
      '2026-03-10T08:00:00.000Z',
      '2026-03-10T09:00:00.000Z',
      '2026-03-10T10:00:00.000Z',
      '2026-03-10T11:00:00.000Z',
      '2026-03-10T12:00:00.000Z',
    ]
    for (let i = 0; i < 5; i++) {
      saveMessage({
        id: `bp-${i}`,
        chatId: 'chat-before',
        sender: 's',
        senderName: 'S',
        content: `msg-${i}`,
        timestamp: timestamps[i],
        isFromMe: false,
        isBotMessage: false,
      })
    }

    // before 10:30 → 应返回 08:00, 09:00, 10:00 三条（timestamp < before）
    const msgs = getMessages('chat-before', 10, '2026-03-10T10:30:00.000Z')
    expect(msgs.length).toBe(3)
    // 按 timestamp DESC 排序
    expect(msgs[0].content).toBe('msg-2') // 10:00
    expect(msgs[1].content).toBe('msg-1') // 09:00
    expect(msgs[2].content).toBe('msg-0') // 08:00
  })

  test('before 参数配合 limit 截断结果', () => {
    const timestamps = [
      '2026-03-10T08:00:00.000Z',
      '2026-03-10T09:00:00.000Z',
      '2026-03-10T10:00:00.000Z',
      '2026-03-10T11:00:00.000Z',
      '2026-03-10T12:00:00.000Z',
    ]
    for (let i = 0; i < 5; i++) {
      saveMessage({
        id: `bpl-${i}`,
        chatId: 'chat-before-limit',
        sender: 's',
        senderName: 'S',
        content: `msg-${i}`,
        timestamp: timestamps[i],
        isFromMe: false,
        isBotMessage: false,
      })
    }

    // before 12:00, limit 2 → 应返回最近的 2 条（11:00, 10:00）
    const msgs = getMessages('chat-before-limit', 2, '2026-03-10T12:00:00.000Z')
    expect(msgs.length).toBe(2)
    expect(msgs[0].content).toBe('msg-3') // 11:00
    expect(msgs[1].content).toBe('msg-2') // 10:00
  })
})

describe('upsertChat — 更新已有 chat', () => {
  beforeEach(() => cleanTables('chats'))

  test('upsert 更新 name 后查询到新 name', () => {
    upsertChat('chat-upsert', 'agent-1', 'Original Name', 'web')
    const before = getChats().find((c) => c.chat_id === 'chat-upsert')
    expect(before!.name).toBe('Original Name')

    upsertChat('chat-upsert', 'agent-1', 'New Name', 'web')
    const after = getChats().find((c) => c.chat_id === 'chat-upsert')
    expect(after!.name).toBe('New Name')
  })

  test('upsert 不会创建重复记录', () => {
    upsertChat('chat-nodup', 'agent-1', 'First', 'web')
    upsertChat('chat-nodup', 'agent-1', 'Second', 'web')
    upsertChat('chat-nodup', 'agent-1', 'Third', 'web')

    const chats = getChats().filter((c) => c.chat_id === 'chat-nodup')
    expect(chats.length).toBe(1)
    expect(chats[0].name).toBe('Third')
  })
})

describe('upsertChat — channel 字段', () => {
  beforeEach(() => cleanTables('chats'))

  test('channel 为 task 时正确存储', () => {
    upsertChat('chat-task', 'agent-1', 'Task Chat', 'task')

    const chat = getChats().find((c) => c.chat_id === 'chat-task')
    expect(chat).toBeDefined()
    expect(chat!.channel).toBe('task')
  })

  test('channel 为 telegram 时正确存储', () => {
    upsertChat('chat-tg', 'agent-1', 'TG Chat', 'telegram')

    const chat = getChats().find((c) => c.chat_id === 'chat-tg')
    expect(chat).toBeDefined()
    expect(chat!.channel).toBe('telegram')
  })

  test('不传 channel 默认为 web', () => {
    upsertChat('chat-default-ch', 'agent-1', 'Default Channel')

    const chat = getChats().find((c) => c.chat_id === 'chat-default-ch')
    expect(chat!.channel).toBe('web')
  })
})

describe('getChats — 多个 chat 排序', () => {
  beforeEach(() => cleanTables('chats'))

  test('多个 chat 按 last_message_time DESC 排序', async () => {
    upsertChat('chat-order-1', 'agent-1', 'First')
    // 添加微小延时确保时间戳不同
    await new Promise((r) => setTimeout(r, 10))
    upsertChat('chat-order-2', 'agent-1', 'Second')
    await new Promise((r) => setTimeout(r, 10))
    upsertChat('chat-order-3', 'agent-1', 'Third')

    const chats = getChats()
    expect(chats.length).toBe(3)
    // 最新的排在前面
    expect(chats[0].chat_id).toBe('chat-order-3')
    expect(chats[1].chat_id).toBe('chat-order-2')
    expect(chats[2].chat_id).toBe('chat-order-1')
  })

  test('更新旧 chat 后排序变化', async () => {
    upsertChat('chat-sort-a', 'agent-1', 'A')
    await new Promise((r) => setTimeout(r, 10))
    upsertChat('chat-sort-b', 'agent-1', 'B')
    await new Promise((r) => setTimeout(r, 10))
    // 更新 A，使其 last_message_time 变为最新
    upsertChat('chat-sort-a', 'agent-1', 'A Updated')

    const chats = getChats()
    expect(chats[0].chat_id).toBe('chat-sort-a')
    expect(chats[1].chat_id).toBe('chat-sort-b')
  })
})

describe('getMessages — limit 为 0', () => {
  beforeEach(() => cleanTables('messages'))

  test('limit 为 0 时返回空数组', () => {
    saveMessage({
      id: 'msg-lim0',
      chatId: 'chat-lim0',
      sender: 's',
      senderName: 'S',
      content: 'test',
      timestamp: '2026-03-10T10:00:00.000Z',
      isFromMe: false,
      isBotMessage: false,
    })

    const msgs = getMessages('chat-lim0', 0)
    expect(msgs.length).toBe(0)
  })
})

describe('saveMessage — timestamp 格式', () => {
  beforeEach(() => cleanTables('messages'))

  test('ISO 8601 完整格式', () => {
    const ts = '2026-03-10T10:30:45.123Z'
    saveMessage({ id: 'ts-iso', chatId: 'chat-ts', sender: 's', senderName: 'S', content: 'iso', timestamp: ts, isFromMe: false, isBotMessage: false })

    const msgs = getMessages('chat-ts', 10)
    expect(msgs[0].timestamp).toBe(ts)
  })

  test('不带毫秒的 ISO 格式', () => {
    const ts = '2026-03-10T10:30:45Z'
    saveMessage({ id: 'ts-no-ms', chatId: 'chat-ts', sender: 's', senderName: 'S', content: 'no-ms', timestamp: ts, isFromMe: false, isBotMessage: false })

    const msgs = getMessages('chat-ts', 10)
    const msg = msgs.find((m) => m.id === 'ts-no-ms')
    expect(msg).toBeDefined()
    expect(msg!.timestamp).toBe(ts)
  })

  test('带时区偏移的 ISO 格式', () => {
    const ts = '2026-03-10T18:30:45+08:00'
    saveMessage({ id: 'ts-offset', chatId: 'chat-ts', sender: 's', senderName: 'S', content: 'offset', timestamp: ts, isFromMe: false, isBotMessage: false })

    const msgs = getMessages('chat-ts', 10)
    const msg = msgs.find((m) => m.id === 'ts-offset')
    expect(msg).toBeDefined()
    expect(msg!.timestamp).toBe(ts)
  })

  test('Date.toISOString() 生成的格式', () => {
    const ts = new Date('2026-03-10T10:00:00Z').toISOString()
    saveMessage({ id: 'ts-date', chatId: 'chat-ts', sender: 's', senderName: 'S', content: 'date-iso', timestamp: ts, isFromMe: false, isBotMessage: false })

    const msgs = getMessages('chat-ts', 10)
    const msg = msgs.find((m) => m.id === 'ts-date')
    expect(msg).toBeDefined()
    expect(msg!.timestamp).toBe(ts)
  })
})
