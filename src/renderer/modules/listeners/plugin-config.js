/**
 * DRAM Plugin Configuration Dialog
 * Handles plugin setup dialogs (token, multi-field, external, QR code)
 */
import { showToast } from '../../components/dialog.js';
import { escapeHtml } from '../utils.js';

const setByPath = (obj, path, value) => {
    const parts = String(path || '').split('.').filter(Boolean);
    if (parts.length === 0) return;
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!current[key] || typeof current[key] !== 'object') current[key] = {};
        current = current[key];
    }
    current[parts[parts.length - 1]] = value;
};

const parseFieldValue = (field, raw) => {
    const trimmed = typeof raw === 'string' ? raw.trim() : raw;
    if (field?.type === 'number') {
        const num = Number(trimmed);
        if (Number.isFinite(num)) return num;
        return null;
    }
    if (field?.type === 'boolean') {
        if (typeof trimmed === 'boolean') return trimmed;
        if (typeof trimmed !== 'string') return null;
        const lowered = trimmed.toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(lowered)) return true;
        if (['false', '0', 'no', 'off'].includes(lowered)) return false;
        return null;
    }
    if (field?.type === 'list') {
        if (typeof trimmed !== 'string') return null;
        const items = trimmed
            .split(/[,\\n]/)
            .map(item => item.trim())
            .filter(Boolean);
        if (items.length === 0) return null;
        return items;
    }
    return raw;
};

const runQrLoginStart = async (_pluginId, options = {}) => {
    const start = window.dram?.util?.webLoginStart || window.dram?.util?.whatsappStartLogin;
    if (!start) {
        return { message: 'QR login is not available in this build.' };
    }
    return start({ ...options });
};

const runQrLoginWait = async (_pluginId, options = {}) => {
    const wait = window.dram?.util?.webLoginWait || window.dram?.util?.whatsappPollLogin;
    if (!wait) {
        return { connected: false, message: 'QR login is not available in this build.' };
    }
    return wait({ ...options });
};

const setConfiguredFlag = async (pluginId, configured) => {
    if (!pluginId) return;
    try {
        await window.dram.storage.set(`plugins.configured.${pluginId}`, configured === true);
    } catch (err) {
        console.error('Failed to store plugin configured flag', err);
    }
};

const updateConfiguredBadge = (pluginId, configured) => {
    const card = document.querySelector(`.plugin-card[data-plugin-id="${pluginId}"]`);
    if (!card) return;
    const configBtn = card.querySelector('.plugin-config-btn');
    if (configBtn) {
        configBtn.textContent = configured ? 'Configured' : 'Configure';
        configBtn.classList.toggle('configured', configured);
        configBtn.title = configured ? 'Configured — click to reconfigure' : 'Configure this plugin';
    }
};

/**
 * Configure Plugin Modal
 * @param {string} pluginId - Plugin identifier
 */
