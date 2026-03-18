import { test, expect, navigateToChat, ensureNewChat, snapshotChats, API_BASE } from './helpers'

test.describe('Level 3: File attachment upload', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120_000)

  let cleanup: (() => Promise<void>) | undefined

  test.beforeEach(async ({ page, request }) => {
    let healthy = false
    try {
      const res = await request.get(`${API_BASE}/api/health`)
      healthy = res.status() === 200
    } catch { healthy = false }
    test.skip(!healthy, 'API server not healthy')
    cleanup = await snapshotChats(request)
    await navigateToChat(page)
    await ensureNewChat(page)
  })

  test.afterEach(async () => { if (cleanup) await cleanup() })

  test('upload text file and send message', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('E2E test file content'),
    })
    // Grid variant only shows icon, not filename — verify attachment container appears
    const removeBtn = page.locator('button[aria-label="Remove"]')
    await expect(removeBtn.first()).toBeVisible({ timeout: 5_000 })

    await page.getByTestId('chat-input').fill('Please read the file content')
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('message-user')).toBeVisible({ timeout: 10_000 })
  })

  test('remove added attachment', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'remove-test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('will be removed'),
    })
    const removeBtn = page.locator('button[aria-label="Remove"]')
    await expect(removeBtn.first()).toBeVisible({ timeout: 5_000 })

    // Hover to reveal remove button (it's hidden until hover in grid variant)
    const attachment = page.locator('.group.relative.size-24').first()
    await attachment.hover()
    await removeBtn.first().click({ force: true })

    // Verify attachment is removed
    await expect(attachment).not.toBeVisible({ timeout: 3_000 })
  })
})
