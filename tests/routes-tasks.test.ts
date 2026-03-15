/**
 * REST API tasks routes 测试
 *
 * 覆盖：
 * - GET /tasks
 * - POST /tasks（含 name/description、校验）
 * - PUT /tasks/:id（含 name/description/scheduleType）
 * - POST /tasks/:id/clone
 * - DELETE /tasks/:id
 * - POST /tasks/:id/run（含 messages 写入）
 * - GET /tasks/:id/logs
 */

import { describe, test, expect, beforeAll, beforeEach, mock } from 'bun:test'
import { cleanTables } from './setup.ts'
import {
  createTask,
  getTask,
  getTasks,
  saveTaskRunLog,
  getMessages,
  getChats,
  getTaskRunLogs,
} from '../src/db/index.ts'
import type { ScheduledTask } from '../src/db/index.ts'
import { createTasksRoutes } from '../src/routes/tasks.ts'

let app: ReturnType<typeof createTasksRoutes>
let mockAgentQueue: any

beforeAll(() => {
  mockAgentQueue = {
    enqueue: mock(() => Promise.resolve('agent response')),
  }

  const mockScheduler = {
    calculateNextRun: (task: Pick<ScheduledTask, 'schedule_type' | 'schedule_value' | 'last_run'>) => {
      if (task.schedule_type === 'interval') {
        const ms = parseInt(task.schedule_value, 10)
        if (isNaN(ms) || ms <= 0) return null
        const base = task.last_run ? new Date(task.last_run) : new Date()
        return new Date(base.getTime() + ms).toISOString()
      }
      if (task.schedule_type === 'once') return null
      if (task.schedule_type === 'cron') return new Date(Date.now() + 60_000).toISOString()
      return null
    },
    runManually: async (task: ScheduledTask) => {
      try {
        const result = await mockAgentQueue.enqueue(task.agent_id, task.chat_id, task.prompt)
        // 模拟 saveTaskMessages
        const { saveMessage, upsertChat } = await import('../src/db/index.ts')
        const runId = crypto.randomUUID().slice(0, 8)
        const runAt = new Date().toISOString()
        saveMessage({ id: `${task.id}-${runId}-${runAt}-user`, chatId: task.chat_id, sender: 'manual', senderName: 'Manual Run', content: task.prompt, timestamp: runAt, isFromMe: true, isBotMessage: false })
        saveMessage({ id: `${task.id}-${runId}-${runAt}-bot`, chatId: task.chat_id, sender: task.agent_id, senderName: task.agent_id, content: result ?? '(no output)', timestamp: new Date().toISOString(), isFromMe: false, isBotMessage: true })
        const taskName = task.name || task.prompt.slice(0, 30)
        upsertChat(task.chat_id, task.agent_id, `Task: ${taskName}`, 'task')
        return { status: 'success', result: result ?? undefined }
      } catch (err: any) {
        return { status: 'error', error: err instanceof Error ? err.message : String(err) }
      }
    },
  } as any

  const mockAgentManager = {
    getAgent: (id: string) => (id === 'agent-1' || id === 'agent-2') ? { id } : undefined,
  } as any

  app = createTasksRoutes(mockScheduler, mockAgentManager, mockAgentQueue)
})

beforeEach(() => cleanTables('scheduled_tasks', 'task_run_logs', 'messages', 'chats'))

// ===== GET /tasks =====

