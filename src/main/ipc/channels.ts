/**
 * DRAM IPC - Channel Handlers
 * Manages messaging channel accounts and status.
 */

/**
 * Register channel-related IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 * @param {Function} internalRequest - Helper to make internal requests to DramEngine
 */
export function registerChannelHandlers(ipc, internalRequest) {
    function normalizeChannelRows(raw: any) {
        if (Array.isArray(raw)) return raw;
        if (!raw || typeof raw !== 'object') return [];
        if (Array.isArray(raw.channels)) return raw.channels;
        if (raw.channels && typeof raw.channels === 'object') {
            return Object.entries(raw.channels).map(([key, value]) => {
                if (value && typeof value === 'object') {
                    return { id: key, type: key, ...(value as Record<string, any>) };
                }
                return { id: key, type: key, name: key, status: String(value || 'unknown') };
            });
        }
        if (Array.isArray(raw.items)) return raw.items;
        if (Array.isArray(raw.list)) return raw.list;
        if (Array.isArray(raw.accounts)) return raw.accounts;
        if (raw.accounts && typeof raw.accounts === 'object') {
            return Object.entries(raw.accounts).map(([key, value]) => {
                if (value && typeof value === 'object') {
                    return { id: key, ...(value as Record<string, any>) };
                }
                return { id: key, name: key, status: String(value || 'unknown') };
            });
        }
        return Object.entries(raw).map(([key, value]) => {
            if (value && typeof value === 'object') {
                return { id: key, ...(value as Record<string, any>) };
            }
            return { id: key, name: key, status: String(value || 'unknown') };
        });
    }

    function normalizeConfigChannelRows(rawConfigPayload: any) {
        const cfg = rawConfigPayload?.config && typeof rawConfigPayload.config === 'object'
            ? rawConfigPayload.config
            : rawConfigPayload;
        const channelsRoot = cfg?.channels;
        if (!channelsRoot || typeof channelsRoot !== 'object' || Array.isArray(channelsRoot)) return [];

        const rows: any[] = [];
        for (const [channelId, channelCfg] of Object.entries(channelsRoot as Record<string, any>)) {
            if (!channelCfg || typeof channelCfg !== 'object' || Array.isArray(channelCfg)) continue;
            const base = {
                id: channelId,
                name: String((channelCfg as any).name || channelId),
                type: String((channelCfg as any).type || channelId),
                status: (channelCfg as any).enabled === false ? 'disabled' : 'configured'
            };
            const accounts = (channelCfg as any).accounts;
            if (Array.isArray(accounts)) {
                for (const account of accounts) {
                    if (!account || typeof account !== 'object') continue;
                    const accountId = String((account as any).id || (account as any).accountId || '');
                    rows.push({
                        ...base,
                        ...account,
                        id: accountId ? `${channelId}:${accountId}` : base.id,
                        channelId,
                        account: (account as any).account || (account as any).number || (account as any).phone || accountId || null
                    });
                }
                continue;
            }
            if (accounts && typeof accounts === 'object') {
                for (const [accountId, accountCfg] of Object.entries(accounts as Record<string, any>)) {
                    if (!accountCfg || typeof accountCfg !== 'object' || Array.isArray(accountCfg)) continue;
                    rows.push({
                        ...base,
                        ...(accountCfg as Record<string, any>),
                        id: `${channelId}:${accountId}`,
                        channelId,
                        account: (accountCfg as any).account || (accountCfg as any).number || (accountCfg as any).phone || accountId || null
                    });
                }
                continue;
            }
            rows.push({
                ...base,
                ...(channelCfg as Record<string, any>),
                account: (channelCfg as any).account || (channelCfg as any).number || (channelCfg as any).phone || null
            });
        }

        return rows;
    }

    /**
     * Get channel accounts and status
     */
    ipc.handle('util:getChannels', async () => {
        try {
            const statusRes = await internalRequest('channels.status');
            const runtimeChannels = normalizeChannelRows(statusRes?.data);

            let channels = runtimeChannels;
            if (channels.length === 0) {
                const configRes = await internalRequest('config.get');
                channels = normalizeConfigChannelRows(configRes?.data);
            }

            const mapped = channels.map(c => ({
                id: c.id || c.channelId || c.name || 'unknown',
                name: c.name || c.channelId || c.id || 'Unknown',
                type: c.type || c.channel || 'unknown',
                status: c.status || c.state || (c.connected ? 'linked' : 'offline'),
                account: c.account || c.accountId || c.number || c.phone || null,
                lastActive: c.lastActive || c.lastSeen || c.updatedAt || null
            }));

            // Keep only first seen row per ID to prevent duplicate cards.
            const deduped = new Map<string, any>();
            for (const row of mapped) {
                const id = String(row.id || '').trim() || 'unknown';
                if (!deduped.has(id)) deduped.set(id, row);
            }
            return Array.from(deduped.values());
        } catch (err) {
            console.error('util:getChannels error:', err);
            return [];
        }
    });
}




