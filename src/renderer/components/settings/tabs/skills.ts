/**
 * Skills Settings Tab
 */
import { renderSection, renderEmptyState } from '../../../modules/ui-components.js';
import { escapeHtml } from '../utils.js';
import { getSkillPlatformSupport } from '../../../modules/listeners/skill-setup-policy.js';

function normalizeSkillName(skill: any) {
    return String(skill?.name || skill?.id || '').trim().toLowerCase();
}

function getSkillDisplayRank(skill: any) {
    const trustStatus = String(skill?.trustStatus || 'trusted').toLowerCase();
    const platformSupport = getSkillPlatformSupport(skill);
    const isUnsupportedOs = platformSupport.supported === false;
    const isEligible = skill?.eligible !== false;
    const isEnabled = !isUnsupportedOs && isEligible && skill?.enabled === true;
    const isBlocked = trustStatus === 'blocked';
    if (isUnsupportedOs) return 4;
    if (isEnabled) return 0;
    if (isEligible && !isBlocked) return 1;
    if (isEligible && isBlocked) return 2;
    return 3;
}

function formatPlatformLabel(value: string) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'win32') return 'Windows';
    if (normalized === 'darwin') return 'macOS';
    if (normalized === 'linux') return 'Linux';
    return normalized;
}

function renderRequirementDetails(skill: any) {
    const requirements = Array.isArray(skill?.requirements) ? skill.requirements : [];
    const summary = requirements.length > 0
        ? String(requirements[0])
        : 'This skill needs local dependencies before it can run.';

    return `
        <div class="skill-requirements-detail">
            <div class="skill-requirements-note">${escapeHtml(summary)}</div>
            <div class="skill-requirements-note">Turn this on and DRAM will handle setup automatically when possible.</div>
        </div>
    `;
}

/**
 * Render skills grid with toggle switches
 */
export function renderSkillsGrid(skills) {
    if (!skills || skills.length === 0) {
        return renderEmptyState({
            id: 'skill-empty',
            icon: 'O',
            title: 'Neural Core Isolation',
            description: 'Embedded cognitive toolkits are currently unreachable by the synaptic interface.'
        });
    }

    const sortedSkills = [...skills].sort((left: any, right: any) => {
        const rankDelta = getSkillDisplayRank(left) - getSkillDisplayRank(right);
        if (rankDelta !== 0) return rankDelta;
        return normalizeSkillName(left).localeCompare(normalizeSkillName(right));
    });

    return `
        <div class="plugin-grid compact" id="skill-registry">
            ${sortedSkills.map((sk) => {
        const platformSupport = getSkillPlatformSupport(sk);
        const isUnsupportedOs = platformSupport.supported === false;
        const supportedOsLabel = Array.isArray(platformSupport.allowed) && platformSupport.allowed.length > 0
            ? platformSupport.allowed.map((entry: string) => formatPlatformLabel(entry)).join(', ')
            : '';
        const isEligible = sk.eligible !== false;
        const isEnabled = sk.enabled === true;
        const isReadyEnabled = isEnabled && isEligible && !isUnsupportedOs;
        const trustStatus = String(sk.trustStatus || 'trusted').toLowerCase();
        const isBlocked = trustStatus === 'blocked';
        const isOffline = false;
        const toggleDisabled = isOffline || isBlocked || isUnsupportedOs;
        const statusClass = isUnsupportedOs
            ? 'missing'
            : (isBlocked
            ? 'error'
            : (isReadyEnabled
                ? 'enabled'
                : (trustStatus === 'untrusted'
                    ? 'missing'
                    : (isEligible ? 'disabled' : 'missing'))));
        const statusLabel = isUnsupportedOs
            ? 'UNSUPPORTED'
            : (isBlocked
            ? 'BLOCKED'
            : (isReadyEnabled
                ? 'ACTIVE'
                : (trustStatus === 'untrusted'
                    ? 'REVIEW'
                    : (isEligible ? 'AVAILABLE' : 'ACTION REQUIRED'))));
        const trustLabel = trustStatus === 'blocked'
            ? 'BLOCKED'
            : (trustStatus === 'untrusted' ? 'UNTRUSTED' : 'TRUSTED');
        const trustButtonLabel = 'Unblock';
        const nextTrustStatus = 'trusted';
        const subtitle = isUnsupportedOs
            ? (supportedOsLabel ? `Available on ${supportedOsLabel}` : 'Not available on this operating system')
            : (isReadyEnabled
            ? 'Ready to use'
            : (isEligible
                ? (trustStatus === 'untrusted' ? 'Review before enabling' : 'Ready to enable')
                : 'Requires local setup'));
        const showTrustControl = trustStatus === 'blocked';
        const showTrustBadge = trustStatus !== 'trusted' && !isUnsupportedOs;

        return `
                    <div class="plugin-card skill-card ${isReadyEnabled ? 'active' : ''} ${isEligible ? '' : 'needs-setup'} ${isOffline ? 'engine-offline' : ''} ${isUnsupportedOs ? 'unsupported os-specific' : ''}" data-skill-id="${escapeHtml(sk.id)}" data-trust-status="${escapeHtml(trustStatus)}" data-skill-eligible="${isEligible ? 'true' : 'false'}" data-skill-os-supported="${isUnsupportedOs ? 'false' : 'true'}">
                        <div class="plugin-card-header">
                            <div class="plugin-info">
                                <div class="plugin-name">${escapeHtml(sk.name)}</div>
                                <div class="skill-subtitle">${escapeHtml(subtitle)}</div>
                            </div>
                            <label class="switch sm">
                                <input type="checkbox" class="skill-toggle" data-skill-id="${escapeHtml(sk.id)}" data-trust-status="${escapeHtml(trustStatus)}" ${isReadyEnabled ? 'checked' : ''} ${toggleDisabled ? 'disabled' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="plugin-description">${escapeHtml(sk.description || 'Capability extension.')}</div>
                        ${!isEligible && !isUnsupportedOs ? renderRequirementDetails(sk) : ''}

                        <div class="plugin-footer">
                            <div class="plugin-status ${statusClass}">
                                ${statusLabel}
                                ${isOffline ? ' <span class="offline-hint">(OFFLINE)</span>' : ''}
                            </div>
                            ${showTrustBadge || showTrustControl ? `
                                <div class="skill-footer-right">
                                    ${showTrustBadge
                ? `<div class="plugin-trust-status ${escapeHtml(trustStatus)}">${escapeHtml(trustLabel)}</div>`
                : ''}
                                    ${showTrustControl
                ? `<button
                                        class="tactile-btn sm secondary skill-trust-btn ${trustStatus === 'blocked' ? 'danger' : ''}"
                                        data-skill-id="${escapeHtml(sk.id)}"
                                        data-next-trust="${escapeHtml(nextTrustStatus)}"
                                        ${isOffline ? 'disabled' : ''}
                                    >${escapeHtml(trustButtonLabel)}</button>`
                : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
}

/**
 * Render skills tab
 */
export function renderSkillsTab(skills) {
    const content = renderSkillsGrid(skills);

    return `
        <div id="tab-skills" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Skills',
        subtitle: 'Enable built-in capabilities. Web search provider is configured in Connections.',
        content: `<div id="skills-content-mount">${content}</div>`
    })}
        </div>
    `;
}

/**
 * Update skills grid in DOM
 */
export function updateSkillsList(skills) {
    const mount = document.getElementById('skills-content-mount');
    if (!mount) return;

    const newHtml = renderSkillsGrid(skills);
    mount.innerHTML = newHtml;
}
