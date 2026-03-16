/**
 * Generates minimal valid PNG icon files for the Chrome extension.
 * Uses only Node.js built-ins — no external image packages required.
 *
 * Run: node scripts/gen-icons.mjs
 */
import { deflateSync as createDeflateSync } from 'zlib'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ICONS_DIR = resolve(__dirname, '../icons')

// Build CRC-32 lookup table (required for PNG chunk checksums)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBytes = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([typeBytes, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([len, typeBytes, data, crc])
}

/**
 * Creates a PNG buffer for a solid-colour square icon.
 * @param {number} size - pixel size (square)
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function createSolidPNG(size, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR: width(4) height(4) bitDepth colorType compression filter interlace
  const ihdr = chunk(
    'IHDR',
    Buffer.from([
      0, 0, 0, size, // width
      0, 0, 0, size, // height
      8,             // bit depth
      2,             // color type: RGB (no alpha)
      0, 0, 0,       // compression, filter, interlace
    ]),
  )

  // Raw image data: each row = filter_byte(0x00) + RGB pixels
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0 // filter type: None
    for (let x = 0; x < size; x++) {
      const off = y * (size * 3 + 1) + 1 + x * 3
      raw[off] = r
      raw[off + 1] = g
      raw[off + 2] = b
    }
  }

  const idat = chunk('IDAT', createDeflateSync(raw))
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([sig, ihdr, idat, iend])
}

mkdirSync(ICONS_DIR, { recursive: true })

for (const size of [16, 48, 128]) {
  const destPath = resolve(ICONS_DIR, `icon${size}.png`)
  if (existsSync(destPath)) continue // don't overwrite custom icons
  // Deep blue-purple (#5B45E0) — Riftbound theme
  writeFileSync(destPath, createSolidPNG(size, 0x5b, 0x45, 0xe0))
  console.log(`Generated ${destPath}`)
}

console.log('Icons ready.')
