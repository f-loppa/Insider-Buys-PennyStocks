let currentData = [];
let currentSort = { column: null, direction: null };
let cSuiteFilterActive = false;

// Format number with commas (guarded against NaN)
function formatNumber(num) {
    if (num === null || num === undefined || num === '') return '';
    const numStr = num.toString().replace(/,/g, '');
    const n = parseFloat(numStr);
    return isNaN(n) ? '' : n.toLocaleString('en-US');
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

// Get initials from insider name for avatar
function getInitials(name) {
    if (!name) return 'IN';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// Normalize raw title to badge and full string
function normalizeTitle(raw) {
    const full = raw || '';
    const cleanRaw = full.toUpperCase();
    
    let badge = '';
    if (cleanRaw.includes('CEO')) {
        badge = 'CEO';
    } else if (cleanRaw.includes('CFO')) {
        badge = 'CFO';
    } else if (cleanRaw.includes('COO')) {
        badge = 'COO';
    } else if (cleanRaw.includes('PRES')) {
        badge = 'PRES';
    } else if (cleanRaw.includes('CHAIRMAN') || cleanRaw.includes('CHAIR')) {
        badge = 'CHAIR';
    } else if (cleanRaw.includes('EVP') || cleanRaw.includes('SVP') || cleanRaw.includes('VP') || cleanRaw.includes('VICE PRESIDENT')) {
        badge = 'VP';
    } else if (cleanRaw.includes('DIRECTOR')) {
        badge = 'DIR';
    } else if (cleanRaw.includes('10%')) {
        badge = '10%';
    } else {
        // fallback first token uppercased (max 5 chars)
        const firstToken = full.split(/[\s,]+/)[0] || '';
        badge = firstToken.toUpperCase().slice(0, 5);
    }
    
    return { badge, full };
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
    const headers = ['Trade Date', 'Ticker', 'Company', 'Insider Name', 'Title', 'Price', 'Shares', 'Value', 'Insider Count'];
    const rows = currentData.map(item => {
        const clusterInfo = clusters[item.ticker] || { count: 1 };

        // Escape fields that might contain commas
        const escape = (val) => `"${(val || '').toString().replace(/"/g, '""')}"`;

        return [
            escape(item.trade_date),
            escape(item.ticker),
            escape(item.company),
            escape(item.insider_name),
            escape(item.insider_title),
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
      <td data-label="Ticker"><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(item.ticker)}" target="_blank" rel="noopener noreferrer" class="ticker-link">${escapeHtml(item.ticker)}</a></td>
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
      <td data-label="Ticker"><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(item.ticker)}" target="_blank" rel="noopener noreferrer" class="ticker-link">${escapeHtml(item.ticker)}</a></td>
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

    const searchInput = document.getElementById('search-input');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    // Filter currentData based on search query AND C-Suite filter state
    const filteredData = currentData.filter(item => {
        if (cSuiteFilterActive) {
            const rawTitle = (item.insider_title || '').toUpperCase();
            const isCSuite = rawTitle.includes('CEO') || 
                             rawTitle.includes('CFO') || 
                             rawTitle.includes('COO') || 
                             rawTitle.includes('PRES');
            if (!isCSuite) return false;
        }

        if (!query) return true;
        return (item.ticker || '').toLowerCase().includes(query) ||
            (item.company || '').toLowerCase().includes(query) ||
            (item.insider_name || '').toLowerCase().includes(query) ||
            (item.insider_title || '').toLowerCase().includes(query);
    });

    if (filteredData.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td colspan="6" style="text-align: center; color: #888; padding: 2.5rem; font-style: italic;">
                🔍 No stocks found matching "${escapeHtml(query)}"
            </td>
        `;
        tbody.appendChild(tr);
        return;
    }

    const clusters = analyzeClusters(currentData);

    filteredData.forEach(item => {
        const tr = document.createElement('tr');
        const value = item.value;

        // Color code based on value
        if (value >= 1000000) {
            tr.classList.add('value-high');
        } else if (value >= 500000) {
            tr.classList.add('value-medium');
        }

        // Add C-Suite / Insider Title badge
        let titleBadge = '';
        if (item.insider_title) {
            const normTitle = normalizeTitle(item.insider_title);
            let badgeClass = 'neutral';
            if (normTitle.badge === 'CEO') badgeClass = 'ceo';
            else if (normTitle.badge === 'CFO') badgeClass = 'cfo';
            else if (['COO', 'PRES', 'CHAIR'].includes(normTitle.badge)) badgeClass = 'c-suite';

            titleBadge = `
            <div class="title-badge-container">
                <span class="title-badge ${badgeClass}">${escapeHtml(normTitle.badge)}</span>
                <div class="title-tooltip">
                    <div class="title-tooltip-line1"><b>${escapeHtml(item.insider_name)}</b> — <span>${escapeHtml(item.insider_title)}</span></div>
                    <div class="title-tooltip-line2">Bought ${formatNumber(item.shares)} shares at $${formatNumber(item.price)}</div>
                </div>
            </div>`;
        } else {
            // Render an empty spacer with same layout container to preserve vertical alignment
            titleBadge = `<div class="title-badge-container spacer" style="width: 65px; height: 1px; display: inline-flex;"></div>`;
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
      <td data-label="Ticker">
        <div class="ticker-cell-wrapper">
          <a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(item.ticker)}" target="_blank" rel="noopener noreferrer" class="ticker-link">${escapeHtml(item.ticker)}</a>
          ${titleBadge}
          ${clusterBadge}
        </div>
      </td>
      <td data-label="Company"><a href="https://www.google.com/search?q=${encodeURIComponent(item.company + ' stock news')}" target="_blank" rel="noopener noreferrer" class="company-link">${escapeHtml(item.company)}</a></td>
      <td data-label="Price">${formatNumber(item.price)}</td>
      <td data-label="Shares">${formatNumber(item.shares)}</td>

      <td data-label="Value">$${formatNumber(item.value)}</td>
    `;
        tbody.appendChild(tr);
    });
}

// Load data from API
async function loadData() {
    const loadingEl = document.getElementById('loading');
    const tableEl = document.getElementById('data-table');
    const hotPicksEl = document.getElementById('hot-picks');
    const refreshBtn = document.getElementById('refresh-btn');

    try {
        refreshBtn.classList.add('loading');
        loadingEl.textContent = 'Loading data…'; // Reset text on load
        loadingEl.classList.remove('hidden');

        const response = await fetch('/api/data');
        if (!response.ok) throw new Error('Network response was not ok');
        const jsonResponse = await response.json();

        // Handle both new object format and old array format (fallback)
        if (Array.isArray(jsonResponse)) {
            currentData = jsonResponse.map(normalizeRow);
            updateTimestamp();
        } else {
            currentData = (jsonResponse.data || []).map(normalizeRow);
            updateTimestamp(jsonResponse.lastUpdated);

            const lastUpdatedEl = document.getElementById('last-updated');
            if (jsonResponse.mocked) {
                lastUpdatedEl.textContent = `Demo Mode (OpenInsider is down)`;
                lastUpdatedEl.style.color = '#fbbf24';
            } else if (jsonResponse.stale) {
                lastUpdatedEl.textContent = `Offline (Serving cache from: ${new Date(jsonResponse.lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`;
                lastUpdatedEl.style.color = '#ff6b6b';
            } else {
                lastUpdatedEl.style.color = '';
            }
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

// Setup Event Delegation for Mobile / Responsive UI
function setupEventDelegation() {
    const tbody = document.querySelector('#data-table tbody');
    if (!tbody) return;

    tbody.addEventListener('click', (e) => {
        // Only run custom tap logic if mobile viewport layout is active
        if (!window.matchMedia("(max-width: 768px)").matches) return;

        // Do NOT trigger when clicking links or buttons inside the row
        if (e.target.closest('a, button')) {
            return;
        }

        const row = e.target.closest('tr');
        if (!row) return;

        // Find corresponding transaction from row content (by trade date, ticker, value)
        const dateCell = row.querySelector('[data-label="Trade Date"]');
        const tickerLink = row.querySelector('.ticker-link');
        const valueCell = row.querySelector('[data-label="Value"]');

        const tradeDate = dateCell ? dateCell.textContent.trim() : '';
        const ticker = tickerLink ? tickerLink.textContent.trim() : '';
        // Extract raw number from valueCell (e.g. "$175,440" -> 175440)
        const valueStr = valueCell ? valueCell.textContent.replace(/[$,]/g, '').trim() : '';
        const value = parseFloat(valueStr) || 0;

        // Match from currentData
        const item = currentData.find(d => 
            d.ticker === ticker && 
            d.trade_date === tradeDate && 
            Math.abs(d.value - value) < 1
        );

        if (item) {
            const normTitle = normalizeTitle(item.insider_title);
            let badgeClass = 'neutral';
            if (normTitle.badge === 'CEO') badgeClass = 'ceo';
            else if (normTitle.badge === 'CFO') badgeClass = 'cfo';
            else if (['COO', 'PRES', 'CHAIR'].includes(normTitle.badge)) badgeClass = 'c-suite';

            const clusters = analyzeClusters(currentData);
            const stats = clusters[ticker];
            const overlay = document.getElementById('mobile-tooltip-overlay');
            if (overlay) {
                let clusterStatsHTML = '';
                if (stats && stats.count >= 2) {
                    clusterStatsHTML = `
                        <div class="bottom-sheet-insider-list-header">🔥 Ticker Cluster Stats</div>
                        <div class="bottom-sheet-metrics" style="margin-bottom: 0;">
                            <div class="bottom-sheet-card">
                                <span class="bottom-sheet-card-label">💰 Total Cluster Value</span>
                                <span class="bottom-sheet-card-value green">$${formatNumber(stats.totalValue)}</span>
                            </div>
                            <div class="bottom-sheet-card">
                                <span class="bottom-sheet-card-label">📊 Total Cluster Shares</span>
                                <span class="bottom-sheet-card-value blue">${formatNumber(stats.totalShares)}</span>
                            </div>
                            <div class="bottom-sheet-card">
                                <span class="bottom-sheet-card-label">👥 Insiders In Cluster</span>
                                <span class="bottom-sheet-card-value">${formatNumber(stats.count)}</span>
                            </div>
                        </div>
                    `;
                }

                overlay.innerHTML = `
                    <div class="bottom-sheet">
                        <div class="bottom-sheet-handle"></div>
                        
                        <div class="bottom-sheet-header">
                            <div class="insider-header-info">
                                <div class="insider-header-name">${escapeHtml(item.insider_name)}</div>
                                <span class="title-badge ${badgeClass}">${escapeHtml(normTitle.badge)}</span>
                            </div>
                        </div>
                        <div class="bottom-sheet-full-title">${escapeHtml(item.insider_title)}</div>

                        <div class="bottom-sheet-metrics">
                            <div class="bottom-sheet-card">
                                <span class="bottom-sheet-card-label">💰 Trade Value</span>
                                <span class="bottom-sheet-card-value green">$${formatNumber(item.value)}</span>
                            </div>
                            <div class="bottom-sheet-card">
                                <span class="bottom-sheet-card-label">📊 Shares @ Price</span>
                                <span class="bottom-sheet-card-value">${formatNumber(item.shares)} @ $${formatNumber(item.price)}</span>
                            </div>
                            <div class="bottom-sheet-card">
                                <span class="bottom-sheet-card-label">📅 Trade Date</span>
                                <span class="bottom-sheet-card-value">${escapeHtml(item.trade_date)}</span>
                            </div>
                        </div>

                        ${clusterStatsHTML}

                        <div class="bottom-sheet-chart-container">
                            <div id="tradingview-mini-chart"></div>
                        </div>

                        <button class="bottom-sheet-close-btn" style="margin-top: 1.5rem;">Close</button>
                    </div>`;

                overlay.style.display = 'flex';
                requestAnimationFrame(() => {
                    overlay.classList.add('visible');
                    // Instantiate TradingView MiniWidget after modal is visible in DOM
                    try {
                        const chartContainer = document.getElementById('tradingview-mini-chart');
                        if (chartContainer) {
                            chartContainer.innerHTML = ''; // Clear previous chart
                            const script = document.createElement('script');
                            script.type = 'text/javascript';
                            script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
                            script.async = true;
                            script.text = JSON.stringify({
                                "symbol": ticker,
                                "width": "100%",
                                "height": "100%",
                                "locale": "en",
                                "dateRange": "3M",
                                "colorTheme": "dark",
                                "trendLineColor": "rgba(74, 158, 255, 1)",
                                "underLineColor": "rgba(74, 158, 255, 0.15)",
                                "underLineBottomColor": "rgba(74, 158, 255, 0)",
                                "isHotlist": false,
                                "calendar": false,
                                "showVolume": false,
                                "supportPercentage": true,
                                "largeChartUrl": ""
                            });
                            chartContainer.appendChild(script);
                        }
                    } catch (e) {
                        console.error("Failed to initialize TradingView MiniWidget:", e);
                    }
                });

                const closeBtn = overlay.querySelector('.bottom-sheet-close-btn');
                if (closeBtn) {
                    closeBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        overlay.classList.remove('visible');
                        setTimeout(() => {
                            overlay.style.display = 'none';
                        }, 300);
                    });
                }
            }
        }
    });

    // Close mobile overlay modal when clicking on its background overlay
    const overlay = document.getElementById('mobile-tooltip-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('visible');
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, 300);
            }
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupEventDelegation();
    await loadData();

    // Bind search input to dynamically filter table
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderTable();
        });
    }

    // Keyboard shortcut '/' to focus search input
    document.addEventListener('keydown', (e) => {
        const searchInput = document.getElementById('search-input');
        if (!searchInput) return;

        // Ignore if user is already typing in an input field
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
            return;
        }

        if (e.key === '/') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });

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

    // Add C-Suite toggle button handler
    const csuiteBtn = document.getElementById('csuite-filter-btn');
    if (csuiteBtn) {
        csuiteBtn.addEventListener('click', () => {
            cSuiteFilterActive = !cSuiteFilterActive;
            csuiteBtn.classList.toggle('active', cSuiteFilterActive);
            renderTable();
        });
    }

    // Add export button handler
    document.getElementById('export-btn').addEventListener('click', exportToCSV);
});
