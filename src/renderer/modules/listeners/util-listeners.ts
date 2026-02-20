/**
 * DRAM Listeners - Utilities
 */
import { elements } from '../elements.js';
import { addSystemMessage } from '../utils.js';
import { humanizeError } from '../errors.js';
import { updateMemoryResults } from '../../components/settings.js';
import { showConfirmDialog, showToast } from '../../components/dialog.js';

export function setupUtilListeners(on) {
    void on;
    // ===== Plugin Card Click Handler =====
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.plugin-card');
        if (!card) return;

        // Check if this card belongs to a plugin (has plugin-toggle)
        // (Skills have skill-toggle and are handled elsewhere)
        const toggle = card.querySelector('.plugin-toggle');
        if (!toggle) return;

        // Ignore buttons/inputs that aren't the main toggle
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        if (e.target.tagName === 'INPUT' && e.target !== toggle) return;
        if (e.target.closest('.wizard-modal')) return; // Wizard handled separately

        // Check if we clicked the switch itself
        const isSwitch = e.target === toggle || e.target.closest('.switch');

        if (!isSwitch) {
            toggle.checked = !toggle.checked;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    document.addEventListener('click', async (e) => {
        const trustBtn = e.target.closest('.plugin-trust-btn');
        if (!trustBtn) return;
        if (trustBtn.closest('.wizard-modal')) return;

        const pluginId = trustBtn.dataset.pluginId;
        const nextTrust = String(trustBtn.dataset.nextTrust || '').trim().toLowerCase();
        if (!pluginId || !nextTrust) return;

        const actionLabel = nextTrust === 'blocked' ? 'block' : 'trust';
        const confirmed = await showConfirmDialog({
            type: nextTrust === 'blocked' ? 'warning' : 'info',
            title: nextTrust === 'blocked' ? 'Block Plugin' : 'Trust Plugin',
            message: `${nextTrust === 'blocked' ? 'Block' : 'Trust'} plugin "${pluginId}"?`,
            detail: nextTrust === 'blocked'
                ? 'Blocked plugins cannot be enabled until unblocked.'
                : 'Trusted plugins can be enabled without additional confirmation.',
            confirmText: actionLabel[0].toUpperCase() + actionLabel.slice(1),
            cancelText: 'Cancel'
        });
        if (!confirmed) return;

        const originalText = trustBtn.textContent;
        trustBtn.disabled = true;
        trustBtn.textContent = 'Saving...';
        try {
            const result = await window.dram.util.setPluginTrust(pluginId, nextTrust);
            if (!result?.ok) {
                throw new Error(result?.error || 'Failed to update plugin trust');
            }
            const plugins = await window.dram.util.getPlugins();
            if (Array.isArray(plugins)) {
                const { updatePluginsList } = await import('../../components/settings/tabs/plugins.js');
                await updatePluginsList(plugins);
            }
            showToast({ message: `Plugin "${pluginId}" is now ${nextTrust}`, type: 'success' });
        } catch (err) {
            console.error('Plugin trust update error:', err);
            showToast({ message: humanizeError(err), type: 'error' });
        } finally {
            trustBtn.disabled = false;
            trustBtn.textContent = originalText || 'Trust';
        }
    });

    // ===== Plugin Toggle Handlers =====
    document.addEventListener('change', async (e) => {
        if (e.target.classList.contains('plugin-toggle')) {
            // IGNORE if we are in the wizard. The wizard handles its own state.
            if (e.target.closest('.wizard-modal')) return;

            const pluginId = e.target.dataset.pluginId || e.target.dataset.id;
            const pluginName = e.target.dataset.pluginName || pluginId;
            const enabled = e.target.checked;
            const card = e.target.closest('.plugin-card');
            const statusEl = card?.querySelector('.plugin-status');
            const trustStatus = String(
                e.target.dataset.trustStatus
                || card?.dataset?.trustStatus
                || 'trusted'
            ).trim().toLowerCase();

            if (enabled && trustStatus === 'blocked') {
                e.target.checked = false;
                showToast({ message: `Plugin "${pluginName}" is blocked`, type: 'error' });
                return;
            }

            if (enabled && trustStatus === 'untrusted') {
                const trustNow = await showConfirmDialog({
                    type: 'warning',
                    title: 'Untrusted Plugin',
                    message: `Plugin "${pluginName}" is untrusted.`,
                    detail: 'Trust this plugin before enabling it?',
                    confirmText: 'Trust and Enable',
                    cancelText: 'Cancel'
                });
                if (!trustNow) {
                    e.target.checked = false;
                    return;
                }
                const trustResult = await window.dram.util.setPluginTrust(pluginId, 'trusted');
                if (!trustResult?.ok) {
                    e.target.checked = false;
                    throw new Error(trustResult?.error || 'Failed to trust plugin');
                }
            }

            // Optimistic UI Update
            if (card) card.classList.toggle('active', enabled);
            if (statusEl) {
                statusEl.textContent = enabled ? 'ENABLED' : 'DISABLED';
                statusEl.className = `plugin-status ${enabled ? 'enabled' : 'disabled'}`;
            }

            try {
                const parseIssue = (issue) => {
                    if (!issue) return '';
                    if (typeof issue === 'string') return issue;
                    return issue.message || issue.path || JSON.stringify(issue);
                };

                if (enabled) {
                    const result = await window.dram.util.enablePlugin(pluginId);
                    if (!result?.ok) {
                        const issueText = Array.isArray(result?.issues) && result.issues.length > 0
                            ? ` (${result.issues.map(parseIssue).filter(Boolean).join('; ')})`
                            : '';
                        throw new Error((result?.error || 'Failed to enable plugin') + issueText);
                    }
                    showToast({ message: `Plugin "${pluginName}" enabled`, type: 'success' });
                } else {
                    const result = await window.dram.util.disablePlugin(pluginId);
                    if (!result?.ok) {
                        throw new Error(result?.error || 'Failed to disable plugin');
                    }
                    showToast({ message: `Plugin "${pluginName}" disabled`, type: 'warning' });
                }

                // Refresh plugin list to apply sorting (enabled first)
                try {
                    const plugins = await window.dram.util.getPlugins();
                    if (plugins && plugins.length > 0) {
                        const current = plugins.find(p => p.id === pluginId);
                        if (current) {
                            current.enabled = enabled;
                            current.status = enabled ? 'enabled' : 'disabled';
                        }
                        const { updatePluginsList } = await import('../../components/settings/tabs/plugins.js');
                        await updatePluginsList(plugins);
                    }
                } catch (refreshErr) {
                    console.warn('Failed to refresh plugin list after toggle:', refreshErr);
                }
            } catch (err) {
                console.error('Plugin toggle error:', err);
                // Revert on failure
                e.target.checked = !enabled;
                if (card) card.classList.toggle('active', !enabled);
                if (statusEl) {
                    statusEl.textContent = !enabled ? 'ENABLED' : 'DISABLED';
                    statusEl.className = `plugin-status ${!enabled ? 'enabled' : 'disabled'}`;
                }
                addSystemMessage(elements, humanizeError(err));
                showToast({ message: humanizeError(err), type: 'error' });
            }
        }
    });

    // ===== Device Action Handlers =====
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-approve, .btn-reject, .btn-unpair');
        if (!btn || e.target.closest('.wizard-modal')) return;

        const deviceId = btn.dataset.deviceId;
        const deviceName = btn.dataset.deviceName || deviceId;
        const card = btn.closest('.device-card, .plugin-card');

        try {
            if (btn.classList.contains('btn-approve')) {
                await window.dram.util.approveDevice(deviceId);
                showToast({ message: `Device "${deviceName}" approved`, type: 'success' });
            }
            else if (btn.classList.contains('btn-reject')) {
                const confirmed = await showConfirmDialog({
                    type: 'warning',
                    title: 'Reject Device',
                    message: `Reject device "${deviceName}"?`,
                    detail: 'This device will need to re-pair to connect again.',
                    confirmText: 'Reject',
                    cancelText: 'Cancel'
                });
                if (!confirmed) return;
                await window.dram.util.rejectDevice(deviceId);
                showToast({ message: `Device "${deviceName}" rejected`, type: 'warning' });
            }
            else if (btn.classList.contains('btn-unpair')) {
                const confirmed = await showConfirmDialog({
                    type: 'danger',
                    title: 'Unpair Device',
                    message: `Unpair device "${deviceName}"?`,
                    detail: 'This will permanently revoke access for this device.',
                    confirmText: 'Unpair',
                    cancelText: 'Cancel'
                });
                if (!confirmed) return;
                await window.dram.util.unpairDevice(deviceId);
                showToast({ message: `Device "${deviceName}" unpaired`, type: 'success' });
            }

            if (card) card.remove();
            const grid = document.getElementById('device-registry');
            if (grid && grid.children.length === 0) {
                grid.innerHTML = '<div class="empty-state"><div class="empty-state-title">No devices</div></div>';
            }
        } catch (err) {
            console.error('Device action error:', err);
            addSystemMessage(elements, humanizeError(err));
            showToast({ message: humanizeError(err), type: 'error' });
        }
    });



    // ===== Cron Toggle Handlers =====
    document.addEventListener('change', async (e) => {
        if (e.target.classList.contains('cron-toggle')) {
            if (e.target.closest('.wizard-modal')) return;
            const jobId = e.target.dataset.jobId;
            const jobName = e.target.closest('.cron-item')?.querySelector('.cron-name')?.textContent || jobId;
            const enabled = e.target.checked;
            try {
                await window.dram.util.toggleCronJob(jobId, enabled);
                showToast({
                    message: `Cron job "${jobName}" ${enabled ? 'enabled' : 'disabled'}`,
                    type: enabled ? 'success' : 'warning'
                });
            } catch (err) {
                console.error('Cron toggle error:', err);
                e.target.checked = !enabled;
                addSystemMessage(elements, humanizeError(err));
                showToast({ message: humanizeError(err), type: 'error' });
            }
        }
    });

    // ===== Log Streaming Handlers =====
    let logCleanup = null;
    const MAX_LOG_LINES = 1000;

    const updateLogStreamUi = (running, label = running ? 'Streaming' : 'Stopped') => {
        const btnStartLogs = document.getElementById('btn-start-logs');
        const btnStopLogs = document.getElementById('btn-stop-logs');
        const status = document.getElementById('log-status');
        if (btnStartLogs) btnStartLogs.disabled = running;
        if (btnStopLogs) btnStopLogs.disabled = !running;
        if (!status) return;

        const spans = status.querySelectorAll('span');
        const indicator = spans[0];
        const textNode = spans[1];
        if (indicator) {
            indicator.style.background = running ? 'var(--success, #22c55e)' : 'var(--text-tertiary)';
        }
        if (textNode) {
            textNode.textContent = label;
        }
    };

    const appendLogLine = (data) => {
        const logOutput = document.getElementById('log-output');
        if (!logOutput) return;
        const text = String(data ?? '');
        const lowered = text.toLowerCase();
        const line = document.createElement('div');
        line.className = 'log-line ' + (lowered.includes('error') ? 'error' : lowered.includes('warn') ? 'warn' : 'info');
        line.textContent = text;
        logOutput.appendChild(line);

        while (logOutput.children.length > MAX_LOG_LINES) {
            logOutput.removeChild(logOutput.firstChild);
        }
        logOutput.scrollTop = logOutput.scrollHeight;
    };

    const startLogStream = async () => {
        if (logCleanup) return;
        const logOutput = document.getElementById('log-output');
        if (logOutput) logOutput.innerHTML = '';
        updateLogStreamUi(true, 'Starting...');

        logCleanup = window.dram.util.onLogData(appendLogLine);
        try {
            await window.dram.util.startLogStream();
            updateLogStreamUi(true, 'Streaming');
        } catch (err) {
            console.error('Start log stream error:', err);
            if (logCleanup) {
                logCleanup();
                logCleanup = null;
            }
            updateLogStreamUi(false, 'Error');
            throw err;
        }
    };

    const stopLogStream = async () => {
        try {
            await window.dram.util.stopLogStream();
        } catch (err) {
            console.error('Stop log stream error:', err);
        } finally {
            if (logCleanup) {
                logCleanup();
                logCleanup = null;
            }
            updateLogStreamUi(false, 'Stopped');
        }
    };

    document.addEventListener('click', async (e) => {
        if (e.target.closest('#btn-start-logs')) {
            try {
                await startLogStream();
            } catch {
                showToast({ message: 'Failed to start log stream', type: 'error' });
            }
            return;
        }
        if (e.target.closest('#btn-stop-logs')) {
            await stopLogStream();
            return;
        }
        if (e.target.closest('#btn-clear-logs')) {
            const logOutput = document.getElementById('log-output');
            if (logOutput) {
                logOutput.innerHTML = '';
            }
        }
    });

    // ===== Memory Search Handler =====
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-memory-search') {
            const input = document.getElementById('memory-search-input');
            const query = input?.value?.trim();
            if (!query) return;
            try {
                showToast({ message: 'Searching memory index...', type: 'info' });
                const results = await window.dram.util.searchMemory(query);
                updateMemoryResults(results);
            } catch (err) {
                console.error('Memory search error:', err);
                showToast({ message: 'Search failed', type: 'error' });
            }
        }
    });

    // ===== Health Diagnostic Handler =====
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-run-doctor') {
            try {
                showToast({ message: 'Running diagnostics...', type: 'info' });
                const checks = await window.dram.util.runDoctor();
                const { renderHealthDiagnostics } = await import('../../components/settings/tabs/health.js');
                const container = document.getElementById('health-diagnostics-container');
                if (container) {
                    container.innerHTML = renderHealthDiagnostics(checks);
                }
                showToast({ message: 'Diagnostics complete', type: 'success' });
            } catch (err) {
                console.error('Doctor run error:', err);
                showToast({ message: 'Diagnostics failed', type: 'error' });
            }
        }
    });

    // ===== Fallback Chain Handlers =====
    const fallbackLabel = (modelId) => {
        const value = String(modelId || '').trim();
        if (!value) return 'unknown';
        if (!value.includes('/')) return value;
        const parts = value.split('/');
        return parts[1] || value;
    };

    document.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-add-fallback') {
            const select = document.getElementById('fallback-model-select');
            const modelId = select?.value;
            if (!modelId) {
                const { showFallbackStatus } = await import('../../components/settings/tabs/fallbacks.js');
                showFallbackStatus('Please select a model first', 'warning');
                return;
            }

            const { addFallbackRow, showFallbackStatus } = await import('../../components/settings/tabs/fallbacks.js');
            const list = document.getElementById('fallback-list');
            const index = list?.querySelectorAll('.fallback-row').length || 0;

            addFallbackRow(modelId, index);
            await saveFallbackChain();

            // Reset select
            if (select) select.value = '';
            showFallbackStatus(`${fallbackLabel(modelId)} added to fallback chain`, 'success');
        }
    });

    // Handle remove button clicks via event delegation
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('fallback-btn') && e.target.classList.contains('remove')) {
            const row = e.target.closest('.fallback-row');
            if (row) {
                const modelId = row.dataset.modelId;
                const { removeFallbackRow, showFallbackStatus } = await import('../../components/settings/tabs/fallbacks.js');
                removeFallbackRow(row);
                await saveFallbackChain();
                if (modelId) {
                    showFallbackStatus(`${fallbackLabel(modelId)} removed from fallback chain`, 'info');
                }
            }
        }
    });

    async function saveFallbackChain() {
        const list = document.getElementById('fallback-list');
        const rows = list?.querySelectorAll('.fallback-row') || [];
        const chain = Array.from(rows).map(r => r.dataset.modelId);

        // Save to local storage for UI
        await window.dram.storage.set('settings.fallbackChain', chain);

        // Sync to engine config (the important part!)
        try {
            const result = await window.dram.gateway.saveFallbackChain(chain);
            if (!result.success) {
                console.error('Failed to sync fallback chain to engine:', result.error);
            } else {
                console.log('Fallback chain synced to engine:', result.fallbacks);
            }
        } catch (err) {
            console.error('Error syncing fallback chain:', err);
        }
    }
}






