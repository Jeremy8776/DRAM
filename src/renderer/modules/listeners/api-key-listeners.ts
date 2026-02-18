/**
 * DRAM Listeners - API Key Management
 * Handles secure key editing, saving, and gateway token rotation
 */
import { elements } from '../elements.js';
import { syncSecureKeyUI } from '../settings.js';
import { addSystemMessage } from '../utils.js';
import { humanizeError } from '../errors.js';
import { showConfirmDialog, showToast } from '../../components/dialog.js';

const normalizeSecretInput = (rawValue) => {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) return '';
    if (/^\$\{[A-Z0-9_]+\}$/.test(value)) return value;
    return value.replace(/\s+/g, '');
};

/**
 * Setup API key management listeners
 * These use event delegation on the document for dynamic key fields
 */
export function setupApiKeyListeners() {
    const keyProviderMap = {
        'setting-key-anthropic': 'anthropic',
        'setting-key-openai': 'openai',
        'setting-key-google': 'google',
        'setting-key-groq': 'groq',
        'setting-key-elevenlabs': 'elevenlabs'
    };

    // Secure Key Management - Edit/Save handlers
    document.addEventListener('click', async (e) => {
        // Edit Key button clicked
        if (e.target.classList.contains('btn-edit-key')) {
            const id = e.target.dataset.target;
            const container = document.querySelector(`.key-field-container[data-target="${id}"]`);
            const input = document.getElementById(id);
            const dots = container.querySelector('.key-status-dots');
            const saveBtn = container.querySelector('.btn-save-key');

            e.target.classList.add('hidden');
            saveBtn.classList.remove('hidden');
            dots.classList.add('hidden');
            input.classList.remove('hidden');
            input.readOnly = false;
            if (input.dataset.realValue) input.value = input.dataset.realValue;
            input.focus();
        }

        // Save Key button clicked
        if (e.target.classList.contains('btn-save-key')) {
            const id = e.target.dataset.target;
            // Ignore wizard/save buttons that are not API-key settings fields.
            // They reuse .btn-save-key for separate flows.
            const keyMap = {
                'setting-key-anthropic': 'settings.apiKeyAnthropic',
                'setting-key-openai': 'settings.apiKeyOpenAI',
                'setting-key-google': 'settings.apiKeyGoogle',
                'setting-key-groq': 'settings.apiKeyGroq',
                'setting-key-elevenlabs': 'settings.apiKeyElevenLabs',
                'setting-gateway-token-dash': 'gateway.token'
            };
            const storageKey = keyMap[id];
            if (!storageKey) {
                return;
            }
            const container = document.querySelector(`.key-field-container[data-target="${id}"]`);
            const input = document.getElementById(id);
            if (!container || !input) {
                return;
            }
            const dots = container.querySelector('.key-status-dots');
            const editBtn = container.querySelector('.btn-edit-key');
            const newValue = normalizeSecretInput(input.value);

            if (newValue) {
                const provider = keyProviderMap[id];
                if (provider) {
                    try {
                        const validation = await window.dram.util.validateApiKey(provider, newValue);
                        if (!validation?.valid) {
                            showToast({ message: 'Invalid API key format', type: 'error' });
                            input.focus();
                            return;
                        }
                    } catch (err) {
                        console.error('API key validation failed:', err);
                        showToast({ message: 'Could not validate API key', type: 'error' });
                        input.focus();
                        return;
                    }
                }

                const writeOk = await window.dram.storage.set(storageKey, newValue);
                if (!writeOk) {
                    showToast({ message: 'Failed to save API key', type: 'error' });
                    input.focus();
                    return;
                }

                const readBack = await window.dram.storage.get(storageKey);
                if ((readBack || '') !== newValue) {
                    showToast({ message: 'API key save verification failed', type: 'error' });
                    input.focus();
                    return;
                }
                input.dataset.realValue = newValue;

                e.target.classList.add('hidden');
                editBtn.classList.remove('hidden');
                editBtn.textContent = 'Change';
                input.readOnly = true;
                input.classList.add('hidden');
                dots.classList.remove('hidden');
                showToast({ message: 'API Key Saved', type: 'success' });

                // Patch engine config for specific providers
                if (id === 'setting-key-elevenlabs') {
                    await window.dram.gateway.patchConfig({
                        messages: { tts: { elevenlabs: { apiKey: newValue } } }
                    });
                }
            } else {
                const cleared = await window.dram.storage.set(storageKey, '');
                if (!cleared) {
                    showToast({ message: 'Failed to remove API key', type: 'error' });
                    return;
                }
                input.dataset.realValue = '';
                input.readOnly = false;
                input.classList.remove('hidden');
                dots.classList.add('hidden');
                e.target.classList.remove('hidden');
                editBtn.classList.add('hidden');
                showToast({ message: 'API Key Removed', type: 'info' });
            }
        }
    });
}

/**
 * Setup gateway token rotation listener
 * @param {function} on - Event binding helper
 */
