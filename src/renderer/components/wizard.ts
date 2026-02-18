import { getIcon } from '../modules/icons.js';
import { escapeHtml } from '../modules/utils.js';
import {
    generateModelOptions,
    renderFallbackRows,
    renderPluginList,
    renderPluginSetup,
    renderSkillsList,
    hasPluginsNeedingSetup,
    renderOpenClawSummary
} from './wizard-helpers.js';

type WizardViewState = {
    model?: string;
    apiKey?: string;
    plugins?: unknown[];
    workspacePath?: string;
    gatewayToken?: string;
    foundLegacy?: boolean;
    legacyName?: string;
};

export function renderWizard(
    step = 1,
    availableModels = [],
    wizardState: WizardViewState = {},
    availablePlugins = [],
    availableSkills = [],
    isEngineReady = true,
    openClawDiscovery = null
) {
    const steps = [
        ...(openClawDiscovery?.found ? [{
            title: 'OPENCLAW // DETECTED',
            subtitle: 'Existing Installation Found',
            content: 'We found an existing OpenClaw installation on your system. You can import these settings or start fresh.',
            btn: 'Import & Enhance',
            html: `
            ${renderOpenClawSummary(openClawDiscovery)}
            <div class="wizard-migration-choices">
                <button class="tactile-btn block secondary" id="btn-wizard-fresh">Start Fresh (Ignore Existing)</button>
            </div>
            `
        }] : []),
        {
            title: 'MIGRATION // DETECTED',
            subtitle: 'Previous Configuration',
            content: `A configuration from ${escapeHtml(wizardState.legacyName || 'a previous installation')} has been detected. Would you like to migrate these settings?`,
            btn: 'Migrate Settings',
            skip: !wizardState.foundLegacy,
            html: `
            <div class="wizard-migration-choices">
                <div class="migration-summary">
                    <div class="summary-item"><span>MODEL:</span> <strong>${escapeHtml(wizardState.model || 'Detected')}</strong></div>
                    <div class="summary-item"><span>WORKSPACE:</span> <strong>${escapeHtml(wizardState.workspacePath || 'Detected')}</strong></div>
                    <div class="summary-item"><span>PLUGINS:</span> <strong>${(wizardState.plugins || []).length} Detected</strong></div>
                </div>
                <button class="tactile-btn block secondary" id="btn-wizard-fresh">No, start with a fresh install</button>
            </div>
            `
        },
        {
            title: 'GENERAL // SYSTEM',
            subtitle: 'Neural Link Initialization',
            content: 'Establish your neural link. DRAM will connect to the local OpenClaw gateway to enable AI capabilities.',
            layout: 'handshake',
            btn: 'Initialize Protocol',
            html: `
            <div class="wizard-sync-shell premium-card">
                <div class="wizard-sync-shell__header">
                    <div class="wizard-sync-shell__title">Gateway Link</div>
                    <div class="wizard-sync-shell__state offline" id="wizard-sync-state">Offline</div>
                </div>
                <div class="wizard-sync-status" id="wizard-sync-status">
                    <div class="sync-indicator offline" id="wizard-indicator"></div>
                    <div class="sync-msg" id="wizard-sync-msg">Awaiting Handshake...</div>
                </div>
                <div class="wizard-sync-shell__hint">Waiting for local OpenClaw gateway on <span>ws://127.0.0.1:18789</span></div>
            </div>
            `
        },
        {
            title: 'INTELLIGENCE // MODEL',
            subtitle: 'Primary Intelligence Core',
            content: 'Select your main intelligence core. This engine will handle the majority of reasoning tasks and tool orchestrations.',
            html: `
            <div class="wizard-input-group">
                <label class="mono-label">PRIMARY MODEL</label>
                <select id="wizard-model-select" class="mono-input">
                    ${generateModelOptions(availableModels, wizardState.model)}
                </select>
            </div>
            `,
            btn: 'Confirm Primary'
        },
        {
            title: 'INTELLIGENCE // AUTH',
            subtitle: 'Primary Access Key',
            content: 'Enter credentials for your primary engine. Your data is protected in the local encrypted neural vault.',
            html: `
            <div class="wizard-input-group">
                <label class="mono-label" id="wizard-key-label">API KEY</label>

                <div class="setting-control wide key-field-container" data-target="wizard-api-key" style="margin-top: 8px;">
                    <div class="key-input-wrapper">
                        <input type="password" id="wizard-api-key" class="mono-input secure-key-input ${wizardState.apiKey ? 'hidden' : ''}" placeholder="sk-..." value="${wizardState.apiKey ? '' : ''}" ${wizardState.apiKey ? 'readonly' : ''}>
                        <div class="key-status-dots ${wizardState.apiKey ? '' : 'hidden'}">........................</div>
                    </div>
                    <div class="key-actions">
                        <button class="tactile-btn sm secondary btn-edit-key ${wizardState.apiKey ? '' : 'hidden'}" data-target="wizard-api-key">Change</button>
                        <button class="tactile-btn sm primary btn-save-key ${wizardState.apiKey ? 'hidden' : ''}" data-target="wizard-api-key">Validate</button>
                    </div>
                </div>

                <div class="api-key-status" id="api-key-status" style="margin-top: 8px;"></div>
            </div>
            `,
            btn: 'Continue to Fallbacks'
        },
        {
            title: 'INTELLIGENCE // FALLBACKS',
            subtitle: 'Fallback Matrix',
            content: 'Configure a chain of fallback engines. DRAM will attempt to use these sequentially if the primary core fails or is rate-limited.',
            html: `
            <div class="wizard-input-group">
                <label class="mono-label">FALLBACK CHAIN</label>
                <div id="wizard-fallbacks-container">
                    ${renderFallbackRows(wizardState, availableModels)}
                </div>
                <button class="tactile-btn block secondary" id="btn-add-fallback">+ Add Fallback Engine</button>
            </div>
            `,
            btn: 'Configure Workspace'
        },
        {
            title: 'GENERAL // WORKSPACE',
            subtitle: 'Memory Layer',
            content: 'Point DRAM to your workspace. This folder should contain your SOUL.md and AGENTS.md files for personalized context.',
            html: `
            <div class="wizard-input-group">
                <label class="mono-label">WORKSPACE ROOT</label>
                <div class="input-with-btn">
                    <input type="text" id="wizard-workspace-path" class="mono-input" placeholder="[Documents Folder]/DRAM" value="${escapeHtml(wizardState.workspacePath || '')}">
                    <button class="tactile-btn sm" id="btn-wizard-browse">Browse</button>
                </div>
            </div>
            `,
            btn: 'Launch & Connect'
        },
        {
            title: 'SYSTEM // SECURITY',
            subtitle: 'Gateway Protection',
            content: 'Your DRAM engine is protected by a cryptographically secure token. This ensures only authorized local clients can access the neural core.',
            html: `
            <div class="wizard-input-group">
                <div class="label-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label class="mono-label" style="margin: 0;">SECURE TOKEN</label>
                    <span class="security-badge-sm" style="color: var(--success); font-size: 10px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        ${getIcon('CHECK')}
                        ENCRYPTED VAULT
                    </span>
                </div>
                <div class="api-key-input-wrapper" style="position: relative; display: flex; align-items: center;">
                    <div class="input-icon-left" style="position: absolute; left: 12px; color: var(--success);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    </div>
                    <input type="password" id="wizard-gateway-token" class="mono-input" readonly value="${escapeHtml(wizardState.gatewayToken || 'Generating...')}" style="padding-left: 36px; padding-right: 50px; font-family: var(--font-mono); letter-spacing: 1px; font-size: 12px; height: 42px;">
                    <button type="button" id="btn-toggle-token" class="toggle-visibility-btn" style="position: absolute; right: 0; top: 0; bottom: 0; padding: 0 12px; background: none; border: none; color: var(--text-tertiary); cursor: pointer; font-size: 11px; font-weight: 500;">SHOW</button>
                </div>
                <div class="muted sm" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                    <div style="width: 4px; height: 4px; background: var(--text-tertiary); border-radius: 50%;"></div>
                    <span>Stored securely in operating system keychain</span>
                </div>
            </div>
            `,
            btn: 'Configure Extensions'
        },
        {
            title: 'EXTENSIONS // INTEGRATIONS',
            subtitle: 'Integration Registry',
            content: 'Enable external connections for your agent. These integrations provide communication channels and platform access.',
            html: `
            <div class="plugin-grid compact wizard-plugin-grid" id="wizard-plugin-list">
                ${renderPluginList(availablePlugins, wizardState, isEngineReady)}
            </div>
            `,
            btn: 'Continue Setup'
        },
        {
            title: 'EXTENSIONS // SETUP',
            subtitle: 'Channel Configuration',
            content: 'Configure the plugins you selected. Some integrations require authentication or API credentials.',
            html: `
            <div class="wizard-plugin-setup" id="wizard-plugin-setup">
                ${renderPluginSetup(wizardState, availablePlugins)}
            </div>
            `,
            btn: 'Configure Skills',
            skip: !hasPluginsNeedingSetup(wizardState)
        },
        {
            title: 'EXTENSIONS // SKILLS',
            subtitle: 'Neural Skills',
            content: "Enable specialized skills to extend DRAM's capabilities. These provide additional tools and behaviors.",
            html: `
            <div class="plugin-grid compact wizard-plugin-grid" id="wizard-skills-list">
                ${renderSkillsList(availableSkills, wizardState, isEngineReady)}
            </div>
            `,
            btn: 'Finalize Setup'
        },
        {
            title: 'SYSTEM // VOICE',
            subtitle: 'Local Neural Transcription',
            content: 'DRAM can use a local neural engine for private, real-time voice transcription. This avoids sending your voice data to external APIs.',
            html: `
            <div class="wizard-setup-status" id="voice-setup-status">
                <div class="status-indicator" id="voice-indicator">
                    <div class="spinner"></div>
                </div>
                <div class="status-msg" id="voice-setup-msg">Initializing local voice engine...</div>
                <div class="status-detail" id="voice-setup-detail">This may take a minute to download models (approx 150MB).</div>
            </div>
            `,
            btn: 'Complete Onboarding'
        }
    ];

    const s = steps[step - 1];

    const offset = openClawDiscovery?.found ? 1 : 0;
    const extensionSteps = [8 + offset, 9 + offset, 10 + offset];

    if (!isEngineReady && extensionSteps.includes(step)) {
        s.html = `
        <div class="wizard-engine-warning">
            <div class="warning-icon">${getIcon('WARNING')}</div>
            <div class="warning-text">Extension management is disabled because the neural gateway is offline. You can proceed to finish the setup and enable these later.</div>
        </div>
        ` + s.html;
    }

    const totalSteps = steps.length;
    const isExtensionLayoutStep = extensionSteps.includes(step);
    const isHandshakeLayoutStep = s.layout === 'handshake';
    const contentClass = `wizard-content${isExtensionLayoutStep ? ' wizard-content-wide' : ''}${isHandshakeLayoutStep ? ' wizard-content-handshake' : ''}`;
    const bodyClass = `wizard-body${isExtensionLayoutStep ? ' wizard-body-expanded' : ''}${isHandshakeLayoutStep ? ' wizard-body-center' : ''}`;
    const headerClass = `wizard-header${isHandshakeLayoutStep ? ' wizard-header-handshake' : ''}`;
    const footerClass = `wizard-footer${isExtensionLayoutStep ? ' wizard-footer-compact' : ''}${isHandshakeLayoutStep ? ' wizard-footer-handshake' : ''}`;

    return `
    <div class="setup-drag-region"></div>
    <div class="wizard-modal">
        <div class="${contentClass}">
            <div class="${headerClass}">
                <div class="wizard-step-indicator">STEP ${String(step).padStart(2, '0')} // ${String(totalSteps).padStart(2, '0')}</div>
                <h1 class="wizard-title">${s.title.split(' // ').map((part, i) => i === 1 ? `<span class="accent">${part}</span>` : part).join(' <span class="sep">//</span> ')}</h1>
                <p class="wizard-subtitle">${s.subtitle}</p>
            </div>
            <div class="${bodyClass}">
                <p class="wizard-text">${s.content}</p>
                ${s.html || ''}
            </div>
            <div class="${footerClass}">
                <div class="wizard-progress">
                    ${steps.map((_, i) => `<div class="progress-dot ${step === (i + 1) ? 'active' : ''}"></div>`).join('')}
                </div>
                <button class="tactile-btn primary" id="btn-wizard-next" data-step="${step}">${s.btn}</button>
            </div>
        </div>
    </div>
    `;
}

/**
 * Render a loading state for the wizard
 * Used during OpenClaw discovery and installation
 */
export function renderLoadingStep(title, subtitle = '', progressText = '') {
    return `
    <div class="setup-drag-region"></div>
    <div class="wizard-modal">
        <div class="wizard-content">
            <div class="wizard-body" style="display: flex; align-items: center; justify-content: center;">
                <div class="wizard-loading-state">
                    <div class="wizard-spinner"></div>
                    <div class="wizard-loading-title">${escapeHtml(title)}</div>
                    ${subtitle ? `<div class="wizard-loading-subtitle">${escapeHtml(subtitle)}</div>` : ''}
                    ${progressText ? `<div class="wizard-loading-progress-text" id="loading-progress-text">${escapeHtml(progressText)}</div>` : '<div class="wizard-loading-progress-text" id="loading-progress-text" style="display: none;"></div>'}
                </div>
            </div>
        </div>
    </div>
    `;
}







