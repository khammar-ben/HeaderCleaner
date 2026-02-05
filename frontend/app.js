// State
const state = {
    email: '',
    password: '', // Stored only in RAM
    emails: [],
    selectedEmailId: null,
    isRawMode: true,
    isAnonymized: false,
    currentBox: 'INBOX',
    currentRange: '1:*',
    checkedEmailIds: new Set()
};

// DOM Elements
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginStatus = document.getElementById('loginStatus');
const loader = document.getElementById('loader');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const emailList = document.getElementById('emailList');
const contentArea = document.getElementById('contentArea');
const emptyState = document.getElementById('emptyState');
const headerContent = document.getElementById('headerContent');
const metaSubject = document.getElementById('metaSubject');

const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const viewBtn = document.getElementById('viewBtn');
const scriptTestBtn = document.getElementById('scriptTestBtn');

// Modal Elements
const viewModal = document.getElementById('viewModal');
const viewContent = document.getElementById('viewContent');
const closeViewBtn = document.getElementById('closeViewBtn');
const applyRangeBtn = document.getElementById('applyRangeBtn');
const boxSelect = document.getElementById('boxSelect');
const rangeStart = document.getElementById('rangeStart');
const rangeEnd = document.getElementById('rangeEnd');
const copyViewBtn = document.getElementById('copyViewBtn');
const downloadViewBtn = document.getElementById('downloadViewBtn');
const toast = document.getElementById('toast');

// API Configuration
// For local dev (frontend on 5000, backend on 3000), use absolute URL.
// For production (Vercel), use relative /api
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.'))
    ? `http://${window.location.hostname}:3000/api`
    : '/api';

