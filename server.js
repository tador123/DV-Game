// ============================================================
// 🧛 DARK SURVIVORS — Backend Server
// Express server with account login, clans, rankings
// ============================================================
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// DATA PERSISTENCE (JSON file-based)
// Uses DATA_DIR env var in Docker, falls back to project root
// ============================================================
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
    return { users: {}, clans: {}, invites: {} };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving data:', e);
    }
}

let db = loadData();

// Auto-save every 30 seconds
setInterval(() => saveData(db), 30000);

// ============================================================
// AUTH — Register / Login / Reset Password
// ============================================================

// Register new account
app.post('/api/register', async (req, res) => {
    const { username, password, securityQuestion, securityAnswer, country } = req.body;

    if (!username || username.trim().length < 2 || username.trim().length > 20) {
        return res.status(400).json({ error: 'Username must be 2-20 characters' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    if (!securityQuestion || !securityAnswer || securityAnswer.trim().length < 1) {
        return res.status(400).json({ error: 'Security question and answer are required' });
    }

    const cleanName = username.trim();

    // Check unique username (case-insensitive)
    const nameTaken = Object.values(db.users).some(
        u => u.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (nameTaken) {
        return res.status(409).json({ error: 'Username already taken' });
    }

    const token = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedAnswer = await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10);

    const user = {
        id: token,
        name: cleanName,
        passwordHash: hashedPassword,
        securityQuestion: securityQuestion.trim(),
        securityAnswerHash: hashedAnswer,
        createdAt: Date.now(),
        lastLogin: Date.now(),
        clanId: null,
        bestScore: 0,
        bestTime: 0,
        bestKills: 0,
        bestLevel: 0,
        totalGamesPlayed: 0,
        totalKills: 0,
        totalTimePlayed: 0,
        country: (country && typeof country === 'string' && country.length === 2) ? country.toUpperCase() : null,
        pendingClanInvites: [],
        notifications: [],
    };

    db.users[token] = user;
    saveData(db);
    res.json({ token, user: sanitizeUser(user) });
});

// Login with username + password
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanName = username.trim();
    const userEntry = Object.values(db.users).find(
        u => u.name.toLowerCase() === cleanName.toLowerCase()
    );

    if (!userEntry) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, userEntry.passwordHash);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    userEntry.lastLogin = Date.now();
    saveData(db);
    res.json({ token: userEntry.id, user: sanitizeUser(userEntry) });
});

// Get security question for password reset
app.post('/api/reset/question', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const userEntry = Object.values(db.users).find(
        u => u.name.toLowerCase() === username.trim().toLowerCase()
    );
    if (!userEntry) {
        return res.status(404).json({ error: 'Username not found' });
    }

    res.json({ securityQuestion: userEntry.securityQuestion });
});

// Reset password with security answer
app.post('/api/reset/password', async (req, res) => {
    const { username, securityAnswer, newPassword } = req.body;

    if (!username || !securityAnswer || !newPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const userEntry = Object.values(db.users).find(
        u => u.name.toLowerCase() === username.trim().toLowerCase()
    );
    if (!userEntry) {
        return res.status(404).json({ error: 'Username not found' });
    }

    const answerValid = await bcrypt.compare(securityAnswer.trim().toLowerCase(), userEntry.securityAnswerHash);
    if (!answerValid) {
        return res.status(401).json({ error: 'Security answer is incorrect' });
    }

    userEntry.passwordHash = await bcrypt.hash(newPassword, 10);
    saveData(db);
    res.json({ success: true, message: 'Password reset successfully. You can now login.' });
});

// Get user profile (by token)
app.get('/api/user/:token', (req, res) => {
    const user = db.users[req.params.token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: sanitizeUser(user) });
});

// Helper: strip sensitive fields before sending to client
function sanitizeUser(u) {
    const { passwordHash, securityAnswerHash, securityQuestion, ...safe } = u;
    return safe;
}

