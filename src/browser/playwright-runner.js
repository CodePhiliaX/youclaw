import { stdin, stdout, stderr, exit } from 'node:process'
import { chromium } from 'playwright-core'

const REF_ATTRIBUTE = 'data-youclaw-ref'

function isLoopback(endpoint) {
  try {
    const url = new URL(endpoint)
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

function ensureNoProxy(endpoint) {
  if (!isLoopback(endpoint)) return
  const loopback = 'localhost,127.0.0.1,[::1]'
  const current = process.env.NO_PROXY || process.env.no_proxy || ''
  const next = current ? `${current},${loopback}` : loopback
  process.env.NO_PROXY = next
  process.env.no_proxy = next
}

async function readStdin() {
  const chunks = []
  for await (const chunk of stdin) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function resolvePage(browser, activePageUrl, createIfMissing = true) {
  const contexts = browser.contexts()
  const pages = contexts.flatMap((context) => context.pages().map((page) => ({ context, page })))

  if (activePageUrl) {
    const exact = pages.find(({ page }) => !page.isClosed() && page.url() === activePageUrl)
    if (exact) return exact
  }

  const firstNavigated = pages.find(({ page }) => !page.isClosed() && page.url() && page.url() !== 'about:blank')
  if (firstNavigated) return firstNavigated

  const first = pages.find(({ page }) => !page.isClosed())
  if (first) return first

  if (!createIfMissing) return null

  const context = contexts[0]
  if (!context) {
    throw new Error('No browser context is available over CDP')
  }
  const page = await context.newPage()
  return { context, page }
}

async function captureSnapshot(page) {
  return page.evaluate((refAttribute) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
    const truncate = (value, limit = 120) => value.length > limit ? `${value.slice(0, limit - 1)}…` : value
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const readLabel = (element) => {
      const ariaLabel = normalize(element.getAttribute('aria-label'))
      if (ariaLabel) return ariaLabel

      const labelledBy = normalize(element.getAttribute('aria-labelledby'))
      if (labelledBy) {
        const labelText = labelledBy
          .split(/\s+/)
          .map((id) => normalize(document.getElementById(id)?.textContent))
          .filter(Boolean)
          .join(' ')
        if (labelText) return truncate(labelText)
      }

      if ('labels' in element && element.labels?.length) {
        const text = Array.from(element.labels)
          .map((label) => normalize(label.textContent))
          .filter(Boolean)
          .join(' ')
        if (text) return truncate(text)
      }

      const id = normalize(element.id)
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`)
        const text = normalize(label?.textContent)
        if (text) return truncate(text)
      }

      return ''
    }

    document.querySelectorAll(`[${refAttribute}]`).forEach((element) => {
      element.removeAttribute(refAttribute)
    })

    const selector = [
      'a',
      'button',
      'input',
      'textarea',
      'select',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="combobox"]',
      '[contenteditable="true"]',
    ].join(',')

    const refs = []
    const elements = Array.from(document.querySelectorAll(selector))
      .filter((element) => isVisible(element))
      .slice(0, 80)

    for (const [index, element] of elements.entries()) {
      const ref = String(index + 1)
      element.setAttribute(refAttribute, ref)

      const text = truncate(normalize(element.innerText || element.textContent))
      const label = truncate(readLabel(element))
      const placeholder = truncate(normalize(element.getAttribute('placeholder')))
      const role = normalize(element.getAttribute('role'))
      const type = 'type' in element ? normalize(element.type) : ''
      const value = 'value' in element ? truncate(normalize(element.value)) : ''

      refs.push({
        ref,
        tag: element.tagName.toLowerCase(),
        role: role || undefined,
        type: type || undefined,
        label: label || undefined,
        text: text || undefined,
        placeholder: placeholder || undefined,
        value: value || undefined,
      })
    }

    return {
      text: normalize(document.body?.innerText || '').slice(0, 4000),
      refs,
    }
  }, REF_ATTRIBUTE)
}

async function main() {
  const raw = await readStdin()
  const input = raw ? JSON.parse(raw) : {}
  ensureNoProxy(input.endpoint)

  const browser = await chromium.connectOverCDP(input.endpoint)
  try {
    switch (input.action) {
      case 'open_tab': {
        const context = browser.contexts()[0]
        if (!context) throw new Error('No browser context is available over CDP')
        const page = await context.newPage()
        if (input.url) {
          await page.goto(input.url, { waitUntil: 'domcontentloaded' })
        }
        stdout.write(JSON.stringify({
          url: page.url(),
          title: await page.title().catch(() => ''),
        }))
        break
      }
      case 'navigate': {
        const resolved = await resolvePage(browser, input.activePageUrl)
        await resolved.page.goto(input.url, { waitUntil: 'domcontentloaded' })
        stdout.write(JSON.stringify({
          url: resolved.page.url(),
          title: await resolved.page.title().catch(() => ''),
        }))
        break
      }
      case 'snapshot': {
        const resolved = await resolvePage(browser, input.activePageUrl)
        const snapshot = await captureSnapshot(resolved.page)
        stdout.write(JSON.stringify({
          url: resolved.page.url(),
          title: await resolved.page.title().catch(() => ''),
          text: snapshot.text,
          refs: snapshot.refs,
        }))
        break
      }
      case 'act': {
        const resolved = await resolvePage(browser, input.activePageUrl)
        const locator = resolved.page.locator(`[${REF_ATTRIBUTE}="${input.ref}"]`).first()
        if (await locator.count() === 0) {
          throw new Error(`Ref ${input.ref} is not available. Capture a fresh snapshot first.`)
        }

        switch (input.interaction) {
          case 'click':
            await locator.click()
            break
          case 'type':
            if (typeof input.text !== 'string') {
              throw new Error('Act type requires text')
            }
            await locator.fill(input.text)
            break
          case 'select':
            if (typeof input.option !== 'string') {
              throw new Error('Act select requires option')
            }
            try {
              await locator.selectOption({ label: input.option })
            } catch {
              await locator.selectOption({ value: input.option })
            }
            break
          case 'check':
            await locator.check()
            break
          case 'uncheck':
            await locator.uncheck()
            break
          default:
            throw new Error(`Unsupported act interaction: ${input.interaction}`)
        }

        stdout.write(JSON.stringify({
          url: resolved.page.url(),
          title: await resolved.page.title().catch(() => ''),
        }))
        break
      }
      case 'screenshot': {
        const resolved = await resolvePage(browser, input.activePageUrl)
        await resolved.page.screenshot({ path: input.path, fullPage: true })
        stdout.write(JSON.stringify({
          url: resolved.page.url(),
          title: await resolved.page.title().catch(() => ''),
          path: input.path,
        }))
        break
      }
      case 'click': {
        const resolved = await resolvePage(browser, input.activePageUrl)
        await resolved.page.locator(input.selector).first().click()
        stdout.write(JSON.stringify({
          url: resolved.page.url(),
          title: await resolved.page.title().catch(() => ''),
        }))
        break
      }
      case 'type': {
        const resolved = await resolvePage(browser, input.activePageUrl)
        await resolved.page.locator(input.selector).first().fill(input.text)
        stdout.write(JSON.stringify({
          url: resolved.page.url(),
          title: await resolved.page.title().catch(() => ''),
        }))
        break
      }
      case 'press_key': {
        const resolved = await resolvePage(browser, input.activePageUrl)
        await resolved.page.keyboard.press(input.key)
        stdout.write(JSON.stringify({
          url: resolved.page.url(),
          title: await resolved.page.title().catch(() => ''),
        }))
        break
      }
      case 'close_tab': {
        const target = await resolvePage(browser, input.url || input.activePageUrl, false)
        if (!target) {
          stdout.write(JSON.stringify({ closed: false }))
          break
        }
        await target.page.close()
        const next = await resolvePage(browser, null, false)
        stdout.write(JSON.stringify({
          closed: true,
          url: next?.page.url() ?? null,
          title: next ? await next.page.title().catch(() => '') : null,
        }))
        break
      }
      default:
        throw new Error(`Unsupported browser action: ${input.action}`)
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

main().catch((err) => {
  stderr.write(err instanceof Error ? err.stack || err.message : String(err))
  exit(1)
})
