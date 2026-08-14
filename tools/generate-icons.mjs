// Copyright © 2026 Jalapeno Labs
//
// Draws the extension's icon at every size the Chrome Web Store asks for.
//
// The mark is described once as maths in a unit square, so each size is rendered rather than
// resampled from a larger one: a 16px icon that was squeezed down from 128px goes to mush,
// while this one is drawn at 16px with its own anti-aliasing. Coverage comes from
// supersampling, which is a few lines against a page of analytic edge cases and is instant at
// these sizes.
//
// PNG writing lives in png.mjs, which the store banner builder shares.
//
//   node tools/generate-icons.mjs

import { mkdirSync, writeFileSync } from 'node:fs'

import { encodePng } from './png.mjs'

const OUT_DIR = 'icons'
const SIZES = [16, 32, 48, 128]

// Samples per axis inside each pixel. Sixteen coverage tests per pixel is plenty for a shape
// this simple, and the whole run is still well under a second.
const SUPERSAMPLE = 4

// A dark plate reads on a light toolbar and a light one, and the green check is the
// extension's own signature: a file marked reviewed.
const PLATE_COLOR = [0x22, 0x27, 0x2e]
const CHECK_COLOR = [0x3f, 0xb9, 0x50]

// All geometry is a fraction of the icon's width, so one description fits every size.
const PLATE_RADIUS = 0.22
const CHECK_HALF_WIDTH = 0.072
const CHECK_ELBOW = [0.42, 0.68]
const CHECK_START = [0.24, 0.51]
const CHECK_END = [0.76, 0.32]

// Signed distance to a rounded square centred in the unit square. Negative inside.
function plateDistance(x, y) {
  const dx = Math.abs(x - 0.5) - (0.5 - PLATE_RADIUS)
  const dy = Math.abs(y - 0.5) - (0.5 - PLATE_RADIUS)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))

  return outside + Math.min(Math.max(dx, dy), 0) - PLATE_RADIUS
}

// Distance to a line segment, which is what gives the checkmark its rounded caps and joint
// for free: a stroke is every point within half a width of the segment.
function segmentDistance(x, y, [ax, ay], [bx, by]) {
  const alongX = bx - ax
  const alongY = by - ay
  const toPointX = x - ax
  const toPointY = y - ay

  const lengthSquared = alongX * alongX + alongY * alongY
  const projection = Math.max(0, Math.min(1, (toPointX * alongX + toPointY * alongY) / lengthSquared))

  return Math.hypot(toPointX - projection * alongX, toPointY - projection * alongY)
}

function checkDistance(x, y) {
  return Math.min(
    segmentDistance(x, y, CHECK_START, CHECK_ELBOW),
    segmentDistance(x, y, CHECK_ELBOW, CHECK_END)
  )
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const samplesPerPixel = SUPERSAMPLE * SUPERSAMPLE

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let red = 0
      let green = 0
      let blue = 0
      let covered = 0

      for (let subY = 0; subY < SUPERSAMPLE; subY++) {
        for (let subX = 0; subX < SUPERSAMPLE; subX++) {
          const sampleX = (x + (subX + 0.5) / SUPERSAMPLE) / size
          const sampleY = (y + (subY + 0.5) / SUPERSAMPLE) / size

          // Everything outside the plate is transparent, so the icon keeps its rounded
          // silhouette instead of sitting in a square of background colour.
          if (plateDistance(sampleX, sampleY) > 0) {
            continue
          }

          const color = checkDistance(sampleX, sampleY) <= CHECK_HALF_WIDTH
            ? CHECK_COLOR
            : PLATE_COLOR

          red += color[0]
          green += color[1]
          blue += color[2]
          covered++
        }
      }

      const index = (y * size + x) * 4
      if (!covered) {
        continue
      }

      // Average the colour over the samples that actually landed on the plate, and let alpha
      // carry how much of the pixel that was. Dividing by the full sample count instead would
      // darken every edge pixel towards black.
      rgba[index] = Math.round(red / covered)
      rgba[index + 1] = Math.round(green / covered)
      rgba[index + 2] = Math.round(blue / covered)
      rgba[index + 3] = Math.round((covered / samplesPerPixel) * 255)
    }
  }

  return rgba
}

mkdirSync(OUT_DIR, { recursive: true })

for (const size of SIZES) {
  const png = encodePng(size, size, renderIcon(size))
  const path = `${OUT_DIR}/icon-${size}.png`

  writeFileSync(path, png)
  console.log(`${path} (${png.length} bytes)`)
}
