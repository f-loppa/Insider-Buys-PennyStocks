const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static('public'));

const CACHE_FILE = path.join(__dirname, 'cache.json');
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cache = {
    data: null,
    lastUpdated: 0,
    mocked: false
};
let inflight = null;

// Load cache from disk on startup if it exists
if (fs.existsSync(CACHE_FILE)) {
    try {
        const fileContent = fs.readFileSync(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed && parsed.data) {
            cache = parsed;
            console.log('Loaded cache from disk:', new Date(cache.lastUpdated).toLocaleString());
        }
    } catch (e) {
        console.error('Error reading cache file on startup:', e.message);
    }
}

async function fetchFromOpenInsider() {
    console.log('Fetching new data from OpenInsider...');
    const response = await axios.get('http://openinsider.com/screener?s=&o=&pl=&ph=5&ll=&lh=&fd=730&fdr=&td=0&tdr=&fdlyl=&fdlyh=&daysago=&xp=1&vl=25&vh=&ocl=&och=&sic1=-1&sicl=100&sich=9999&grp=0&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=&sortcol=0&cnt=100&page=1', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive'
        },
        timeout: 10000, // 10 seconds timeout to prevent hanging indefinitely
        family: 4 // Force IPv4 connection to prevent ECONNREFUSED on environments with non-working IPv6
    });
    const html = response.data;
    const $ = cheerio.load(html);
    const rows = [];
    
    $('table.tinytable tbody tr').each((i, elem) => {
        const cells = [];
        $(elem).find('td').each((j, td) => {
            cells.push($(td).text().trim());
        });
        
        // Validation: Verify we have enough columns and that the ticker matches expected format
        const ticker = cells[3] || '';
        const tickerRegex = /^[A-Z.-]{1,6}$/;
        if (cells.length > 3 && tickerRegex.test(ticker)) {
            const clean = (val) => val?.replace(/[+$,]/g, '').trim();
            rows.push({
                trade_date: cells[2] || '',
                ticker: ticker,
                company: cells[4] || '',
                insider_name: cells[5] || '',
                insider_title: cells[6] || '',
                price: clean(cells[8]),
                shares: clean(cells[9]),
                value: clean(cells[12])
            });
        } else if (cells.length > 0) {
            // Only log warning if it is a content row that failed validation
            console.warn(`Row validation warning: Ticker column format mismatch at index 3. Found ticker: "${ticker}", cells count: ${cells.length}`);
        }
    });

    if (rows.length === 0) {
        throw new Error('No valid rows could be parsed from OpenInsider. Page structure might have changed.');
    }
    
    return rows;
}

