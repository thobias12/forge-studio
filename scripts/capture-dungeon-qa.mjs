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

const renderBudgets = {
  maxDrawCalls: 850,
  maxTriangles: 115_000,
  maxGeometries: 500,
  maxTextures: 24,
  maxLights: 32,
  maxShadowLights: 2,
  maxAverageRenderMs: 45,
  maxP95RenderMs: 90,
  warningAverageRenderMs: 22,
  warningP95RenderMs: 40,
}

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

  const budgetEvaluation =
    evaluateRenderBudgets(
      metadata.renderSummary,
    )

  const performanceReport = {
    format:
      'forge-dungeon-render-health',
    version: 2,
    forgeVersion:
      metadata.forgeVersion,
    forgeBuild:
      metadata.forgeBuild,
    capturedAt:
      manifest.capturedAt,
    dungeonName:
      metadata.dungeonName,
    dungeonTheme:
      metadata.dungeonTheme,
    seed:
      metadata.seed,
    budgets:
      renderBudgets,
    budgetEvaluation,
    summary:
      metadata.renderSummary,
    views:
      metadata.renderMetrics,
    visual:
      metadata.visualMetrics ?? {},
  }

  await writeFile(
    resolve(
      outputDir,
      'performance.json',
    ),
    `${JSON.stringify(
      performanceReport,
      null,
      2,
    )}\n`,
  )

  const performanceMarkdown =
    renderPerformanceMarkdown(
      performanceReport,
    )

  await writeFile(
    resolve(
      outputDir,
      'performance.md',
    ),
    performanceMarkdown,
  )

  console.log(
    [
      'Dungeon Visual QA capture complete.',
      `Contact sheet: ${contactSheet}`,
      `Views: ${viewIds.join(', ')}`,
      '',
      'Dungeon renderer health:',
      JSON.stringify(
        performanceReport.summary,
      ),
      '',
      renderPerformanceConsole(
        performanceReport,
      ),
      '',
      `Budget status: ${budgetEvaluation.status.toUpperCase()}`,
      ...budgetEvaluation.warnings.map(
        (warning) => `WARNING: ${warning}`,
      ),
      ...budgetEvaluation.failures.map(
        (failure) => `FAIL: ${failure}`,
      ),
    ].join('\n'),
  )

  if (budgetEvaluation.failures.length) {
    throw new Error(
      `Dungeon renderer health budget failed: ${budgetEvaluation.failures.join(' | ')}`,
    )
  }
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

function renderPerformanceMarkdown(
  report,
) {
  const rows =
    Object.entries(report.views)
      .map(([id, metrics]) => {
        const visual =
          report.visual[id] ?? {}
        return [
          `| ${id}`,
          metrics.drawCalls,
          formatNumber(metrics.triangles),
          metrics.lights,
          metrics.geometries,
          metrics.textures,
          metrics.renderMs.average.toFixed(1),
          metrics.renderMs.p95.toFixed(1),
          formatDecimal(visual.averageLuminance),
          formatDecimal(visual.contrastRange),
          formatPercent(visual.darkPixelRatio),
          formatPercent(visual.warmPixelRatio),
          formatPercent(visual.cyanPixelRatio),
          '|',
        ].join(' | ')
      })
      .join('\n')

  return [
    '# Dungeon Renderer Health',
    '',
    `Forge v${report.forgeVersion} · ${report.forgeBuild}`,
    `Dungeon: ${report.dungeonName} · ${report.dungeonTheme}`,
    `Budget status: **${report.budgetEvaluation.status.toUpperCase()}**`,
    '',
    '| View | Calls | Triangles | Lights | Geo | Tex | Avg ms | P95 ms | Luma | Contrast | Dark | Warm | Cyan |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    rows,
    '',
    '## Peak renderer summary',
    '',
    `- Max draw calls: **${report.summary.maxDrawCalls}** / ${report.budgets.maxDrawCalls}`,
    `- Max triangles: **${formatNumber(report.summary.maxTriangles)}** / ${formatNumber(report.budgets.maxTriangles)}`,
    `- Max geometries: **${report.summary.maxGeometries}** / ${report.budgets.maxGeometries}`,
    `- Max textures: **${report.summary.maxTextures}** / ${report.budgets.maxTextures}`,
    `- Max lights: **${report.summary.maxLights}** / ${report.budgets.maxLights}`,
    `- Max shadow lights: **${report.summary.maxShadowLights}** / ${report.budgets.maxShadowLights}`,
    `- Slowest average render: **${report.summary.slowestAverageRenderMs.toFixed(1)} ms** / hard ${report.budgets.maxAverageRenderMs} ms`,
    `- Slowest p95 render: **${report.summary.slowestP95RenderMs.toFixed(1)} ms** / hard ${report.budgets.maxP95RenderMs} ms`,
    '',
    ...(report.budgetEvaluation.warnings.length
      ? [
          '## Warnings',
          '',
          ...report.budgetEvaluation.warnings.map(
            (warning) => `- ${warning}`,
          ),
          '',
        ]
      : []),
    ...(report.budgetEvaluation.failures.length
      ? [
          '## Failures',
          '',
          ...report.budgetEvaluation.failures.map(
            (failure) => `- ${failure}`,
          ),
          '',
        ]
      : []),
    '> Render timings come from CI/headless WebGL and are intended for same-run/release regression tracking, not as a direct estimate of player FPS. Visual-health metrics are informational until an artistic baseline is explicitly approved.',
    '',
  ].join('\n')
}

