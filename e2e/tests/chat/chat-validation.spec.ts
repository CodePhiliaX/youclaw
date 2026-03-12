import {
  test, expect, UNIQUE,
  sendMessageViaAPI, cleanupE2EChats,
  navigateToChat,
} from './helpers'

test.describe('Level 4: 边界情况与错误处理', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToChat(page)
  })

  test.afterEach(async ({ request }) => {
    await cleanupE2EChats(request)
  })

  test('空消息无法发送', async ({ page }) => {
    // 输入框为空时，发送按钮应禁用
    await expect(page.getByTestId('chat-send')).toBeDisabled()
  })

  test('纯空格消息无法发送', async ({ page }) => {
    await page.getByTestId('chat-input').fill('   ')
    await expect(page.getByTestId('chat-send')).toBeDisabled()
  })

  test('API 请求体包含正确字段', async ({ page }) => {
    const testPrompt = `validate-api ${UNIQUE()}`

    // 拦截发送消息的 API 请求
    const requestPromise = page.waitForRequest(
      (r) => r.url().includes('/api/agents/') && r.url().includes('/message') && r.method() === 'POST'
    )

    await page.getByTestId('chat-input').fill(testPrompt)
    await page.getByTestId('chat-send').click()

    const req = await requestPromise
    const body = req.postDataJSON()

    expect(body).toHaveProperty('prompt')
    expect(body.prompt).toBe(testPrompt)
  })

  test('删除菜单仅在 hover 时可见', async ({ page, request }) => {
    await sendMessageViaAPI(request, { prompt: `hover-test ${UNIQUE()}` })

    await page.reload()
    await page.waitForLoadState('networkidle')

    const chatItem = page.getByTestId('chat-item').first()
    await expect(chatItem).toBeVisible()

    // 默认菜单按钮不可见（opacity-0）
    const menuBtn = chatItem.getByTestId('chat-item-menu')
    await expect(menuBtn).toHaveCSS('opacity', '0')

    // hover 后可见
    await chatItem.hover()
    await expect(menuBtn).not.toHaveCSS('opacity', '0')
  })

  test('对话列表按时间分组', async ({ page, request }) => {
    // 创建一个对话（今天的）
    await sendMessageViaAPI(request, { prompt: `group-test ${UNIQUE()}` })

    await page.reload()
    await page.waitForLoadState('networkidle')

    // 验证 "Today" 或 "今天" 分组标签可见
    const todayLabel = page.getByText('Today')
    const todayLabelCn = page.getByText('今天')
    await expect(todayLabel.or(todayLabelCn)).toBeVisible({ timeout: 5_000 })
  })
})
