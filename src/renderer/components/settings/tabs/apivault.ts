/**
 * API Vault Settings Tab
 */
import { renderSecureKey, renderSection } from '../../../modules/ui-components.js';

export function renderApiVaultTab() {
    const credentialsContent = `
        ${renderSecureKey({
        id: 'setting-key-anthropic',
        label: 'Anthropic Key',
        description: 'Required for Claude Opus/Sonnet modules.',
        placeholder: 'sk-ant-...'
    })}
        ${renderSecureKey({
        id: 'setting-key-openai',
        label: 'OpenAI Key',
        description: 'Backbone for GPT-4o systems.',
        placeholder: 'sk-...'
    })}
        ${renderSecureKey({
        id: 'setting-key-google',
        label: 'Google Gemini Key',
        description: 'Required for Gemini 1.5 Pro/Flash.',
        placeholder: 'AIza...'
    })}
        ${renderSecureKey({
        id: 'setting-key-groq',
        label: 'Groq Key',
        description: 'LPU acceleration infrastructure.',
        placeholder: 'gsk_...'
    })}
        ${renderSecureKey({
        id: 'setting-key-elevenlabs',
        label: 'ElevenLabs Key',
        description: 'Advanced neural text-to-speech.',
        placeholder: 'sk_...'
    })}
    `;

    return `
        <div id="tab-apivault" class="settings-tab-content hidden">
            ${renderSection({
        title: 'Neural Credentials',
        subtitle: 'Securely manage your AI provider keys.',
        content: credentialsContent
    })}
        </div>
    `;
}




