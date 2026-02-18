#!/usr/bin/env node
/**
 * DRAM Icon Build Script
 * Generates all platform assets from SVG sources
 * 
 * Usage: node build.mjs
 * Requires: npm install sharp
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sharp;
try {
  const sharpModule = await import('sharp');
  sharp = sharpModule.default;
} catch (err) {
  console.error('❌ sharp is not installed.');
  console.log('Install: npm install sharp');
  process.exit(1);
}

// Directory structure
const SRC_DIR = path.join(__dirname, 'src');
const PNG_DIR = path.join(__dirname, 'png');
const PLATFORM_DIR = path.join(__dirname, 'platform');
const ARCHIVE_DIR = path.join(__dirname, 'archive', 'final');

const SIZES = {
  app: [16, 24, 32, 48, 64, 128, 256, 512, 1024],
  windows: [16, 32, 48, 128, 256],
  macos: [16, 32, 64, 128, 256, 512, 1024],
  linux: [16, 22, 24, 32, 48, 64, 96, 128, 192, 256],
  tray: [16, 32],
  favicon: [16, 32]
};

async function generatePNG(inputPath, outputPath, size) {
  try {
    await sharp(inputPath)
      .resize(size, size, { fit: 'contain', background: { r: 6, g: 6, b: 7, alpha: 1 } })
      .png()
      .toFile(outputPath);
    return true;
  } catch (err) {
    console.error(`  ✗ ${size}px: ${err.message}`);
    return false;
  }
}

async function build() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  DRAM Icon Build');
  console.log('═══════════════════════════════════════════════════\n');

  // Ensure directories exist
  [PNG_DIR, path.join(PLATFORM_DIR, 'windows'), path.join(PLATFORM_DIR, 'macos'), 
   path.join(PLATFORM_DIR, 'linux'), path.join(PLATFORM_DIR, 'web')].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  // ========== 1. Main PNG Icons ==========
  console.log('🎨 Building main icons...');
  const mainInput = path.join(SRC_DIR, 'icon.svg');
  
  for (const size of SIZES.app) {
    await generatePNG(mainInput, path.join(PNG_DIR, `icon-${size}.png`), size);
    console.log(`  ✓ icon-${size}.png`);
  }

  // ========== 2. Windows ICO ==========
  console.log('\n🪟 Building Windows ICO...');
  for (const size of SIZES.windows) {
    await generatePNG(mainInput, path.join(PLATFORM_DIR, 'windows', `${size}.png`), size);
    console.log(`  ✓ ${size}px`);
  }
  
  // Create multi-size ICO using png-to-ico
  try {
    const { default: pngToIco } = await import('png-to-ico');
    const winFiles = SIZES.windows.map(s => path.join(PLATFORM_DIR, 'windows', `${s}.png`));
    const icoBuffer = await pngToIco(winFiles);
    fs.writeFileSync(path.join(PLATFORM_DIR, 'windows', 'icon.ico'), icoBuffer);
    console.log('  ✓ icon.ico (multi-size)');
  } catch (err) {
    console.log('  ⚠ png-to-ico not available, skipping ICO generation');
  }

  // ========== 3. macOS ICNS ==========
  console.log('\n🍎 Building macOS ICNS...');
  for (const size of SIZES.macos) {
    await generatePNG(mainInput, path.join(PLATFORM_DIR, 'macos', `${size}.png`), size);
    console.log(`  ✓ ${size}px`);
  }
  
  // Create ICNS manually
  const iconTypes = [
    { size: 16, type: 'icp4' }, { size: 32, type: 'icp5' },
    { size: 64, type: 'icp6' }, { size: 128, type: 'ic07' },
    { size: 256, type: 'ic08' }, { size: 512, type: 'ic09' },
    { size: 1024, type: 'ic10' }
  ];
  
  const entries = [];
  let totalSize = 8;
  
  for (const { size, type } of iconTypes) {
    const filePath = path.join(PLATFORM_DIR, 'macos', `${size}.png`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      const typeBuf = Buffer.from(type, 'ascii');
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32BE(8 + data.length, 0);
      entries.push({ typeBuf, lengthBuf, data });
      totalSize += 8 + data.length;
    }
  }
  
  const header = Buffer.concat([Buffer.from('icns', 'ascii'), Buffer.alloc(4)]);
  header.writeUInt32BE(totalSize, 4);
  
  const parts = [header];
  for (const entry of entries) parts.push(entry.typeBuf, entry.lengthBuf, entry.data);
  
  fs.writeFileSync(path.join(PLATFORM_DIR, 'macos', 'icon.icns'), Buffer.concat(parts));
  console.log('  ✓ icon.icns');

  // ========== 4. Linux PNGs ==========
  console.log('\n🐧 Building Linux icons...');
  for (const size of SIZES.linux) {
    await generatePNG(mainInput, path.join(PLATFORM_DIR, 'linux', `${size}.png`), size);
    console.log(`  ✓ ${size}px`);
  }

  // ========== 5. Web Assets ==========
  console.log('\n🌐 Building web assets...');
  const faviconInput = path.join(SRC_DIR, 'icon.svg');
  await generatePNG(faviconInput, path.join(PLATFORM_DIR, 'web', 'favicon-16.png'), 16);
  await generatePNG(faviconInput, path.join(PLATFORM_DIR, 'web', 'favicon-32.png'), 32);
  fs.copyFileSync(path.join(PLATFORM_DIR, 'web', 'favicon-32.png'), 
                  path.join(PLATFORM_DIR, 'web', 'favicon.png'));
  console.log('  ✓ favicon.png');
  
  // Tray icons
  await generatePNG(faviconInput, path.join(PLATFORM_DIR, 'web', 'tray-16.png'), 16);
  await generatePNG(faviconInput, path.join(PLATFORM_DIR, 'web', 'tray-32.png'), 32);
  fs.copyFileSync(path.join(PLATFORM_DIR, 'web', 'tray-16.png'),
                  path.join(PLATFORM_DIR, 'web', 'tray-icon.png'));
  console.log('  ✓ tray-icon.png');

  // ========== Summary ==========
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Build Complete!');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n📁 Output structure:`);
  console.log(`  src/          - SVG sources`);
  console.log(`  png/          - PNG exports (${SIZES.app.length} sizes)`);
  console.log(`  platform/     - Platform-specific binaries`);
  console.log(`    windows/    - icon.ico`);
  console.log(`    macos/      - icon.icns`);
  console.log(`    linux/      - PNG set`);
  console.log(`    web/        - favicon.png, tray-icon.png`);
}

build().catch(console.error);
