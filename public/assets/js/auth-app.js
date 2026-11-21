/* ==========================================================
   Sales Reply AI — Live Supabase Auth & Blog Filter Client
   ========================================================== */
(function () {
    'use strict';

    var supabaseClient = null;
    var initPromise = null;

    function getBasePrefix() {
        return window.location.pathname.indexOf('/blog/') !== -1 ? '../' : '';
    }

    async function getSupabase() {
        if (supabaseClient) return supabaseClient;
        if (!initPromise) {
            initPromise = fetch('/api/public-config')
                .then(function (r) { return r.json(); })
                .then(function (cfg) {
                    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
                        throw new Error('Supabase client config unavailable');
                    }
                    supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
                    return supabaseClient;
                });
        }
        return initPromise;
    }

    function showBanner(form, message, type) {
        var existing = form.parentNode.querySelector('.clone-form-banner');
        if (existing) existing.remove();
        var box = document.createElement('div');
        box.className = 'clone-form-banner';
        var isSuccess = type === 'success';
        var isError = type === 'error';
        box.style.cssText = [
            'margin-bottom:16px',
            'padding:12px 14px',
            'border-radius:10px',
            'font-size:13px',
            'line-height:1.55',
            'font-weight:500',
            isSuccess
                ? 'background:rgba(0,210,106,0.12);border:1px solid rgba(0,210,106,0.35);color:#10b981;'
                : isError
                ? 'background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);color:#f87171;'
                : 'background:rgba(245,166,35,0.12);border:1px solid rgba(245,166,35,0.35);color:#f5a623;'
        ].join(';');
        box.textContent = message;
        form.parentNode.insertBefore(box, form);
    }

    // Update header buttons if user is already logged in
    getSupabase().then(function (sb) {
        return sb.auth.getSession();
    }).then(function (res) {
        var session = res && res.data && res.data.session;
        if (!session) return;
        var prefix = getBasePrefix();
        // If on login or register page, go directly to dashboard
        var path = window.location.pathname;
        if (path.endsWith('/login') || path.endsWith('/login.html') || path.endsWith('/register') || path.endsWith('/register.html')) {
            window.location.href = prefix + 'dashboard.html';
            return;
        }
        document.querySelectorAll('a[href$="login.html"]').forEach(function (a) {
            if (a.closest('.nav-btns') || a.closest('.mobile-menu') || a.closest('.hero')) {
                a.href = prefix + 'dashboard.html';
                a.textContent = 'Dashboard';
            }
        });
        document.querySelectorAll('a[href$="register.html"]').forEach(function (a) {
            if (a.closest('.nav-btns') || a.closest('.mobile-menu')) {
                a.href = prefix + 'dashboard.html';
                a.textContent = 'WhatsApp Bot →';
            }
        });
    }).catch(function () {});

    // Handle Auth Forms (/login, /register, /forgot-password)
    document.querySelectorAll('form[data-clone-action]').forEach(function (form) {
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            var route = form.getAttribute('data-clone-action') || '';
            var emailEl = form.querySelector('input[name="email"]');
            var passEl = form.querySelector('input[name="password"]');
            var confirmEl = form.querySelector('input[name="password_confirmation"]');
            var userEl = form.querySelector('input[name="username"]');
            var submitBtn = form.querySelector('button[type="submit"]');

            var email = emailEl ? emailEl.value.trim() : '';
            var password = passEl ? passEl.value : '';
            var username = userEl ? userEl.value.trim() : '';

            if (userEl && username.length < 2) {
                showBanner(form, 'Please enter a valid username (at least 2 characters).', 'error');
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showBanner(form, 'Please enter a valid email address.', 'error');
                return;
            }
            if (passEl && password.length < 6) {
                showBanner(form, 'Password must be at least 6 characters.', 'error');
                return;
            }
            if (confirmEl && password !== confirmEl.value) {
                showBanner(form, 'Passwords do not match. Please verify both fields.', 'error');
                return;
            }

            var origBtnText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Please wait...';
            }

            try {
                var sb = await getSupabase();
                if (route.indexOf('/register') !== -1) {
                    var signUpRes = await sb.auth.signUp({
                        email: email,
                        password: password,
                        options: { data: { username: username } }
                    });
                    if (signUpRes.error) throw signUpRes.error;
                    if (signUpRes.data && signUpRes.data.session) {
                        showBanner(form, 'Account created! Redirecting to WhatsApp AI Dashboard...', 'success');
                        setTimeout(function () { window.location.href = 'dashboard.html'; }, 700);
                    } else {
                        showBanner(form, 'Account created! Please sign in with your email and password.', 'success');
                        setTimeout(function () { window.location.href = 'login.html'; }, 1200);
                    }
                } else if (route.indexOf('/forgot-password') !== -1) {
                    var resetRes = await sb.auth.resetPasswordForEmail(email, {
                        redirectTo: window.location.origin + '/login.html'
                    });
                    if (resetRes.error) throw resetRes.error;
                    showBanner(form, 'Password reset email requested for ' + email + '. Check your inbox (if SMTP is configured in Supabase).', 'success');
                } else {
                    var signInRes = await sb.auth.signInWithPassword({ email: email, password: password });
                    if (signInRes.error) throw signInRes.error;
                    showBanner(form, 'Login successful! Opening Dashboard...', 'success');
                    setTimeout(function () { window.location.href = 'dashboard.html'; }, 500);
                }
            } catch (err) {
                showBanner(form, err.message || 'Authentication failed. Please try again.', 'error');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = origBtnText;
                }
            }
        });
    });

    // Google OAuth notice if not configured in Supabase
    document.querySelectorAll('a[data-clone-oauth]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var form = document.querySelector('form[data-clone-action]');
            if (form) {
                showBanner(form, 'Email/Password login is active right now. To enable Google Sign-In, add Google OAuth credentials inside Supabase -> Authentication -> Providers.', 'info');
            }
        });
    });

    // Blog search & tag filtering
    var blogGrid = document.querySelector('.blog-grid');
    if (blogGrid) {
        var cards = Array.prototype.slice.call(blogGrid.querySelectorAll('.blog-card'));
        var searchForm = document.querySelector('form.search-box-wrap');
        var searchInput = searchForm ? searchForm.querySelector('input') : null;
        var heroInner = searchForm ? searchForm.parentNode : null;

        function applyBlogFilter(query, tag) {
            query = (query || '').trim().toLowerCase();
            tag = (tag || '').trim().toLowerCase();
            var shown = 0;

            cards.forEach(function (card) {
                var text = (card.textContent || '').toLowerCase();
                var tags = (card.getAttribute('data-tags') || '').toLowerCase();
                var matchQ = !query || text.indexOf(query) !== -1 || tags.indexOf(query) !== -1;
                var matchT = !tag || tags.split('|').some(function (t) { return t.trim() === tag; });
                var visible = matchQ && matchT;
                card.style.display = visible ? '' : 'none';
                if (visible) shown++;
            });

            var oldStatus = document.getElementById('cloneFilterStatus');
            if (oldStatus) oldStatus.remove();

            if (query || tag) {
                var status = document.createElement('div');
                status.id = 'cloneFilterStatus';
                status.className = 'filter-status';
                var label = tag ? ('Tag: ' + tag) : ('Search: "' + query + '"');
                status.innerHTML = '<span class="active-filter-badge">' + label + ' (' + shown + ') <a href="blog.html" id="clearBlogFilter">✕ Clear</a></span>';
                if (heroInner) heroInner.appendChild(status);
                var clearBtn = document.getElementById('clearBlogFilter');
                if (clearBtn) {
                    clearBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        if (searchInput) searchInput.value = '';
                        if (window.history && window.history.replaceState) {
                            window.history.replaceState({}, '', 'blog.html');
                        }
                        applyBlogFilter('', '');
                    });
                }
            }
        }

        var params = new URLSearchParams(window.location.search);
        var initialTag = params.get('tag') || '';
        var initialQ = params.get('q') || params.get('search') || '';
        if (searchInput && initialQ) searchInput.value = initialQ;
        if (initialTag || initialQ) applyBlogFilter(initialQ, initialTag);

        if (searchForm) {
            searchForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var q = searchInput ? searchInput.value : '';
                if (window.history && window.history.replaceState) {
                    var nextUrl = q.trim() ? ('blog.html?q=' + encodeURIComponent(q.trim())) : 'blog.html';
                    window.history.replaceState({}, '', nextUrl);
                }
                applyBlogFilter(q, '');
            });
        }
    }
})();
