/**
 * DRAM IPC - Skills Handlers
 * Manages available skills and their status.
 */
export {
    isLikelyGenericInstallerToken,
    getPlatformDisplayName,
    installHomebrewInWsl,
    tryInstallViaWslBrew,
    expandIdentifierVariants,
    buildSkillInstallCandidates,
    classifyInstallFailureMessage
} from './skills-installers.js';

const TRUST_STATUSES = new Set(['trusted', 'untrusted', 'blocked']);
const SKILL_VETTING_KEY = 'security.vetting.skills';

export function normalizeSkillIdentifier(value) {
    return String(value || '').trim().toLowerCase();
}

export function normalizeTrustStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    return TRUST_STATUSES.has(status) ? status : '';
}

function sanitizeTrustRegistry(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const registry = {};
    for (const [key, status] of Object.entries(raw)) {
        const id = normalizeSkillIdentifier(key);
        const normalizedStatus = normalizeTrustStatus(status);
        if (!id || !normalizedStatus) continue;
        registry[id] = normalizedStatus;
    }
    return registry;
}

export async function readTrustRegistry(secureStorage, fallbackStore) {
    if (!secureStorage?.get) {
        return sanitizeTrustRegistry(fallbackStore);
    }
    try {
        const stored = await secureStorage.get(SKILL_VETTING_KEY);
        return sanitizeTrustRegistry(stored);
    } catch (err) {
        console.warn('[Skills] Failed to read trust registry:', err?.message || err);
        return sanitizeTrustRegistry(fallbackStore);
    }
}

export async function writeTrustRegistry(secureStorage, fallbackStore, registry) {
    const sanitized = sanitizeTrustRegistry(registry);
    Object.keys(fallbackStore).forEach((key) => delete fallbackStore[key]);
    Object.assign(fallbackStore, sanitized);
    if (!secureStorage?.set) return true;
    try {
        await secureStorage.set(SKILL_VETTING_KEY, sanitized);
        return true;
    } catch (err) {
        console.warn('[Skills] Failed to persist trust registry:', err?.message || err);
        return false;
    }
}

function normalizeSkillRequirements(requirements) {
    if (!requirements) return [];

    if (!Array.isArray(requirements) && typeof requirements === 'object') {
        const expanded = [];
        const bins = Array.isArray(requirements.bins) ? requirements.bins : [];
        const anyBins = Array.isArray(requirements.anyBins) ? requirements.anyBins : [];
        const env = Array.isArray(requirements.env) ? requirements.env : [];
        const config = Array.isArray(requirements.config) ? requirements.config : [];
        const os = Array.isArray(requirements.os) ? requirements.os : [];

        bins.forEach((bin) => {
            const value = String(bin || '').trim();
            if (!value) return;
            expanded.push({ text: `missing binary: ${value}`, kind: 'bin', bin: value, raw: requirements });
        });

        if (anyBins.length > 0) {
            const normalizedBins = anyBins.map((entry) => String(entry || '').trim()).filter(Boolean);
            if (normalizedBins.length > 0) {
                expanded.push({
                    text: `missing one of binaries: ${normalizedBins.join(', ')}`,
                    kind: 'bin',
                    raw: { ...requirements, anyBins: normalizedBins }
                });
            }
        }

        env.forEach((key) => {
            const value = String(key || '').trim();
            if (!value) return;
            expanded.push({ text: `missing env var: ${value}`, kind: 'env', key: value, raw: requirements });
        });

        config.forEach((path) => {
            const value = String(path || '').trim();
            if (!value) return;
            expanded.push({ text: `missing config: ${value}`, kind: 'config', path: value, raw: requirements });
        });

        os.forEach((platform) => {
            const value = String(platform || '').trim();
            if (!value) return;
            expanded.push({ text: `requires OS: ${value}`, kind: 'os', raw: requirements });
        });

        return expanded;
    }

    if (!Array.isArray(requirements)) return [];
    return requirements
        .map((requirement) => {
            if (typeof requirement === 'string') {
                const text = requirement.trim();
                return text ? { text } : null;
            }
            if (!requirement || typeof requirement !== 'object') return null;
            const parts = [
                requirement.message,
                requirement.reason,
                requirement.requirement,
                requirement.key,
                requirement.bin,
                requirement.path
            ]
                .map((value) => String(value || '').trim())
                .filter(Boolean);
            const text = parts.join(' - ');
            const kind = String(requirement.kind || requirement.type || '').trim().toLowerCase();
            const key = String(requirement.key || requirement.env || requirement.var || '').trim();
            const bin = String(requirement.bin || '').trim();
            const path = String(requirement.path || requirement.configPath || '').trim();
            const install = requirement.install || requirement.installer || requirement.installers || null;
            return {
                text,
                kind,
                key,
                bin,
                path,
                install,
                raw: requirement
            };
        })
        .filter(Boolean);
}

function normalizeInstallOptions(entry) {
    const fromEntry = entry?.installOptions || entry?.install || entry?.installer || entry?.installers || entry?.metadata?.openclaw?.install;
    if (!fromEntry) return [];
    if (Array.isArray(fromEntry)) {
        return fromEntry.filter((option) => option && typeof option === 'object');
    }
    if (typeof fromEntry === 'object') return [fromEntry];
    return [];
}

