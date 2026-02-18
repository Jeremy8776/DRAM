import type { DramBridgeApi } from './preload.js';

declare global {
  interface Window {
    dram: DramBridgeApi;
    __DRAM_STATE__?: any;
    dramTabs?: any;
    showDramWizardStep?: (...args: any[]) => any;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    webkitAudioContext?: typeof AudioContext;
  }
}

export {};
