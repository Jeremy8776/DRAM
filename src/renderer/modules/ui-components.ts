/**
 * DRAM Unified UI Component Library
 * Provides consistent, high-fidelity HTML templates for settings and forms.
 */
import { escapeHtml } from './utils.js';

/**
 * Render a labeled switch/toggle component
 */
export function renderSwitch({ id, label, description, checked = false, className = '' }) {
    return `
        <div class="settings-control ${className}">
            <div class="control-label">
                <span class="label-text">${label}</span>
                ${description ? `<span class="label-description">${description}</span>` : ''}
            </div>
            <label class="switch">
                <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        </div>
    `;
}

/**
 * Render a labeled text input or password input
 */
export function renderInput({ id, label, description, value = '', type = 'text', placeholder = '', className = '' }) {
    return `
        <div class="settings-control ${className}">
            <div class="control-label">
                <span class="label-text">${label}</span>
                ${description ? `<span class="label-description">${description}</span>` : ''}
            </div>
            <div class="input-wrapper">
                <input type="${type}" id="${id}" value="${escapeHtml(String(value))}" placeholder="${placeholder}" class="mono-input">
            </div>
        </div>
    `;
}

/**
 * Render a labeled select dropdown
 */
export function renderSelect({ id, label, description, options = [], value = '', className = '' }) {
    const optionsHtml = options.map(opt => `
        <option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>
            ${escapeHtml(opt.text)}
        </option>
    `).join('');

    return `
        <div class="settings-control ${className}">
            <div class="control-label">
                <span class="label-text">${label}</span>
                ${description ? `<span class="label-description">${description}</span>` : ''}
            </div>
            <div class="select-wrapper">
                <select id="${id}">
                    ${optionsHtml}
                </select>
            </div>
        </div>
    `;
}

/**
 * Render a labeled range input
 */
export function renderRange({ id, label, description, min = 0, max = 1, step = 0.1, value = 0.7, className = '' }) {
    return `
        <div class="settings-control ${className}">
            <div class="control-label">
                <span class="label-text">${label}</span>
                ${description ? `<span class="label-description">${description}</span>` : ''}
            </div>
            <div class="range-wrapper">
                <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
                <span class="range-value" id="${id}-value">${value}</span>
            </div>
        </div>
    `;
}

/**
 * Render a labeled input with an action button
 */
export function renderInputWithAction({ id, label, description, value = '', placeholder = '', actionId, actionLabel, className = '' }) {
    return `
        <div class="settings-control ${className}">
            <div class="control-label">
                <span class="label-text">${label}</span>
                ${description ? `<span class="label-description">${description}</span>` : ''}
            </div>
            <div class="input-group">
                <input type="text" id="${id}" value="${escapeHtml(String(value))}" placeholder="${placeholder}" class="mono-input">
                <button class="tactile-btn sm" id="${actionId}">${actionLabel}</button>
            </div>
        </div>
    `;
}

/**
 * Render a settings section group
 */
export function renderSection({ title, subtitle, content, className = '', infoTooltip = '' }) {
    return `
        <div class="settings-section ${className}">
            ${title ? `
                <div class="section-header">
                    ${infoTooltip ? renderInfoBox(infoTooltip) : ''}
                    <h2>${title}</h2>
                </div>
            ` : ''}
            ${subtitle ? `<p class="section-subtitle">${subtitle}</p>` : ''}
            <div class="section-content">
                ${content}
            </div>
        </div>
    `;
}

/**
 * Render an info icon with tooltip (purple i in circle)
 */
export function renderInfoBox(text, type = 'info', title = '') {
    // Build tooltip content with optional title
    const tooltipContent = title 
        ? `${title}: ${text}` 
        : text;
    
    return `
        <span class="info-icon-circle" data-tooltip="${tooltipContent.replace(/"/g, '&quot;')}" title="Hover for info">i</span>
    `;
}

/**
 * Render an empty state placeholder
 */
export function renderEmptyState({ id, icon, title, description, className = '' }) {
    return `
        <div class="empty-state ${className}" id="${id}">
            <div class="empty-state-icon">${icon}</div>
            <div class="empty-state-title">${title}</div>
            <div class="empty-state-description">${description}</div>
        </div>
    `;
}

/**
 * Render a simple action button control
 */
export function renderActionButton({ id, label, description, actionLabel, className = '', color = 'secondary' }) {
    return `
        <div class="settings-control ${className}">
            <div class="control-label">
                <span class="label-text">${label}</span>
                ${description ? `<span class="label-description">${description}</span>` : ''}
            </div>
            <div class="control-action">
                <button class="tactile-btn sm ${color}" id="${id}">${actionLabel}</button>
            </div>
        </div>
    `;
}
/**
 * Render a secure key field with "Change" button
 */
export function renderSecureKey({ id, label, description, placeholder = '', className = '' }) {
    return `
        <div class="settings-control ${className}">
            <div class="control-label">
                <span class="label-text">${label}</span>
                ${description ? `<span class="label-description">${description}</span>` : ''}
            </div>
            <div class="key-field-container" data-target="${id}">
                <div class="key-input-wrapper">
                    <input type="password" id="${id}" class="secure-key-input mono-input" placeholder="${placeholder}" readonly value="">
                    <div class="key-status-dots hidden">••••••••••••••••••••••••</div>
                </div>
                <div class="key-actions">
                    <button class="tactile-btn sm secondary btn-edit-key" data-target="${id}">Change</button>
                    <button class="tactile-btn sm primary btn-save-key hidden" data-target="${id}">Save</button>
                </div>
            </div>
        </div>
    `;
}