// ============================================================
// SCORE SUBMISSION
// ============================================================
app.post('/api/score', (req, res) => {
    const { token, time, kills, level } = req.body;
    const user = db.users[token];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const score = Math.floor(kills * 10 + time * 5 + level * 50);

    user.totalGamesPlayed++;
    user.totalKills += kills;
    user.totalTimePlayed += time;

    const isNewBest = score > user.bestScore;
    if (isNewBest) {
        user.bestScore = score;
        user.bestTime = time;
        user.bestKills = kills;
        user.bestLevel = level;

        // Notify clan members of new best score
        if (user.clanId && db.clans[user.clanId]) {
            const clan = db.clans[user.clanId];
            clan.members.forEach(mId => {
                if (mId !== token && db.users[mId]) {
                    pushNotification(db.users[mId], {
                        type: 'clan_score',
                        title: 'New Best Score!',
                        message: `${user.name} set a new best score of ${score.toLocaleString()}!`,
                        icon: '🏆',
                    });
                }
            });
        }
    }

    saveData(db);
    res.json({ score, bestScore: user.bestScore, isNewBest, user: sanitizeUser(user) });
});

// ============================================================
// CLAN SYSTEM
// ============================================================

// Create clan
app.post('/api/clan/create', (req, res) => {
    const { token, clanName, clanTag } = req.body;
    const user = db.users[token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.clanId) return res.status(400).json({ error: 'You are already in a clan. Leave first.' });

    if (!clanName || clanName.trim().length < 2 || clanName.trim().length > 30) {
        return res.status(400).json({ error: 'Clan name must be 2-30 characters' });
    }
    if (!clanTag || clanTag.trim().length < 2 || clanTag.trim().length > 5) {
        return res.status(400).json({ error: 'Clan tag must be 2-5 characters' });
    }

    // Check duplicate tag
    const tagUpper = clanTag.trim().toUpperCase();
    const tagExists = Object.values(db.clans).some(c => c.tag === tagUpper);
    if (tagExists) return res.status(400).json({ error: 'Clan tag already taken' });

    const clanId = uuidv4();
    const clan = {
        id: clanId,
        name: clanName.trim(),
        tag: tagUpper,
        leaderId: token,
        members: [token],
        roles: { [token]: 'admin' },
        createdAt: Date.now(),
        inviteCode: generateInviteCode(),
    };

    db.clans[clanId] = clan;
    user.clanId = clanId;
    saveData(db);

    res.json({ clan: enrichClan(clan) });
});

// Get clan info
app.get('/api/clan/:clanId', (req, res) => {
    const clan = db.clans[req.params.clanId];
    if (!clan) return res.status(404).json({ error: 'Clan not found' });
    res.json({ clan: enrichClan(clan) });
});

// List all clans (with rankings)
app.get('/api/clans', (req, res) => {
    const clans = Object.values(db.clans).map(c => enrichClan(c));
    // Sort by total clan score
    clans.sort((a, b) => b.totalScore - a.totalScore);
    // Add rank
    clans.forEach((c, i) => c.rank = i + 1);
    res.json({ clans });
});

// Join clan by invite code
app.post('/api/clan/join', (req, res) => {
    const { token, inviteCode } = req.body;
    const user = db.users[token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.clanId) return res.status(400).json({ error: 'You are already in a clan. Leave first.' });

    const clan = Object.values(db.clans).find(c => c.inviteCode === inviteCode.toUpperCase());
    if (!clan) return res.status(404).json({ error: 'Invalid invite code' });

    if (clan.members.length >= 50) {
        return res.status(400).json({ error: 'Clan is full (max 50 members)' });
    }

    clan.members.push(token);
    if (!clan.roles) clan.roles = {};
    clan.roles[token] = 'member';
    user.clanId = clan.id;
    saveData(db);

    res.json({ clan: enrichClan(clan) });
});

// Leave clan
app.post('/api/clan/leave', (req, res) => {
    const { token } = req.body;
    const user = db.users[token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.clanId) return res.status(400).json({ error: 'You are not in a clan' });

    const clan = db.clans[user.clanId];
    if (!clan) {
        user.clanId = null;
        saveData(db);
        return res.json({ success: true });
    }

    // Remove from clan
    clan.members = clan.members.filter(m => m !== token);
    if (clan.roles) delete clan.roles[token];

    // If leader/admin leaves, assign new leader or delete clan
    if (clan.leaderId === token) {
        if (clan.members.length > 0) {
            // Promote a manager first, then any member
            const mgr = clan.roles ? Object.keys(clan.roles).find(id => clan.roles[id] === 'manager' && clan.members.includes(id)) : null;
            const newLeader = mgr || clan.members[0];
            clan.leaderId = newLeader;
            if (clan.roles) clan.roles[newLeader] = 'admin';
        } else {
            delete db.clans[clan.id];
        }
    }

    user.clanId = null;
    saveData(db);
    res.json({ success: true });
});

