const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static('public'));

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cache = {
    data: null,
    lastUpdated: 0
};

app.get('/api/data', async (req, res) => {
    try {
        // Check cache
        if (cache.data && (Date.now() - cache.lastUpdated < CACHE_DURATION)) {
            console.log('Serving from cache');
            return res.json(cache.data);
        }

        console.log('Fetching new data from OpenInsider...');
        const response = await axios.get('http://openinsider.com/screener?s=&o=&pl=&ph=5&ll=&lh=&fd=730&fdr=&td=0&tdr=&fdlyl=&fdlyh=&daysago=&xp=1&vl=25&vh=&ocl=&och=&sic1=-1&sicl=100&sich=9999&grp=0&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=&sortcol=0&cnt=100&page=1', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive'
            }
        });
        const html = response.data;
        const $ = cheerio.load(html);
        const rows = [];
        $('table.tinytable tbody tr').each((i, elem) => {
            const cells = [];
            $(elem).find('td').each((j, td) => {
                cells.push($(td).text().trim());
            });
            // Use the same cleaning logic as user provided
            const clean = (val) => val?.replace(/[+$,]/g, '').trim();
            rows.push({
                trade_date: cells[2] || '',
                ticker: cells[3] || '',
                company: cells[4] || '',
                price: clean(cells[8]),
                shares: clean(cells[9]),
                change_percent: clean(cells[11]).replace(/[+%]/g, ''),
                value: clean(cells[12])
            });
        });

        // Update cache
        cache.data = rows;
        cache.lastUpdated = Date.now();
        console.log('Cache updated');

        res.json(rows);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
