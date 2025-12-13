let currentData = [];
let currentSort = { column: null, direction: null };

// Format number with commas
function formatNumber(num) {
    if (!num || num === '') return '';
    const numStr = num.toString().replace(/,/g, '');
    return parseFloat(numStr).toLocaleString('en-US');
}

// Normalize row data
function normalizeRow(r) {
    const parse = (val) => {
        if (!val || val === '') return 0;
        return parseFloat(val.toString().replace(/,/g, '')) || 0;
    };

    return {
        ...r,
        price: parse(r.price),
        shares: parse(r.shares),
        value: parse(r.value),
        trade_date_ts: new Date(r.trade_date).getTime()
    };
}

// Security: Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    return text
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Detect clusters and aggregate stats
function analyzeClusters(data) {
    const clusters = {};
    data.forEach(item => {
        if (!clusters[item.ticker]) {
            clusters[item.ticker] = { count: 0, totalValue: 0, totalShares: 0 };
        }
        clusters[item.ticker].count++;
        clusters[item.ticker].totalValue += item.value;
        clusters[item.ticker].totalShares += item.shares;
    });
    return clusters;
}

// Update last updated timestamp
function updateTimestamp(timestamp) {
    const now = timestamp ? new Date(timestamp) : new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('last-updated').textContent = `Last updated: ${timeStr}`;
}

// Sort data
function sortData(column) {
    const headers = document.querySelectorAll('th.sortable');

    // Toggle sort direction
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    // Update header classes
    headers.forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.dataset.column === column) {
            th.classList.add(currentSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
    });

    // Sort the data
    // Sort the data
    currentData.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        // Handle Trade Date specially using the pre-calculated timestamp
        if (column === 'trade_date') {
            aVal = a.trade_date_ts;
            bVal = b.trade_date_ts;
        }

        if (currentSort.direction === 'asc') {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
        }
    });

    renderTable();
}

// Sort by clusters
function sortByClusters() {
    const clusters = analyzeClusters(currentData);

    // Reset column sort indicators
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    currentSort = { column: 'cluster', direction: 'desc' };

    currentData.sort((a, b) => {
        const countA = (clusters[a.ticker] && clusters[a.ticker].count) || 0;
        const countB = (clusters[b.ticker] && clusters[b.ticker].count) || 0;

        // Sort by count desc
        if (countA !== countB) {
            return countB - countA;
        }

        // Then by ticker to keep groups together
        if (a.ticker !== b.ticker) {
            return a.ticker.localeCompare(b.ticker);
        }

        // Then by value desc
        return b.value - a.value;
    });

    renderTable();
}

