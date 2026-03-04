// ============================================================
// 🧛 DARK SURVIVORS — Complete Game Engine
// A Vampire Survivors-style bullet hell survival game
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
        this.masterVolume = 0.3;
    }

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            this.enabled = false;
        }
    }

    play(type) {
        if (!this.enabled || !this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            switch (type) {
                case 'hit':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(200, now);
                    osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
                    gain.gain.setValueAtTime(0.08 * this.masterVolume, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                    break;
                case 'kill':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(400, now);
                    osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
                    gain.gain.setValueAtTime(0.06 * this.masterVolume, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                    break;
                case 'levelup':
                    [523, 659, 784, 1047].forEach((freq, i) => {
                        const o = this.ctx.createOscillator();
                        const g = this.ctx.createGain();
                        o.connect(g);
                        g.connect(this.ctx.destination);
                        o.type = 'sine';
                        o.frequency.setValueAtTime(freq, now + i * 0.1);
                        g.gain.setValueAtTime(0.1 * this.masterVolume, now + i * 0.1);
                        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
                        o.start(now + i * 0.1);
                        o.stop(now + i * 0.1 + 0.3);
                    });
                    break;
                case 'pickup':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(600, now);
                    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
                    gain.gain.setValueAtTime(0.06 * this.masterVolume, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                    break;
                case 'playerHit':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
                    gain.gain.setValueAtTime(0.12 * this.masterVolume, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                    osc.start(now);
                    osc.stop(now + 0.25);
                    break;
                case 'boss':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(80, now);
                    osc.frequency.setValueAtTime(60, now + 0.2);
                    osc.frequency.setValueAtTime(80, now + 0.4);
                    gain.gain.setValueAtTime(0.15 * this.masterVolume, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                    osc.start(now);
                    osc.stop(now + 0.6);
                    break;
            }
        } catch (e) {}
    }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function angle(a, b) {
    return Math.atan2(b.y - a.y, b.x - a.x);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function hsl(h, s, l) {
    return `hsl(${h},${s}%,${l}%)`;
}

// ============================================================
// WEAPON DEFINITIONS
// ============================================================
const WEAPON_DEFS = {
    magicOrb: {
        name: 'Magic Orb',
        icon: '🔮',
        desc: 'Orbs orbit around you, damaging enemies on contact.',
        color: '#aa66ff',
        baseDamage: 8,
        baseCooldown: 0,
        baseCount: 2,
        evolvePerLevel: { damage: 5, count: 1 },
        maxLevel: 8,
        type: 'orbit'
    },
    holyWater: {
        name: 'Holy Water',
        icon: '💧',
        desc: 'Drops damaging zones that hurt enemies standing in them.',
        color: '#44aaff',
        baseDamage: 6,
        baseCooldown: 3000,
        baseCount: 1,
        evolvePerLevel: { damage: 4, count: 0.5, cooldownMult: 0.92 },
        maxLevel: 8,
        type: 'zone'
    },
    lightningBolt: {
        name: 'Lightning Bolt',
        icon: '⚡',
        desc: 'Strikes the nearest enemy with chain lightning.',
        color: '#ffee44',
        baseDamage: 15,
        baseCooldown: 1200,
        baseCount: 1,
        evolvePerLevel: { damage: 8, count: 0.34, cooldownMult: 0.9 },
        maxLevel: 8,
        type: 'lightning'
    },
    throwingKnife: {
        name: 'Throwing Knives',
        icon: '🗡️',
        desc: 'Fires fast knives in your movement direction.',
        color: '#cccccc',
        baseDamage: 10,
        baseCooldown: 400,
        baseCount: 1,
        evolvePerLevel: { damage: 4, count: 0.5, cooldownMult: 0.92 },
        maxLevel: 8,
        type: 'projectile'
    },
    garlicAura: {
        name: 'Garlic Aura',
        icon: '🧄',
        desc: 'Passive damage aura that hurts nearby enemies.',
        color: '#88ff88',
        baseDamage: 3,
        baseCooldown: 500,
        baseCount: 1,
        evolvePerLevel: { damage: 2, radiusMult: 1.12 },
        maxLevel: 8,
        type: 'aura'
    },
    fireball: {
        name: 'Fireball',
        icon: '🔥',
        desc: 'Launches explosive fireballs at random enemies.',
        color: '#ff6622',
        baseDamage: 25,
        baseCooldown: 2000,
        baseCount: 1,
        evolvePerLevel: { damage: 12, count: 0.34, cooldownMult: 0.9 },
        maxLevel: 8,
        type: 'fireball'
    }
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
    maxHp: { name: 'Max HP Up', icon: '❤️', desc: '+20 Max HP and heal 20 HP', effect: (p) => { p.maxHp += 20; p.hp = Math.min(p.hp + 20, p.maxHp); } },
    speed: { name: 'Speed Boost', icon: '👟', desc: '+15% movement speed', effect: (p) => { p.speed *= 1.15; } },
    armor: { name: 'Armor Up', icon: '🛡️', desc: 'Reduce incoming damage by 5', effect: (p) => { p.armor += 5; } },
    magnet: { name: 'Magnet', icon: '🧲', desc: '+40% pickup radius', effect: (p) => { p.pickupRadius *= 1.4; } },
    regen: { name: 'Regeneration', icon: '💚', desc: 'Recover 1 HP per second', effect: (p) => { p.regen += 1; } },
    might: { name: 'Might', icon: '💪', desc: '+15% damage on all weapons', effect: (p) => { p.mightMult *= 1.15; } },
};

// ============================================================
// PARTICLE SYSTEM
// ============================================================
class Particle {
    constructor(x, y, vx, vy, life, size, color, type = 'circle') {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life;
        this.size = size; this.color = color;
        this.type = type;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.life -= dt;
        return this.life > 0;
    }

    draw(ctx, cam) {
        const alpha = clamp(this.life / this.maxLife, 0, 1);
        const sx = this.x - cam.x, sy = this.y - cam.y;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        if (this.type === 'circle') {
            ctx.beginPath();
            ctx.arc(sx, sy, this.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'spark') {
            ctx.fillRect(sx - this.size / 2, sy - this.size / 2, this.size, this.size);
        }
        ctx.globalAlpha = 1;
    }
}

// ============================================================
// DAMAGE NUMBER
// ============================================================
class DamageNumber {
    constructor(x, y, value, color = '#fff') {
        this.x = x; this.y = y;
        this.value = value;
        this.color = color;
        this.life = 0.8;
        this.maxLife = 0.8;
        this.vy = -60;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.vy *= 0.95;
        this.life -= dt;
        return this.life > 0;
    }

    draw(ctx, cam) {
        const alpha = clamp(this.life / this.maxLife, 0, 1);
        const sx = this.x - cam.x, sy = this.y - cam.y;
        const scale = 1 + (1 - alpha) * 0.3;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.font = `bold ${Math.floor(14 * scale)}px 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(Math.floor(this.value), sx, sy);
        ctx.globalAlpha = 1;
    }
}

// ============================================================
// XP GEM
// ============================================================
class Gem {
    constructor(x, y, value) {
        this.x = x; this.y = y;
        this.value = value;
        this.size = Math.min(4 + value, 10);
        this.bobPhase = Math.random() * Math.PI * 2;
        this.attracted = false;
        this.color = value >= 10 ? '#44aaff' : value >= 5 ? '#44ff88' : '#44ff44';
    }

    update(dt, player) {
        this.bobPhase += dt * 3;
        const d = dist(this, player);
        if (d < player.pickupRadius || this.attracted) {
            this.attracted = true;
            const a = angle(this, player);
            const speed = 500;
            this.x += Math.cos(a) * speed * dt;
            this.y += Math.sin(a) * speed * dt;
            if (d < 15) return true; // collected
        }
        return false;
    }

    draw(ctx, cam) {
        const sx = this.x - cam.x;
        const sy = this.y - cam.y + Math.sin(this.bobPhase) * 3;
        
        // Glow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(sx, sy, this.size + 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Gem shape
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(sx, sy - this.size);
        ctx.lineTo(sx + this.size * 0.7, sy);
        ctx.lineTo(sx, sy + this.size * 0.6);
        ctx.lineTo(sx - this.size * 0.7, sy);
        ctx.closePath();
        ctx.fill();
        
        // Shine
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(sx - 1, sy - 2, this.size * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// ============================================================
// WEAPON INSTANCES
// ============================================================
class Weapon {
    constructor(id) {
        const def = WEAPON_DEFS[id];
        this.id = id;
        this.name = def.name;
        this.icon = def.icon;
        this.type = def.type;
        this.level = 1;
        this.maxLevel = def.maxLevel;
        this.color = def.color;
        this.timer = 0;
        this.orbitAngle = 0;
        this.zones = [];
    }

    getDamage() {
        const def = WEAPON_DEFS[this.id];
        return def.baseDamage + def.evolvePerLevel.damage * (this.level - 1);
    }

    getCooldown() {
        const def = WEAPON_DEFS[this.id];
        let cd = def.baseCooldown;
        if (def.evolvePerLevel.cooldownMult) {
            cd *= Math.pow(def.evolvePerLevel.cooldownMult, this.level - 1);
        }
        return cd;
    }

    getCount() {
        const def = WEAPON_DEFS[this.id];
        return Math.floor(def.baseCount + (def.evolvePerLevel.count || 0) * (this.level - 1));
    }
}

// ============================================================
// ENEMY CLASS
// ============================================================
class Enemy {
    constructor(type, x, y, timeScale) {
        const def = ENEMY_TYPES[type];
        this.type = type;
        this.x = x; this.y = y;
        this.hp = def.hp * timeScale;
        this.maxHp = this.hp;
        this.speed = def.speed;
        this.size = def.size;
        this.damage = def.damage * Math.max(1, timeScale * 0.7);
        this.xp = def.xp;
        this.color = def.color;
        this.alpha = def.alpha || 1;
        this.isBoss = def.isBoss || false;
        this.hitFlash = 0;
        this.knockbackX = 0;
        this.knockbackY = 0;
    }

    update(dt, player) {
        // Knockback
        this.x += this.knockbackX * dt;
        this.y += this.knockbackY * dt;
        this.knockbackX *= 0.9;
        this.knockbackY *= 0.9;
        
        // Move toward player
        const a = angle(this, player);
        this.x += Math.cos(a) * this.speed * dt;
        this.y += Math.sin(a) * this.speed * dt;
        
        this.hitFlash = Math.max(0, this.hitFlash - dt * 8);
    }

    draw(ctx, cam) {
        const sx = this.x - cam.x, sy = this.y - cam.y;
        
        // Shadow
        ctx.globalAlpha = 0.3 * this.alpha;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(sx, sy + this.size, this.size * 0.8, this.size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = this.alpha;

        // Body
        const bodyColor = this.hitFlash > 0 ? '#fff' : this.color;
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(sx, sy, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Inner detail
        ctx.fillStyle = this.hitFlash > 0 ? '#fff' : shadeColor(this.color, -30);
        ctx.beginPath();
        ctx.arc(sx, sy, this.size * 0.65, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        if (!this.hitFlash) {
            ctx.fillStyle = this.isBoss ? '#ff0' : '#ff3333';
            ctx.beginPath();
            ctx.arc(sx - this.size * 0.3, sy - this.size * 0.2, this.size * 0.18, 0, Math.PI * 2);
            ctx.arc(sx + this.size * 0.3, sy - this.size * 0.2, this.size * 0.18, 0, Math.PI * 2);
            ctx.fill();
        }

        // HP bar for bosses or damaged enemies
        if (this.isBoss || this.hp < this.maxHp) {
            const barW = this.size * 2;
            const barH = 3;
            const barY = sy - this.size - 8;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(sx - barW / 2, barY, barW, barH);
            ctx.fillStyle = this.isBoss ? '#ff4444' : '#44ff44';
            ctx.fillRect(sx - barW / 2, barY, barW * (this.hp / this.maxHp), barH);
        }

        ctx.globalAlpha = 1;
    }

    takeDamage(amount, knockAngle = null) {
        this.hp -= amount;
        this.hitFlash = 1;
        if (knockAngle !== null) {
            const knockForce = this.isBoss ? 50 : 200;
            this.knockbackX = Math.cos(knockAngle) * knockForce;
            this.knockbackY = Math.sin(knockAngle) * knockForce;
        }
        return this.hp <= 0;
    }
}

function shadeColor(color, amount) {
    let hex = color.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    r = clamp(r + amount, 0, 255);
    g = clamp(g + amount, 0, 255);
    b = clamp(b + amount, 0, 255);
    return `rgb(${r},${g},${b})`;
}

// ============================================================
// PROJECTILE CLASS
// ============================================================
class Projectile {
    constructor(x, y, vx, vy, damage, color, size, pierce = 1, lifetime = 3) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.damage = damage;
        this.color = color;
        this.size = size;
        this.pierce = pierce;
        this.lifetime = lifetime;
        this.hitEnemies = new Set();
        this.trail = [];
    }

    update(dt) {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 5) this.trail.shift();
        
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.lifetime -= dt;
        return this.lifetime > 0;
    }

    draw(ctx, cam) {
        // Trail
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const alpha = (i / this.trail.length) * 0.4;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(t.x - cam.x, t.y - cam.y, this.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        // Glow
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(this.x - cam.x, this.y - cam.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// ============================================================
// ZONE EFFECT
// ============================================================
class ZoneEffect {
    constructor(x, y, radius, damage, duration, color) {
        this.x = x; this.y = y;
        this.radius = radius;
        this.damage = damage;
        this.duration = duration;
        this.maxDuration = duration;
        this.color = color;
        this.tickTimer = 0;
    }

    update(dt) {
        this.duration -= dt;
        this.tickTimer -= dt;
        return this.duration > 0;
    }

    draw(ctx, cam) {
        const alpha = clamp(this.duration / this.maxDuration, 0, 1) * 0.4;
        const sx = this.x - cam.x, sy = this.y - cam.y;
        
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.globalAlpha = 1;
    }
}

// ============================================================
// MAIN GAME CLASS
// ============================================================
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.miniCanvas = document.getElementById('minimap');
        this.miniCtx = this.miniCanvas.getContext('2d');
        this.audio = new AudioManager();
        
        this.keys = {};
        this.lastFacing = { x: 1, y: 0 };
        this.screenShake = { x: 0, y: 0, intensity: 0 };
        
        this.state = 'menu'; // menu, playing, upgrading, gameover
        
        this.resize();
        this.bindEvents();
        this.showHighScore();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.miniCanvas.width = 120;
        this.miniCanvas.height = 120;
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());

        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            // Prevent scrolling
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('restart-btn').addEventListener('click', () => this.startGame());
    }

    showHighScore() {
        const best = localStorage.getItem('darkSurvivorsBest');
        const el = document.getElementById('high-score');
        if (best) {
            const data = JSON.parse(best);
            el.textContent = `🏆 Best: ${formatTime(data.time)} | ${data.kills} kills | Level ${data.level}`;
        }
    }

    startGame() {
        this.audio.init();
        
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('gameover-screen').classList.remove('active');
        
        // Reset game state
        this.player = {
            x: CONFIG.WORLD_SIZE / 2,
            y: CONFIG.WORLD_SIZE / 2,
            hp: CONFIG.PLAYER_MAX_HP,
            maxHp: CONFIG.PLAYER_MAX_HP,
            speed: CONFIG.PLAYER_SPEED,
            xp: 0,
            level: 1,
            pickupRadius: CONFIG.PLAYER_PICKUP_RADIUS,
            armor: 0,
            regen: 0,
            mightMult: 1,
            invincibleTimer: 0,
            weapons: [],
            passiveUpgrades: {}
        };

        // Start with Magic Orb
        this.player.weapons.push(new Weapon('magicOrb'));

        this.camera = {
            x: this.player.x - this.canvas.width / 2,
            y: this.player.y - this.canvas.height / 2
        };

        this.enemies = [];
        this.projectiles = [];
        this.gems = [];
        this.particles = [];
        this.damageNumbers = [];
        this.zones = [];
        this.lightnings = [];

        this.gameTime = 0;
        this.kills = 0;
        this.enemySpawnTimer = 0;
        this.bossTimer = CONFIG.BOSS_INTERVAL;
        this.difficultyScale = 1;

        this.state = 'playing';
        this.lastTime = performance.now();

        this.updateWeaponIcons();
        
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    // ========================================================
    // GAME LOOP
    // ========================================================
    gameLoop(timestamp) {
        if (this.state === 'menu') return;

        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        if (this.state === 'playing') {
            this.update(dt);
        }

        this.render();
        this.updateHUD();

        if (this.state !== 'gameover' && this.state !== 'menu') {
            requestAnimationFrame((t) => this.gameLoop(t));
        }
    }

    // ========================================================
    // UPDATE
    // ========================================================
    update(dt) {
        this.gameTime += dt;
        this.difficultyScale = 1 + this.gameTime / 60;

        // Player movement
        this.updatePlayer(dt);

        // Weapons
        this.updateWeapons(dt);

        // Projectiles
        this.updateProjectiles(dt);

        // Zones
        this.updateZones(dt);

        // Enemies
        this.updateEnemies(dt);

        // Gems
        this.updateGems(dt);

        // Particles
        this.particles = this.particles.filter(p => p.update(dt));
        this.damageNumbers = this.damageNumbers.filter(d => d.update(dt));
        this.lightnings = this.lightnings.filter(l => { l.life -= dt; return l.life > 0; });

        // Enemy spawning
        this.spawnEnemies(dt);

        // Camera
        this.updateCamera(dt);

        // Screen shake decay
        this.screenShake.intensity *= 0.9;
        if (this.screenShake.intensity < 0.5) this.screenShake.intensity = 0;
        this.screenShake.x = (Math.random() - 0.5) * this.screenShake.intensity;
        this.screenShake.y = (Math.random() - 0.5) * this.screenShake.intensity;

        // Regen
        if (this.player.regen > 0) {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.regen * dt);
        }
    }

    updatePlayer(dt) {
        const p = this.player;
        let dx = 0, dy = 0;

        if (this.keys['w'] || this.keys['arrowup']) dy = -1;
        if (this.keys['s'] || this.keys['arrowdown']) dy = 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx = -1;
        if (this.keys['d'] || this.keys['arrowright']) dx = 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;
            this.lastFacing = { x: dx, y: dy };
        }

        p.x += dx * p.speed * dt;
        p.y += dy * p.speed * dt;

        // Clamp to world
        p.x = clamp(p.x, 30, CONFIG.WORLD_SIZE - 30);
        p.y = clamp(p.y, 30, CONFIG.WORLD_SIZE - 30);

        // Invincibility timer
        p.invincibleTimer = Math.max(0, p.invincibleTimer - dt * 1000);
    }

    // ========================================================
    // WEAPON SYSTEM
    // ========================================================
    updateWeapons(dt) {
        const p = this.player;

        for (const weapon of p.weapons) {
            weapon.timer -= dt * 1000;

            switch (weapon.type) {
                case 'orbit':
                    this.updateOrbitWeapon(weapon, dt);
                    break;
                case 'projectile':
                    if (weapon.timer <= 0) {
                        this.fireProjectileWeapon(weapon);
                        weapon.timer = weapon.getCooldown();
                    }
                    break;
                case 'lightning':
                    if (weapon.timer <= 0) {
                        this.fireLightning(weapon);
                        weapon.timer = weapon.getCooldown();
                    }
                    break;
                case 'zone':
                    if (weapon.timer <= 0) {
                        this.dropZone(weapon);
                        weapon.timer = weapon.getCooldown();
                    }
                    break;
                case 'aura':
                    if (weapon.timer <= 0) {
                        this.pulseAura(weapon);
                        weapon.timer = weapon.getCooldown();
                    }
                    break;
                case 'fireball':
                    if (weapon.timer <= 0) {
                        this.fireFireball(weapon);
                        weapon.timer = weapon.getCooldown();
                    }
                    break;
            }
        }
    }

    updateOrbitWeapon(weapon, dt) {
        weapon.orbitAngle += dt * 2.5;
        const count = weapon.getCount();
        const radius = 80 + weapon.level * 8;
        const damage = weapon.getDamage() * this.player.mightMult;
        const p = this.player;

        for (let i = 0; i < count; i++) {
            const a = weapon.orbitAngle + (Math.PI * 2 / count) * i;
            const ox = p.x + Math.cos(a) * radius;
            const oy = p.y + Math.sin(a) * radius;

            // Check collision with enemies
            for (const enemy of this.enemies) {
                if (dist({ x: ox, y: oy }, enemy) < 18 + enemy.size) {
                    if (!enemy._orbHitTimer || enemy._orbHitTimer <= 0) {
                        const knockA = angle(p, enemy);
                        if (enemy.takeDamage(damage, knockA)) {
                            this.killEnemy(enemy);
                        } else {
                            this.audio.play('hit');
                        }
                        this.addDamageNumber(enemy.x, enemy.y - enemy.size, damage, weapon.color);
                        enemy._orbHitTimer = 0.3;
                    }
                }
                if (enemy._orbHitTimer > 0) enemy._orbHitTimer -= dt;
            }
        }
    }

    fireProjectileWeapon(weapon) {
        const p = this.player;
        const count = weapon.getCount();
        const damage = weapon.getDamage() * p.mightMult;
        const speed = 500;

        for (let i = 0; i < count; i++) {
            const spread = (i - (count - 1) / 2) * 0.15;
            const dir = Math.atan2(this.lastFacing.y, this.lastFacing.x) + spread;
            this.projectiles.push(new Projectile(
                p.x, p.y,
                Math.cos(dir) * speed, Math.sin(dir) * speed,
                damage, weapon.color, 4, 1 + Math.floor(weapon.level / 3), 2
            ));
        }
        this.audio.play('hit');
    }

    fireLightning(weapon) {
        const p = this.player;
        const count = weapon.getCount();
        const damage = weapon.getDamage() * p.mightMult;
        
        // Find nearest enemies
        const sorted = [...this.enemies].sort((a, b) => dist(a, p) - dist(b, p));
        const targets = sorted.slice(0, count);

        for (const target of targets) {
            if (target.takeDamage(damage, null)) {
                this.killEnemy(target);
            }
            this.addDamageNumber(target.x, target.y - target.size, damage, '#ffee44');
            
            // Lightning visual
            this.lightnings.push({
                x1: p.x, y1: p.y,
                x2: target.x, y2: target.y,
                life: 0.2, maxLife: 0.2
            });

            // Particles
            for (let i = 0; i < 5; i++) {
                this.addParticle(target.x, target.y, '#ffee44', 80, 0.3, 3);
            }
        }
        if (targets.length) this.audio.play('hit');
    }

    dropZone(weapon) {
        const p = this.player;
        const count = weapon.getCount();
        const damage = weapon.getDamage() * p.mightMult;

        for (let i = 0; i < count; i++) {
            // Drop near random nearby enemies or random position
            let tx, ty;
            if (this.enemies.length > 0) {
                const target = randChoice(this.enemies);
                tx = target.x + rand(-40, 40);
                ty = target.y + rand(-40, 40);
            } else {
                const a = Math.random() * Math.PI * 2;
                const d = rand(50, 150);
                tx = p.x + Math.cos(a) * d;
                ty = p.y + Math.sin(a) * d;
            }
            this.zones.push(new ZoneEffect(tx, ty, 50 + weapon.level * 5, damage, 3, weapon.color));
        }
    }

    pulseAura(weapon) {
        const p = this.player;
        const damage = weapon.getDamage() * p.mightMult;
        const radius = 80 * Math.pow(WEAPON_DEFS[weapon.id].evolvePerLevel.radiusMult || 1, weapon.level - 1);

        for (const enemy of this.enemies) {
            if (dist(enemy, p) < radius + enemy.size) {
                const knockA = angle(p, enemy);
                if (enemy.takeDamage(damage, knockA)) {
                    this.killEnemy(enemy);
                } else {
                    this.audio.play('hit');
                }
                this.addDamageNumber(enemy.x, enemy.y - enemy.size, damage, weapon.color);
            }
        }
    }

    fireFireball(weapon) {
        const p = this.player;
        const count = weapon.getCount();
        const damage = weapon.getDamage() * p.mightMult;
        const speed = 250;

        for (let i = 0; i < count; i++) {
            let dir;
            if (this.enemies.length > 0) {
                const target = randChoice(this.enemies);
                dir = angle(p, target);
            } else {
                dir = Math.random() * Math.PI * 2;
            }
            
            const proj = new Projectile(
                p.x, p.y,
                Math.cos(dir) * speed, Math.sin(dir) * speed,
                damage, weapon.color, 8, 1, 3
            );
            proj.isFireball = true;
            proj.explosionRadius = 60 + weapon.level * 5;
            this.projectiles.push(proj);
        }
        this.audio.play('hit');
    }

    // ========================================================
    // PROJECTILES
    // ========================================================
    updateProjectiles(dt) {
        this.projectiles = this.projectiles.filter(proj => {
            if (!proj.update(dt)) return false;

            for (const enemy of this.enemies) {
                if (proj.hitEnemies.has(enemy)) continue;
                if (dist(proj, enemy) < proj.size + enemy.size) {
                    proj.hitEnemies.add(enemy);
                    const knockA = angle(this.player, enemy);
                    
                    if (proj.isFireball) {
                        // Explosion!
                        this.explodeFireball(proj);
                        return false;
                    }

                    if (enemy.takeDamage(proj.damage, knockA)) {
                        this.killEnemy(enemy);
                    } else {
                        this.audio.play('hit');
                    }
                    this.addDamageNumber(enemy.x, enemy.y - enemy.size, proj.damage, proj.color);
                    
                    proj.pierce--;
                    if (proj.pierce <= 0) return false;
                }
            }
            return true;
        });
    }

    explodeFireball(proj) {
        const radius = proj.explosionRadius;
        
        // Damage enemies in radius
        for (const enemy of this.enemies) {
            if (dist(proj, enemy) < radius + enemy.size) {
                const knockA = angle(proj, enemy);
                if (enemy.takeDamage(proj.damage, knockA)) {
                    this.killEnemy(enemy);
                }
                this.addDamageNumber(enemy.x, enemy.y - enemy.size, proj.damage, '#ff6622');
            }
        }
        
        // Explosion particles
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = rand(50, 200);
            this.addParticle(proj.x, proj.y, randChoice(['#ff6622', '#ff4400', '#ffaa00']), s, rand(0.3, 0.6), rand(3, 8));
        }
        
        this.screenShake.intensity = 8;
        this.audio.play('kill');
    }

    // ========================================================
    // ZONES
    // ========================================================
    updateZones(dt) {
        this.zones = this.zones.filter(zone => {
            if (!zone.update(dt)) return false;

            if (zone.tickTimer <= 0) {
                zone.tickTimer = 0.5;
                for (const enemy of this.enemies) {
                    if (dist(zone, enemy) < zone.radius + enemy.size) {
                        if (enemy.takeDamage(zone.damage * this.player.mightMult, null)) {
                            this.killEnemy(enemy);
                        }
                        this.addDamageNumber(enemy.x + rand(-10, 10), enemy.y - enemy.size, zone.damage, zone.color);
                    }
                }
            }
            return true;
        });
    }

    // ========================================================
    // ENEMIES
    // ========================================================
    updateEnemies(dt) {
        const p = this.player;

        this.enemies = this.enemies.filter(enemy => {
            if (enemy.hp <= 0) return false;
            enemy.update(dt, p);

            // Collision with player
            if (p.invincibleTimer <= 0 && dist(enemy, p) < enemy.size + 16) {
                const dmg = Math.max(1, enemy.damage - p.armor);
                p.hp -= dmg;
                p.invincibleTimer = CONFIG.PLAYER_INVINCIBLE_TIME;
                
                this.addDamageNumber(p.x, p.y - 30, dmg, '#ff4444');
                this.screenShake.intensity = 10;
                this.audio.play('playerHit');
                
                // Flash
                document.getElementById('kill-flash').style.background = 'rgba(255,0,0,0.2)';
                setTimeout(() => document.getElementById('kill-flash').style.background = 'rgba(255,0,0,0)', 100);

                if (p.hp <= 0) {
                    this.gameOver();
                    return false;
                }
            }

            return true;
        });
    }

    spawnEnemies(dt) {
        this.enemySpawnTimer -= dt;
        this.bossTimer -= dt;

        const rate = Math.max(CONFIG.MIN_ENEMY_SPAWN_RATE, CONFIG.BASE_ENEMY_SPAWN_RATE - this.gameTime * 0.008);

        if (this.enemySpawnTimer <= 0 && this.enemies.length < CONFIG.MAX_ENEMIES) {
            this.enemySpawnTimer = rate;
            
            // Spawn enemies at screen edges
            const p = this.player;
            const spawnCount = Math.floor(1 + this.gameTime / 30);
            
            for (let i = 0; i < spawnCount; i++) {
                const a = Math.random() * Math.PI * 2;
                const d = rand(500, 800);
                const sx = p.x + Math.cos(a) * d;
                const sy = p.y + Math.sin(a) * d;

                // Choose enemy type based on time
                let type;
                const r = Math.random();
                if (this.gameTime < 30) {
                    type = r < 0.7 ? 'zombie' : 'bat';
                } else if (this.gameTime < 90) {
                    type = r < 0.4 ? 'zombie' : r < 0.65 ? 'bat' : r < 0.85 ? 'skeleton' : 'ghost';
                } else {
                    type = r < 0.2 ? 'zombie' : r < 0.35 ? 'bat' : r < 0.55 ? 'skeleton' : r < 0.75 ? 'ghost' : 'demon';
                }

                this.enemies.push(new Enemy(type, sx, sy, this.difficultyScale));
            }
        }

        // Boss spawn
        if (this.bossTimer <= 0) {
            this.bossTimer = CONFIG.BOSS_INTERVAL;
            const a = Math.random() * Math.PI * 2;
            const d = 600;
            const bx = this.player.x + Math.cos(a) * d;
            const by = this.player.y + Math.sin(a) * d;
            this.enemies.push(new Enemy('boss', bx, by, this.difficultyScale));
            this.audio.play('boss');
            this.screenShake.intensity = 15;

            // Warning flash
            document.getElementById('kill-flash').style.background = 'rgba(255,0,0,0.15)';
            setTimeout(() => document.getElementById('kill-flash').style.background = 'rgba(255,0,0,0)', 200);
        }
    }

    killEnemy(enemy) {
        enemy.hp = 0;
        this.kills++;
        this.audio.play('kill');

        // Drop XP gem
        this.gems.push(new Gem(enemy.x, enemy.y, enemy.xp));

        // Death particles
        const particleCount = enemy.isBoss ? 30 : 8;
        for (let i = 0; i < particleCount; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = rand(40, 150);
            this.addParticle(
                enemy.x, enemy.y,
                enemy.color, s, rand(0.2, 0.5), rand(2, enemy.isBoss ? 8 : 5)
            );
        }

        this.screenShake.intensity = Math.min(15, this.screenShake.intensity + (enemy.isBoss ? 12 : 2));
    }

    // ========================================================
    // GEMS & XP
    // ========================================================
    updateGems(dt) {
        this.gems = this.gems.filter(gem => {
            if (gem.update(dt, this.player)) {
                // Collected
                this.player.xp += gem.value;
                this.audio.play('pickup');
                
                // Sparkle particles
                for (let i = 0; i < 3; i++) {
                    this.addParticle(gem.x, gem.y, gem.color, 50, 0.3, 2);
                }

                this.checkLevelUp();
                return false;
            }
            return true;
        });
    }

    checkLevelUp() {
        const p = this.player;
        const xpNeeded = this.getXpToNextLevel(p.level);
        
        while (p.xp >= xpNeeded) {
            p.xp -= xpNeeded;
            p.level++;
            this.audio.play('levelup');
            this.screenShake.intensity = 10;

            // Level up flash
            document.getElementById('kill-flash').style.background = 'rgba(255,215,0,0.3)';
            setTimeout(() => document.getElementById('kill-flash').style.background = 'rgba(255,215,0,0)', 300);

            // Level up particles
            for (let i = 0; i < 20; i++) {
                const a = Math.random() * Math.PI * 2;
                this.addParticle(p.x, p.y, '#ffd700', rand(80, 200), rand(0.5, 1), rand(2, 5));
            }

            this.showUpgradeScreen();
            return;
        }
    }

    getXpToNextLevel(level) {
        if (level < CONFIG.XP_TO_LEVEL.length) return CONFIG.XP_TO_LEVEL[level];
        return Math.floor(100 + level * level * 8);
    }

    // ========================================================
    // UPGRADE SYSTEM
    // ========================================================
    showUpgradeScreen() {
        this.state = 'upgrading';
        const screen = document.getElementById('upgrade-screen');
        const optionsDiv = document.getElementById('upgrade-options');
        screen.classList.add('active');
        optionsDiv.innerHTML = '';

        const options = this.generateUpgradeOptions(3);

        options.forEach(opt => {
            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `
                ${opt.isNew ? '<div class="new-badge">NEW</div>' : ''}
                <div class="icon">${opt.icon}</div>
                <div class="name">${opt.name}${opt.levelText ? ` <span style="color:#ffd700">${opt.levelText}</span>` : ''}</div>
                <div class="desc">${opt.desc}</div>
            `;
            card.addEventListener('click', () => {
                opt.apply();
                screen.classList.remove('active');
                this.state = 'playing';
                this.updateWeaponIcons();
            });
            optionsDiv.appendChild(card);
        });
    }

    generateUpgradeOptions(count) {
        const options = [];
        const p = this.player;
        const ownedWeaponIds = p.weapons.map(w => w.id);

        // Possible: Level up existing weapons
        for (const w of p.weapons) {
            if (w.level < w.maxLevel) {
                options.push({
                    icon: w.icon,
                    name: w.name,
                    levelText: `Lv ${w.level} → ${w.level + 1}`,
                    desc: `Increases damage and power.`,
                    isNew: false,
                    weight: 3,
                    apply: () => { w.level++; }
                });
            }
        }

        // Possible: New weapons (max 6 weapons)
        if (p.weapons.length < 6) {
            for (const [id, def] of Object.entries(WEAPON_DEFS)) {
                if (!ownedWeaponIds.includes(id)) {
                    options.push({
                        icon: def.icon,
                        name: def.name,
                        levelText: 'NEW',
                        desc: def.desc,
                        isNew: true,
                        weight: 2,
                        apply: () => { p.weapons.push(new Weapon(id)); }
                    });
                }
            }
        }

        // Passive upgrades
        for (const [id, def] of Object.entries(PASSIVE_UPGRADES)) {
            const count = p.passiveUpgrades[id] || 0;
            if (count < 5) {
                options.push({
                    icon: def.icon,
                    name: def.name,
                    levelText: count > 0 ? `x${count + 1}` : '',
                    desc: def.desc,
                    isNew: false,
                    weight: 1,
                    apply: () => { 
                        def.effect(p); 
                        p.passiveUpgrades[id] = (p.passiveUpgrades[id] || 0) + 1; 
                    }
                });
            }
        }

        // Weighted random selection
        this.shuffleArray(options);
        
        // Prefer new weapons and level-ups
        options.sort((a, b) => (b.weight + Math.random()) - (a.weight + Math.random()));
        
        return options.slice(0, count);
    }

    shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    // ========================================================
    // CAMERA
    // ========================================================
    updateCamera(dt) {
        const targetX = this.player.x - this.canvas.width / 2;
        const targetY = this.player.y - this.canvas.height / 2;
        this.camera.x = lerp(this.camera.x, targetX, CONFIG.CAMERA_SMOOTH);
        this.camera.y = lerp(this.camera.y, targetY, CONFIG.CAMERA_SMOOTH);
    }

    // ========================================================
    // RENDERING
    // ========================================================
    render() {
        const ctx = this.ctx;
        const cam = {
            x: this.camera.x + this.screenShake.x,
            y: this.camera.y + this.screenShake.y
        };
        const W = this.canvas.width, H = this.canvas.height;

        // Clear
        ctx.fillStyle = '#111118';
        ctx.fillRect(0, 0, W, H);

        // Draw grid (ground)
        this.drawGrid(ctx, cam, W, H);

        // World border
        this.drawWorldBorder(ctx, cam);

        // Zones
        for (const zone of this.zones) zone.draw(ctx, cam);

        // Gems
        for (const gem of this.gems) {
            const sx = gem.x - cam.x, sy = gem.y - cam.y;
            if (sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50) {
                gem.draw(ctx, cam);
            }
        }

        // Enemies
        for (const enemy of this.enemies) {
            const sx = enemy.x - cam.x, sy = enemy.y - cam.y;
            if (sx > -100 && sx < W + 100 && sy > -100 && sy < H + 100) {
                enemy.draw(ctx, cam);
            }
        }

        // Player
        this.drawPlayer(ctx, cam);

        // Orbit weapons visual
        this.drawOrbitWeapons(ctx, cam);

        // Aura visual
        this.drawAuraWeapons(ctx, cam);

        // Projectiles
        for (const proj of this.projectiles) {
            const sx = proj.x - cam.x, sy = proj.y - cam.y;
            if (sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50) {
                proj.draw(ctx, cam);
            }
        }

        // Lightning
        for (const l of this.lightnings) {
            this.drawLightning(ctx, cam, l);
        }

        // Particles
        for (const p of this.particles) p.draw(ctx, cam);

        // Damage numbers
        for (const d of this.damageNumbers) d.draw(ctx, cam);

        // Minimap
        this.drawMinimap();
    }

    drawGrid(ctx, cam, W, H) {
        const gs = CONFIG.GRID_SIZE;
        const startX = Math.floor(cam.x / gs) * gs;
        const startY = Math.floor(cam.y / gs) * gs;

        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;

        for (let x = startX; x < cam.x + W + gs; x += gs) {
            const sx = x - cam.x;
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, H);
            ctx.stroke();
        }
        for (let y = startY; y < cam.y + H + gs; y += gs) {
            const sy = y - cam.y;
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(W, sy);
            ctx.stroke();
        }
    }

    drawWorldBorder(ctx, cam) {
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur = 15;
        ctx.strokeRect(-cam.x, -cam.y, CONFIG.WORLD_SIZE, CONFIG.WORLD_SIZE);
        ctx.shadowBlur = 0;
    }

    drawPlayer(ctx, cam) {
        const p = this.player;
        const sx = p.x - cam.x, sy = p.y - cam.y;

        // Pickup radius indicator
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#00bfff';
        ctx.beginPath();
        ctx.arc(sx, sy, p.pickupRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Shadow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 16, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Invincibility flash
        if (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer / 80) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // Body
        ctx.fillStyle = '#4488ff';
        ctx.beginPath();
        ctx.arc(sx, sy, 16, 0, Math.PI * 2);
        ctx.fill();

        // Inner
        ctx.fillStyle = '#6aadff';
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (look in facing direction)
        ctx.fillStyle = '#fff';
        const ex = this.lastFacing.x * 4;
        const ey = this.lastFacing.y * 4;
        ctx.beginPath();
        ctx.arc(sx - 4 + ex, sy - 3 + ey, 3, 0, Math.PI * 2);
        ctx.arc(sx + 4 + ex, sy - 3 + ey, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(sx - 4 + ex * 1.2, sy - 3 + ey * 1.2, 1.5, 0, Math.PI * 2);
        ctx.arc(sx + 4 + ex * 1.2, sy - 3 + ey * 1.2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;

        // Player glow
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = '#4488ff';
        ctx.beginPath();
        ctx.arc(sx, sy, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    drawOrbitWeapons(ctx, cam) {
        const p = this.player;
        for (const weapon of p.weapons) {
            if (weapon.type !== 'orbit') continue;
            const count = weapon.getCount();
            const radius = 80 + weapon.level * 8;
            
            for (let i = 0; i < count; i++) {
                const a = weapon.orbitAngle + (Math.PI * 2 / count) * i;
                const ox = p.x + Math.cos(a) * radius - cam.x;
                const oy = p.y + Math.sin(a) * radius - cam.y;

                // Glow
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = weapon.color;
                ctx.beginPath();
                ctx.arc(ox, oy, 14, 0, Math.PI * 2);
                ctx.fill();

                // Orb
                ctx.globalAlpha = 1;
                ctx.fillStyle = weapon.color;
                ctx.shadowColor = weapon.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(ox, oy, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // Shine
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.arc(ox - 2, oy - 2, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
    }

    drawAuraWeapons(ctx, cam) {
        const p = this.player;
        for (const weapon of p.weapons) {
            if (weapon.type !== 'aura') continue;
            const radius = 80 * Math.pow(WEAPON_DEFS[weapon.id].evolvePerLevel.radiusMult || 1, weapon.level - 1);
            const sx = p.x - cam.x, sy = p.y - cam.y;
            
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = weapon.color;
            ctx.beginPath();
            ctx.arc(sx, sy, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 0.2;
            ctx.strokeStyle = weapon.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx, sy, radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.globalAlpha = 1;
        }
    }

    drawLightning(ctx, cam, l) {
        const alpha = l.life / l.maxLife;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffee44';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffee44';
        ctx.shadowBlur = 15;

        ctx.beginPath();
        let cx = l.x1 - cam.x, cy = l.y1 - cam.y;
        const tx = l.x2 - cam.x, ty = l.y2 - cam.y;
        ctx.moveTo(cx, cy);

        const segments = 6;
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            let nx = lerp(cx, tx, t / (1 - (i - 1) / segments));
            let ny = lerp(cy, ty, t / (1 - (i - 1) / segments));
            
            // Simplified: lerp from start to end with jitter
            nx = lerp(l.x1 - cam.x, tx, t) + (i < segments ? rand(-20, 20) : 0);
            ny = lerp(l.y1 - cam.y, ty, t) + (i < segments ? rand(-20, 20) : 0);
            
            ctx.lineTo(nx, ny);
        }
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }

    drawMinimap() {
        const mc = this.miniCtx;
        const mw = 120, mh = 120;
        const scale = mw / CONFIG.WORLD_SIZE;

        mc.fillStyle = 'rgba(0,0,0,0.7)';
        mc.fillRect(0, 0, mw, mh);

        // Enemies as red dots
        mc.fillStyle = 'rgba(255,60,60,0.6)';
        for (const e of this.enemies) {
            mc.fillRect(e.x * scale, e.y * scale, e.isBoss ? 3 : 1, e.isBoss ? 3 : 1);
        }

        // Player as blue dot
        mc.fillStyle = '#4488ff';
        mc.beginPath();
        mc.arc(this.player.x * scale, this.player.y * scale, 3, 0, Math.PI * 2);
        mc.fill();

        // Camera view rect
        mc.strokeStyle = 'rgba(255,255,255,0.3)';
        mc.lineWidth = 1;
        mc.strokeRect(
            this.camera.x * scale,
            this.camera.y * scale,
            this.canvas.width * scale,
            this.canvas.height * scale
        );
    }

    // ========================================================
    // HELPERS
    // ========================================================
    addParticle(x, y, color, speed, life, size) {
        if (this.particles.length >= CONFIG.MAX_PARTICLES) return;
        const a = Math.random() * Math.PI * 2;
        const s = rand(speed * 0.5, speed);
        this.particles.push(new Particle(
            x, y,
            Math.cos(a) * s, Math.sin(a) * s,
            life, size, color,
            Math.random() > 0.5 ? 'circle' : 'spark'
        ));
    }

    addDamageNumber(x, y, value, color) {
        if (this.damageNumbers.length >= CONFIG.MAX_DAMAGE_NUMBERS) {
            this.damageNumbers.shift();
        }
        this.damageNumbers.push(new DamageNumber(x + rand(-10, 10), y + rand(-5, 5), value, color));
    }

    // ========================================================
    // HUD UPDATE
    // ========================================================
    updateHUD() {
        const p = this.player;
        const xpNeeded = this.getXpToNextLevel(p.level);
        
        document.getElementById('xp-bar').style.width = `${(p.xp / xpNeeded) * 100}%`;
        document.getElementById('timer').textContent = formatTime(this.gameTime);
        document.getElementById('level').textContent = p.level;
        document.getElementById('kills').textContent = this.kills;
        
        document.getElementById('hp-bar').style.width = `${(p.hp / p.maxHp) * 100}%`;
        document.getElementById('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    }

    updateWeaponIcons() {
        const container = document.getElementById('weapon-icons');
        container.innerHTML = '';
        for (const w of this.player.weapons) {
            const div = document.createElement('div');
            div.className = 'weapon-icon';
            div.innerHTML = `${w.icon}<span class="wlvl">${w.level}</span>`;
            container.appendChild(div);
        }
    }

    // ========================================================
    // GAME OVER
    // ========================================================
    gameOver() {
        this.state = 'gameover';

        const statsDiv = document.getElementById('gameover-stats');
        statsDiv.innerHTML = `
            Survived: <span>${formatTime(this.gameTime)}</span><br>
            Enemies Slain: <span>${this.kills}</span><br>
            Level Reached: <span>${this.player.level}</span><br>
            Weapons: <span>${this.player.weapons.map(w => w.icon).join(' ')}</span>
        `;

        document.getElementById('gameover-screen').classList.add('active');

        // Save high score
        const best = localStorage.getItem('darkSurvivorsBest');
        const current = { time: this.gameTime, kills: this.kills, level: this.player.level };
        if (!best || this.gameTime > JSON.parse(best).time) {
            localStorage.setItem('darkSurvivorsBest', JSON.stringify(current));
        }
    }
}

// ============================================================
// INITIALIZE GAME
// ============================================================
const game = new Game();
