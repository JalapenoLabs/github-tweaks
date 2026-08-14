// Copyright © 2026 Jalapeno Labs
//
// Reads and writes PNG, so the icon generator and the store banner builder need no image
// dependency. The format is a length, a fourcc, the bytes and a CRC per chunk, wrapped around
// a deflate that node already ships.
//
// Everything here works in 8-bit RGBA. Decoding accepts the greyscale, truecolour and alpha
// combinations at that depth and refuses anything else by name rather than guessing, since a
// silently mangled image is worse than a stopped script. Palette, 16-bit and interlaced files
// are the gaps; nothing that produces a screenshot emits them.

import { deflateSync, inflateSync } from 'node:zlib'

import { crc32 } from './crc32.mjs'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// Colour type to samples per pixel, which is also what the filters step by.
const CHANNELS_BY_COLOR_TYPE = {
  0: 1, // greyscale
  2: 3, // truecolour
  4: 2, // greyscale with alpha
  6: 4 // truecolour with alpha
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, checksum])
}

export function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bits per channel
  header[9] = 6 // truecolour with alpha
  // The remaining three bytes stay zero: deflate, adaptive filtering, no interlacing.

  // Every scanline is prefixed with its filter type. Filtering exists to help the deflate, and
  // the saving is not worth the code here, so every line declares "none".
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG: the signature does not match')
  }

  let width = 0
  let height = 0
  let channels = 0
  const compressed = []

  let at = 8
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at)
    const type = buffer.toString('latin1', at + 4, at + 8)
    const data = buffer.subarray(at + 8, at + 8 + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const bitDepth = data[8]
      const colorType = data[9]

      if (bitDepth !== 8) {
        throw new Error(`Unsupported bit depth ${bitDepth}; this reader only handles 8`)
      }
      if (data[12]) {
        throw new Error('Unsupported interlaced PNG; this reader only handles non-interlaced')
      }

      channels = CHANNELS_BY_COLOR_TYPE[colorType]
      if (!channels) {
        throw new Error(`Unsupported colour type ${colorType}; this reader handles 0, 2, 4 and 6`)
      }
    }
    else if (type === 'IDAT') {
      compressed.push(data)
    }
    else if (type === 'IEND') {
      break
    }

    at += 12 + length
  }

  const samples = unfilter(inflateSync(Buffer.concat(compressed)), width, height, channels)

  return { width, height, rgba: toRgba(samples, width, height, channels) }
}

// Undoes the per-scanline filters. Each byte is reconstructed from its neighbour to the left,
// the one above, and the one above-left, which is why this has to run in order.
function unfilter(raw, width, height, channels) {
  const stride = width * channels
  const out = Buffer.alloc(stride * height)

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = y * (stride + 1) + 1

    for (let x = 0; x < stride; x++) {
      const value = raw[line + x]
      const left = x >= channels ? out[y * stride + x - channels] : 0
      const above = y ? out[(y - 1) * stride + x] : 0
      const aboveLeft = y && x >= channels ? out[(y - 1) * stride + x - channels] : 0

      let reconstructed = value
      if (filter === 1) {
        reconstructed = value + left
      }
      else if (filter === 2) {
        reconstructed = value + above
      }
      else if (filter === 3) {
        reconstructed = value + ((left + above) >> 1)
      }
      else if (filter === 4) {
        reconstructed = value + paeth(left, above, aboveLeft)
      }
      else if (filter !== 0) {
        throw new Error(`Unknown scanline filter ${filter} on row ${y}`)
      }

      out[y * stride + x] = reconstructed & 0xff
    }
  }

  return out
}

// The PNG predictor: of the three neighbours, pick whichever is closest to their linear
// estimate.
function paeth(left, above, aboveLeft) {
  const estimate = left + above - aboveLeft
  const fromLeft = Math.abs(estimate - left)
  const fromAbove = Math.abs(estimate - above)
  const fromAboveLeft = Math.abs(estimate - aboveLeft)

  if (fromLeft <= fromAbove && fromLeft <= fromAboveLeft) {
    return left
  }
  if (fromAbove <= fromAboveLeft) {
    return above
  }

  return aboveLeft
}

function toRgba(samples, width, height, channels) {
  if (channels === 4) {
    return samples
  }

  const rgba = Buffer.alloc(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel++) {
    const from = pixel * channels
    const to = pixel * 4

    if (channels === 1 || channels === 2) {
      rgba[to] = samples[from]
      rgba[to + 1] = samples[from]
      rgba[to + 2] = samples[from]
      rgba[to + 3] = channels === 2 ? samples[from + 1] : 255
      continue
    }

    rgba[to] = samples[from]
    rgba[to + 1] = samples[from + 1]
    rgba[to + 2] = samples[from + 2]
    rgba[to + 3] = 255
  }

  return rgba
}
