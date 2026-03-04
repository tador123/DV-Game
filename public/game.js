// ============================================================
// 🧛 DARK SURVIVORS — Complete Game Engine
// A Vampire Survivors-style bullet hell survival game
// With mobile touch controls & social integration
// ============================================================

// ============================================================
// CONFIGURATION
// ============================================================
const CONFIG = {
    WORLD_SIZE: 4000,
    PLAYER_SPEED: 200,
    PLAYER_MAX_HP: 100,
    PLAYER_PICKUP_RADIUS: 80,
    PLAYER_INVINCIBLE_TIME: 500,
    BASE_ENEMY_SPAWN_RATE: 1.5,
    MIN_ENEMY_SPAWN_RATE: 0.15,
    XP_TO_LEVEL: [0, 10, 25, 50, 80, 120, 170, 230, 300, 380, 470, 570, 680, 800, 930, 1070, 1220],
    CAMERA_SMOOTH: 0.08,
    GRID_SIZE: 80,
    MAX_ENEMIES: 500,
    MAX_PARTICLES: 300,
    MAX_DAMAGE_NUMBERS: 50,
    BOSS_INTERVAL: 60,
};

// ============================================================
// AUDIO SYSTEM (Web Audio API — no external files)
// ============================================================
class AudioManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.45;
        this.sfxOn = true;
        this.musicOn = true;
        this.bgNodes = null;
        this.musicGain = null;
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Resume on user gesture (some browsers suspend AudioContext)
            if (this.ctx.state === 'suspended') this.ctx.resume();
        } catch (e) {
            this.enabled = false;
        }
    }

    // ---- Background Music: dark ambient procedural loop ----
    startMusic() {
        if (!this.enabled || !this.ctx || this.bgNodes) return;
        try {
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.setValueAtTime(this.musicOn ? this.musicVolume : 0, this.ctx.currentTime);
            this.musicGain.connect(this.ctx.destination);

            this.bgNodes = [];

            // Layer 1: Deep bass drone (dark foundation)
            const bass = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            bass.type = 'sine';
            bass.frequency.setValueAtTime(55, this.ctx.currentTime); // A1
            bassGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
            bass.connect(bassGain);
            bassGain.connect(this.musicGain);
            bass.start();
            this.bgNodes.push(bass);

            // Layer 2: Sub-bass pulse (slow LFO on volume for menacing throb)
            const sub = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            const subLfo = this.ctx.createOscillator();
            const subLfoGain = this.ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(36.7, this.ctx.currentTime); // D1
            subGain.gain.setValueAtTime(0.18, this.ctx.currentTime);
            subLfo.type = 'sine';
            subLfo.frequency.setValueAtTime(0.15, this.ctx.currentTime); // very slow throb
            subLfoGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
            subLfo.connect(subLfoGain);
            subLfoGain.connect(subGain.gain);
            sub.connect(subGain);
            subGain.connect(this.musicGain);
            sub.start(); subLfo.start();
            this.bgNodes.push(sub, subLfo);

            // Layer 3: Eerie pad (detuned triangle waves for atmosphere)
            const pad1 = this.ctx.createOscillator();
            const pad2 = this.ctx.createOscillator();
            const padFilter = this.ctx.createBiquadFilter();
            const padGain = this.ctx.createGain();
            pad1.type = 'triangle';
            pad2.type = 'triangle';
            pad1.frequency.setValueAtTime(110, this.ctx.currentTime); // A2
            pad2.frequency.setValueAtTime(112.5, this.ctx.currentTime); // Slightly detuned = eerie beating
            padFilter.type = 'lowpass';
            padFilter.frequency.setValueAtTime(400, this.ctx.currentTime);
            padFilter.Q.setValueAtTime(2, this.ctx.currentTime);
            padGain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            pad1.connect(padFilter); pad2.connect(padFilter);
            padFilter.connect(padGain);
            padGain.connect(this.musicGain);
            pad1.start(); pad2.start();
            this.bgNodes.push(pad1, pad2);

            // Layer 4: High eerie whisper (filtered noise-like texture via detuned oscillators)
            const whisper1 = this.ctx.createOscillator();
            const whisper2 = this.ctx.createOscillator();
            const whisperFilter = this.ctx.createBiquadFilter();
            const whisperGain = this.ctx.createGain();
            const whisperLfo = this.ctx.createOscillator();
            const whisperLfoGain = this.ctx.createGain();
            whisper1.type = 'sine';
            whisper2.type = 'sine';
            whisper1.frequency.setValueAtTime(660, this.ctx.currentTime); // E5
            whisper2.frequency.setValueAtTime(663, this.ctx.currentTime);
            whisperFilter.type = 'bandpass';
            whisperFilter.frequency.setValueAtTime(700, this.ctx.currentTime);
            whisperFilter.Q.setValueAtTime(8, this.ctx.currentTime);
            whisperGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
            whisperLfo.type = 'sine';
            whisperLfo.frequency.setValueAtTime(0.08, this.ctx.currentTime);
            whisperLfoGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
            whisperLfo.connect(whisperLfoGain);
            whisperLfoGain.connect(whisperGain.gain);
            whisper1.connect(whisperFilter); whisper2.connect(whisperFilter);
            whisperFilter.connect(whisperGain);
            whisperGain.connect(this.musicGain);
            whisper1.start(); whisper2.start(); whisperLfo.start();
            this.bgNodes.push(whisper1, whisper2, whisperLfo);

            // Layer 5: Rhythmic pulse (dark heartbeat-like kick)
            this._startHeartbeat();
        } catch (e) {}
    }

    _startHeartbeat() {
        if (!this.enabled || !this.ctx || !this.musicGain) return;
        const scheduleKick = () => {
            if (!this.bgNodes) return;
            try {
                const now = this.ctx.currentTime;
                // Double kick like a heartbeat
                [0, 0.18].forEach(offset => {
                    const osc = this.ctx.createOscillator();
                    const g = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(80, now + offset);
                    osc.frequency.exponentialRampToValueAtTime(30, now + offset + 0.15);
                    g.gain.setValueAtTime(0.2, now + offset);
                    g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);
                    osc.connect(g);
                    g.connect(this.musicGain);
                    osc.start(now + offset);
                    osc.stop(now + offset + 0.25);
                });
            } catch (e) {}
            this._heartbeatTimer = setTimeout(scheduleKick, 2400); // heartbeat every 2.4s
        };
        scheduleKick();
    }

    stopMusic() {
        if (this.bgNodes) {
            this.bgNodes.forEach(n => { try { n.stop(); } catch (e) {} });
            this.bgNodes = null;
        }
        if (this._heartbeatTimer) {
            clearTimeout(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
        this.musicGain = null;
    }

    toggleMusic() {
        this.musicOn = !this.musicOn;
        if (this.musicGain) {
            this.musicGain.gain.linearRampToValueAtTime(
                this.musicOn ? this.musicVolume : 0,
                this.ctx.currentTime + 0.3
            );
        }
        this.updateSoundButtons();
    }

    toggleSfx() {
        this.sfxOn = !this.sfxOn;
        this.updateSoundButtons();
    }

    updateSoundButtons() {
        const sfxBtn = document.getElementById('sfx-toggle');
        const musBtn = document.getElementById('music-toggle');
        if (sfxBtn) sfxBtn.textContent = this.sfxOn ? '🔊' : '🔇';
        if (musBtn) musBtn.textContent = this.musicOn ? '🎵' : '🎵̸';
        // Pause screen buttons
        const pSfx = document.getElementById('pause-sfx-btn');
        const pMus = document.getElementById('pause-music-btn');
        if (pSfx) pSfx.textContent = this.sfxOn ? '🔊 SFX: ON' : '🔇 SFX: OFF';
        if (pMus) pMus.textContent = this.musicOn ? '🎵 Music: ON' : '🎵 Music: OFF';
    }

    play(type) {
        if (!this.enabled || !this.ctx || !this.sfxOn) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            const v = this.sfxVolume;

            switch (type) {
                case 'hit':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(200, now);
                    osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
                    gain.gain.setValueAtTime(0.25 * v, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                    osc.start(now); osc.stop(now + 0.12);
                    break;
                case 'kill':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(400, now);
                    osc.frequency.exponentialRampToValueAtTime(100, now + 0.18);
                    gain.gain.setValueAtTime(0.2 * v, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                    osc.start(now); osc.stop(now + 0.18);
                    break;
                case 'levelup':
                    [523, 659, 784, 1047].forEach((freq, i) => {
                        const o = this.ctx.createOscillator();
                        const g = this.ctx.createGain();
                        o.connect(g); g.connect(this.ctx.destination);
                        o.type = 'sine';
                        o.frequency.setValueAtTime(freq, now + i * 0.1);
                        g.gain.setValueAtTime(0.3 * v, now + i * 0.1);
                        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
                        o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.35);
                    });
                    break;
                case 'pickup':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(600, now);
                    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
                    gain.gain.setValueAtTime(0.2 * v, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                    osc.start(now); osc.stop(now + 0.12);
                    break;
                case 'playerHit':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.exponentialRampToValueAtTime(50, now + 0.25);
                    gain.gain.setValueAtTime(0.35 * v, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                    osc.start(now); osc.stop(now + 0.3);
                    break;
                case 'boss':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(80, now);
                    osc.frequency.setValueAtTime(60, now + 0.2);
                    osc.frequency.setValueAtTime(80, now + 0.4);
                    gain.gain.setValueAtTime(0.4 * v, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                    osc.start(now); osc.stop(now + 0.6);
                    break;
            }
        } catch (e) {}
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
function angle(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function formatTime(seconds) { const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60); return `${m}:${s.toString().padStart(2, '0')}`; }

function shadeColor(color, amount) {
    let hex = color.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
    r = clamp(r + amount, 0, 255); g = clamp(g + amount, 0, 255); b = clamp(b + amount, 0, 255);
    return `rgb(${r},${g},${b})`;
}

// ============================================================
// WEAPON DEFINITIONS
// ============================================================
const WEAPON_DEFS = {
    magicOrb: { name: 'Magic Orb', icon: '🔮', desc: 'Orbs orbit around you, damaging enemies on contact.', color: '#aa66ff', baseDamage: 8, baseCooldown: 0, baseCount: 2, evolvePerLevel: { damage: 5, count: 1 }, maxLevel: 8, type: 'orbit' },
    holyWater: { name: 'Holy Water', icon: '💧', desc: 'Drops damaging zones that hurt enemies standing in them.', color: '#44aaff', baseDamage: 6, baseCooldown: 3000, baseCount: 1, evolvePerLevel: { damage: 4, count: 0.5, cooldownMult: 0.92 }, maxLevel: 8, type: 'zone' },
    lightningBolt: { name: 'Lightning', icon: '⚡', desc: 'Strikes the nearest enemy with chain lightning.', color: '#ffee44', baseDamage: 15, baseCooldown: 1200, baseCount: 1, evolvePerLevel: { damage: 8, count: 0.34, cooldownMult: 0.9 }, maxLevel: 8, type: 'lightning' },
    throwingKnife: { name: 'Knives', icon: '🗡️', desc: 'Fires fast knives in your movement direction.', color: '#cccccc', baseDamage: 10, baseCooldown: 400, baseCount: 1, evolvePerLevel: { damage: 4, count: 0.5, cooldownMult: 0.92 }, maxLevel: 8, type: 'projectile' },
    garlicAura: { name: 'Garlic Aura', icon: '🧄', desc: 'Passive damage aura that hurts nearby enemies.', color: '#88ff88', baseDamage: 3, baseCooldown: 500, baseCount: 1, evolvePerLevel: { damage: 2, radiusMult: 1.12 }, maxLevel: 8, type: 'aura' },
    fireball: { name: 'Fireball', icon: '🔥', desc: 'Launches explosive fireballs at random enemies.', color: '#ff6622', baseDamage: 25, baseCooldown: 2000, baseCount: 1, evolvePerLevel: { damage: 12, count: 0.34, cooldownMult: 0.9 }, maxLevel: 8, type: 'fireball' },
};

// ============================================================
// ENEMY DEFINITIONS
// ============================================================
const ENEMY_TYPES = {
    zombie: { name: 'Zombie', color: '#44aa44', hp: 15, speed: 40, size: 14, damage: 8, xp: 2 },
    bat: { name: 'Bat', color: '#aa44aa', hp: 8, speed: 100, size: 10, damage: 5, xp: 1 },
    skeleton: { name: 'Skeleton', color: '#ddddaa', hp: 30, speed: 55, size: 14, damage: 12, xp: 3 },
    ghost: { name: 'Ghost', color: '#6688cc', hp: 20, speed: 70, size: 12, damage: 10, xp: 3, alpha: 0.6 },
    demon: { name: 'Demon', color: '#ff4444', hp: 60, speed: 45, size: 18, damage: 20, xp: 8 },
    boss: { name: 'Boss', color: '#ff2222', hp: 500, speed: 30, size: 40, damage: 35, xp: 50, isBoss: true },
};

// ============================================================
// PASSIVE UPGRADE DEFINITIONS
// ============================================================
const PASSIVE_UPGRADES = {
    maxHp: { name: 'Max HP Up', icon: '❤️', desc: '+20 Max HP and heal 20', effect: (p) => { p.maxHp += 20; p.hp = Math.min(p.hp + 20, p.maxHp); } },
    speed: { name: 'Speed Boost', icon: '👟', desc: '+15% movement speed', effect: (p) => { p.speed *= 1.15; } },
    armor: { name: 'Armor Up', icon: '🛡️', desc: 'Reduce damage by 5', effect: (p) => { p.armor += 5; } },
    magnet: { name: 'Magnet', icon: '🧲', desc: '+40% pickup radius', effect: (p) => { p.pickupRadius *= 1.4; } },
    regen: { name: 'Regeneration', icon: '💚', desc: 'Recover 1 HP/sec', effect: (p) => { p.regen += 1; } },
    might: { name: 'Might', icon: '💪', desc: '+15% all damage', effect: (p) => { p.mightMult *= 1.15; } },
};

// ============================================================
// PARTICLE
// ============================================================
class Particle {
    constructor(x, y, vx, vy, life, size, color, type = 'circle') {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life; this.size = size; this.color = color; this.type = type;
    }
    update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; this.vx *= 0.98; this.vy *= 0.98; this.life -= dt; return this.life > 0; }
    draw(ctx, cam) {
        const a = clamp(this.life / this.maxLife, 0, 1), sx = this.x - cam.x, sy = this.y - cam.y;
        ctx.globalAlpha = a; ctx.fillStyle = this.color;
        if (this.type === 'circle') { ctx.beginPath(); ctx.arc(sx, sy, this.size * a, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillRect(sx - this.size / 2, sy - this.size / 2, this.size, this.size); }
        ctx.globalAlpha = 1;
    }
}

// ============================================================
// DAMAGE NUMBER
// ============================================================
class DamageNumber {
    constructor(x, y, value, color = '#fff') { this.x = x; this.y = y; this.value = value; this.color = color; this.life = 0.8; this.maxLife = 0.8; this.vy = -60; }
    update(dt) { this.y += this.vy * dt; this.vy *= 0.95; this.life -= dt; return this.life > 0; }
    draw(ctx, cam) {
        const a = clamp(this.life / this.maxLife, 0, 1), sx = this.x - cam.x, sy = this.y - cam.y, sc = 1 + (1 - a) * 0.3;
        ctx.globalAlpha = a; ctx.fillStyle = this.color; ctx.font = `bold ${Math.floor(14 * sc)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(Math.floor(this.value), sx, sy); ctx.globalAlpha = 1;
    }
}

// ============================================================
// GEM (XP Pickup)
// ============================================================
class Gem {
    constructor(x, y, value) { this.x = x; this.y = y; this.value = value; this.size = Math.min(4 + value, 10); this.bobPhase = Math.random() * Math.PI * 2; this.attracted = false; this.color = value >= 10 ? '#44aaff' : value >= 5 ? '#44ff88' : '#44ff44'; }
    update(dt, player) {
        this.bobPhase += dt * 3;
        const d = dist(this, player);
        if (d < player.pickupRadius || this.attracted) { this.attracted = true; const a = angle(this, player); this.x += Math.cos(a) * 500 * dt; this.y += Math.sin(a) * 500 * dt; if (d < 15) return true; }
        return false;
    }
    draw(ctx, cam) {
        const sx = this.x - cam.x, sy = this.y - cam.y + Math.sin(this.bobPhase) * 3;
        ctx.globalAlpha = 0.3; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(sx, sy, this.size + 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(sx, sy - this.size); ctx.lineTo(sx + this.size * 0.7, sy); ctx.lineTo(sx, sy + this.size * 0.6); ctx.lineTo(sx - this.size * 0.7, sy); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(sx - 1, sy - 2, this.size * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
}

// ============================================================
// WEAPON INSTANCE
// ============================================================
class Weapon {
    constructor(id) { const d = WEAPON_DEFS[id]; this.id = id; this.name = d.name; this.icon = d.icon; this.type = d.type; this.level = 1; this.maxLevel = d.maxLevel; this.color = d.color; this.timer = 0; this.orbitAngle = 0; }
    getDamage() { const d = WEAPON_DEFS[this.id]; return d.baseDamage + d.evolvePerLevel.damage * (this.level - 1); }
    getCooldown() { const d = WEAPON_DEFS[this.id]; let cd = d.baseCooldown; if (d.evolvePerLevel.cooldownMult) cd *= Math.pow(d.evolvePerLevel.cooldownMult, this.level - 1); return cd; }
    getCount() { const d = WEAPON_DEFS[this.id]; return Math.floor(d.baseCount + (d.evolvePerLevel.count || 0) * (this.level - 1)); }
}

// ============================================================
// ENEMY
// ============================================================
class Enemy {
    constructor(type, x, y, timeScale) {
        const d = ENEMY_TYPES[type]; this.type = type; this.x = x; this.y = y;
        this.hp = d.hp * timeScale; this.maxHp = this.hp; this.speed = d.speed; this.size = d.size;
        this.damage = d.damage * Math.max(1, timeScale * 0.7); this.xp = d.xp; this.color = d.color;
        this.alpha = d.alpha || 1; this.isBoss = d.isBoss || false; this.hitFlash = 0; this.knockbackX = 0; this.knockbackY = 0;
    }
    update(dt, player) {
        this.x += this.knockbackX * dt; this.y += this.knockbackY * dt; this.knockbackX *= 0.9; this.knockbackY *= 0.9;
        const a = angle(this, player); this.x += Math.cos(a) * this.speed * dt; this.y += Math.sin(a) * this.speed * dt;
        this.hitFlash = Math.max(0, this.hitFlash - dt * 8);
    }
    draw(ctx, cam) {
        const sx = this.x - cam.x, sy = this.y - cam.y;
        ctx.globalAlpha = 0.3 * this.alpha; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy + this.size, this.size * 0.8, this.size * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.hitFlash > 0 ? '#fff' : this.color; ctx.beginPath(); ctx.arc(sx, sy, this.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = this.hitFlash > 0 ? '#fff' : shadeColor(this.color, -30); ctx.beginPath(); ctx.arc(sx, sy, this.size * 0.65, 0, Math.PI * 2); ctx.fill();
        if (!this.hitFlash) { ctx.fillStyle = this.isBoss ? '#ff0' : '#ff3333'; ctx.beginPath(); ctx.arc(sx - this.size * 0.3, sy - this.size * 0.2, this.size * 0.18, 0, Math.PI * 2); ctx.arc(sx + this.size * 0.3, sy - this.size * 0.2, this.size * 0.18, 0, Math.PI * 2); ctx.fill(); }
        if (this.isBoss || this.hp < this.maxHp) { const bw = this.size * 2, bh = 3, by = sy - this.size - 8; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - bw / 2, by, bw, bh); ctx.fillStyle = this.isBoss ? '#ff4444' : '#44ff44'; ctx.fillRect(sx - bw / 2, by, bw * (this.hp / this.maxHp), bh); }
        ctx.globalAlpha = 1;
    }
    takeDamage(amount, knockAngle = null) {
        this.hp -= amount; this.hitFlash = 1;
        if (knockAngle !== null) { const f = this.isBoss ? 50 : 200; this.knockbackX = Math.cos(knockAngle) * f; this.knockbackY = Math.sin(knockAngle) * f; }
        return this.hp <= 0;
    }
}

// ============================================================
// PROJECTILE
// ============================================================
class Projectile {
    constructor(x, y, vx, vy, damage, color, size, pierce = 1, lifetime = 3) { this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.damage = damage; this.color = color; this.size = size; this.pierce = pierce; this.lifetime = lifetime; this.hitEnemies = new Set(); this.trail = []; }
    update(dt) { this.trail.push({ x: this.x, y: this.y }); if (this.trail.length > 5) this.trail.shift(); this.x += this.vx * dt; this.y += this.vy * dt; this.lifetime -= dt; return this.lifetime > 0; }
    draw(ctx, cam) {
        for (let i = 0; i < this.trail.length; i++) { const t = this.trail[i]; ctx.globalAlpha = (i / this.trail.length) * 0.4; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(t.x - cam.x, t.y - cam.y, this.size * 0.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1; ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(this.x - cam.x, this.y - cam.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
}

// ============================================================
// ZONE EFFECT
// ============================================================
class ZoneEffect {
    constructor(x, y, radius, damage, duration, color) { this.x = x; this.y = y; this.radius = radius; this.damage = damage; this.duration = duration; this.maxDuration = duration; this.color = color; this.tickTimer = 0; }
    update(dt) { this.duration -= dt; this.tickTimer -= dt; return this.duration > 0; }
    draw(ctx, cam) {
        const a = clamp(this.duration / this.maxDuration, 0, 1) * 0.4, sx = this.x - cam.x, sy = this.y - cam.y;
        ctx.globalAlpha = a; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(sx, sy, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a * 0.8; ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, this.radius, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
}

// ============================================================
// MOBILE JOYSTICK CONTROLLER
// ============================================================
class JoystickController {
    constructor() {
        this.zone = document.getElementById('joystick-zone');
        this.base = document.getElementById('joystick-base');
        this.stick = document.getElementById('joystick-stick');
        this.active = false;
        this.touchId = null;
        this.originX = 0;
        this.originY = 0;
        this.dx = 0;
        this.dy = 0;
        this.maxDist = 55;
        this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        if (this.isMobile) {
            this.zone.classList.add('active');
            this.bindTouch();
        }
    }

    bindTouch() {
        this.zone.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.touchId !== null) return;
            const t = e.changedTouches[0];
            this.touchId = t.identifier;
            this.originX = t.clientX;
            this.originY = t.clientY;
            this.active = true;

            this.base.style.display = 'block';
            this.stick.style.display = 'block';
            this.base.style.left = (this.originX - 65) + 'px';
            this.base.style.top = (this.originY - 65) + 'px';
            this.stick.style.left = (this.originX - 28) + 'px';
            this.stick.style.top = (this.originY - 28) + 'px';
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (!this.active) return;
            for (const t of e.changedTouches) {
                if (t.identifier !== this.touchId) continue;
                let rawDx = t.clientX - this.originX;
                let rawDy = t.clientY - this.originY;
                const d = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
                if (d > this.maxDist) {
                    rawDx = (rawDx / d) * this.maxDist;
                    rawDy = (rawDy / d) * this.maxDist;
                }
                this.dx = rawDx / this.maxDist;
                this.dy = rawDy / this.maxDist;
                this.stick.style.left = (this.originX + rawDx - 28) + 'px';
                this.stick.style.top = (this.originY + rawDy - 28) + 'px';
            }
        }, { passive: false });

        const endTouch = (e) => {
            for (const t of e.changedTouches) {
                if (t.identifier !== this.touchId) continue;
                this.active = false;
                this.touchId = null;
                this.dx = 0;
                this.dy = 0;
                this.base.style.display = 'none';
                this.stick.style.display = 'none';
            }
        };
        window.addEventListener('touchend', endTouch);
        window.addEventListener('touchcancel', endTouch);
    }

    getInput() {
        return { x: this.dx, y: this.dy };
    }
}

// ============================================================
// MAIN GAME
// ============================================================
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.miniCanvas = document.getElementById('minimap');
        this.miniCtx = this.miniCanvas.getContext('2d');
        this.audio = new AudioManager();
        this.joystick = new JoystickController();

        this.keys = {};
        this.lastFacing = { x: 1, y: 0 };
        this.screenShake = { x: 0, y: 0, intensity: 0 };
        this.state = 'menu';
        this.paused = false;

        this.resize();
        this.bindEvents();
        this.bindPauseEvents();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.miniCanvas.width = this.joystick.isMobile ? 70 : 90;
        this.miniCanvas.height = this.joystick.isMobile ? 70 : 90;
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
            // Pause on Escape or P
            if ((e.key === 'Escape' || e.key.toLowerCase() === 'p') && (this.state === 'playing' || this.paused)) {
                e.preventDefault();
                this.togglePause();
            }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    }

    bindPauseEvents() {
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('resume-btn').addEventListener('click', () => this.resumeGame());
        document.getElementById('pause-lobby-btn').addEventListener('click', () => this.pauseBackToLobby());
        document.getElementById('sfx-toggle').addEventListener('click', () => this.audio.toggleSfx());
        document.getElementById('music-toggle').addEventListener('click', () => this.audio.toggleMusic());
        document.getElementById('pause-sfx-btn').addEventListener('click', () => this.audio.toggleSfx());
        document.getElementById('pause-music-btn').addEventListener('click', () => this.audio.toggleMusic());
    }

    togglePause() {
        if (this.state === 'upgrading' || this.state === 'gameover' || this.state === 'menu') return;
        if (this.paused) {
            this.resumeGame();
        } else {
            this.pauseGame();
        }
    }

    pauseGame() {
        if (this.state !== 'playing') return;
        this.paused = true;
        this.state = 'paused';
        document.getElementById('pause-screen').classList.add('active');
    }

    resumeGame() {
        if (!this.paused) return;
        this.paused = false;
        this.state = 'playing';
        document.getElementById('pause-screen').classList.remove('active');
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    pauseBackToLobby() {
        this.paused = false;
        this.state = 'menu';
        this.audio.stopMusic();
        document.getElementById('pause-screen').classList.remove('active');
        this.showHUD(false);
        if (typeof social !== 'undefined') {
            social.backToLobby();
        }
    }

    requestFullscreen() {
        if (!this.joystick.isMobile) return;
        const el = document.documentElement;
        const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
        if (rfs) {
            rfs.call(el).catch(() => {});
        }
        // Try to lock orientation to landscape
        try {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => {});
            }
        } catch (e) {}
    }

    showHUD(visible) {
        const ids = ['hud', 'hp-text', 'hp-bar-container', 'minimap'];
        ids.forEach(id => document.getElementById(id).classList.toggle('hidden', !visible));
        // Pause button & audio controls
        document.getElementById('pause-btn').classList.toggle('active', visible);
        document.getElementById('audio-controls').classList.toggle('active', visible);
        if (this.joystick.isMobile) {
            document.getElementById('joystick-zone').classList.toggle('active', visible);
        }
    }

    startGame() {
        this.audio.init();
        this.audio.startMusic();
        this.audio.updateSoundButtons();
        this.showHUD(true);
        this.requestFullscreen();

        this.paused = false;
        document.getElementById('pause-screen').classList.remove('active');

        this.player = {
            x: CONFIG.WORLD_SIZE / 2, y: CONFIG.WORLD_SIZE / 2,
            hp: CONFIG.PLAYER_MAX_HP, maxHp: CONFIG.PLAYER_MAX_HP,
            speed: CONFIG.PLAYER_SPEED, xp: 0, level: 1,
            pickupRadius: CONFIG.PLAYER_PICKUP_RADIUS, armor: 0, regen: 0, mightMult: 1,
            invincibleTimer: 0, weapons: [], passiveUpgrades: {}
        };
        this.player.weapons.push(new Weapon('magicOrb'));

        this.camera = { x: this.player.x - this.canvas.width / 2, y: this.player.y - this.canvas.height / 2 };
        this.enemies = []; this.projectiles = []; this.gems = []; this.particles = [];
        this.damageNumbers = []; this.zones = []; this.lightnings = [];
        this.gameTime = 0; this.kills = 0; this.enemySpawnTimer = 0;
        this.bossTimer = CONFIG.BOSS_INTERVAL; this.difficultyScale = 1;

        this.state = 'playing';
        this.lastTime = performance.now();
        this.updateWeaponIcons();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    // ========================================================
    // GAME LOOP
    // ========================================================
    gameLoop(timestamp) {
        if (this.state === 'menu' || this.state === 'paused') return;
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;
        if (this.state === 'playing') this.update(dt);
        this.render();
        this.updateHUD();
        if (this.state !== 'gameover' && this.state !== 'menu' && this.state !== 'paused') requestAnimationFrame((t) => this.gameLoop(t));
    }

    // ========================================================
    // UPDATE
    // ========================================================
    update(dt) {
        this.gameTime += dt;
        this.difficultyScale = 1 + this.gameTime / 60;
        this.updatePlayer(dt);
        this.updateWeapons(dt);
        this.updateProjectiles(dt);
        this.updateZones(dt);
        this.updateEnemies(dt);
        this.updateGems(dt);
        this.particles = this.particles.filter(p => p.update(dt));
        this.damageNumbers = this.damageNumbers.filter(d => d.update(dt));
        this.lightnings = this.lightnings.filter(l => { l.life -= dt; return l.life > 0; });
        this.spawnEnemies(dt);
        this.updateCamera(dt);
        this.screenShake.intensity *= 0.9;
        if (this.screenShake.intensity < 0.5) this.screenShake.intensity = 0;
        this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity;
        this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity;
        if (this.player.regen > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.regen * dt);
    }

    updatePlayer(dt) {
        const p = this.player;
        let dx = 0, dy = 0;

        // Keyboard
        if (this.keys['w'] || this.keys['arrowup']) dy = -1;
        if (this.keys['s'] || this.keys['arrowdown']) dy = 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx = -1;
        if (this.keys['d'] || this.keys['arrowright']) dx = 1;

        // Mobile joystick (overrides if active)
        if (this.joystick.active) {
            const j = this.joystick.getInput();
            dx = j.x; dy = j.y;
        }

        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 1) { dx /= len; dy /= len; }
            this.lastFacing = { x: dx / Math.max(Math.abs(dx), Math.abs(dy), 0.01), y: dy / Math.max(Math.abs(dx), Math.abs(dy), 0.01) };
        }

        p.x += dx * p.speed * dt;
        p.y += dy * p.speed * dt;
        p.x = clamp(p.x, 30, CONFIG.WORLD_SIZE - 30);
        p.y = clamp(p.y, 30, CONFIG.WORLD_SIZE - 30);
        p.invincibleTimer = Math.max(0, p.invincibleTimer - dt * 1000);
    }

    // ========================================================
    // WEAPONS
    // ========================================================
    updateWeapons(dt) {
        for (const w of this.player.weapons) {
            w.timer -= dt * 1000;
            switch (w.type) {
                case 'orbit': this.updateOrbitWeapon(w, dt); break;
                case 'projectile': if (w.timer <= 0) { this.fireProjectileWeapon(w); w.timer = w.getCooldown(); } break;
                case 'lightning': if (w.timer <= 0) { this.fireLightning(w); w.timer = w.getCooldown(); } break;
                case 'zone': if (w.timer <= 0) { this.dropZone(w); w.timer = w.getCooldown(); } break;
                case 'aura': if (w.timer <= 0) { this.pulseAura(w); w.timer = w.getCooldown(); } break;
                case 'fireball': if (w.timer <= 0) { this.fireFireball(w); w.timer = w.getCooldown(); } break;
            }
        }
    }

    updateOrbitWeapon(w, dt) {
        w.orbitAngle += dt * 2.5;
        const count = w.getCount(), radius = 80 + w.level * 8, damage = w.getDamage() * this.player.mightMult, p = this.player;
        for (let i = 0; i < count; i++) {
            const a = w.orbitAngle + (Math.PI * 2 / count) * i;
            const ox = p.x + Math.cos(a) * radius, oy = p.y + Math.sin(a) * radius;
            for (const e of this.enemies) {
                if (dist({ x: ox, y: oy }, e) < 18 + e.size) {
                    if (!e._orbHitTimer || e._orbHitTimer <= 0) {
                        if (e.takeDamage(damage, angle(p, e))) this.killEnemy(e); else this.audio.play('hit');
                        this.addDamageNumber(e.x, e.y - e.size, damage, w.color); e._orbHitTimer = 0.3;
                    }
                }
                if (e._orbHitTimer > 0) e._orbHitTimer -= dt;
            }
        }
    }

    fireProjectileWeapon(w) {
        const p = this.player, count = w.getCount(), damage = w.getDamage() * p.mightMult, spd = 500;
        for (let i = 0; i < count; i++) {
            const spread = (i - (count - 1) / 2) * 0.15, dir = Math.atan2(this.lastFacing.y, this.lastFacing.x) + spread;
            this.projectiles.push(new Projectile(p.x, p.y, Math.cos(dir) * spd, Math.sin(dir) * spd, damage, w.color, 4, 1 + Math.floor(w.level / 3), 2));
        }
        this.audio.play('hit');
    }

    fireLightning(w) {
        const p = this.player, count = w.getCount(), damage = w.getDamage() * p.mightMult;
        const sorted = [...this.enemies].sort((a, b) => dist(a, p) - dist(b, p)).slice(0, count);
        for (const t of sorted) {
            if (t.takeDamage(damage, null)) this.killEnemy(t);
            this.addDamageNumber(t.x, t.y - t.size, damage, '#ffee44');
            this.lightnings.push({ x1: p.x, y1: p.y, x2: t.x, y2: t.y, life: 0.2, maxLife: 0.2 });
            for (let i = 0; i < 5; i++) this.addParticle(t.x, t.y, '#ffee44', 80, 0.3, 3);
        }
        if (sorted.length) this.audio.play('hit');
    }

    dropZone(w) {
        const p = this.player, count = w.getCount(), damage = w.getDamage() * p.mightMult;
        for (let i = 0; i < count; i++) {
            let tx, ty;
            if (this.enemies.length > 0) { const t = randChoice(this.enemies); tx = t.x + rand(-40, 40); ty = t.y + rand(-40, 40); }
            else { const a = Math.random() * Math.PI * 2, d = rand(50, 150); tx = p.x + Math.cos(a) * d; ty = p.y + Math.sin(a) * d; }
            this.zones.push(new ZoneEffect(tx, ty, 50 + w.level * 5, damage, 3, w.color));
        }
    }

    pulseAura(w) {
        const p = this.player, damage = w.getDamage() * p.mightMult, radius = 80 * Math.pow(WEAPON_DEFS[w.id].evolvePerLevel.radiusMult || 1, w.level - 1);
        for (const e of this.enemies) {
            if (dist(e, p) < radius + e.size) {
                if (e.takeDamage(damage, angle(p, e))) this.killEnemy(e); else this.audio.play('hit');
                this.addDamageNumber(e.x, e.y - e.size, damage, w.color);
            }
        }
    }

    fireFireball(w) {
        const p = this.player, count = w.getCount(), damage = w.getDamage() * p.mightMult, spd = 250;
        for (let i = 0; i < count; i++) {
            const dir = this.enemies.length > 0 ? angle(p, randChoice(this.enemies)) : Math.random() * Math.PI * 2;
            const proj = new Projectile(p.x, p.y, Math.cos(dir) * spd, Math.sin(dir) * spd, damage, w.color, 8, 1, 3);
            proj.isFireball = true; proj.explosionRadius = 60 + w.level * 5; this.projectiles.push(proj);
        }
        this.audio.play('hit');
    }

    // ========================================================
    // PROJECTILES
    // ========================================================
    updateProjectiles(dt) {
        this.projectiles = this.projectiles.filter(proj => {
            if (!proj.update(dt)) return false;
            for (const e of this.enemies) {
                if (proj.hitEnemies.has(e)) continue;
                if (dist(proj, e) < proj.size + e.size) {
                    proj.hitEnemies.add(e);
                    if (proj.isFireball) { this.explodeFireball(proj); return false; }
                    if (e.takeDamage(proj.damage, angle(this.player, e))) this.killEnemy(e); else this.audio.play('hit');
                    this.addDamageNumber(e.x, e.y - e.size, proj.damage, proj.color);
                    proj.pierce--; if (proj.pierce <= 0) return false;
                }
            }
            return true;
        });
    }

    explodeFireball(proj) {
        for (const e of this.enemies) {
            if (dist(proj, e) < proj.explosionRadius + e.size) {
                if (e.takeDamage(proj.damage, angle(proj, e))) this.killEnemy(e);
                this.addDamageNumber(e.x, e.y - e.size, proj.damage, '#ff6622');
            }
        }
        for (let i = 0; i < 20; i++) this.addParticle(proj.x, proj.y, randChoice(['#ff6622','#ff4400','#ffaa00']), rand(50, 200), rand(0.3, 0.6), rand(3, 8));
        this.screenShake.intensity = 8; this.audio.play('kill');
    }

    // ========================================================
    // ZONES
    // ========================================================
    updateZones(dt) {
        this.zones = this.zones.filter(z => {
            if (!z.update(dt)) return false;
            if (z.tickTimer <= 0) { z.tickTimer = 0.5; for (const e of this.enemies) { if (dist(z, e) < z.radius + e.size) { if (e.takeDamage(z.damage * this.player.mightMult, null)) this.killEnemy(e); this.addDamageNumber(e.x + rand(-10, 10), e.y - e.size, z.damage, z.color); } } }
            return true;
        });
    }

    // ========================================================
    // ENEMIES
    // ========================================================
    updateEnemies(dt) {
        const p = this.player;
        this.enemies = this.enemies.filter(e => {
            if (e.hp <= 0) return false;
            e.update(dt, p);
            if (p.invincibleTimer <= 0 && dist(e, p) < e.size + 16) {
                const dmg = Math.max(1, e.damage - p.armor); p.hp -= dmg; p.invincibleTimer = CONFIG.PLAYER_INVINCIBLE_TIME;
                this.addDamageNumber(p.x, p.y - 30, dmg, '#ff4444'); this.screenShake.intensity = 10; this.audio.play('playerHit');
                document.getElementById('kill-flash').style.background = 'rgba(255,0,0,0.2)'; setTimeout(() => document.getElementById('kill-flash').style.background = 'rgba(255,0,0,0)', 100);
                if (p.hp <= 0) { this.gameOver(); return false; }
            }
            return true;
        });
    }

    spawnEnemies(dt) {
        this.enemySpawnTimer -= dt; this.bossTimer -= dt;
        const rate = Math.max(CONFIG.MIN_ENEMY_SPAWN_RATE, CONFIG.BASE_ENEMY_SPAWN_RATE - this.gameTime * 0.008);
        if (this.enemySpawnTimer <= 0 && this.enemies.length < CONFIG.MAX_ENEMIES) {
            this.enemySpawnTimer = rate;
            const p = this.player, c = Math.floor(1 + this.gameTime / 30);
            for (let i = 0; i < c; i++) {
                const a = Math.random() * Math.PI * 2, d = rand(500, 800);
                const r = Math.random();
                let type;
                if (this.gameTime < 30) type = r < 0.7 ? 'zombie' : 'bat';
                else if (this.gameTime < 90) type = r < 0.4 ? 'zombie' : r < 0.65 ? 'bat' : r < 0.85 ? 'skeleton' : 'ghost';
                else type = r < 0.2 ? 'zombie' : r < 0.35 ? 'bat' : r < 0.55 ? 'skeleton' : r < 0.75 ? 'ghost' : 'demon';
                this.enemies.push(new Enemy(type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, this.difficultyScale));
            }
        }
        if (this.bossTimer <= 0) {
            this.bossTimer = CONFIG.BOSS_INTERVAL;
            const a = Math.random() * Math.PI * 2;
            this.enemies.push(new Enemy('boss', this.player.x + Math.cos(a) * 600, this.player.y + Math.sin(a) * 600, this.difficultyScale));
            this.audio.play('boss'); this.screenShake.intensity = 15;
            document.getElementById('kill-flash').style.background = 'rgba(255,0,0,0.15)'; setTimeout(() => document.getElementById('kill-flash').style.background = 'rgba(255,0,0,0)', 200);
        }
    }

    killEnemy(e) {
        e.hp = 0; this.kills++; this.audio.play('kill');
        this.gems.push(new Gem(e.x, e.y, e.xp));
        const pc = e.isBoss ? 30 : 8;
        for (let i = 0; i < pc; i++) this.addParticle(e.x, e.y, e.color, rand(40, 150), rand(0.2, 0.5), rand(2, e.isBoss ? 8 : 5));
        this.screenShake.intensity = Math.min(15, this.screenShake.intensity + (e.isBoss ? 12 : 2));
    }

    // ========================================================
    // GEMS & XP
    // ========================================================
    updateGems(dt) {
        this.gems = this.gems.filter(g => {
            if (g.update(dt, this.player)) {
                this.player.xp += g.value; this.audio.play('pickup');
                for (let i = 0; i < 3; i++) this.addParticle(g.x, g.y, g.color, 50, 0.3, 2);
                this.checkLevelUp(); return false;
            }
            return true;
        });
    }

    checkLevelUp() {
        const p = this.player, needed = this.getXpToNextLevel(p.level);
        while (p.xp >= needed) {
            p.xp -= needed; p.level++; this.audio.play('levelup'); this.screenShake.intensity = 10;
            document.getElementById('kill-flash').style.background = 'rgba(255,215,0,0.3)'; setTimeout(() => document.getElementById('kill-flash').style.background = 'rgba(255,215,0,0)', 300);
            for (let i = 0; i < 20; i++) this.addParticle(p.x, p.y, '#ffd700', rand(80, 200), rand(0.5, 1), rand(2, 5));
            this.showUpgradeScreen(); return;
        }
    }

    getXpToNextLevel(lv) { return lv < CONFIG.XP_TO_LEVEL.length ? CONFIG.XP_TO_LEVEL[lv] : Math.floor(100 + lv * lv * 8); }

    // ========================================================
    // UPGRADE SCREEN
    // ========================================================
    showUpgradeScreen() {
        this.state = 'upgrading';
        const screen = document.getElementById('upgrade-screen'), opts = document.getElementById('upgrade-options');
        screen.classList.add('active'); opts.innerHTML = '';
        this.generateUpgradeOptions(3).forEach(opt => {
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `${opt.isNew ? '<div class="new-badge">NEW</div>' : ''}<div class="icon">${opt.icon}</div><div class="name">${opt.name}${opt.levelText ? ` <span style="color:#ffd700">${opt.levelText}</span>` : ''}</div><div class="desc">${opt.desc}</div>`;
            card.addEventListener('click', () => { opt.apply(); screen.classList.remove('active'); this.state = 'playing'; this.updateWeaponIcons(); });
            card.addEventListener('touchend', (e) => { e.preventDefault(); opt.apply(); screen.classList.remove('active'); this.state = 'playing'; this.updateWeaponIcons(); });
            opts.appendChild(card);
        });
    }

    generateUpgradeOptions(count) {
        const options = [], p = this.player, owned = p.weapons.map(w => w.id);
        for (const w of p.weapons) { if (w.level < w.maxLevel) options.push({ icon: w.icon, name: w.name, levelText: `Lv ${w.level}→${w.level+1}`, desc: 'Increases damage & power.', isNew: false, weight: 3, apply: () => { w.level++; } }); }
        if (p.weapons.length < 6) { for (const [id, def] of Object.entries(WEAPON_DEFS)) { if (!owned.includes(id)) options.push({ icon: def.icon, name: def.name, levelText: 'NEW', desc: def.desc, isNew: true, weight: 2, apply: () => { p.weapons.push(new Weapon(id)); } }); } }
        for (const [id, def] of Object.entries(PASSIVE_UPGRADES)) { const c = p.passiveUpgrades[id] || 0; if (c < 5) options.push({ icon: def.icon, name: def.name, levelText: c > 0 ? `x${c+1}` : '', desc: def.desc, isNew: false, weight: 1, apply: () => { def.effect(p); p.passiveUpgrades[id] = (p.passiveUpgrades[id] || 0) + 1; } }); }
        for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
        options.sort((a, b) => (b.weight + Math.random()) - (a.weight + Math.random()));
        return options.slice(0, count);
    }

    // ========================================================
    // CAMERA
    // ========================================================
    updateCamera(dt) {
        this.camera.x = lerp(this.camera.x, this.player.x - this.canvas.width / 2, CONFIG.CAMERA_SMOOTH);
        this.camera.y = lerp(this.camera.y, this.player.y - this.canvas.height / 2, CONFIG.CAMERA_SMOOTH);
    }

    // ========================================================
    // RENDER
    // ========================================================
    render() {
        const ctx = this.ctx, cam = { x: this.camera.x + this.screenShake.x, y: this.camera.y + this.screenShake.y };
        const W = this.canvas.width, H = this.canvas.height;
        ctx.fillStyle = '#111118'; ctx.fillRect(0, 0, W, H);
        this.drawGrid(ctx, cam, W, H);
        this.drawWorldBorder(ctx, cam);
        for (const z of this.zones) z.draw(ctx, cam);
        for (const g of this.gems) { const sx = g.x - cam.x, sy = g.y - cam.y; if (sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50) g.draw(ctx, cam); }
        for (const e of this.enemies) { const sx = e.x - cam.x, sy = e.y - cam.y; if (sx > -100 && sx < W + 100 && sy > -100 && sy < H + 100) e.draw(ctx, cam); }
        this.drawPlayer(ctx, cam);
        this.drawOrbitWeapons(ctx, cam);
        this.drawAuraWeapons(ctx, cam);
        for (const p of this.projectiles) { const sx = p.x - cam.x, sy = p.y - cam.y; if (sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50) p.draw(ctx, cam); }
        for (const l of this.lightnings) this.drawLightning(ctx, cam, l);
        for (const p of this.particles) p.draw(ctx, cam);
        for (const d of this.damageNumbers) d.draw(ctx, cam);
        this.drawMinimap();
    }

    drawGrid(ctx, cam, W, H) {
        const gs = CONFIG.GRID_SIZE, sx = Math.floor(cam.x / gs) * gs, sy = Math.floor(cam.y / gs) * gs;
        ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
        for (let x = sx; x < cam.x + W + gs; x += gs) { ctx.beginPath(); ctx.moveTo(x - cam.x, 0); ctx.lineTo(x - cam.x, H); ctx.stroke(); }
        for (let y = sy; y < cam.y + H + gs; y += gs) { ctx.beginPath(); ctx.moveTo(0, y - cam.y); ctx.lineTo(W, y - cam.y); ctx.stroke(); }
    }

    drawWorldBorder(ctx, cam) {
        ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 3; ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 15;
        ctx.strokeRect(-cam.x, -cam.y, CONFIG.WORLD_SIZE, CONFIG.WORLD_SIZE); ctx.shadowBlur = 0;
    }

    drawPlayer(ctx, cam) {
        const p = this.player, sx = p.x - cam.x, sy = p.y - cam.y;
        ctx.globalAlpha = 0.08; ctx.fillStyle = '#00bfff'; ctx.beginPath(); ctx.arc(sx, sy, p.pickupRadius, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(sx, sy + 16, 14, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        if (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer / 80) % 2 === 0) ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#4488ff'; ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6aadff'; ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fill();
        const ex = this.lastFacing.x * 4, ey = this.lastFacing.y * 4;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx - 4 + ex, sy - 3 + ey, 3, 0, Math.PI * 2); ctx.arc(sx + 4 + ex, sy - 3 + ey, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(sx - 4 + ex * 1.2, sy - 3 + ey * 1.2, 1.5, 0, Math.PI * 2); ctx.arc(sx + 4 + ex * 1.2, sy - 3 + ey * 1.2, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.globalAlpha = 0.1; ctx.fillStyle = '#4488ff'; ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;

        // Player name tag
        if (typeof social !== 'undefined' && social.user) {
            ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
            const displayName = social.clan ? `[${social.clan.tag}] ${social.user.name}` : social.user.name;
            ctx.fillText(displayName, sx, sy - 24);
            ctx.globalAlpha = 1;
        }
    }

    drawOrbitWeapons(ctx, cam) {
        const p = this.player;
        for (const w of p.weapons) {
            if (w.type !== 'orbit') continue;
            const count = w.getCount(), radius = 80 + w.level * 8;
            for (let i = 0; i < count; i++) {
                const a = w.orbitAngle + (Math.PI * 2 / count) * i;
                const ox = p.x + Math.cos(a) * radius - cam.x, oy = p.y + Math.sin(a) * radius - cam.y;
                ctx.globalAlpha = 0.3; ctx.fillStyle = w.color; ctx.beginPath(); ctx.arc(ox, oy, 14, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1; ctx.fillStyle = w.color; ctx.shadowColor = w.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(ox, oy, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(ox - 2, oy - 2, 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
            }
        }
    }

    drawAuraWeapons(ctx, cam) {
        const p = this.player;
        for (const w of p.weapons) {
            if (w.type !== 'aura') continue;
            const radius = 80 * Math.pow(WEAPON_DEFS[w.id].evolvePerLevel.radiusMult || 1, w.level - 1);
            const sx = p.x - cam.x, sy = p.y - cam.y;
            ctx.globalAlpha = 0.08; ctx.fillStyle = w.color; ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 0.2; ctx.strokeStyle = w.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        }
    }

    drawLightning(ctx, cam, l) {
        const alpha = l.life / l.maxLife;
        ctx.globalAlpha = alpha; ctx.strokeStyle = '#ffee44'; ctx.lineWidth = 3; ctx.shadowColor = '#ffee44'; ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.moveTo(l.x1 - cam.x, l.y1 - cam.y);
        const tx = l.x2 - cam.x, ty = l.y2 - cam.y;
        for (let i = 1; i <= 6; i++) { const t = i / 6; ctx.lineTo(lerp(l.x1 - cam.x, tx, t) + (i < 6 ? rand(-20, 20) : 0), lerp(l.y1 - cam.y, ty, t) + (i < 6 ? rand(-20, 20) : 0)); }
        ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    drawMinimap() {
        const mc = this.miniCtx, mw = this.miniCanvas.width, mh = this.miniCanvas.height, sc = mw / CONFIG.WORLD_SIZE;
        mc.fillStyle = 'rgba(0,0,0,0.7)'; mc.fillRect(0, 0, mw, mh);
        mc.fillStyle = 'rgba(255,60,60,0.6)';
        for (const e of this.enemies) mc.fillRect(e.x * sc, e.y * sc, e.isBoss ? 3 : 1, e.isBoss ? 3 : 1);
        mc.fillStyle = '#4488ff'; mc.beginPath(); mc.arc(this.player.x * sc, this.player.y * sc, 3, 0, Math.PI * 2); mc.fill();
        mc.strokeStyle = 'rgba(255,255,255,0.3)'; mc.lineWidth = 1;
        mc.strokeRect(this.camera.x * sc, this.camera.y * sc, this.canvas.width * sc, this.canvas.height * sc);
    }

    // ========================================================
    // HELPERS
    // ========================================================
    addParticle(x, y, color, speed, life, size) {
        if (this.particles.length >= CONFIG.MAX_PARTICLES) return;
        const a = Math.random() * Math.PI * 2, s = rand(speed * 0.5, speed);
        this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, life, size, color, Math.random() > 0.5 ? 'circle' : 'spark'));
    }

    addDamageNumber(x, y, value, color) {
        if (this.damageNumbers.length >= CONFIG.MAX_DAMAGE_NUMBERS) this.damageNumbers.shift();
        this.damageNumbers.push(new DamageNumber(x + rand(-10, 10), y + rand(-5, 5), value, color));
    }

    updateHUD() {
        const p = this.player, needed = this.getXpToNextLevel(p.level);
        document.getElementById('xp-bar').style.width = `${(p.xp / needed) * 100}%`;
        document.getElementById('timer').textContent = formatTime(this.gameTime);
        document.getElementById('level').textContent = p.level;
        document.getElementById('kills').textContent = this.kills;
        document.getElementById('hp-bar').style.width = `${(p.hp / p.maxHp) * 100}%`;
        document.getElementById('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    }

    updateWeaponIcons() {
        const c = document.getElementById('weapon-icons'); c.innerHTML = '';
        for (const w of this.player.weapons) { const d = document.createElement('div'); d.className = 'weapon-icon'; d.innerHTML = `${w.icon}<span class="wlvl">${w.level}</span>`; c.appendChild(d); }
    }

    // ========================================================
    // GAME OVER + Score Submission
    // ========================================================
    async gameOver() {
        this.state = 'gameover';
        this.audio.stopMusic();
        this.showHUD(false);

        const score = Math.floor(this.kills * 10 + this.gameTime * 5 + this.player.level * 50);

        // Submit score to server
        let serverResult = null;
        if (typeof social !== 'undefined' && social.token) {
            serverResult = await social.submitScore(this.gameTime, this.kills, this.player.level);
        }

        document.getElementById('gameover-score').innerHTML = `Score: <span>${score.toLocaleString()}</span>${serverResult && score >= serverResult.bestScore ? ' 🏆 NEW BEST!' : ''}`;
        document.getElementById('gameover-stats').innerHTML = `
            Survived: <span>${formatTime(this.gameTime)}</span><br>
            Enemies Slain: <span>${this.kills}</span><br>
            Level Reached: <span>${this.player.level}</span><br>
            Weapons: <span>${this.player.weapons.map(w => w.icon).join(' ')}</span>
        `;
        document.getElementById('gameover-screen').classList.add('active');
    }
}

// ============================================================
// INITIALIZE
// ============================================================
const game = new Game();
