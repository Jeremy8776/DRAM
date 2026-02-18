import type { Dict, JsonValue } from './common.js';

export interface SocketConnectPayload {
  url?: string;
  token?: string;
}

export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'idle';

export interface SocketRequest {
  type: 'req';
  id: string;
  method: string;
  params?: Dict;
}

export interface SocketEvent {
  type: 'evt';
  event: string;
  payload?: JsonValue;
}

export interface SocketResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: JsonValue;
  error?: {
    code?: string | number;
    message: string;
  };
}
