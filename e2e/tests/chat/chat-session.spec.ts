import {
  test, expect, UNIQUE,
  sendMessageViaAPI, getChatsViaAPI, getMessagesViaAPI,
  cleanupE2EChats,
  navigateToChat,
} from './helpers'

test.describe('Level 2: 会话管理', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToChat(page)
  })

  test.afterEach(async ({ request }) => {
    await cleanupE2EChats(request)
  })

  test('新建聊天回到欢迎页', async ({ page, request }) => {
    await sendMessageViaAPI(request)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 点击进入对话
    await page.getByTestId('chat-item').first().click()
    await expect(page.getByTestId('chat-welcome')).not.toBeVisible()

    // 点击新建
    await page.getByTestId('chat-new').click()
    await expect(page.getByTestId('chat-welcome')).toBeVisible()
  })

  test('点击列表项加载对话', async ({ page, request }) => {
    const marker = UNIQUE()
    await sendMessageViaAPI(request, { prompt: `load-test ${marker}` })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 点击最新的对话项
    await page.getByTestId('chat-item').first().click()

    // 验证用户消息可见且包含 marker
    const userMsg = page.getByTestId('message-user')
    await expect(userMsg.first()).toBeVisible({ timeout: 10_000 })
    await expect(userMsg.first()).toContainText(marker)
  })

  test('加载对话时消息按时间正序排列', async ({ page, request }) => {
    const chatId = `web:e2e-${crypto.randomUUID().slice(0, 8)}`

    // 连续发送 3 条消息到同一对话
    await sendMessageViaAPI(request, { chatId, prompt: 'ORDER-1' })
    await new Promise((r) => setTimeout(r, 100))
    await sendMessageViaAPI(request, { chatId, prompt: 'ORDER-2' })
    await new Promise((r) => setTimeout(r, 100))
    await sendMessageViaAPI(request, { chatId, prompt: 'ORDER-3' })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 点击该对话（最新的在最前）
    await page.getByTestId('chat-item').first().click()
    await page.waitForLoadState('networkidle')

    // 等待消息加载
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 15_000 })

    // 获取所有 user 消息文本
    const userMessages = page.getByTestId('message-user')
    const texts = await userMessages.allTextContents()

    // 验证顺序：ORDER-1 在 ORDER-2 之前，ORDER-2 在 ORDER-3 之前
    const idx1 = texts.findIndex((t) => t.includes('ORDER-1'))
    const idx2 = texts.findIndex((t) => t.includes('ORDER-2'))
    const idx3 = texts.findIndex((t) => t.includes('ORDER-3'))
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThan(idx1)
    expect(idx3).toBeGreaterThan(idx2)

    // 验证与 API 返回的顺序一致
    const apiMessages = await getMessagesViaAPI(request, chatId)
    const apiUserMessages = apiMessages.filter((m) => m.sender === 'user')
    const apiTexts = apiUserMessages.map((m) => m.content)
    const apiIdx1 = apiTexts.findIndex((t) => t.includes('ORDER-1'))
    const apiIdx2 = apiTexts.findIndex((t) => t.includes('ORDER-2'))
    const apiIdx3 = apiTexts.findIndex((t) => t.includes('ORDER-3'))
    expect(apiIdx1).toBeGreaterThanOrEqual(0)
    expect(apiIdx2).toBeGreaterThan(apiIdx1)
    expect(apiIdx3).toBeGreaterThan(apiIdx2)
  })

  test('搜索过滤对话列表', async ({ page, request }) => {
    // 搜索按 chat_id 过滤，使用唯一的 chatId
    const suffixA = `srch-a-${Date.now()}`
    const suffixB = `srch-b-${Date.now()}`
    const chatIdA = `web:e2e-${suffixA}`
    const chatIdB = `web:e2e-${suffixB}`

    await sendMessageViaAPI(request, { chatId: chatIdA, prompt: 'search test A' })
    await sendMessageViaAPI(request, { chatId: chatIdB, prompt: 'search test B' })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 搜索 suffixA（chatId 的一部分）
    await page.getByTestId('chat-search').fill(suffixA)
    await expect(page.getByTestId('chat-item')).toHaveCount(1, { timeout: 5_000 })

    // 清空搜索 → 至少两个都显示
    await page.getByTestId('chat-search').fill('')
    await expect(page.getByTestId('chat-item').nth(1)).toBeVisible({ timeout: 5_000 })
  })

  test('搜索无匹配显示空状态', async ({ page }) => {
    await page.getByTestId('chat-search').fill('nonexistent-query-xyz-12345')

    // 验证空状态文本（支持中英文）
    const emptyText = page.locator('text=No conversations yet')
    const emptyTextCn = page.locator('text=暂无对话')
    await expect(emptyText.or(emptyTextCn)).toBeVisible({ timeout: 5_000 })
  })

  test('删除对话 — 确认删除', async ({ page, request }) => {
    const { chatId } = await sendMessageViaAPI(request)

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 先注册 dialog handler，再触发删除
    page.once('dialog', (d) => d.accept())

    // 等待 DELETE 响应确认删除完成
    const deletePromise = page.waitForResponse(
      (r) => r.url().includes('/api/chats/') && r.request().method() === 'DELETE'
    )

    const chatItem = page.getByTestId('chat-item').first()
    await chatItem.hover()
    await chatItem.getByTestId('chat-item-menu').click()
    await page.getByTestId('chat-item-delete').click()

    await deletePromise

    // API 验证已删除
    const chats = await getChatsViaAPI(request)
    expect(chats.find((c) => c.chat_id === chatId)).toBeUndefined()
  })

  test('删除对话 — 取消删除', async ({ page, request }) => {
    await sendMessageViaAPI(request)

    await page.reload()
    await page.waitForLoadState('networkidle')

    const countBefore = await page.getByTestId('chat-item').count()

    // 注册 dismiss handler
    page.once('dialog', (d) => d.dismiss())

    const chatItem = page.getByTestId('chat-item').first()
    await chatItem.hover()
    await chatItem.getByTestId('chat-item-menu').click()
    await page.getByTestId('chat-item-delete').click()

    // 数量不变
    await expect(page.getByTestId('chat-item')).toHaveCount(countBefore)
  })

  test('删除当前正在查看的对话回到欢迎页', async ({ page, request }) => {
    await sendMessageViaAPI(request, { prompt: `view-delete ${UNIQUE()}` })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 点击进入对话
    const chatItem = page.getByTestId('chat-item').first()
    await chatItem.click()
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 10_000 })

    // 删除
    page.once('dialog', (d) => d.accept())

    await chatItem.hover()
    await chatItem.getByTestId('chat-item-menu').click()
    await page.getByTestId('chat-item-delete').click()

    // 应回到欢迎页
    await expect(page.getByTestId('chat-welcome')).toBeVisible({ timeout: 5_000 })
  })

  test('快速切换对话显示正确内容', async ({ page, request }) => {
    const markerA = UNIQUE()
    const markerB = UNIQUE()

    // 先创建 A（会排在后面），再创建 B（排在前面）
    await sendMessageViaAPI(request, { prompt: `switch-A ${markerA}` })
    await new Promise((r) => setTimeout(r, 100))
    await sendMessageViaAPI(request, { prompt: `switch-B ${markerB}` })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // B 最新，排在第 0 位；A 排在第 1 位
    const items = page.getByTestId('chat-item')

    // 点击 B（最新，第 0 位）
    await items.nth(0).click()
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('message-user').first()).toContainText(markerB)

    // 点击 A（第 1 位）
    await items.nth(1).click()
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('message-user').first()).toContainText(markerA)
    // A 的消息不包含 B 的标记
    const allTexts = await page.getByTestId('message-user').allTextContents()
    const containsB = allTexts.some((t) => t.includes(markerB))
    expect(containsB).toBe(false)
  })

  test('对话列表按最新消息时间倒序排列', async ({ page, request }) => {
    const markerOld = UNIQUE()
    const markerNew = UNIQUE()

    // 先创建旧对话
    await sendMessageViaAPI(request, { prompt: `order-old ${markerOld}` })
    await new Promise((r) => setTimeout(r, 200))
    // 后创建新对话
    await sendMessageViaAPI(request, { prompt: `order-new ${markerNew}` })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 最新的应排在第一位
    await page.getByTestId('chat-item').first().click()
    await expect(page.getByTestId('message-user').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('message-user').first()).toContainText(markerNew)
  })
})
