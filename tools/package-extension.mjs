// Copyright © 2026 Jalapeno Labs
//
// Zips `dist/` into the archive the Chrome Web Store dashboard accepts for upload.
//
// ZIP is written directly rather than through a dependency, for the same reason as the PNG
// encoder next door: the format is a header, a deflate that node already ships, and a table of
// contents at the end. A build tool that pulls a tree of packages to do that is a worse trade.
//
// Entries carry a fixed timestamp so the same `dist/` always produces a byte-identical
// archive. That makes it obvious whether a re-upload actually changed anything.
//
//   node tools/package-extension.mjs

import { deflateRawSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'

import { crc32 } from './crc32.mjs'

const SOURCE_DIR = 'dist'

// 1980-01-01 00:00:00, the earliest a DOS timestamp can express, used for every entry so the
// archive is reproducible.
const DOS_TIME = 0
const DOS_DATE = 0x0021

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'))
const outputPath = `${name}-${version}.zip`

function collectFiles(directory, prefix = '') {
  const collected = []

  for (const entry of readdirSync(directory).sort()) {
    const path = `${directory}/${entry}`
    const name = prefix ? `${prefix}/${entry}` : entry

    if (statSync(path).isDirectory()) {
      collected.push(...collectFiles(path, name))
      continue
    }

    collected.push({ name, contents: readFileSync(path) })
  }

  return collected
}

const files = collectFiles(SOURCE_DIR)
if (!files.length) {
  console.error(`No files in ./${SOURCE_DIR}. Run \`npm run build\` first.`)
  process.exit(1)
}

const localParts = []
const centralParts = []
let offset = 0

for (const file of files) {
  const name = Buffer.from(file.name, 'utf8')
  const compressed = deflateRawSync(file.contents, { level: 9 })
  const checksum = crc32(file.contents)

  const localHeader = Buffer.alloc(30)
  localHeader.writeUInt32LE(0x04034b50, 0)
  localHeader.writeUInt16LE(20, 4) // version needed
  localHeader.writeUInt16LE(0, 6) // flags
  localHeader.writeUInt16LE(8, 8) // deflate
  localHeader.writeUInt16LE(DOS_TIME, 10)
  localHeader.writeUInt16LE(DOS_DATE, 12)
  localHeader.writeUInt32LE(checksum, 14)
  localHeader.writeUInt32LE(compressed.length, 18)
  localHeader.writeUInt32LE(file.contents.length, 22)
  localHeader.writeUInt16LE(name.length, 26)
  localHeader.writeUInt16LE(0, 28) // extra field length

  localParts.push(localHeader, name, compressed)

  const centralHeader = Buffer.alloc(46)
  centralHeader.writeUInt32LE(0x02014b50, 0)
  centralHeader.writeUInt16LE(20, 4) // version made by
  centralHeader.writeUInt16LE(20, 6) // version needed
  centralHeader.writeUInt16LE(0, 8) // flags
  centralHeader.writeUInt16LE(8, 10) // deflate
  centralHeader.writeUInt16LE(DOS_TIME, 12)
  centralHeader.writeUInt16LE(DOS_DATE, 14)
  centralHeader.writeUInt32LE(checksum, 16)
  centralHeader.writeUInt32LE(compressed.length, 20)
  centralHeader.writeUInt32LE(file.contents.length, 24)
  centralHeader.writeUInt16LE(name.length, 28)
  // Extra, comment, disk number, and both attribute fields all stay zero.
  centralHeader.writeUInt32LE(offset, 42)

  centralParts.push(centralHeader, name)
  offset += localHeader.length + name.length + compressed.length
}

const central = Buffer.concat(centralParts)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(central.length, 12)
end.writeUInt32LE(offset, 16)

const archive = Buffer.concat([...localParts, central, end])
writeFileSync(outputPath, archive)

console.log(`${outputPath} (${files.length} files, ${(archive.length / 1024).toFixed(1)} kB)`)
for (const file of files) {
  console.log(`   ${file.name}`)
}
