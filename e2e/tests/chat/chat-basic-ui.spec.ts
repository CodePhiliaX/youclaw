import { test, expect, navigateToChat } from './helpers'

test.describe('Level 1: 页面加载与基本 UI', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToChat(page)
  })

  test('欢迎页核心元素可见', async ({ page }) => {
    await expect(page.getByTestId('chat-welcome')).toBeVisible()
    await expect(page.getByTestId('chat-input')).toBeVisible()
    await expect(page.getByTestId('chat-send')).toBeVisible()
  })

  test('发送按钮在输入为空时禁用', async ({ page }) => {
    await expect(page.getByTestId('chat-send')).toBeDisabled()

    // 纯空格仍禁用
    await page.getByTestId('chat-input').fill('   ')
    await expect(page.getByTestId('chat-send')).toBeDisabled()

    // 有文本则启用
    await page.getByTestId('chat-input').fill('hello')
    await expect(page.getByTestId('chat-send')).toBeEnabled()
  })

  test('新建聊天按钮可见', async ({ page }) => {
    await expect(page.getByTestId('chat-new')).toBeVisible()
  })

  test('搜索输入框可见', async ({ page }) => {
    await expect(page.getByTestId('chat-search')).toBeVisible()
  })

  test('右侧面板显示对话数量 badge', async ({ page }) => {
    // Badge 在 chat-new 按钮的同级区域，显示对话总数
    // 找到包含数字的 badge 元素（secondary variant）
    const badge = page.locator('.inline-flex.items-center.rounded-md').filter({ hasText: /^\d+$/ })
    await expect(badge.first()).toBeVisible()
  })
})
