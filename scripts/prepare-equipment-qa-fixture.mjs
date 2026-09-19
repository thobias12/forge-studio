import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  gunzipSync,
} from 'node:zlib'
import {
  dirname,
  resolve,
} from 'node:path'

const root = process.cwd()
const source = resolve(
  root,
  'scripts/qa-fixtures/skillbound-female-base-v1.qa.glb.gz.b64',
)
const output = resolve(
  root,
  process.env.FORGE_QA_FIXTURE_OUTPUT ??
    'artifacts/qa-foundation/Skillbound-Female-Base-v1.qa.glb',
)

const encoded =
  (await readFile(source, 'utf8')).trim()
const compressed =
  Buffer.from(encoded, 'base64')
const glb =
  gunzipSync(compressed)

if (
  glb.length < 400_000 ||
  glb.subarray(0, 4).toString('ascii') !==
    'glTF'
) {
  throw new Error(
    `Invalid Equipment QA GLB fixture: ${glb.length} bytes`,
  )
}

await mkdir(dirname(output), {
  recursive: true,
})
await writeFile(output, glb)

console.log(
  `Prepared Skillbound female Equipment QA fixture: ${output} (${glb.length} bytes)`,
)
