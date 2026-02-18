import { showToast } from '../../components/dialog.js';
import { escapeHtml } from '../utils.js';

export const setByPath = (obj, path, value) => {
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

export const parseFieldValue = (field, raw) => {
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
            .map((item) => item.trim())
            .filter(Boolean);
        if (items.length === 0) return null;
        return items;
    }
    return raw;
};

export const runQrLoginStart = async (_pluginId, options = {}) => {
    const start = window.dram?.util?.webLoginStart || window.dram?.util?.whatsappStartLogin;
    if (!start) {
        return { message: 'QR login is not available in this build.' };
    }
    return start({ ...options });
};

export const runQrLoginWait = async (_pluginId, options = {}) => {
    const wait = window.dram?.util?.webLoginWait || window.dram?.util?.whatsappPollLogin;
    if (!wait) {
        return { connected: false, message: 'QR login is not available in this build.' };
    }
    return wait({ ...options });
};

export const setConfiguredFlag = async (pluginId, configured) => {
    if (!pluginId) return;
    try {
        await window.dram.storage.set(`plugins.configured.${pluginId}`, configured === true);
    } catch (err) {
        console.error('Failed to store plugin configured flag', err);
    }
};

export const updateConfiguredBadge = (pluginId, configured) => {
    const card = document.querySelector(`.plugin-card[data-plugin-id="${pluginId}"]`);
    if (!card) return;
    const configBtn = card.querySelector('.plugin-config-btn');
    if (configBtn) {
        configBtn.textContent = configured ? 'Configured' : 'Configure';
        configBtn.classList.toggle('configured', configured);
        configBtn.title = configured ? 'Configured - click to reconfigure' : 'Configure this plugin';
    }
};

export function buildConfigContent(req, _pluginId) {
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
        return req.fields.map((field) => `
            <div class="input-group" style="flex-direction: column; gap: 8px; margin-bottom: 12px;">
                <label class="setting-label">${escapeHtml(field.label)}</label>
                <input type="${field.isSecret ? 'password' : 'text'}" 
                       class="mono-input config-field" 
                       data-key="${escapeHtml(field.key)}"
                       placeholder="${escapeHtml(field.placeholder)}">
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
            ? req.fields.map((field) => `
                <div class="input-group" style="flex-direction: column; gap: 8px; margin-bottom: 12px;">
                    <label class="setting-label">${escapeHtml(field.label)}</label>
                    <input type="${field.isSecret ? 'password' : 'text'}"
                           class="mono-input config-field"
                           data-key="${escapeHtml(field.key)}"
                           placeholder="${escapeHtml(field.placeholder || '')}">
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

export function buildActionButtons(req) {
    if (req.type === 'token' || req.type === 'multi' || req.type === 'file') {
        return '<button class="tactile-btn primary" id="config-save">Save Configuration</button>';
    }
    return '<button class="tactile-btn primary" id="config-done">Done</button>';
}

export async function prefillConfigValues(overlay, req, pluginId, state) {
    try {
        if (req.type === 'token' && req.configPath) {
            const val = await window.dram.storage.get(req.configPath);
            if (val) {
                const input = overlay.querySelector('#config-token');
                if (input) input.value = val;
            }
        }

        if (req.type === 'multi') {
            for (const field of req.fields) {
                const path = field.configPath || `channels.${pluginId}.${field.key}`;
                const val = await window.dram.storage.get(path);
                if (val !== undefined && val !== null) {
                    const input = overlay.querySelector(`input[data-key="${field.key}"]`);
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
                for (const field of req.fields) {
                    const path = field.configPath || `channels.${pluginId}.${field.key}`;
                    const fieldVal = await window.dram.storage.get(path);
                    if (fieldVal !== undefined && fieldVal !== null) {
                        const input = overlay.querySelector(`input[data-key="${field.key}"]`);
                        if (input) input.value = String(fieldVal);
                    }
                }
            }
        }
    } catch (e) {
        console.error('Config Prefill Error', e);
    }
}

export async function pollQrLogin(
    statusDiv,
    containerDiv,
    qrBtn,
    close,
    lifecycle,
    pluginId = 'whatsapp'
) {
    while (!lifecycle.isClosed) {
        try {
            const result = await runQrLoginWait(pluginId, { timeoutMs: 5000 });
            if (lifecycle.isClosed) return;

            if (result.connected) {
                statusDiv.textContent = '[OK] Linked!';
                statusDiv.style.color = '#4CAF50';
                containerDiv.innerHTML = '<div style="font-size: 40px;">OK</div>';
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
            if (!lifecycle.isClosed) {
                statusDiv.textContent = 'Polling error';
                console.error(e);
            }
            return;
        }
    }
}