function normalizeSingleSkill(entry, fallbackId = '') {
    if (!entry) return null;

    if (typeof entry === 'string') {
        const id = entry.trim();
        if (!id) return null;
        return {
            id,
            skillKey: id,
            name: id,
            description: '',
            version: '',
            enabled: true,
            eligible: true,
            requirements: [],
            methods: []
        };
    }

    if (typeof entry !== 'object') return null;

    const id = String(entry.skillKey || entry.id || entry.skillId || entry.name || fallbackId || '').trim();
    if (!id) return null;

    const methods = entry.methods || entry.rpcMethods || entry.capabilities || entry.features || [];

    const hasMissingField = Object.prototype.hasOwnProperty.call(entry, 'missing');
    const missingRequirementDetails = normalizeSkillRequirements(entry.missing || []);
    const issueRequirementDetails = normalizeSkillRequirements(entry.issues || []);

    // Some payloads expose `requirements` as declared dependencies (not missing).
    // Only treat `requirements` as missing requirements for legacy payloads where
    // `missing` is absent and eligibility is explicitly false.
    const legacyRequirementDetails = (!hasMissingField && entry.eligible === false)
        ? normalizeSkillRequirements(entry.requirements || [])
        : [];

    const requirementDetails = [
        ...missingRequirementDetails,
        ...issueRequirementDetails,
        ...legacyRequirementDetails
    ].filter((item, index, list) => {
        const signature = JSON.stringify({
            text: String(item?.text || '').trim(),
            kind: String(item?.kind || '').trim().toLowerCase(),
            key: String(item?.key || '').trim(),
            bin: String(item?.bin || '').trim(),
            path: String(item?.path || '').trim()
        });
        return list.findIndex((candidate) => JSON.stringify({
            text: String(candidate?.text || '').trim(),
            kind: String(candidate?.kind || '').trim().toLowerCase(),
            key: String(candidate?.key || '').trim(),
            bin: String(candidate?.bin || '').trim(),
            path: String(candidate?.path || '').trim()
        }) === signature) === index;
    });
    const requirements = requirementDetails.map((item) => String(item?.text || '').trim()).filter(Boolean);
    const installOptions = normalizeInstallOptions(entry);
    const hasExplicitEnabled = Object.prototype.hasOwnProperty.call(entry, 'enabled')
        || Object.prototype.hasOwnProperty.call(entry, 'disabled');
    const disabled = entry.disabled === true || entry.enabled === false;
    const explicitlyEnabled = entry.enabled === true || entry.disabled === false;
    const hasMissingRequirements = requirementDetails.length > 0;
    const blockedByAllowlist = entry.blockedByAllowlist === true;
    const eligible = blockedByAllowlist
        ? false
        : (entry.eligible !== false || !hasMissingRequirements);

    return {
        id,
        skillKey: String(entry.skillKey || entry.id || id),
        name: String(entry.name || entry.id || id),
        description: String(entry.description || ''),
        version: String(entry.version || ''),
        enabled: hasExplicitEnabled ? (explicitlyEnabled && eligible) : false,
        eligible,
        requirements,
        requirementDetails,
        installOptions,
        methods: Array.isArray(methods) ? methods : []
    };
}

export function normalizeSkillsPayload(payload) {
    if (!payload) return [];

    let rawSkills = [];
    if (Array.isArray(payload)) {
        rawSkills = payload;
    } else if (Array.isArray(payload.skills)) {
        rawSkills = payload.skills;
    } else if (Array.isArray(payload.entries)) {
        rawSkills = payload.entries;
    } else if (payload.skills && typeof payload.skills === 'object') {
        rawSkills = Object.entries(payload.skills).map(([id, value]) => (
            value && typeof value === 'object' ? { id, ...value } : { id }
        ));
    } else if (payload.entries && typeof payload.entries === 'object') {
        rawSkills = Object.entries(payload.entries).map(([id, value]) => (
            value && typeof value === 'object' ? { id, ...value } : { id }
        ));
    }

    const deduped = new Map();
    rawSkills
        .map((skill) => normalizeSingleSkill(skill))
        .filter(Boolean)
        .forEach((skill) => deduped.set(skill.id, skill));

    return Array.from(deduped.values());
}

