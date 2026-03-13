import '../tests/setup-light.ts'
import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { extractQQTextContent, stripQQBotMention, chunkText, isTokenValid, QQChannel } from '../src/channel/qq.ts'
import { EventBus } from '../src/events/bus.ts'

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('extractQQTextContent', () => {
  test('普通文本', () => {
    expect(extractQQTextContent('hello world')).toBe('hello world')
  })

  test('空文本', () => {
    expect(extractQQTextContent('')).toBe('')
  })

  test('带前后空格的文本', () => {
    expect(extractQQTextContent('  hello  ')).toBe('hello')
  })
})

describe('stripQQBotMention', () => {
  test('移除 <@!botid>', () => {
    expect(stripQQBotMention('<@!abc123> hello')).toBe('hello')
  })

  test('保留其他内容', () => {
    expect(stripQQBotMention('hello <@!bot> world')).toBe('hello  world')
  })

  test('无 @提及时原样返回', () => {
    expect(stripQQBotMention('hello world')).toBe('hello world')
  })

  test('空内容', () => {
    expect(stripQQBotMention('')).toBe('')
  })

  test('多个 @提及', () => {
    expect(stripQQBotMention('<@!a> <@!b> text')).toBe('text')
  })
})

describe('chunkText', () => {
  test('短文本返回单个分片', () => {
    expect(chunkText('hello', 10)).toEqual(['hello'])
  })

  test('正确拆分', () => {
    expect(chunkText('abcdefghij', 3)).toEqual(['abc', 'def', 'ghi', 'j'])
  })

  test('恰好整除', () => {
    expect(chunkText('abcdef', 3)).toEqual(['abc', 'def'])
  })

  test('空字符串', () => {
    expect(chunkText('', 10)).toEqual([''])
  })
})

