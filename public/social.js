// ============================================================
// 🧛 DARK SURVIVORS — Social / Clan System
// Account login, clans, invites, rankings
// ============================================================

class Social {
    constructor() {
        this.token = localStorage.getItem('ds_token') || null;
        this.user = null;
        this.clan = null;

        this.bindAuthTabs();
        this.bindLoginEvents();
        this.bindRegisterEvents();
        this.bindResetEvents();
        this.bindLobbyEvents();

        // Auto-login if we have a token
        if (this.token) {
            this.tryAutoLogin();
        }
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
            const data = await this.api('POST', '/api/register', { username, password, securityQuestion, securityAnswer });
            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('ds_token', this.token);

            this.toast('Account created! Welcome, ' + this.user.name);
            document.getElementById('login-screen').classList.remove('active');
            document.body.classList.remove('auth-active');
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
        this.token = null;
        localStorage.removeItem('ds_token');
        this.user = null;
        this.clan = null;
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        document.body.classList.add('auth-active');
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

            const isLeader = members.some(m => m.id === this.token && m.isLeader);

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
                    ${members.map(m => `
                        <div class="member-row">
                            <span class="member-rank">${m.rank <= 3 ? ['🥇','🥈','🥉'][m.rank-1] : '#'+m.rank}</span>
                            <span class="member-name">${m.name}${m.isLeader ? '<span class="leader-badge">👑</span>' : ''}${m.id === this.token ? ' (You)' : ''}</span>
                            <span class="member-score">${m.bestScore.toLocaleString()}</span>
                        </div>
                    `).join('')}
                </div>

                <div style="display:flex;gap:8px;justify-content:center;margin-top:20px;flex-wrap:wrap;">
                    <button class="btn btn-outline btn-sm" id="leave-clan-btn" style="color:#ff4444;border-color:rgba(255,68,68,0.3);">Leave Clan</button>
                    <button class="btn btn-outline btn-sm" id="close-clan-btn">✕ Close</button>
                </div>
            `;

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

        // Load player leaderboard
        try {
            const pData = await this.api('GET', '/api/leaderboard');
            const container = document.getElementById('lb-players-content');
            if (pData.players.length === 0) {
                container.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">No players yet. Be the first!</p>';
            } else {
                container.innerHTML = pData.players.map(p => `
                    <div class="lb-row">
                        <span class="lb-rank">${p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank-1] : '#'+p.rank}</span>
                        <span class="lb-name">${p.name}${p.clanTag ? ` <span class="lb-clan">[${p.clanTag}]</span>` : ''}</span>
                        <span class="lb-score">${p.bestScore.toLocaleString()}</span>
                    </div>
                `).join('');
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
                container.innerHTML = cData.clans.map(c => `
                    <div class="clan-rank-row">
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
            }
        } catch (e) {
            document.getElementById('lb-clans-content').innerHTML = '<p style="color:#ff4444">Failed to load</p>';
        }
    }

    closeLeaderboard() {
        document.getElementById('leaderboard-screen').classList.remove('active');
        document.getElementById('lobby-screen').classList.add('active');
    }
}

// ============================================================
// INITIALIZE SOCIAL SYSTEM
// ============================================================
const social = new Social();
