import type { Dict, JsonValue } from './common.js';
import type { SocketStatus } from './socket.js';

export type Unsubscribe = () => void;

export interface PathApi {
  join(...parts: string[]): string;
  basename(p: string, ext?: string): string;
  dirname(p: string): string;
  extname(p: string): string;
  normalize(p: string): string;
  isAbsolute(p: string): boolean;
}

export interface SocketApi {
  connect(url?: string, token?: string): void;
  send(payload: Dict): void;
  onStatus(callback: (status: SocketStatus) => void): Unsubscribe;
  onData(callback: (data: string) => void): Unsubscribe;
}

export interface CanvasApi {
  getStatus(): Promise<any>;
  sendA2UIAction(action: Dict): Promise<any>;
  pushA2UI(options: Dict): Promise<any>;
  reset(): Promise<any>;
  snapshot(): Promise<any>;
}

export interface StorageApi {
  get(key: string): Promise<any>;
  set(key: string, value: unknown): Promise<any>;
  delete(key: string): Promise<any>;
  getAll(): Promise<Record<string, unknown>>;
  isEncrypted(): Promise<boolean>;
  wipe(): Promise<any>;
}

export interface BridgeNamespace {
  [methodName: string]: any;
}

export interface DramBridgeApi {
  storage: StorageApi;
  gateway: BridgeNamespace;
  window: BridgeNamespace;
  shell: BridgeNamespace;
  dialog: BridgeNamespace;
  app: BridgeNamespace;
  fs: BridgeNamespace;
  canvas: CanvasApi;
  util: BridgeNamespace;
  updater: BridgeNamespace;
  socket: SocketApi;
  on(channel: string, callback: (...args: any[]) => void): Unsubscribe;
  platform: string;
  path: PathApi;
}
