/**
 * Skill requirement parsing helpers for ineligible-skill remediation UX.
 */

export type SkillRequirementAction =
    | { type: 'env'; key: string; requirement: string }
    | { type: 'config'; path: string; requirement: string }
    | { type: 'bin'; bin: string; requirement: string }
    | SkillInstallAction
    | { type: 'os'; requirement: string }
    | { type: 'unknown'; requirement: string };

export type SkillInstallAction = {
    type: 'install';
    label: string;
    requirement: string;
    installId?: string;
    command?: string;
};

function firstMatch(text: string, patterns: RegExp[]) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return String(match[1]).trim();
    }
    return '';
}

function normalizeRequirementString(entry: any) {
    if (typeof entry === 'string') return entry.trim();
    if (!entry || typeof entry !== 'object') return '';
    return String(entry.text || entry.message || entry.reason || entry.requirement || entry.key || entry.bin || entry.path || '')
        .trim();
}

function normalizeRequirementKind(entry: any) {
    if (!entry || typeof entry !== 'object') return '';
    return String(entry.kind || entry.type || '').trim().toLowerCase();
}

function normalizeInstallOptionsFromSkill(skill: any) {
    const options = skill?.installOptions || skill?.install || skill?.installer || skill?.installers || skill?.metadata?.openclaw?.install;
    if (!options) return [];
    if (Array.isArray(options)) return options.filter((item) => item && typeof item === 'object');
    if (typeof options === 'object') return [options];
    return [];
}

function getInstallKind(installOption: any) {
    const raw = String(
        installOption?.installId
        || installOption?.kind
        || installOption?.installer
        || installOption?.manager
        || installOption?.id
        || ''
    ).trim().toLowerCase();
    if (!raw) return '';
    return raw === 'npm' ? 'node' : raw;
}

function getInstallId(installOption: any) {
    const explicit = String(
        installOption?.installId
        || installOption?.id
        || installOption?.installerId
        || installOption?.kind
        || installOption?.installer
        || installOption?.manager
        || ''
    ).trim().toLowerCase();
    if (!explicit) return '';
    return explicit === 'npm' ? 'node' : explicit;
}

function buildInstallCommand(installOption: any) {
    if (!installOption || typeof installOption !== 'object') return '';
    const explicitCommand = String(installOption.command || installOption.cmd || '').trim();
    if (explicitCommand) return explicitCommand;

    const kind = getInstallKind(installOption);
    if (kind === 'node') {
        const pkg = String(installOption.package || installOption.pkg || '').trim();
        if (!pkg) return '';
        return `npm i -g ${pkg}`;
    }
    if (kind === 'brew') {
        const formula = String(installOption.formula || installOption.package || '').trim();
        if (!formula) return '';
        return `brew install ${formula}`;
    }
    if (kind === 'go') {
        const moduleName = String(installOption.module || installOption.package || '').trim();
        if (!moduleName) return '';
        return `go install ${moduleName}@latest`;
    }
    if (kind === 'uv') {
        const pkg = String(installOption.package || installOption.tool || '').trim();
        if (!pkg) return '';
        return `uv tool install ${pkg}`;
    }
    if (kind === 'winget') {
        const pkg = String(installOption.package || installOption.id || '').trim();
        if (!pkg) return '';
        return `winget install ${pkg}`;
    }
    if (kind === 'choco' || kind === 'chocolatey') {
        const pkg = String(installOption.package || installOption.id || '').trim();
        if (!pkg) return '';
        return `choco install ${pkg} -y`;
    }
    if (kind === 'scoop') {
        const pkg = String(installOption.package || installOption.id || '').trim();
        if (!pkg) return '';
        return `scoop install ${pkg}`;
    }
    return '';
}

function installLabel(installOption: any) {
    const explicit = String(installOption?.label || '').trim();
    if (explicit) return explicit;
    const kind = getInstallKind(installOption) || 'installer';
    if (kind === 'node') return 'Install with npm';
    if (kind === 'brew') return 'Install with brew';
    if (kind === 'go') return 'Install with go';
    if (kind === 'uv') return 'Install with uv';
    if (kind === 'winget') return 'Install with winget';
    if (kind === 'choco' || kind === 'chocolatey') return 'Install with choco';
    if (kind === 'scoop') return 'Install with scoop';
    return 'Install dependency';
}

function toInstallAction(installOption: any, requirement: string): SkillInstallAction | null {
    if (!installOption || typeof installOption !== 'object') return null;
    const installId = getInstallId(installOption);
    const command = buildInstallCommand(installOption);
    if (!installId && !command) return null;

    const action: SkillInstallAction = {
        type: 'install',
        label: installLabel(installOption),
        requirement: requirement || 'Install missing dependency'
    };
    if (installId) action.installId = installId;
    if (command) action.command = command;
    return action;
}

function extractEnvKey(requirement: string) {
    const text = String(requirement || '').trim();
    if (!text) return '';
    const hasEnvSignal = /\benv\b|\benvironment\b/i.test(text);
    const key = firstMatch(text, [
        /(?:env|environment)(?:\s+var(?:iable)?s?)?[:=\s]+([A-Z][A-Z0-9_]{2,})/i,
        /missing\s+(?:env(?:ironment)?\s+)?(?:var(?:iable)?)\s+([A-Z][A-Z0-9_]{2,})/i,
        /\b([A-Z][A-Z0-9_]{2,})\b/
    ]);
    return hasEnvSignal ? key : '';
}