// Check backend health on load
async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_URL}/health`);
        const data = await res.json();
        console.log('✅ Backend Bridge Active:', data.time);
    } catch (err) {
        console.error('❌ Backend Bridge Offline:', err);
        showStatus('Backend unreachable. Check server status.', 'text-amber-500');
    }
}
window.addEventListener('load', checkBackendHealth);

// Script content
const SCRIPT_CONTENT = `(function() {
    // === 🛠️ CONFIG ===
    const SEPARATOR = "__SEP__";
    const PLACEHOLDER = "{{NEWS}}";
    const BUTTON_SELECTOR = 'button[data-action-type="test_ips"]';
    const CREATIVE_TEXTAREA_SELECTOR = 'textarea[name="creatives[value][]"]';
    const HEADER_TEXTAREA_SELECTOR = 'textarea.header';
    const RECIPIENT_SELECTOR = '#rcpt_to';

    // === 🔴 CONTROL FLAGS ===
    let isStopped = false;
    let isPaused = false;
    let currentIndex = 0;
    let versions = [];
    let originalCreativeTemplate = "";
    let originalHeaderTemplate = "";
    let originalRecipientEmail = "";
    let recipientInput = null;
    let creativeTextarea = null;
    let headerTextarea = null;

    // Wait for element
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const check = () => {
                const el = document.querySelector(selector);
                if (el) resolve(el);
                else if (Date.now() - startTime > timeout) resolve(null);
                else setTimeout(check, 200);
            };
            check();
        });
    }

    // Extract base email
    function extractBaseEmail(email) {
        if (!email || !email.includes('@')) return email;
        const [local, domain] = email.split('@');
        return local.split('+')[0] + '@' + domain;
    }

    // Create button helper
    function createButton(id, text, color, onClick) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.innerText = text;
        btn.style.cssText = \`
            padding: 12px 24px;
            background: \${color};
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            transition: transform 0.2s, opacity 0.2s;
            margin: 5px;
        \`;
        btn.onmouseover = () => btn.style.transform = "scale(1.05)";
        btn.onmouseout = () => btn.style.transform = "scale(1)";
        btn.onclick = onClick;
        return btn;
    }

    // Update textarea helper
    function updateTextarea(textarea, value) {
        if (!textarea) return;
        textarea.focus();
        textarea.value = value;
        ['input', 'change'].forEach(eventType => {
            textarea.dispatchEvent(new Event(eventType, { bubbles: true }));
        });
        textarea.blur();
    }

    // Main initialization
    Promise.all([
        waitForElement(CREATIVE_TEXTAREA_SELECTOR),
        waitForElement(HEADER_TEXTAREA_SELECTOR)
    ])
        .then(async ([creative, header]) => {
            if (!creative) {
                alert("❌ Creative textarea not found. Check selector: " + CREATIVE_TEXTAREA_SELECTOR);
                return;
            }

            creativeTextarea = creative;
            originalCreativeTemplate = creative.value;

            if (header) {
                headerTextarea = header;
                originalHeaderTemplate = header.value;
            }

            // Wait for recipient input
            recipientInput = await waitForElement(RECIPIENT_SELECTOR);
            if (recipientInput) {
                originalRecipientEmail = extractBaseEmail(recipientInput.value.trim());
            }

            // Remove old buttons
            ['automation-btn', 'stop-btn', 'continue-btn', 'delete-btn'].forEach(id => {
                const existing = document.querySelector(\`#\${id}\`);
                if (existing) existing.remove();
            });

            // Create button container
            const container = document.createElement('div');
            container.id = 'automation-controls';
            container.style.cssText = \`
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 5px;
            \`;

            // Buttons
            const startBtn = createButton('automation-btn', '🤖 Start Replacement', 'linear-gradient(135deg, #6e8efb, #a777e3)', handleStart);
            const stopBtn = createButton('stop-btn', '⏹️ Stop', '#f44336', handleStop);
            const continueBtn = createButton('continue-btn', '▶️ Continue', '#4CAF50', handleContinue);
            const deleteBtn = createButton('delete-btn', '🗑️ Reset', '#9E9E9E', handleDelete);

            stopBtn.style.display = 'none';
            continueBtn.style.display = 'none';

            container.appendChild(startBtn);
            container.appendChild(stopBtn);
            container.appendChild(continueBtn);
            container.appendChild(deleteBtn);
            document.body.appendChild(container);

            const infoBox = document.createElement('div');
            infoBox.id = 'test-info-box';
            infoBox.style.cssText = "position:fixed; top:20px; left:20px; z-index:99999; background:white; border:2px solid #6e8efb; border-radius:12px; padding:20px; display:none; min-width:300px; box-shadow:0 4px 20px rgba(0,0,0,0.3); font-family:sans-serif;";
            infoBox.innerHTML = '<h3>📊 Progress</h3><div id="info-status">Idle</div><div id="info-current"></div><div id="info-total"></div><div id="info-preview" style="font-size:10px; max-height:100px; overflow:auto; margin-top:10px; background:#f5f5f5; padding:5px;"></div>';
            document.body.appendChild(infoBox);

            function updateInfoBox(status, cur, tot, content) {
                infoBox.style.display = 'block';
                document.getElementById('info-status').innerText = status;
                document.getElementById('info-current').innerText = "Current: " + cur;
                document.getElementById('info-total').innerText = "Total: " + tot;
                document.getElementById('info-preview').innerText = content;
            }

            async function handleStart() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.txt';
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    versions = (await file.text()).split(SEPARATOR).map(v => v.trim()).filter(v => v.length > 0);
                    if (versions.length === 0) return alert("No versions found");
                    const testBtn = document.querySelector(BUTTON_SELECTOR);
                    if (!testBtn) return alert("Test button not found");
                    isStopped = false; isPaused = false; currentIndex = 0;
                    startBtn.style.display = 'none'; stopBtn.style.display = 'block';
                    await runTests(testBtn);
                };
                input.click();
            }

            function handleStop() { isPaused = true; stopBtn.style.display = 'none'; continueBtn.style.display = 'block'; }
            function handleContinue() { isPaused = false; continueBtn.style.display = 'none'; stopBtn.style.display = 'block'; runTests(document.querySelector(BUTTON_SELECTOR)); }
            function handleDelete() { if(confirm('Reset?')){ location.reload(); } }

            async function runTests(testBtn) {
                for (let i = currentIndex; i < versions.length; i++) {
                    if (isStopped || isPaused) { currentIndex = i; return; }
                    const v = versions[i];
                    updateInfoBox('Running', i+1, versions.length, v);
                    updateTextarea(creativeTextarea, originalCreativeTemplate.replace(new RegExp(PLACEHOLDER, 'g'), v));
                    if (headerTextarea) updateTextarea(headerTextarea, originalHeaderTemplate.replace(new RegExp(PLACEHOLDER, 'g'), v));
                    if (recipientInput) {
                        const [local, domain] = originalRecipientEmail.split('@');
                        recipientInput.value = \`\${local}+\${i+1}@\${domain}\`;
                        recipientInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    testBtn.click();
                    await new Promise(r => setTimeout(r, 3000));
                }
                updateInfoBox('Completed', versions.length, versions.length, 'Done');
                startBtn.style.display = 'block'; stopBtn.style.display = 'none';
            }
        });
})();\`;
`;

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
refreshBtn.addEventListener('click', () => fetchEmails());
copyBtn.addEventListener('click', copyToClipboard);
downloadBtn.addEventListener('click', downloadOriginals);
viewBtn.addEventListener('click', openViewModal);

scriptTestBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(SCRIPT_CONTENT).then(() => {
        showToast('Script copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy script:', err);
        showToast('Failed to copy script', true);
    });
});

closeViewBtn.addEventListener('click', () => viewModal.classList.add('hidden'));
copyViewBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(viewContent.value).then(() => showToast('Content copied!'));
});
downloadViewBtn.addEventListener('click', () => {
    const content = viewContent.value;
    if (!content) return;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected_content_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
});

// Close modal on outside click
viewModal.addEventListener('click', (e) => {
    if (e.target === viewModal) viewModal.classList.add('hidden');
});

applyRangeBtn.addEventListener('click', handleRangeUpdate);
boxSelect.addEventListener('change', (e) => {
    state.currentBox = e.target.value;
    fetchEmails();
});



// Mode Toggle Listeners
document.getElementById('btnRaw').addEventListener('click', () => {
    state.isAnonymized = false;
    updateModeUI();
    renderViewer(state.emails.find(e => e.id === state.selectedEmailId));
});

document.getElementById('btnCleaned').addEventListener('click', () => {
    state.isAnonymized = true;
    updateModeUI();
    renderViewer(state.emails.find(e => e.id === state.selectedEmailId));
});

function updateModeUI() {
    const btnRaw = document.getElementById('btnRaw');
    const btnCleaned = document.getElementById('btnCleaned');

    if (state.isAnonymized) {
        btnCleaned.className = 'px-3 py-1 rounded-md text-sm font-medium bg-pink-500 text-white shadow-sm transition';
        btnRaw.className = 'px-3 py-1 rounded-md text-sm font-medium text-gray-400 hover:text-white transition';
    } else {
        btnRaw.className = 'px-3 py-1 rounded-md text-sm font-medium bg-pink-500 text-white shadow-sm transition';
        btnCleaned.className = 'px-3 py-1 rounded-md text-sm font-medium text-gray-400 hover:text-white transition';
    }
}



// Process Button Listener
document.getElementById('processBtn').addEventListener('click', () => {
    state.isAnonymized = true; // Force cleaned mode
    renderViewer(state.emails.find(e => e.id === state.selectedEmailId));
});



