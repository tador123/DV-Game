// ============================================================
// 🧛 DARK SURVIVORS — Backend Server
// Express server for guest login, clans, rankings
// ============================================================
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
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
// AUTH — Guest Login
// ============================================================
app.post('/api/login', (req, res) => {
    const { name } = req.body;
    if (!name || name.trim().length < 2 || name.trim().length > 20) {
        return res.status(400).json({ error: 'Name must be 2-20 characters' });
    }

    const cleanName = name.trim();

    // Check if returning user (by token in body)
    if (req.body.token && db.users[req.body.token]) {
        const user = db.users[req.body.token];
        // If name is changing, check uniqueness
        if (user.name.toLowerCase() !== cleanName.toLowerCase()) {
            const nameTaken = Object.values(db.users).some(
                u => u.id !== user.id && u.name.toLowerCase() === cleanName.toLowerCase()
            );
            if (nameTaken) {
                return res.status(409).json({ error: 'Name already taken. Choose a different name.' });
            }
        }
        user.name = cleanName;
        user.lastLogin = Date.now();
        saveData(db);
        return res.json({ token: req.body.token, user });
    }

    // New guest user — enforce unique name
    const nameTaken = Object.values(db.users).some(
        u => u.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (nameTaken) {
        return res.status(409).json({ error: 'Name already taken. Choose a different name.' });
    }

    const token = uuidv4();
    const user = {
        id: token,
        name: cleanName,
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
    };

    db.users[token] = user;
    saveData(db);
    res.json({ token, user });
});

// Get user profile
app.get('/api/user/:token', (req, res) => {
    const user = db.users[req.params.token];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
});

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

    if (score > user.bestScore) {
        user.bestScore = score;
        user.bestTime = time;
        user.bestKills = kills;
        user.bestLevel = level;
    }

    saveData(db);
    res.json({ score, bestScore: user.bestScore, user });
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

    // If leader leaves, assign new leader or delete clan
    if (clan.leaderId === token) {
        if (clan.members.length > 0) {
            clan.leaderId = clan.members[0];
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
    if (!clan || clan.leaderId !== token) return res.status(403).json({ error: 'Only the leader can regenerate invite codes' });

    clan.inviteCode = generateInviteCode();
    saveData(db);
    res.json({ inviteCode: clan.inviteCode });
});

// Global leaderboard
app.get('/api/leaderboard', (req, res) => {
    const players = Object.values(db.users)
        .map(u => ({
            name: u.name,
            bestScore: u.bestScore,
            bestTime: u.bestTime,
            bestKills: u.bestKills,
            bestLevel: u.bestLevel,
            totalGamesPlayed: u.totalGamesPlayed,
            clanTag: u.clanId && db.clans[u.clanId] ? db.clans[u.clanId].tag : null,
        }))
        .sort((a, b) => b.bestScore - a.bestScore)
        .slice(0, 100);

    players.forEach((p, i) => p.rank = i + 1);
    res.json({ players });
});

// ============================================================
// HELPERS
// ============================================================
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
