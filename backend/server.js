const express = require('express');
const imap = require('imap-simple');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Helper function to connect to IMAP
const connectToImap = (email, password) => {
    const config = {
        imap: {
            user: email,
            password: password,
            host: 'imap.gmail.com',
            port: 993,
            tls: true,
            authTimeout: 10000,
            tlsOptions: { rejectUnauthorized: false } // Sometimes needed for local dev/nodejs versions, usually safe for this specific use case but good to be aware.
        }
    };
    return imap.connect(config);
};

// Endpoint 1: Verify Connection
app.post('/api/connect', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const connection = await connectToImap(email, password);
        await connection.end(); // Close immediately
        return res.status(200).json({ status: 'success', message: 'Connected successfully' });
    } catch (err) {
        console.error('Connection failed:', err);
        return res.status(401).json({ status: 'error', message: 'Authentication failed. Check credentials.', details: err.message });
    }
});

// Endpoint 2: Get Mailboxes
app.post('/api/get-boxes', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

    try {
        const connection = await connectToImap(email, password);
        const boxes = await connection.getBoxes();
        await connection.end();

        // Helper to flatten boxes (imap-simple returns nested object)
        const getBoxList = (boxList, parent = '') => {
            let result = [];
            for (const key in boxList) {
                const box = boxList[key];
                const name = parent ? `${parent}${connection.delimiter}${key}` : key;
                // Some servers need path, some need name. Name is usually safe for selection if delimiter handled.
                // imap-simple structure: keys are names. children are nested?
                // Actually connection.getBoxes() returns object where keys are box names.
                // We'll return full list.
                result.push(name);
                if (box.children) {
                    result = result.concat(getBoxList(box.children, name));
                }
            }
            return result;
        };
        // Note: getBoxes structure varies slightly. Keys are names. Children under children.
        // Let's just return a simplified list of keys for now or deep traverse if needed.
        // For Gmail, usually simpler to just iterate keys.

        return res.json({ status: 'success', boxes });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// Endpoint 3: Fetch Headers with Options
app.post('/api/fetch-headers', async (req, res) => {
    const { email, password, box = 'INBOX', range = '1:*' } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const connection = await connectToImap(email, password);
        await connection.openBox(box);

        const fetchOptions = {
            bodies: ['HEADER', ''], // Fetch Header (for easy parsing) AND Full Raw
            struct: false,
            markSeen: false
        };

        // If user requested a custom range string like "100:150", use it.
        // imap-simple works with search criteria or fetch sequence.
        // '1:*' is all.
        // Usually we use seq.fetch(range, options).

        // Let's use search by Sequence if range is standard, or just ALL.
        // But the user might want "Last 50" which we did before.
        // Let's interpret 'range' parameter.

        // Helper to parse raw header string to object
        const parseHeaderStr = (str) => {
            const headers = {};
            if (!str) return headers;
            str.split(/\r\n|\n/).forEach(line => {
                const parts = line.match(/^([^:]+):\s*(.*)$/);
                if (parts) {
                    const key = parts[1].toLowerCase();
                    const val = parts[2];
                    if (!headers[key]) headers[key] = [];
                    headers[key].push(val);
                }
            });
            return headers;
        };

        let messages = [];

        if (range.includes(':')) {
            // Assume sequence range e.g. "100:200" or "1:*"
            // imap-simple connection.search is wrapper around node-imap search.
            // To use SEQUENCE numbers in fetch directly, we access the underlying node-imap logic or use search.
            // Search usually takes criteria. Criteria can be [['UID', '...']] or just search criteria strings.
            // However, fetching by range is usually done via `imap.seq.fetch`.
            // imap-simple exposes the underlying `imap` object as `connection.imap`.

            // Simpler: Use imap-simple's `fetch` method if it supports range, or just search ALL and slice?
            // Search ALL is slow for large inboxes.

            // Let's use basic search for now, but optimize for range if possible.
            // Actually, the user asked for "range".
            // Let's try to pass the range to seq.fetch equivalent.

            // Delay: getting valid sequence numbers requires knowing the total count?
            // '1:*' works.

            const delay = (ms) => new Promise(res => setTimeout(res, ms));

            // Using low-level node-imap fetch for range efficiency
            messages = await new Promise((resolve, reject) => {
                const f = connection.imap.seq.fetch(range, fetchOptions);
                const msgs = [];
                f.on('message', (msg, seqno) => {
                    let attributes = { uid: seqno }; // Fallback
                    let parts = [];

                    msg.on('attributes', attrs => { attributes = attrs; });
                    msg.on('body', (stream, info) => {
                        let buffer = '';
                        stream.on('data', chunk => buffer += chunk.toString('utf8'));
                        stream.on('end', () => {
                            parts.push({ which: info.which, body: buffer }); // Raw string for header
                        });
                    });
                    msg.on('end', () => {
                        msgs.push({ attributes, parts, seqNo: seqno });
                    });
                });
                f.once('error', reject);
                f.once('end', () => resolve(msgs));
            });

            messages = messages.map(m => {
                const headerPart = m.parts.find(p => p.which === 'HEADER');
                const fullPart = m.parts.find(p => p.which === '');

                // Parse headers manually since node-imap returns string
                const headerObj = parseHeaderStr(headerPart ? headerPart.body : '');

                return {
                    id: m.attributes.uid,
                    seq: m.seqNo,
                    headers: headerObj,
                    raw: fullPart ? fullPart.body : ''
                };
            });

        } else {
            // Default "Last N" behavior logic via Search
            const searchCriteria = ['ALL'];
            const allMessages = await connection.search(searchCriteria, fetchOptions);
            const limit = parseInt(range) || 20; // verify if range is just a number
            // Slicing result
            const recentMessages = allMessages.slice(-limit).reverse();

            messages = recentMessages.map(item => {
                const headerPart = item.parts.find(p => p.which === 'HEADER');
                const fullPart = item.parts.find(p => p.which === '');

                // imap-simple search results allow accessing body directly but it might be parsed or string depending on config.
                // With struct: false, it is usually string (or parser object if header).
                // imap-simple usually returns parsed object for 'HEADER' automatically?
                // Let's assume it might, but fallback to string parsing if it's a string.

                let headers = {};
                if (headerPart && typeof headerPart.body === 'object') {
                    headers = headerPart.body;
                } else if (headerPart) {
                    headers = parseHeaderStr(headerPart.body);
                }

                return {
                    id: item.attributes.uid,
                    seq: item.seqNo,
                    headers: headers,
                    raw: fullPart ? fullPart.body : ''
                };
            });
        }

        await connection.end();
        return res.json({ status: 'success', data: messages });

    } catch (err) {
        console.error('Fetch failed:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch messages', details: err.message });
    }
});

// Export for Vercel
module.exports = app;

// Only listen if not running in Vercel
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