export function setupTokenRotationListener(on) {
    on(elements.btnRotateToken, 'click', async () => {
        const confirmed = await showConfirmDialog({
            type: 'warning',
            title: 'Rotate Gateway Token',
            message: 'This will invalidate the current token.',
            detail: 'The application will need to reconnect to the engine. Are you sure?',
            confirmText: 'Rotate Token',
            cancelText: 'Cancel'
        });

        if (confirmed) {
            try {
                // Generate new token
                const array = new Uint8Array(32);
                window.crypto.getRandomValues(array);
                const newToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

                // Update Storage
                await window.dram.storage.set('gateway.token', newToken);
                await window.dram.storage.set('gateway.password', newToken); // Legacy compat

                // Update Engine Config
                await window.dram.gateway.patchConfig({
                    gateway: { auth: { token: newToken } }
                });

                showToast({ message: 'Token rotated successfully', type: 'success' });

                // Update UI immediately
                syncSecureKeyUI('setting-gateway-token-dash', newToken);

                // Trigger connection reset
                addSystemMessage(elements, 'GATEWAY TOKEN ROTATED - RECONNECTING...');

            } catch (err) {
                console.error('Failed to rotate token:', err);
                showToast({ message: humanizeError(err), type: 'error' });
            }
        }
    });
}

/**
 * Setup gateway URL listener
 * @param {function} on - Event binding helper
 */
export function setupGatewayUrlListener(on) {
    on(elements.settingGatewayUrl, 'change', async (e) => {
        const url = e.target.value.trim();
        if (url) {
            await window.dram.gateway.saveConnection({ url });
            showToast({ message: 'Gateway URL updated', type: 'info' });
        }
    });
}

/**
 * Setup listener to clear all sensitive credentials
 * @param {function} on - Event binding helper
 */
export function setupClearCredsListener(on) {
    on(elements.btnClearCreds, 'click', async () => {
        const confirmed = await showConfirmDialog({
            type: 'danger',
            title: 'Clear Secure Credentials',
            message: 'Are you sure you want to purge all API keys and Gateway tokens?',
            detail: 'This will remove your Anthropic, OpenAI, Google, and Groq keys, as well as your Gateway authentication token.',
            confirmText: 'Clear All',
            cancelText: 'Cancel'
        });

        if (confirmed) {
            try {
                const keys = [
                    'settings.apiKeyAnthropic',
                    'settings.apiKeyOpenAI',
                    'settings.apiKeyGoogle',
                    'settings.apiKeyGroq',
                    'settings.apiKeyElevenLabs',
                    'gateway.token',
                    'gateway.password'
                ];

                for (const key of keys) {
                    await window.dram.storage.delete(key);
                }

                // Also purge gateway config in the engine
                await window.dram.gateway.patchConfig({
                    gateway: { auth: { token: '' } }
                });

                showToast({ message: 'All credentials cleared', type: 'success' });

                // Refresh UI for all key fields
                const ids = [
                    'setting-key-anthropic',
                    'setting-key-openai',
                    'setting-key-google',
                    'setting-key-groq',
                    'setting-key-elevenlabs',
                    'setting-gateway-token-dash'
                ];
                ids.forEach(id => syncSecureKeyUI(id, ''));

                addSystemMessage(elements, 'SECURE CREDENTIALS PURGED.');
            } catch (err) {
                console.error('Failed to clear credentials:', err);
                showToast({ message: humanizeError(err), type: 'error' });
            }
        }
    });
}

/**
 * Setup Ollama Connection Test Listener
 */
export function setupOllamaTestListener() {
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-test-ollama') {
            const hostInput = document.getElementById('setting-ollama-host');
            const resultsEl = document.getElementById('ollama-test-results');

            if (!hostInput || !resultsEl) return;

            const url = hostInput.value.trim() || 'http://localhost:11434';

            // Show loading state
            resultsEl.textContent = 'Scanning local host...';
            resultsEl.className = 'setting-status-indicator info';
            resultsEl.style.opacity = '1';
            e.target.disabled = true;

            try {
                const result = await window.dram.util.testOllamaConnection(url);

                if (result.ok) {
                    const modelCount = result.models ? result.models.length : 0;
                    resultsEl.textContent = `Success: Found ${modelCount} models`;
                    resultsEl.className = 'setting-status-indicator success';

                    showToast({
                        message: `Ollama Connected: ${modelCount} models found`,
                        type: 'success'
                    });

                    // Trigger a model UI refresh to populate the local selector
                    const { refreshModelsUI } = await import('../settings.js');
                    await refreshModelsUI({ force: true });

                } else {
                    resultsEl.textContent = `Failed: ${result.error || 'Connection refused'}`;
                    resultsEl.className = 'setting-status-indicator error';
                    showToast({ message: 'Ollama connection failed', type: 'error' });
                }
            } catch (err) {
                console.error('Ollama test error:', err);
                resultsEl.textContent = humanizeError(err);
                resultsEl.className = 'setting-status-indicator error';
            } finally {
                e.target.disabled = false;
                setTimeout(() => {
                    resultsEl.style.opacity = '0';
                }, 5000);
            }
        }
    });
}

/**
 * Setup OpenClaw Management Listeners
 * Handles version management, installation, and backups
 */
