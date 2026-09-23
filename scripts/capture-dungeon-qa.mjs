import {
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import {
  existsSync,
} from 'node:fs'
import {
  spawn,
} from 'node:child_process'
import {
  resolve,
} from 'node:path'

const root = process.cwd()
const outputDir = resolve(
  root,
  process.env.FORGE_DUNGEON_QA_OUTPUT ??
    'artifacts/dungeon-qa',
)
const port = Number(
  process.env.FORGE_DUNGEON_QA_PORT ??
    4174,
)
const baseUrl =
  `http://127.0.0.1:${port}`

let chromium
try {
  ;({ chromium } =
    await import('playwright'))
} catch {
  console.error(
    [
      'Playwright is required for Dungeon Visual QA.',
      'Install it without changing the project lockfile:',
      '  npm install --no-save playwright',
      '  npx playwright install chromium',
    ].join('\n'),
  )
  process.exit(2)
}

await rm(outputDir, {
  recursive: true,
  force: true,
})

const skipBuild =
  process.env.FORGE_DUNGEON_QA_SKIP_BUILD ===
  '1'

if (!skipBuild) {
  console.log(
    'Building Forge Studio for Dungeon Visual QA…',
  )
  await run(
    npmCommand(),
    ['run', 'build'],
    {
      ...process.env,
      VITE_FORGE_BUILD:
        process.env.VITE_FORGE_BUILD ??
        'dungeon-qa-local',
    },
  )
} else {
  console.log(
    'Reusing existing dist build for Dungeon Visual QA…',
  )
  if (
    !existsSync(
      resolve(root, 'dist/index.html'),
    )
  ) {
    throw new Error(
      'FORGE_DUNGEON_QA_SKIP_BUILD=1 but dist/index.html does not exist.',
    )
  }
}

await mkdir(outputDir, {
  recursive: true,
})

let preview
let browser

try {
  preview = spawn(
    npmCommand(),
    [
      'run',
      'preview',
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: root,
      env: process.env,
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
      windowsHide: true,
      detached:
        process.platform !== 'win32',
    },
  )

  preview.stdout?.on(
    'data',
    (chunk) =>
      process.stdout.write(chunk),
  )
  preview.stderr?.on(
    'data',
    (chunk) =>
      process.stderr.write(chunk),
  )

  await waitForServer(baseUrl)

  const headless =
    process.env.FORGE_DUNGEON_QA_HEADLESS !==
    '0'

  const launchOptions = {
    headless,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  }
  const browserChannel =
    process.env
      .FORGE_DUNGEON_QA_BROWSER_CHANNEL
      ?.trim()

  if (browserChannel) {
    try {
      browser =
        await chromium.launch({
          ...launchOptions,
          channel:
            browserChannel,
        })
    } catch (cause) {
      console.warn(
        'Could not launch Playwright channel "' +
          browserChannel +
          '", falling back to bundled Chromium: ' +
          (
            cause instanceof Error
              ? cause.message
              : String(cause)
          ),
      )
      browser =
        await chromium.launch(
          launchOptions,
        )
    }
  } else {
    browser =
      await chromium.launch(
        launchOptions,
      )
  }

  const page =
    await browser.newPage({
      viewport: {
        width: 1920,
        height: 1400,
      },
      deviceScaleFactor: 1,
    })

  const browserErrors = []

  page.on(
    'console',
    (message) => {
      console.log(
        `[browser:${message.type()}] ${message.text()}`,
      )
    },
  )
  page.on(
    'pageerror',
    (error) => {
      browserErrors.push(
        error.message,
      )
      console.error(
        `[browser:error] ${error.message}`,
      )
    },
  )

  const url =
    `${baseUrl}/?dungeonQa=1`

  console.log(
    `Opening ${url}`,
  )
  await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  })

  console.log(
    'Waiting for Dungeon Visual QA renderer…',
  )
  await page.waitForFunction(
    () =>
      window
        .__FORGE_DUNGEON_QA_READY__ ===
      true,
    undefined,
    {
      timeout: 90_000,
    },
  )

  const metadata =
    await page.evaluate(
      () =>
        window
          .__FORGE_DUNGEON_QA__,
    )

  if (
    metadata?.errors?.length
  ) {
    throw new Error(
      `Dungeon Visual QA reported errors: ${metadata.errors.join(' | ')}`,
    )
  }

  if (
    browserErrors.length
  ) {
    throw new Error(
      `Dungeon Visual QA browser errors: ${browserErrors.join(' | ')}`,
    )
  }

  const viewIds =
    metadata?.views ?? []

  if (!viewIds.length) {
    throw new Error(
      'Dungeon Visual QA produced no views.',
    )
  }

  const contactSheet = resolve(
    outputDir,
    'dungeon-visual-qa.png',
  )
  await page.screenshot({
    path: contactSheet,
    fullPage: true,
  })

  const renderedShots =
    await page.evaluate(() =>
      Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            '[data-dungeon-qa-view]',
          ),
        ).flatMap((card) => {
          const viewId =
            card.getAttribute(
              'data-dungeon-qa-view',
            )
          const image =
            card.querySelector('img')
          if (
            !viewId ||
            !image?.src?.startsWith(
              'data:image/png;base64,',
            )
          ) {
            return []
          }
          return [
            [
              viewId,
              image.src,
            ],
          ]
        }),
      ),
    )

  for (const viewId of viewIds) {
    const dataUrl =
      renderedShots[viewId]
    if (!dataUrl) {
      throw new Error(
        `Missing rendered Dungeon QA PNG for ${viewId}`,
      )
    }
    const base64 =
      dataUrl.slice(
        dataUrl.indexOf(',') + 1,
      )
    await writeFile(
      resolve(
        outputDir,
        `${viewId}.png`,
      ),
      Buffer.from(
        base64,
        'base64',
      ),
    )
  }

  const manifest = {
    ...metadata,
    capturedAt:
      new Date().toISOString(),
    contactSheet:
      'dungeon-visual-qa.png',
  }

  await writeFile(
    resolve(
      outputDir,
      'manifest.json',
    ),
    `${JSON.stringify(
      manifest,
      null,
      2,
    )}\n`,
  )

  console.log(
    [
      'Dungeon Visual QA capture complete.',
      `Contact sheet: ${contactSheet}`,
      `Views: ${viewIds.join(', ')}`,
    ].join('\n'),
  )
} finally {
  await browser?.close()
  if (
    preview &&
    preview.exitCode === null
  ) {
    if (
      process.platform === 'win32'
    ) {
      preview.kill()
    } else {
      try {
        process.kill(
          -preview.pid,
          'SIGTERM',
        )
      } catch {
        preview.kill('SIGTERM')
      }
    }
  }
}

function npmCommand() {
  return process.platform ===
    'win32'
    ? 'npm.cmd'
    : 'npm'
}

async function run(
  command,
  args,
  env,
) {
  await new Promise(
    (resolvePromise, reject) => {
      const child =
        spawn(command, args, {
          cwd: root,
          env,
          stdio: 'inherit',
          windowsHide: true,
        })

      child.on(
        'error',
        reject,
      )
      child.on(
        'exit',
        (code) => {
          if (code === 0) {
            resolvePromise()
            return
          }
          reject(
            new Error(
              `${command} ${args.join(' ')} exited with code ${code}`,
            ),
          )
        },
      )
    },
  )
}

async function waitForServer(
  url,
) {
  const deadline =
    Date.now() + 30_000

  while (
    Date.now() < deadline
  ) {
    try {
      const response =
        await fetch(url)
      if (response.ok) return
    } catch {
      // Preview is still starting.
    }
    await new Promise(
      (resolvePromise) =>
        setTimeout(
          resolvePromise,
          250,
        ),
    )
  }

  throw new Error(
    `Timed out waiting for Forge preview at ${url}`,
  )
}
