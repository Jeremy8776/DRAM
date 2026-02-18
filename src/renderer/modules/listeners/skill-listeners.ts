/**
 * DRAM Listeners - Skill Management
 * Handles skill toggling and plugin configuration
 */
import { showToast } from '../../components/dialog.js';
import { promptPluginConfig } from './plugin-config.js';

/**
 * Setup skill management listeners
 * Uses event delegation on the document for dynamic skill cards
 */
export function setupSkillListeners() {
    document.addEventListener('click', async (e) => {
        // Handle Skills (toggle via card or switch)
        const skillCard = e.target.closest('.plugin-card[data-skill-id]');
        if (skillCard) {
            const skillId = skillCard.dataset.skillId;
            const toggle = skillCard.querySelector('.skill-toggle');

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
                const statusEl = skillCard.querySelector('.plugin-status');

                // Optimistic UI Update
                skillCard.classList.toggle('active', enabled);
                if (statusEl) {
                    statusEl.textContent = enabled ? 'ENABLED' : 'DISABLED';
                    statusEl.className = `plugin-status ${enabled ? 'enabled' : 'disabled'}`;
                }

                try {
                    const result = await window.dram.util.toggleSkill(skillId, enabled);
                    if (result.success) {
                        showToast({ message: `Skill ${enabled ? 'enabled' : 'disabled'}`, type: 'success' });
                    } else {
                        throw new Error(result.error || 'Failed to toggle skill');
                    }
                } catch (err) {
                    // Revert on failure
                    toggle.checked = !enabled;
                    skillCard.classList.toggle('active', !enabled);
                    if (statusEl) {
                        statusEl.textContent = !enabled ? 'ENABLED' : 'DISABLED';
                        statusEl.className = `plugin-status ${!enabled ? 'enabled' : 'disabled'}`;
                    }
                    showToast({ message: err?.message || 'Failed to toggle skill', type: 'error' });
                }
            }
            return;
        }

        // Add Channel button (redirects to plugins tab)
        if (e.target.id === 'btn-add-channel') {
            const pluginTab = document.querySelector('.dashboard-nav-item[data-tab="tab-integrations"]');
            if (pluginTab) {
                pluginTab.click();
                showToast({ message: 'Browse Available Integrations', type: 'info' });
            }
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
                const result = await window.dram.shell.executeCLI(command);
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