export function setupOpenClawManagementListeners() {
    // Install/Update OpenClaw
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-install-openclaw') {
            const select = document.getElementById('openclaw-version-select');
            const version = select ? select.value : 'latest';
            const originalText = e.target.textContent;

            // Show loading state
            e.target.disabled = true;
            e.target.innerHTML = '<span class="btn-spinner"></span> Installing...';

            // Update status display
            const statusDisplay = document.getElementById('openclaw-version-display');
            const originalStatus = statusDisplay ? statusDisplay.textContent : '';
            if (statusDisplay) {
                statusDisplay.innerHTML = '<span class="status-spinner"></span> Installing...';
            }

            try {
                const result = await window.dram.app.installOpenClaw(version);
                if (result.success) {
                    showToast({ message: 'OpenClaw installed successfully', type: 'success' });
                    // Refresh version display
                    await refreshOpenClawVersion();
                } else {
                    showToast({ message: result.error || 'Installation failed', type: 'error' });
                    if (statusDisplay) statusDisplay.textContent = originalStatus;
                }
            } catch (err) {
                console.error('OpenClaw install error:', err);
                showToast({ message: 'Installation failed', type: 'error' });
                if (statusDisplay) statusDisplay.textContent = originalStatus;
            } finally {
                e.target.disabled = false;
                e.target.textContent = originalText;
            }
        }
    });

    // Create backup
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-create-backup') {
            const originalText = e.target.textContent;
            e.target.disabled = true;
            e.target.innerHTML = '<span class="btn-spinner"></span> Creating...';

            try {
                const result = await window.dram.app.createOpenClawBackup();
                if (result.success) {
                    showToast({ message: 'Backup created', type: 'success' });
                    await refreshBackupsList();
                } else {
                    showToast({ message: 'Backup failed', type: 'error' });
                }
            } catch (err) {
                console.error('Backup error:', err);
                showToast({ message: 'Backup failed', type: 'error' });
            } finally {
                e.target.disabled = false;
                e.target.textContent = originalText;
            }
        }
    });

    // Restore backup
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-restore-backup') {
            const originalText = e.target.textContent;
            try {
                const backups = await window.dram.app.listOpenClawBackups();
                if (backups.length === 0) {
                    showToast({ message: 'No backups available', type: 'warning' });
                    return;
                }

                // Show backup selection dialog (simplified - just restore most recent)
                const confirmed = await showConfirmDialog({
                    type: 'warning',
                    title: 'Restore Backup',
                    message: 'Restore OpenClaw configuration from backup?',
                    detail: `This will overwrite your current config with the backup from ${backups[0].date}. Current settings will be lost.`
                });

                if (confirmed) {
                    e.target.disabled = true;
                    e.target.innerHTML = '<span class="btn-spinner"></span> Restoring...';

                    const result = await window.dram.app.restoreOpenClawBackup(backups[0].path);
                    if (result.success) {
                        showToast({ message: 'Backup restored successfully', type: 'success' });
                    } else {
                        showToast({ message: 'Restore failed', type: 'error' });
                    }
                }
            } catch (err) {
                console.error('Restore error:', err);
                showToast({ message: 'Restore failed', type: 'error' });
            } finally {
                e.target.disabled = false;
                e.target.textContent = originalText;
            }
        }
    });
}

/**
 * Refresh OpenClaw version display in settings
 */
async function refreshOpenClawVersion() {
    const display = document.getElementById('openclaw-version-display');
    const select = document.getElementById('openclaw-version-select');

    if (display) {
        try {
            const discovery = await window.dram.app.discoverOpenClaw();
            if (discovery.found) {
                display.textContent = `v${discovery.version || 'unknown'} (${discovery.source})`;
            } else {
                display.textContent = 'Not installed';
            }

            // Load available versions for dropdown
            if (select) {
                const versions = await window.dram.app.getOpenClawVersions();
                const hasVersions = versions.length > 0;

                if (hasVersions && !select.dataset.populated) {
                    select.innerHTML = versions.map(v =>
                        `<option value="${v}">${v}</option>`
                    ).join('') + '<option value="latest">latest</option>';
                    select.dataset.populated = 'true';
                }
            }
        } catch (err) {
            console.error('Failed to refresh OpenClaw version:', err);
            if (display) display.textContent = 'Error detecting version';
        }
    }
}

/**
 * Refresh backups list display
 */
async function refreshBackupsList() {
    const container = document.getElementById('backups-list');
    if (!container) return;

    try {
        const backups = await window.dram.app.listOpenClawBackups();
        if (backups.length === 0) {
            container.innerHTML = 'No backups available';
        } else {
            container.innerHTML = backups.slice(0, 5).map(b =>
                `<div class="backup-item">${b.date} - ${b.name}</div>`
            ).join('');
        }
    } catch {
        container.innerHTML = 'Failed to load backups';
    }
}

// Note: showToast and showConfirmDialog are imported at top of file

// Auto-initialize version display when settings tab is shown
document.addEventListener('settingsTabChanged', async (e) => {
    if (e.detail?.tab === 'gateway') {
        await refreshOpenClawVersion();
        await refreshBackupsList();
    }
});






