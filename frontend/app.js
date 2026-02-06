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
const metaFrom = document.getElementById('metaFrom');
const metaTo = document.getElementById('metaTo');
const metaDate = document.getElementById('metaDate');
const metaId = document.getElementById('metaId');
const metaSpf = document.getElementById('metaSpf');
const metaDkim = document.getElementById('metaDkim');
const metaDmarc = document.getElementById('metaDmarc');
const mainEmailList = document.getElementById('mainEmailList');

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
const getApiUrl = () => {
    const { hostname, protocol, port } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
        // Assume backend is always on 3000 during local dev
        return `${protocol}//${hostname}:3000/api`;
    }
    return '/api';
};
const API_URL = getApiUrl();

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


// Script content removed - now loaded from script.txt file


// Event Listeners
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
refreshBtn.addEventListener('click', () => fetchEmails());
copyBtn.addEventListener('click', copyToClipboard);
downloadBtn.addEventListener('click', downloadOriginals);
viewBtn.addEventListener('click', openViewModal);

const returnToListBtn = document.getElementById('returnToListBtn');
if (returnToListBtn) {
    returnToListBtn.addEventListener('click', () => selectEmail(null));
}

scriptTestBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('script.txt');
        if (!response.ok) {
            throw new Error('script.txt not found');
        }
        const scriptContent = await response.text();
        await navigator.clipboard.writeText(scriptContent);
        showToast('Script copied to clipboard!');
    } catch (err) {
        console.error('Failed to load/copy script:', err);
        showToast('Failed to copy script - ensure script.txt exists', true);
    }
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
        btnCleaned.className = 'px-3 py-1 rounded-md text-sm font-medium bg-sky-500 text-white shadow-sm transition';
        btnRaw.className = 'px-3 py-1 rounded-md text-sm font-medium text-gray-400 hover:text-white transition';
    } else {
        btnRaw.className = 'px-3 py-1 rounded-md text-sm font-medium bg-sky-500 text-white shadow-sm transition';
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
            console.log('✅ Connection Successful');
            state.email = email;
            state.password = password; // Keep in RAM

            showStatus('Protocol Link Established!', 'text-green-400');

            // Switch UI
            setTimeout(() => {
                loginSection.classList.add('hidden');
                dashboardSection.classList.remove('hidden');
                dashboardSection.classList.add('flex'); // Restore flex layout

                requestAnimationFrame(() => {
                    dashboardSection.classList.remove('opacity-0', 'translate-y-4');
                });

                // Clear inputs and status
                passwordInput.value = '';
                showStatus('', '');

                // Fetch Boxes and Data
                fetchBoxes();
                fetchEmails();
            }, 800);

        } else {
            console.warn('❌ Connection Failed:', data.message);
            showStatus(data.message || 'Verification Failed', 'text-red-400');
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
    const mainEmailList = document.getElementById('mainEmailList');

    if (state.emails.length === 0) {
        if (mainEmailList) mainEmailList.innerHTML = '';
        return;
    }

    // Render ONLY in main content area
    const mainFragment = document.createDocumentFragment();
    state.emails.forEach(email => {
        const card = document.createElement('div');
        const isActive = state.selectedEmailId === email.id;
        card.className = `email-item glass-card p-4 rounded-2xl cursor-pointer relative group transition-all duration-300 ${isActive ? 'active' : ''}`;

        const fromFull = email.headers.from ? email.headers.from[0] : 'Unknown';
        const senderName = fromFull.split('<')[0].trim().replace(/^"|"$/g, '') || 'System';
        const initial = senderName.charAt(0).toUpperCase();
        const subject = email.headers.subject ? email.headers.subject[0] : '(No Subject)';
        const dateRaw = email.headers.date ? email.headers.date[0] : '';
        const dayMonth = dateRaw.split(' ').slice(1, 3).join(' ') || 'Node';

        card.innerHTML = `
            <div class="flex items-center gap-4">
                <input type="checkbox" class="email-checkbox w-4 h-4 rounded-md border-white/10 bg-black/40 text-sky-500 focus:ring-0 transition-all cursor-pointer" 
                ${state.checkedEmailIds.has(email.id) ? 'checked' : ''} data-id="${email.id}">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-black shrink-0 transition-all duration-500 bg-gradient-to-br from-white/5 to-white/0 border border-white/5 group-hover:border-sky-500/30 group-hover:text-sky-400">
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
            ${isActive ? '<div class="absolute left-0 top-1/4 bottom-1/4 w-1 bg-sky-500 rounded-r-full shadow-[0_0_12px_rgba(14,165,233,0.5)]"></div>' : ''}
        `;

        card.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return;
            selectEmail(email.id);
        });

        const checkbox = card.querySelector('.email-checkbox');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) state.checkedEmailIds.add(email.id);
            else state.checkedEmailIds.delete(email.id);
        });

        mainFragment.appendChild(card);
    });

    if (mainEmailList) {
        mainEmailList.innerHTML = '';
        mainEmailList.appendChild(mainFragment);
    }
}