// Handlers
async function handleLogin(e) {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
        showStatus('Please fill all fields', 'text-red-400');
        return;
    }

    showLoader(true);
    showStatus('Verifying credentials...', 'text-blue-400');

    try {
        const response = await fetch(`${API_URL}/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Success
            state.email = email;
            state.password = password; // Keep in RAM

            showStatus('Connected!', 'text-green-400');

            // Switch UI
            setTimeout(() => {
                loginSection.classList.add('hidden');
                dashboardSection.classList.remove('hidden');
                dashboardSection.classList.add('flex'); // Restore flex layout
                // Small delay to allow display:flex to apply before opacity transition
                requestAnimationFrame(() => {
                    dashboardSection.classList.remove('opacity-0', 'translate-y-4');
                });

                // Clear inputs
                passwordInput.value = '';

                // Fetch Boxes and Data
                fetchBoxes();

                fetchEmails();
            }, 800);

        } else {
            showStatus(data.message || 'Connection failed', 'text-red-400');
            state.password = '';
        }

    } catch (err) {
        const errorMsg = err.name === 'TypeError' ? 'Connection refused. Is backend running?' : err.message;
        showStatus(`Error: ${errorMsg}`, 'text-red-400');
        console.error('Login Error:', err);
    } finally {
        showLoader(false);
    }
}

async function fetchBoxes() {
    try {
        const response = await fetch(`${API_URL}/get-boxes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: state.email, password: state.password })
        });
        const data = await response.json();

        if (data.status === 'success' && data.boxes) {
            boxSelect.innerHTML = '';

            // Boxes is now a flat array of strings
            // Sort alphabetically for easier navigation
            data.boxes.sort((a, b) => a.localeCompare(b));

            data.boxes.forEach(boxName => {
                const opt = document.createElement('option');
                opt.value = boxName;
                opt.textContent = boxName;
                if (boxName === 'INBOX') opt.selected = true;
                boxSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Failed to load boxes", e);
    }
}

function handleRangeUpdate() {
    const start = rangeStart.value.trim();
    const end = rangeEnd.value.trim();

    if (start || end) {
        // Default logic: start:end. If empty, assume 1 or *
        state.currentRange = `${start || '1'}:${end || '*'}`;
        fetchEmails();
    }
}

function handleLogout() {
    state.email = '';
    state.password = '';
    state.emails = [];
    state.selectedEmailId = null;

    // Switch UI Back
    dashboardSection.classList.add('opacity-0', 'translate-y-4');
    setTimeout(() => {
        dashboardSection.classList.add('hidden');
        dashboardSection.classList.remove('flex');

        loginSection.classList.remove('hidden');
        requestAnimationFrame(() => {
            // Restore login section reset if any animations needed
        });

        loginForm.reset();
        showStatus('', '');
        emailList.innerHTML = '';
        renderViewer(null);
    }, 500);
}

async function fetchEmails() {
    if (!state.email || !state.password) return;

    // Show loading state in list
    emailList.innerHTML = `<div class="text-center text-gray-500 mt-10 animate-pulse"><p>Fetching headers...</p></div>`;

    try {
        const response = await fetch(`${API_URL}/fetch-headers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: state.email,
                password: state.password,
                box: state.currentBox,
                range: state.currentRange || '1:*'
            })
        });

        const data = await response.json();

        if (response.ok) {
            state.emails = data.data;
            // Select all by default
            state.checkedEmailIds = new Set(data.data.map(e => e.id));
            renderEmailList();
        } else {
            showToast('Failed to fetch emails', true);
        }

    } catch (err) {
        console.error(err);
        showToast('Error fetching emails', true);
    }
}

function renderEmailList() {
    if (state.emails.length === 0) {
        emailList.innerHTML = `
            <div class="flex flex-col items-center justify-center h-48 text-slate-600">
                <i class="fa-solid fa-inbox text-4xl mb-3 opacity-20"></i>
                <p class="text-xs font-bold uppercase tracking-widest">No Buffer Data</p>
            </div>
        `;
        return;
    }

    const fragment = document.createDocumentFragment();
    state.emails.forEach(email => {
        const item = document.createElement('div');
        const isActive = state.selectedEmailId === email.id;
        item.className = `email-item glass-card p-3.5 rounded-2xl cursor-pointer relative group transition-all duration-300 ${isActive ? 'active' : 'hover:bg-white/5'}`;

        const fromFull = email.headers.from ? email.headers.from[0] : 'Unknown';
        const senderName = fromFull.split('<')[0].trim().replace(/^"|"$/g, '') || 'System';
        const initial = senderName.charAt(0).toUpperCase();
        const subject = email.headers.subject ? email.headers.subject[0] : '(No Subject)';
        const dateRaw = email.headers.date ? email.headers.date[0] : '';
        const dayMonth = dateRaw.split(' ').slice(1, 3).join(' ') || 'Node';

        item.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="relative flex items-center justify-center shrink-0">
                    <input type="checkbox" class="email-checkbox w-4 h-4 rounded-md border-white/10 bg-black/40 text-pink-500 focus:ring-0 transition-all cursor-pointer z-10" 
                    ${state.checkedEmailIds.has(email.id) ? 'checked' : ''} data-id="${email.id}">
                </div>
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-black shrink-0 transition-all duration-500 glass-card bg-gradient-to-br from-white/5 to-white/0 border-white/5 group-hover:border-pink-500/30 group-hover:text-pink-400">
                    ${initial}
                </div>
                <div class="flex-grow overflow-hidden pr-2">
                    <div class="flex justify-between items-center gap-2 mb-0.5">
                        <span class="text-[11px] font-black text-white/90 uppercase tracking-wider truncate">${senderName}</span>
                        <span class="text-[9px] text-slate-500 font-bold shrink-0 uppercase tracking-tighter">${dayMonth}</span>
                    </div>
                    <div class="text-[10px] text-slate-400 font-medium leading-tight truncate transition-colors group-hover:text-slate-200">
                        ${subject}
                    </div>
                </div>
            </div>
            ${isActive ? '<div class="absolute left-0 top-1/4 bottom-1/4 w-1 bg-pink-500 rounded-r-full shadow-[0_0_12px_rgba(236,72,153,0.5)]"></div>' : ''}
        `;

        item.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return;
            selectEmail(email.id);
        });

        const checkbox = item.querySelector('.email-checkbox');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) state.checkedEmailIds.add(email.id);
            else state.checkedEmailIds.delete(email.id);
        });

        fragment.appendChild(item);
    });

    emailList.innerHTML = '';
    emailList.appendChild(fragment);
}

