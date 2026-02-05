const express = require('express');
const imap = require('imap-simple');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

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

        // Helper to flatten boxes (imap-simple returns nested object)
        const getBoxList = (boxList, parent = '') => {
            let result = [];
            for (const key in boxList) {
                const box = boxList[key];
                // Use the delimiter from the box object itself, fallback to '/' if missing
                const delimiter = box.delimiter || '/';
                const name = parent ? `${parent}${delimiter}${key}` : key;

                result.push(name);
                if (box.children) {
                    result = result.concat(getBoxList(box.children, name));
                }
            }
            return result;
        };

        const flattenedBoxes = getBoxList(boxes);
        console.log('Available Mailboxes:', flattenedBoxes); // Debug log
        await connection.end();

        return res.json({ status: 'success', boxes: flattenedBoxes });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

const { simpleParser } = require('mailparser');

// ... (previous code)

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
            bodies: ['HEADER', ''], // Fetch Header (for easy parsing) AND Full Raw for body text
            struct: false,
            markSeen: false
        };

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

        // Helper to fetch messages (handles range/uids and streams)
        const fetchMessages = (target, options) => {
            return new Promise((resolve, reject) => {
                const f = connection.imap.seq.fetch(target, options);
                const msgs = [];
                f.on('message', (msg, seqno) => {
                    let attributes = { uid: seqno };
                    let parts = [];
                    msg.on('attributes', attrs => { attributes = attrs; });
                    msg.on('body', (stream, info) => {
                        let buffer = '';
                        stream.on('data', chunk => buffer += chunk.toString('utf8'));
                        stream.on('end', () => {
                            parts.push({ which: info.which, body: buffer });
                        });
                    });
                    msg.on('end', () => {
                        msgs.push({ attributes, parts, seqNo: seqno });
                    });
                });
                f.once('error', reject);
                f.once('end', () => resolve(msgs));
            });
        };

        let messageObjects = [];
        const rangeStr = String(range || '1:20');

        if (rangeStr.includes(':')) {
            messageObjects = await fetchMessages(rangeStr, fetchOptions);
        } else {
            const uids = await connection.search(['ALL']);
            const limit = parseInt(rangeStr) || 20;
            const targetUids = uids.slice(-limit).reverse();
            if (targetUids.length > 0) {
                // For targetUids, we need to convert them to sequence numbers if we use seq.fetch
                // or use connection.imap.fetch. Let's use search result uids with raw fetch.
                messageObjects = await new Promise((resolve, reject) => {
                    const f = connection.imap.fetch(targetUids, fetchOptions);
                    const msgs = [];
                    f.on('message', (msg, seqno) => {
                        let attributes = { uid: seqno };
                        let parts = [];
                        msg.on('attributes', attrs => { attributes = attrs; });
                        msg.on('body', (stream, info) => {
                            let buffer = '';
                            stream.on('data', chunk => buffer += chunk.toString('utf8'));
                            stream.on('end', () => {
                                parts.push({ which: info.which, body: buffer });
                            });
                        });
                        msg.on('end', () => {
                            msgs.push({ attributes, parts, seqNo: seqno });
                        });
                    });
                    f.once('error', reject);
                    f.once('end', () => resolve(msgs));
                });
            }
        }

        console.log(`[Backend] Fetched ${messageObjects.length} messages for box ${box}`);

        const processedMessages = await Promise.all(messageObjects.map(async (item) => {
            // Flexible part detection
            const headerPart = item.parts.find(p => p.which.toUpperCase().includes('HEADER'));
            const bodyPart = item.parts.find(p => p.which === '' || p.which.toUpperCase().includes('TEXT'));

            // Header parsing
            let headers = {};
            if (headerPart && typeof headerPart.body === 'object') headers = headerPart.body;
            else if (headerPart) headers = parseHeaderStr(headerPart.body);

            // Body Parsing
            let textBody = '';
            const rawBody = bodyPart ? bodyPart.body : '';

            if (rawBody) {
                try {
                    const parsed = await simpleParser(rawBody);
                    textBody = (parsed.text || '').trim();

                    // Fallback to HTML-to-Text if plain text is missing
                    if (!textBody && parsed.html) {
                        textBody = parsed.html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
                    }
                } catch (e) {
                    console.error(`[Backend] UID ${item.attributes.uid} Parse Error:`, e);
                    textBody = '(Error parsing body)';
                }
            }

            console.log(`[Backend] UID ${item.attributes.uid} | Part: ${bodyPart?.which || 'NONE'} | Body Len: ${textBody.length}`);

            return {
                id: item.attributes ? item.attributes.uid : item.seqNo,
                seq: item.seqNo,
                headers: headers,
                raw: rawBody || '', // Store the raw content for viewer
                bodyText: textBody || '(No text content found)'
            };
        }));

        await connection.end();
        console.log(`[Backend] Done. Returning ${processedMessages.length} emails.`);
        return res.json({ status: 'success', data: processedMessages });

    } catch (err) {
        console.error('[Backend] Fetch failed:', err);
        return res.status(500).json({ status: 'error', message: 'Failed to fetch messages', details: err.message });
    }
});

// Export for Vercel
module.exports = app;

// Only listen if not running in Vercel
if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}
