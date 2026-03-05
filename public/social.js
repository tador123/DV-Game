// ============================================================
// 🧛 DARK SURVIVORS — Social / Clan System
// Account login, clans, invites, rankings
// ============================================================

class Social {
    constructor() {
        this.token = localStorage.getItem('ds_token') || null;
        this.user = null;
        this.clan = null;
        this._notifPollTimer = null;
        this._notifQueue = [];
        this._notifShowing = 0;
        this._notifMuted = localStorage.getItem('ds_mute_notif') === '1';

        this.bindAuthTabs();
        this.bindLoginEvents();
        this.bindRegisterEvents();
        this.bindResetEvents();
        this.bindLobbyEvents();

        // Lock orientation to portrait on login/register (PWA / supported browsers)
        this._lockPortrait();

        // Auto-login if we have a token
        if (this.token) {
            this.tryAutoLogin();
        }
    }

    // ========================================================
    // ORIENTATION LOCK HELPERS
    // ========================================================
    _lockPortrait() {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('portrait').catch(() => {});
        }
    }
    _unlockOrientation() {
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }

    // Country code → flag emoji (lightweight, no external images)
    _flag(code) {
        if (!code || code.length !== 2) return '';
        return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
    }

    // ========================================================
    // API HELPERS
    // ========================================================
    async api(method, url, body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }

    toast(msg, duration = 2500) {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
    }

    // ========================================================
    // AUTH TAB SWITCHING
    // ========================================================
    bindAuthTabs() {
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                // Switch active tab
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                // Switch active panel
                document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
                const target = tab.dataset.tab; // login | register | reset
                document.getElementById('auth-' + target).classList.add('active');
                // Clear errors
                document.querySelectorAll('.auth-error').forEach(e => e.textContent = '');
            });
        });
    }

    // ========================================================
    // LOGIN
    // ========================================================
    bindLoginEvents() {
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('login-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.login();
        });
    }

    async login() {
        const username = document.getElementById('login-name').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');

        if (!username || username.length < 2) {
            errEl.textContent = 'Username must be at least 2 characters';
            return;
        }
        if (!password) {
            errEl.textContent = 'Enter your password';
            return;
        }

        errEl.textContent = '';

        try {
            const data = await this.api('POST', '/api/login', { username, password });
            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('ds_token', this.token);

            document.getElementById('login-screen').classList.remove('active');
            document.body.classList.remove('auth-active');
            this._unlockOrientation();
            this.showLobby();
        } catch (e) {
            errEl.textContent = e.message;
        }
    }

    // ========================================================
    // REGISTER
    // ========================================================
    bindRegisterEvents() {
        document.getElementById('register-btn').addEventListener('click', () => this.register());
        document.getElementById('reg-security-a').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.register();
        });
    }

    async register() {
        const username = document.getElementById('reg-name').value.trim();
        const password = document.getElementById('reg-password').value;
        const password2 = document.getElementById('reg-password2').value;
        const securityQuestion = document.getElementById('reg-security-q').value;
        const securityAnswer = document.getElementById('reg-security-a').value.trim();
        const country = document.getElementById('reg-country').value;
        const errEl = document.getElementById('register-error');

        if (!username || username.length < 2) {
            errEl.textContent = 'Username must be at least 2 characters';
            return;
        }
        if (!password || password.length < 4) {
            errEl.textContent = 'Password must be at least 4 characters';
            return;
        }
        if (password !== password2) {
            errEl.textContent = 'Passwords do not match';
            return;
        }
        if (!securityQuestion) {
            errEl.textContent = 'Please select a security question';
            return;
        }
        if (!securityAnswer) {
            errEl.textContent = 'Please enter a security answer';
            return;
        }

        errEl.textContent = '';

        try {
            const data = await this.api('POST', '/api/register', { username, password, securityQuestion, securityAnswer, country: country || null });
            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('ds_token', this.token);

            this.toast('Account created! Welcome, ' + this.user.name);
            document.getElementById('login-screen').classList.remove('active');
            document.body.classList.remove('auth-active');
            this._unlockOrientation();
            this.showLobby();
        } catch (e) {
            errEl.textContent = e.message;
        }
    }

    // ========================================================
    // RESET PASSWORD
    // ========================================================
    bindResetEvents() {
        document.getElementById('reset-question-btn').addEventListener('click', () => this.getSecurityQuestion());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetPassword());
    }

    async getSecurityQuestion() {
        const username = document.getElementById('reset-name').value.trim();
        const errEl = document.getElementById('reset-error');

        if (!username) {
            errEl.textContent = 'Enter your username';
            return;
        }

        errEl.textContent = '';

        try {
            const data = await this.api('POST', '/api/reset/question', { username });
            // Show the question and reveal answer/password fields
            const qDisplay = document.getElementById('reset-question-display');
            qDisplay.textContent = '🔒 ' + this.getQuestionText(data.securityQuestion);
            qDisplay.classList.remove('hidden');
            document.getElementById('reset-answer').classList.remove('hidden');
            document.getElementById('reset-new-pw').classList.remove('hidden');
            document.getElementById('reset-btn').classList.remove('hidden');
        } catch (e) {
            errEl.textContent = e.message;
        }
    }

    getQuestionText(key) {
        const questions = {
            'pet': "What was your first pet's name?",
            'city': 'What city were you born in?',
            'school': 'What was the name of your first school?',
            'food': 'What is your favourite food?',
            'game': 'What is your favourite game?',
        };
        return questions[key] || key;
    }

    async resetPassword() {
        const username = document.getElementById('reset-name').value.trim();
        const securityAnswer = document.getElementById('reset-answer').value.trim();
        const newPassword = document.getElementById('reset-new-pw').value;
        const errEl = document.getElementById('reset-error');

        if (!securityAnswer) {
            errEl.textContent = 'Enter your security answer';
            return;
        }
        if (!newPassword || newPassword.length < 4) {
            errEl.textContent = 'New password must be at least 4 characters';
            return;
        }

        errEl.textContent = '';

        try {
            await this.api('POST', '/api/reset/password', { username, securityAnswer, newPassword });
            errEl.style.color = '#44cc44';
            errEl.textContent = '✓ Password reset! You can now login.';
            // After 2s switch to login tab
            setTimeout(() => {
                errEl.style.color = '';
                errEl.textContent = '';
                document.querySelector('.auth-tab[data-tab="login"]').click();
                document.getElementById('login-name').value = username;
            }, 2000);
        } catch (e) {
            errEl.textContent = e.message;
        }
    }

    // ========================================================
    // AUTO-LOGIN (token in localStorage)
    // ========================================================
    async tryAutoLogin() {
        try {
            const data = await this.api('GET', `/api/user/${this.token}`);
            this.user = data.user;
            document.getElementById('login-screen').classList.remove('active');
            document.body.classList.remove('auth-active');
            this._unlockOrientation();
            this.showLobby();
        } catch (e) {
            // Token expired or invalid
            this.token = null;
            localStorage.removeItem('ds_token');
        }
    }

    // ========================================================
    // LOGOUT
    // ========================================================
    logout() {
        this._stopNotifPolling();
        this.token = null;
        localStorage.removeItem('ds_token');
        this.user = null;
        this.clan = null;
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        document.body.classList.add('auth-active');
        this._lockPortrait();
        // Clear login fields
        document.getElementById('login-name').value = '';
        document.getElementById('login-password').value = '';
        // Reset to login tab
        document.querySelector('.auth-tab[data-tab="login"]').click();
    }

    // ========================================================
    // LOBBY
    // ========================================================
    bindLobbyEvents() {
        document.getElementById('play-btn').addEventListener('click', () => this.startGame());
        document.getElementById('clan-btn').addEventListener('click', () => this.showClanScreen());
        document.getElementById('leaderboard-btn').addEventListener('click', () => this.showLeaderboard());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('restart-btn').addEventListener('click', () => this.startGame());
        document.getElementById('back-lobby-btn').addEventListener('click', () => this.backToLobby());

        // Exit game button
        document.getElementById('exit-btn').addEventListener('click', () => this.exitGame());

        // Leaderboard tabs
        document.querySelectorAll('#leaderboard-panel .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#leaderboard-panel .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                document.getElementById('lb-players-content').classList.toggle('hidden', tab !== 'players');
                document.getElementById('lb-clans-content').classList.toggle('hidden', tab !== 'clans');
            });
        });
    }

    showLobby() {
        const lobby = document.getElementById('lobby-screen');
        lobby.classList.add('active');

        document.getElementById('lobby-player-name').textContent = this.user.name;

        // Stats
        const statsEl = document.getElementById('lobby-stats');
        statsEl.innerHTML = `
            <div class="stat-card"><div class="stat-val">${this.user.bestScore}</div><div class="stat-label">Best Score</div></div>
            <div class="stat-card"><div class="stat-val">${this.user.totalGamesPlayed}</div><div class="stat-label">Games Played</div></div>
            <div class="stat-card"><div class="stat-val">${this.user.totalKills}</div><div class="stat-label">Total Kills</div></div>
            <div class="stat-card"><div class="stat-val">${this.user.bestLevel}</div><div class="stat-label">Best Level</div></div>
        `;

        // Clan badge
        this.refreshClanBadge();

        // Load pending clan invites
        this.loadPendingInvites();

        // Start notification polling (every 15s, lightweight)
        this._startNotifPolling();
    }

    async refreshClanBadge() {
        const badgeEl = document.getElementById('lobby-clan-badge');
        if (this.user.clanId) {
            try {
                const data = await this.api('GET', `/api/clan/${this.user.clanId}`);
                this.clan = data.clan;
                badgeEl.innerHTML = `<span class="tag">[${this.clan.tag}]</span> <span class="cname">${this.clan.name}</span>`;
                badgeEl.classList.remove('hidden');
                badgeEl.classList.add('clan-badge');
            } catch (e) {
                badgeEl.classList.add('hidden');
            }
        } else {
            badgeEl.classList.add('hidden');
            this.clan = null;
        }
    }

    startGame() {
        this._stopNotifPolling();
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('gameover-screen').classList.remove('active');
        // Game will be started via game.js integration
        if (typeof game !== 'undefined') {
            game.startGame();
        }
    }

    backToLobby() {
        document.getElementById('gameover-screen').classList.remove('active');
        document.getElementById('pause-screen')?.classList.remove('active');
        this.refreshUserData();
        this.showLobby();
    }

    async refreshUserData() {
        try {
            const data = await this.api('GET', `/api/user/${this.token}`);
            this.user = data.user;
        } catch (e) {}
    }

    exitGame() {
        // Clear session
        this.token = null;
        localStorage.removeItem('ds_token');
        this.user = null;
        this.clan = null;

        // For PWA standalone mode, window.close() works
        if (window.navigator.standalone === true ||
            window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches) {
            window.close();
        }

        // Navigate away — actually leaves the page
        window.location.replace('about:blank');
    }

    // ========================================================
    // SCORE SUBMISSION
    // ========================================================
    async submitScore(time, kills, level) {
        if (!this.token) return null;
        try {
            const data = await this.api('POST', '/api/score', { token: this.token, time, kills, level });
            this.user = data.user;
            return data;
        } catch (e) {
            console.error('Score submit failed:', e);
            return null;
        }
    }

    // ========================================================
    // CLAN SCREEN
    // ========================================================
    async showClanScreen() {
        const screen = document.getElementById('clan-screen');
        const panel = document.getElementById('clan-panel');
        document.getElementById('lobby-screen').classList.remove('active');
        screen.classList.add('active');

        // Refresh user data
        await this.refreshUserData();

        if (this.user.clanId) {
            await this.showClanDetails(panel);
        } else {
            this.showClanJoinCreate(panel);
        }
    }

    showClanJoinCreate(panel) {
        panel.innerHTML = `
            <h2>⚔ Clans</h2>
            <p>Join or create a clan to compete together!</p>

            <h3>📩 Join with Invite Code</h3>
            <div style="display:flex;gap:8px;margin-bottom:20px;">
                <input type="text" id="join-code-input" class="input" placeholder="Enter 6-digit code..." maxlength="6" style="text-transform:uppercase;text-align:center;letter-spacing:3px;">
                <button class="btn btn-green btn-sm" id="join-clan-btn">Join</button>
            </div>

            <div style="text-align:center;color:#555;margin: 12px 0;">— or —</div>

            <h3>🏰 Create a New Clan</h3>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <input type="text" id="create-clan-name" class="input" placeholder="Clan Name (e.g. Shadow Knights)" maxlength="30">
                <input type="text" id="create-clan-tag" class="input" placeholder="Tag (2-5 chars, e.g. SK)" maxlength="5" style="text-transform:uppercase;text-align:center;letter-spacing:2px;">
                <button class="btn btn-gold" id="create-clan-btn" style="width:100%">🏰 Create Clan</button>
            </div>

            <div style="text-align:center;margin-top:20px;">
                <button class="btn btn-outline btn-sm" id="close-clan-btn">✕ Close</button>
            </div>
        `;

        document.getElementById('join-clan-btn').addEventListener('click', () => this.joinClan());
        document.getElementById('create-clan-btn').addEventListener('click', () => this.createClan());
        document.getElementById('close-clan-btn').addEventListener('click', () => this.closeClanScreen());
    }

    async showClanDetails(panel) {
        try {
            const data = await this.api('GET', `/api/clan/${this.user.clanId}/members`);
            this.clan = data.clan;
            const members = data.members;

            const myMember = members.find(m => m.id === this.token);
            const myRole = myMember ? myMember.role : 'member';
            const isAdmin = myRole === 'admin';

            panel.innerHTML = `
                <h2>[${this.clan.tag}] ${this.clan.name}</h2>
                <p>Leader: ${this.clan.leaderName} • ${this.clan.memberCount} members</p>

                <div class="clan-stat-row">
                    <div class="clan-stat-card">
                        <div class="stat-val gold">${this.clan.totalScore.toLocaleString()}</div>
                        <div class="stat-label">Clan Score</div>
                    </div>
                    <div class="clan-stat-card">
                        <div class="stat-val red">${this.clan.totalKills.toLocaleString()}</div>
                        <div class="stat-label">Total Kills</div>
                    </div>
                </div>

                <h3>📩 Invite Code</h3>
                <div class="invite-code-box">
                    <span class="invite-code" id="invite-code-display">${this.clan.inviteCode}</span>
                    <button class="btn btn-outline btn-sm" id="copy-invite-btn">📋 Copy</button>
                </div>

                <h3>👥 Members (Rank by Score)</h3>
                <div id="members-list">
                    ${members.map((m, idx) => {
                        const roleBadge = m.role === 'admin' ? '<span class="role-badge role-admin">Admin</span>'
                            : m.role === 'manager' ? '<span class="role-badge role-manager">Manager</span>' : '';
                        const isMe = m.id === this.token;
                        // Admin can promote/demote others (not themselves)
                        let actions = '';
                        if (isAdmin && !isMe && m.role !== 'admin') {
                            if (m.role === 'member') {
                                actions = `<button class="role-action-btn" data-action="promote" data-id="${m.id}">⬆ Manager</button>`;
                            } else if (m.role === 'manager') {
                                actions = `<button class="role-action-btn" data-action="demote" data-id="${m.id}">⬇ Member</button>`;
                            }
                        }
                        return `
                        <div class="member-row" data-midx="${idx}">
                            <span class="member-rank">${m.rank <= 3 ? ['🥇','🥈','🥉'][m.rank-1] : '#'+m.rank}</span>
                            <span class="member-name">${m.name}${roleBadge}${isMe ? ' <span style="color:#555;font-size:11px">(You)</span>' : ''}</span>
                            ${actions}
                            <span class="member-score">${m.bestScore.toLocaleString()}</span>
                        </div>`;
                    }).join('')}
                </div>

                <div style="display:flex;gap:8px;justify-content:center;margin-top:20px;flex-wrap:wrap;align-items:center;">
                    <label class="mute-toggle" style="margin:0;">
                        <input type="checkbox" id="clan-mute-notif-cb" ${!this._notifMuted ? 'checked' : ''}>
                        <span class="mute-switch"></span>
                        <span class="mute-label">🔔 Notifications</span>
                    </label>
                    <button class="btn btn-outline btn-sm" id="leave-clan-btn" style="color:#ff4444;border-color:rgba(255,68,68,0.3);">Leave Clan</button>
                    <button class="btn btn-outline btn-sm" id="close-clan-btn">✕ Close</button>
                </div>
            `;

            // Mute toggle binding
            const muteBox = document.getElementById('clan-mute-notif-cb');
            if (muteBox) {
                muteBox.addEventListener('change', () => {
                    this._notifMuted = !muteBox.checked;
                    localStorage.setItem('ds_mute_notif', this._notifMuted ? '1' : '0');
                    this.toast(this._notifMuted ? 'Clan notifications muted' : 'Clan notifications enabled');
                });
            }

            document.getElementById('copy-invite-btn').addEventListener('click', () => {
                const code = this.clan.inviteCode;
                navigator.clipboard?.writeText(code).then(() => {
                    this.toast('Invite code copied! Share: ' + code);
                }).catch(() => {
                    this.toast('Invite code: ' + code);
                });
            });
            document.getElementById('leave-clan-btn').addEventListener('click', () => this.leaveClan());
            document.getElementById('close-clan-btn').addEventListener('click', () => this.closeClanScreen());

            // Bind role action buttons
            panel.querySelectorAll('.role-action-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const targetId = btn.dataset.id;
                    const action = btn.dataset.action;
                    const newRole = action === 'promote' ? 'manager' : 'member';
                    try {
                        await this.api('POST', '/api/clan/set-role', { token: this.token, targetId, role: newRole });
                        this.toast(action === 'promote' ? 'Promoted to Manager!' : 'Demoted to Member');
                        await this.showClanDetails(panel);
                    } catch (e) { this.toast(e.message); }
                });
            });

            // Bind member row clicks → show player detail
            panel.querySelectorAll('.member-row').forEach(el => {
                el.addEventListener('click', (e) => {
                    // Don't trigger if they clicked a role action button
                    if (e.target.closest('.role-action-btn')) return;
                    const idx = parseInt(el.dataset.midx);
                    if (!isNaN(idx)) {
                        const m = members[idx];
                        // Pass member data formatted for showPlayerDetail
                        this.showPlayerDetail({
                            name: m.name,
                            country: null,
                            clanTag: this.clan ? this.clan.tag : null,
                            bestScore: m.bestScore,
                            totalGamesPlayed: m.totalGamesPlayed,
                            totalKills: m.totalKills,
                            bestLevel: m.bestLevel
                        });
                    }
                });
            });
        } catch (e) {
            panel.innerHTML = `<p style="color:#ff4444">${e.message}</p><button class="btn btn-outline btn-sm" onclick="social.closeClanScreen()">Close</button>`;
        }
    }

    async createClan() {
        const clanName = document.getElementById('create-clan-name').value;
        const clanTag = document.getElementById('create-clan-tag').value;

        try {
            const data = await this.api('POST', '/api/clan/create', { token: this.token, clanName, clanTag });
            this.clan = data.clan;
            this.user.clanId = data.clan.id;
            this.toast(`Clan [${data.clan.tag}] ${data.clan.name} created!`);
            this.refreshClanBadge();
            await this.showClanDetails(document.getElementById('clan-panel'));
        } catch (e) {
            this.toast(e.message);
        }
    }

    async joinClan() {
        const code = document.getElementById('join-code-input').value.trim();
        if (!code) return this.toast('Enter an invite code');

        try {
            const data = await this.api('POST', '/api/clan/join', { token: this.token, inviteCode: code });
            this.clan = data.clan;
            this.user.clanId = data.clan.id;
            this.toast(`Joined [${data.clan.tag}] ${data.clan.name}!`);
            this.refreshClanBadge();
            await this.showClanDetails(document.getElementById('clan-panel'));
        } catch (e) {
            this.toast(e.message);
        }
    }

    async leaveClan() {
        if (!confirm('Are you sure you want to leave your clan?')) return;
        try {
            await this.api('POST', '/api/clan/leave', { token: this.token });
            this.user.clanId = null;
            this.clan = null;
            this.toast('You left the clan');
            this.refreshClanBadge();
            this.showClanJoinCreate(document.getElementById('clan-panel'));
        } catch (e) {
            this.toast(e.message);
        }
    }

    closeClanScreen() {
        document.getElementById('clan-screen').classList.remove('active');
        document.getElementById('lobby-screen').classList.add('active');
    }

    // ========================================================
    // LEADERBOARD
    // ========================================================
    async showLeaderboard() {
        const screen = document.getElementById('leaderboard-screen');
        document.getElementById('lobby-screen').classList.remove('active');
        screen.classList.add('active');

        // Determine if current user is a clan admin/manager (can invite)
        let canInvite = false;
        let myClanId = null;
        if (this.user.clanId && this.clan) {
            myClanId = this.user.clanId;
            // We need to check our role — fetch members to confirm
            try {
                const mData = await this.api('GET', `/api/clan/${myClanId}/members`);
                const me = mData.members.find(m => m.id === this.token);
                canInvite = me && (me.role === 'admin' || me.role === 'manager');
            } catch (e) {}
        }

        // Load player leaderboard
        try {
            const pData = await this.api('GET', '/api/leaderboard');
            const container = document.getElementById('lb-players-content');
            if (pData.players.length === 0) {
                container.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">No players yet. Be the first!</p>';
            } else {
                container.innerHTML = pData.players.map((p, idx) => {
                    const flag = this._flag(p.country);
                    const isMe = p.id === this.token;
                    const alreadyInClan = !!p.clanId;
                    // Show invite button if: I can invite, player is not me, player has no clan
                    const showInvite = canInvite && !isMe && !alreadyInClan;
                    return `
                    <div class="lb-row">
                        <span class="lb-rank">${p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank-1] : '#'+p.rank}</span>
                        ${flag ? `<span class="lb-flag">${flag}</span>` : ''}
                        <span class="lb-name" data-pidx="${idx}">${p.name}${p.clanTag ? ` <span class="lb-clan" data-cidx="${idx}">[${p.clanTag}]</span>` : ''}</span>
                        ${showInvite ? `<button class="lb-invite-btn" data-target="${p.id}">+ Invite</button>` : ''}
                        <span class="lb-score">${p.bestScore.toLocaleString()}</span>
                    </div>`;
                }).join('');

                // Bind player name clicks → show player detail
                container.querySelectorAll('.lb-name').forEach(el => {
                    el.addEventListener('click', (e) => {
                        // If they clicked a clan tag inside the name, don't also open player
                        if (e.target.classList.contains('lb-clan')) return;
                        const idx = parseInt(el.dataset.pidx);
                        if (!isNaN(idx)) this.showPlayerDetail(pData.players[idx]);
                    });
                });

                // Bind clan tag clicks → show clan detail popup
                container.querySelectorAll('.lb-clan').forEach(el => {
                    el.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const idx = parseInt(el.dataset.cidx);
                        const player = pData.players[idx];
                        if (!player || !player.clanId) return;
                        try {
                            const cData = await this.api('GET', `/api/clan/${player.clanId}/members`);
                            if (cData.clan) this.showClanDetailPopup(cData.clan);
                        } catch (err) { this.toast('Could not load clan details'); }
                    });
                });

                // Bind invite buttons
                container.querySelectorAll('.lb-invite-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        btn.disabled = true;
                        try {
                            const result = await this.api('POST', '/api/clan/invite-player', { token: this.token, targetId: btn.dataset.target });
                            btn.textContent = '✓ Sent';
                            btn.classList.add('sent');
                            this.toast(result.message);
                        } catch (e) {
                            btn.disabled = false;
                            this.toast(e.message);
                        }
                    });
                });
            }
        } catch (e) {
            document.getElementById('lb-players-content').innerHTML = '<p style="color:#ff4444">Failed to load</p>';
        }

        // Load clan leaderboard
        try {
            const cData = await this.api('GET', '/api/clans');
            const container = document.getElementById('lb-clans-content');
            if (cData.clans.length === 0) {
                container.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">No clans yet. Create one!</p>';
            } else {
                container.innerHTML = cData.clans.map((c, idx) => `
                    <div class="clan-rank-row" data-cridx="${idx}">
                        <span class="clan-rank-num">${c.rank <= 3 ? ['🥇','🥈','🥉'][c.rank-1] : '#'+c.rank}</span>
                        <div class="clan-rank-info">
                            <div class="clan-rank-name">[${c.tag}] ${c.name}</div>
                            <div class="clan-rank-tag">${c.memberCount} members • Led by ${c.leaderName}</div>
                        </div>
                        <div style="text-align:right;">
                            <div class="clan-rank-score">${c.totalScore.toLocaleString()}</div>
                            <div class="clan-rank-members">${c.totalKills.toLocaleString()} kills</div>
                        </div>
                    </div>
                `).join('');

                // Bind clan row clicks → show clan detail popup
                container.querySelectorAll('.clan-rank-row').forEach(el => {
                    el.addEventListener('click', () => {
                        const idx = parseInt(el.dataset.cridx);
                        if (!isNaN(idx)) this.showClanDetailPopup(cData.clans[idx]);
                    });
                });
            }
        } catch (e) {
            document.getElementById('lb-clans-content').innerHTML = '<p style="color:#ff4444">Failed to load</p>';
        }
    }

    closeLeaderboard() {
        document.getElementById('leaderboard-screen').classList.remove('active');
        document.getElementById('lobby-screen').classList.add('active');
    }

    // ========================================================
    // PENDING CLAN INVITES (lobby notifications)
    // ========================================================
    async loadPendingInvites() {
        const area = document.getElementById('invite-notif-area');
        if (!area) return;
        if (this.user.clanId) { area.innerHTML = ''; return; } // Already in a clan

        try {
            const data = await this.api('GET', `/api/clan/invites/${this.token}`);
            if (!data.invites || data.invites.length === 0) {
                area.innerHTML = '';
                return;
            }
            area.innerHTML = data.invites.map(inv => `
                <div class="invite-notif" data-clan="${inv.clanId}">
                    <div class="invite-notif-text">
                        <strong>[${inv.clanTag}] ${inv.clanName}</strong> invited you<br>
                        <span style="color:#777;font-size:10px">by ${inv.invitedBy}</span>
                    </div>
                    <button class="btn btn-green btn-sm invite-accept-btn" data-clan="${inv.clanId}">Join</button>
                    <button class="btn btn-outline btn-sm invite-decline-btn" data-clan="${inv.clanId}" style="color:#ff4444;border-color:rgba(255,68,68,0.2);">✕</button>
                </div>
            `).join('');

            area.querySelectorAll('.invite-accept-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        const result = await this.api('POST', '/api/clan/accept-invite', { token: this.token, clanId: btn.dataset.clan });
                        this.user.clanId = result.clan.id;
                        this.clan = result.clan;
                        this.toast(`Joined [${result.clan.tag}] ${result.clan.name}!`);
                        this.refreshClanBadge();
                        this.loadPendingInvites();
                    } catch (e) { this.toast(e.message); }
                });
            });

            area.querySelectorAll('.invite-decline-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        await this.api('POST', '/api/clan/decline-invite', { token: this.token, clanId: btn.dataset.clan });
                        btn.closest('.invite-notif').remove();
                    } catch (e) { this.toast(e.message); }
                });
            });
        } catch (e) {
            area.innerHTML = '';
        }
    }

    // ========================================================
    // PLAYER & CLAN DETAIL POPUPS
    // ========================================================
    showPlayerDetail(p) {
        this._closeDetailOverlay();
        const flag = this._flag(p.country) || '';
        const overlay = document.createElement('div');
        overlay.className = 'detail-overlay';
        overlay.innerHTML = `
            <div class="detail-card">
                <button class="detail-close">✕</button>
                <h2>${flag} ${p.name}</h2>
                ${p.clanTag ? `<p style="color:#00e5ff;font-size:13px;margin-top:-6px;">[${p.clanTag}]</p>` : ''}
                <div class="detail-stats-grid">
                    <div class="detail-stat gold">
                        <div class="ds-val">${(p.bestScore || 0).toLocaleString()}</div>
                        <div class="ds-label">Best Score</div>
                    </div>
                    <div class="detail-stat">
                        <div class="ds-val">${(p.totalGamesPlayed || 0).toLocaleString()}</div>
                        <div class="ds-label">Games Played</div>
                    </div>
                    <div class="detail-stat red">
                        <div class="ds-val">${(p.totalKills || 0).toLocaleString()}</div>
                        <div class="ds-label">Total Kills</div>
                    </div>
                    <div class="detail-stat">
                        <div class="ds-val">${p.bestLevel || 1}</div>
                        <div class="ds-label">Best Level</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeDetailOverlay(); });
        overlay.querySelector('.detail-close').addEventListener('click', () => this._closeDetailOverlay());
    }

    showClanDetailPopup(c) {
        this._closeDetailOverlay();
        const overlay = document.createElement('div');
        overlay.className = 'detail-overlay';
        overlay.innerHTML = `
            <div class="detail-card">
                <button class="detail-close">✕</button>
                <h2>[${c.tag}] ${c.name}</h2>
                <p style="color:#aaa;font-size:13px;margin-top:-6px;">Leader: ${c.leaderName} • ${c.memberCount} members</p>
                <div class="detail-stats-grid">
                    <div class="detail-stat gold">
                        <div class="ds-val">${(c.totalScore || 0).toLocaleString()}</div>
                        <div class="ds-label">Clan Score</div>
                    </div>
                    <div class="detail-stat red">
                        <div class="ds-val">${(c.totalKills || 0).toLocaleString()}</div>
                        <div class="ds-label">Total Kills</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeDetailOverlay(); });
        overlay.querySelector('.detail-close').addEventListener('click', () => this._closeDetailOverlay());
    }

    _closeDetailOverlay() {
        document.querySelectorAll('.detail-overlay').forEach(el => el.remove());
    }

    // ========================================================
    // NOTIFICATION POLLING + POPUP SYSTEM
    // ========================================================
    _startNotifPolling() {
        this._stopNotifPolling();
        // Do an immediate check, then every 15 seconds
        this._pollNotifications();
        this._notifPollTimer = setInterval(() => this._pollNotifications(), 15000);
    }

    _stopNotifPolling() {
        if (this._notifPollTimer) {
            clearInterval(this._notifPollTimer);
            this._notifPollTimer = null;
        }
    }

    async _pollNotifications() {
        if (!this.token) return;
        try {
            const data = await this.api('GET', `/api/notifications/${this.token}`);
            if (!data.notifications || data.notifications.length === 0) return;

            // Acknowledge immediately so we don't re-show
            this.api('POST', '/api/notifications/ack', { token: this.token }).catch(() => {});

            // If muted, skip showing popups
            if (this._notifMuted) return;

            // Queue notifications for display
            data.notifications.forEach(n => this._notifQueue.push(n));
            this._processNotifQueue();
        } catch (e) {
            // Silent fail — don't interrupt gameplay
        }
    }

    _processNotifQueue() {
        // Max 3 popups visible at once
        while (this._notifQueue.length > 0 && this._notifShowing < 3) {
            const notif = this._notifQueue.shift();
            this._showNotifPopup(notif);
        }
    }

    _showNotifPopup(notif) {
        const container = document.getElementById('notif-popup-container');
        if (!container) return;

        this._notifShowing++;

        const el = document.createElement('div');
        el.className = `notif-popup ${notif.type || ''}`;
        el.innerHTML = `
            <span class="notif-icon">${notif.icon || '🔔'}</span>
            <div class="notif-body">
                <div class="notif-title">${notif.title || 'Notification'}</div>
                <div class="notif-msg">${notif.message || ''}</div>
            </div>
            <button class="notif-close">✕</button>
        `;

        container.appendChild(el);

        const dismiss = () => {
            if (el._dismissed) return;
            el._dismissed = true;
            el.classList.add('removing');
            setTimeout(() => {
                el.remove();
                this._notifShowing--;
                this._processNotifQueue();
            }, 300);
        };

        el.querySelector('.notif-close').addEventListener('click', (e) => {
            e.stopPropagation();
            dismiss();
        });
        el.addEventListener('click', dismiss);

        // Auto-dismiss after 5 seconds
        setTimeout(dismiss, 5000);
    }
}

// ============================================================
// INITIALIZE SOCIAL SYSTEM
// ============================================================
const social = new Social();
