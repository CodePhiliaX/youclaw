import {
  test, expect, UNIQUE,
  sendMessageViaAPI, getFirstAgentId,
  cleanupE2EChats,
  API_BASE,
} from './helpers'

/**
 * 会话自动恢复 E2E 测试
 *
 * 测试 useChatContext 中 localStorage 持久化逻辑：
 * - 刷新页面恢复上次会话
 * - New Chat 后刷新恢复上次有消息的会话
 * - 删除会话后 localStorage 被清理
 * - localStorage 中的 chatId 已被删除时回退
 * - 首次使用（无 localStorage）显示欢迎页
 *
 * 注意：恢复会话时会开启 SSE 连接，导致 networkidle 永远不会触发。
 * 恢复场景使用 domcontentloaded + 等待 message-user 出现，而非 networkidle。
 */

test.describe('会话自动恢复（localStorage 持久化）', () => {
  test.beforeEach(async ({ page }) => {
    // fixture 已 goto('/') + waitForLoadState('networkidle')
    // 清除 localStorage 确保测试隔离
    await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('youclaw-'))
      keys.forEach(k => localStorage.removeItem(k))
    })
  })

  test.afterEach(async ({ request }) => {
    await cleanupE2EChats(request)
  })

  test('刷新页面恢复上次会话', async ({ page, request }) => {
    const marker = UNIQUE()
    const agentId = await getFirstAgentId(request)
    await sendMessageViaAPI(request, { agentId, prompt: `restore-test ${marker}` })

    // 刷新拿到最新对话列表
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 点击第一个对话项，触发 loadChat 和 localStorage 写入
    await page.getByTestId('chat-item').first().click()
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('message-user').first()).toContainText(marker)

    // 等 useEffect 写入 localStorage
    await page.waitForTimeout(500)

    // 刷新页面 — 恢复会话会开启 SSE，不要等 networkidle
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // 恢复后消息应可见（无需手动点击）
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('message-user').first()).toContainText(marker)

    // 欢迎页不应可见
    await expect(page.getByTestId('chat-welcome')).not.toBeVisible()
  })

  test('点击 New Chat 后刷新恢复到上次有消息的会话', async ({ page, request }) => {
    const marker = UNIQUE()
    const agentId = await getFirstAgentId(request)
    await sendMessageViaAPI(request, { agentId, prompt: `newchat-restore ${marker}` })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 点击对话，触发 localStorage 写入
    await page.getByTestId('chat-item').first().click()
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500)

    // 点 New Chat — chatId 变 null，但 localStorage 保留上次 chatId
    await page.getByTestId('chat-new').click()
    await expect(page.getByTestId('chat-welcome')).toBeVisible({ timeout: 5_000 })

    // 刷新 — 恢复会话会开启 SSE，不要等 networkidle
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('message-user').first()).toContainText(marker)
  })

  test('删除已恢复的会话后刷新显示欢迎页', async ({ page, request }) => {
    const marker = UNIQUE()
    const agentId = await getFirstAgentId(request)
    await sendMessageViaAPI(request, { agentId, prompt: `delete-restore ${marker}` })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 进入对话触发 localStorage 写入
    await page.getByTestId('chat-item').first().click()
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500)

    // 删除对话 — 通过 DropdownMenu + AlertDialog
    const firstItem = page.getByTestId('chat-item').first()
    await firstItem.hover()
    await firstItem.getByTestId('chat-item-menu').click()
    await page.getByTestId('chat-item-delete').click()

    // 确认 AlertDialog 删除
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()

    // 等待删除完成
    await page.waitForTimeout(1000)

    // 应回到欢迎页
    await expect(page.getByTestId('chat-welcome')).toBeVisible({ timeout: 5_000 })

    // 刷新后也应显示欢迎页（localStorage 已清理）
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('chat-welcome')).toBeVisible({ timeout: 10_000 })
  })

  test('首次使用无 localStorage 显示欢迎页', async ({ page }) => {
    // beforeEach 已清除 localStorage
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('chat-welcome')).toBeVisible({ timeout: 10_000 })
  })

  test('localStorage 中的 chatId 已被删除时回退到欢迎页', async ({ page, request }) => {
    const agentId = await getFirstAgentId(request)
    const { chatId } = await sendMessageViaAPI(request, { agentId, prompt: `stale-restore ${UNIQUE()}` })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 进入对话触发 localStorage 写入
    await page.getByTestId('chat-item').first().click()
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500)

    // 通过 API 直接删除对话（模拟后台删除）
    await request.delete(`${API_BASE}/api/chats/${encodeURIComponent(chatId)}`)

    // 刷新 — loadChat 应失败（空消息），清除 localStorage，显示欢迎页
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('chat-welcome')).toBeVisible({ timeout: 15_000 })
  })
})
