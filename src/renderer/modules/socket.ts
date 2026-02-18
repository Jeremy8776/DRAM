import * as impl from '../../../resources/renderer/modules/socket.impl.js';

export const connect = (...args: any[]) => (impl as any).connect(...args);
export const handleMessage = (...args: any[]) => (impl as any).handleMessage(...args);
export const handleHistoryResponse = (...args: any[]) => (impl as any).handleHistoryResponse(...args);
export const loadHistory = (...args: any[]) => (impl as any).loadHistory(...args);
export const resetChat = (...args: any[]) => (impl as any).resetChat(...args);
export const sendMessage = (...args: any[]) => (impl as any).sendMessage(...args);
export const cancelActiveRequest = (...args: any[]) => (impl as any).cancelActiveRequest(...args);
export const buildOutboundMessageWithContext = (...args: any[]) => (impl as any).buildOutboundMessageWithContext(...args);
export const refreshCanvasContextChipForDraft = (...args: any[]) => (impl as any).refreshCanvasContextChipForDraft(...args);