// Get my clan with member rankings
app.get('/api/clan/:clanId/members', (req, res) => {
    const clan = db.clans[req.params.clanId];
    if (!clan) return res.status(404).json({ error: 'Clan not found' });

    const members = clan.members
        .map(id => db.users[id])
        .filter(Boolean)
        .map(u => ({
            id: u.id,
            name: u.name,
            bestScore: u.bestScore,
            bestTime: u.bestTime,
            bestKills: u.bestKills,
            bestLevel: u.bestLevel,
            totalGamesPlayed: u.totalGamesPlayed,
            totalKills: u.totalKills,
            isLeader: u.id === clan.leaderId,
            role: (clan.roles && clan.roles[u.id]) || (u.id === clan.leaderId ? 'admin' : 'member'),
        }))
        .sort((a, b) => b.bestScore - a.bestScore);

    // Assign ranks
    members.forEach((m, i) => m.rank = i + 1);

    res.json({ members, clan: enrichClan(clan) });
});

// Regenerate invite code
app.post('/api/clan/new-invite', (req, res) => {
    const { token } = req.body;
    const user = db.users[token];
    if (!user || !user.clanId) return res.status(400).json({ error: 'Not in a clan' });

    const clan = db.clans[user.clanId];
    const callerRole = clan && clan.roles ? clan.roles[token] : (clan && clan.leaderId === token ? 'admin' : null);
    if (!clan || (callerRole !== 'admin' && callerRole !== 'manager')) return res.status(403).json({ error: 'Only admin/manager can regenerate invite codes' });

    clan.inviteCode = generateInviteCode();
    saveData(db);
    res.json({ inviteCode: clan.inviteCode });
});

// Global leaderboard
app.get('/api/leaderboard', (req, res) => {
    const players = Object.values(db.users)
        .map(u => ({
            id: u.id,
            name: u.name,
            country: u.country || null,
            bestScore: u.bestScore,
            bestTime: u.bestTime,
            bestKills: u.bestKills,
            bestLevel: u.bestLevel,
            totalGamesPlayed: u.totalGamesPlayed,
            clanTag: u.clanId && db.clans[u.clanId] ? db.clans[u.clanId].tag : null,
            clanId: u.clanId || null,
        }))
        .sort((a, b) => b.bestScore - a.bestScore)
        .slice(0, 100);

    players.forEach((p, i) => p.rank = i + 1);
    res.json({ players });
});

// ============================================================
// CLAN ROLE MANAGEMENT
// ============================================================

