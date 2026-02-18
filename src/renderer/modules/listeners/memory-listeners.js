/**
 * DRAM Listeners - Memory/DAM Management
 * Handles file browser interactions and centralized saving
 */
import { elements } from '../elements.js';
import { saveCurrentAsset, loadAsset, listWorkspaceAssets } from '../settings-memory.js';
import { showConfirmDialog, showToast } from '../../components/dialog.js';
import { getIcon } from '../icons.js';
import { escapeHtml } from '../utils.js';

/**
 * Local state for current assets
 */
let currentAssets = [];

export function setupMemoryListeners(on) {
    // Initial fetch and render
    refreshAssetBrowser();

    document.addEventListener('workspace:path-changed', async () => {
        await refreshAssetBrowser();
    });

    // ===== Asset Selection Handler =====
    if (elements.memoryAssetList) {
        elements.memoryAssetList.addEventListener('click', async (e) => {
            const item = e.target.closest('.asset-item');
            if (!item || item.classList.contains('active')) return;

            const filename = item.dataset.id;
            const asset = currentAssets.find(a => a.id === filename);

            // Check for unsaved changes before switching? 
            // For now, simple switch
            const success = await loadAsset(filename, asset);
            if (success) {
                updateActiveAsset(filename);
            }
        });
    }

    // ===== Save Handler =====
    on(elements.btnSaveMemory, 'click', async () => {
        const confirmed = await showConfirmDialog({
            type: 'confirm',
            title: 'Commit Asset Changes',
            message: 'Save changes to the selected neural asset?',
            detail: 'This will persist your updates to the workspace disk.',
            confirmText: 'Commit',
            cancelText: 'Cancel'
        });

        if (confirmed) {
            const success = await saveCurrentAsset();
            if (success) {
                // Visual feedback
                const btn = elements.btnSaveMemory;
                const originalText = btn.textContent;
                btn.textContent = 'Committed!';
                btn.classList.add('saved');
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove('saved');
                }, 2000);

                // Reset dirty state in list
                const activeItem = elements.memoryAssetList?.querySelector('.asset-item.active');
                if (activeItem) activeItem.classList.remove('unsaved');
            }
        }
    });

    // ===== Keyboard Shortcuts (Ctrl+S) =====
    document.addEventListener('keydown', async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            if (document.activeElement === elements.editorMemory) {
                e.preventDefault();
                const success = await saveCurrentAsset();
                if (success) {
                    showToast({ message: 'Asset saved', type: 'success' });
                    const activeItem = elements.memoryAssetList?.querySelector('.asset-item.active');
                    if (activeItem) activeItem.classList.remove('unsaved');
                }
            }
        }
    });

    // ===== Dirty State Tracking =====
    on(elements.editorMemory, 'input', () => {
        const activeItem = elements.memoryAssetList?.querySelector('.asset-item.active');
        if (activeItem && !activeItem.classList.contains('unsaved')) {
            activeItem.classList.add('unsaved');
        }
    });

    // ===== Reload Handler =====
    on(elements.btnReloadMemory, 'click', async () => {
        await refreshAssetBrowser();
        showToast({ message: 'Assets refreshed', type: 'success' });
    });
}

/**
 * Fetch assets from disk and update the browser
 */
async function refreshAssetBrowser() {
    currentAssets = await listWorkspaceAssets();
    renderAssetList();

    // Auto-select first asset if none active
    if (currentAssets.length > 0 && !elements.memoryAssetList?.querySelector('.active')) {
        const first = currentAssets[0];
        await loadAsset(first.id, first);
        updateActiveAsset(first.id);
    }
}

/**
 * Render the side asset list
 */
function renderAssetList() {
    if (!elements.memoryAssetList) return;

    elements.memoryAssetList.innerHTML = currentAssets.map(asset => `
        <div class="asset-item" data-id="${escapeHtml(asset.id)}">
            <div class="asset-icon">${getIcon(asset.icon)}</div>
            <div class="asset-info">
                <span class="asset-name">${escapeHtml(asset.name)}</span>
                <span class="asset-type">${escapeHtml(asset.type)} // ${escapeHtml(asset.id.split('.').pop().toUpperCase())}</span>
            </div>
        </div>
    `).join('');
}

/**
 * Update the active visual state in the browser
 */
function updateActiveAsset(id) {
    if (!elements.memoryAssetList) return;

    elements.memoryAssetList.querySelectorAll('.asset-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === id);
    });
}