const MOCK_DATA = [
    {
        trade_date: '2026-07-06',
        ticker: 'ABCD',
        company: 'Acme Biotech Corp',
        insider_name: 'Sarah Chen',
        insider_title: 'Chief Executive Officer, Pres',
        price: '2.14',
        shares: '192500',
        value: '412000'
    },
    {
        trade_date: '2026-07-06',
        ticker: 'ABCD',
        company: 'Acme Biotech Corp',
        insider_name: 'John Miller',
        insider_title: 'Chief Financial Officer, VP',
        price: '2.14',
        shares: '50000',
        value: '107000'
    },
    {
        trade_date: '2026-07-05',
        ticker: 'WXYZ',
        company: 'Wexford Mining Ltd',
        insider_name: 'Robert Vance',
        insider_title: 'Director',
        price: '0.953',
        shares: '100000',
        value: '95300'
    },
    {
        trade_date: '2026-07-04',
        ticker: 'PLTR',
        company: 'Palantir Technologies',
        insider_name: 'Alex Karp',
        insider_title: 'CEO, Director',
        price: '16.50',
        shares: '303030',
        value: '5000000'
    },
    {
        trade_date: '2026-07-04',
        ticker: 'GOOG',
        company: 'Alphabet Inc',
        insider_name: 'Sundar Pichai',
        insider_title: 'CEO',
        price: '140.00',
        shares: '10000',
        value: '1400000'
    },
    {
        trade_date: '2026-07-03',
        ticker: 'TSLA',
        company: 'Tesla Inc',
        insider_name: 'Elon Musk',
        insider_title: 'CEO, 10% Owner',
        price: '180.00',
        shares: '55555',
        value: '1000000'
    },
    {
        trade_date: '2026-07-03',
        ticker: 'MSFT',
        company: 'Microsoft Corp',
        insider_name: 'Satya Nadella',
        insider_title: 'Chairman, CEO',
        price: '380.00',
        shares: '5000',
        value: '1900000'
    },
    {
        trade_date: '2026-07-02',
        ticker: 'NVDA',
        company: 'NVIDIA Corp',
        insider_name: 'Jensen Huang',
        insider_title: 'CEO, President',
        price: '480.00',
        shares: '25000',
        value: '12000000'
    },
    {
        trade_date: '2026-07-01',
        ticker: 'AAPL',
        company: 'Apple Inc',
        insider_name: 'Tim Cook',
        insider_title: 'Chief Executive Officer',
        price: '185.00',
        shares: '100000',
        value: '18500000'
    },
    {
        trade_date: '2026-06-30',
        ticker: 'AMZN',
        company: 'Amazon.com Inc',
        insider_name: 'Andy Jassy',
        insider_title: 'President & CEO',
        price: '150.00',
        shares: '33333',
        value: '5000000'
    },
    {
        trade_date: '2026-06-29',
        ticker: 'META',
        company: 'Meta Platforms Inc',
        insider_name: 'Mark Zuckerberg',
        insider_title: 'COB and CEO',
        price: '350.00',
        shares: '14285',
        value: '5000000'
    },
    {
        trade_date: '2026-06-28',
        ticker: 'NFLX',
        company: 'Netflix Inc',
        insider_name: 'Ted Sarandos',
        insider_title: 'Co-CEO',
        price: '450.00',
        shares: '2222',
        value: '1000000'
    }
];

app.get('/api/data', async (req, res) => {
    try {
        // Serve from fresh cache if available and not expired
        if (cache.data && (Date.now() - cache.lastUpdated < CACHE_DURATION)) {
            console.log('Serving from cache');
            return res.json({
                lastUpdated: cache.lastUpdated,
                data: cache.data,
                mocked: cache.mocked
            });
        }

        // Avoid cache stampede: use a single in-flight promise for concurrent requests
        if (!inflight) {
            inflight = fetchFromOpenInsider()
                .then(rows => {
                    cache.data = rows;
                    cache.lastUpdated = Date.now();
                    cache.mocked = false;
                    console.log('Cache successfully updated');
                    
                    // Save the updated cache to disk
                    try {
                        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
                    } catch (e) {
                        console.error('Failed to write cache file to disk:', e.message);
                    }
                    return rows;
                })
                .finally(() => {
                    inflight = null;
                });
        } else {
            console.log('Awaiting in-flight scrape request...');
        }

        const rows = await inflight;

        res.json({
            lastUpdated: cache.lastUpdated,
            data: rows,
            mocked: cache.mocked
        });
    } catch (error) {
        console.error('Error fetching data:', error.message);
        
        // Serve stale cache on failure if available
        if (cache.data) {
            console.log('Serving stale cache on failure');
            return res.json({
                lastUpdated: cache.lastUpdated,
                data: cache.data,
                stale: true,
                mocked: cache.mocked
            });
        }
        
        // If there is no cache yet, fall back to mock data ONLY in development (local test environments)
        if (process.env.NODE_ENV !== 'production') {
            console.log('OpenInsider is unreachable and cache is empty. Serving mock data fallback.');
            cache.data = MOCK_DATA;
            cache.lastUpdated = Date.now();
            cache.mocked = true;
            return res.json({
                lastUpdated: cache.lastUpdated,
                data: cache.data,
                stale: true,
                mocked: true
            });
        }
        
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
