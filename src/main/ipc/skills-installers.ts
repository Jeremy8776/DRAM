/**
 * DRAM IPC - Skills installer helpers
 */
import { spawn } from 'child_process';
function pushUniqueValue(target, value) {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    if (!target.includes(normalized)) target.push(normalized);
}

const GENERIC_INSTALLER_TOKENS = new Set([
    'node',
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'python',
    'python3',
    'pip',
    'pip3',
    'pipx',
    'cargo',
    'go',
    'java',
    'dotnet'
]);

const INSTALLER_PRIORITY_BY_PLATFORM = {
    win32: ['winget', 'choco', 'chocolatey', 'scoop', 'npm', 'node', 'pnpm', 'yarn', 'bun', 'pipx', 'pip3', 'pip', 'python3', 'python', 'cargo', 'go', 'dotnet'],
    darwin: ['brew', 'npm', 'node', 'pnpm', 'yarn', 'bun', 'pipx', 'pip3', 'pip', 'python3', 'python', 'cargo', 'go', 'dotnet'],
    linux: ['apt', 'apt-get', 'dnf', 'yum', 'pacman', 'zypper', 'apk', 'snap', 'npm', 'node', 'pnpm', 'yarn', 'bun', 'pipx', 'pip3', 'pip', 'python3', 'python', 'cargo', 'go', 'dotnet']
};

const INSTALLERS_SUPPORTED_BY_PLATFORM = {
    win32: new Set(['node', 'go', 'uv', 'winget', 'choco', 'chocolatey', 'scoop']),
    darwin: new Set(['node', 'go', 'uv', 'brew']),
    linux: new Set(['node', 'go', 'uv', 'apt', 'apt-get', 'dnf', 'yum', 'pacman', 'zypper', 'apk', 'snap', 'brew'])
};

function isInstallerSupportedOnCurrentPlatform(installerId) {
    const normalized = normalizeInstallerToken(installerId);
    if (!normalized) return false;
    if (normalized.startsWith('download')) return true;
    const supported = INSTALLERS_SUPPORTED_BY_PLATFORM[process.platform];
    if (!supported) return true;
    return supported.has(normalized);
}

export function isLikelyGenericInstallerToken(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return !!normalized && GENERIC_INSTALLER_TOKENS.has(normalized);
}

function normalizeInstallerToken(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return '';
    return normalized === 'npm' ? 'node' : normalized;
}

