import { createWriteStream } from 'fs';
import { deflateSync } from 'zlib';

function createPNG(size, bgColor, fgColor) {
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let crc = 0xffffffff;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.allocUnsafe(4);
    lenBuf.writeUInt32BE(data.length);
    const crcData = Buffer.concat([typeBytes, data]);
    const crcBuf = Buffer.allocUnsafe(4);
    crcBuf.writeUInt32BE(crc32(crcData));
    return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Image data
  const [bgR, bgG, bgB] = bgColor;
  const [fgR, fgG, fgB] = fgColor;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.allocUnsafe(1 + size * 3);
    row[0] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      // Draw a rounded square "E" shape for English
      const cx = size / 2, cy = size / 2;
      const r = size * 0.4;
      const dx = x - cx, dy = y - cy;
      const inCircle = dx * dx + dy * dy <= r * r;

      // Draw letter "E" approximation as a white shape on indigo background
      const nx = x / size, ny = y / size;
      const isLetter = (
        (nx >= 0.25 && nx <= 0.35 && ny >= 0.2 && ny <= 0.8) || // vertical bar
        (nx >= 0.25 && nx <= 0.7 && ny >= 0.2 && ny <= 0.32) ||  // top bar
        (nx >= 0.25 && nx <= 0.65 && ny >= 0.44 && ny <= 0.56) || // middle bar
        (nx >= 0.25 && nx <= 0.7 && ny >= 0.68 && ny <= 0.8)     // bottom bar
      );

      const [r_, g_, b_] = inCircle
        ? isLetter ? fgColor : bgColor
        : bgColor;
      row[1 + x * 3] = r_;
      row[2 + x * 3] = g_;
      row[3 + x * 3] = b_;
    }
    rows.push(row);
  }

  const rawData = Buffer.concat(rows);
  const compressed = deflateSync(rawData);

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const indigo = [99, 102, 241];
const white = [255, 255, 255];

import { writeFileSync } from 'fs';
writeFileSync('public/icons/icon-180x180.png', createPNG(180, indigo, white));
writeFileSync('public/icons/icon-192x192.png', createPNG(192, indigo, white));
writeFileSync('public/icons/icon-512x512.png', createPNG(512, indigo, white));
console.log('Icons generated successfully!');