describe('GET /tasks', () => {
  test('空列表', async () => {
    const res = await app.request('/tasks')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  test('返回所有任务', async () => {
    createTask({ id: 'g1', agentId: 'agent-1', chatId: 'c1', prompt: 'p1', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString(), name: '任务1' })
    createTask({ id: 'g2', agentId: 'agent-1', chatId: 'c2', prompt: 'p2', scheduleType: 'cron', scheduleValue: '0 9 * * *', nextRun: new Date().toISOString() })

    const res = await app.request('/tasks')
    const body = await res.json() as any[]
    expect(body.length).toBe(2)
  })

  test('返回值包含 name 和 description 字段', async () => {
    createTask({ id: 'g3', agentId: 'agent-1', chatId: 'c3', prompt: 'p3', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString(), name: '有名', description: '有描述' })

    const res = await app.request('/tasks')
    const body = await res.json() as any[]
    expect(body[0].name).toBe('有名')
    expect(body[0].description).toBe('有描述')
  })
})

// ===== POST /tasks =====

describe('POST /tasks', () => {
  test('创建带 name/description 的任务', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'task:new', prompt: 'hello',
        scheduleType: 'interval', scheduleValue: '120000',
        name: 'API 任务', description: 'API 描述',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.name).toBe('API 任务')
    expect(body.description).toBe('API 描述')
    expect(body.status).toBe('active')
    expect(body.next_run).not.toBeNull()
  })

  test('不传 name/description', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'task:no-name', prompt: 'test',
        scheduleType: 'interval', scheduleValue: '60000',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.name).toBeNull()
    expect(body.description).toBeNull()
  })

  test('agent 不存在 → 404', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'non-existent', chatId: 'c', prompt: 'p',
        scheduleType: 'interval', scheduleValue: '60000',
      }),
    })
    expect(res.status).toBe(404)
  })

  test('无效 scheduleType → 400', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'c', prompt: 'p',
        scheduleType: 'invalid', scheduleValue: '60000',
      }),
    })
    expect(res.status).toBe(400)
  })

  test('无效 scheduleValue（interval NaN）→ 400', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'c', prompt: 'p',
        scheduleType: 'interval', scheduleValue: 'not-a-number',
      }),
    })
    expect(res.status).toBe(400)
  })

  test('once 类型使用 scheduleValue 作为 nextRun', async () => {
    const futureTime = new Date(Date.now() + 86_400_000).toISOString()
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'task:once', prompt: 'once test',
        scheduleType: 'once', scheduleValue: futureTime,
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.next_run).toBe(futureTime)
  })

  test('cron 类型计算 nextRun', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'task:cron', prompt: 'cron test',
        scheduleType: 'cron', scheduleValue: '0 9 * * *',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.next_run).not.toBeNull()
    expect(body.schedule_type).toBe('cron')
  })
})

// ===== PUT /tasks/:id =====

