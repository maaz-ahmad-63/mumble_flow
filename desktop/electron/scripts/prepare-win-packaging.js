/**
 * Mumble AI Desktop — Windows Packaging Preparation Script
 *
 * Ensures that cross-packaging from macOS/Linux to Windows x64:
 * 1. Cleans any host-compiled native build artifacts (e.g. Mach-O macOS arm64 in build/Release)
 * 2. Confirms that prebuilds/win32-x64/uiohook-napi.node exists and has valid Win32 PE headers.
 * 3. Prevents host binaries from corrupting the Windows Electron package.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const electronDir = path.resolve(__dirname, '..');

const uiohookDir = path.join(electronDir, 'node_modules', 'uiohook-napi');
const hostBuildDir = path.join(uiohookDir, 'build');
const winPrebuildFile = path.join(uiohookDir, 'prebuilds', 'win32-x64', 'uiohook-napi.node');

console.log('[Prepare-Win] 🧹 Preparing native dependencies for Windows x64 packaging...');

// 1. Remove host-compiled build folder if present
if (fs.existsSync(hostBuildDir)) {
  console.log(`[Prepare-Win] Removing host build directory to avoid cross-platform pollution: ${hostBuildDir}`);
  fs.rmSync(hostBuildDir, { recursive: true, force: true });
}

// 2. Validate Windows x64 prebuild binary
if (!fs.existsSync(winPrebuildFile)) {
  console.error(`[Prepare-Win] ❌ ERROR: Windows x64 prebuild missing at ${winPrebuildFile}`);
  process.exit(1);
}

const buffer = fs.readFileSync(winPrebuildFile);
// Verify DOS "MZ" magic header (0x4D, 0x5A)
if (buffer[0] !== 0x4D || buffer[1] !== 0x5A) {
  console.error('[Prepare-Win] ❌ ERROR: win32-x64/uiohook-napi.node is not a valid Win32 PE binary (missing MZ header).');
  process.exit(1);
}

console.log(`[Prepare-Win] ✓ Verified Windows x64 binary (${buffer.length} bytes, valid MZ header).`);
console.log('[Prepare-Win] ✓ Native dependencies ready for Windows packaging.\n');