function renderPerformanceConsole(
  report,
) {
  return Object.entries(report.views)
    .map(([id, metrics]) =>
      [
        id.padEnd(11),
        `calls=${String(metrics.drawCalls).padStart(4)}`,
        `tris=${String(metrics.triangles).padStart(8)}`,
        `lights=${String(metrics.lights).padStart(3)}`,
        `geo=${String(metrics.geometries).padStart(3)}`,
        `tex=${String(metrics.textures).padStart(3)}`,
        `avg=${metrics.renderMs.average.toFixed(1).padStart(6)}ms`,
        `p95=${metrics.renderMs.p95.toFixed(1).padStart(6)}ms`,
        `lum=${formatDecimal(report.visual[id]?.averageLuminance)}`,
        `ctr=${formatDecimal(report.visual[id]?.contrastRange)}`,
      ].join('  '),
    )
    .join('\n')
}

function evaluateRenderBudgets(
  summary,
) {
  const failures = []
  const warnings = []

  const hardChecks = [
    ['draw calls', summary.maxDrawCalls, renderBudgets.maxDrawCalls],
    ['triangles', summary.maxTriangles, renderBudgets.maxTriangles],
    ['geometries', summary.maxGeometries, renderBudgets.maxGeometries],
    ['textures', summary.maxTextures, renderBudgets.maxTextures],
    ['lights', summary.maxLights, renderBudgets.maxLights],
    ['shadow lights', summary.maxShadowLights, renderBudgets.maxShadowLights],
    ['average render ms', summary.slowestAverageRenderMs, renderBudgets.maxAverageRenderMs],
    ['p95 render ms', summary.slowestP95RenderMs, renderBudgets.maxP95RenderMs],
  ]

  for (const [label, actual, limit] of hardChecks) {
    if (actual > limit) {
      failures.push(
        `${label} ${actual} exceeded budget ${limit}`,
      )
    }
  }

  if (
    summary.slowestAverageRenderMs >
    renderBudgets.warningAverageRenderMs
  ) {
    warnings.push(
      `slowest average render ${summary.slowestAverageRenderMs} ms is above warning threshold ${renderBudgets.warningAverageRenderMs} ms`,
    )
  }
  if (
    summary.slowestP95RenderMs >
    renderBudgets.warningP95RenderMs
  ) {
    warnings.push(
      `slowest p95 render ${summary.slowestP95RenderMs} ms is above warning threshold ${renderBudgets.warningP95RenderMs} ms`,
    )
  }

  return {
    status:
      failures.length
        ? 'fail'
        : warnings.length
          ? 'warn'
          : 'pass',
    failures,
    warnings,
  }
}

function formatNumber(
  value,
) {
  return new Intl.NumberFormat(
    'en-US',
  ).format(value)
}

function formatDecimal(
  value,
) {
  return Number.isFinite(value)
    ? Number(value).toFixed(3)
    : '—'
}

function formatPercent(
  value,
) {
  return Number.isFinite(value)
    ? `${(Number(value) * 100).toFixed(1)}%`
    : '—'
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
