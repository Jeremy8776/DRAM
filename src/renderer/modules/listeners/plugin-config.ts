/**
 * DRAM Plugin Configuration Dialog
 * Handles plugin setup dialogs (token, multi-field, external, QR code)
 */
import { showConfirmDialog, showToast } from '../../components/dialog.js';
import { escapeHtml } from '../utils.js';
import {
    buildActionButtons,
    buildConfigContent,
    parseFieldValue,
    pollQrLogin,
    prefillConfigValues,
    runQrLoginStart,
    setByPath,
    setConfiguredFlag,
    updateConfiguredBadge
} from './plugin-config-helpers.js';

/**
 * Configure Plugin Modal
 * @param {string} pluginId - Plugin identifier
 */
export async function promptPluginConfig(pluginId) {
    const { PLUGIN_SETUP_REQUIREMENTS } = await import('../../data/plugin-metadata.js');
    const req = PLUGIN_SETUP_REQUIREMENTS[pluginId];
    if (!req) return;

    return new Promise<void>((resolve) => {
        const state = { filePayload: null };
        const lifecycle = { isClosed: false };
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(8, 6, 14, 0.62);
            backdrop-filter: blur(3px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const contentHtml = buildConfigContent(req, pluginId);
        const actionButtons = buildActionButtons(req);

        overlay.innerHTML = `
            <div class="modal" style="max-width: 500px; width: 90%; background: var(--bg-elevated, #111114); border: 1px solid color-mix(in srgb, var(--accent, #7c3aed) 45%, var(--border, #333)); padding: 22px 24px; border-radius: 6px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.36);">
                <h3 style="margin-top: 0; margin-bottom: 16px;">Configure ${escapeHtml(pluginId)}</h3>
                ${contentHtml}
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                    <button class="tactile-btn secondary" id="config-cancel">Cancel</button>
                    ${actionButtons}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        prefillConfigValues(overlay, req, pluginId, state);

        const close = () => {
            lifecycle.isClosed = true;
            overlay.remove();
            resolve();
        };

        setupEventListeners(overlay, req, pluginId, close, lifecycle, state);
    });
}

/**
 * Setup event listeners for the config dialog
 */
function setupEventListeners(overlay, req, pluginId, close, lifecycle, state) {
    overlay.querySelector('#config-cancel')?.addEventListener('click', close);
    overlay.querySelector('#config-done')?.addEventListener('click', close);

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
                    pollQrLogin(status, container, qrBtn, close, lifecycle, pluginId);
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

    overlay.querySelector('#config-save')?.addEventListener('click', async () => {
        try {
            if (req.type === 'token') {
                if (typeof req.configPath !== 'string' || !req.configPath.trim()) {
                    showToast({ message: 'Plugin config path is missing', type: 'error' });
                    return;
                }
                const val = overlay.querySelector('#config-token').value;
                await window.dram.storage.set(req.configPath, val);

                const patch = {};
                setByPath(patch, req.configPath, val);
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

    const cliBtn = overlay.querySelector('#cli-run-btn');
    if (cliBtn) {
        cliBtn.addEventListener('click', async () => {
            const statusEl = overlay.querySelector('#cli-status');
            const command = cliBtn.dataset.cliCommand;
            if (!command) return;
            cliBtn.disabled = true;
            if (statusEl) statusEl.textContent = 'Launching setup...';
            try {
                const approved = await showConfirmDialog({
                    title: 'Run Setup Command',
                    message: `Run setup for ${pluginId}?`,
                    detail: `Command: ${command}`,
                    type: 'info',
                    confirmText: 'Run',
                    cancelText: 'Cancel'
                });
                if (!approved) {
                    if (statusEl) statusEl.textContent = 'Setup cancelled.';
                    showToast({ message: 'Setup cancelled', type: 'info' });
                    return;
                }

                const result = await window.dram.shell.executeCLI(command, {
                    keepOpen: true,
                    usePowerShell: true,
                    uiConfirmed: true
                });
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







