/**
 * DRAM Usage Chart Rendering
 * Handles HTML5 Canvas drawing for usage statistics.
 */

let lastChartData = null;
let lastChartOptions = { width: 0, height: 0, maxCost: 0, stepX: 0, hasData: false, leftPad: 0 };

/**
 * Render daily cost chart with dot-line graph and hover support
 */
export function renderUsageChart(dailyData) {
    const canvas = document.getElementById('usage-chart');
    if (!canvas) return;

    const hasData = Array.isArray(dailyData) && dailyData.length > 0;
    const chartData = hasData
        ? dailyData
        : [
            { date: '00-00', cost: 0, tokens: 0 },
            { date: '00-00', cost: 0, tokens: 0 }
        ];

    lastChartData = chartData;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Use high DPI for crisp lines
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const maxCost = hasData ? Math.max(...chartData.map(d => d.cost), 0.01) : 1;

    // Horizontal spacing: distribute points with slight horizontal padding
    const leftPad = 8;
    const drawableWidth = Math.max(1, width - (leftPad * 2));
    const stepX = chartData.length > 1 ? drawableWidth / (chartData.length - 1) : 0;

    lastChartOptions = { width, height, maxCost, stepX, hasData, leftPad };

    // Initial draw
    draw(ctx, chartData, -1);

    // Setup Interaction
    if (!canvas.dataset.hasListener) {
        canvas.addEventListener('mousemove', (e) => {
            if (!lastChartData) return;
            const r = canvas.getBoundingClientRect();
            const mouseX = e.clientX - r.left;

            // Proximity detection: Find nearest point within radius
            let nearestIndex = -1;
            let minDistance = 40; // Slightly larger hit radius for better flow

            lastChartData.forEach((_, i) => {
                const px = lastChartOptions.leftPad + (i * lastChartOptions.stepX);
                const dist = Math.abs(mouseX - px);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestIndex = i;
                }
            });

            draw(ctx, lastChartData, nearestIndex);
        });

        canvas.addEventListener('mouseleave', () => {
            if (lastChartData) draw(ctx, lastChartData, -1);
        });

        canvas.dataset.hasListener = 'true';
    }
}

