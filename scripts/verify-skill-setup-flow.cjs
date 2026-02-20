#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

class FakeElement {
  constructor(tagName, doc) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.id = '';
    this._innerHTML = '';
    this._textContent = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set textContent(value) {
    this._textContent = String(value || '');
    this._innerHTML = this._textContent;
  }

  get textContent() {
    return this._textContent;
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    if (child.id) {
      this.ownerDocument._ids.set(child.id, child);
    }
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
  }

  addEventListener(event, handler) {
    const evt = String(event || '').toLowerCase();
    if (evt !== 'click' || typeof handler !== 'function') return;
    if (this.__autoClick === true) {
      setTimeout(() => {
        try {
          if (typeof this.__beforeAutoClick === 'function') {
            this.__beforeAutoClick();
          }
        } catch { }
        try { handler({ target: this }); } catch { }
      }, 0);
    }
  }

  querySelector(selector) {
    const sel = String(selector || '').trim();
    if (!sel) return null;

    if (sel === '.dialog-btn-confirm') {
      const btn = new FakeElement('button', this.ownerDocument);
      btn.__autoClick = true;
      btn.__beforeAutoClick = () => {
        if (this._promptInput && !this._promptInput.value) {
          this._promptInput.value = 'auto-value';
        }
      };
      return btn;
    }
    if (sel === '.dialog-btn-cancel') {
      return new FakeElement('button', this.ownerDocument);
    }
    if (sel === '.toast-action-btn') {
      return new FakeElement('button', this.ownerDocument);
    }
    if (sel === '#prompt-input') {
      const input = new FakeElement('input', this.ownerDocument);
      input.value = 'auto-value';
      input.focus = () => { };
      input.addEventListener = () => { };
      this._promptInput = input;
      return input;
    }
    return null;
  }
}

class FakeDocument {
  constructor() {
    this._ids = new Map();
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this._ids.get(String(id || '')) || null;
  }

  addEventListener() { }
  removeEventListener() { }
}

function makeHarness() {
  const calls = {
    shell: [],
    patchConfig: [],
    installSkill: [],
    installWslHomebrew: 0,
    getSkills: 0
  };

  const state = {
    skillsByCase: [],
    installSkillQueue: []
  };

  const windowObj = {
    dram: {
      shell: {
        executeCLI: async (command) => {
          calls.shell.push(String(command || ''));
          return { ok: true, stdout: '', stderr: '' };
        }
      },
      gateway: {
        patchConfig: async (patch) => {
          calls.patchConfig.push(patch);
          return { ok: true };
        }
      },
      util: {
        getSkills: async () => {
          calls.getSkills += 1;
          return state.skillsByCase;
        },
        installSkill: async (skillId) => {
          calls.installSkill.push(String(skillId || ''));
          if (state.installSkillQueue.length > 0) {
            return state.installSkillQueue.shift();
          }
          return { success: false, reason: 'no_installer_hint' };
        },
        installWslHomebrew: async () => {
          calls.installWslHomebrew += 1;
          return { success: true, data: { alreadyInstalled: true } };
        },
        toggleSkill: async () => ({ success: true })
      }
    }
  };

  return { calls, state, windowObj };
}

