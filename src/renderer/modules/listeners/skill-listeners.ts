/**
 * DRAM Listeners - Skill Management
 * Handles skill toggling and plugin configuration
 */
import { showConfirmDialog, showToast } from '../../components/dialog.js';
import { promptPluginConfig } from './plugin-config.js';
import {
    refreshSkillsList,
    normalizeSetupMessage,
    tryEnableSkillWithAutoSetup
} from './skill-setup-flow.js';

let skillListenersRegistered = false;
export function setupSkillListeners() {
    if (skillListenersRegistered) return;
    skillListenersRegistered = true;

    document.addEventListener('click', async (e) => {
        // Handle Skills (toggle via card or switch)
        const skillCard = e.target.closest('.plugin-card[data-skill-id]');
        if (skillCard) {
            const skillId = skillCard.dataset.skillId;
            const toggle = skillCard.querySelector('.skill-toggle');
            const trustBtn = e.target.closest('.skill-trust-btn');

            if (trustBtn) {
                const nextTrust = String(trustBtn.dataset.nextTrust || '').trim().toLowerCase();
                if (!nextTrust) return;

                const confirmed = await showConfirmDialog({
                    title: nextTrust === 'blocked' ? 'Block Skill' : 'Trust Skill',
                    message: `${nextTrust === 'blocked' ? 'Block' : 'Trust'} skill "${skillId}"?`,
                    detail: nextTrust === 'blocked'
                        ? 'Blocked skills cannot be enabled until unblocked.'
                        : 'Trusted skills can be enabled without additional confirmation.',
                    type: nextTrust === 'blocked' ? 'warning' : 'info',
                    confirmText: nextTrust === 'blocked' ? 'Block' : 'Trust',
                    cancelText: 'Cancel'
                });
                if (!confirmed) return;

                const originalText = trustBtn.textContent;
                trustBtn.disabled = true;
                trustBtn.textContent = 'Saving...';
                try {
                    const result = await window.dram.util.setSkillTrust(skillId, nextTrust);
                    if (!result?.ok) {
                        throw new Error(result?.error || 'Failed to update skill trust');
                    }
                    await refreshSkillsList();
                    showToast({ message: `Skill "${skillId}" is now ${nextTrust}`, type: 'success' });
                } catch (err) {
                    console.error('Skill trust update error:', err);
                    showToast({ message: err?.message || 'Failed to update skill trust', type: 'error' });
                } finally {
                    trustBtn.disabled = false;
                    trustBtn.textContent = originalText || 'Trust';
                }
                return;
            }

            // Explicitly ignore buttons (like update/config)
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

            if (toggle && !toggle.disabled) {
                // Check if click was on the switch/label itself (browser handles toggle)
                const isSwitchClick = e.target === toggle || e.target.closest('.switch');

                // If clicked card body, manually invert
                if (!isSwitchClick) {
                    toggle.checked = !toggle.checked;
                }

                const enabled = toggle.checked;
                const trustStatus = String(toggle.dataset.trustStatus || skillCard.dataset.trustStatus || 'trusted').trim().toLowerCase();
                const skillEligible = String(skillCard.dataset.skillEligible || '').trim().toLowerCase() !== 'false';
                if (enabled && trustStatus === 'blocked') {
                    toggle.checked = false;
                    showToast({ message: 'Skill is blocked by vetting policy', type: 'error' });
                    return;
                }

                if (enabled && trustStatus === 'untrusted') {
                    const trustNow = await showConfirmDialog({
                        title: 'Untrusted Skill',
                        message: `Skill "${skillId}" is untrusted.`,
                        detail: 'Trust this skill before enabling it?',
                        type: 'warning',
                        confirmText: 'Trust and Enable',
                        cancelText: 'Cancel'
                    });
                    if (!trustNow) {
                        toggle.checked = false;
                        return;
                    }
                    const trustResult = await window.dram.util.setSkillTrust(skillId, 'trusted');
                    if (!trustResult?.ok) {
                        toggle.checked = false;
                        throw new Error(trustResult?.error || 'Failed to trust skill');
                    }
                }

                const statusEl = skillCard.querySelector('.plugin-status');

                if (enabled && !skillEligible) {
                    toggle.checked = false;
                    toggle.disabled = true;
                    skillCard.classList.remove('active');
                    if (statusEl) {
                        statusEl.textContent = 'SETUP IN PROGRESS';
                        statusEl.className = 'plugin-status setup-progress';
                    }

                    try {
                        const directEnable = await window.dram.util.toggleSkill(skillId, true);
                        if (directEnable?.success) {
                            await refreshSkillsList({ force: true });
                            showToast({ message: 'Skill enabled', type: 'success' });
                            return;
                        }

                        const directEnableError = normalizeSetupMessage(directEnable?.error || '');
                        const shouldRunSetupFlow = /requires setup|missing runtime requirements|ineligible|setup/i.test(directEnableError);
                        if (!shouldRunSetupFlow) {
                            showToast({ message: directEnableError || 'Failed to enable skill', type: 'error' });
                            return;
                        }

                        const autoResult = await tryEnableSkillWithAutoSetup(skillId);
                        await refreshSkillsList({ force: true });
                        if (autoResult.ok) {
                            showToast({ message: 'Skill enabled after setup', type: 'success' });
                            return;
                        }

                        if (autoResult.error) {
                            showToast({ message: normalizeSetupMessage(autoResult.error), type: 'warning' });
                        } else {
                            showToast({ message: 'Skill setup did not complete', type: 'warning' });
                        }
                    } catch (setupErr) {
                        console.error('Skill auto-setup error:', setupErr);
                        showToast({ message: normalizeSetupMessage(setupErr?.message || 'Skill setup failed'), type: 'error' });
                    } finally {
                        if (toggle.isConnected) toggle.disabled = false;
                        if (skillCard.isConnected) skillCard.classList.remove('setup-in-progress');
                    }
                    return;
                }

                // Optimistic UI Update
                skillCard.classList.toggle('active', enabled);
                if (statusEl) {
                    statusEl.textContent = enabled ? 'ENABLED' : 'DISABLED';
                    statusEl.className = `plugin-status ${enabled ? 'enabled' : 'disabled'}`;
                }

                try {
                    const result = await window.dram.util.toggleSkill(skillId, enabled);
                    if (result.success) {
                        await refreshSkillsList();
                        showToast({ message: `Skill ${enabled ? 'enabled' : 'disabled'}`, type: 'success' });
                    } else {
                        throw new Error(result.error || 'Failed to toggle skill');
                    }
                } catch (err) {
                    const errMessage = normalizeSetupMessage(err?.message || 'Failed to toggle skill');
                    let handledWithSetupFlow = false;
                    if (enabled && /requires setup|missing runtime requirements|ineligible/i.test(String(errMessage))) {
                        try {
                            const autoResult = await tryEnableSkillWithAutoSetup(skillId);
                            if (autoResult.ok) {
                                await refreshSkillsList();
                                showToast({ message: 'Skill enabled after setup', type: 'success' });
                                return;
                            }
                            if (autoResult.error) {
                                showToast({ message: normalizeSetupMessage(autoResult.error), type: 'warning' });
                                handledWithSetupFlow = true;
                            }
                        } catch (setupErr) {
                            console.error('Skill auto-setup error:', setupErr);
                            showToast({ message: normalizeSetupMessage(setupErr?.message || 'Skill setup failed'), type: 'error' });
                            handledWithSetupFlow = true;
                        }
                    }

                    // Revert on failure
                    toggle.checked = !enabled;
                    skillCard.classList.toggle('active', !enabled);
                    if (statusEl) {
                        statusEl.textContent = !enabled ? 'ENABLED' : 'DISABLED';
                        statusEl.className = `plugin-status ${!enabled ? 'enabled' : 'disabled'}`;
                    }
                    if (!handledWithSetupFlow) {
                        showToast({ message: errMessage, type: 'error' });
                    }
                }
            }
            return;
        }

        // Add Channel button (redirects to connections tab)
        if (e.target.id === 'btn-add-channel') {
            const connectionsTab = document.querySelector('.dashboard-nav-item[data-tab="tab-connections"]');
            if (connectionsTab) {
                connectionsTab.click();
                showToast({ message: 'Open Connections to manage channels and devices', type: 'info' });
            }
        }

        const repairBtn = e.target.closest('.plugin-repair-btn');
        if (repairBtn) {
            const pluginId = repairBtn.dataset.pluginId;
            if (!pluginId) return;

            const originalText = repairBtn.textContent;
            repairBtn.disabled = true;
            repairBtn.textContent = 'Repairing...';
            try {
                const result = await window.dram.util.repairPlugin(pluginId);
                if (!result?.ok) {
                    throw new Error(result?.error || 'Repair failed');
                }

                showToast({ message: result.message || 'Plugin repaired', type: 'success' });

                const plugins = await window.dram.util.getPlugins();
                if (Array.isArray(plugins)) {
                    const { updatePluginsList } = await import('../../components/settings/tabs/plugins.js');
                    await updatePluginsList(plugins);
                }
            } catch (err) {
                console.error('Plugin repair error:', err);
                showToast({ message: err?.message || 'Failed to repair plugin', type: 'error' });
            } finally {
                repairBtn.disabled = false;
                repairBtn.textContent = originalText || 'Repair';
            }
            return;
        }

        // Plugin configuration button
        if (e.target.classList.contains('plugin-config-btn')) {
            const pluginId = e.target.dataset.pluginId;
            await promptPluginConfig(pluginId);
        }

        const installBtn = e.target.closest('.plugin-install-btn');
        if (installBtn) {
            const command = installBtn.dataset.installCommand;
            if (!command) return;
            const originalText = installBtn.textContent;
            installBtn.disabled = true;
            installBtn.textContent = 'Installing...';
            try {
                const approved = await showConfirmDialog({
                    title: 'Run Installer',
                    message: 'This plugin needs a setup command to run.',
                    detail: `Command: ${command}`,
                    type: 'info',
                    confirmText: 'Run',
                    cancelText: 'Cancel'
                });
                if (!approved) {
                    showToast({ message: 'Install cancelled', type: 'info' });
                    return;
                }
                const result = await window.dram.shell.executeCLI(command, {
                    keepOpen: true,
                    usePowerShell: true,
                    uiConfirmed: true
                });
                if (result?.ok) {
                    showToast({ message: 'Installer launched', type: 'success' });
                } else {
                    showToast({ message: result?.error || 'Install blocked', type: 'error' });
                }
            } catch (err) {
                console.error('Plugin install error:', err);
                showToast({ message: 'Failed to launch installer', type: 'error' });
            } finally {
                installBtn.disabled = false;
                installBtn.textContent = originalText || 'Install';
            }
        }
    });
}







