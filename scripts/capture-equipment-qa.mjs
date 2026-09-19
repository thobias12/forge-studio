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
await mkdir(outputDir, {
  recursive: true,
})

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

await mkdir(qaModelDir, {
  recursive: true,
})
await copyFile(
  resolve(modelPath),
  qaModelPath,
)

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

  browser =
    await chromium.launch({
      headless: true,
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-angle=swiftshader',
      ],
    })

  const page =
    await browser.newPage({
      viewport: {
        width: 1800,
        height: 1300,
      },
      deviceScaleFactor: 1,
    })

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

  const url =
    `${baseUrl}/?equipmentQa=1&body=${bodyType}&model=./qa-foundation/${qaModelName}`

  console.log(
    `Opening ${url}`,
  )

  await page.goto(url, {
    waitUntil:
      'networkidle',
    timeout: 60_000,
  })

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

  for (const viewId of viewIds) {
    const card =
      page.locator(
        `[data-qa-view="${viewId}"]`,
      )
    await card.screenshot({
      path: resolve(
        outputDir,
        `${viewId}.png`,
      ),
    })
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
    preview.kill(
      process.platform === 'win32'
        ? undefined
        : 'SIGTERM',
    )
  }
  await rm(qaModelPath, {
    force: true,
  })
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