// Set member role (admin only)
app.post('/api/clan/set-role', (req, res) => {
    const { token, targetId, role } = req.body;
    if (!['manager', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const user = db.users[token];
    if (!user || !user.clanId) return res.status(400).json({ error: 'Not in a clan' });

    const clan = db.clans[user.clanId];
    if (!clan) return res.status(404).json({ error: 'Clan not found' });

    const callerRole = (clan.roles && clan.roles[token]) || (clan.leaderId === token ? 'admin' : 'member');
    if (callerRole !== 'admin') return res.status(403).json({ error: 'Only the admin can change roles' });
    if (targetId === token) return res.status(400).json({ error: 'Cannot change your own role' });
    if (!clan.members.includes(targetId)) return res.status(400).json({ error: 'Player is not in your clan' });

    if (!clan.roles) clan.roles = {};
    clan.roles[targetId] = role;
    saveData(db);
    res.json({ success: true });
});

// Invite a player to clan (admin/manager)
app.post('/api/clan/invite-player', (req, res) => {
    const { token, targetId } = req.body;
    const user = db.users[token];
    if (!user || !user.clanId) return res.status(400).json({ error: 'Not in a clan' });

    const clan = db.clans[user.clanId];
    if (!clan) return res.status(404).json({ error: 'Clan not found' });

    const callerRole = (clan.roles && clan.roles[token]) || (clan.leaderId === token ? 'admin' : 'member');
    if (callerRole !== 'admin' && callerRole !== 'manager') return res.status(403).json({ error: 'Only admin/manager can invite' });

    const target = db.users[targetId];
    if (!target) return res.status(404).json({ error: 'Player not found' });
    if (target.clanId) return res.status(400).json({ error: 'Player is already in a clan' });

    if (!target.pendingClanInvites) target.pendingClanInvites = [];
    // Don't duplicate
    if (target.pendingClanInvites.some(inv => inv.clanId === clan.id)) {
        return res.status(400).json({ error: 'Invite already sent' });
    }
    if (clan.members.length >= 50) return res.status(400).json({ error: 'Clan is full' });

    target.pendingClanInvites.push({
        clanId: clan.id,
        clanName: clan.name,
        clanTag: clan.tag,
        invitedBy: user.name,
        invitedAt: Date.now(),
    });

    // Push a real-time notification to the target
    pushNotification(target, {
        type: 'clan_invite',
        title: 'Clan Invite',
        message: `${user.name} invited you to [${clan.tag}] ${clan.name}`,
        icon: '📩',
    });

    saveData(db);
    res.json({ success: true, message: `Invite sent to ${target.name}` });
});

// Get pending invites for a user
app.get('/api/clan/invites/:token', (req, res) => {
    const user = db.users[req.params.token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const invites = (user.pendingClanInvites || []).filter(inv => db.clans[inv.clanId]);
    res.json({ invites });
});

// Accept clan invite
app.post('/api/clan/accept-invite', (req, res) => {
    const { token, clanId } = req.body;
    const user = db.users[token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.clanId) return res.status(400).json({ error: 'You are already in a clan. Leave first.' });

    const clan = db.clans[clanId];
    if (!clan) {
        user.pendingClanInvites = (user.pendingClanInvites || []).filter(i => i.clanId !== clanId);
        saveData(db);
        return res.status(404).json({ error: 'Clan no longer exists' });
    }
    if (clan.members.length >= 50) return res.status(400).json({ error: 'Clan is full' });

    clan.members.push(token);
    if (!clan.roles) clan.roles = {};
    clan.roles[token] = 'member';
    user.clanId = clanId;
    user.pendingClanInvites = (user.pendingClanInvites || []).filter(i => i.clanId !== clanId);
    saveData(db);
    res.json({ clan: enrichClan(clan) });
});

// Decline clan invite
app.post('/api/clan/decline-invite', (req, res) => {
    const { token, clanId } = req.body;
    const user = db.users[token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.pendingClanInvites = (user.pendingClanInvites || []).filter(i => i.clanId !== clanId);
    saveData(db);
    res.json({ success: true });
});

// Update country (for existing users)
app.post('/api/user/country', (req, res) => {
    const { token, country } = req.body;
    const user = db.users[token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.country = (country && typeof country === 'string' && country.length === 2) ? country.toUpperCase() : null;
    saveData(db);
    res.json({ user: sanitizeUser(user) });
});

// Get notifications for a user (polling endpoint — lightweight)
app.get('/api/notifications/:token', (req, res) => {
    const user = db.users[req.params.token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const notifs = user.notifications || [];
    res.json({ notifications: notifs });
});

// Acknowledge (clear) notifications
app.post('/api/notifications/ack', (req, res) => {
    const { token } = req.body;
    const user = db.users[token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.notifications = [];
    saveData(db);
    res.json({ success: true });
});

// ============================================================
// HELPERS
// ============================================================

// Push a notification to a user (capped at 20, FIFO)
function pushNotification(user, { type, title, message, icon }) {
    if (!user.notifications) user.notifications = [];
    user.notifications.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type,
        title,
        message,
        icon: icon || '🔔',
        createdAt: Date.now(),
    });
    // Cap at 20 — drop oldest
    if (user.notifications.length > 20) {
        user.notifications = user.notifications.slice(-20);
    }
}

function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function enrichClan(clan) {
    const members = clan.members.map(id => db.users[id]).filter(Boolean);
    const totalScore = members.reduce((sum, u) => sum + u.bestScore, 0);
    const totalKills = members.reduce((sum, u) => sum + u.totalKills, 0);
    const memberCount = members.length;
    const leaderName = db.users[clan.leaderId]?.name || 'Unknown';

    return {
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        leaderName,
        memberCount,
        totalScore,
        totalKills,
        inviteCode: clan.inviteCode,
        createdAt: clan.createdAt,
    };
}

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`\n🧛 DARK SURVIVORS server running at http://localhost:${PORT}\n`);
});
