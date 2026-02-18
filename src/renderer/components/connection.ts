/**
 * DRAM Desktop - Connection Panel Component
 */
export function renderConnectionPanel() {
    return `
    <div class="row-modal">
        <form id="connection-form" class="connection-row">
            <div class="input-group-horizontal">
                <input type="text" id="gateway-url" placeholder="Gateway URL" value="ws://127.0.0.1:18789">
                <input type="password" id="gateway-token" placeholder="Token (Optional)">
                <input type="password" id="gateway-password" placeholder="Password (Optional)">
            </div>
            <button type="submit" id="btn-connect" class="tactile-btn primary">Initialize Handshake</button>
        </form>
        <div class="modal-status hidden" id="connection-error"></div>
    </div>
    `;
}