function selectEmail(id) {
    console.log('Action: selectEmail', id);

    const mList = document.getElementById('mainEmailList');
    const cArea = document.getElementById('contentArea');
    const iText = document.getElementById('instructionText');
    const eState = document.getElementById('emptyState');

    if (id === null) {
        state.selectedEmailId = null;
        if (mList) mList.classList.remove('hidden');
        if (cArea) cArea.classList.add('hidden');
        if (iText) iText.classList.remove('hidden');
        if (eState) eState.classList.remove('hidden');

        // Remove active state from all items
        document.querySelectorAll('.email-item').forEach(item => {
            item.classList.remove('active');
            const bar = item.querySelector('.absolute.left-0');
            if (bar) bar.remove();
        });

        renderEmailList();
        return;
    }

    if (state.selectedEmailId === id) return;

    // Update active state in UI
    document.querySelectorAll('.email-item').forEach(item => {
        const checkbox = item.querySelector('.email-checkbox');
        if (checkbox && checkbox.getAttribute('data-id') === String(id)) {
            item.classList.add('active');
            if (!item.querySelector('.absolute.left-0')) {
                const bar = document.createElement('div');
                bar.className = 'absolute left-0 top-1/4 bottom-1/4 w-1 bg-sky-500 rounded-r-full shadow-[0_0_12px_rgba(14,165,233,0.5)]';
                item.appendChild(bar);
            }
        } else if (checkbox && checkbox.getAttribute('data-id') === String(state.selectedEmailId)) {
            item.classList.remove('active');
            const bar = item.querySelector('.absolute.left-0');
            if (bar) bar.remove();
        }
    });

    state.selectedEmailId = id;

    if (iText) iText.classList.add('hidden');
    if (eState) eState.classList.add('hidden');

    const email = state.emails.find(e => e.id === id);
    if (email) {
        renderViewer(email);
    }
}