export async function promptPluginConfig(pluginId) {
    const { PLUGIN_SETUP_REQUIREMENTS } = await import('../../data/plugin-metadata.js');
    const req = PLUGIN_SETUP_REQUIREMENTS[pluginId];
    if (!req) return;

    return new Promise((resolve) => {
        const state = { filePayload: null };
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const contentHtml = buildConfigContent(req, pluginId);
        const actionButtons = buildActionButtons(req);

        overlay.innerHTML = `
            <div class="modal" style="max-width: 500px; width: 90%; background: var(--bg-surface); border: 1px solid var(--border); padding: 24px; border-radius: 8px;">
                <h3 style="margin-top: 0; margin-bottom: 16px;">Configure ${escapeHtml(pluginId)}</h3>
                ${contentHtml}
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                    <button class="tactile-btn secondary" id="config-cancel">Cancel</button>
                    ${actionButtons}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Pre-fill existing values
        prefillConfigValues(overlay, req, pluginId, state);

        let isClosed = false;
        const close = () => {
            isClosed = true;
            overlay.remove();
            resolve();
        };

        setupEventListeners(overlay, req, pluginId, close, isClosed, state);
    });
}

/**
 * Build configuration content HTML based on type
 */
function buildConfigContent(req, _pluginId) {
    if (req.type === 'token') {
        return `
            <div class="input-group" style="flex-direction: column; gap: 8px;">
                <label class="setting-label">${escapeHtml(req.label)}</label>
                <input type="password" id="config-token" class="mono-input" placeholder="${escapeHtml(req.placeholder)}">
                <p class="setting-description" style="white-space: pre-wrap;">${escapeHtml(req.instructions)}</p>
            </div>
            ${req.docsUrl ? `<p style="font-size: 12px; color: var(--text-muted);">Documentation: <a href="#" id="config-docs-link" style="color: var(--accent);">${escapeHtml(req.docsUrl)}</a></p>` : ''}
        `;
    }

    if (req.type === 'oauth') {
        return `
            <div class="info-box">
                <div>
                    <div class="info-title">OAuth Connection</div>
                    <div class="info-text">${escapeHtml(req.instructions || 'Authenticate in your browser to link this provider.')}</div>
                </div>
            </div>
            <button class="tactile-btn primary oauth-btn" type="button" data-provider="${escapeHtml(req.provider || '')}">
                Connect ${escapeHtml(req.provider || 'Provider')}
            </button>
            <div class="setting-description" id="oauth-status" style="margin-top: 8px; font-size: 11px; color: var(--text-muted);"></div>
            ${req.docsUrl ? `<p style="font-size: 12px; color: var(--text-muted); margin-top: 12px;">Documentation: <a href="#" id="oauth-docs-link" style="color: var(--accent);">${escapeHtml(req.docsUrl)}</a></p>` : ''}
        `;
    }

    if (req.type === 'multi') {
        return req.fields.map(f => `
            <div class="input-group" style="flex-direction: column; gap: 8px; margin-bottom: 12px;">
                <label class="setting-label">${escapeHtml(f.label)}</label>
                <input type="${f.isSecret ? 'password' : 'text'}" 
                       class="mono-input config-field" 
                       data-key="${escapeHtml(f.key)}"
                       placeholder="${escapeHtml(f.placeholder)}">
            </div>
        `).join('') + `
            <p class="setting-description" style="white-space: pre-wrap;">${escapeHtml(req.instructions)}</p>
            ${req.docsUrl ? `<p style="font-size: 12px; color: var(--text-muted);">Documentation: <a href="#" id="config-docs-link" style="color: var(--accent);">${escapeHtml(req.docsUrl)}</a></p>` : ''}
        `;
    }

    if (req.type === 'cli') {
        const cliHint = req.cliHint ? `<p class="setting-description" style="margin-top: 8px;">${escapeHtml(req.cliHint)}</p>` : '';
        const cliButton = req.cliCommand
            ? `
                <button class="tactile-btn primary" id="cli-run-btn" data-cli-command="${escapeHtml(req.cliCommand)}">
                    ${escapeHtml(req.cliLabel || 'Run Setup')}
                </button>
                <div class="setting-description" id="cli-status" style="margin-top: 8px; font-size: 11px; color: var(--text-muted);"></div>
            `
            : '';
        return `
            <div class="info-box">
                <div>
                    <div class="info-title">External Setup</div>
                    <div class="info-text">${escapeHtml(req.instructions)}</div>
                </div>
            </div>
            ${cliHint}
            ${cliButton}
            ${req.docsUrl ? `<p style="font-size: 12px; color: var(--text-muted);">Documentation: <a href="#" id="cli-docs-link" style="color: var(--accent);">${escapeHtml(req.docsUrl)}</a></p>` : ''}
        `;
    }

    if (req.type === 'qrcode') {
        return `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
                <div id="qr-container" style="width: 200px; height: 200px; background: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 12px; border: 1px solid var(--border);">
                    <span class="muted" style="color: #666; font-size: 11px; text-align: center;">Click "Generate QR" to link this account</span>
                </div>
                <p class="setting-description" style="text-align: center; font-size: 11px; color: var(--text-muted);">${escapeHtml(req.instructions)}</p>
                ${req.docsUrl ? `<p style="font-size: 12px; color: var(--text-muted); margin-top: -8px;">Documentation: <a href="#" id="config-docs-link" style="color: var(--accent);">${escapeHtml(req.docsUrl)}</a></p>` : ''}
                <div id="qr-status" style="font-size: 11px; font-weight: 500; height: 16px; color: var(--accent);"></div>
                <button class="tactile-btn primary" id="generate-qr-btn">Generate QR Code</button>
                <div id="qr-loader" class="qr-spinner" style="display: none;"></div>
            </div>
        `;
    }

    if (req.type === 'file') {
        const extraFields = Array.isArray(req.fields)
            ? req.fields.map(f => `
                <div class="input-group" style="flex-direction: column; gap: 8px; margin-bottom: 12px;">
                    <label class="setting-label">${escapeHtml(f.label)}</label>
                    <input type="${f.isSecret ? 'password' : 'text'}"
                           class="mono-input config-field"
                           data-key="${escapeHtml(f.key)}"
                           placeholder="${escapeHtml(f.placeholder || '')}">
                </div>
            `).join('')
            : '';
        return `
            <div class="input-group" style="flex-direction: column; gap: 8px; margin-bottom: 12px;">
                <label class="setting-label">${escapeHtml(req.label || 'Upload File')}</label>
                <button class="tactile-btn secondary file-upload-btn" type="button">Select JSON File</button>
                <div class="setting-description" id="file-status" style="font-size: 11px; color: var(--text-muted);">No file selected</div>
            </div>
            ${extraFields}
            <p class="setting-description" style="white-space: pre-wrap;">${escapeHtml(req.instructions || '')}</p>
            ${req.docsUrl ? `<p style="font-size: 12px; color: var(--text-muted);">Documentation: <a href="#" id="config-docs-link" style="color: var(--accent);">${escapeHtml(req.docsUrl)}</a></p>` : ''}
        `;
    }

    return '';
}

/**
 * Build action buttons based on config type
 */
function buildActionButtons(req) {
    if (req.type === 'token' || req.type === 'multi') {
        return '<button class="tactile-btn primary" id="config-save">Save Configuration</button>';
    }
    if (req.type === 'file') {
        return '<button class="tactile-btn primary" id="config-save">Save Configuration</button>';
    }
    return '<button class="tactile-btn primary" id="config-done">Done</button>';
}

/**
 * Pre-fill existing configuration values
 */
async function prefillConfigValues(overlay, req, pluginId, state) {
    try {
        if (req.type === 'token' && req.configPath) {
            const val = await window.dram.storage.get(req.configPath);
            if (val) {
                const input = overlay.querySelector('#config-token');
                if (input) input.value = val;
            }
        }

        if (req.type === 'multi') {
            for (const f of req.fields) {
                const path = f.configPath || `channels.${pluginId}.${f.key}`;
                const val = await window.dram.storage.get(path);
                if (val !== undefined && val !== null) {
                    const input = overlay.querySelector(`input[data-key="${f.key}"]`);
                    if (input) input.value = Array.isArray(val) ? val.join(', ') : String(val);
                }
            }
        }

        if (req.type === 'file' && req.configPath) {
            const val = await window.dram.storage.get(req.configPath);
            if (val) {
                const raw = typeof val === 'string' ? val : JSON.stringify(val);
                state.filePayload = { raw, json: typeof val === 'object' ? val : null, fileName: 'Configured' };
                const status = overlay.querySelector('#file-status');
                if (status) status.textContent = 'File already configured';
            }
            if (Array.isArray(req.fields)) {
                for (const f of req.fields) {
                    const path = f.configPath || `channels.${pluginId}.${f.key}`;
                    const fieldVal = await window.dram.storage.get(path);
                    if (fieldVal !== undefined && fieldVal !== null) {
                        const input = overlay.querySelector(`input[data-key="${f.key}"]`);
                        if (input) input.value = String(fieldVal);
                    }
                }
            }
        }
    } catch (e) {
        console.error('Config Prefill Error', e);
    }
}

/**
 * Setup event listeners for the config dialog
 */
function setupEventListeners(overlay, req, pluginId, close, isClosed, state) {
    overlay.querySelector('#config-cancel')?.addEventListener('click', close);
    overlay.querySelector('#config-done')?.addEventListener('click', close);

    // Documentation link
    const docsLink = overlay.querySelector('#cli-docs-link');
    if (docsLink && req.docsUrl) {
        docsLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.dram.shell.openExternal(req.docsUrl);
        });
    }

    const genericDocsLink = overlay.querySelector('#config-docs-link');
    if (genericDocsLink && req.docsUrl) {
        genericDocsLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.dram.shell.openExternal(req.docsUrl);
        });
    }

    const oauthDocsLink = overlay.querySelector('#oauth-docs-link');
    if (oauthDocsLink && req.docsUrl) {
        oauthDocsLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.dram.shell.openExternal(req.docsUrl);
        });
    }

    // OAuth button
    const oauthBtn = overlay.querySelector('.oauth-btn');
    if (oauthBtn) {
        oauthBtn.addEventListener('click', async () => {
            const statusEl = overlay.querySelector('#oauth-status');
            oauthBtn.disabled = true;
            if (statusEl) statusEl.textContent = 'Starting OAuth...';
            try {
                const result = await window.dram.util.startOAuth(pluginId, req.provider);
                if (result?.success) {
                    if (statusEl) statusEl.textContent = 'Connected';
                    showToast({ message: 'OAuth connected', type: 'success' });
                    await setConfiguredFlag(pluginId, true);
                    updateConfiguredBadge(pluginId, true);
                } else {
                    if (statusEl) statusEl.textContent = result?.error || 'OAuth not available';
                    showToast({ message: result?.error || 'OAuth failed', type: 'error' });
                }
            } catch (err) {
                if (statusEl) statusEl.textContent = 'OAuth failed';
                showToast({ message: 'OAuth failed', type: 'error' });
                console.error(err);
            } finally {
                oauthBtn.disabled = false;
            }
        });
    }

    // QR Code button
    const qrBtn = overlay.querySelector('#generate-qr-btn');
    if (qrBtn) {
        qrBtn.addEventListener('click', async () => {
            const container = overlay.querySelector('#qr-container');
            const status = overlay.querySelector('#qr-status');
            qrBtn.disabled = true;
            qrBtn.textContent = 'Generating...';
            container.innerHTML = '<div class="qr-spinner"></div>';

            try {
                const result = await runQrLoginStart(pluginId, { force: true });
                const isSafeImage = result.qrDataUrl && (
                    result.qrDataUrl.startsWith('data:image/png') ||
                    result.qrDataUrl.startsWith('data:image/jpeg') ||
                    result.qrDataUrl.startsWith('data:image/jpg') ||
                    result.qrDataUrl.startsWith('data:image/webp') ||
                    result.qrDataUrl.startsWith('data:image/gif')
                );
                if (isSafeImage) {
                    container.innerHTML = `<img src="${result.qrDataUrl}" style="width: 100%; height: 100%; image-rendering: pixelated; display: block;">`;
                    status.textContent = 'Scan now...';
                    qrBtn.style.display = 'none';
                    pollQrLogin(status, container, qrBtn, close, isClosed, pluginId);
                } else {
                    status.textContent = result.message || 'Failed to start login';
                    status.style.color = '#F44336';
                    qrBtn.disabled = false;
                    qrBtn.textContent = 'Try Again';
                    container.innerHTML = '<span style="color: #666; font-size: 11px;">Error</span>';
                }
            } catch (e) {
                status.textContent = 'Failed to generate QR';
                status.style.color = '#F44336';
                qrBtn.disabled = false;
                qrBtn.textContent = 'Try Again';
                container.innerHTML = '<span style="color: #666; font-size: 11px;">Error</span>';
                console.error('WhatsApp Link Error', e);
            }
        });
    }

    // Save configuration
    overlay.querySelector('#config-save')?.addEventListener('click', async () => {
        try {
            if (req.type === 'token') {
                if (typeof req.configPath !== 'string' || !req.configPath.trim()) {
                    showToast({ message: 'Plugin config path is missing', type: 'error' });
                    return;
                }
                const val = overlay.querySelector('#config-token').value;
                await window.dram.storage.set(req.configPath, val);

                // Sync to Engine
                const patch = {};
                const parts = req.configPath.split('.');
                let current = patch;
                for (let i = 0; i < parts.length - 1; i++) {
                    current[parts[i]] = {};
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = val;
                await window.dram.gateway.patchConfig(patch);
                await setConfiguredFlag(pluginId, Boolean(val));
                updateConfiguredBadge(pluginId, Boolean(val));
            } else if (req.type === 'multi') {
                const multiPatch = {};
                for (const f of req.fields) {
                    const input = overlay.querySelector(`input[data-key="${f.key}"]`);
                    if (input) {
                        const val = input.value.trim();
                        if (!val && f.optional) continue;
                        if (!val && !f.optional) {
                            showToast({ message: `Missing value for ${f.label || f.key}`, type: 'error' });
                            return;
                        }
                        const parsed = parseFieldValue(f, val);
                        if (parsed === null) {
                            showToast({ message: `Invalid value for ${f.label || f.key}`, type: 'error' });
                            return;
                        }
                        const configPath = f.configPath || `channels.${pluginId}.${f.key}`;
                        await window.dram.storage.set(configPath, parsed);
                        setByPath(multiPatch, configPath, parsed);
                    }
                }
                if (Object.keys(multiPatch).length > 0) {
                    await window.dram.gateway.patchConfig(multiPatch);
                }
                await setConfiguredFlag(pluginId, true);
                updateConfiguredBadge(pluginId, true);
            } else if (req.type === 'file') {
                if (!state.filePayload || !state.filePayload.raw) {
                    showToast({ message: 'Please select a JSON file', type: 'error' });
                    return;
                }

                let json = state.filePayload.json;
                if (!json) {
                    try {
                        json = JSON.parse(state.filePayload.raw);
                    } catch {
                        showToast({ message: 'Invalid JSON file', type: 'error' });
                        return;
                    }
                }

                if (req.configPath) {
                    await window.dram.storage.set(req.configPath, JSON.stringify(json));
                    const patch = {};
                    setByPath(patch, req.configPath, json);
                    await window.dram.gateway.patchConfig(patch);
                }

                if (Array.isArray(req.fields)) {
                    const fieldPatch = {};
                    for (const f of req.fields) {
                        const input = overlay.querySelector(`input[data-key="${f.key}"]`);
                        if (input) {
                            const val = input.value.trim();
                            if (!val && f.optional) continue;
                            if (!val && !f.optional) {
                                showToast({ message: `Missing value for ${f.label || f.key}`, type: 'error' });
                                return;
                            }
                            const parsed = parseFieldValue(f, val);
                            if (parsed === null) {
                                showToast({ message: `Invalid value for ${f.label || f.key}`, type: 'error' });
                                return;
                            }
                            const configPath = f.configPath || `channels.${pluginId}.${f.key}`;
                            await window.dram.storage.set(configPath, parsed);
                            setByPath(fieldPatch, configPath, parsed);
                        }
                    }
                    if (Object.keys(fieldPatch).length > 0) {
                        await window.dram.gateway.patchConfig(fieldPatch);
                    }
                }
                await setConfiguredFlag(pluginId, true);
                updateConfiguredBadge(pluginId, true);
            }
            showToast({ message: 'Configuration saved & synced', type: 'success' });
            close();
        } catch (err) {
            showToast({ message: 'Failed to save configuration', type: 'error' });
            console.error(err);
        }
    });

    // CLI setup button
    const cliBtn = overlay.querySelector('#cli-run-btn');
    if (cliBtn) {
        cliBtn.addEventListener('click', async () => {
            const statusEl = overlay.querySelector('#cli-status');
            const command = cliBtn.dataset.cliCommand;
            if (!command) return;
            cliBtn.disabled = true;
            if (statusEl) statusEl.textContent = 'Launching setup...';
            try {
                const result = await window.dram.shell.executeCLI(command);
                if (result?.ok) {
                    if (statusEl) statusEl.textContent = 'Setup command launched.';
                    showToast({ message: 'Setup command launched', type: 'success' });
                } else {
                    if (statusEl) statusEl.textContent = result?.error || 'Command blocked';
                    showToast({ message: result?.error || 'Command blocked', type: 'error' });
                }
            } catch (err) {
                if (statusEl) statusEl.textContent = 'Failed to launch setup';
                showToast({ message: 'Failed to launch setup', type: 'error' });
                console.error(err);
            } finally {
                cliBtn.disabled = false;
            }
        });
    }

    // File upload handler
    const fileBtn = overlay.querySelector('.file-upload-btn');
    if (fileBtn) {
        fileBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';
            input.addEventListener('change', async () => {
                const file = input.files && input.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const json = JSON.parse(text);
                    state.filePayload = { raw: text, json, fileName: file.name };
                    const status = overlay.querySelector('#file-status');
                    if (status) status.textContent = `Selected: ${file.name}`;
                } catch (err) {
                    showToast({ message: 'Invalid JSON file', type: 'error' });
                    console.error(err);
                }
            });
            input.click();
        });
    }
}

/**
 * Poll for WhatsApp login status
 */
async function pollQrLogin(statusDiv, containerDiv, qrBtn, close, isClosed, pluginId = 'whatsapp') {
    while (!isClosed) {
        try {
            const result = await runQrLoginWait(pluginId, { timeoutMs: 5000 });
            if (isClosed) return;

            if (result.connected) {
                statusDiv.textContent = '✅ Linked!';
                statusDiv.style.color = '#4CAF50';
                containerDiv.innerHTML = '<div style="font-size: 64px;">✅</div>';
                showToast({ message: 'Account linked successfully', type: 'success' });
                await setConfiguredFlag(pluginId, true);
                updateConfiguredBadge(pluginId, true);
                setTimeout(close, 2000);
                return;
            }

            const message = result?.message ? String(result.message) : '';
            if (message) {
                statusDiv.textContent = message;
            }
            const isPending = message && /waiting|pending|scan/i.test(message.toLowerCase());
            if (message && !isPending) {
                statusDiv.style.color = '#F44336';
                if (qrBtn) {
                    qrBtn.style.display = 'block';
                    qrBtn.disabled = false;
                    qrBtn.textContent = 'Retry Linking';
                }
                return;
            }
        } catch (e) {
            if (!isClosed) {
                statusDiv.textContent = 'Polling error';
                console.error(e);
            }
            return;
        }
    }
}
