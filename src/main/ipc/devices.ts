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
    function normalizeDeviceRows(raw: any) {
        if (Array.isArray(raw)) return raw;
        if (!raw || typeof raw !== 'object') return [];
        if (Array.isArray(raw.pairs)) return raw.pairs;
        if (raw.pairs && typeof raw.pairs === 'object') {
            return Object.entries(raw.pairs).map(([key, value]) => {
                if (value && typeof value === 'object') {
                    return { id: key, ...(value as Record<string, any>) };
                }
                return { id: key, name: key, status: String(value || 'unknown') };
            });
        }
        if (Array.isArray(raw.devices)) return raw.devices;
        if (raw.devices && typeof raw.devices === 'object') {
            return Object.entries(raw.devices).map(([key, value]) => {
                if (value && typeof value === 'object') {
                    return { id: key, ...(value as Record<string, any>) };
                }
                return { id: key, name: key, status: String(value || 'unknown') };
            });
        }
        if (Array.isArray(raw.items)) return raw.items;
        if (Array.isArray(raw.list)) return raw.list;
        return Object.entries(raw).map(([key, value]) => {
            if (value && typeof value === 'object') {
                return { id: key, ...(value as Record<string, any>) };
            }
            return { id: key, name: key, status: String(value || 'unknown') };
        });
    }

    /**
     * Get paired/pending devices
     */
    ipc.handle('util:getDevices', async () => {
        try {
            const response = await internalRequest('device.pair.list');
            const pairs = normalizeDeviceRows(response?.data);

            return pairs.map(d => ({
                id: d.id || d.deviceId || 'unknown',
                name: d.name || d.deviceName || d.id || 'Unknown',
                type: d.type || 'unknown',
                status: d.status || d.state || (d.connected ? 'paired' : 'pending'),
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




