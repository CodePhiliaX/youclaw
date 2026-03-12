import { Hono } from 'hono'
import { z } from 'zod'
import { Cron } from 'croner'
import {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  getTaskRunLogs,
} from '../db/index.ts'
import { refreshTasksSnapshot } from '../ipc/index.ts'
import type { AgentManager } from '../agent/manager.ts'
import type { AgentQueue } from '../agent/queue.ts'
import type { Scheduler } from '../scheduler/scheduler.ts'

// ===== Zod 入参验证 =====

const createTaskSchema = z.object({
  agentId: z.string().min(1),
  chatId: z.string().min(1),
  prompt: z.string().min(1),
  scheduleType: z.enum(['cron', 'interval', 'once']),
  scheduleValue: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  timezone: z.string().optional(),
  deliveryMode: z.enum(['push', 'none']).default('none').optional(),
  deliveryTarget: z.string().optional(),
}).refine((data) => {
  // push 模式必须有 deliveryTarget
  if (data.deliveryMode === 'push' && !data.deliveryTarget) return false
  return true
}, {
  message: 'deliveryTarget is required when deliveryMode is "push"',
}).refine((data) => {
  if (data.scheduleType === 'cron') {
    try {
      const opts: { timezone?: string } = {}
      if (data.timezone) opts.timezone = data.timezone
      new Cron(data.scheduleValue, opts)
      return true
    } catch {
      return false
    }
  }
  if (data.scheduleType === 'interval') {
    const ms = parseInt(data.scheduleValue, 10)
    return !isNaN(ms) && ms >= 60_000
  }
  if (data.scheduleType === 'once') {
    const date = new Date(data.scheduleValue)
    return !isNaN(date.getTime()) && date.getTime() > Date.now()
  }
  return false
}, {
  message: 'Invalid schedule: cron must be a valid expression, interval >= 60000ms, once must be a future ISO date',
})

const updateTaskSchema = z.object({
  prompt: z.string().min(1).optional(),
  scheduleType: z.enum(['cron', 'interval', 'once']).optional(),
  scheduleValue: z.string().min(1).optional(),
  status: z.enum(['active', 'paused', 'completed']).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  timezone: z.string().nullable().optional(),
  deliveryMode: z.enum(['push', 'none']).optional(),
  deliveryTarget: z.string().nullable().optional(),
})

