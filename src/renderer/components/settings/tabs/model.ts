/**
 * Model Settings Tab
 * Enhanced with clear thinking/reasoning differentiation
 */
import { state } from '../../../modules/state.js';
import { renderRange, renderSection, renderSwitch, renderInputWithAction, renderSecureKey } from '../../../modules/ui-components.js';

export function renderModelTab(cloudModelOptionsHtml, localModelOptionsHtml) {
    const processingContent = `
        <div class="processing-modes">
            ${renderSwitch({
        id: 'setting-primary-mode-local',
        label: 'Use Local Inference',
        description: 'Prioritize local Ollama models over cloud providers.',
        checked: false,
        className: 'primary-mode-toggle'
    })}
        </div>

        <div id="section-cloud-model" class="model-selection-group">
            <div class="settings-control">
                <div class="control-label">
                    <span class="label-text">Cloud Engine</span>
                    <span class="label-description">Managed intelligence (Anthropic, OpenAI, etc).</span>
                </div>
                <div class="select-wrapper">
                    <select id="setting-model">
                        ${cloudModelOptionsHtml}
                    </select>
                </div>
            </div>
        </div>

        <div id="section-local-model" class="model-selection-group">
            ${renderInputWithAction({
        id: 'setting-ollama-host',
        label: 'Ollama Endpoint',
        description: 'Connectivity check endpoint (normally http://127.0.0.1:11434).',
        placeholder: 'http://localhost:11434',
        actionId: 'btn-test-ollama',
        actionLabel: 'Test & Fetch'
    })}
            ${renderSecureKey({
        id: 'setting-key-ollama',
        label: 'Ollama API Key',
        description: 'Optional token for authenticated Ollama endpoints.',
        placeholder: 'ollama-local'
    })}
            <div id="ollama-test-results" class="setting-status-indicator" style="margin-top: 4px;"></div>
            <div class="label-description" style="margin-top: 6px;">
                DRAM only lists tool-capable Ollama models exposed by OpenClaw.
            </div>
            
            <div class="settings-control" style="margin-top: 12px; border-bottom: none;">
                <div class="control-label">
                    <span class="label-text">Local Model</span>
                    <span class="label-description">Active model from your local library.</span>
                </div>
                <div class="select-wrapper">
                    <select id="setting-model-local">
                        ${localModelOptionsHtml || '<option value="">No models found</option>'}
                    </select>
                </div>
            </div>
        </div>

        <div id="model-change-status" class="setting-status-indicator"></div>

        ${renderRange({
        id: 'setting-temp',
        label: 'Atmospheric Temperature',
        description: 'Probability distribution (0.0 = focused/logical, 1.0 = creative/random).',
        min: 0,
        max: 1,
        step: 0.1,
        value: 0.7
    })}
    `;

    const contextContent = `
        <div class="settings-control">
            <div class="control-label">
                <span class="label-text">Reasoning Control</span>
                <span class="label-description">Moved to the chat footer next to the active model. DRAM auto-adjusts unsupported levels for the current model.</span>
            </div>
        </div>
    `;

    return `
        <div id="tab-model" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Intelligence Core',
        subtitle: 'Configure primary and local inference engines.',
        content: processingContent
    })}
            ${renderSection({
        title: 'Context Options',
        subtitle: 'Fine-tune inference behavior and routing constraints.',
        content: contextContent,
        infoTooltip: 'Use the chat footer thinking control for per-message reasoning depth. DRAM adapts unsupported levels automatically per model.'
    })}
        </div>
    `;
}

/**
 * Update the thinking preview based on selected value
 */
export function updateThinkingPreview(modelId?: string) {
    const thinkingSelect = (document.getElementById('chat-thinking-select') as HTMLSelectElement | null)
        || (document.getElementById('setting-think') as HTMLSelectElement | null);
    if (!thinkingSelect) return;

    const activeModelId = String(modelId || state.currentActiveModelId || state.model || '').trim().toLowerCase();
    const isGpt52Chat = activeModelId.includes('gpt-5.2-chat');
    const lowOption = Array.from(thinkingSelect.options).find((option) => option.value === 'low');
    const mediumOption = Array.from(thinkingSelect.options).find((option) => option.value === 'medium');
    const highOption = Array.from(thinkingSelect.options).find((option) => option.value === 'high');

    if (lowOption) lowOption.disabled = isGpt52Chat;
    if (highOption) highOption.disabled = isGpt52Chat;
    if (mediumOption) mediumOption.disabled = false;

    if (isGpt52Chat && thinkingSelect.value !== 'medium') {
        thinkingSelect.value = 'medium';
        void (window as any).dram?.storage?.set?.('settings.thinkLevel', 'medium');
    }
}

/**
 * Show model change status
 */
export function showModelStatus(message, type = 'success') {
    const el = document.getElementById('model-change-status');
    if (!el) return;

    el.textContent = message;
    el.className = `setting-status-indicator ${type}`;
    el.style.opacity = '1';

    setTimeout(() => {
        el.style.opacity = '0';
    }, 3000);
}

/**
 * Handle visual toggling of cloud/local sections based on primary mode
 */
export function updatePrimaryModeUI() {
    const isLocal = document.getElementById('setting-primary-mode-local')?.checked || false;
    const cloudSection = document.getElementById('section-cloud-model');
    const localSection = document.getElementById('section-local-model');

    if (cloudSection && localSection) {
        if (isLocal) {
            cloudSection.style.opacity = '0.4';
            cloudSection.style.pointerEvents = 'none';
            localSection.style.opacity = '1';
            localSection.style.pointerEvents = 'all';
        } else {
            cloudSection.style.opacity = '1';
            cloudSection.style.pointerEvents = 'all';
            localSection.style.opacity = '0.4';
            localSection.style.pointerEvents = 'none';
        }
    }
}






