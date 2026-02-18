import * as wizardLogicImpl from '../../../resources/renderer/modules/wizard-logic.impl.js';

export function setupWizardLogic(...args: any[]) {
    const fn = (wizardLogicImpl as any).setupWizardLogic;
    if (typeof fn === 'function') {
        return fn(...args);
    }
    throw new Error('setupWizardLogic is not available in wizard-logic implementation');
}




