/**
 * Channel-scoped onboarding state.
 * Prevents dev runs from satisfying packaged onboarding (and vice versa).
 */

const ONBOARDING_KEY_PREFIX = 'dram.onboardingComplete';

type OnboardingChannel = 'packaged' | 'dev';

let cachedChannel: OnboardingChannel | null = null;

async function resolveChannel(): Promise<OnboardingChannel> {
    if (cachedChannel) return cachedChannel;
    try {
        const info = await window.dram.app.getInfo();
        cachedChannel = info?.isPackaged ? 'packaged' : 'dev';
    } catch {
        cachedChannel = 'dev';
    }
    return cachedChannel;
}

export async function getOnboardingStorageKey(): Promise<string> {
    const channel = await resolveChannel();
    return `${ONBOARDING_KEY_PREFIX}.${channel}`;
}

export async function getOnboardingComplete(): Promise<boolean> {
    const key = await getOnboardingStorageKey();
    const value = await window.dram.storage.get(key);
    return value === true;
}

export async function setOnboardingComplete(value: boolean): Promise<void> {
    const key = await getOnboardingStorageKey();
    await window.dram.storage.set(key, value === true);
}

