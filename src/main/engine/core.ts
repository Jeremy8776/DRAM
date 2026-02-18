import * as coreImpl from '../../../resources/main/engine/core.impl.js';

const impl: any = coreImpl;

export const getDramEngine = (...args: any[]) => impl.getDramEngine(...args);
export const peekDramEngine = (...args: any[]) => impl.peekDramEngine(...args);
export const killGatewayProcessesOnPort = (...args: any[]) => impl.killGatewayProcessesOnPort(...args);

export default impl;

