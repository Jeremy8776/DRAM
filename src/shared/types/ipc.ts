import type { Dict, JsonValue } from './common.js';

export interface IpcEnvelope<TPayload = unknown> {
  type: 'req' | 'res' | 'evt';
  id?: string;
  method?: string;
  payload?: TPayload;
  error?: {
    code?: string | number;
    message: string;
  };
}

export interface RpcRequest<TParams = Dict> {
  type: 'req';
  id: string;
  method: string;
  params?: TParams;
}

export interface RpcResponse<TResult = JsonValue> {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: TResult;
  error?: {
    code?: string | number;
    message: string;
  };
}
