/**
 * Info Tooltip System
 * Handles dynamic positioning of info icon tooltips to avoid clipping by parent containers
 */

let activeTooltip = null;
let activeArrow = null;

export function initInfoTooltips() {
    // Clean up any existing tooltips
    document.querySelectorAll('.info-tooltip-popup, .info-tooltip-arrow').forEach(el => el.remove());
    
    // Use event delegation for all info icons
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    
    // Clean up on scroll/resize to avoid stuck tooltips
    window.addEventListener('scroll', cleanupTooltips, true);
    window.addEventListener('resize', cleanupTooltips);
}

function handleMouseOver(e) {
    const icon = e.target.closest('.info-icon-circle');
    if (!icon) return;
    
    showTooltip(icon);
}

function handleMouseOut(e) {
    const icon = e.target.closest('.info-icon-circle');
    if (!icon) return;
    
    // Check if we're moving to the tooltip itself
    const related = e.relatedTarget;
    if (related?.classList?.contains('info-tooltip-popup')) return;
    
    cleanupTooltips();
}

function showTooltip(icon) {
    // Clean up any existing tooltip first
    cleanupTooltips();
    
    const tooltipText = icon.dataset.tooltip;
    if (!tooltipText) return;
    
    const iconRect = icon.getBoundingClientRect();
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'info-tooltip-popup';
    tooltip.textContent = tooltipText;
    tooltip.style.cssText = `
        position: fixed;
        background: var(--bg-surface, #1a1a1c);
        border: 1px solid var(--border, #2a2a2c);
        border-radius: 6px;
        padding: 10px 14px;
        width: max-content;
        max-width: 280px;
        font-family: var(--font-sans, system-ui, sans-serif);
        font-size: 12px;
        font-weight: 400;
        color: var(--text-secondary, #a0a0a0);
        line-height: 1.5;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
        z-index: 99999;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
    `;
    
    // Create arrow element
    const arrow = document.createElement('div');
    arrow.className = 'info-tooltip-arrow';
    arrow.style.cssText = `
        position: fixed;
        width: 0;
        height: 0;
        border: 5px solid transparent;
        z-index: 99999;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
    `;
    
    document.body.appendChild(tooltip);
    document.body.appendChild(arrow);
    
    // Position tooltip
    const tooltipRect = tooltip.getBoundingClientRect();
    const margin = 10;
    
    // Default: position above the icon, centered
    let top = iconRect.top - tooltipRect.height - 6;
    let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
    let arrowBorder = 'border-top-color: var(--border, #2a2a2c)';
    let arrowTop = iconRect.top - 6;
    
    // Check if tooltip would go off-screen top
    if (top < margin) {
        // Position below instead
        top = iconRect.bottom + 6;
        arrowTop = iconRect.bottom;
        arrowBorder = 'border-bottom-color: var(--border, #2a2a2c)';
        arrow.style.borderTopColor = 'transparent';
        arrow.style.borderBottomColor = 'var(--border, #2a2a2c)';
    } else {
        arrow.style.borderTopColor = 'var(--border, #2a2a2c)';
        arrow.style.borderBottomColor = 'transparent';
    }
    
    // Check if tooltip would go off-screen right
    if (left + tooltipRect.width > window.innerWidth - margin) {
        left = window.innerWidth - tooltipRect.width - margin;
    }
    
    // Check if tooltip would go off-screen left
    if (left < margin) {
        left = margin;
    }
    
    // Position arrow horizontally centered on icon
    const arrowLeft = iconRect.left + (iconRect.width / 2) - 5;
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    arrow.style.top = `${arrowTop}px`;
    arrow.style.left = `${arrowLeft}px`;
    
    // Store references
    activeTooltip = tooltip;
    activeArrow = arrow;
    
    // Fade in
    requestAnimationFrame(() => {
        tooltip.style.opacity = '1';
        arrow.style.opacity = '1';
    });
}

function cleanupTooltips() {
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }
    if (activeArrow) {
        activeArrow.remove();
        activeArrow = null;
    }
}

// Auto-init if document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInfoTooltips);
} else {
    initInfoTooltips();
}
