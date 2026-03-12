import { describe, test, beforeEach, beforeAll, afterAll, expect } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs'
import '../../tests/setup.ts'
import { getPaths } from '../config/index.ts'
import { getLogDates, readLogEntries, cleanOldLogs } from './reader.ts'

const logsDir = getPaths().logs

// 示例日志行
function makeLogLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    level: 30,
    time: Date.now(),
    msg: 'test message',
    ...overrides,
  })
}

beforeAll(() => {
  mkdirSync(logsDir, { recursive: true })
})

afterAll(() => {
  if (existsSync(logsDir)) {
    rmSync(logsDir, { recursive: true, force: true })
  }
})

function cleanLogsDir() {
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true })
    return
  }
  for (const f of readdirSync(logsDir)) {
    rmSync(`${logsDir}/${f}`)
  }
}

describe('getLogDates', () => {
  beforeEach(cleanLogsDir)

  test('返回空数组当目录无日志文件', () => {
    const dates = getLogDates()
    expect(dates).toEqual([])
  })

  test('返回按降序排列的日期', () => {
    writeFileSync(`${logsDir}/2026-03-09.log`, '')
    writeFileSync(`${logsDir}/2026-03-11.log`, '')
    writeFileSync(`${logsDir}/2026-03-10.log`, '')
    // 非日志文件应被忽略
    writeFileSync(`${logsDir}/random.txt`, '')

    const dates = getLogDates()
    expect(dates).toEqual(['2026-03-11', '2026-03-10', '2026-03-09'])
  })
})