function draw(ctx, data, hoverIndex) {
    const { width, height, maxCost, stepX, hasData, leftPad } = lastChartOptions;
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#7c3aed';
    const textDim = styles.getPropertyValue('--text-secondary').trim() || '#b8b8c4';
    const gridMajor = 'rgba(226, 226, 231, 0.10)';
    const gridMinor = 'rgba(226, 226, 231, 0.05)';

    const topMargin = 8;
    const bottomMargin = 22;
    const plotTop = topMargin;
    const plotBottom = height - bottomMargin;
    const gridCell = 24;
    const lineVerticalPadding = Math.round(gridCell * 0.5);
    const lineTop = plotTop + lineVerticalPadding;
    const lineBottom = plotBottom - lineVerticalPadding;
    const lineHeight = Math.max(1, lineBottom - lineTop);

    ctx.clearRect(0, 0, width, height);

    // 1. Grid lines (square mesh)
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (let y = plotTop, iy = 0; y <= plotBottom; y += gridCell, iy++) {
        ctx.strokeStyle = (iy % 4 === 0) ? gridMajor : gridMinor;
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
        ctx.stroke();
    }
    for (let x = 0, ix = 0; x <= width; x += gridCell, ix++) {
        ctx.strokeStyle = (ix % 4 === 0) ? gridMajor : gridMinor;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, plotTop);
        ctx.lineTo(Math.round(x) + 0.5, plotBottom);
        ctx.stroke();
    }

    // 2. Pre-calculate points
    const points = data.map((d, i) => ({
        x: leftPad + (i * stepX),
        y: lineBottom - ((d.cost / maxCost) * lineHeight)
    }));

    // 3. Draw trend line
    if (points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // 4. Draw Vertical Guide Line (Hover)
    if (hasData && hoverIndex !== -1) {
        const p = points[hoverIndex];
        ctx.strokeStyle = accent + '44';
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(p.x, plotTop);
        ctx.lineTo(p.x, plotBottom);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 5. Draw Points & Tooltips
    points.forEach((p, i) => {
        const isHovered = hasData && i === hoverIndex;

        // Point drawing
        if (isHovered) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = accent;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = accent;
            ctx.fill();
        }

        if (isHovered) {
            // Tooltip Rendering
            const costText = `$${data[i].cost.toFixed(4)}`;
            const dateText = data[i].date;
            ctx.font = 'bold 12px monospace';
            const costWidth = ctx.measureText(costText).width;
            ctx.font = '10px monospace';
            const dateWidth = ctx.measureText(dateText).width;

            const tipWidth = Math.max(costWidth, dateWidth) + 24;
            const tipHeight = 36;

            let tipX = p.x - tipWidth / 2;
            let tipY = p.y - tipHeight - 15; // Offset above
            let arrowOnTop = false;

            // Vertical Boundary Check (Flip if too high)
            if (tipY < 5) {
                tipY = p.y + 15; // Flip below
                arrowOnTop = true;
            }

            // Horizontal Boundary Check
            if (tipX < 5) tipX = 5;
            if (tipX + tipWidth > width - 5) tipX = width - tipWidth - 5;

            // Tooltip Shadow
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(0,0,0,0.5)';

            // Tooltip Box
            ctx.fillStyle = 'rgba(15, 15, 18, 0.98)';
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1;

            const r = 4;
            ctx.beginPath();
            ctx.moveTo(tipX + r, tipY);
            ctx.lineTo(tipX + tipWidth - r, tipY);
            ctx.quadraticCurveTo(tipX + tipWidth, tipY, tipX + tipWidth, tipY + r);
            ctx.lineTo(tipX + tipWidth, tipY + tipHeight - r);
            ctx.quadraticCurveTo(tipX + tipWidth, tipY + tipHeight, tipX + tipWidth - r, tipY + tipHeight);
            ctx.lineTo(tipX + r, tipY + tipHeight);
            ctx.quadraticCurveTo(tipX, tipY + tipHeight, tipX, tipY + tipHeight - r);
            ctx.lineTo(tipX, tipY + r);
            ctx.quadraticCurveTo(tipX, tipY, tipX + r, tipY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Optional Arrow
            ctx.fillStyle = 'rgba(15, 15, 18, 0.98)';
            ctx.beginPath();
            if (arrowOnTop) {
                ctx.moveTo(p.x - 6, tipY);
                ctx.lineTo(p.x, tipY - 6);
                ctx.lineTo(p.x + 6, tipY);
            } else {
                ctx.moveTo(p.x - 6, tipY + tipHeight);
                ctx.lineTo(p.x, tipY + tipHeight + 6);
                ctx.lineTo(p.x + 6, tipY + tipHeight);
            }
            ctx.fill();
            ctx.stroke();

            // Text
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px monospace';
            ctx.fillText(costText, tipX + tipWidth / 2, tipY + 16);
            ctx.fillStyle = textDim;
            ctx.font = '10px monospace';
            ctx.fillText(dateText, tipX + tipWidth / 2, tipY + 28);
        }

        // Bottom Axis Labels
        const labelInterval = data.length <= 7
            ? 1
            : data.length <= 14
                ? 2
                : data.length <= 30
                    ? 4
                    : Math.max(5, Math.ceil(data.length / 9));
        const shouldDrawLabel = i === 0 || i === data.length - 1 || (i % labelInterval === 0);
        if (hasData && shouldDrawLabel) {
            ctx.fillStyle = textDim;
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(formatAxisDate(data[i].date), p.x, height - 6);
        }
    });

}

function formatAxisDate(rawDate) {
    const value = String(rawDate || '').trim();
    if (!value) return '';
    const parts = value.split('-');
    if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`;
    }
    return value;
}






