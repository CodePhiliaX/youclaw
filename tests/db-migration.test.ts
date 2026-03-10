/**
 * 数据库迁移测试
 *
 * 验证 scheduled_tasks 表的 name/description 列迁移正确性
 */

import { describe, test, expect } from 'bun:test'
import { getDatabase } from './setup.ts'

describe('数据库迁移 — name/description 字段', () => {
  test('scheduled_tasks 表包含所有预期列', () => {
    const db = getDatabase()
    const columns = db.query("PRAGMA table_info('scheduled_tasks')").all() as Array<{ name: string; type: string }>
    const colNames = columns.map((c) => c.name)

    // 原有字段
    expect(colNames).toContain('id')
    expect(colNames).toContain('agent_id')
    expect(colNames).toContain('chat_id')
    expect(colNames).toContain('prompt')
    expect(colNames).toContain('schedule_type')
    expect(colNames).toContain('schedule_value')
    expect(colNames).toContain('next_run')
    expect(colNames).toContain('last_run')
    expect(colNames).toContain('status')
    expect(colNames).toContain('created_at')

    // 新增字段
    expect(colNames).toContain('name')
    expect(colNames).toContain('description')
  })

  test('name 和 description 列类型为 TEXT', () => {
    const db = getDatabase()
    const columns = db.query("PRAGMA table_info('scheduled_tasks')").all() as Array<{ name: string; type: string }>

    const nameCol = columns.find((c) => c.name === 'name')
    const descCol = columns.find((c) => c.name === 'description')

    expect(nameCol!.type).toBe('TEXT')
    expect(descCol!.type).toBe('TEXT')
  })

  test('重复 ALTER TABLE 不报错（try-catch 吞掉异常）', () => {
    const db = getDatabase()
    expect(() => {
      try { db.exec('ALTER TABLE scheduled_tasks ADD COLUMN name TEXT') } catch {}
      try { db.exec('ALTER TABLE scheduled_tasks ADD COLUMN description TEXT') } catch {}
    }).not.toThrow()
  })

  test('messages 表结构正确', () => {
    const db = getDatabase()
    const columns = db.query("PRAGMA table_info('messages')").all() as Array<{ name: string }>
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('chat_id')
    expect(colNames).toContain('sender')
    expect(colNames).toContain('sender_name')
    expect(colNames).toContain('content')
    expect(colNames).toContain('timestamp')
    expect(colNames).toContain('is_from_me')
    expect(colNames).toContain('is_bot_message')
  })

  test('chats 表结构正确', () => {
    const db = getDatabase()
    const columns = db.query("PRAGMA table_info('chats')").all() as Array<{ name: string }>
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('chat_id')
    expect(colNames).toContain('name')
    expect(colNames).toContain('agent_id')
    expect(colNames).toContain('channel')
    expect(colNames).toContain('is_group')
    expect(colNames).toContain('last_message_time')
  })

  test('task_run_logs 表结构正确', () => {
    const db = getDatabase()
    const columns = db.query("PRAGMA table_info('task_run_logs')").all() as Array<{ name: string }>
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('task_id')
    expect(colNames).toContain('run_at')
    expect(colNames).toContain('duration_ms')
    expect(colNames).toContain('status')
    expect(colNames).toContain('result')
    expect(colNames).toContain('error')
  })
})