describe('readLogEntries', () => {
  beforeEach(cleanLogsDir)

  test('文件不存在时返回空结果', async () => {
    const result = await readLogEntries('2099-01-01', {})
    expect(result).toEqual({ entries: [], total: 0, hasMore: false })
  })

  test('读取并解析所有日志行', async () => {
    const lines = [
      makeLogLine({ msg: 'first', time: 1000 }),
      makeLogLine({ msg: 'second', time: 2000 }),
    ]
    writeFileSync(`${logsDir}/2026-03-11.log`, lines.join('\n') + '\n')

    const result = await readLogEntries('2026-03-11', {})
    expect(result.total).toBe(2)
    expect(result.entries.length).toBe(2)
    expect(result.entries[0]!.msg).toBe('first')
    expect(result.entries[1]!.msg).toBe('second')
    expect(result.hasMore).toBe(false)
  })

  test('按级别过滤', async () => {
    const lines = [
      makeLogLine({ level: 20, msg: 'debug msg' }),
      makeLogLine({ level: 30, msg: 'info msg' }),
      makeLogLine({ level: 40, msg: 'warn msg' }),
      makeLogLine({ level: 50, msg: 'error msg' }),
    ]
    writeFileSync(`${logsDir}/2026-03-11.log`, lines.join('\n') + '\n')

    const result = await readLogEntries('2026-03-11', { level: 'warn' })
    expect(result.total).toBe(2)
    expect(result.entries[0]!.msg).toBe('warn msg')
    expect(result.entries[1]!.msg).toBe('error msg')
  })

  test('按类别过滤 - agent', async () => {
    const lines = [
      makeLogLine({ msg: 'system log' }),
      makeLogLine({ msg: 'agent log', category: 'agent' }),
      makeLogLine({ msg: 'tool log', category: 'tool_use' }),
    ]
    writeFileSync(`${logsDir}/2026-03-11.log`, lines.join('\n') + '\n')

    const result = await readLogEntries('2026-03-11', { category: 'agent' })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.msg).toBe('agent log')
  })

  test('按类别过滤 - system（无 category 的日志）', async () => {
    const lines = [
      makeLogLine({ msg: 'system log' }),
      makeLogLine({ msg: 'agent log', category: 'agent' }),
    ]
    writeFileSync(`${logsDir}/2026-03-11.log`, lines.join('\n') + '\n')

    const result = await readLogEntries('2026-03-11', { category: 'system' })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.msg).toBe('system log')
  })

  test('按关键词搜索', async () => {
    const lines = [
      makeLogLine({ msg: 'hello world' }),
      makeLogLine({ msg: 'foo bar' }),
      makeLogLine({ msg: 'Hello Again' }),
    ]
    writeFileSync(`${logsDir}/2026-03-11.log`, lines.join('\n') + '\n')

    const result = await readLogEntries('2026-03-11', { search: 'hello' })
    expect(result.total).toBe(2)
  })

  test('分页 offset/limit', async () => {
    const lines = Array.from({ length: 5 }, (_, i) =>
      makeLogLine({ msg: `msg-${i}` })
    )
    writeFileSync(`${logsDir}/2026-03-11.log`, lines.join('\n') + '\n')

    const result = await readLogEntries('2026-03-11', { offset: 2, limit: 2 })
    expect(result.total).toBe(5)
    expect(result.entries.length).toBe(2)
    expect(result.entries[0]!.msg).toBe('msg-2')
    expect(result.entries[1]!.msg).toBe('msg-3')
    expect(result.hasMore).toBe(true)
  })

  test('最后一页 hasMore 为 false', async () => {
    const lines = Array.from({ length: 3 }, (_, i) =>
      makeLogLine({ msg: `msg-${i}` })
    )
    writeFileSync(`${logsDir}/2026-03-11.log`, lines.join('\n') + '\n')

    const result = await readLogEntries('2026-03-11', { offset: 2, limit: 2 })
    expect(result.entries.length).toBe(1)
    expect(result.hasMore).toBe(false)
  })

  test('跳过非 JSON 行', async () => {
    const content = [
      'not json at all',
      makeLogLine({ msg: 'valid' }),
      '{ broken json',
    ].join('\n') + '\n'
    writeFileSync(`${logsDir}/2026-03-11.log`, content)

    const result = await readLogEntries('2026-03-11', {})
    expect(result.total).toBe(1)
    expect(result.entries[0]!.msg).toBe('valid')
  })

  test('组合过滤：级别 + 类别 + 搜索', async () => {
    const lines = [
      makeLogLine({ level: 30, category: 'agent', msg: '开始处理消息' }),
      makeLogLine({ level: 50, category: 'agent', msg: '消息处理失败' }),
      makeLogLine({ level: 50, msg: '数据库错误' }),
      makeLogLine({ level: 30, category: 'tool_use', msg: '工具调用: Bash' }),
    ]
    writeFileSync(`${logsDir}/2026-03-11.log`, lines.join('\n') + '\n')

    const result = await readLogEntries('2026-03-11', {
      level: 'error',
      category: 'agent',
      search: '失败',
    })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.msg).toBe('消息处理失败')
  })
})

describe('cleanOldLogs', () => {
  beforeEach(cleanLogsDir)

  test('删除超过保留天数的日志文件', () => {
    // 创建一个 60 天前的日志
    const old = new Date()
    old.setDate(old.getDate() - 60)
    const oldDate = old.toISOString().split('T')[0]!

    // 今天的日志
    const today = new Date().toISOString().split('T')[0]!

    writeFileSync(`${logsDir}/${oldDate}.log`, 'old')
    writeFileSync(`${logsDir}/${today}.log`, 'new')

    const deleted = cleanOldLogs(30)
    expect(deleted).toBe(1)

    // 今天的文件还在
    const remaining = readdirSync(logsDir)
    expect(remaining.length).toBe(1)
    expect(remaining[0]).toBe(`${today}.log`)
  })

  test('retainDays 内的文件不删除', () => {
    const today = new Date().toISOString().split('T')[0]!
    writeFileSync(`${logsDir}/${today}.log`, 'keep')

    const deleted = cleanOldLogs(7)
    expect(deleted).toBe(0)
    expect(readdirSync(logsDir).length).toBe(1)
  })
})