describe('PUT /tasks/:id', () => {
  beforeEach(() => {
    createTask({ id: 'put-1', agentId: 'agent-1', chatId: 'c', prompt: 'original', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })
  })

  test('更新 name + description', async () => {
    const res = await app.request('/tasks/put-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '新名', description: '新描述' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.name).toBe('新名')
    expect(body.description).toBe('新描述')
    expect(body.prompt).toBe('original') // 未改的字段不变
  })

  test('更新 prompt', async () => {
    const res = await app.request('/tasks/put-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'updated prompt' }),
    })
    const body = await res.json() as any
    expect(body.prompt).toBe('updated prompt')
  })

  test('更新 status', async () => {
    const res = await app.request('/tasks/put-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    })
    const body = await res.json() as any
    expect(body.status).toBe('paused')
  })

  test('更新 scheduleValue 重新计算 nextRun', async () => {
    const before = getTask('put-1')!.next_run
    const res = await app.request('/tasks/put-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleValue: '120000' }),
    })
    const body = await res.json() as any
    expect(body.schedule_value).toBe('120000')
    // nextRun 应该被重新计算
    expect(body.next_run).not.toBe(before)
  })

  test('不存在的任务 → 404', async () => {
    const res = await app.request('/tasks/no-such-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(res.status).toBe(404)
  })
})

// ===== POST /tasks/:id/clone =====

describe('POST /tasks/:id/clone', () => {
  test('克隆有 name 的任务 → name 加 (copy)', async () => {
    createTask({ id: 'clone-1', agentId: 'agent-1', chatId: 'c', prompt: 'clone me', scheduleType: 'interval', scheduleValue: '120000', nextRun: new Date().toISOString(), name: '原始', description: '描述' })

    const res = await app.request('/tasks/clone-1/clone', { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).not.toBe('clone-1')
    expect(body.name).toBe('原始 (copy)')
    expect(body.description).toBe('描述')
    expect(body.prompt).toBe('clone me')
    expect(body.schedule_type).toBe('interval')
    expect(body.schedule_value).toBe('120000')
    expect(body.status).toBe('active')
    expect(body.chat_id).not.toBe('c') // 新 chatId

    expect(getTasks().length).toBe(2)
  })

  test('克隆无 name 的任务 → name 仍为 null', async () => {
    createTask({ id: 'clone-2', agentId: 'agent-1', chatId: 'c', prompt: 'no name', scheduleType: 'cron', scheduleValue: '0 9 * * *', nextRun: new Date().toISOString() })

    const res = await app.request('/tasks/clone-2/clone', { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.name).toBeNull()
  })

  test('克隆不存在的任务 → 404', async () => {
    const res = await app.request('/tasks/no-such/clone', { method: 'POST' })
    expect(res.status).toBe(404)
  })

  test('克隆 paused 任务 → 新任务为 active', async () => {
    createTask({ id: 'clone-3', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })
    // 原任务暂停
    const { updateTask } = await import('../src/db/index.ts')
    updateTask('clone-3', { status: 'paused' })

    const res = await app.request('/tasks/clone-3/clone', { method: 'POST' })
    const body = await res.json() as any
    expect(body.status).toBe('active')
  })
})

// ===== DELETE /tasks/:id =====

describe('DELETE /tasks/:id', () => {
  test('删除存在的任务', async () => {
    createTask({ id: 'del-1', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'once', scheduleValue: new Date().toISOString(), nextRun: new Date().toISOString() })

    const res = await app.request('/tasks/del-1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.ok).toBe(true)
    expect(getTask('del-1')).toBeNull()
  })

  test('删除不存在的任务 → 404', async () => {
    const res = await app.request('/tasks/no-such', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

// ===== POST /tasks/:id/run =====

describe('POST /tasks/:id/run', () => {
  test('手动运行成功 — 返回结果并保存 messages', async () => {
    const chatId = 'task:run-test'
    createTask({ id: 'run-1', agentId: 'agent-1', chatId, prompt: '手动测试', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString(), name: '运行测试' })

    const res = await app.request('/tasks/run-1/run', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.status).toBe('success')
    expect(body.result).toBe('agent response')

    // messages
    const msgs = getMessages(chatId, 10)
    expect(msgs.length).toBe(2)
    expect(msgs.find((m) => m.is_from_me === 1)!.content).toBe('手动测试')
    expect(msgs.find((m) => m.is_from_me === 1)!.sender).toBe('manual')
    expect(msgs.find((m) => m.is_bot_message === 1)!.content).toBe('agent response')

    // chat
    const chat = getChats().find((c) => c.chat_id === chatId)!
    expect(chat.name).toBe('Task: 运行测试')
    expect(chat.channel).toBe('task')
  })

  test('运行不存在的任务 → 404', async () => {
    const res = await app.request('/tasks/no-such/run', { method: 'POST' })
    expect(res.status).toBe(404)
  })

  test('运行失败 → 500 + error', async () => {
    createTask({ id: 'run-fail', agentId: 'agent-1', chatId: 'task:rf', prompt: 'fail', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })

    // 临时 mock 失败
    const originalEnqueue = mockAgentQueue.enqueue
    mockAgentQueue.enqueue = mock(() => Promise.reject(new Error('run error')))

    const res = await app.request('/tasks/run-fail/run', { method: 'POST' })
    expect(res.status).toBe(500)
    const body = await res.json() as any
    expect(body.status).toBe('error')
    expect(body.error).toBe('run error')

    // 恢复
    mockAgentQueue.enqueue = originalEnqueue
  })
})

// ===== GET /tasks/:id/logs =====

describe('GET /tasks/:id/logs', () => {
  test('返回任务的运行日志', async () => {
    createTask({ id: 'log-1', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })
    saveTaskRunLog({ taskId: 'log-1', runAt: '2026-03-10T10:00:00.000Z', durationMs: 1000, status: 'success', result: 'ok' })
    saveTaskRunLog({ taskId: 'log-1', runAt: '2026-03-10T11:00:00.000Z', durationMs: 500, status: 'error', error: 'err' })

    const res = await app.request('/tasks/log-1/logs')
    expect(res.status).toBe(200)
    const body = await res.json() as any[]
    expect(body.length).toBe(2)
    // DESC 排序
    expect(body[0].run_at).toBe('2026-03-10T11:00:00.000Z')
    expect(body[1].run_at).toBe('2026-03-10T10:00:00.000Z')
  })

  test('不存在的任务 → 404', async () => {
    const res = await app.request('/tasks/no-such/logs')
    expect(res.status).toBe(404)
  })

  test('无日志返回空数组', async () => {
    createTask({ id: 'log-empty', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })

    const res = await app.request('/tasks/log-empty/logs')
    const body = await res.json() as any[]
    expect(body.length).toBe(0)
  })
})

// ===== 额外测试场景 =====

describe('PUT /tasks/:id — 修改 scheduleType', () => {
  test('从 interval 改为 cron，nextRun 被重新计算', async () => {
    createTask({ id: 'put-st-1', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })

    const before = getTask('put-st-1')!
    const res = await app.request('/tasks/put-st-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleType: 'cron', scheduleValue: '0 9 * * *' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    // scheduleValue 已更新
    expect(body.schedule_value).toBe('0 9 * * *')
    // nextRun 已重新计算（与之前不同）
    expect(body.next_run).not.toBe(before.next_run)
    expect(body.next_run).not.toBeNull()
  })
})

describe('PUT /tasks/:id — 修改 name 和 description', () => {
  test('更新 name 和 description', async () => {
    createTask({ id: 'put-nd-1', agentId: 'agent-1', chatId: 'c', prompt: 'original', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString(), name: '旧名称', description: '旧描述' })

    const res = await app.request('/tasks/put-nd-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '新名称', description: '新描述' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.name).toBe('新名称')
    expect(body.description).toBe('新描述')
    // 其他字段不变
    expect(body.prompt).toBe('original')
    expect(body.schedule_type).toBe('interval')
    expect(body.schedule_value).toBe('60000')
  })
})

describe('POST /tasks/:id/clone — cron 类型任务', () => {
  test('克隆 cron 任务，名称加 (copy)，调度类型和值不变，状态为 active', async () => {
    createTask({ id: 'clone-cron-1', agentId: 'agent-1', chatId: 'c', prompt: 'cron prompt', scheduleType: 'cron', scheduleValue: '0 9 * * *', nextRun: new Date().toISOString(), name: 'Cron任务' })

    const res = await app.request('/tasks/clone-cron-1/clone', { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).not.toBe('clone-cron-1')
    expect(body.name).toBe('Cron任务 (copy)')
    expect(body.schedule_type).toBe('cron')
    expect(body.schedule_value).toBe('0 9 * * *')
    expect(body.status).toBe('active')
    expect(body.prompt).toBe('cron prompt')
  })
})

describe('POST /tasks/:id/clone — once 类型任务', () => {
  test('克隆 once 类型任务', async () => {
    const futureTime = new Date(Date.now() + 86_400_000).toISOString()
    createTask({ id: 'clone-once-1', agentId: 'agent-1', chatId: 'c', prompt: 'once prompt', scheduleType: 'once', scheduleValue: futureTime, nextRun: futureTime, name: 'Once任务' })

    const res = await app.request('/tasks/clone-once-1/clone', { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).not.toBe('clone-once-1')
    expect(body.schedule_type).toBe('once')
    expect(body.schedule_value).toBe(futureTime)
    expect(body.prompt).toBe('once prompt')
    expect(body.name).toBe('Once任务 (copy)')
    expect(body.status).toBe('active')
  })
})

describe('POST /tasks/:id/run — 连续运行两次', () => {
  test('运行两次产生 4 条 messages', async () => {
    const chatId = 'task:run-twice'
    createTask({ id: 'run-twice-1', agentId: 'agent-1', chatId, prompt: '重复运行', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })

    // 第一次运行
    const res1 = await app.request('/tasks/run-twice-1/run', { method: 'POST' })
    expect(res1.status).toBe(200)
    const body1 = await res1.json() as any
    expect(body1.status).toBe('success')

    // 第二次运行
    const res2 = await app.request('/tasks/run-twice-1/run', { method: 'POST' })
    expect(res2.status).toBe(200)
    const body2 = await res2.json() as any
    expect(body2.status).toBe('success')

    // 每次运行写 2 条 messages（user + bot），共 4 条
    const msgs = getMessages(chatId, 10)
    expect(msgs.length).toBe(4)
    // 应有 2 条 user（is_from_me=1）和 2 条 bot（is_bot_message=1）
    const userMsgs = msgs.filter((m) => m.is_from_me === 1)
    const botMsgs = msgs.filter((m) => m.is_bot_message === 1)
    expect(userMsgs.length).toBe(2)
    expect(botMsgs.length).toBe(2)
  })
})

describe('GET /tasks — 空列表', () => {
  test('无任务时返回空数组', async () => {
    const res = await app.request('/tasks')
    expect(res.status).toBe(200)
    const body = await res.json() as any[]
    expect(body).toEqual([])
    expect(body.length).toBe(0)
  })
})

describe('GET /tasks/:id — 不存在的 ID', () => {
  test('GET 不存在的任务返回 404', async () => {
    const res = await app.request('/tasks/non-existent-id-12345')
    // 没有 GET /tasks/:id 路由，Hono 返回 404
    expect(res.status).toBe(404)
  })
})

describe('POST /tasks — 缺少必要字段', () => {
  test('不传 prompt 字段', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'c',
        scheduleType: 'interval', scheduleValue: '60000',
        // 缺少 prompt
      }),
    })
    // prompt NOT NULL 约束导致创建失败，返回非 2xx
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

describe('POST /tasks — 无效的 scheduleType', () => {
  test('传入 invalid 作为 scheduleType 返回 400', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'c', prompt: 'test',
        scheduleType: 'invalid', scheduleValue: '60000',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error).toBeDefined()
  })
})

describe('DELETE — 删除后 GET 返回 404', () => {
  test('删除任务后通过 logs 端点确认 404', async () => {
    createTask({ id: 'del-get-1', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })

    // 确认任务存在
    const logsBefore = await app.request('/tasks/del-get-1/logs')
    expect(logsBefore.status).toBe(200)

    // 删除任务
    const delRes = await app.request('/tasks/del-get-1', { method: 'DELETE' })
    expect(delRes.status).toBe(200)

    // 删除后通过 logs 端点访问返回 404
    const logsAfter = await app.request('/tasks/del-get-1/logs')
    expect(logsAfter.status).toBe(404)

    // 也确认 PUT 返回 404
    const putRes = await app.request('/tasks/del-get-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    expect(putRes.status).toBe(404)
  })
})

// ===== Delivery 相关路由测试 =====

describe('POST /tasks — delivery 字段', () => {
  test('创建带 deliveryMode=push 和 deliveryTarget 的任务', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'task:dlv', prompt: '投递测试',
        scheduleType: 'interval', scheduleValue: '120000',
        deliveryMode: 'push', deliveryTarget: 'tg:123456',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.delivery_mode).toBe('push')
    expect(body.delivery_target).toBe('tg:123456')
  })

  test('deliveryMode=push 不传 deliveryTarget → 400', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'task:dlv-fail', prompt: '缺少目标',
        scheduleType: 'interval', scheduleValue: '120000',
        deliveryMode: 'push',
        // 缺少 deliveryTarget
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error).toContain('deliveryTarget')
  })

  test('不传 deliveryMode 时默认 none', async () => {
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1', chatId: 'task:dlv-default', prompt: '默认投递',
        scheduleType: 'interval', scheduleValue: '120000',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.delivery_mode).toBe('none')
    expect(body.delivery_target).toBeNull()
  })
})

describe('PUT /tasks/:id — delivery 字段', () => {
  test('更新 deliveryMode 和 deliveryTarget', async () => {
    createTask({ id: 'put-dlv-1', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })

    const res = await app.request('/tasks/put-dlv-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryMode: 'push', deliveryTarget: 'tg:789' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.delivery_mode).toBe('push')
    expect(body.delivery_target).toBe('tg:789')
  })

  test('将 deliveryTarget 设为 null', async () => {
    createTask({ id: 'put-dlv-2', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString(), deliveryMode: 'push', deliveryTarget: 'tg:111' })

    const res = await app.request('/tasks/put-dlv-2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryMode: 'none', deliveryTarget: null }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.delivery_mode).toBe('none')
    expect(body.delivery_target).toBeNull()
  })
})

describe('POST /tasks/:id/clone — delivery 字段', () => {
  test('克隆任务保留 delivery 配置', async () => {
    createTask({ id: 'clone-dlv-1', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString(), name: '投递任务', deliveryMode: 'push', deliveryTarget: 'tg:555' })

    const res = await app.request('/tasks/clone-dlv-1/clone', { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.delivery_mode).toBe('push')
    expect(body.delivery_target).toBe('tg:555')
    expect(body.name).toBe('投递任务 (copy)')
  })

  test('克隆无 delivery 配置的任务', async () => {
    createTask({ id: 'clone-dlv-2', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })

    const res = await app.request('/tasks/clone-dlv-2/clone', { method: 'POST' })
    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.delivery_mode).toBe('none')
    expect(body.delivery_target).toBeNull()
  })
})

describe('GET /tasks/:id/logs — delivery_status 字段', () => {
  test('运行日志包含 delivery_status', async () => {
    createTask({ id: 'log-dlv-1', agentId: 'agent-1', chatId: 'c', prompt: 'p', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString() })
    saveTaskRunLog({ taskId: 'log-dlv-1', runAt: '2026-03-10T10:00:00.000Z', durationMs: 1000, status: 'success', result: 'ok', deliveryStatus: 'sent' })
    saveTaskRunLog({ taskId: 'log-dlv-1', runAt: '2026-03-10T11:00:00.000Z', durationMs: 500, status: 'success', result: 'ok', deliveryStatus: 'skipped' })

    const res = await app.request('/tasks/log-dlv-1/logs')
    const body = await res.json() as any[]
    expect(body[0].delivery_status).toBe('skipped')
    expect(body[1].delivery_status).toBe('sent')
  })
})

describe('PUT /tasks/:id — 空 body', () => {
  test('空对象 {} 不修改任务', async () => {
    createTask({ id: 'put-empty-1', agentId: 'agent-1', chatId: 'c', prompt: 'original', scheduleType: 'interval', scheduleValue: '60000', nextRun: new Date().toISOString(), name: '原始名', description: '原始描述' })

    const before = getTask('put-empty-1')!

    const res = await app.request('/tasks/put-empty-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    // 所有字段保持不变
    expect(body.prompt).toBe(before.prompt)
    expect(body.name).toBe(before.name)
    expect(body.description).toBe(before.description)
    expect(body.schedule_value).toBe(before.schedule_value)
    expect(body.schedule_type).toBe(before.schedule_type)
    expect(body.status).toBe(before.status)
    expect(body.next_run).toBe(before.next_run)
  })
})