export function createTasksRoutes(scheduler: Scheduler, agentManager: AgentManager, agentQueue: AgentQueue) {
  const app = new Hono()

  // GET /api/tasks — 任务列表
  app.get('/tasks', (c) => {
    const tasks = getTasks()
    return c.json(tasks)
  })

  // POST /api/tasks — 创建任务
  app.post('/tasks', async (c) => {
    const body = await c.req.json()
    const parsed = createTaskSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400)
    }

    const data = parsed.data

    // 验证 agent 存在
    const agent = agentManager.getAgent(data.agentId)
    if (!agent) {
      return c.json({ error: 'Agent not found' }, 404)
    }

    const id = crypto.randomUUID()

    // 计算首次运行时间
    let nextRun: string
    if (data.scheduleType === 'once') {
      nextRun = data.scheduleValue // ISO 时间
    } else {
      const computed = scheduler.calculateNextRun({
        schedule_type: data.scheduleType,
        schedule_value: data.scheduleValue,
        last_run: null,
        timezone: data.timezone,
      })
      if (!computed) {
        return c.json({ error: 'Invalid schedule value' }, 400)
      }
      nextRun = computed
    }

    createTask({
      id,
      agentId: data.agentId,
      chatId: data.chatId,
      prompt: data.prompt,
      scheduleType: data.scheduleType,
      scheduleValue: data.scheduleValue,
      nextRun,
      name: data.name,
      description: data.description,
      timezone: data.timezone,
      deliveryMode: data.deliveryMode,
      deliveryTarget: data.deliveryTarget,
    })

    const task = getTask(id)
    refreshTasksSnapshot(data.agentId, getTasks)
    return c.json(task, 201)
  })

  // PUT /api/tasks/:id — 更新任务
  app.put('/tasks/:id', async (c) => {
    const id = c.req.param('id')
    const existing = getTask(id)
    if (!existing) {
      return c.json({ error: 'Task not found' }, 404)
    }

    const body = await c.req.json()
    const parsed = updateTaskSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, 400)
    }

    const data = parsed.data
    const updates: Parameters<typeof updateTask>[1] = {}

    if (data.prompt !== undefined) updates.prompt = data.prompt
    if (data.status !== undefined) updates.status = data.status
    if (data.name !== undefined) updates.name = data.name
    if (data.description !== undefined) updates.description = data.description
    if (data.timezone !== undefined) updates.timezone = data.timezone
    if (data.deliveryMode !== undefined) updates.deliveryMode = data.deliveryMode
    if (data.deliveryTarget !== undefined) updates.deliveryTarget = data.deliveryTarget

    // 更新调度类型和调度值
    if (data.scheduleType !== undefined) updates.scheduleType = data.scheduleType
    if (data.scheduleValue !== undefined) updates.scheduleValue = data.scheduleValue

    // 如果调度相关字段变化，重新计算 nextRun
    if (data.scheduleValue !== undefined || data.scheduleType !== undefined || data.timezone !== undefined) {
      const scheduleType = data.scheduleType ?? existing.schedule_type
      const scheduleValue = data.scheduleValue ?? existing.schedule_value
      const timezone = data.timezone !== undefined ? data.timezone : existing.timezone

      // 验证新的调度配置
      if (scheduleType === 'cron') {
        try {
          const opts: { timezone?: string } = {}
          if (timezone) opts.timezone = timezone
          new Cron(scheduleValue, opts)
        } catch {
          return c.json({ error: 'Invalid cron expression' }, 400)
        }
      } else if (scheduleType === 'interval') {
        const ms = parseInt(scheduleValue, 10)
        if (isNaN(ms) || ms < 60_000) {
          return c.json({ error: 'Interval must be >= 60000ms' }, 400)
        }
      }

      const nextRun = scheduler.calculateNextRun({
        schedule_type: scheduleType,
        schedule_value: scheduleValue,
        last_run: existing.last_run,
        timezone,
      })
      updates.nextRun = nextRun
    }

    // 恢复 active 时重置连续失败计数
    if (data.status === 'active' && existing.status === 'paused') {
      updates.consecutiveFailures = 0
    }

    updateTask(id, updates)
    const updated = getTask(id)
    refreshTasksSnapshot(existing.agent_id, getTasks)
    return c.json(updated)
  })

  // POST /api/tasks/:id/clone — 克隆任务
  app.post('/tasks/:id/clone', async (c) => {
    const id = c.req.param('id')
    const existing = getTask(id)
    if (!existing) {
      return c.json({ error: 'Task not found' }, 404)
    }

    const newId = crypto.randomUUID()
    const chatId = `task:${newId.slice(0, 8)}`
    const nextRun = scheduler.calculateNextRun({
      schedule_type: existing.schedule_type,
      schedule_value: existing.schedule_value,
      last_run: null,
      timezone: existing.timezone,
    })

    createTask({
      id: newId,
      agentId: existing.agent_id,
      chatId,
      prompt: existing.prompt,
      scheduleType: existing.schedule_type,
      scheduleValue: existing.schedule_value,
      nextRun: nextRun ?? new Date().toISOString(),
      name: existing.name ? `${existing.name} (copy)` : undefined,
      description: existing.description ?? undefined,
      timezone: existing.timezone ?? undefined,
      deliveryMode: existing.delivery_mode ?? undefined,
      deliveryTarget: existing.delivery_target ?? undefined,
    })

    const task = getTask(newId)
    refreshTasksSnapshot(existing.agent_id, getTasks)
    return c.json(task, 201)
  })

  // DELETE /api/tasks/:id — 删除任务
  app.delete('/tasks/:id', (c) => {
    const id = c.req.param('id')
    const existing = getTask(id)
    if (!existing) {
      return c.json({ error: 'Task not found' }, 404)
    }

    deleteTask(id)
    refreshTasksSnapshot(existing.agent_id, getTasks)
    return c.json({ ok: true })
  })

  // POST /api/tasks/:id/run — 手动立即执行
  app.post('/tasks/:id/run', async (c) => {
    const id = c.req.param('id')
    const task = getTask(id)
    if (!task) {
      return c.json({ error: 'Task not found' }, 404)
    }

    const result = await scheduler.runManually(task)
    if (result.status === 'error') {
      return c.json(result, 500)
    }
    return c.json(result)
  })

  // GET /api/tasks/:id/logs — 运行历史
  app.get('/tasks/:id/logs', (c) => {
    const id = c.req.param('id')
    const existing = getTask(id)
    if (!existing) {
      return c.json({ error: 'Task not found' }, 404)
    }

    const logs = getTaskRunLogs(id)
    return c.json(logs)
  })

  return app
}
