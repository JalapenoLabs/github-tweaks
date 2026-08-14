// Copyright © 2026 Jalapeno Labs
//
// Fits each screenshot onto the 1280x800 canvas the Chrome Web Store requires, writing the
// results to `screenshots/banners/` and leaving the originals untouched.
//
// Two rules keep the output sharp. Nothing is ever stretched: the aspect ratio is preserved and
// the remainder is padded. And nothing is ever resampled up by a fraction, because a screenshot
// enlarged by 2.77x is a blurred screenshot. An image smaller than half the canvas is doubled
// or tripled by nearest neighbour instead, which keeps every pixel edge crisp, and an image too
// large is reduced by an area average, which is the right filter for going down.
//
// The padding takes its colour from the source's own top-left pixel, so a screenshot of a dark
// GitHub page lands on a dark canvas instead of in a white box.
//
//   node tools/prepare-banners.mjs

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

import { decodePng, encodePng } from './png.mjs'

const SOURCE_DIR = 'screenshots'
const OUT_DIR = 'screenshots/banners'

// The Chrome Web Store accepts 1280x800 or 640x400. The larger reads better on the listing.
const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 800

// Below this fraction of the canvas, an image is a detail shot and gains more from being
// enlarged to fill the frame than it loses to nearest-neighbour blockiness.
const ENLARGE_BELOW = 0.5

function scaleToFit(image) {
  const fit = Math.min(CANVAS_WIDTH / image.width, CANVAS_HEIGHT / image.height)

  if (fit < 1) {
    return { width: Math.round(image.width * fit), height: Math.round(image.height * fit) }
  }

  if (fit >= 1 / ENLARGE_BELOW) {
    const factor = Math.floor(fit)
    return { width: image.width * factor, height: image.height * factor }
  }

  // Between the two: already a reasonable size, so leave every pixel exactly where it is.
  return { width: image.width, height: image.height }
}

// Area average. Each destination pixel takes the mean of the source pixels it covers, weighted
// by alpha so a transparent edge does not drag colour into its neighbours.
function reduce(image, width, height) {
  const out = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y++) {
    const fromY = Math.floor((y * image.height) / height)
    const toY = Math.max(fromY + 1, Math.floor(((y + 1) * image.height) / height))

    for (let x = 0; x < width; x++) {
      const fromX = Math.floor((x * image.width) / width)
      const toX = Math.max(fromX + 1, Math.floor(((x + 1) * image.width) / width))

      let red = 0
      let green = 0
      let blue = 0
      let alphaSum = 0
      let sampled = 0

      for (let sourceY = fromY; sourceY < toY; sourceY++) {
        for (let sourceX = fromX; sourceX < toX; sourceX++) {
          const at = (sourceY * image.width + sourceX) * 4
          const alpha = image.rgba[at + 3] / 255

          red += image.rgba[at] * alpha
          green += image.rgba[at + 1] * alpha
          blue += image.rgba[at + 2] * alpha
          alphaSum += alpha
          sampled++
        }
      }

      const at = (y * width + x) * 4
      out[at + 3] = Math.round((alphaSum / sampled) * 255)

      if (alphaSum) {
        out[at] = Math.round(red / alphaSum)
        out[at + 1] = Math.round(green / alphaSum)
        out[at + 2] = Math.round(blue / alphaSum)
      }
    }
  }

  return out
}

// Nearest neighbour, used only for whole-number enlargement, where it copies each pixel into a
// clean block rather than smearing it across a gradient.
function enlarge(image, factor) {
  const width = image.width * factor
  const height = image.height * factor
  const out = Buffer.alloc(width * height * 4)

  for (let y = 0; y < height; y++) {
    const sourceRow = Math.floor(y / factor) * image.width
    for (let x = 0; x < width; x++) {
      const from = (sourceRow + Math.floor(x / factor)) * 4
      image.rgba.copy(out, (y * width + x) * 4, from, from + 4)
    }
  }

  return out
}

mkdirSync(OUT_DIR, { recursive: true })

const sources = readdirSync(SOURCE_DIR).filter((name) => name.endsWith('.png')).sort()
if (!sources.length) {
  console.error(`No PNGs in ./${SOURCE_DIR}`)
  process.exit(1)
}

for (const name of sources) {
  const image = decodePng(readFileSync(`${SOURCE_DIR}/${name}`))
  const target = scaleToFit(image)

  let scaled = image.rgba
  let note = 'unchanged'
  if (target.width < image.width) {
    scaled = reduce(image, target.width, target.height)
    note = `reduced to ${(target.width / image.width * 100).toFixed(0)}%`
  }
  else if (target.width > image.width) {
    scaled = enlarge(image, target.width / image.width)
    note = `enlarged ${target.width / image.width}x`
  }

  // Pad with the source's own background so the seam does not show.
  const canvas = Buffer.alloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4)
  for (let pixel = 0; pixel < CANVAS_WIDTH * CANVAS_HEIGHT; pixel++) {
    image.rgba.copy(canvas, pixel * 4, 0, 4)
  }

  const left = Math.floor((CANVAS_WIDTH - target.width) / 2)
  const top = Math.floor((CANVAS_HEIGHT - target.height) / 2)
  for (let y = 0; y < target.height; y++) {
    const from = y * target.width * 4
    scaled.copy(canvas, ((top + y) * CANVAS_WIDTH + left) * 4, from, from + target.width * 4)
  }

  writeFileSync(`${OUT_DIR}/${name}`, encodePng(CANVAS_WIDTH, CANVAS_HEIGHT, canvas))
  console.log(
    `${name.padEnd(30)} ${image.width}x${image.height} -> ${target.width}x${target.height} `
    + `(${note}), centred on ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`
  )
}