describe('isTokenValid', () => {
  test('有效 token', () => {
    const token = { access_token: 'abc', expires_in: 7200, fetchedAt: Date.now() }
    expect(isTokenValid(token)).toBe(true)
  })

  test('过期 token', () => {
    const token = { access_token: 'abc', expires_in: 7200, fetchedAt: Date.now() - 8000000 }
    expect(isTokenValid(token)).toBe(false)
  })

  test('null token', () => {
    expect(isTokenValid(null)).toBe(false)
  })

  test('即将过期（在 buffer 内）', () => {
    // token 还有 4 分钟过期，buffer 是 5 分钟
    const token = { access_token: 'abc', expires_in: 7200, fetchedAt: Date.now() - (7200 - 240) * 1000 }
    expect(isTokenValid(token)).toBe(false)
  })

  test('自定义 buffer', () => {
    const token = { access_token: 'abc', expires_in: 7200, fetchedAt: Date.now() - 7100 * 1000 }
    // 100s left, buffer 50s → still valid
    expect(isTokenValid(token, 50000)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// QQChannel integration tests (mock fetch injection)
// ---------------------------------------------------------------------------

function createMockFetch(responses?: Record<string, any>) {
  const calls: { url: string; init?: RequestInit }[] = []

  const mockFetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString()
    calls.push({ url: urlStr, init })

    // token 请求
    if (urlStr.includes('getAppAccessToken')) {
      return new Response(JSON.stringify({ access_token: 'test_token', expires_in: '7200' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 网关请求
    if (urlStr.includes('/gateway/bot')) {
      return new Response(JSON.stringify({ url: 'wss://mock.qq.com/ws' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 发送消息
    if (urlStr.includes('/messages')) {
      return new Response(JSON.stringify({ id: 'msg_resp_1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 自定义响应
    if (responses) {
      for (const [pattern, resp] of Object.entries(responses)) {
        if (urlStr.includes(pattern)) {
          return new Response(JSON.stringify(resp), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
    }

    return new Response('Not Found', { status: 404 })
  }) as any

  return { fetch: mockFetch, calls }
}

describe('QQChannel', () => {
  describe('sendMessage', () => {
    test('C2C 消息使用正确 URL', async () => {
      const { fetch: mockFetch, calls } = createMockFetch()
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        _fetchFn: mockFetch,
      })

      // 手动设置 token 跳过 connect
      ;(channel as any).accessToken = { access_token: 'test_token', expires_in: 7200, fetchedAt: Date.now() }

      // 设置 recentMsgIds 以模拟被动回复
      ;(channel as any).recentMsgIds.set('qq:c2c:user123', { msgId: 'msg1', msgSeq: 0 })

      await channel.sendMessage('qq:c2c:user123', 'hello')

      const msgCall = calls.find(c => c.url.includes('/v2/users/user123/messages'))
      expect(msgCall).toBeDefined()
      expect(msgCall!.init?.method).toBe('POST')

      const body = JSON.parse(msgCall!.init?.body as string)
      expect(body.content).toBe('hello')
      expect(body.msg_type).toBe(0)
      expect(body.msg_id).toBe('msg1')
    })

    test('群聊消息使用正确 URL', async () => {
      const { fetch: mockFetch, calls } = createMockFetch()
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        _fetchFn: mockFetch,
      })

      ;(channel as any).accessToken = { access_token: 'test_token', expires_in: 7200, fetchedAt: Date.now() }
      ;(channel as any).recentMsgIds.set('qq:group:group456', { msgId: 'msg2', msgSeq: 0 })

      await channel.sendMessage('qq:group:group456', 'group hello')

      const msgCall = calls.find(c => c.url.includes('/v2/groups/group456/messages'))
      expect(msgCall).toBeDefined()

      const body = JSON.parse(msgCall!.init?.body as string)
      expect(body.content).toBe('group hello')
      expect(body.msg_id).toBe('msg2')
    })

    test('长消息分片发送', async () => {
      const { fetch: mockFetch, calls } = createMockFetch()
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        _fetchFn: mockFetch,
      })

      ;(channel as any).accessToken = { access_token: 'test_token', expires_in: 7200, fetchedAt: Date.now() }
      ;(channel as any).recentMsgIds.set('qq:c2c:user1', { msgId: 'msg1', msgSeq: 0 })

      const longText = 'x'.repeat(4001)
      await channel.sendMessage('qq:c2c:user1', longText)

      const msgCalls = calls.filter(c => c.url.includes('/messages'))
      expect(msgCalls.length).toBe(2)

      // 验证 msg_seq 递增
      const body1 = JSON.parse(msgCalls[0].init?.body as string)
      const body2 = JSON.parse(msgCalls[1].init?.body as string)
      expect(body1.msg_seq).toBe(1)
      expect(body2.msg_seq).toBe(2)
    })

    test('token 过期时自动刷新', async () => {
      const { fetch: mockFetch, calls } = createMockFetch()
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        _fetchFn: mockFetch,
      })

      // 设置一个过期的 token
      ;(channel as any).accessToken = { access_token: 'old_token', expires_in: 7200, fetchedAt: Date.now() - 8000000 }
      ;(channel as any).recentMsgIds.set('qq:c2c:user1', { msgId: 'msg1', msgSeq: 0 })

      await channel.sendMessage('qq:c2c:user1', 'hello')

      // 应该先刷新 token，再发送消息
      const tokenCall = calls.find(c => c.url.includes('getAppAccessToken'))
      expect(tokenCall).toBeDefined()
    })
  })

  describe('ownsChatId', () => {
    test('qq: 前缀返回 true', () => {
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        _fetchFn: mock(async () => new Response()) as any,
      })

      expect(channel.ownsChatId('qq:c2c:user1')).toBe(true)
      expect(channel.ownsChatId('qq:group:g1')).toBe(true)
    })

    test('非 qq: 前缀返回 false', () => {
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        _fetchFn: mock(async () => new Response()) as any,
      })

      expect(channel.ownsChatId('tg:123')).toBe(false)
      expect(channel.ownsChatId('feishu:chat1')).toBe(false)
      expect(channel.ownsChatId('web:uuid')).toBe(false)
    })
  })

  describe('isConnected', () => {
    test('初始状态为 false', () => {
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        _fetchFn: mock(async () => new Response()) as any,
      })

      expect(channel.isConnected()).toBe(false)
    })
  })

  describe('EventBus integration', () => {
    test('eventBus 订阅在 disconnect 后清理', async () => {
      const eventBus = new EventBus()
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        eventBus,
        _fetchFn: mock(async () => new Response()) as any,
      })

      // 构造阶段不订阅 eventBus
      expect(eventBus.subscriberCount).toBe(0)

      // disconnect 不应抛异常
      await channel.disconnect()
      expect(eventBus.subscriberCount).toBe(0)
    })

    test('手动模拟 eventBus 订阅后 disconnect 清理', async () => {
      const eventBus = new EventBus()
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        eventBus,
        _fetchFn: mock(async () => new Response()) as any,
      })

      // 手动模拟 connect 中的订阅逻辑
      const unsub = eventBus.subscribe(
        { types: ['complete', 'error'] },
        () => {}
      )
      ;(channel as any).unsubscribeEvents = unsub

      expect(eventBus.subscriberCount).toBe(1)

      await channel.disconnect()
      expect(eventBus.subscriberCount).toBe(0)
    })
  })

  describe('sendMessage edge cases', () => {
    test('未知 chatId 格式不发送', async () => {
      const { fetch: mockFetch, calls } = createMockFetch()
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        _fetchFn: mockFetch,
      })

      ;(channel as any).accessToken = { access_token: 'test_token', expires_in: 7200, fetchedAt: Date.now() }

      await channel.sendMessage('unknown:chat1', 'hello')

      const msgCalls = calls.filter(c => c.url.includes('/messages'))
      expect(msgCalls.length).toBe(0)
    })

    test('无 recentMsgId 时不带 msg_id', async () => {
      const { fetch: mockFetch, calls } = createMockFetch()
      const channel = new QQChannel('appid', 'secret', {
        onMessage: mock(() => {}),
        _fetchFn: mockFetch,
      })

      ;(channel as any).accessToken = { access_token: 'test_token', expires_in: 7200, fetchedAt: Date.now() }
      // 不设置 recentMsgIds

      await channel.sendMessage('qq:c2c:user1', 'hello')

      const msgCall = calls.find(c => c.url.includes('/messages'))
      expect(msgCall).toBeDefined()
      const body = JSON.parse(msgCall!.init?.body as string)
      expect(body.msg_id).toBeUndefined()
    })
  })
})
