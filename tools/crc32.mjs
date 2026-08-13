// Copyright © 2026 Jalapeno Labs
//
// CRC-32 (IEEE 802.3), which both of the binary formats we write by hand happen to need: PNG
// stamps one on every chunk, ZIP on every file entry.

const CRC_TABLE = (() => {
  const table = new Int32Array(256)

  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1
    }
    table[index] = value
  }

  return table
})()

export function crc32(buffer) {
  let remainder = -1

  for (const byte of buffer) {
    remainder = CRC_TABLE[(remainder ^ byte) & 0xff] ^ (remainder >>> 8)
  }

  return (remainder ^ -1) >>> 0
}
