// 生成 build/icon.ico（无第三方依赖）：BMP 型多尺寸图标，图案与 public/favicon.svg 一致。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48, 64, 128, 256];

const BG = [0x0b, 0x0c, 0x0d];
const AMBER = [0xe8, 0xa3, 0x3d];
const INK = [0x0b, 0x0c, 0x0d];

/** 与 favicon.svg 同构：32×32 坐标网格内的瓶身 + 瓶盖 + 底部墨色带 */
function pixel(x, y, size) {
  const gx = (x / size) * 32;
  const gy = (y / size) * 32;
  const inBody = gx >= 7 && gx < 25 && gy >= 9 && gy < 25;
  const inCap = gx >= 12 && gx < 20 && gy >= 4 && gy < 9;
  if (!inBody && !inCap) return BG;
  if (inBody && gy >= 18) return INK;
  return AMBER;
}

function bmpFor(size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixel(x, size - 1 - y, size);
      const o = (y * size + x) * 4;
      xor[o] = b;
      xor[o + 1] = g;
      xor[o + 2] = r;
      xor[o + 3] = 0xff;
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  const and = Buffer.alloc(maskRow * size);
  return Buffer.concat([header, xor, and]);
}

const images = SIZES.map((size) => ({ size, data: bmpFor(size) }));
const dir = Buffer.alloc(6 + images.length * 16);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(images.length, 4);
let offset = dir.length;
images.forEach((image, index) => {
  const o = 6 + index * 16;
  dir.writeUInt8(image.size >= 256 ? 0 : image.size, o);
  dir.writeUInt8(image.size >= 256 ? 0 : image.size, o + 1);
  dir.writeUInt8(0, o + 2);
  dir.writeUInt8(0, o + 3);
  dir.writeUInt16LE(1, o + 4);
  dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(image.data.length, o + 8);
  dir.writeUInt32LE(offset, o + 12);
  offset += image.data.length;
});

fs.mkdirSync(path.join(root, 'build'), { recursive: true });
const target = path.join(root, 'build', 'icon.ico');
fs.writeFileSync(target, Buffer.concat([dir, ...images.map((image) => image.data)]));
console.log('icon.ico 已生成: ' + target + ' (' + fs.statSync(target).size + ' bytes)');