function selectEmail(id) {
    if (state.selectedEmailId === id) return;

    // Update previous and new active items visually instead of re-rendering everything
    const items = emailList.querySelectorAll('.email-item');
    items.forEach(item => {
        const checkbox = item.querySelector('.email-checkbox');
        if (checkbox && checkbox.getAttribute('data-id') === String(id)) {
            item.classList.add('active');
            // Ensure the selection indicator bar is present
            if (!item.querySelector('.absolute.left-0')) {
                const bar = document.createElement('div');
                bar.className = 'absolute left-0 top-1/4 bottom-1/4 w-1 bg-pink-500 rounded-r-full shadow-[0_0_12px_rgba(236,72,153,0.5)]';
                item.appendChild(bar);
            }
        } else if (checkbox && checkbox.getAttribute('data-id') === String(state.selectedEmailId)) {
            item.classList.remove('active');
            const bar = item.querySelector('.absolute.left-0');
            if (bar) bar.remove();
        }
    });

    state.selectedEmailId = id;

    const instructionText = document.getElementById('instructionText');
    if (instructionText) instructionText.classList.add('hidden');

    const email = state.emails.find(e => e.id === id);
    if (email) {
        renderViewer(email);
    }
}

function renderViewer(email) {
    if (!email) {
        emptyState.classList.remove('hidden');
        contentArea.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    contentArea.classList.remove('hidden');

    // Extract meta info from raw header for display
    const raw = email.raw || '';
    const splitIndex = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
    const headerText = splitIndex !== -1 ? raw.substring(0, splitIndex) : raw;

    const regexVal = (key) => {
        const match = headerText.match(new RegExp(`^ ${key}: \\s * (.*)$`, 'im'));
        return match ? match[1].trim() : '';
    };
    metaFrom.textContent = regexVal('From');
    metaSubject.textContent = regexVal('Subject');

    // Display content based on mode
    headerContent.textContent = getProcessedContent(email);
}

// Helper to get raw or cleaned content based on current state
function getProcessedContent(email) {
    const raw = email.raw || '';
    if (!state.isAnonymized) return raw;

    // Cleaning logic
    let splitIndex = raw.indexOf('\r\n\r\n');
    if (splitIndex === -1) splitIndex = raw.indexOf('\n\n');

    let headerText = '';
    let bodyText = '';

    if (splitIndex !== -1) {
        headerText = raw.substring(0, splitIndex);
        bodyText = raw.substring(splitIndex);
    } else {
        headerText = raw;
    }

    const processedHeader = processHeaders(headerText);

    // Remove "Original Message" blocks
    let cleanBody = bodyText;
    const fwdIndex1 = cleanBody.indexOf('-----Original Message-----');
    const fwdIndex2 = cleanBody.indexOf('----- Original Message -----');
    const fwdIndex3 = cleanBody.indexOf('Begin forwarded message:');

    let cutIndex = -1;
    if (fwdIndex1 !== -1) cutIndex = fwdIndex1;
    if (fwdIndex2 !== -1 && (cutIndex === -1 || fwdIndex2 < cutIndex)) cutIndex = fwdIndex2;
    if (fwdIndex3 !== -1 && (cutIndex === -1 || fwdIndex3 < cutIndex)) cutIndex = fwdIndex3;

    if (cutIndex !== -1) {
        cleanBody = cleanBody.substring(0, cutIndex);
    }

    return processedHeader + cleanBody;
}

function processHeaders(raw) {
    // Config Values
    const domainVal = document.getElementById('domainInput').value.trim();
    const msgIdTag = document.getElementById('msgIdTag').value || '[EID]';
    const replaceDate = document.getElementById('replaceDate').checked;
    const replaceTo = document.getElementById('replaceTo').checked;
    const keepReceived = document.getElementById('keepReceived').checked;
    const keepReplyTo = document.getElementById('keepReplyTo').checked;
    const addCc = document.getElementById('addCc').checked;

    const lines = raw.split(/\r\n|\n/);
    let output = [];
    let hasCc = false;



    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.trim() === '') {
            output.push(line);
            continue;
        }

        let lowerLine = line.toLowerCase();

        // --- Selective Removal (Aggressive for "Clean Header") ---
        if (lowerLine.startsWith('arc-') ||
            lowerLine.startsWith('dkim-') ||
            lowerLine.startsWith('spf-') ||
            lowerLine.startsWith('authentication-results') ||
            lowerLine.startsWith('delivered-to') ||
            lowerLine.startsWith('return-path') ||
            lowerLine.startsWith('received-spf') ||
            lowerLine.startsWith('message-id') ||
            lowerLine.startsWith('x-')) {

            // Special case for Message-ID tag request
            if (lowerLine.startsWith('message-id:')) {
                if (line.includes('@')) {
                    output.push(line.replace('@', `${msgIdTag} @`));
                } else {
                    output.push(line);
                }
            }
            continue;
        }

        // --- Replacement Logic ---
        if (lowerLine.startsWith('date:')) {
            if (replaceDate) output.push('Date: [DATE]');
            else output.push(line);
        }
        else if (lowerLine.startsWith('to:')) {
            if (replaceTo) output.push('To: [*to]');
            else output.push(line);
        }
        else if (lowerLine.startsWith('received:')) {
            if (keepReceived) output.push(line);
        }
        else if (lowerLine.startsWith('reply-to:')) {
            if (keepReplyTo) output.push(line);
        }
        else if (lowerLine.startsWith('from:')) {
            // Domain processing
            // Regex to find "user@domain.com"
            const domainRegex = /@([\w.-]+)/;
            if (domainVal) {
                // Replace domain
                output.push(line.replace(domainRegex, `@${domainVal} `));
            } else {
                // Remove domain entirely.
                // "user@example.com" -> "user"
                // Or "user@" -> "user"
                // Requirement: "Replacing or removing domains".
                // Previous prompt said "replace with [DMN]". Now "Leave empty to remove".
                output.push(line.replace(domainRegex, ''));
            }
        }
        else if (lowerLine.startsWith('cc:')) {
            hasCc = true;
            output.push(line);
        }
        else {
            // Keep other headers (Subject, MIME, Content-Type, etc.)
            output.push(line);
        }
    }

    // Add missing Cc if requested
    if (addCc && !hasCc) {
        output.push('Cc: [*to]');
    }

    return output.join('\n') + '\n';
}