function renderViewer(email) {
    if (!email) {
        emptyState.classList.remove('hidden');
        if (contentArea) contentArea.classList.add('hidden');
        if (mainEmailList) mainEmailList.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    if (mainEmailList) mainEmailList.classList.add('hidden');
    if (contentArea) contentArea.classList.remove('hidden');

    // Extract meta info from raw header for display
    const raw = email.raw || '';
    const splitIndex = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
    const headerText = splitIndex !== -1 ? raw.substring(0, splitIndex) : raw;

    const regexVal = (key) => {
        const match = headerText.match(new RegExp(`^${key}:\\s*([\\s\\S]*?)(?:\\r?\\n[\\x20\\t]|\\r?\\n|$)`, 'im'));
        return match ? match[1].trim() : '';
    };

    if (metaFrom) metaFrom.textContent = regexVal('From');
    if (metaTo) metaTo.textContent = regexVal('To');
    if (metaSubject) metaSubject.textContent = regexVal('Subject');
    if (metaDate) metaDate.textContent = regexVal('Date');
    if (metaId) metaId.textContent = regexVal('Message-ID');

    // Security Status Extraction Helper
    const updateSecurityStatus = (element, key) => {
        if (!element) return;
        const statusDot = element.querySelector('.status-dot');
        const statusText = element.querySelector('.status-text');

        // Gmail "Show Original" usually shows SPF, DKIM, DMARC status
        // We look for common patterns in headers like Authentication-Results or specific result headers
        const authResults = regexVal('Authentication-Results');
        const resultMatch = authResults.match(new RegExp(`${key}=(pass|fail|softfail|none|neutral|policy|permerror|temperror)`, 'i'));
        const status = resultMatch ? resultMatch[1].toLowerCase() : 'none';

        if (status === 'pass') {
            statusDot.className = 'status-dot status-success';
            statusText.textContent = 'PASS';
            statusText.className = 'status-text text-emerald-500 font-black';
        } else if (status === 'fail') {
            statusDot.className = 'status-dot status-error';
            statusText.textContent = 'FAIL';
            statusText.className = 'status-text text-red-500 font-black';
        } else {
            statusDot.className = 'status-dot bg-slate-700';
            statusText.textContent = status.toUpperCase();
            statusText.className = 'status-text text-slate-500 font-bold';
        }
    };

    updateSecurityStatus(metaSpf, 'spf');
    updateSecurityStatus(metaDkim, 'dkim');
    updateSecurityStatus(metaDmarc, 'dmarc');

    // Display content based on mode
    headerContent.textContent = getProcessedContent(email);
    // Scroll to top of content
    headerContent.parentElement.scrollTop = 0;
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

    // If Remove Body is checked, return only the headers
    const removeBody = document.getElementById('removeBody').checked;
    if (removeBody) return processedHeader;

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
    let skippingHeader = false;

    // Headers to strictly remove (including their multi-line continuations)
    const removeHeaders = [
        'delivered-to:',
        'x-received:',
        'arc-seal:',
        'arc-message-signature:',
        'arc-authentication-results:',
        'return-path:',
        'received-spf:',
        'authentication-results:',
        'dkim-signature:',
        'x-sib-id:',
        'feedback-id:',
        'x-mailin-eid:',
        'origin-messageid:',
        'x-google-smtp-source:',
        'x-google-dkim-signature:',
        'x-gm-message-state:'
    ];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Empty line signals end of headers in some contexts, but we process raw block
        if (line.trim() === '') {
            output.push(line);
            skippingHeader = false;
            continue;
        }

        // Check if this is a continuation line (starts with space or tab)
        const isContinuation = (line.length > 0 && (line[0] === ' ' || line[0] === '\t'));

        if (isContinuation) {
            if (!skippingHeader) {
                output.push(line);
            }
            continue;
        }

        // It's a new header line
        const lowerLine = line.toLowerCase();

        // 1. Check if it should be removed entirely
        if (removeHeaders.some(h => lowerLine.startsWith(h))) {
            skippingHeader = true;
            continue;
        }

        // 2. Specialized Anonymization Logic
        skippingHeader = false; // We found a header to keep

        if (lowerLine.startsWith('from:')) {
            // Transform "Name <user@domain>" to "Name<user>"
            let fromVal = line.substring(5).trim();
            const fromMatch = fromVal.match(/^(.*?)\s*<([^@>]+)@.*?>$/);
            if (fromMatch) {
                const namePart = fromMatch[1].trim();
                const userPart = fromMatch[2].trim();
                output.push(`From: ${namePart}<${userPart}>`);
            } else {
                // Fallback for address only
                output.push(`From: ${fromVal.split('@')[0]}`);
            }
        }
        else if (lowerLine.startsWith('to:')) {
            if (replaceTo) output.push('To: [*to]');
            else output.push(line);
        }
        else if (lowerLine.startsWith('date:')) {
            if (replaceDate) output.push('Date: [DATE]');
            else output.push(line);
        }
        else if (lowerLine.startsWith('message-id:')) {
            // Embedding [EID] before @ and ensuring uppercase ID
            if (line.includes('@')) {
                output.push(line.replace('Id:', 'ID:').replace('@', `${msgIdTag}@`));
            } else {
                output.push(line.replace('Id:', 'ID:'));
            }
        }
        else if (lowerLine.startsWith('received:')) {
            if (keepReceived) {
                output.push(line);
            } else {
                skippingHeader = true;
            }
        }
        else if (lowerLine.startsWith('reply-to:')) {
            if (keepReplyTo) output.push(line);
            else skippingHeader = true;
        }
        else if (lowerLine.startsWith('cc:')) {
            hasCc = true;
            output.push(line);
        }
        else {
            // Keep all other headers (X-SIB-ID, Subject, MIME, etc.)
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
    if (!loginStatus) return;
    // Keep initial layout classes and only swap the color/text
    const baseClasses = 'h-6 text-center text-[10px] font-black uppercase tracking-widest mt-2 transition-all duration-300';
    loginStatus.className = `${baseClasses} ${colorClass}`;
    loginStatus.textContent = msg;

    // Add a small bounce on update
    loginStatus.classList.remove('scale-100');
    loginStatus.classList.add('scale-105');
    setTimeout(() => loginStatus.classList.remove('scale-105'), 200);
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

// Sidebar Toggle
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');

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
