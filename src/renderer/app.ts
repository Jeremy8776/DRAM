/**
 * DRAM Desktop - Renderer Application (Entry Point)
 * 2026 Golden Edition
 */
import { state } from './modules/state.js';
import { elements } from './modules/elements.js';
import { connect } from './modules/socket.js';
import { loadUserSettings, loadSavedConnection } from './modules/settings.js';
import { addSystemMessage } from './modules/utils.js';
import { humanizeError } from './modules/errors.js';
import { loadUiComponents, setProgressCallback } from './modules/ui-loader.js';
import { refreshElements } from './modules/elements.js';
import { initRateLimitUI, updateModelStats } from './modules/rate-limits.js';
import { setupWizardLogic } from './modules/wizard-logic.js';
import { setupEventListeners, setupIpcListeners, shutdownAllListeners } from './modules/listeners.js';
import { setupStateBridge } from './modules/state-bridge.js';
import { initTabs } from './modules/tabs.js';
import { setupSecureLogging } from './modules/logger.js';
import { initInfoTooltips } from './modules/info-tooltip.js';

// Initialize security layer immediately
setupSecureLogging();

// Loading screen helpers
const loadingScreen = {
  el: null,
  bar: null,
  status: null,
  init() {
    this.el = document.getElementById('loading-screen');
    this.bar = this.el?.querySelector('#loading-progress')
      || this.el?.querySelector('.loading-bar')
      || this.el?.querySelector('.loading-progress');
    this.status = this.el?.querySelector('.loading-status') || document.getElementById('loading-status');
  },
  setProgress(percent, text) {
    if (this.bar) this.bar.style.width = `${percent}%`;
    if (text && this.status) this.status.textContent = text;
  },
  hide() {
    if (this.el) this.el.classList.add('fade-out');
    const app = document.getElementById('app');
    if (app) {
      app.classList.remove('app-hidden');
      app.classList.add('app-visible');
    }
  }
};

