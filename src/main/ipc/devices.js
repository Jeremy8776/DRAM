/**
 * DRAM IPC - Device Handlers
 * Manages device pairing and authentication.
 */
import { validateString } from '../ipc-validation.js';

/**
 * Register device-related IPC handlers
 * @param {import('electron').IpcMain} ipcMain
 * @param {Function} internalRequest - Helper to make internal requests to DramEngine
 */
export function registerDeviceHandlers(ipc, internalRequest) {
    /**
     * Get paired/pending devices
     */
    ipc.handle('util:getDevices', async () => {
        try {
            const { data } = await internalRequest('device.pair.list');
            // Handle various response formats
            const pairs = data?.pairs || data?.devices || data || [];
            if (!Array.isArray(pairs)) return [];

            return pairs.map(d => ({
                id: d.id || d.deviceId || 'unknown',
                name: d.name || d.deviceName || d.id || 'Unknown',
                type: d.type || 'unknown',
                status: d.status || 'pending',
                lastSeen: d.lastSeen || d.lastSeenAt || null,
                pairingCode: d.pairingCode || d.code || null
            }));
        } catch (err) {
            console.error('util:getDevices error:', err);
            return [];
        }
    });

    ipc.handle('util:approveDevice', async (event, deviceId) => {
        try {
            validateString(deviceId, 100);
            await internalRequest('device.pair.approve', { deviceId });
            return true;
        } catch (err) {
            console.error('util:approveDevice error:', err);
            throw err;
        }
    });

    ipc.handle('util:rejectDevice', async (event, deviceId) => {
        try {
            validateString(deviceId, 100);
            await internalRequest('device.pair.reject', { deviceId });
            return true;
        } catch (err) {
            console.error('util:rejectDevice error:', err);
            throw err;
        }
    });

    ipc.handle('util:unpairDevice', async (event, deviceId) => {
        try {
            validateString(deviceId, 100);
            await internalRequest('device.token.revoke', { deviceId });
            return true;
        } catch (err) {
            console.error('util:unpairDevice error:', err);
            throw err;
        }
    });
}
