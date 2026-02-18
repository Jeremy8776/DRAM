export interface EngineConnectionInfo {
  connected: boolean;
  initialized: boolean;
  wsState?: number;
  configOnly?: boolean;
}

export interface EngineHealthStatus {
  status: 'ok' | 'degraded' | 'error' | 'unknown';
  message?: string;
  updatedAt?: string;
}

export interface OpenClawDiscoveryResult {
  found: boolean;
  source?: 'global' | 'bundled' | 'unknown';
  path?: string;
  version?: string;
  configPath?: string;
}
