/**
 * DRAM - Tab System Module
 */
import { state } from './state.js';
import { clearMessages, renderMessage } from './renderer.js';
import { escapeHtml } from './utils.js';

const elements = {
    tabsList: null,
    btnAddTab: null,
    scrollCanvas: null
};

export function initTabs() {
    elements.tabsList = document.getElementById('chat-tabs-list');
    elements.btnAddTab = document.getElementById('btn-add-tab');
    elements.scrollCanvas = document.getElementById('message-container');
    if (elements.btnAddTab) {
        elements.btnAddTab.addEventListener('click', () => {
            createNewTab();
        });
    }

    // Event Delegation for Tabs (Fixes CSP errors)
    if (elements.tabsList) {
        elements.tabsList.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('.tab-close');
            const tab = e.target.closest('.chat-tab');

            if (closeBtn) {
                const sessionId = closeBtn.dataset.id;
                removeTab(sessionId, e);
            } else if (tab) {
                const sessionId = tab.dataset.id;
                switchTab(sessionId);
            }
        });

        elements.tabsList.addEventListener('dragstart', handleDragStart);
        elements.tabsList.addEventListener('dragover', handleDragOver);
        elements.tabsList.addEventListener('drop', handleDrop);
    }

    renderTabs();
}

export function createNewTab(id = null, name = null) {
    const newId = id || `session-${Date.now()}`;
    const newName = name || `New Chat ${state.sessions.length + 1}`;

    state.sessions.push({
        id: newId,
        name: newName,
        messages: [],
        sessionCost: 0,
        sessionInputTokens: 0,
        sessionOutputTokens: 0,
        localRequestCount: 0,
        localProviderRequests: {},
        localModelUsage: {},
        sessionStartedAt: Date.now()
    });

    switchTab(newId);
    if (elements.tabsList) elements.tabsList.scrollLeft = elements.tabsList.scrollWidth;
}

export function switchTab(sessionId) {
    // Save current active session state if needed (state.messages is now a concept of the current session)
    state.currentSessionId = sessionId;
    state.sessionKey = sessionId;
    window.dispatchEvent(new CustomEvent('dram:session:changed', { detail: { sessionId } }));

    // Update active model/state if needed
    const nextSession = state.sessions.find(s => s.id === sessionId);

    // UI Updates
    if (typeof clearMessages === 'function') clearMessages();

    // Rerender messages for this session
    if (nextSession && nextSession.messages) {
        nextSession.messages.forEach(msg => {
            if (typeof renderMessage === 'function') renderMessage(msg);
        });
    }

    renderTabs();

    // Scroll to bottom
    if (elements.scrollCanvas) {
        elements.scrollCanvas.scrollTop = elements.scrollCanvas.scrollHeight;
    }
}

export function removeTab(sessionId, event) {
    if (event) event.stopPropagation();

    if (state.sessions.length <= 1) return; // Keep at least one

    const index = state.sessions.findIndex(s => s.id === sessionId);
    if (index === -1) return;

    const wasActive = state.currentSessionId === sessionId;
    state.sessions.splice(index, 1);

    if (wasActive) {
        const nextTarget = state.sessions[Math.max(0, index - 1)];
        switchTab(nextTarget.id);
    } else {
        renderTabs();
    }
}

export function renderTabs() {
    if (!elements.tabsList) return;

    elements.tabsList.innerHTML = state.sessions.map((session, index) => `
        <div class="chat-tab ${session.id === state.currentSessionId ? 'active' : ''}" 
             data-id="${escapeHtml(session.id)}"
             data-index="${index}"
             draggable="true">
            <span class="tab-name">${escapeHtml(session.name)}</span>
            <span class="tab-close" data-id="${escapeHtml(session.id)}">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </span>
        </div>
    `).join('');
}

let draggedTabIndex = null;

export function handleDragStart(e) {
    const tab = e.target.closest('.chat-tab');
    if (!tab) return;
    draggedTabIndex = parseInt(tab.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    tab.classList.add('dragging');
}

export function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

export function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    const targetTab = e.target.closest('.chat-tab');
    if (!targetTab) return;

    const targetIndex = parseInt(targetTab.dataset.index);

    if (draggedTabIndex !== null && draggedTabIndex !== targetIndex) {
        const [draggedSession] = state.sessions.splice(draggedTabIndex, 1);
        state.sessions.splice(targetIndex, 0, draggedSession);
        renderTabs();
    }

    draggedTabIndex = null;
    return false;
}

// Global expose for onclick handlers (though we now use event delegation)
window.dramTabs = {
    switchTab,
    removeTab
};
