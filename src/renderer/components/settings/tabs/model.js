/**
 * Model Settings Tab
 * Enhanced with clear thinking/reasoning differentiation
 */
import { renderSelect, renderRange, renderSection, renderSwitch, renderInputWithAction } from '../../../modules/ui-components.js';

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
        description: 'Local server URL (e.g. http://127.0.0.1:11434).',
        placeholder: 'http://localhost:11434',
        actionId: 'btn-test-ollama',
        actionLabel: 'Test & Fetch'
    })}
            <div id="ollama-test-results" class="setting-status-indicator" style="margin-top: 4px;"></div>
            
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
        ${renderSelect({
        id: 'setting-think',
        label: 'Reasoning Depth',
        description: 'Computational thinking iterations per query.',
        options: [
            { value: '1', text: 'Direct Response (Fastest - No thinking step)' },
            { value: '2', text: 'Balanced (One thinking iteration)' },
            { value: '3', text: 'Deep Analysis (Multiple thinking iterations, Slowest)' }
        ],
        value: '1'
    })}
        <div class="think-preview" id="think-preview">
            <div class="think-preview-label">Output Preview:</div>
            <div class="think-preview-content" id="think-preview-content">
                Model responds immediately with answer
            </div>
        </div>
        <div id="think-change-status" class="setting-status-indicator"></div>
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
        subtitle: 'Fine-tune engine behavior and reasoning depth.',
        content: contextContent,
        infoTooltip: 'Reasoning Depth controls how many "thinking iterations" the model performs before responding. Higher values produce more thorough answers but increase response time.'
    })}
        </div>
    `;
}

/**
 * Update the thinking preview based on selected value
 */
export function updateThinkingPreview() {
    const thinkLevel = document.getElementById('setting-think')?.value || '1';
    const previewContent = document.getElementById('think-preview-content');
    if (!previewContent) return;

    const descriptions = {
        '1': 'Model responds immediately with answer (no visible thinking)',
        '2': 'Model shows reasoning process, then provides final answer',
        '3': 'Model performs deep analysis with multiple thinking steps before answering'
    };

    previewContent.textContent = descriptions[thinkLevel] || descriptions['1'];
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