export function normalizeCheckSkillsPayload(payload) {
    const missingRequirements = Array.isArray(payload?.missingRequirements) ? payload.missingRequirements : [];
    const disabledNames = new Set((Array.isArray(payload?.disabled) ? payload.disabled : []).map((name) => normalizeSkillIdentifier(name)));
    const blockedNames = new Set((Array.isArray(payload?.blocked) ? payload.blocked : []).map((name) => normalizeSkillIdentifier(name)));
    const map = new Map();

    for (const entry of missingRequirements) {
        if (!entry || typeof entry !== 'object') continue;
        const name = String(entry.name || '').trim();
        const key = normalizeSkillIdentifier(name);
        if (!key) continue;
        const requirementDetails = normalizeSkillRequirements(entry.missing || []);
        const installOptions = normalizeInstallOptions({ install: entry.install });
        const requirementDetailsWithInstall = requirementDetails.map((detail) => {
            if (!detail || typeof detail !== 'object' || detail.kind !== 'bin' || detail.install) return detail;
            const matchingInstall = installOptions.filter((option) => {
                const bins = Array.isArray(option?.bins) ? option.bins.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean) : [];
                if (bins.length === 0) return true;
                const bin = String(detail?.bin || '').trim().toLowerCase();
                return !!bin && bins.includes(bin);
            });
            if (matchingInstall.length === 0) return detail;
            return { ...detail, install: matchingInstall };
        });
        const requirements = requirementDetailsWithInstall.map((item) => String(item?.text || '').trim()).filter(Boolean);
        map.set(key, {
            name,
            eligible: false,
            disabled: disabledNames.has(key),
            blocked: blockedNames.has(key),
            requirementDetails: requirementDetailsWithInstall,
            requirements,
            installOptions
        });
    }

    return map;
}

export function attachCheckDataToSkills(skills, checkMap) {
    if (!(checkMap instanceof Map) || checkMap.size === 0) return skills;
    const merged = [];
    const consumed = new Set();

    for (const skill of skills) {
        const candidates = [
            normalizeSkillIdentifier(skill?.id),
            normalizeSkillIdentifier(skill?.skillKey),
            normalizeSkillIdentifier(skill?.name)
        ].filter(Boolean);
        const checkEntry = candidates.map((candidate) => checkMap.get(candidate)).find(Boolean) || null;
        if (!checkEntry) {
            merged.push(skill);
            continue;
        }
        candidates.forEach((candidate) => consumed.add(candidate));
        const hasMissingRequirements = Array.isArray(checkEntry.requirementDetails) && checkEntry.requirementDetails.length > 0;
        const eligible = checkEntry.blocked
            ? false
            : (skill?.eligible !== false && !hasMissingRequirements);
        merged.push({
            ...skill,
            eligible,
            enabled: checkEntry.disabled ? false : (eligible ? skill?.enabled === true : false),
            requirements: checkEntry.requirements,
            requirementDetails: checkEntry.requirementDetails,
            installOptions: checkEntry.installOptions
        });
    }

    for (const [key, checkEntry] of checkMap.entries()) {
        if (consumed.has(key)) continue;
        merged.push({
            id: checkEntry.name || key,
            skillKey: checkEntry.name || key,
            name: checkEntry.name || key,
            description: '',
            version: '',
            enabled: false,
            eligible: false,
            requirements: checkEntry.requirements,
            requirementDetails: checkEntry.requirementDetails,
            installOptions: checkEntry.installOptions,
            methods: []
        });
    }

    return merged;
}

export function extractNormalizedSkills(payload) {
    if (payload?.__normalized === true && Array.isArray(payload?.skills)) {
        return payload.skills;
    }
    return normalizeSkillsPayload(payload);
}

export function resolveSkillTrustStatus(skill, trustRegistry) {
    const directId = normalizeSkillIdentifier(skill?.id);
    const keyId = normalizeSkillIdentifier(skill?.skillKey);
    if (directId && trustRegistry[directId]) return trustRegistry[directId];
    if (keyId && trustRegistry[keyId]) return trustRegistry[keyId];
    if (skill?.enabled === true) return 'trusted';
    if (directId && (directId.startsWith('@dram/') || !directId.includes('/'))) return 'trusted';
    if (keyId && (keyId.startsWith('@dram/') || !keyId.includes('/'))) return 'trusted';
    return 'untrusted';
}

export function resolveSkillKey(skills, skillId) {
    const target = normalizeSkillIdentifier(skillId);
    if (!target) return '';

    const match = skills.find((skill) => {
        const candidates = [
            skill?.skillKey,
            skill?.id,
            skill?.skillId,
            skill?.name
        ];
        return candidates.some((candidate) => normalizeSkillIdentifier(candidate) === target);
    });

    if (match?.skillKey) return String(match.skillKey);
    if (match?.id) return String(match.id);
    return String(skillId).replace(/^@dram\//, '').replace(/\//g, '-');
}

export function resolveSkillEntry(skills, skillId) {
    const target = normalizeSkillIdentifier(skillId);
    if (!target) return null;

    const directMatch = skills.find((skill) => {
        const candidates = [
            skill?.skillKey,
            skill?.id,
            skill?.skillId,
            skill?.name
        ];
        return candidates.some((candidate) => normalizeSkillIdentifier(candidate) === target);
    });
    if (directMatch) return directMatch;

    const fallbackTarget = normalizeSkillIdentifier(String(skillId).replace(/^@dram\//, '').replace(/\//g, '-'));
    if (!fallbackTarget) return null;

    return skills.find((skill) => {
        const candidates = [
            skill?.skillKey,
            skill?.id,
            skill?.skillId,
            skill?.name
        ];
        return candidates.some((candidate) => normalizeSkillIdentifier(candidate) === fallbackTarget);
    }) || null;
}

/**
 * Register skills-related IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 * @param {Function} internalRequest - Helper to make internal requests to DramEngine
 */