// Export to CSV
function exportToCSV() {
    if (!currentData.length) return;

    const clusters = analyzeClusters(currentData);

    // Define headers and rows
    const headers = ['Trade Date', 'Ticker', 'Company', 'Price', 'Shares', 'Value', 'Insider Count'];
    const rows = currentData.map(item => {
        const clusterInfo = clusters[item.ticker] || { count: 1 };

        // Escape fields that might contain commas
        const escape = (val) => `"${(val || '').toString().replace(/"/g, '""')}"`;

        return [
            escape(item.trade_date),
            escape(item.ticker),
            escape(item.company),
            escape(item.price),
            escape(item.shares),
            escape(item.value),
            escape(clusterInfo.count)
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Create filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');

    link.setAttribute('href', url);
    link.setAttribute('download', `penny-stock-sniper-${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Render Hot Picks section
function renderHotPicks() {
    // Top 3 by Value
    const topByValue = [...currentData]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);

    const topValueTbody = document.getElementById('top-value-tbody');
    topValueTbody.innerHTML = '';
    topByValue.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td data-label="Ticker"><a href="https://www.tradingview.com/chart/?symbol=${escapeHtml(item.ticker)}" target="_blank" rel="noopener noreferrer" class="ticker-link">${escapeHtml(item.ticker)}</a></td>
      <td data-label="Value" style="color: #4ade80; font-weight: 600;">$${formatNumber(item.value)}</td>
      <td data-label="Date" style="color: #b0b0b0; font-size: 0.8125rem;">${escapeHtml(item.trade_date)}</td>
    `;
        topValueTbody.appendChild(tr);
    });

    // 5 Most Recent
    const mostRecent = [...currentData]
        .sort((a, b) => b.trade_date_ts - a.trade_date_ts)
        .slice(0, 5);

    const recentTbody = document.getElementById('recent-tbody');
    recentTbody.innerHTML = '';
    mostRecent.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td data-label="Ticker"><a href="https://www.tradingview.com/chart/?symbol=${escapeHtml(item.ticker)}" target="_blank" rel="noopener noreferrer" class="ticker-link">${escapeHtml(item.ticker)}</a></td>
      <td data-label="Company" style="color: #d0d0d0;"><a href="https://www.google.com/search?q=${encodeURIComponent(item.company + ' stock news')}" target="_blank" rel="noopener noreferrer" class="company-link">${escapeHtml(item.company.length > 25 ? item.company.substring(0, 25) + '...' : item.company)}</a></td>
      <td data-label="Date" style="color: #b0b0b0; font-size: 0.8125rem;">${escapeHtml(item.trade_date)}</td>
    `;
        recentTbody.appendChild(tr);
    });
}

// Render table with current data
function renderTable() {
    const tbody = document.querySelector('#data-table tbody');
    tbody.innerHTML = '';

    const clusters = analyzeClusters(currentData);

    currentData.forEach(item => {
        const tr = document.createElement('tr');
        const value = item.value;

        // Color code based on value
        if (value >= 1000000) {
            tr.classList.add('value-high');
        } else if (value >= 500000) {
            tr.classList.add('value-medium');
        }

        // Add cluster badge if multiple insiders
        let clusterBadge = '';
        if (clusters[item.ticker] && clusters[item.ticker].count >= 2) {
            const stats = clusters[item.ticker];
            clusterBadge = `
            <div class="cluster-badge-container">
                <span class="cluster-badge">🔥 ${stats.count} Insiders</span>
                <div class="cluster-tooltip">
                    <div class="tooltip-row"><span>Total Value:</span> <span class="val">$${formatNumber(stats.totalValue)}</span></div>
                    <div class="tooltip-row"><span>Total Shares:</span> <span class="shares">${formatNumber(stats.totalShares)}</span></div>
                </div>
            </div>`;
        }

        tr.innerHTML = `
      <td data-label="Trade Date">${escapeHtml(item.trade_date)}</td>
      <td data-label="Ticker"><a href="https://www.tradingview.com/chart/?symbol=${escapeHtml(item.ticker)}" target="_blank" rel="noopener noreferrer" class="ticker-link">${escapeHtml(item.ticker)}</a>${clusterBadge}</td>
      <td data-label="Company"><a href="https://www.google.com/search?q=${encodeURIComponent(item.company + ' stock news')}" target="_blank" rel="noopener noreferrer" class="company-link">${escapeHtml(item.company)}</a></td>
      <td data-label="Price">${formatNumber(item.price)}</td>
      <td data-label="Shares">${formatNumber(item.shares)}</td>

      <td data-label="Value">$${formatNumber(item.value)}</td>
    `;
        tbody.appendChild(tr);
    });

    // Re-attach mobile listeners after render
    attachMobileListeners();
}

// Load data from API
async function loadData() {
    const loadingEl = document.getElementById('loading');
    const tableEl = document.getElementById('data-table');
    const hotPicksEl = document.getElementById('hot-picks');
    const refreshBtn = document.getElementById('refresh-btn');

    try {
        refreshBtn.classList.add('loading');
        loadingEl.classList.remove('hidden');

        const response = await fetch('/api/data');
        if (!response.ok) throw new Error('Network response was not ok');
        const jsonResponse = await response.json();

        // Handle both new object format and old array format (fallback)
        if (Array.isArray(jsonResponse)) {
            currentData = jsonResponse.map(normalizeRow);
            updateTimestamp(); // fallback to current time
        } else {
            currentData = (jsonResponse.data || []).map(normalizeRow);
            updateTimestamp(jsonResponse.lastUpdated);
        }

        renderHotPicks();
        renderTable();

        loadingEl.classList.add('hidden');
        hotPicksEl.classList.remove('hidden');
        tableEl.classList.remove('hidden');
    } catch (err) {
        loadingEl.textContent = 'Failed to load data.';
        console.error(err);
    } finally {
        refreshBtn.classList.remove('loading');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();

    // Add click handlers to sortable headers
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            sortData(th.dataset.column);
        });
    });

    // Add refresh button handler
    document.getElementById('refresh-btn').addEventListener('click', loadData);

    // Add cluster filter button handler
    document.getElementById('cluster-filter-btn').addEventListener('click', sortByClusters);

    // Add export button handler
    document.getElementById('export-btn').addEventListener('click', exportToCSV);
});

// Mobile Interaction Logic
function attachMobileListeners() {
    // Check if we are on a mobile device
    if (!window.matchMedia("(max-width: 768px)").matches) return;

    // Row Tap Logic
    const rows = document.querySelectorAll('tbody tr');
    rows.forEach(row => {
        row.addEventListener('click', (e) => {
            // Do NOT toggle when clicking links/buttons/badges inside the row
            if (e.target.closest('a, button, .cluster-badge-container')) {
                return;
            }
            // Toggle active state
            if (row.classList.contains('is-active')) {
                row.classList.remove('is-active');
            } else {
                // Remove active from other rows
                rows.forEach(r => r.classList.remove('is-active'));
                row.classList.add('is-active');
            }
        });
    });

    // Cluster Badge Logic (Global Modal)
    const clusters = document.querySelectorAll('.cluster-badge-container');
    const overlay = document.getElementById('mobile-tooltip-overlay');

    // Clean up old listeners (simple way is just to replace nodes, but for now assuming this runs once or we're careful. `attachMobileListeners` is called on load. JS listeners prevent dups?)
    // actually renderTable calls it again. using new elements.

    clusters.forEach(cluster => {
        cluster.addEventListener('click', (e) => {
            e.stopPropagation(); // so badge taps don't trigger row taps

            // Get content
            const tooltipContent = cluster.querySelector('.cluster-tooltip');
            if (tooltipContent) {
                overlay.innerHTML = `<div class="cluster-tooltip">${tooltipContent.innerHTML}</div>`;
                overlay.style.display = 'flex';
                // Trigger reflow/frame for transition
                requestAnimationFrame(() => {
                    overlay.classList.add('visible');
                });
            }
        });
    });
}

// Global Modal Logic (Initialize once)
const overlay = document.getElementById('mobile-tooltip-overlay');
if (overlay) {
    overlay.addEventListener('click', () => {
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 200); // Wait for transition
    });
}

// Close tooltips when clicking outside (Desktop only mostly, but good cleanup)
document.addEventListener('click', () => {
    const activeClusters = document.querySelectorAll('.cluster-badge-container.tooltip-active');
    activeClusters.forEach(c => c.classList.remove('tooltip-active'));
});
