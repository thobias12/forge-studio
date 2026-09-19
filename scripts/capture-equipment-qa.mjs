import {
  copyFile,
  mkdir,
  readFile,
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
const modelPath =
  process.env.FORGE_QA_MODEL
const bodyType =
  process.env.FORGE_QA_BODY ===
  'male'
    ? 'male'
    : 'female'
const outputDir = resolve(
  root,
  process.env.FORGE_QA_OUTPUT ??
    'artifacts/equipment-qa',
)
const port =
  Number(
    process.env.FORGE_QA_PORT ??
      4173,
  )
const baseUrl =
  `http://127.0.0.1:${port}`

if (!modelPath) {
  console.error(
    'FORGE_QA_MODEL is required. Point it at Skillbound-Female-Base-v1.glb or Skillbound-Male-Base-v1.glb.',
  )
  process.exit(2)
}

if (!existsSync(modelPath)) {
  console.error(
    `QA foundation model was not found: ${modelPath}`,
  )
  process.exit(2)
}

let chromium
try {
  ;({ chromium } =
    await import('playwright'))
} catch {
  console.error(
    [
      'Playwright is required for Equipment Forge QA.',
      'Install it without changing the project lockfile:',
      '  npm install --no-save playwright',
      '  npx playwright install chromium',
    ].join('\n'),
  )
  process.exit(2)
}

const qaModelDir = resolve(
  root,
  'dist/qa-foundation',
)
const qaModelName =
  '__qa-base.glb'
const qaModelPath = resolve(
  qaModelDir,
  qaModelName,
)

await rm(outputDir, {
  recursive: true,
  force: true,
})

const skipBuild =
  process.env.FORGE_QA_SKIP_BUILD ===
  '1'

if (!skipBuild) {
  console.log(
    'Building Forge Studio for Equipment QA…',
  )
  await run(
    npmCommand(),
    ['run', 'build'],
    {
      ...process.env,
      VITE_FORGE_BUILD:
        process.env.VITE_FORGE_BUILD ??
        'qa-local',
    },
  )
} else {
  console.log(
    'Reusing existing dist build for Equipment QA…',
  )
  if (
    !existsSync(
      resolve(root, 'dist/index.html'),
    )
  ) {
    throw new Error(
      'FORGE_QA_SKIP_BUILD=1 but dist/index.html does not exist.',
    )
  }
}

// Vite clears dist during build, so create QA output only after the build.
await mkdir(outputDir, {
  recursive: true,
})

await mkdir(qaModelDir, {
  recursive: true,
})
const resolvedModelPath =
  resolve(modelPath)

if (
  resolvedModelPath !==
  qaModelPath
) {
  await copyFile(
    resolvedModelPath,
    qaModelPath,
  )
}

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
    process.env.FORGE_QA_HEADLESS !==
    '0'

  console.log(
    `Launching Equipment QA Chromium (headless=${headless})…`,
  )

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
      .FORGE_QA_BROWSER_CHANNEL
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
          (cause instanceof Error
            ? cause.message
            : String(cause)),
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
        width: 1800,
        height: 1300,
      },
      deviceScaleFactor: 1,
    })

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
      console.error(
        `[browser:error] ${error.message}`,
      )
    },
  )

  const recipePath =
    process.env
      .FORGE_QA_RECIPE_JSON

  if (
    recipePath &&
    existsSync(recipePath)
  ) {
    const recipe =
      JSON.parse(
        await readFile(
          recipePath,
          'utf8',
        ),
      )
    await page.addInitScript(
      (override) => {
        window.__FORGE_EQUIPMENT_QA_RECIPE__ =
          override
      },
      recipe,
    )
  }

  const requestedViews =
    process.env.FORGE_QA_VIEWS
      ?.split(',')
      .map((value) =>
        value.trim(),
      )
      .filter(Boolean) ??
    []
  const viewQuery =
    requestedViews.length
      ? `&views=${encodeURIComponent(
          requestedViews.join(','),
        )}`
      : ''

  const url =
    `${baseUrl}/?equipmentQa=1&body=${bodyType}&model=./qa-foundation/${qaModelName}&fit=0${viewQuery}`

  console.log(
    `Opening ${url}`,
  )

  console.log(
    'Navigating to Equipment QA page…',
  )
  await page.goto(url, {
    waitUntil:
      'networkidle',
    timeout: 60_000,
  })

  console.log(
    'Waiting for Equipment QA renderer…',
  )
  await page.waitForFunction(
    () =>
      window
        .__FORGE_EQUIPMENT_QA_READY__ ===
      true,
    undefined,
    {
      timeout: 60_000,
    },
  )

  console.log(
    'Equipment QA renderer is ready.',
  )

  const metadata =
    await page.evaluate(
      () =>
        window
          .__FORGE_EQUIPMENT_QA__,
    )

  if (
    metadata?.errors?.length
  ) {
    throw new Error(
      `Equipment QA render reported errors: ${metadata.errors.join(' | ')}`,
    )
  }

  const contactSheet = resolve(
    outputDir,
    `equipment-v3-${bodyType}-360.png`,
  )

  await page.screenshot({
    path: contactSheet,
    fullPage: true,
  })

  const viewIds =
    metadata?.views ?? []

  const renderedShots =
    await page.evaluate(() =>
      Object.fromEntries(
        Array.from(
          document.querySelectorAll(
            '[data-qa-view]',
          ),
        ).flatMap((card) => {
          const viewId =
            card.getAttribute(
              'data-qa-view',
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
        `Missing rendered QA PNG for ${viewId}`,
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
    format:
      'forge-equipment-qa',
    version: 1,
    capturedAt:
      new Date().toISOString(),
    bodyType,
    contactSheet:
      contactSheet.split(/[\\/]/).at(-1),
    ...metadata,
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
      'Equipment Forge QA capture complete.',
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
        // npm spawns Vite as a child process. Kill the detached process
        // group so the preview server cannot keep CI alive after capture.
        process.kill(
          -preview.pid,
          'SIGTERM',
        )
      } catch {
        preview.kill('SIGTERM')
      }
    }
  }
  if (
    process.env.FORGE_QA_KEEP_MODEL !==
    '1'
  ) {
    await rm(qaModelPath, {
      force: true,
    })
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