function downloadOriginals() {
    let emailsToProcess = state.emails;
    if (state.checkedEmailIds.size > 0) {
        emailsToProcess = state.emails.filter(e => state.checkedEmailIds.has(e.id));
    }

    if (emailsToProcess.length === 0) {
        showToast('No emails to save', true);
        return;
    }

    // Concatenate content with __SEP__ delimiter, respecting current mode
    const separator = '\n\n__SEP__\n\n';
    const allContent = emailsToProcess.map(e => getProcessedContent(e)).join(separator);

    const blob = new Blob([allContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis_${state.currentBox}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast('Analysis saved to file');
}

function downloadBody() {
    let emailsToProcess = state.emails;
    if (state.checkedEmailIds.size > 0) {
        emailsToProcess = state.emails.filter(e => state.checkedEmailIds.has(e.id));
    }

    if (emailsToProcess.length === 0) {
        showToast('No email target found', true);
        return;
    }

    const processBody = (body) => {
        if (!body) return '';
        let processed = replaceLinksWithDomain(body);
        processed = processed.replace(/\n{3,}/g, "\n\n");
        return processed.trim();
    };

    const separator = '\n\n__SEP__\n\n';
    const allContent = emailsToProcess.map(e => processBody(e.bodyText)).join(separator);

    if (!allContent) {
        showToast('No content to export', true);
        return;
    }

    const blob = new Blob([allContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emails_export_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast(`Exported ${emailsToProcess.length} email bodies`);
}

function openViewModal() {
    let emailsToProcess = state.emails;
    if (state.checkedEmailIds.size > 0) {
        emailsToProcess = state.emails.filter(e => state.checkedEmailIds.has(e.id));
    }

    if (emailsToProcess.length === 0) {
        showToast('No emails to view', true);
        return;
    }

    const separator = '\n\n__SEP__\n\n';
    const allContent = emailsToProcess.map(e => getProcessedContent(e)).join(separator);

    viewContent.value = allContent;
    viewModal.classList.remove('hidden');
}

// UI Helpers
function showStatus(msg, colorClass) {
    loginStatus.className = `h - 6 text - center text - sm font - medium ${colorClass} `;
    loginStatus.textContent = msg;
}

function showLoader(show) {
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
    loader.style.display = show ? 'flex' : 'none';
}

function showToast(msg, isError = false) {
    toastMsg.textContent = msg;
    toast.classList.remove('translate-y-20', 'opacity-0');

    const icon = toast.querySelector('i');
    if (isError) {
        icon.className = 'fa-solid fa-circle-exclamation text-red-400';
    } else {
        icon.className = 'fa-solid fa-circle-check text-green-400';
    }

    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

function copyToClipboard() {
    // If checkboxes are selected, copy processed content for all selected
    if (state.checkedEmailIds.size > 0) {
        const separator = '\n\n__SEP__\n\n';
        const selectedEmails = state.emails.filter(e => state.checkedEmailIds.has(e.id));

        let clips = [];
        selectedEmails.forEach(email => {
            const raw = email.raw || '';
            // Process according to current mode (state.isAnonymized)
            // But usually we just want the output logic from renderViewer but without DOM ops

            // Simplified extraction logic mirroring renderViewer:
            let splitIndex = raw.indexOf('\r\n\r\n');
            if (splitIndex === -1) splitIndex = raw.indexOf('\n\n');
            let headerText = (splitIndex !== -1) ? raw.substring(0, splitIndex) : raw;
            let bodyText = (splitIndex !== -1) ? raw.substring(splitIndex) : '';

            let finalText = raw;
            if (state.isAnonymized) {
                const processedHeader = processHeaders(headerText);
                let cleanBody = bodyText;
                // Basic body cleanup
                const fwdIndex = cleanBody.indexOf('-----Original Message-----'); // simplified check
                if (fwdIndex !== -1) cleanBody = cleanBody.substring(0, fwdIndex);

                finalText = processedHeader + cleanBody;
            }
            clips.push(finalText);
        });

        const fullText = clips.join(separator);
        navigator.clipboard.writeText(fullText).then(() => {
            showToast(`Copied ${clips.length} emails to clipboard`);
        });

    } else {
        // Fallback: Copy whatever is currently in the view
        const text = headerContent.textContent;
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Headers copied to clipboard');
            });
        }
    }
}

// Sidebars & Collapsibles
const themeToggle = document.getElementById('themeToggle');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const toggleRules = document.getElementById('toggleRules');
const rulesContent = document.getElementById('rulesContent');
const rulesCaret = document.getElementById('rulesCaret');

function updateThemeUI(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;
    if (themeIcon) {
        themeIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    }
    localStorage.setItem('theme', theme);
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        updateThemeUI(newTheme);
    });
}

if (toggleRules && rulesContent && rulesCaret) {
    toggleRules.addEventListener('click', () => {
        console.log('Rules toggle clicked');
        rulesContent.classList.toggle('collapsed');
        rulesCaret.classList.toggle('rotated');
    });
}

if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const icon = sidebarToggle.querySelector('i');
        if (icon) {
            icon.className = sidebar.classList.contains('collapsed')
                ? 'fa-solid fa-bars'
                : 'fa-solid fa-bars-staggered';
        }
    });
}

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('theme') || 'dark';
updateThemeUI(savedTheme);