function extractConfigPath(requirement: string) {
    const text = String(requirement || '').trim();
    if (!text) return '';
    const hasConfigSignal = /\bconfig\b|\bconfiguration\b/i.test(text);
    const path = firstMatch(text, [
        /(?:config|configuration)(?:\s+key|\s+path)?[:=\s]+([a-z0-9_.-]{3,})/i,
        /missing\s+(?:config|configuration)(?:\s+key|\s+path)?[:=\s]+([a-z0-9_.-]{3,})/i
    ]);
    return hasConfigSignal ? path : '';
}

function extractBinary(requirement: string) {
    const text = String(requirement || '').trim();
    if (!text) return '';
    return firstMatch(text, [
        /missing\s+binary[:=\s]+([a-z0-9_.-]{2,})/i,
        /missing\s+bin[:=\s]+([a-z0-9_.-]{2,})/i,
        /requires?\s+(?:binary|bin)[:=\s]+([a-z0-9_.-]{2,})/i,
        /anybins?[:=\s]+([a-z0-9_.-]{2,})/i
    ]);
}

function isOsRequirement(requirement: string) {
    const text = String(requirement || '').toLowerCase();
    return text.includes(' os ') || text.startsWith('os ') || text.includes('platform');
}

export function normalizeSkillRequirements(requirements: any[]) {
    if (!Array.isArray(requirements)) return [];
    return requirements
        .map(normalizeRequirementString)
        .filter(Boolean);
}

export function deriveSkillRequirementActions(skill: any) {
    const rawRequirements = Array.isArray(skill?.requirementDetails) && skill.requirementDetails.length > 0
        ? skill.requirementDetails
        : (skill?.requirements || []);
    const requirements = normalizeSkillRequirements(rawRequirements);
    const actions: SkillRequirementAction[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < requirements.length; index++) {
        const requirement = requirements[index];
        const sourceEntry = Array.isArray(rawRequirements) ? rawRequirements[index] : null;
        const requirementKind = normalizeRequirementKind(sourceEntry);

        if (requirementKind === 'env') {
            const key = String(sourceEntry?.key || sourceEntry?.env || '').trim();
            if (key) {
                const dedupeKey = `env:${key}`;
                if (!seen.has(dedupeKey)) {
                    seen.add(dedupeKey);
                    actions.push({ type: 'env', key, requirement });
                }
                continue;
            }
        }

        if (requirementKind === 'config') {
            const path = String(sourceEntry?.path || sourceEntry?.configPath || sourceEntry?.key || '').trim();
            if (path) {
                const dedupeKey = `config:${path}`;
                if (!seen.has(dedupeKey)) {
                    seen.add(dedupeKey);
                    actions.push({ type: 'config', path, requirement });
                }
                continue;
            }
        }

        if (requirementKind === 'bin') {
            const bin = String(sourceEntry?.bin || sourceEntry?.key || '').trim();
            if (bin) {
                const dedupeKey = `bin:${bin}`;
                if (!seen.has(dedupeKey)) {
                    seen.add(dedupeKey);
                    actions.push({ type: 'bin', bin, requirement });
                }
                const installFromRequirement = sourceEntry?.install || sourceEntry?.installer || sourceEntry?.installers;
                const installOptions = Array.isArray(installFromRequirement)
                    ? installFromRequirement
                    : (installFromRequirement && typeof installFromRequirement === 'object' ? [installFromRequirement] : []);
                for (const option of installOptions) {
                    const installAction = toInstallAction(option, requirement || `Install ${bin}`);
                    if (!installAction) continue;
                    const installKey = `install:${installAction.installId || installAction.command || installAction.label}`;
                    if (seen.has(installKey)) continue;
                    seen.add(installKey);
                    actions.push(installAction);
                }
                continue;
            }
        }

        const envKey = extractEnvKey(requirement);
        if (envKey) {
            const dedupeKey = `env:${envKey}`;
            if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                actions.push({ type: 'env', key: envKey, requirement });
            }
            continue;
        }

        const configPath = extractConfigPath(requirement);
        if (configPath) {
            const dedupeKey = `config:${configPath}`;
            if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                actions.push({ type: 'config', path: configPath, requirement });
            }
            continue;
        }

        const bin = extractBinary(requirement);
        if (bin) {
            const dedupeKey = `bin:${bin}`;
            if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                actions.push({ type: 'bin', bin, requirement });
            }
            continue;
        }

        if (isOsRequirement(requirement)) {
            actions.push({ type: 'os', requirement });
            continue;
        }

        actions.push({ type: 'unknown', requirement });
    }

    for (const installOption of normalizeInstallOptionsFromSkill(skill)) {
        const installAction = toInstallAction(installOption, 'Install missing dependency');
        if (!installAction) continue;
        const installKey = `install:${installAction.installId || installAction.command || installAction.label}`;
        if (seen.has(installKey)) continue;
        seen.add(installKey);
        actions.push(installAction);
    }

    const hasActionableFix = actions.some((action) =>
        action.type === 'env' || action.type === 'config' || action.type === 'bin' || action.type === 'install'
    );

    return {
        requirements,
        actions,
        hasActionableFix
    };
}
