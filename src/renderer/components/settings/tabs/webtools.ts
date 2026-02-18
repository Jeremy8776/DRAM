/**
 * Web Tools Settings Tab
 */
export function renderWebToolsTab() {
    return `
        <div id="tab-webtools" class="settings-tab-content hidden">
            <div class="settings-section">
                <h2>Browser Integration</h2>
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">Moved to Skills</div>
                        <div class="setting-description">Web browsing capabilities are now managed in the Skills Registry as the 'browser' skill.</div>
                    </div>
                    <div class="setting-control">
                        <button class="tactile-btn secondary" onclick="document.querySelector('[data-tab=skills]').click()">Go to Skills</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}




