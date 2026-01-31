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

// Modal Elements
const viewModal = document.getElementById('viewModal');
const viewContent = document.getElementById('viewContent');
const closeViewBtn = document.getElementById('closeViewBtn');
const copyViewBtn = document.getElementById('copyViewBtn');
const downloadViewBtn = document.getElementById('downloadViewBtn');

const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const boxSelect = document.getElementById('boxSelect');
const rangeStart = document.getElementById('rangeStart');
const rangeEnd = document.getElementById('rangeEnd');
const applyRangeBtn = document.getElementById('applyRangeBtn');

// API Configuration
const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

const anonCheck = document.getElementById('anonCheck');
const modeBtns = document.querySelectorAll('button.px-3'); // Rough selector or use IDs if I added them?
// Let's assume user uses the Checkbox for "Anonymize" and Buttons for view mode?
// Actually the buttons in HTML didn't have IDs. 
// "Raw" button and "Cleaned" button.
// But we have a checkbox "Anonymize" next to it.
// Let's bind everything.
// Better: Add IDs to buttons in HTML or just use the checkbox as primary for now since it has ID.

// Event Listeners
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);
refreshBtn.addEventListener('click', () => fetchEmails());
copyBtn.addEventListener('click', copyToClipboard);
downloadBtn.addEventListener('click', downloadOriginals);
viewBtn.addEventListener('click', openViewModal);

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
        showStatus('Network error. Is backend running?', 'text-red-400');
        console.error(err);
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

            // Recursive helper to render options
            const processBoxes = (boxes, prefix = '') => {
                for (const key in boxes) {
                    const box = boxes[key];
                    // Construct value based on delimiter if needed, or just use name hierarchy?
                    // imap-simple returns object structure.
                    // The key is the name part.
                    const val = prefix ? `${prefix}${box.delimiter}${key}` : key;
                    const display = prefix ? `${prefix}/${key}` : key;

                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = display;
                    if (val === 'INBOX') opt.selected = true;
                    boxSelect.appendChild(opt);

                    if (box.children) {
                        processBoxes(box.children, val);
                    }
                }
            };
            processBoxes(data.boxes);
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
    emailList.innerHTML = '';

    if (state.emails.length === 0) {
        emailList.innerHTML = '<div class="text-center p-4 text-gray-500">No emails found</div>';
        return;
    }

    state.emails.forEach(email => {
        const headers = email.headers || {};
        const getVal = (key) => {
            if (headers[key.toLowerCase()]) return headers[key.toLowerCase()][0];
            return '';
        };

        const subject = getVal('subject') || '(No Subject)';
        const from = getVal('from') || '(Unknown)';
        const dateStr = getVal('date');
        const date = dateStr ? new Date(dateStr).toLocaleDateString() : '';

        const el = document.createElement('div');
        el.className = `cursor-pointer p-3 rounded-lg border border-transparent transition hover:bg-white/10 ${state.selectedEmailId === email.id ? 'bg-white/10 border-pink-500/30' : ''}`;

        // Flex container for checkbox + content
        const isChecked = state.checkedEmailIds.has(email.id);

        el.innerHTML = `
            <div class="flex gap-3 items-start">
                <input type="checkbox" class="mt-1 w-4 h-4 rounded bg-gray-700 border-gray-500 text-pink-500 focus:ring-pink-500/50" 
                    ${isChecked ? 'checked' : ''} data-id="${email.id}">
                <div class="flex-grow min-w-0">
                    <div class="flex justify-between items-start mb-1">
                        <span class="font-medium text-white text-sm truncate w-2/3">${subject}</span>
                        <span class="text-xs text-gray-500">${date}</span>
                    </div>
                    <div class="text-xs text-gray-400 truncate">${from}</div>
                </div>
            </div>
        `;

        // Click wrapper: navigate to email
        el.addEventListener('click', (e) => {
            if (e.target.type === 'checkbox') return; // Don't select if clicking checkbox
            selectEmail(email.id);
        });

        // Checkbox listener
        const checkbox = el.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) state.checkedEmailIds.add(email.id);
            else state.checkedEmailIds.delete(email.id);
        });

        emailList.appendChild(el);
    });
}

function selectEmail(id) {
    state.selectedEmailId = id;
    renderEmailList(); // Re-render to update active state styling

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
        const match = headerText.match(new RegExp(`^${key}:\\s*(.*)$`, 'im'));
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

        // --- Removal Logic ---
        if (lowerLine.startsWith('arc-') ||
            lowerLine.startsWith('dkim-') ||
            lowerLine.startsWith('spf-') ||
            lowerLine.startsWith('authentication-results') ||
            lowerLine.startsWith('delivered-to') ||
            lowerLine.startsWith('return-path') ||
            lowerLine.startsWith('x-')) {
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
        else if (lowerLine.startsWith('message-id:')) {
            // "Just add the tag before @ please"
            if (line.includes('@')) {
                output.push(line.replace('@', `${msgIdTag}@`));
            } else {
                output.push(line);
            }
        }
        else if (lowerLine.startsWith('from:')) {
            // Domain processing
            // Regex to find "user@domain.com"
            const domainRegex = /@([\w.-]+)/;
            if (domainVal) {
                // Replace domain
                output.push(line.replace(domainRegex, `@${domainVal}`));
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
    if (state.emails.length === 0) {
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
    a.download = `emails_${state.currentBox}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast('All originals saved to file');
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
    loginStatus.className = `h-6 text-center text-sm font-medium ${colorClass}`;
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
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            showToast('Headers copied to clipboard');
        });
    }
}
