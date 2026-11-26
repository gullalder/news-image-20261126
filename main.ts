import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const image = readFileSync(new URL('./entry.png', import.meta.url));
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (image.length > 1048576 || !image.subarray(0, 8).equals(signature)) {
  throw new Error('entry.png must be a PNG no larger than 1 MiB');
}
if (image.length < 33 || image.toString('ascii', 12, 16) !== 'IHDR' ||
    image.readUInt32BE(16) !== 1024 || image.readUInt32BE(20) !== 1024) {
  throw new Error('entry.png must measure exactly 1024 by 1024 pixels');
}

// Check every chunk before publishing; a truncated or corrupted asset must fail closed.
function checksum(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
let cursor = 8;
let ended = false;
let hasData = false;
while (cursor + 12 <= image.length) {
  const length = image.readUInt32BE(cursor);
  const end = cursor + 12 + length;
  if (end > image.length) throw new Error('Truncated PNG chunk');
  const kind = image.toString('ascii', cursor + 4, cursor + 8);
  if (checksum(image.subarray(cursor + 4, end - 4)) !== image.readUInt32BE(end - 4)) {
    throw new Error('PNG checksum mismatch');
  }
  if (kind === 'IDAT') hasData = true;
  cursor = end;
  if (kind === 'IEND') {
    if (length !== 0) throw new Error('Invalid PNG end chunk');
    ended = true;
    break;
  }
}
if (!ended || !hasData || cursor !== image.length) throw new Error('Incomplete PNG');

const destination = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
mkdirSync(destination, { recursive: true });
writeFileSync(resolve(destination, 'entry.png'), image);
