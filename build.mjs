// Copyright © 2026 Jalapeno Labs
//
// Bundles the TypeScript sources into the `dist/` directory that Chrome loads as an
// unpacked extension, and copies over the static assets (manifest, styles, viewer page).

import { context } from 'esbuild'
import { cp, rm, mkdir } from 'node:fs/promises'

const OUT_DIR = 'dist'
const isWatch = process.argv.includes('--watch')

const staticAssets = [
  ['manifest.json', `${OUT_DIR}/manifest.json`],
  ['src/content/content.css', `${OUT_DIR}/content.css`],
  ['src/viewer/viewer.html', `${OUT_DIR}/viewer.html`]
]

async function copyStaticAssets() {
  await Promise.all(
    staticAssets.map(([source, destination]) => cp(source, destination))
  )
}

// esbuild does not watch the static files, so re-copy them on every rebuild.
const copyAssetsPlugin = {
  name: 'copy-static-assets',
  setup(buildProcess) {
    buildProcess.onEnd(() => copyStaticAssets())
  }
}

await rm(OUT_DIR, { recursive: true, force: true })
await mkdir(OUT_DIR, { recursive: true })

const buildContext = await context({
  entryPoints: {
    content: 'src/content/index.ts',
    viewer: 'src/viewer/index.ts'
  },
  bundle: true,
  // Content scripts and classic extension pages expect plain scripts, not ES modules.
  format: 'iife',
  target: 'chrome120',
  outdir: OUT_DIR,
  sourcemap: isWatch,
  logLevel: 'info',
  plugins: [copyAssetsPlugin]
})

if (isWatch) {
  await buildContext.watch()
  console.log('Watching for changes...')
}
else {
  await buildContext.rebuild()
  await buildContext.dispose()
  console.log(`Built extension into ./${OUT_DIR}`)
}