async function run() {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalNavigator = globalThis.navigator;

  const doc = new FakeDocument();
  const { calls, state, windowObj } = makeHarness();

  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: windowObj, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Win32' }, configurable: true });

  let summary = [];
  try {
    const modUrl = pathToFileURL(path.join(ROOT, 'runtime', 'renderer', 'modules', 'listeners', 'skill-setup-flow.js')).href;
    const {
      runSkillSetup,
      tryEnableSkillWithAutoSetup
    } = await import(modUrl);

    // 1) Direct path representative: already ready skill should bypass setup.
    state.skillsByCase = [{ id: 'canvas', skillKey: 'canvas', name: 'canvas', eligible: true, enabled: false, requirements: [] }];
    const direct = await tryEnableSkillWithAutoSetup('canvas');
    summary.push({
      path: 'direct',
      skill: 'canvas',
      pass: direct?.ok === false && /already ready/i.test(String(direct?.error || '')),
      outcome: direct
    });

    // 2) In-app-config path: config/env prompt should be auto-applied and patch config.
    calls.patchConfig.length = 0;
    const inAppSkill = {
      id: 'notion',
      skillKey: 'notion',
      name: 'notion',
      eligible: false,
      requirements: ['missing env NOTION_API_KEY'],
      requirementDetails: [{ kind: 'env', key: 'NOTION_API_KEY', message: 'missing env NOTION_API_KEY' }],
      installOptions: []
    };
    const inApp = await runSkillSetup(inAppSkill, { allowExternalInstall: true });
    summary.push({
      path: 'in-app-config',
      skill: 'notion',
      pass: inApp?.changed === true && calls.patchConfig.length > 0,
      outcome: { result: inApp, patchCalls: calls.patchConfig.length }
    });

    // 3) Native-installer path: missing bootstrap tool -> install tool -> retry install succeeds.
    calls.shell.length = 0;
    state.installSkillQueue = [
      { success: false, reason: 'tool_missing', installer: 'go' },
      { success: true, data: { installed: true } }
    ];
    const nativeSkill = {
      id: 'blogwatcher',
      skillKey: 'blogwatcher',
      name: 'blogwatcher',
      eligible: false,
      requirements: [],
      installOptions: [{ installId: 'go', package: 'example.com/bear-notes' }]
    };
    const native = await runSkillSetup(nativeSkill, { allowExternalInstall: true });
    summary.push({
      path: 'native-installer',
      skill: 'blogwatcher',
      pass: native?.changed === true && calls.shell.some((cmd) => /winget install --id golang\.go/i.test(cmd)),
      outcome: { result: native, shellCalls: calls.shell.slice() }
    });

    // 4) WSL-homebrew path: runtime prep then install succeeds.
    calls.installWslHomebrew = 0;
    state.installSkillQueue = [{ success: true, data: { installed: true } }];
    const wslSkill = {
      id: '1password',
      skillKey: '1password',
      name: '1password',
      eligible: false,
      requirements: [],
      installOptions: [{ installId: 'brew', package: 'op' }]
    };
    const wsl = await runSkillSetup(wslSkill, { allowExternalInstall: true });
    summary.push({
      path: 'wsl-homebrew',
      skill: '1password',
      pass: wsl?.changed === true && calls.installWslHomebrew >= 1,
      outcome: { result: wsl, installWslHomebrewCalls: calls.installWslHomebrew }
    });

    // 5) Manual path: bootstrap only required tools and mark changed.
    calls.shell.length = 0;
    const manualSkill = {
      id: 'session-logs',
      skillKey: 'session-logs',
      name: 'session-logs',
      eligible: false,
      requirements: ['jq not installed'],
      installOptions: []
    };
    const manual = await runSkillSetup(manualSkill, { allowExternalInstall: true });
    summary.push({
      path: 'manual',
      skill: 'session-logs',
      pass: manual?.changed === true && calls.shell.some((cmd) => /jqlang\.jq/i.test(cmd)),
      outcome: { result: manual, shellCalls: calls.shell.slice() }
    });

    // 6) Unsupported OS path should return deterministic unsupported reason.
    const unsupportedSkill = {
      id: 'things-mac',
      skillKey: 'things-mac',
      name: 'things-mac',
      eligible: false,
      requirements: [],
      installOptions: []
    };
    const unsupported = await runSkillSetup(unsupportedSkill, { allowExternalInstall: true });
    summary.push({
      path: 'unsupported-os-guard',
      skill: 'things-mac',
      pass: unsupported?.noAutomaticFix === true && String(unsupported?.reason || '') === 'unsupported_os',
      outcome: unsupported
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });

    if (originalDocument === undefined) delete globalThis.document;
    else Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true });

    if (originalNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  }

  const passed = summary.filter((item) => item.pass).length;
  const failed = summary.length - passed;

  console.log('Skill Setup Flow Verification');
  console.log('============================');
  summary.forEach((item) => {
    console.log(`- ${item.path} (${item.skill}): ${item.pass ? 'PASS' : 'FAIL'}`);
  });
  console.log(`Result: ${passed}/${summary.length} passed`);

  if (failed > 0) {
    console.log('\nFailure details:');
    summary.filter((item) => !item.pass).forEach((item) => {
      console.log(`- ${item.path}: ${JSON.stringify(item.outcome)}`);
    });
    process.exitCode = 1;
    return;
  }
}

run().catch((err) => {
  console.error('[verify-skill-setup-flow] Failed:', err?.message || err);
  process.exitCode = 1;
});