async function init() {
  console.log('Renderer: Initializing...');
  loadingScreen.init();

  // Global error handler
  window.onerror = (msg, url, line, col, err) => {
    console.error('Renderer Error:', msg, 'at', url, line, col, err);
    loadingScreen.setProgress(100, 'Error: ' + msg);
  };
  window.onunhandledrejection = (e) => {
    console.error('Unhandled Promise Rejection:', e.reason);
    loadingScreen.setProgress(100, humanizeError(e.reason));
  };

  // Wire up progress callback from ui-loader
  setProgressCallback((percent, status) => {
    loadingScreen.setProgress(percent, status);
  });

  try {
    // Initialize core logic and state links
    loadingScreen.setProgress(5, 'Initializing core logic...');
    setupWizardLogic();
    setupStateBridge();
    setupIpcListeners();

    // Inject components
    loadingScreen.setProgress(10, 'Injecting interface components...');
    await loadUiComponents();
    refreshElements();

    // Ensure file input exists before listeners are registered.
    if (!elements.fileInput) {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = 'file-input';
      input.className = 'hidden';
      document.body.appendChild(input);
      elements.fileInput = input;
    }
    if (elements.fileInput) {
      elements.fileInput.accept = '*/*';
      elements.fileInput.multiple = true;
    }

    setupEventListeners();

    // Apply platform class for OS-specific styling
    const platform = window.dram.platform || 'unknown';
    document.body.classList.add(`platform-${platform}`);

    // Set initial model state from storage
    loadingScreen.setProgress(85, 'Checking AI engine...');

    // OpenClaw discovery/installation is handled by wizard flow in ui-loader.
    loadingScreen.setProgress(90, 'Preparing onboarding...');

    loadingScreen.setProgress(92, 'Loading state...');
    const s: any = await window.dram.storage.getAll();

    // Helper to get nested value from storage
    const getSetting = (key): any => {
      const parts = key.split('.');
      let current = s;
      for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
      }
      return current;
    };

    const normalizeModelId = (rawId) => {
      const id = String(rawId || '').trim();
      if (!id) return '';
      if (id.includes('/')) return id;
      const lower = id.toLowerCase();
      if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus') || lower.includes('haiku')) return `anthropic/${id}`;
      if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) return `openai/${id}`;
      if (lower.includes('gemini') || lower.includes('antigravity')) return `google/${id}`;
      if (lower.includes('groq')) return `groq/${id}`;
      if (lower === 'ollama' || lower.includes('local') || lower.includes(':')) return `ollama/${id}`;
      return id;
    };
    const normalizeModelChain = (items, primaryModelId) => {
      const seen = new Set();
      const result = [];
      for (const raw of items || []) {
        const id = normalizeModelId(raw);
        if (!id) continue;
        if (id === primaryModelId) continue;
        const key = id.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(id);
      }
      return result;
    };

    const cloudPrimaryId = normalizeModelId(getSetting('settings.model') || 'anthropic/claude-3-7-sonnet-latest');
    const localPrimaryId = normalizeModelId(getSetting('settings.modelLocal') || 'ollama/llama3:latest');
    const primaryModeLocal = Boolean(getSetting('settings.primaryModeLocal'));
    const primaryId = primaryModeLocal && localPrimaryId ? localPrimaryId : cloudPrimaryId;
    const localFallbacks = (Array.isArray(getSetting('settings.fallbackChain')) ? getSetting('settings.fallbackChain') : [])
      .map((id: any) => normalizeModelId(id))
      .filter(Boolean);

    const getModelName = (id) => {
      if (!id || id === 'none') return 'None';
      const base = id.includes('/') ? id.split('/').pop() : id;
      if (base.includes('sonnet')) return 'Claude Sonnet';
      if (base.includes('opus')) return 'Claude Opus';
      if (base.includes('haiku')) return 'Claude Haiku';
      if (base.includes('gpt-4o-mini')) return 'GPT-4o Mini';
      if (base.includes('gpt-4o') || base.includes('gpt-4')) return 'GPT-4o';
      if (base.includes('o1')) return 'o1';
      if (base.includes('gemini')) return 'Gemini';
      if (base.includes('llama')) return 'Llama';
      if (base === 'ollama') return 'Local';
      return base.split('-').slice(0, 2).join(' ');
    };

    const urlParams = new URLSearchParams(window.location.search);
    const sessionKey = urlParams.get('session') || 'main';

    state.sessionKey = sessionKey;
    state.model = primaryId;
    state.currentActiveModelId = primaryId;
    state.models.primary = { id: primaryId, name: getModelName(primaryId), limit: 100, active: true, cooldown: 0 };

    // Load fallback chain - try engine config first, then local storage
    try {
      const fallbackResult = await window.dram.gateway.getFallbackChain();
      const engineFallbacks = (fallbackResult.success ? fallbackResult.fallbacks : [])
        .map(normalizeModelId)
        .filter(Boolean);

      // Use engine fallbacks if available, otherwise use local storage
      const fallbacks = normalizeModelChain(
        engineFallbacks.length > 0 ? engineFallbacks : localFallbacks,
        primaryId
      );

      if (fallbacks && fallbacks.length > 0) {
        state.fallbackChain = fallbacks;
        state.models.fallback = {
          id: fallbacks[0],
          name: getModelName(fallbacks[0]),
          limit: 100,
          active: false,
          cooldown: 0
        };
        console.log('App: Loaded fallbacks:', fallbacks);
      } else {
        state.models.fallback = { id: 'none', name: 'None', limit: 100, active: false, cooldown: 0 };
        state.fallbackChain = [];
      }
    } catch (err) {
      console.error('Failed to load fallback chain:', err);
      // Fallback to local storage
      if (localFallbacks && localFallbacks.length > 0) {
        const normalizedLocalFallbacks = normalizeModelChain(localFallbacks, primaryId);
        state.fallbackChain = normalizedLocalFallbacks;
        state.models.fallback = {
          id: normalizedLocalFallbacks[0],
          name: getModelName(normalizedLocalFallbacks[0]),
          limit: 100,
          active: false,
          cooldown: 0
        };
      } else {
        state.models.fallback = { id: 'none', name: 'None', limit: 100, active: false, cooldown: 0 };
        state.fallbackChain = [];
      }
    }

    console.log('App: State initialized - primary:', state.models.primary.id, 'fallbacks:', state.fallbackChain);

    loadingScreen.setProgress(94, 'Initializing interface...');
    updateModelStats(); // Initial refresh
    initRateLimitUI();

    // Final re-discovery after everything is injected
    refreshElements();

    // Explicitly re-query dynamic sidebar elements
    elements.toolNavItems = document.querySelectorAll('.tool-nav .nav-item');
    elements.btnSettings = document.getElementById('btn-show-settings');

    // Ensure file input settings remain correct after late DOM refresh.
    if (elements.fileInput) {
      elements.fileInput.accept = '*/*';
      elements.fileInput.multiple = true;
    }

    loadingScreen.setProgress(96, 'Loading preferences...');
    await loadSavedConnection();
    await loadUserSettings();

    loadingScreen.setProgress(98, 'Registering handlers...');
    initTabs();
    initInfoTooltips();

    // Initialize Voice Mode
    import('./modules/voice-mode.js').then(m => m.initVoiceMode());

    // Initialize Canvas
    import('./modules/canvas.js').then(m => m.initCanvas());

    // Initialize Usage Polling
    import('./modules/usage-data.js').then(m => m.startUsageRefresh());

    console.log('Renderer: Initialization complete');

    // Register shutdown handler for clean exit
    window.addEventListener('beforeunload', () => {
      shutdownAllListeners();
    });

    // Check if setup wizard needs to show
    const setupScreen = document.getElementById('setup-screen');
    const isWizardVisible = setupScreen && !setupScreen.classList.contains('hidden');

    if (isWizardVisible) {
      // Wizard is showing - hide loading screen to reveal it
      loadingScreen.setProgress(100, 'Setup Required');
      // Small delay to ensure wizard HTML is rendered, then hide loading screen
      setTimeout(() => {
        loadingScreen.hide();
        console.log('App: Loading screen hidden, wizard should be visible');
      }, 300);
    } else {
      // Complete loading and show app
      loadingScreen.setProgress(100, 'Ready');
      setTimeout(() => loadingScreen.hide(), 200);
    }

    // Auto-connect if enabled
    const autoConnect = await window.dram.storage.get('settings.autoConnect');
    if (autoConnect !== false) {
      connect();
    }
  } catch (err) {
    console.error('Renderer: Initialization failed!', err);
    loadingScreen.setProgress(100, humanizeError(err));
    // Still show the app so user can see error
    setTimeout(() => loadingScreen.hide(), 1000);
    addSystemMessage(elements, 'BOOT ERROR: ' + humanizeError(err));
  }
}

init();






