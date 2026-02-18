const fs = require('fs');
const path = require('path');
const os = require('os');

// Try both .Dram (legacy) and .dram (newer) to be safe
const paths = [
    path.join(os.homedir(), '.Dram', 'credentials', 'whatsapp'),
    path.join(os.homedir(), '.dram', 'credentials', 'whatsapp')
];

console.log('Looking for WhatsApp sessions to clear...');

let found = false;
paths.forEach(basePath => {
    if (fs.existsSync(basePath)) {
        console.log(`Found WhatsApp folder at: ${basePath}`);
        try {
            fs.rmSync(basePath, { recursive: true, force: true });
            console.log(`Successfully deleted: ${basePath}`);
            found = true;
        } catch (e) {
            console.error(`Failed to delete ${basePath}. Make sure the app is STOPPED! Error:`, e.message);
        }
    }
});

if (!found) {
    console.log('No existing WhatsApp session folders found.');
} else {
    console.log('Session cleared. Please start the app to generate a NEW QR code.');
}
