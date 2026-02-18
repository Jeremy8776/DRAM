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
    /**
     * Get channel accounts and status
     */
    ipc.handle('util:getChannels', async () => {
        try {
            const { data } = await internalRequest('channels.status');
            // The response format may vary, handle both formats
            const channels = data?.channels || data || [];
            if (!Array.isArray(channels)) return [];

            return channels.map(c => ({
                id: c.id || c.channelId || 'unknown',
                name: c.name || c.id || 'Unknown',
                type: c.type || 'unknown',
                status: c.status || 'offline',
                account: c.account || c.accountId || null,
                lastActive: c.lastActive || c.lastSeen || null
            }));
        } catch (err) {
            console.error('util:getChannels error:', err);
            return [];
        }
    });
}




