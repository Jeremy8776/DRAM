import { loadConfig } from 'openclaw';
console.log('Config loaded:', typeof loadConfig);

try {
    // Try to find where startGatewayServer might be
    const entryPath = import.meta.resolve('openclaw');
    console.log('Entry path:', entryPath);
} catch (err) {
    console.error('Failed to resolve entry:', err.message);
}
