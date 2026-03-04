// ============================================================
// 🧛 DARK SURVIVORS — Social / Clan System
// Guest login, clans, invites, rankings
// ============================================================

class Social {
    constructor() {
        this.token = localStorage.getItem('ds_token') || null;
        this.user = null;
        this.clan = null;

        this.bindLoginEvents();
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
    // LOGIN
    // ========================================================
    bindLoginEvents() {
        document.getElementById('login-btn').addEventListener('click', () => this.login());
        document.getElementById('login-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.login();
        });
    }

    async login() {
        const nameInput = document.getElementById('login-name');
        const name = nameInput.value.trim();
        const errEl = document.getElementById('login-error');

        if (!name || name.length < 2) {
            errEl.textContent = 'Name must be at least 2 characters';
            return;
        }

        errEl.textContent = '';

        try {
            const data = await this.api('POST', '/api/login', { name, token: this.token });
            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('ds_token', this.token);

            document.getElementById('login-screen').classList.remove('active');
            this.showLobby();
        } catch (e) {
            errEl.textContent = e.message;
        }
    }

    async tryAutoLogin() {
        try {
            const data = await this.api('GET', `/api/user/${this.token}`);
            this.user = data.user;
            document.getElementById('login-screen').classList.remove('active');
            this.showLobby();
        } catch (e) {
            // Token expired or invalid
            this.token = null;
            localStorage.removeItem('ds_token');
        }
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

    logout() {
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('login-name').value = this.user?.name || '';
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
                <input type="text" id="join-code-input" class="input" placeholder="Enter 6-digit code..." maxlength="6" style="text-transform:uppercase;text-align:center;letter-spacing:3px;font-size:18px;">
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

                <div style="display:flex;gap:8px;justify-content:center;margin-bottom:12px;">
                    <div class="stat-card" style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;text-align:center;flex:1;">
                        <div class="stat-val" style="color:#ffd700;font-size:18px;">${this.clan.totalScore.toLocaleString()}</div>
                        <div class="stat-label" style="color:#888;font-size:11px;">Clan Score</div>
                    </div>
                    <div class="stat-card" style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;text-align:center;flex:1;">
                        <div class="stat-val" style="color:#ff6644;font-size:18px;">${this.clan.totalKills.toLocaleString()}</div>
                        <div class="stat-label" style="color:#888;font-size:11px;">Total Kills</div>
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
