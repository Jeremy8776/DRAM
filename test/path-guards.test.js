import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { isPathWithinBaseDir } from '../runtime/main/ipc/path-guards.js';

test('isPathWithinBaseDir allows files inside base directory', () => {
    const base = path.resolve('tmp', 'app-data');
    const nested = path.join(base, 'logs', 'debug.log');
    assert.equal(isPathWithinBaseDir(base, nested), true);
});

test('isPathWithinBaseDir blocks prefix-collision paths', () => {
    const parent = path.resolve('tmp');
    const base = path.join(parent, 'app-data');
    const outside = path.join(parent, 'app-data-evil', 'debug.log');
    assert.equal(isPathWithinBaseDir(base, outside), false);
});

test('isPathWithinBaseDir blocks parent-directory traversal', () => {
    const base = path.resolve('tmp', 'app-data');
    const traversal = path.join(base, '..', 'secrets.txt');
    assert.equal(isPathWithinBaseDir(base, traversal), false);
});

test('isPathWithinBaseDir blocks symlink escapes when target exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dram-path-guard-'));
    const base = path.join(root, 'base');
    const outsideDir = path.join(root, 'outside');
    const outsideFile = path.join(outsideDir, 'secret.txt');
    const linkPath = path.join(base, 'link.txt');

    fs.mkdirSync(base, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(outsideFile, 'secret');

    try {
        fs.symlinkSync(outsideFile, linkPath);
    } catch {
        fs.rmSync(root, { recursive: true, force: true });
        return;
    }

    try {
        assert.equal(isPathWithinBaseDir(base, linkPath), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
