/* ==========================================================
   Insaf AI — WhatsApp QR & AI Auto-Reply Dashboard Logic
   ========================================================== */
(function () {
    'use strict';

    var MODEL_PRESETS = {
        gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
        groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
        openrouter: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct:free'],
        anthropic: ['claude-3-5-haiku-latest', 'claude-sonnet-4-20250514']
    };

    var accessToken = null;
    var supabaseClient = null;
    var statusPollTimer = null;

    function showToast(msg, isError) {
        var el = document.getElementById('toastAlert');
        el.textContent = msg;
        el.style.borderColor = isError ? 'rgba(239,68,68,0.6)' : 'rgba(0,210,106,0.5)';
        el.style.display = 'block';
        clearTimeout(el._t);
        el._t = setTimeout(function () { el.style.display = 'none'; }, 3500);
    }

    async function apiFetch(url, opts) {
        opts = opts || {};
        opts.headers = Object.assign({}, opts.headers || {}, {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        });
        var res = await fetch(url, opts);
        var data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
        return data;
    }

    function renderModelChips(provider) {
        var wrap = document.getElementById('modelChips');
        wrap.innerHTML = '';
        (MODEL_PRESETS[provider] || []).forEach(function (m) {
            var chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'model-chip';
            chip.textContent = m;
            chip.addEventListener('click', function () {
                document.getElementById('aiModel').value = m;
            });
            wrap.appendChild(chip);
        });
    }

    function renderWaStatus(data) {
        var badge = document.getElementById('waStatusBadge');
        var qrBox = document.getElementById('waQrBox');
        var qrImg = document.getElementById('waQrImg');
        var connBox = document.getElementById('waConnectedBox');
        var errBox = document.getElementById('waErrorBox');
        var connectBtn = document.getElementById('connectWaBtn');
        var disconnectBtn = document.getElementById('disconnectWaBtn');

        var st = data.status || 'disconnected';
        badge.className = 'status-badge status-' + st;
        var labelMap = {
            disconnected: 'Disconnected',
            connecting: 'Connecting...',
            reconnecting: 'Reconnecting...',
            qr_ready: 'Scan QR Code',
            connected: 'Connected ✅'
        };
        badge.textContent = labelMap[st] || st;

        if (data.lastError) {
            errBox.textContent = data.lastError;
            errBox.style.display = 'block';
        } else {
            errBox.style.display = 'none';
        }

        if (st === 'qr_ready' && data.qrDataUrl) {
            qrImg.src = data.qrDataUrl;
            qrBox.style.display = 'block';
            connBox.style.display = 'none';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-flex';
        } else if (st === 'connected') {
            qrBox.style.display = 'none';
            connBox.style.display = 'block';
            document.getElementById('waPhoneText').textContent = data.phoneNumber ? ('+' + data.phoneNumber) : 'Connected';
            document.getElementById('waPushNameText').textContent = (data.pushName || 'WhatsApp') + ' · Active & listening for messages';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-flex';
        } else {
            qrBox.style.display = 'none';
            connBox.style.display = 'none';
            connectBtn.style.display = 'inline-flex';
            disconnectBtn.style.display = (st === 'connecting' || st === 'reconnecting') ? 'inline-flex' : 'none';
        }

        // Poll faster while QR is waiting or connecting
        if (st === 'connecting' || st === 'reconnecting' || st === 'qr_ready') {
            startStatusPoll(2500);
        } else {
            startStatusPoll(12000);
        }
    }

    function startStatusPoll(ms) {
        clearInterval(statusPollTimer);
        statusPollTimer = setInterval(refreshWaStatus, ms);
    }

    async function refreshWaStatus() {
        try {
            var st = await apiFetch('/api/whatsapp/status');
            renderWaStatus(st);
        } catch (err) {
            console.warn(err.message);
        }
    }

    async function loadAiSettings() {
        var data = await apiFetch('/api/ai/settings');
        document.getElementById('aiEnabled').checked = Boolean(data.enabled);
        document.getElementById('aiProvider').value = data.provider || 'gemini';
        document.getElementById('aiModel').value = data.model || 'gemini-2.5-flash';
        document.getElementById('aiApiKey').value = data.api_key_masked || '';
        document.getElementById('apiKeyStatusBadge').textContent = data.has_api_key ? '(Saved ✓)' : '(Not set yet)';
        document.getElementById('aiSystemPrompt').value = data.system_prompt || '';
        document.getElementById('aiKnowledge').value = data.business_knowledge || '';
        document.getElementById('aiDelay').value = data.reply_delay_ms ?? 1500;
        document.getElementById('aiMaxHistory').value = data.max_history ?? 10;
        document.getElementById('aiIgnoreGroups').checked = data.ignore_groups !== false;
        renderModelChips(data.provider || 'gemini');
    }

    async function loadProducts() {
        var res = await apiFetch('/api/products');
        var list = document.getElementById('productList');
        var products = res.products || [];
        if (products.length === 0) {
            list.innerHTML = '<div style="font-size:12.5px;opacity:0.7;">No products added yet.</div>';
            return;
        }
        list.innerHTML = '';
        products.forEach(function (p) {
            var row = document.createElement('div');
            row.className = 'product-item';
            row.innerHTML =
                '<div><strong>' + escapeHtml(p.name) + '</strong> · <span style="color:#f5a623;font-weight:700;">' + escapeHtml(p.price) + '</span>' +
                '<div style="font-size:11.5px;opacity:0.75;">' + escapeHtml(p.stock_status) + (p.description ? ' — ' + escapeHtml(p.description) : '') + '</div></div>';
            var delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn-sm btn-danger';
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', async function () {
                await apiFetch('/api/products/' + encodeURIComponent(p.id), { method: 'DELETE' });
                showToast('Product deleted');
                loadProducts();
            });
            row.appendChild(delBtn);
            list.appendChild(row);
        });
    }

    async function loadMessages() {
        var res = await apiFetch('/api/messages?limit=40');
        var feed = document.getElementById('messageFeed');
        var msgs = res.messages || [];
        if (msgs.length === 0) {
            feed.innerHTML = '<div style="opacity:0.7;font-size:13px;">No messages yet. Connect WhatsApp and send a message to test!</div>';
            return;
        }
        feed.innerHTML = '';
        msgs.forEach(function (m) {
            var item = document.createElement('div');
            item.className = 'msg-item ' + (m.direction === 'incoming' ? 'msg-incoming' : 'msg-outgoing');
            var who = m.direction === 'incoming'
                ? ('👤 ' + (m.sender_name || m.remote_jid.split('@')[0]))
                : ('🤖 Insaf AI' + (m.model_used ? ' (' + m.model_used + ')' : ''));
            var dt = new Date(m.created_at).toLocaleString();
            item.innerHTML =
                '<div class="msg-meta"><span>' + escapeHtml(who) + '</span><span>' + escapeHtml(dt) + '</span></div>' +
                '<div>' + escapeHtml(m.message_text) + '</div>';
            feed.appendChild(item);
        });
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function init() {
        try {
            var cfg = await fetch('/api/public-config').then(function (r) { return r.json(); });
            supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
            var sessRes = await supabaseClient.auth.getSession();
            var session = sessRes && sessRes.data && sessRes.data.session;
            if (!session) {
                window.location.href = 'login.html';
                return;
            }
            accessToken = session.access_token;
            document.getElementById('userEmailPill').textContent = session.user.email;

            supabaseClient.auth.onAuthStateChange(function (_ev, nextSession) {
                if (!nextSession) {
                    window.location.href = 'login.html';
                } else {
                    accessToken = nextSession.access_token;
                }
            });

            await Promise.all([refreshWaStatus(), loadAiSettings(), loadProducts(), loadMessages()]);
            setInterval(loadMessages, 8000);
        } catch (err) {
            showToast(err.message || 'Failed to initialize dashboard', true);
        }
    }

    // Event Bindings
    document.getElementById('logoutBtn').addEventListener('click', async function () {
        if (supabaseClient) await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    });

    document.getElementById('connectWaBtn').addEventListener('click', async function () {
        try {
            showToast('Starting WhatsApp session & generating QR...');
            var st = await apiFetch('/api/whatsapp/connect', { method: 'POST', body: JSON.stringify({ resetAuth: false }) });
            renderWaStatus(st);
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('resetQrBtn').addEventListener('click', async function () {
        try {
            showToast('Resetting auth & generating fresh QR...');
            var st = await apiFetch('/api/whatsapp/connect', { method: 'POST', body: JSON.stringify({ resetAuth: true }) });
            renderWaStatus(st);
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('disconnectWaBtn').addEventListener('click', async function () {
        try {
            var st = await apiFetch('/api/whatsapp/disconnect', { method: 'POST', body: '{}' });
            renderWaStatus(st);
            showToast('WhatsApp disconnected');
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('aiProvider').addEventListener('change', function (e) {
        var prov = e.target.value;
        renderModelChips(prov);
        var presets = MODEL_PRESETS[prov];
        if (presets && presets[0]) document.getElementById('aiModel').value = presets[0];
    });

    document.getElementById('aiSettingsForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            var payload = {
                enabled: document.getElementById('aiEnabled').checked,
                provider: document.getElementById('aiProvider').value,
                model: document.getElementById('aiModel').value.trim(),
                api_key: document.getElementById('aiApiKey').value.trim(),
                system_prompt: document.getElementById('aiSystemPrompt').value,
                business_knowledge: document.getElementById('aiKnowledge').value,
                reply_delay_ms: Number(document.getElementById('aiDelay').value) || 1500,
                max_history: Number(document.getElementById('aiMaxHistory').value) || 10,
                ignore_groups: document.getElementById('aiIgnoreGroups').checked
            };
            var saved = await apiFetch('/api/ai/settings', { method: 'PUT', body: JSON.stringify(payload) });
            document.getElementById('aiApiKey').value = saved.api_key_masked || '';
            document.getElementById('apiKeyStatusBadge').textContent = saved.has_api_key ? '(Saved ✓)' : '(Not set yet)';
            showToast('AI Settings saved!');
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('productForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            await apiFetch('/api/products', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('prodName').value.trim(),
                    price: document.getElementById('prodPrice').value.trim(),
                    stock_status: document.getElementById('prodStock').value,
                    description: document.getElementById('prodDesc').value.trim()
                })
            });
            document.getElementById('productForm').reset();
            showToast('Product added to AI catalog!');
            loadProducts();
        } catch (err) { showToast(err.message, true); }
    });

    document.getElementById('runTestBtn').addEventListener('click', async function () {
        var input = document.getElementById('testMsgInput');
        var box = document.getElementById('testReplyBox');
        var msg = input.value.trim();
        if (!msg) return;
        box.style.display = 'block';
        box.textContent = 'Generating AI reply...';
        try {
            var res = await apiFetch('/api/ai/test', { method: 'POST', body: JSON.stringify({ message: msg }) });
            box.textContent = '🤖 (' + res.provider + ' / ' + res.model + '):\n\n' + res.reply;
        } catch (err) {
            box.textContent = 'Error: ' + err.message;
        }
    });

    document.getElementById('refreshLogsBtn').addEventListener('click', loadMessages);

    init();
})();
