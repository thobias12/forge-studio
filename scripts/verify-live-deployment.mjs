import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import {
  resolve,
} from 'node:path'

const root = process.cwd()
const liveUrl =
  (
    process.env.FORGE_LIVE_URL ??
    'https://thobias12.github.io/forge-studio/'
  ).trim()
const expectedSha =
  process.env.FORGE_EXPECTED_BUILD?.trim()
const expectedBuild =
  expectedSha?.slice(0, 7)
const outputDir = resolve(
  root,
  process.env.FORGE_LIVE_VERIFY_OUTPUT ??
    'artifacts/deployment-integrity',
)
const browserChannel =
  process.env
    .FORGE_LIVE_BROWSER_CHANNEL
    ?.trim()
const deadlineMs = Number(
  process.env.FORGE_LIVE_VERIFY_TIMEOUT_MS ??
    120_000,
)

if (!expectedBuild) {
  console.error(
    'FORGE_EXPECTED_BUILD is required for live deployment verification.',
  )
  process.exit(2)
}

let chromium
try {
  ;({ chromium } =
    await import('playwright'))
} catch {
  console.error(
    'Playwright is required for live deployment verification.',
  )
  process.exit(2)
}

await mkdir(outputDir, {
  recursive: true,
})

let browser

try {
  const launchOptions = {
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  }

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
        width: 1440,
        height: 1000,
      },
      deviceScaleFactor: 1,
    })

  const pageErrors = []
  page.on(
    'pageerror',
    (error) => {
      pageErrors.push(error.message)
      console.error(
        `[live:error] ${error.message}`,
      )
    },
  )

  const rootResult =
    await waitForExpectedBuild({
      page,
      baseUrl: liveUrl,
      expectedBuild,
      timeoutMs: deadlineMs,
    })

  console.log(
    [
      'Live Forge deployment matched expected build.',
      `URL: ${rootResult.url}`,
      `Build tag: ${rootResult.buildTag}`,
    ].join('\n'),
  )

  const dungeonUrl =
    withQuery(
      liveUrl,
      {
        dungeonQa: '1',
        verifyBuild: expectedBuild,
      },
    )

  await page.goto(
    dungeonUrl,
    {
      waitUntil: 'networkidle',
      timeout: 60_000,
    },
  )

  await page.waitForFunction(
    (build) => {
      const qa =
        window.__FORGE_DUNGEON_QA__
      return (
        window.__FORGE_DUNGEON_QA_READY__ === true &&
        qa?.forgeBuild === build
      )
    },
    expectedBuild,
    {
      timeout: 90_000,
    },
  )

  const dungeonQa =
    await page.evaluate(() =>
      window.__FORGE_DUNGEON_QA__,
    )

  if (!dungeonQa) {
    throw new Error(
      'Live Dungeon QA metadata was not published.',
    )
  }
  if (
    dungeonQa.forgeBuild !==
    expectedBuild
  ) {
    throw new Error(
      `Live Dungeon QA build mismatch: expected ${expectedBuild}, received ${dungeonQa.forgeBuild}`,
    )
  }
  if (
    dungeonQa.errors?.length
  ) {
    throw new Error(
      `Live Dungeon QA reported errors: ${dungeonQa.errors.join(' | ')}`,
    )
  }
  if (
    dungeonQa.views?.length !== 6
  ) {
    throw new Error(
      `Live Dungeon QA expected 6 canonical views, received ${dungeonQa.views?.length ?? 0}`,
    )
  }
  if (
    !dungeonQa.renderSummary ||
    dungeonQa.renderSummary.maxDrawCalls <= 0
  ) {
    throw new Error(
      'Live Dungeon QA did not publish renderer-health metrics.',
    )
  }
  if (pageErrors.length) {
    throw new Error(
      `Live deployment produced browser errors: ${pageErrors.join(' | ')}`,
    )
  }

  const result = {
    format:
      'forge-live-deployment-verification',
    version: 1,
    capturedAt:
      new Date().toISOString(),
    liveUrl:
      rootResult.url,
    expectedSha,
    expectedBuild,
    observedBuildTag:
      rootResult.buildTag,
    forgeVersion:
      dungeonQa.forgeVersion,
    dungeonQa: {
      format:
        dungeonQa.format,
      version:
        dungeonQa.version,
      dungeonName:
        dungeonQa.dungeonName,
      dungeonTheme:
        dungeonQa.dungeonTheme,
      seed:
        dungeonQa.seed,
      views:
        dungeonQa.views,
      renderSummary:
        dungeonQa.renderSummary,
    },
  }

  await writeFile(
    resolve(
      outputDir,
      'verification.json',
    ),
    `${JSON.stringify(
      result,
      null,
      2,
    )}\n`,
  )

  const summary = [
    '# Live Deployment Integrity',
    '',
    `- Status: **PASS**`,
    `- Expected build: **${expectedBuild}**`,
    `- Observed build tag: **${rootResult.buildTag}**`,
    `- Forge version: **v${dungeonQa.forgeVersion}**`,
    `- Live URL: ${rootResult.url}`,
    `- Dungeon QA views: **${dungeonQa.views.length}/6**`,
    `- Live QA max draw calls: **${dungeonQa.renderSummary.maxDrawCalls}**`,
    `- Live QA max triangles: **${dungeonQa.renderSummary.maxTriangles}**`,
    '',
  ].join('\n')

  await writeFile(
    resolve(
      outputDir,
      'summary.md',
    ),
    summary,
  )

  console.log(
    [
      'Live deployment integrity verification passed.',
      `Expected: ${expectedBuild}`,
      `Dungeon QA: ${dungeonQa.views.join(', ')}`,
    ].join('\n'),
  )
} finally {
  await browser?.close()
}

async function waitForExpectedBuild({
  page,
  baseUrl,
  expectedBuild,
  timeoutMs,
}) {
  const deadline =
    Date.now() + timeoutMs
  let lastTag = ''
  let lastError

  while (
    Date.now() < deadline
  ) {
    const url =
      withQuery(
        baseUrl,
        {
          verifyBuild:
            `${expectedBuild}-${Date.now()}`,
        },
      )

    try {
      await page.goto(
        url,
        {
          waitUntil: 'networkidle',
          timeout: 40_000,
        },
      )
      await page.waitForSelector(
        '.build-tag',
        {
          timeout: 15_000,
        },
      )
      lastTag =
        (
          await page.locator(
            '.build-tag',
          ).textContent()
        )?.trim() ?? ''

      if (
        lastTag.includes(
          expectedBuild,
        )
      ) {
        return {
          url:
            page.url(),
          buildTag:
            lastTag,
        }
      }
    } catch (cause) {
      lastError = cause
    }

    console.log(
      `Live Pages has not exposed build ${expectedBuild} yet (observed: ${lastTag || 'unavailable'}); retrying…`,
    )
    await delay(2_000)
  }

  const detail =
    lastError instanceof Error
      ? ` Last browser error: ${lastError.message}`
      : ''

  throw new Error(
    `Timed out waiting for live Pages to expose build ${expectedBuild}. Last build tag: ${lastTag || 'unavailable'}.${detail}`,
  )
}

function withQuery(
  value,
  entries,
) {
  const url = new URL(value)
  Object.entries(entries)
    .forEach(
      ([key, entry]) =>
        url.searchParams.set(
          key,
          entry,
        ),
    )
  return url.toString()
}

function delay(
  milliseconds,
) {
  return new Promise(
    (resolvePromise) =>
      setTimeout(
        resolvePromise,
        milliseconds,
      ),
  )
}