function sortInstallerIdsForPlatform(installIds = []) {
    const unique = [];
    installIds.forEach((value) => pushUniqueValue(unique, normalizeInstallerToken(value)));
    const priority = INSTALLER_PRIORITY_BY_PLATFORM[process.platform] || [];
    const rank = new Map<string, number>(priority.map((value, index) => [value, index] as [string, number]));
    return unique.sort((left, right) => {
        const leftRank = rank.has(left) ? (rank.get(left) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        const rightRank = rank.has(right) ? (rank.get(right) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.localeCompare(right);
    });
}

export function getPlatformDisplayName(platform = process.platform) {
    if (platform === 'win32') return 'Windows';
    if (platform === 'darwin') return 'macOS';
    if (platform === 'linux') return 'Linux';
    return String(platform || 'this platform');
}

function sanitizeBrewPackageName(value) {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    // Restrictive allowlist to avoid shell injection in `sh -lc` command payload.
    return /^[a-zA-Z0-9@._/+:-]+$/.test(normalized) ? normalized : '';
}

type CommandCaptureResult = {
    ok: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    errorCode: string;
};

function resolveBrewPackageName(installOption, fallbackSkillId = '') {
    if (!installOption || typeof installOption !== 'object') return '';
    const candidate = String(
        installOption.formula
        || installOption.package
        || installOption.pkg
        || installOption.name
        || ''
    ).trim();
    const sanitized = sanitizeBrewPackageName(candidate);
    if (sanitized) return sanitized;
    return sanitizeBrewPackageName(fallbackSkillId);
}

function runCommandCapture(command, args = [], timeoutMs = 120000): Promise<CommandCaptureResult> {
    return new Promise<CommandCaptureResult>((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let settled = false;
        let errorCode = '';
        const safeTimeout = Math.max(1000, Math.min(Number(timeoutMs) || 120000, 15 * 60 * 1000));

        const finalize = (payload: CommandCaptureResult) => {
            if (settled) return;
            settled = true;
            resolve(payload);
        };

        let child;
        try {
            child = spawn(command, args, { windowsHide: true, detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (err) {
            finalize({
                ok: false,
                exitCode: -1,
                stdout: '',
                stderr: String(err?.message || ''),
                timedOut: false,
                errorCode: String(err?.code || '')
            });
            return;
        }

        if (child.stdout) {
            child.stdout.on('data', (chunk) => {
                stdout += String(chunk || '');
                if (stdout.length > 100000) stdout = stdout.slice(-100000);
            });
        }
        if (child.stderr) {
            child.stderr.on('data', (chunk) => {
                stderr += String(chunk || '');
                if (stderr.length > 100000) stderr = stderr.slice(-100000);
            });
        }

        const timer = setTimeout(() => {
            timedOut = true;
            try { child.kill(); } catch { }
        }, safeTimeout);

        child.once('error', (err) => {
            errorCode = String(err?.code || '');
            clearTimeout(timer);
            finalize({
                ok: false,
                exitCode: -1,
                stdout: String(stdout || '').trim(),
                stderr: String(err?.message || stderr || '').trim(),
                timedOut: false,
                errorCode
            });
        });

        child.once('close', (code) => {
            clearTimeout(timer);
            const exitCode = typeof code === 'number' ? code : 1;
            finalize({
                ok: !timedOut && exitCode === 0,
                exitCode,
                stdout: String(stdout || '').trim(),
                stderr: String(stderr || '').trim(),
                timedOut,
                errorCode
            });
        });
    });
}

function normalizeCaptureOutput(output: unknown) {
    return String(output || '').toLowerCase();
}

let preferredWslDistro = '';
let preferredWslUser = '';
let wslAutomationBootstrapAttempted = false;
let wslAutomationBootstrapSucceeded = false;
let wslAdminBlocked = false;
let wslAdminBlockedMessage = '';
let wslElevationAttempted = false;
let wslElevationSucceeded = false;

function parseWslDistros(output: unknown) {
    return String(output || '')
        .split(/\r?\n/)
        .map((line) => String(line || '').replace(/\u0000/g, '').trim())
        .filter(Boolean)
        .filter((line) => !/^windows subsystem for linux/i.test(line));
}

function selectPreferredWslDistro(distros: string[] = []) {
    if (!Array.isArray(distros) || distros.length === 0) return '';
    const ubuntu = distros.find((name) => /ubuntu/i.test(name));
    if (ubuntu) return ubuntu;
    const nonDocker = distros.find((name) => !/^docker-desktop/i.test(name));
    return nonDocker || distros[0] || '';
}

function rememberPreferredWslDistro(output: unknown) {
    const distros = parseWslDistros(output);
    const selected = selectPreferredWslDistro(distros);
    if (selected) preferredWslDistro = selected;
    return distros;
}

function normalizeWhitespace(value: unknown) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function toPSSingleQuoted(value: unknown) {
    return `'${String(value || '').replace(/'/g, "''")}'`;
}

function isWslAdminBlockedOutput(output: unknown) {
    const text = normalizeCaptureOutput(output);
    if (!text) return false;
    return (
        text.includes('access is denied') ||
        text.includes('requested operation requires elevation') ||
        text.includes('this app has been blocked by your system administrator') ||
        text.includes('0x80070005')
    );
}

function markWslAdminBlocked(output: unknown) {
    if (!isWslAdminBlockedOutput(output)) return false;
    wslAdminBlocked = true;
    const condensed = normalizeWhitespace(output);
    wslAdminBlockedMessage = condensed
        ? `Windows policy blocked WSL setup (${condensed.slice(0, 220)}${condensed.length > 220 ? '...' : ''})`
        : 'Windows policy blocked WSL setup on this device.';
    return true;
}

function getWslAdminBlockedError() {
    return wslAdminBlockedMessage || 'Windows policy blocked WSL setup on this device.';
}

async function runCommandCaptureElevatedWindows(command, args = [], timeoutMs = 120000): Promise<CommandCaptureResult> {
    if (process.platform !== 'win32') {
        return {
            ok: false,
            exitCode: -1,
            stdout: '',
            stderr: 'Elevated execution is only supported on Windows',
            timedOut: false,
            errorCode: 'UNSUPPORTED_PLATFORM'
        };
    }

    const argListLiteral = Array.isArray(args) && args.length > 0
        ? args.map((entry) => toPSSingleQuoted(entry)).join(', ')
        : '';
    const psScript = [
        '$ErrorActionPreference = "Stop"',
        `$argList = @(${argListLiteral})`,
        `$proc = Start-Process -FilePath ${toPSSingleQuoted(command)} -ArgumentList $argList -Verb RunAs -Wait -PassThru`,
        'Write-Output ("__DRAM_ELEVATED_EXIT_CODE__=" + [string]$proc.ExitCode)'
    ].join('; ');

    const psResult = await runCommandCapture(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        timeoutMs
    );

    const combined = `${psResult.stdout}\n${psResult.stderr}`;
    const marker = combined.match(/__DRAM_ELEVATED_EXIT_CODE__=(\d+)/i);
    const elevatedExitCode = marker ? Number(marker[1]) : psResult.exitCode;
    const ok = !psResult.timedOut && psResult.exitCode === 0 && elevatedExitCode === 0;
    return {
        ok,
        exitCode: Number.isFinite(elevatedExitCode) ? elevatedExitCode : psResult.exitCode,
        stdout: psResult.stdout,
        stderr: psResult.stderr,
        timedOut: psResult.timedOut,
        errorCode: psResult.errorCode
    };
}

async function tryElevatedWslUnblock() {
    if (process.platform !== 'win32') return false;
    if (wslElevationSucceeded) return true;
    if (wslElevationAttempted) return false;
    wslElevationAttempted = true;

    const elevated = await runCommandCaptureElevatedWindows('wsl.exe', ['--status'], 180000);
    if (elevated.ok) {
        wslElevationSucceeded = true;
        wslAdminBlocked = false;
        wslAdminBlockedMessage = '';
        return true;
    }
    const detail = normalizeWhitespace(`${elevated.stderr}\n${elevated.stdout}`);
    if (detail) {
        wslAdminBlockedMessage = `Windows policy blocked elevated WSL launch (${detail.slice(0, 220)}${detail.length > 220 ? '...' : ''})`;
    }
    return false;
}

function isWslInteractiveBootOutput(output: unknown) {
    const text = normalizeCaptureOutput(output);
    if (!text) return false;
    return (
        text.includes('welcome to ubuntu') ||
        text.includes('queued start job for default target') ||
        text.includes('failed to connect to bus: no such file or directory') ||
        /(?:^|\n)\s*.+\s+login:\s*$/m.test(text)
    );
}

function isUnsupportedWslExecFlag(output: unknown) {
    const text = normalizeCaptureOutput(output);
    return (
        text.includes('unknown option') && text.includes('-e')
    ) || text.includes('invalid option -- e');
}

function hasLinuxbrewPrefixPermissionError(output: unknown) {
    const text = normalizeCaptureOutput(output);
    return (
        text.includes('insufficient permissions to install homebrew to "/home/linuxbrew/.linuxbrew"') ||
        text.includes('insufficient permissions to install homebrew to /home/linuxbrew/.linuxbrew')
    );
}

function buildWslBashArgs(script: string, {
    modern = true,
    distro = '',
    user = ''
}: { modern?: boolean; distro?: string; user?: string } = {}) {
    const args = [];
    const normalizedDistro = String(distro || '').trim();
    const normalizedUser = String(user || '').trim();
    if (normalizedDistro) args.push('-d', normalizedDistro);
    if (normalizedUser) args.push('-u', normalizedUser);
    if (modern) {
        args.push('-e', 'bash', '-lc', script);
    } else {
        args.push('bash', '-lc', script);
    }
    return args;
}

function buildWslRunPlans(script: string, modern = true) {
    const plans = [];
    const addPlan = (distro = '', user = '') => {
        const args = buildWslBashArgs(script, { modern, distro, user });
        const key = args.join('\u0000');
        if (!plans.some((entry) => entry.key === key)) {
            plans.push({ key, args });
        }
    };

    if (preferredWslDistro && preferredWslUser) addPlan(preferredWslDistro, preferredWslUser);
    if (preferredWslDistro) addPlan(preferredWslDistro, '');
    if (preferredWslUser) addPlan('', preferredWslUser);
    addPlan('', '');
    return plans;
}

async function bootstrapWslAutomationUser() {
    if (wslAutomationBootstrapSucceeded) return true;
    if (wslAutomationBootstrapAttempted) return false;
    wslAutomationBootstrapAttempted = true;

    const automationUser = 'dram';
    const provisionScript = [
        'set -euo pipefail',
        `usr="${automationUser}"`,
        'if ! id -u "$usr" >/dev/null 2>&1; then useradd -m -s /bin/bash "$usr"; fi',
        'mkdir -p "/home/$usr/.cache" "/home/$usr/.linuxbrew"',
        'chown -R "$usr":"$usr" "/home/$usr"',
        'echo "__DRAM_WSL_AUTOMATION_USER_READY__"'
    ].join('; ');

    const plans = [];
    const addRootPlan = (modern = true, distro = '') => {
        const args = buildWslBashArgs(provisionScript, { modern, distro, user: 'root' });
        const key = args.join('\u0000');
        if (!plans.some((entry) => entry.key === key)) {
            plans.push({ key, args });
        }
    };
    if (preferredWslDistro) {
        addRootPlan(true, preferredWslDistro);
        addRootPlan(false, preferredWslDistro);
    }
    addRootPlan(true, '');
    addRootPlan(false, '');

    for (const plan of plans) {
        const result = await runCommandCapture('wsl.exe', plan.args, 90000);
        const combined = `${result.stdout}\n${result.stderr}`;
        if (!result.timedOut && (result.ok || combined.includes('__DRAM_WSL_AUTOMATION_USER_READY__'))) {
            preferredWslUser = automationUser;
            wslAutomationBootstrapSucceeded = true;
            return true;
        }
    }
    return false;
}

async function runWslBash(script: string, timeoutMs = 120000, allowBootstrap = true, allowElevation = true) {
    let lastResult: CommandCaptureResult = {
        ok: false,
        exitCode: -1,
        stdout: '',
        stderr: '',
        timedOut: false,
        errorCode: ''
    };

    let modernSupported = true;
    for (const plan of buildWslRunPlans(script, true)) {
        const result = await runCommandCapture('wsl.exe', plan.args, timeoutMs);
        lastResult = result;
        if (result.ok) return result;
        const output = `${result.stdout}\n${result.stderr}`;
        if (markWslAdminBlocked(output)) {
            if (allowElevation) {
                const elevated = await tryElevatedWslUnblock();
                if (elevated) {
                    return runWslBash(script, timeoutMs, allowBootstrap, false);
                }
            }
            return result;
        }
        if (isUnsupportedWslExecFlag(output)) {
            modernSupported = false;
            break;
        }
    }

    if (!modernSupported || !lastResult.ok) {
        for (const plan of buildWslRunPlans(script, false)) {
            const result = await runCommandCapture('wsl.exe', plan.args, timeoutMs);
            lastResult = result;
            if (result.ok) return result;
            const output = `${result.stdout}\n${result.stderr}`;
            if (markWslAdminBlocked(output)) {
                if (allowElevation) {
                    const elevated = await tryElevatedWslUnblock();
                    if (elevated) {
                        return runWslBash(script, timeoutMs, allowBootstrap, false);
                    }
                }
                return result;
            }
        }
    }

    const combined = `${lastResult.stdout}\n${lastResult.stderr}`;
    if (markWslAdminBlocked(combined)) {
        if (allowElevation) {
            const elevated = await tryElevatedWslUnblock();
            if (elevated) {
                return runWslBash(script, timeoutMs, allowBootstrap, false);
            }
        }
        return lastResult;
    }
    if (allowBootstrap && isWslInteractiveBootOutput(combined)) {
        const bootstrapped = await bootstrapWslAutomationUser();
        if (bootstrapped) {
            return runWslBash(script, timeoutMs, false, allowElevation);
        }
    }

    return lastResult;
}

async function installUserSpaceHomebrewInWsl() {
    const script = [
        'set -euo pipefail',
        'prefix="$HOME/.linuxbrew"',
        'brew_bin="$prefix/bin/brew"',
        'if [ -x "$brew_bin" ]; then echo "__DRAM_USER_BREW_READY__"; exit 0; fi',
        'if ! command -v git >/dev/null 2>&1; then echo "git not found" >&2; exit 127; fi',
        'mkdir -p "$prefix"',
        'if [ ! -d "$prefix/Homebrew/.git" ]; then git clone --depth=1 https://github.com/Homebrew/brew "$prefix/Homebrew"; fi',
        'mkdir -p "$prefix/bin"',
        'ln -snf ../Homebrew/bin/brew "$prefix/bin/brew"',
        '"$brew_bin" --version >/dev/null',
        'echo "__DRAM_USER_BREW_READY__"'
    ].join('; ');
    return runWslBash(script, 10 * 60 * 1000);
}

async function detectWslAvailability() {
    if (wslAdminBlocked) {
        return {
            ok: false,
            reason: 'wsl_admin_blocked',
            error: getWslAdminBlockedError(),
            suggestedCommand: ''
        };
    }

    const wslList = await runCommandCapture('wsl.exe', ['-l', '-q'], 20000);
    const rawListOutput = `${wslList.stdout}\n${wslList.stderr}`;
    if (markWslAdminBlocked(rawListOutput)) {
        const elevated = await tryElevatedWslUnblock();
        if (elevated) {
            const retryList = await runCommandCapture('wsl.exe', ['-l', '-q'], 20000);
            const retryOutput = `${retryList.stdout}\n${retryList.stderr}`;
            if (!markWslAdminBlocked(retryOutput)) {
                rememberPreferredWslDistro(retryOutput);
                const retryLower = retryOutput.toLowerCase();
                if (retryList.exitCode === 0 && !/no installed distributions/.test(retryLower)) {
                    return { ok: true, reason: '', error: '', suggestedCommand: '' };
                }
            }
        }
        return {
            ok: false,
            reason: 'wsl_admin_blocked',
            error: getWslAdminBlockedError(),
            suggestedCommand: ''
        };
    }
    rememberPreferredWslDistro(rawListOutput);
    const listOutput = rawListOutput.toLowerCase();
    if (wslList.errorCode === 'ENOENT' || /not recognized as an internal or external command/.test(listOutput)) {
        return {
            ok: false,
            reason: 'wsl_missing',
            error: 'Windows Subsystem for Linux is not installed',
            suggestedCommand: 'wsl --install'
        };
    }
    if (/no installed distributions/.test(listOutput)) {
        return {
            ok: false,
            reason: 'wsl_missing',
            error: 'WSL is installed, but no Linux distribution is configured',
            suggestedCommand: 'wsl --install'
        };
    }
    if (wslList.exitCode !== 0) {
        return {
            ok: false,
            reason: 'wsl_missing',
            error: wslList.stderr || 'Unable to access WSL runtime',
            suggestedCommand: 'wsl --install'
        };
    }

    // Verify WSL can execute non-interactive shell commands.
    const probe = await runWslBash('printf "__DRAM_WSL_READY__\\n"', 30000);
    const probeOutput = `${probe.stdout}\n${probe.stderr}`;
    if (markWslAdminBlocked(probeOutput)) {
        return {
            ok: false,
            reason: 'wsl_admin_blocked',
            error: getWslAdminBlockedError(),
            suggestedCommand: ''
        };
    }
    if (probe.timedOut || !probeOutput.includes('__DRAM_WSL_READY__')) {
        if (isWslInteractiveBootOutput(probeOutput)) {
            return {
                ok: false,
                reason: 'wsl_not_ready',
                error: 'WSL started but opened an interactive login session. Finish initial distro setup, then retry skill setup.',
                suggestedCommand: 'wsl -d Ubuntu'
            };
        }
        return {
            ok: false,
            reason: 'wsl_not_ready',
            error: probe.stderr || probe.stdout || 'WSL is installed but did not execute Linux commands.',
            suggestedCommand: 'wsl -d Ubuntu'
        };
    }

    return { ok: true, reason: '', error: '', suggestedCommand: '' };
}

async function resolveWslBrewBinary() {
    const detectScript = 'if command -v brew >/dev/null 2>&1; then type -P brew || command -v brew; ' +
        'elif [ -x "$HOME/.linuxbrew/bin/brew" ]; then echo "$HOME/.linuxbrew/bin/brew"; ' +
        'elif [ -x "/home/linuxbrew/.linuxbrew/bin/brew" ]; then echo "/home/linuxbrew/.linuxbrew/bin/brew"; ' +
        'else exit 127; fi';
    const brewCheck = await runWslBash(detectScript, 20000);
    if (brewCheck.exitCode !== 0) {
        const output = `${brewCheck.stdout}\n${brewCheck.stderr}`;
        if (isWslInteractiveBootOutput(output)) {
            return {
                ok: false,
                reason: 'wsl_not_ready',
                error: 'WSL started but did not run Linux commands. Finish distro initialization and retry setup.',
                brewPath: ''
            };
        }
        return {
            ok: false,
            reason: 'wsl_brew_missing',
            error: 'WSL is available, but Homebrew is not installed in WSL',
            brewPath: ''
        };
    }
    const brewPath = String(brewCheck.stdout || '').trim().split(/\r?\n/).pop() || '';
    return {
        ok: Boolean(brewPath),
        reason: brewPath ? '' : 'wsl_brew_missing',
        error: brewPath ? '' : 'WSL is available, but Homebrew is not installed in WSL',
        brewPath
    };
}

export async function installHomebrewInWsl() {
    if (process.platform !== 'win32') {
        return { success: false, reason: 'unsupported_platform', installer: 'brew', error: 'WSL Homebrew setup is only available on Windows' };
    }
    const hasElectronRuntime = Boolean(process?.versions?.electron);
    if (!hasElectronRuntime) {
        return { success: false, reason: 'unsupported_platform', installer: 'brew', error: 'WSL Homebrew setup is only available in desktop runtime' };
    }

    const wslState = await detectWslAvailability();
    if (!wslState.ok) {
        return {
            success: false,
            reason: wslState.reason || 'wsl_missing',
            installer: 'brew',
            error: wslState.error || 'WSL is not available',
            suggestedCommand: wslState.suggestedCommand || 'wsl --install'
        };
    }

    const existingBrew = await resolveWslBrewBinary();
    if (existingBrew.ok) {
        return { success: true, data: { installed: true, via: 'wsl', installer: 'brew', alreadyInstalled: true } };
    }

    const installScript = [
        'set -euo pipefail',
        'tmp="$(mktemp /tmp/homebrew-install.XXXXXX.sh)"',
        'url="https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"',
        'cleanup(){ rm -f "$tmp"; }',
        'trap cleanup EXIT',
        'if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" > "$tmp"; elif command -v wget >/dev/null 2>&1; then wget -qO "$tmp" "$url"; else echo "curl/wget not found" >&2; exit 127; fi',
        '[ -s "$tmp" ] || { echo "installer download failed" >&2; exit 1; }',
        'sed -i \'s/\\r$//\' "$tmp"',
        'export NONINTERACTIVE=1 CI=1',
        '/bin/bash "$tmp"'
    ].join('; ');
    const installResult = await runWslBash(installScript, 20 * 60 * 1000);
    if (installResult.timedOut) {
        return {
            success: false,
            reason: 'wsl_install_failed',
            installer: 'brew',
            error: 'Timed out while installing Homebrew in WSL'
        };
    }
    if (installResult.exitCode !== 0) {
        const combinedOutput = `${installResult.stderr}\n${installResult.stdout}`.toLowerCase();
        if (hasLinuxbrewPrefixPermissionError(combinedOutput)) {
            const fallbackResult = await installUserSpaceHomebrewInWsl();
            const fallbackOutput = `${fallbackResult.stderr}\n${fallbackResult.stdout}`.toLowerCase();
            if (!fallbackResult.timedOut && (fallbackResult.ok || fallbackOutput.includes('__dram_user_brew_ready__'))) {
                const verifyFallbackBrew = await resolveWslBrewBinary();
                if (verifyFallbackBrew.ok) {
                    return {
                        success: true,
                        data: {
                            installed: true,
                            via: 'wsl',
                            installer: 'brew',
                            brewPath: verifyFallbackBrew.brewPath || '',
                            installMode: 'user-space',
                            unsupportedMode: true
                        }
                    };
                }
            }
            if (isWslInteractiveBootOutput(fallbackOutput)) {
                return {
                    success: false,
                    reason: 'wsl_not_ready',
                    installer: 'brew',
                    error: 'WSL started but dropped into a Linux login prompt. Finish WSL distro initialization, then retry setup.'
                };
            }
            if (fallbackResult.timedOut) {
                return {
                    success: false,
                    reason: 'wsl_install_failed',
                    installer: 'brew',
                    error: 'Timed out while preparing user-space Homebrew in WSL'
                };
            }
            if (fallbackOutput.includes('git not found')) {
                return {
                    success: false,
                    reason: 'wsl_install_failed',
                    installer: 'brew',
                    error: 'WSL runtime setup needs git before Homebrew can be prepared. Install git in WSL and retry.'
                };
            }
            return {
                success: false,
                reason: 'wsl_install_failed',
                installer: 'brew',
                error: fallbackResult.stderr || fallbackResult.stdout || 'Unable to prepare user-space Homebrew in WSL'
            };
        }
        if (isWslInteractiveBootOutput(combinedOutput)) {
            return {
                success: false,
                reason: 'wsl_not_ready',
                installer: 'brew',
                error: 'WSL started but dropped into a Linux login prompt. Finish WSL distro initialization, then retry setup.'
            };
        }
        if (combinedOutput.includes('need sudo access on macos') || combinedOutput.includes('syntax error near unexpected token')) {
            return {
                success: false,
                reason: 'wsl_install_failed',
                installer: 'brew',
                error: 'Dependency bootstrap failed in WSL shell. Please ensure WSL is using a Linux distro (e.g. Ubuntu), then retry setup.'
            };
        }
        if (combinedOutput.includes('line 1: : no such file or directory') || combinedOutput.includes('curl/wget not found') || combinedOutput.includes('installer download failed')) {
            return {
                success: false,
                reason: 'wsl_install_failed',
                installer: 'brew',
                error: 'WSL dependency bootstrap failed. Verify WSL is initialized with a Linux distro and has network access, then retry setup.'
            };
        }
        return {
            success: false,
            reason: 'wsl_install_failed',
            installer: 'brew',
            error: installResult.stderr || installResult.stdout || 'Homebrew install failed in WSL'
        };
    }

    const verifyBrew = await resolveWslBrewBinary();
    if (!verifyBrew.ok) {
        return {
            success: false,
            reason: 'wsl_install_failed',
            installer: 'brew',
            error: 'Homebrew install finished, but brew is still not resolvable in WSL shell'
        };
    }

    return {
        success: true,
        data: {
            installed: true,
            via: 'wsl',
            installer: 'brew',
            brewPath: verifyBrew.brewPath || '',
            stdout: installResult.stdout,
            stderr: installResult.stderr
        }
    };
}

export async function tryInstallViaWslBrew(installOption, fallbackSkillId = '') {
    if (process.platform !== 'win32') {
        return { success: false, reason: 'unsupported_platform', installer: 'brew', error: 'WSL fallback is only available on Windows' };
    }

    const hasElectronRuntime = Boolean(process?.versions?.electron);
    if (!hasElectronRuntime) {
        return { success: false, reason: 'unsupported_platform', installer: 'brew', error: 'WSL fallback is only available in desktop runtime' };
    }

    const wslState = await detectWslAvailability();
    if (!wslState.ok) {
        return {
            success: false,
            reason: wslState.reason || 'wsl_missing',
            installer: 'brew',
            error: wslState.error || 'Unable to access WSL runtime',
            suggestedCommand: wslState.suggestedCommand || 'wsl --install'
        };
    }

    const brewBinary = await resolveWslBrewBinary();
    if (!brewBinary.ok) {
        return {
            success: false,
            reason: brewBinary.reason || 'wsl_brew_missing',
            installer: 'brew',
            error: brewBinary.error || 'WSL is available, but Homebrew is not installed in WSL'
        };
    }

    const packageName = resolveBrewPackageName(installOption, fallbackSkillId);
    if (!packageName) {
        return {
            success: false,
            reason: 'wsl_brew_missing',
            installer: 'brew',
            error: 'Homebrew formula is not defined for this skill'
        };
    }

    const brewPath = String(brewBinary.brewPath || '').trim();
    const safeBrewPath = brewPath.replace(/\\/g, '/');
    if (!safeBrewPath) {
        return {
            success: false,
            reason: 'wsl_brew_missing',
            installer: 'brew',
            error: 'WSL Homebrew path could not be resolved'
        };
    }
    const escapedBrewPath = safeBrewPath.replace(/"/g, '\\"');
    const installScript = [
        'set -euo pipefail',
        `brew_path="${escapedBrewPath}"`,
        '[ -n "$brew_path" ] || { echo "brew path empty" >&2; exit 127; }',
        'if [ ! -x "$brew_path" ] && ! command -v "$brew_path" >/dev/null 2>&1; then echo "brew binary not executable" >&2; exit 127; fi',
        '"$brew_path" install ' + packageName
    ].join('; ');
    const installResult = await runWslBash(installScript, 15 * 60 * 1000);
    const combined = `${installResult.stdout}\n${installResult.stderr}`.toLowerCase();
    if (installResult.exitCode === 0 || /already installed/.test(combined)) {
        return {
            success: true,
            data: {
                installed: true,
                via: 'wsl',
                installer: 'brew',
                package: packageName,
                brewPath: safeBrewPath,
                stdout: installResult.stdout,
                stderr: installResult.stderr
            }
        };
    }

    if (installResult.timedOut) {
        return {
            success: false,
            reason: 'wsl_install_failed',
            installer: 'brew',
            error: 'Timed out while installing Homebrew dependency in WSL'
        };
    }
    if (isWslInteractiveBootOutput(combined)) {
        return {
            success: false,
            reason: 'wsl_not_ready',
            installer: 'brew',
            error: 'WSL started but did not execute commands (interactive login detected). Finish distro setup, then retry.'
        };
    }
    if (combined.includes('line 1: : no such file or directory') || combined.includes('brew path empty') || combined.includes('brew binary not executable')) {
        return {
            success: false,
            reason: 'wsl_brew_missing',
            installer: 'brew',
            error: 'WSL Homebrew runtime is present but the brew executable path is invalid'
        };
    }

    return {
        success: false,
        reason: 'wsl_install_failed',
        installer: 'brew',
        error: installResult.stderr || installResult.stdout || 'WSL Homebrew install failed'
    };
}

export function expandIdentifierVariants(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];
    const variants = [];
    pushUniqueValue(variants, raw);

    // Common OpenClaw skill-id forms
    const noScope = raw.replace(/^@dram\//i, '');
    pushUniqueValue(variants, noScope);
    pushUniqueValue(variants, noScope.replace(/^skills?\//i, ''));
    pushUniqueValue(variants, noScope.replace(/\//g, '-'));

    const parts = noScope.split('/').filter(Boolean);
    if (parts.length > 0) {
        pushUniqueValue(variants, parts[parts.length - 1]);
    }

    return variants;
}

export function buildSkillInstallCandidates(skill, requestedId) {
    const installIds = [];
    const optionInstallIds = [];
    const names = [];
    const legacyIds = [];
    const legacyKeys = [];
    const installOptionByInstaller = new Map();

    expandIdentifierVariants(requestedId).forEach((variant) => {
        pushUniqueValue(installIds, variant);
        pushUniqueValue(names, variant);
        pushUniqueValue(legacyIds, variant);
        pushUniqueValue(legacyKeys, variant);
    });

    const hasSkillContext = Boolean(skill && typeof skill === 'object');
    if (hasSkillContext) {
        [skill.name, skill.id, skill.skillKey].forEach((value) => {
            expandIdentifierVariants(value).forEach((variant) => {
                pushUniqueValue(names, variant);
                pushUniqueValue(installIds, variant);
            });
        });
        expandIdentifierVariants(skill.id).forEach((variant) => pushUniqueValue(legacyIds, variant));
        expandIdentifierVariants(skill.skillKey).forEach((variant) => pushUniqueValue(legacyKeys, variant));

        const installOptions = Array.isArray(skill.installOptions) ? skill.installOptions : [];
        for (const option of installOptions) {
            if (!option || typeof option !== 'object') continue;
            const installerToken = normalizeInstallerToken(
                option.installId || option.installerId || option.installer || option.manager || option.kind || option.id || ''
            );
            if (installerToken && !installOptionByInstaller.has(installerToken)) {
                installOptionByInstaller.set(installerToken, option);
            }
            [
                option.installId,
                option.installerId,
                option.installer,
                option.manager,
                option.kind,
                option.id
            ].forEach((value) => {
                expandIdentifierVariants(value).forEach((variant) => {
                    pushUniqueValue(optionInstallIds, variant);
                });
            });
            [option.name, option.id, option.slug, option.package].forEach((value) => {
                expandIdentifierVariants(value).forEach((variant) => pushUniqueValue(names, variant));
            });
            expandIdentifierVariants(option.id).forEach((variant) => pushUniqueValue(legacyIds, variant));
            expandIdentifierVariants(option.key).forEach((variant) => pushUniqueValue(legacyKeys, variant));
        }
    }

    const combinedParams = [];
    const installIdParams = [];
    const nameParams = [];
    const legacy = [];
    const sortedOptionInstallIds = sortInstallerIdsForPlatform(optionInstallIds);
    const supportedOptionInstallIds = sortedOptionInstallIds.filter((installId) => isInstallerSupportedOnCurrentPlatform(installId));
    const hasExplicitInstallers = supportedOptionInstallIds.length > 0;
    const unsupportedOptionInstallIds = sortedOptionInstallIds.filter((installId) => !isInstallerSupportedOnCurrentPlatform(installId));
    const installerMetadataUnsupportedOnPlatform = sortedOptionInstallIds.length > 0 && supportedOptionInstallIds.length === 0;

    const preferredSkillNames = [];
    [skill?.name, skill?.id, skill?.skillKey, requestedId].forEach((value) => {
        expandIdentifierVariants(value)
            .filter((variant) => !isLikelyGenericInstallerToken(variant))
            .forEach((variant) => pushUniqueValue(preferredSkillNames, variant));
    });
    if (preferredSkillNames.length === 0) {
        names
            .filter((name) => !isLikelyGenericInstallerToken(name))
            .forEach((name) => pushUniqueValue(preferredSkillNames, name));
    }

    // Prefer installer ids discovered from OpenClaw metadata (e.g. node/go/brew)
    // paired with actual skill names.
    supportedOptionInstallIds.forEach((installId) => {
        preferredSkillNames.forEach((name) => {
            combinedParams.push({ installId, name });
        });
    });

    if (!hasExplicitInstallers && !hasSkillContext) {
        // Only use blind fallback when we cannot resolve a concrete skill entry.
        installIds.forEach((installId) => {
            if (isLikelyGenericInstallerToken(installId)) return;
            combinedParams.push({ installId, name: installId });
        });
    }

    if (hasExplicitInstallers) {
        supportedOptionInstallIds.forEach((installId) => installIdParams.push({ installId }));
    } else {
        installIds
            .filter((installId) => !isLikelyGenericInstallerToken(installId))
            .forEach((installId) => installIdParams.push({ installId }));
    }
    names
        .filter((name) => !isLikelyGenericInstallerToken(name))
        .forEach((name) => nameParams.push({ name }));
    legacyKeys.forEach((skillKey) => legacy.push({ skillKey }));
    legacyIds.forEach((id) => legacy.push({ id }));

    const dedupe = (paramsList) => paramsList.filter((value, idx, arr) =>
        arr.findIndex((entry) => JSON.stringify(entry) === JSON.stringify(value)) === idx
    );

    return {
        combined: dedupe(combinedParams).slice(0, 8),
        installIds: dedupe(installIdParams),
        names: dedupe(nameParams),
        legacy: dedupe(legacy),
        hasExplicitInstallers,
        installerMetadataUnsupportedOnPlatform,
        unsupportedInstaller: String(unsupportedOptionInstallIds[0] || ''),
        unsupportedInstallOption: installOptionByInstaller.get(String(unsupportedOptionInstallIds[0] || '').trim()) || null
    };
}

export function classifyInstallFailureMessage(message, requestedPrimary = '') {
    const text = String(message || '').trim();
    if (!text) return { reason: '', installer: '' };
    const normalized = text.toLowerCase();

    if (isWslAdminBlockedOutput(normalized)) {
        return { reason: 'wsl_admin_blocked', installer: 'brew' };
    }

    if (
        normalized.includes('welcome to ubuntu') ||
        normalized.includes('queued start job for default target') ||
        normalized.includes('failed to connect to bus: no such file or directory') ||
        /(?:^|\n)\s*.+\s+login:\s*$/m.test(normalized)
    ) {
        return { reason: 'wsl_not_ready', installer: 'brew' };
    }

    if (/no installed distributions/i.test(text)) {
        return { reason: 'wsl_missing', installer: 'brew' };
    }

    if (/unknown method:\s*skills\.install/i.test(text)) {
        return { reason: 'unsupported', installer: '' };
    }

    const missingInstaller = text.match(/installer not found:\s*([^\s]+)/i);
    if (missingInstaller) {
        const installer = String(missingInstaller[1] || '').trim();
        if (!requestedPrimary || installer.toLowerCase() === requestedPrimary.toLowerCase()) {
            return { reason: 'installer_missing', installer };
        }
        return { reason: 'installer_missing', installer };
    }

    if (/skill not found:/i.test(text)) {
        return { reason: 'skill_missing', installer: '' };
    }

    const missingTool = text.match(/^([a-z0-9_.-]+)\s+not installed\b/i);
    if (missingTool) {
        return { reason: 'tool_missing', installer: String(missingTool[1] || '').trim() };
    }
    if (/\bnot installed\b/i.test(text)) {
        return { reason: 'tool_missing', installer: '' };
    }

    if (/invalid .*params|must have required property|unexpected property/i.test(normalized)) {
        return { reason: 'invalid_request', installer: '' };
    }

    return { reason: 'failed', installer: '' };
}


