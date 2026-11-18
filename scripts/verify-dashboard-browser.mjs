import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { log } from 'node:console'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { clearTimeout, setTimeout } from 'node:timers'
import { fileURLToPath, URL } from 'node:url'

const { fetch, WebSocket } = globalThis

// Local, explicitly labeled fixture verification only. No provider/device APIs.
const root = fileURLToPath(new URL('../', import.meta.url))
const artifactDirectory = await mkdtemp(path.join(root, '.browser-validation-'))
// mkdtemp cannot append a suffix, so use a nested ignored output directory.
const output = path.join(artifactDirectory, 'artifacts.tmp')
await mkdir(output)
const profile = path.join(output, 'edge-profile')
const processes = []
const failures = []
const checks = []
const exceptions = []
const apiRequests = []
let socket
let evaluateBrowser
let screenshotBrowser

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  await new Promise((resolve) => server.close(resolve))
  return address.port
}

async function until(operation, label, timeout = 45_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const result = await operation()
      if (result) return result
    } catch {
      // Startup/navigation may temporarily reset the connection.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Timed out: ' + label)
}

function record(name, passed, detail) {
  checks.push({ name, passed, detail })
  log(JSON.stringify({ check: name, passed }))
  if (!passed) failures.push(name)
}

try {
  const vitePort = await freePort()
  const browserPort = await freePort()
  const origin = `http://127.0.0.1:${vitePort}`
  const vite = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(vitePort),
      '--strictPort',
    ],
    {
      cwd: root,
      env: { ...process.env, VITE_DATA_MODE: 'mock', VITE_AUTH_MODE: 'development-mock' },
      windowsHide: true,
      stdio: 'ignore',
    },
  )
  processes.push(vite)
  await until(async () => (await fetch(origin)).ok, 'local Vite startup')

  const edge = spawn(
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    [
      '--headless=new',
      '--disable-gpu',
      '--no-proxy-server',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${browserPort}`,
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { cwd: root, windowsHide: true, stdio: 'ignore' },
  )
  processes.push(edge)
  const page = await until(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${browserPort}/json/list`)).json()
    return pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
  }, 'Edge debugging endpoint')

  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      clearTimeout(request.timer)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown')
      exceptions.push(message.params.exceptionDetails.text)
    if (message.method === 'Network.requestWillBeSent') {
      const url = new URL(message.params.request.url)
      if (url.pathname.startsWith('/api/')) apiRequests.push(url.pathname)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(
        () => {
          pending.delete(id)
          reject(new Error('CDP timeout: ' + method))
        },
        method === 'Page.navigate' ? 45_000 : 15_000,
      )
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  const ready = (expression, label) => until(() => evaluate(expression), label)
  const screenshot = async (name) => {
    const capture = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    })
    await writeFile(path.join(output, name + '.png'), Buffer.from(capture.data, 'base64'))
  }
  evaluateBrowser = evaluate
  screenshotBrowser = screenshot
  const layout = async (name) => {
    const measurements = await evaluate(
      `({width:innerWidth, documentWidth:document.documentElement.scrollWidth, h1:document.querySelector('h1')?.textContent, nav:getComputedStyle(document.querySelector('aside')).visibility})`,
    )
    record(name, measurements.documentWidth <= measurements.width + 1, measurements)
  }
  const navigate = async (route, heading) => {
    await send('Page.navigate', { url: origin + route })
    await ready(
      `document.querySelector('h1')?.textContent.includes(${JSON.stringify(heading)})`,
      route,
    )
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await navigate('/overview', 'Overview')
  await ready(`document.body.innerText.includes('FISCALIZATION REQUESTS')`, 'fixture overview')
  record(
    'Overview explicitly labels demo data',
    await evaluate(`document.body.innerText.includes('DEMO')`),
  )
  await layout('Desktop overview has no page horizontal overflow')
  await screenshot('desktop-overview')

  await evaluate(
    `document.querySelector('nav[aria-label="Main navigation"] a[href="/requests"]').click()`,
  )
  await ready(
    `document.querySelector('h1')?.textContent.includes('Fiscalization requests') && document.querySelectorAll('tbody tr').length > 0`,
    'request navigation and fixtures',
  )
  record('Desktop request navigation renders fixture rows', true)
  await layout('Desktop request table scroll stays contained')
  await screenshot('desktop-requests')
  await evaluate(`document.querySelector('tbody tr button').click()`)
  await ready(
    `document.querySelector('[role="dialog"]') && document.body.innerText.includes('demo-invoice-1001')`,
    'request drawer',
  )
  record('Request detail opens from fixture row', true)
  await screenshot('desktop-request-detail')
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await ready(`!document.querySelector('[role="dialog"]')`, 'request drawer escape')
  record('Escape closes request details', true)

  await navigate('/invoices', 'Invoice register')
  await ready(
    `document.body.innerText.includes('Sample documents are not substituted.')`,
    'document demo unavailability',
  )
  record('Invoice register truthfully reports live-data unavailability in demo', true)
  await layout('Desktop invoice register has no page horizontal overflow')
  await screenshot('desktop-invoices-unavailable')
  await navigate('/invoices?id=fixture-invoice-42', 'Invoice detail')
  record(
    'Invoice detail truthfully reports live-data unavailability in demo',
    await evaluate(`document.body.innerText.includes('Sample documents are not substituted.')`),
  )

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await navigate('/overview', 'Overview')
  await ready(
    `document.body.innerText.includes('FISCALIZATION REQUESTS')`,
    'mobile fixture overview',
  )
  await layout('Mobile overview has no page horizontal overflow')
  record(
    'Mobile closed navigation is hidden',
    await evaluate(`getComputedStyle(document.querySelector('aside')).visibility === 'hidden'`),
  )
  await screenshot('mobile-overview')
  await evaluate(`document.querySelector('[aria-label="Open navigation"]').click()`)
  await ready(
    `document.querySelector('[aria-label="Open navigation"]').getAttribute('aria-expanded') === 'true'`,
    'mobile menu open',
  )
  record('Mobile navigation opens with accessible expanded state', true)
  await screenshot('mobile-navigation')
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  })
  await ready(
    `document.querySelector('[aria-label="Open navigation"]').getAttribute('aria-expanded') === 'false'`,
    'mobile menu close',
  )
  record(
    'Mobile Escape returns focus to menu button',
    await evaluate(`document.activeElement?.getAttribute('aria-label') === 'Open navigation'`),
  )
  await evaluate(`document.querySelector('[aria-label="Open navigation"]').click()`)
  await evaluate(
    `document.querySelector('nav[aria-label="Main navigation"] a[href="/requests"]').click()`,
  )
  await ready(
    `document.querySelector('h1')?.textContent.includes('Fiscalization requests') && document.querySelectorAll('tbody tr').length > 0`,
    'mobile request navigation',
  )
  await ready(
    `document.querySelector('[aria-label="Open navigation"]').getAttribute('aria-expanded') === 'false'`,
    'menu closes on navigation',
  )
  record('Mobile request navigation closes menu and renders fixtures', true)
  record(
    'Mobile request scope remains a readable paragraph',
    await evaluate(
      `getComputedStyle(document.querySelector('.request-scope-note')).display === 'block'`,
    ),
  )
  record(
    'Mobile request refresh label remains visible',
    await evaluate(
      `getComputedStyle(document.querySelector('.request-heading button')).fontSize !== '0px'`,
    ),
  )
  await layout('Mobile request table scroll stays contained')
  await screenshot('mobile-requests')
  await navigate('/credit-notes', 'Credit-note register')
  await layout('Mobile credit-note register has no page horizontal overflow')
  await screenshot('mobile-credit-notes-unavailable')
  await navigate('/requests?from=2026-02-30', 'Fiscalization requests')
  await ready(`!!document.querySelector('[role="alert"]')`, 'invalid date alert')
  record(
    'Invalid request date renders actionable error without fixture rows',
    await evaluate(
      `!!document.querySelector('[role="alert"]') && document.querySelectorAll('tbody tr').length === 0`,
    ),
  )
  await screenshot('mobile-invalid-request-date')
  record('No uncaught browser runtime exceptions', exceptions.length === 0, exceptions)
  record('Demo never called an API endpoint', apiRequests.length === 0, apiRequests)
} catch (error) {
  failures.push(error.message)
  if (evaluateBrowser) {
    try {
      const pageState = await evaluateBrowser(
        `({url:location.href,title:document.title,body:document.body?.innerText.slice(0,3000)})`,
      )
      checks.push({ name: 'Failure page diagnostic', passed: false, detail: pageState })
      await screenshotBrowser('failure-page')
    } catch {
      failures.push('Browser did not respond to failure-page diagnostic.')
    }
  }
} finally {
  socket?.close()
  for (const child of processes.reverse()) child.kill()
  const result = { passed: failures.length === 0, checks, failures, artifactDirectory: output }
  await writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2) + '\n')
  // Output contains only fixture check metadata and local artifact paths.
  log(JSON.stringify(result, null, 2))
  if (failures.length) process.exitCode = 1
}
