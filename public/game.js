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
    // Manual shoot (SHOOT joystick / mouse / space)
    SHOOT_COOLDOWN: 180,
    SHOOT_BASE_DAMAGE: 5,
    SHOOT_SPEED: 600,
    SHOOT_SIZE: 5,
    SHOOT_PIERCE: 1,
    SHOOT_LIFETIME: 1.5,
};

// ============================================================
// ============================================================
// AUDIO SYSTEM (MP3 background music + Web Audio API SFX)
// ============================================================
class AudioManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.sfxVolume = 0.8;
        this.musicVolume = 0.45;
        this.sfxOn = true;
        this.musicOn = true;
        this.bgMusic = null;
        // Lobby music + beat detection
        this.lobbyMusic = null;
        this.lobbySource = null;
        this.analyser = null;
        this.freqData = null;
        this._lobbyVizRAF = null;
        this._gestureUnlocked = false;

        // Listen for first user gesture to unlock AudioContext
        const unlock = () => {
            if (this._gestureUnlocked) return;
            this._gestureUnlocked = true;
            this.init();
            // If lobby music was waiting for context, connect it now
            if (this.lobbyMusic && !this.lobbySource && this.ctx) {
                this._connectLobbyAnalyser();
            }
            document.removeEventListener('click', unlock, true);
            document.removeEventListener('touchstart', unlock, true);
            document.removeEventListener('keydown', unlock, true);
        };
        document.addEventListener('click', unlock, true);
        document.addEventListener('touchstart', unlock, true);
        document.addEventListener('keydown', unlock, true);
    }

    init() {
        if (this.ctx) {
            // Resume if suspended (autoplay policy)
            if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
            return;
        }
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        } catch (e) {
            this.enabled = false;
        }
    }

    // ---- Background Music: MP3 file loop ----
    startMusic() {
        if (this.bgMusic) return;
        try {
            this.bgMusic = new Audio('bg-music.mp3');
            this.bgMusic.loop = true;
            this.bgMusic.volume = this.musicOn ? this.musicVolume : 0;
            this.bgMusic.play().catch(() => {});
        } catch (e) {}
    }

    stopMusic() {
        if (this.bgMusic) {
            this.bgMusic.pause();
            this.bgMusic.currentTime = 0;
            this.bgMusic = null;
        }
    }

    // ---- Lobby Music with beat analyser ----
    startLobbyMusic() {
        if (this.lobbyMusic) return;
        this.init(); // ensure ctx exists (works if called during gesture)
        try {
            this.lobbyMusic = new Audio('lobby-music.mp3');
            this.lobbyMusic.loop = true;
            this.lobbyMusic.volume = this.musicOn ? this.musicVolume : 0;
            this.lobbyMusic.crossOrigin = 'anonymous';

            // Connect analyser if ctx is ready, otherwise deferred to gesture unlock
            if (this.ctx && this.ctx.state !== 'suspended') {
                this._connectLobbyAnalyser();
            }
            this.lobbyMusic.play().catch(() => {});
            this._startBeatViz();
        } catch (e) {}
    }

    _connectLobbyAnalyser() {
        if (this.lobbySource || !this.lobbyMusic || !this.ctx) return;
        try {
            this.lobbySource = this.ctx.createMediaElementSource(this.lobbyMusic);
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.lobbySource.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
            // Ensure audio plays through the connected nodes
            if (this.lobbyMusic.paused && this.musicOn) {
                this.lobbyMusic.play().catch(() => {});
            }
        } catch (e) {}
    }

    stopLobbyMusic() {
        this._stopBeatViz();
        if (this.lobbyMusic) {
            this.lobbyMusic.pause();
            this.lobbyMusic.currentTime = 0;
        }
        if (this.lobbySource) {
            try { this.lobbySource.disconnect(); } catch(e) {}
            this.lobbySource = null;
        }
        if (this.analyser) {
            try { this.analyser.disconnect(); } catch(e) {}
            this.analyser = null;
        }
        this.lobbyMusic = null;
        this.freqData = null;
    }

    // Get bass energy 0-1 from analyser
    getBassEnergy() {
        if (!this.analyser || !this.freqData) return 0;
        this.analyser.getByteFrequencyData(this.freqData);
        // Average the first 8 bins (sub-bass + bass ~0-350Hz)
        let sum = 0;
        for (let i = 0; i < 8; i++) sum += this.freqData[i];
        return (sum / 8) / 255;
    }

    // Get mid energy for secondary effects
    getMidEnergy() {
        if (!this.analyser || !this.freqData) return 0;
        let sum = 0;
        for (let i = 8; i < 32; i++) sum += this.freqData[i];
        return (sum / 24) / 255;
    }

    // ---- Beat Visualizer (lobby background canvas) ----
    _startBeatViz() {
        const canvas = document.getElementById('lobby-beat-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let time = 0;
        // Ring particles — persistent energy ring pool
        const rings = [];
        let lastBeat = 0;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);
        this._beatVizResize = resize;

        const draw = () => {
            this._lobbyVizRAF = requestAnimationFrame(draw);
            const w = canvas.width, h = canvas.height;
            const cx = w / 2, cy = h / 2;
            time += 0.016;

            const bass = this.getBassEnergy();
            const mid = this.getMidEnergy();

            // Clear with slight trail
            ctx.fillStyle = 'rgba(6,10,16,0.25)';
            ctx.fillRect(0, 0, w, h);

            // === 1: Central radial glow pulsing with bass ===
            const glowR = Math.min(w, h) * (0.15 + bass * 0.35);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
            grad.addColorStop(0, `rgba(0,255,200,${0.04 + bass * 0.08})`);
            grad.addColorStop(0.5, `rgba(80,0,200,${0.02 + bass * 0.04})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            // === 2: Expanding rings on strong beats ===
            if (bass > 0.55 && time - lastBeat > 0.3) {
                lastBeat = time;
                rings.push({
                    x: cx, y: cy,
                    r: 20, maxR: Math.min(w, h) * 0.6,
                    alpha: 0.4 + bass * 0.3,
                    speed: 2 + bass * 4,
                    hue: Math.random() > 0.5 ? 160 : 270, // cyan or purple
                });
            }
            for (let i = rings.length - 1; i >= 0; i--) {
                const ring = rings[i];
                ring.r += ring.speed;
                ring.alpha *= 0.985;
                if (ring.alpha < 0.01 || ring.r > ring.maxR) {
                    rings.splice(i, 1);
                    continue;
                }
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${ring.hue},100%,60%,${ring.alpha})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // === 3: Horizontal scanning wave ===
            const scanY = (Math.sin(time * 0.7) * 0.5 + 0.5) * h;
            const scanGrad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
            scanGrad.addColorStop(0, 'rgba(0,255,200,0)');
            scanGrad.addColorStop(0.5, `rgba(0,255,200,${0.03 + mid * 0.06})`);
            scanGrad.addColorStop(1, 'rgba(0,255,200,0)');
            ctx.fillStyle = scanGrad;
            ctx.fillRect(0, scanY - 30, w, 60);

            // === 4: Corner vignette energy ===
            const vigR = Math.max(w, h) * 0.7;
            const vig = ctx.createRadialGradient(cx, cy, vigR * 0.4, cx, cy, vigR);
            vig.addColorStop(0, 'rgba(0,0,0,0)');
            vig.addColorStop(1, `rgba(0,0,0,${0.3 + bass * 0.15})`);
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, w, h);

            // === 5: Subtle floating particles ===
            const particleCount = 6;
            for (let i = 0; i < particleCount; i++) {
                const angle = (time * 0.3 + i * (Math.PI * 2 / particleCount));
                const dist = Math.min(w, h) * (0.18 + mid * 0.15);
                const px = cx + Math.cos(angle) * dist;
                const py = cy + Math.sin(angle) * dist;
                const pSize = 1.5 + bass * 3;
                ctx.beginPath();
                ctx.arc(px, py, pSize, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0,255,200,${0.15 + bass * 0.3})`;
                ctx.fill();
            }
        };
        draw();
    }

    _stopBeatViz() {
        if (this._lobbyVizRAF) {
            cancelAnimationFrame(this._lobbyVizRAF);
            this._lobbyVizRAF = null;
        }
        if (this._beatVizResize) {
            window.removeEventListener('resize', this._beatVizResize);
            this._beatVizResize = null;
        }
        const canvas = document.getElementById('lobby-beat-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    toggleMusic() {
        this.musicOn = !this.musicOn;
        if (this.bgMusic) {
            this.bgMusic.volume = this.musicOn ? this.musicVolume : 0;
        }
        if (this.lobbyMusic) {
            this.lobbyMusic.volume = this.musicOn ? this.musicVolume : 0;
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
        if (sfxBtn) sfxBtn.textContent = this.sfxOn ? '\u{1F50A}' : '\u{1F507}';
        if (musBtn) musBtn.textContent = this.musicOn ? '\u{1F3B5}' : '\u{1F3B5}\u{0338}';
        // Pause screen buttons
        const pSfx = document.getElementById('pause-sfx-btn');
        const pMus = document.getElementById('pause-music-btn');
        if (pSfx) pSfx.textContent = this.sfxOn ? '\u{1F50A} SFX: ON' : '\u{1F507} SFX: OFF';
        if (pMus) pMus.textContent = this.musicOn ? '\u{1F3B5} Music: ON' : '\u{1F3B5} Music: OFF';
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
                case 'shoot':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(880, now);
                    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.04);
                    osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
                    gain.gain.setValueAtTime(0.12 * v, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                    osc.start(now); osc.stop(now + 0.08);
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
        const sz = this.size * a;
        // Soft outer glow
        ctx.globalAlpha = a * 0.2;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(sx, sy, sz * 2.2, 0, Math.PI * 2); ctx.fill();
        // Core
        ctx.globalAlpha = a;
        ctx.fillStyle = this.color;
        if (this.type === 'circle') {
            ctx.beginPath(); ctx.arc(sx, sy, sz, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
        }
        // Bright center
        ctx.globalAlpha = a * 0.4;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx, sy, sz * 0.3, 0, Math.PI * 2); ctx.fill();
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
        const a = clamp(this.life / this.maxLife, 0, 1), sx = this.x - cam.x, sy = this.y - cam.y;
        const sc = 1 + (1 - a) * 0.5;
        const fontSize = Math.floor(15 * sc);
        ctx.globalAlpha = a;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        const text = typeof this.value === 'string' ? this.value : Math.floor(this.value).toString();
        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(text, sx + 1, sy + 1);
        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.strokeText(text, sx, sy);
        // Fill
        ctx.fillStyle = this.color;
        ctx.fillText(text, sx, sy);
        ctx.globalAlpha = 1;
    }
}

// ============================================================
// GEM (XP Pickup)
// ============================================================
// ============================================================
// HEALTH SUPPLY PICKUP
// ============================================================
class HealthSupply {
    constructor(x, y, healAmount) {
        this.x = x; this.y = y;
        this.healAmount = healAmount;
        this.size = 10;
        this.bobPhase = Math.random() * Math.PI * 2;
        this.attracted = false;
        this.lifetime = 30; // disappears after 30 seconds
        this.pulsePhase = 0;
    }
    update(dt, player) {
        this.bobPhase += dt * 2.5;
        this.pulsePhase += dt * 4;
        this.lifetime -= dt;
        if (this.lifetime <= 0) return 'expired';
        const d = dist(this, player);
        if (d < player.pickupRadius || this.attracted) {
            this.attracted = true;
            const a = angle(this, player);
            this.x += Math.cos(a) * 400 * dt;
            this.y += Math.sin(a) * 400 * dt;
            if (d < 18) return 'picked';
        }
        return 'alive';
    }
    draw(ctx, cam) {
        const sx = this.x - cam.x, sy = this.y - cam.y + Math.sin(this.bobPhase) * 4;
        const pulse = 1 + Math.sin(this.pulsePhase) * 0.15;
        const s = this.size * pulse;
        // Glow
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#44ff66';
        ctx.beginPath(); ctx.arc(sx, sy, s + 8, 0, Math.PI * 2); ctx.fill();
        // Background circle
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill();
        // Red cross
        ctx.fillStyle = '#ff2244';
        const cw = s * 0.35, ch = s * 0.8;
        ctx.fillRect(sx - cw / 2, sy - ch / 2, cw, ch);
        ctx.fillRect(sx - ch / 2, sy - cw / 2, ch, cw);
        // Blinking when about to expire
        if (this.lifetime < 5) {
            ctx.globalAlpha = Math.sin(this.lifetime * 8) > 0 ? 0.9 : 0.2;
        }
        ctx.globalAlpha = 1;
    }
}

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
        // Glow
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(sx, sy, this.size + 6, 0, Math.PI * 2); ctx.fill();
        // Diamond body
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(sx, sy - this.size);
        ctx.lineTo(sx + this.size * 0.7, sy);
        ctx.lineTo(sx, sy + this.size * 0.6);
        ctx.lineTo(sx - this.size * 0.7, sy);
        ctx.closePath();
        ctx.fill();
        // Highlight facet
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(sx, sy - this.size * 0.85);
        ctx.lineTo(sx + this.size * 0.25, sy - this.size * 0.05);
        ctx.lineTo(sx - this.size * 0.25, sy - this.size * 0.05);
        ctx.closePath();
        ctx.fill();
        // Sparkle
        const sparkle = Math.sin(this.bobPhase * 3);
        if (sparkle > 0.6) {
            ctx.globalAlpha = (sparkle - 0.6) * 2.5;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(sx + this.size * 0.3, sy - this.size * 0.5, 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
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
        this.animTime = Math.random() * 100;
    }
    update(dt, player) {
        this.x += this.knockbackX * dt; this.y += this.knockbackY * dt; this.knockbackX *= 0.9; this.knockbackY *= 0.9;
        const a = angle(this, player); this.x += Math.cos(a) * this.speed * dt; this.y += Math.sin(a) * this.speed * dt;
        this.hitFlash = Math.max(0, this.hitFlash - dt * 8);
        this.animTime += dt;
    }
    draw(ctx, cam) {
        const sx = this.x - cam.x, sy = this.y - cam.y, s = this.size, t = this.animTime;
        const flash = this.hitFlash > 0;
        const col = flash ? '#fff' : this.color;
        const darkCol = flash ? '#ddd' : shadeColor(this.color, -40);

        // Shadow
        ctx.globalAlpha = 0.25 * this.alpha;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(sx, sy + s, s * 0.8, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = this.alpha;

        // Subtle glow underneath
        ctx.globalAlpha = 0.1 * this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(sx, sy, s * 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = this.alpha;

        // === TYPE-SPECIFIC SHAPES ===
        if (this.type === 'bat') {
            // Flapping wings
            const flap = Math.sin(t * 12) * s * 0.6;
            ctx.fillStyle = darkCol;
            ctx.beginPath(); ctx.moveTo(sx - s * 0.3, sy); ctx.lineTo(sx - s * 1.4, sy - s * 0.6 - flap); ctx.lineTo(sx - s * 0.8, sy + s * 0.4); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(sx + s * 0.3, sy); ctx.lineTo(sx + s * 1.4, sy - s * 0.6 - flap); ctx.lineTo(sx + s * 0.8, sy + s * 0.4); ctx.closePath(); ctx.fill();
            ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(sx, sy, s * 0.55, s * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        } else if (this.type === 'ghost') {
            // Wavy translucent form
            ctx.globalAlpha = 0.5 * this.alpha;
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(sx, sy - s * 0.15, s * 0.85, Math.PI, 0);
            for (let i = 0; i <= 5; i++) ctx.lineTo(sx + s * 0.85 - (i / 5) * s * 1.7, sy + s * 0.5 + Math.sin(t * 5 + i * 1.3) * s * 0.2);
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(sx, sy - s * 0.15, s * 0.4, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 0.65 * this.alpha;
        } else if (this.type === 'skeleton') {
            // Angular skull/rib shape
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s * 0.7, sy - s * 0.3); ctx.lineTo(sx + s * 0.45, sy + s * 0.7); ctx.lineTo(sx - s * 0.45, sy + s * 0.7); ctx.lineTo(sx - s * 0.7, sy - s * 0.3); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = darkCol; ctx.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) { const ry = sy - s * 0.05 + i * s * 0.22; ctx.beginPath(); ctx.moveTo(sx - s * 0.28, ry); ctx.lineTo(sx + s * 0.28, ry); ctx.stroke(); }
        } else if (this.type === 'demon') {
            // Body with horns
            ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = darkCol; ctx.beginPath(); ctx.arc(sx, sy + s * 0.1, s * 0.65, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = flash ? '#fff' : '#661111';
            ctx.beginPath(); ctx.moveTo(sx - s * 0.4, sy - s * 0.65); ctx.lineTo(sx - s * 0.75, sy - s * 1.35); ctx.lineTo(sx - s * 0.1, sy - s * 0.75); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(sx + s * 0.4, sy - s * 0.65); ctx.lineTo(sx + s * 0.75, sy - s * 1.35); ctx.lineTo(sx + s * 0.1, sy - s * 0.75); ctx.closePath(); ctx.fill();
        } else if (this.isBoss) {
            // Pulsing aura rings
            for (let i = 0; i < 3; i++) { ctx.globalAlpha = (0.08 - i * 0.02) * this.alpha; ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, s * 1.2 + i * 8 + Math.sin(t * 2 + i) * 4, 0, Math.PI * 2); ctx.stroke(); }
            ctx.globalAlpha = this.alpha;
            ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = darkCol; ctx.beginPath(); ctx.arc(sx, sy, s * 0.65, 0, Math.PI * 2); ctx.fill();
            // Crown
            if (!flash) { const cy = sy - s * 0.8; ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.moveTo(sx - s * 0.5, cy); ctx.lineTo(sx - s * 0.4, cy - s * 0.4); ctx.lineTo(sx - s * 0.15, cy - s * 0.12); ctx.lineTo(sx, cy - s * 0.45); ctx.lineTo(sx + s * 0.15, cy - s * 0.12); ctx.lineTo(sx + s * 0.4, cy - s * 0.4); ctx.lineTo(sx + s * 0.5, cy); ctx.closePath(); ctx.fill(); }
        } else {
            // Zombie — shambling body with arms
            const w = Math.sin(t * 4) * 1.5;
            ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(sx + w, sy, s * 0.85, s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = darkCol; ctx.beginPath(); ctx.ellipse(sx + w, sy + s * 0.1, s * 0.55, s * 0.65, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = col; ctx.lineWidth = s * 0.2; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(sx - s * 0.7, sy); ctx.lineTo(sx - s * 1.1 + Math.sin(t * 4) * 2, sy + s * 0.35); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(sx + s * 0.7, sy); ctx.lineTo(sx + s * 1.1 + Math.sin(t * 4 + 1.5) * 2, sy + s * 0.35); ctx.stroke();
            ctx.lineCap = 'butt';
        }

        // === EYES ===
        if (!flash) {
            if (this.type === 'ghost') {
                ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(sx - s * 0.25, sy - s * 0.25, s * 0.14, s * 0.18, 0, 0, Math.PI * 2); ctx.ellipse(sx + s * 0.25, sy - s * 0.25, s * 0.14, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#224'; ctx.beginPath(); ctx.arc(sx - s * 0.25, sy - s * 0.2, s * 0.06, 0, Math.PI * 2); ctx.arc(sx + s * 0.25, sy - s * 0.2, s * 0.06, 0, Math.PI * 2); ctx.fill();
            } else if (this.type === 'skeleton') {
                ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(sx - s * 0.22, sy - s * 0.3, s * 0.15, 0, Math.PI * 2); ctx.arc(sx + s * 0.22, sy - s * 0.3, s * 0.15, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ff4444'; ctx.beginPath(); ctx.arc(sx - s * 0.22, sy - s * 0.3, s * 0.06, 0, Math.PI * 2); ctx.arc(sx + s * 0.22, sy - s * 0.3, s * 0.06, 0, Math.PI * 2); ctx.fill();
            } else if (this.type === 'demon') {
                ctx.fillStyle = '#ffaa00'; ctx.beginPath(); ctx.arc(sx - s * 0.3, sy - s * 0.15, s * 0.15, 0, Math.PI * 2); ctx.arc(sx + s * 0.3, sy - s * 0.15, s * 0.15, 0, Math.PI * 2); ctx.fill();
            } else if (this.isBoss) {
                ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(sx - s * 0.25, sy - s * 0.15, s * 0.12, 0, Math.PI * 2); ctx.arc(sx + s * 0.25, sy - s * 0.15, s * 0.12, 0, Math.PI * 2); ctx.fill();
            } else if (this.type === 'bat') {
                ctx.fillStyle = '#ff6666'; ctx.beginPath(); ctx.arc(sx - s * 0.15, sy - s * 0.15, s * 0.12, 0, Math.PI * 2); ctx.arc(sx + s * 0.15, sy - s * 0.15, s * 0.12, 0, Math.PI * 2); ctx.fill();
            } else {
                const ew = Math.sin(t * 4) * 1.5;
                ctx.fillStyle = '#ff3333'; ctx.beginPath(); ctx.arc(sx - s * 0.25 + ew, sy - s * 0.2, s * 0.14, 0, Math.PI * 2); ctx.arc(sx + s * 0.25 + ew, sy - s * 0.2, s * 0.14, 0, Math.PI * 2); ctx.fill();
            }
        }

        // === HEALTH BAR (color-coded) ===
        if (this.isBoss || this.hp < this.maxHp) {
            const bw = s * 2.2, bh = 3, by = sy - s - (this.isBoss ? 14 : 8);
            ctx.globalAlpha = 0.8; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(sx - bw / 2 - 1, by - 1, bw + 2, bh + 2);
            const hpPct = this.hp / this.maxHp;
            ctx.fillStyle = this.isBoss ? '#ff4444' : `hsl(${hpPct * 120}, 80%, 50%)`;
            ctx.fillRect(sx - bw / 2, by, bw * hpPct, bh);
        }
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
    update(dt) { this.trail.push({ x: this.x, y: this.y }); if (this.trail.length > 8) this.trail.shift(); this.x += this.vx * dt; this.y += this.vy * dt; this.lifetime -= dt; return this.lifetime > 0; }
    draw(ctx, cam) {
        const sx = this.x - cam.x, sy = this.y - cam.y;

        if (this.isManualShot) {
            // === ENERGY BOLT (manual shot) ===
            const ang = Math.atan2(this.vy, this.vx);
            const len = this.size * 3;
            const cx = Math.cos(ang), sn = Math.sin(ang);

            // Trail with elongated streaks
            for (let i = 0; i < this.trail.length; i++) {
                const t = this.trail[i], progress = i / this.trail.length;
                ctx.globalAlpha = progress * 0.3;
                ctx.strokeStyle = this.color; ctx.lineWidth = this.size * progress * 0.6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(t.x - cam.x - cx * 4, t.y - cam.y - sn * 4);
                ctx.lineTo(t.x - cam.x + cx * 4, t.y - cam.y + sn * 4);
                ctx.stroke();
            }
            // Outer glow
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.arc(sx, sy, this.size * 3, 0, Math.PI * 2); ctx.fill();
            // Elongated bolt body
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color; ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.moveTo(sx + cx * len, sy + sn * len);
            ctx.lineTo(sx - sn * this.size * 0.6, sy + cx * this.size * 0.6);
            ctx.lineTo(sx - cx * len * 0.5, sy - sn * len * 0.5);
            ctx.lineTo(sx + sn * this.size * 0.6, sy - cx * this.size * 0.6);
            ctx.closePath(); ctx.fill();
            // Hot white core
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(sx + cx * 2, sy + sn * 2, this.size * 0.4, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineCap = 'butt';
        } else {
            // === STANDARD PROJECTILE ===
            for (let i = 0; i < this.trail.length; i++) {
                const t = this.trail[i], progress = i / this.trail.length;
                ctx.globalAlpha = progress * 0.45;
                ctx.fillStyle = this.color;
                ctx.beginPath(); ctx.arc(t.x - cam.x, t.y - cam.y, this.size * (0.2 + progress * 0.5), 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.arc(sx, sy, this.size * 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color; ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(sx, sy, this.size, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(sx, sy, this.size * 0.35, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
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
// MOBILE DUAL JOYSTICK CONTROLLER
// Canvas-drawn joysticks — always at fixed screen positions
// Left = movement, Right = shoot
// ============================================================
class JoystickController {
    constructor(canvas) {
        this.canvas = canvas;
        this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        // Joystick visual config
        this.baseRadius = 50;
        this.stickRadius = 22;

        // Left joystick state
        this.leftActive = false;
        this.leftTouchId = null;
        this.dx = 0;
        this.dy = 0;

        // Right joystick state
        this.rightActive = false;
        this.rightTouchId = null;
        this.aimX = 0;
        this.aimY = 0;
        this.aiming = false;

        this.maxDist = 50;
        this.active = false;
        this.hudVisible = false;

        if (this.isMobile) {
            this.bindTouch();
        }
    }

    // Fixed screen positions for joystick centers
    _leftCenter() {
        return { x: 90, y: this.canvas.height - 90 };
    }
    _rightCenter() {
        return { x: this.canvas.width - 90, y: this.canvas.height - 90 };
    }

    _clampDir(rawDx, rawDy) {
        const d = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
        if (d === 0) return { dx: 0, dy: 0 };
        const scale = Math.min(d, this.maxDist) / this.maxDist;
        return { dx: (rawDx / d) * scale, dy: (rawDy / d) * scale };
    }

    _isLeftSide(x) {
        return x < this.canvas.width / 2;
    }

    bindTouch() {
        this.canvas.addEventListener('touchstart', (e) => {
            if (!this.hudVisible) return;
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (this._isLeftSide(t.clientX)) {
                    // Left joystick
                    if (this.leftTouchId !== null) continue;
                    this.leftTouchId = t.identifier;
                    this.leftActive = true;
                    this.active = true;
                    const c = this._leftCenter();
                    const dir = this._clampDir(t.clientX - c.x, t.clientY - c.y);
                    this.dx = dir.dx;
                    this.dy = dir.dy;
                } else {
                    // Right joystick
                    if (this.rightTouchId !== null) continue;
                    this.rightTouchId = t.identifier;
                    this.rightActive = true;
                    this.aiming = true;
                    const c = this._rightCenter();
                    const dir = this._clampDir(t.clientX - c.x, t.clientY - c.y);
                    this.aimX = dir.dx;
                    this.aimY = dir.dy;
                }
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            if (!this.hudVisible) return;
            for (const t of e.changedTouches) {
                if (t.identifier === this.leftTouchId && this.leftActive) {
                    const c = this._leftCenter();
                    const dir = this._clampDir(t.clientX - c.x, t.clientY - c.y);
                    this.dx = dir.dx;
                    this.dy = dir.dy;
                }
                if (t.identifier === this.rightTouchId && this.rightActive) {
                    const c = this._rightCenter();
                    const dir = this._clampDir(t.clientX - c.x, t.clientY - c.y);
                    this.aimX = dir.dx;
                    this.aimY = dir.dy;
                }
            }
        }, { passive: false });

        const endTouch = (e) => {
            for (const t of e.changedTouches) {
                if (t.identifier === this.leftTouchId) {
                    this.leftActive = false;
                    this.leftTouchId = null;
                    this.active = false;
                    this.dx = 0;
                    this.dy = 0;
                }
                if (t.identifier === this.rightTouchId) {
                    this.rightActive = false;
                    this.rightTouchId = null;
                    this.aiming = false;
                    this.aimX = 0;
                    this.aimY = 0;
                }
            }
        };
        window.addEventListener('touchend', endTouch);
        window.addEventListener('touchcancel', endTouch);
    }

    // Draw both joysticks on the game canvas
    drawJoysticks(ctx) {
        if (!this.isMobile || !this.hudVisible) return;

        const lc = this._leftCenter();
        const rc = this._rightCenter();

        // --- Left joystick (move) ---
        // Base circle
        ctx.beginPath();
        ctx.arc(lc.x, lc.y, this.baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Stick circle (always centered)
        ctx.beginPath();
        ctx.arc(lc.x, lc.y, this.stickRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.leftActive ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '700 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MOVE', lc.x, lc.y + this.baseRadius + 16);

        // --- Right joystick (shoot) ---
        // Base circle
        ctx.beginPath();
        ctx.arc(rc.x, rc.y, this.baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,60,60,0.04)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,68,68,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Stick circle (always centered)
        ctx.beginPath();
        ctx.arc(rc.x, rc.y, this.stickRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.rightActive ? 'rgba(255,100,100,0.4)' : 'rgba(255,100,100,0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,100,100,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '700 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SHOOT', rc.x, rc.y + this.baseRadius + 16);
    }

    getInput() {
        return { x: this.dx, y: this.dy };
    }

    getAim() {
        if (!this.aiming && !this.rightActive) return null;
        const len = Math.sqrt(this.aimX * this.aimX + this.aimY * this.aimY);
        if (len < 0.15) return null;
        return { x: this.aimX / len, y: this.aimY / len };
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
        this.joystick = new JoystickController(this.canvas);

        this.keys = {};
        this.lastFacing = { x: 1, y: 0 };
        this.mouseAim = null;
        this.mouseDown = false;
        this.screenShake = { x: 0, y: 0, intensity: 0 };
        this.state = 'menu';
        this.paused = false;
        this.animTime = 0;

        // Generate background stars
        this.stars = [];
        for (let i = 0; i < 200; i++) {
            this.stars.push({
                x: Math.random() * CONFIG.WORLD_SIZE,
                y: Math.random() * CONFIG.WORLD_SIZE,
                size: Math.random() * 1.8 + 0.5,
                brightness: Math.random(),
                twinkleSpeed: Math.random() * 2 + 1,
                parallax: Math.random() * 0.3 + 0.7,
            });
        }
        // Nebula fog patches
        this.nebulae = [];
        for (let i = 0; i < 12; i++) {
            this.nebulae.push({
                x: Math.random() * CONFIG.WORLD_SIZE,
                y: Math.random() * CONFIG.WORLD_SIZE,
                radius: Math.random() * 200 + 100,
                color: randChoice(['rgba(0,100,255,', 'rgba(100,0,200,', 'rgba(0,200,150,', 'rgba(200,0,80,']),
                parallax: Math.random() * 0.2 + 0.8,
            });
        }

        this.resize();
        this.bindEvents();
        this.bindPauseEvents();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.miniCanvas.width = this.joystick.isMobile ? 60 : 80;
        this.miniCanvas.height = this.joystick.isMobile ? 60 : 80;
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

        // Mouse aiming + click to shoot (desktop)
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.state !== 'playing') return;
            this.mouseAim = { x: e.clientX, y: e.clientY };
        });
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.state !== 'playing' || e.button !== 0) return;
            this.mouseDown = true;
        });
        window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
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
        if (this.audio.bgMusic) this.audio.bgMusic.pause();
        document.getElementById('pause-screen').classList.add('active');
    }

    resumeGame() {
        if (!this.paused) return;
        this.paused = false;
        this.state = 'playing';
        if (this.audio.bgMusic && this.audio.musicOn) this.audio.bgMusic.play().catch(() => {});
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
        // Tell joystick controller whether HUD is visible (for canvas drawing)
        this.joystick.hudVisible = visible;
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
        this.playerTrail = [];
        this.animTime = 0;
        this.enemies = []; this.projectiles = []; this.gems = []; this.particles = [];
        this.damageNumbers = []; this.zones = []; this.lightnings = [];
        this.healthSupplies = []; this.healthSpawnTimer = rand(10, 18);
        this.gameTime = 0; this.kills = 0; this.enemySpawnTimer = 0;
        this.bossTimer = CONFIG.BOSS_INTERVAL; this.difficultyScale = 1;
        this.shootTimer = 0;
        this.shootCombo = 0;
        this.shootComboTimer = 0;

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
        this.animTime += dt;
        this.difficultyScale = 1 + this.gameTime / 60;
        // Player afterimage trail
        if (this.player) {
            this.playerTrail.push({ x: this.player.x, y: this.player.y, life: 0.3 });
            if (this.playerTrail.length > 8) this.playerTrail.shift();
            this.playerTrail.forEach(t => t.life -= dt);
            this.playerTrail = this.playerTrail.filter(t => t.life > 0);
        }
        this.updatePlayer(dt);
        this.updateManualShoot(dt);
        this.updateWeapons(dt);
        this.updateProjectiles(dt);
        this.updateZones(dt);
        this.updateEnemies(dt);
        this.updateGems(dt);
        this.updateHealthSupplies(dt);
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
            // Only update facing from movement if not using aim joystick
            const aim = this.joystick.getAim();
            if (!aim) {
                this.lastFacing = { x: dx / Math.max(Math.abs(dx), Math.abs(dy), 0.01), y: dy / Math.max(Math.abs(dx), Math.abs(dy), 0.01) };
            }
        }

        // Right joystick aim overrides facing direction
        const aim = this.joystick.getAim();
        if (aim) {
            this.lastFacing = { x: aim.x, y: aim.y };
        }

        p.x += dx * p.speed * dt;
        p.y += dy * p.speed * dt;
        p.x = clamp(p.x, 30, CONFIG.WORLD_SIZE - 30);
        p.y = clamp(p.y, 30, CONFIG.WORLD_SIZE - 30);
        p.invincibleTimer = Math.max(0, p.invincibleTimer - dt * 1000);
    }

    // ========================================================
    // MANUAL SHOOT (SHOOT joystick / Mouse click / Spacebar)
    // ========================================================
    updateManualShoot(dt) {
        this.shootTimer -= dt * 1000;
        this.shootComboTimer -= dt;
        if (this.shootComboTimer <= 0) this.shootCombo = 0;

        // Determine if shooting + direction
        let shootDir = null;
        const aim = this.joystick.getAim();
        if (aim) {
            // Mobile SHOOT joystick
            shootDir = Math.atan2(aim.y, aim.x);
        } else if (this.mouseDown && this.mouseAim) {
            // Desktop mouse click
            const p = this.player, cam = this.camera;
            const mx = this.mouseAim.x + cam.x - p.x;
            const my = this.mouseAim.y + cam.y - p.y;
            shootDir = Math.atan2(my, mx);
        } else if (this.keys[' ']) {
            // Spacebar: fire in facing direction
            shootDir = Math.atan2(this.lastFacing.y, this.lastFacing.x);
        }

        if (shootDir === null || this.shootTimer > 0) return;

        const p = this.player;
        // Damage scales with level + might
        const levelBonus = 1 + (p.level - 1) * 0.15;
        const baseDmg = CONFIG.SHOOT_BASE_DAMAGE * levelBonus * p.mightMult;
        // Combo: rapid hits increase damage slightly
        const comboDmg = baseDmg * (1 + this.shootCombo * 0.05);
        const finalDmg = Math.floor(comboDmg);

        // Cooldown gets slightly faster at higher levels (min 100ms)
        const cd = Math.max(100, CONFIG.SHOOT_COOLDOWN - p.level * 4);
        this.shootTimer = cd;

        // Pierce increases every 5 levels
        const pierce = CONFIG.SHOOT_PIERCE + Math.floor(p.level / 5);

        // Fire the shot
        const spd = CONFIG.SHOOT_SPEED;
        const proj = new Projectile(
            p.x, p.y,
            Math.cos(shootDir) * spd, Math.sin(shootDir) * spd,
            finalDmg, '#00eeff', CONFIG.SHOOT_SIZE, pierce, CONFIG.SHOOT_LIFETIME
        );
        proj.isManualShot = true;
        this.projectiles.push(proj);

        // Muzzle flash particles
        for (let i = 0; i < 3; i++) {
            const spread = shootDir + rand(-0.4, 0.4);
            this.addParticle(p.x + Math.cos(shootDir) * 20, p.y + Math.sin(shootDir) * 20,
                randChoice(['#00eeff', '#88ffff', '#ffffff']), rand(40, 100), 0.15, rand(1.5, 3));
        }

        // Update combo
        this.shootCombo = Math.min(this.shootCombo + 1, 20);
        this.shootComboTimer = 0.8;

        // SFX
        this.audio.play('shoot');
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

    // ========================================================
    // HEALTH SUPPLIES
    // ========================================================
    updateHealthSupplies(dt) {
        // Spawn timer: new health supply every 15-25 seconds
        this.healthSpawnTimer -= dt;
        if (this.healthSpawnTimer <= 0 && this.healthSupplies.length < 5) {
            this.healthSpawnTimer = rand(15, 25);
            // Spawn at random position within the world, near-ish to the player
            const a = Math.random() * Math.PI * 2;
            const d = rand(200, 600);
            let sx = this.player.x + Math.cos(a) * d;
            let sy = this.player.y + Math.sin(a) * d;
            // Clamp to world bounds
            sx = Math.max(50, Math.min(CONFIG.WORLD_SIZE - 50, sx));
            sy = Math.max(50, Math.min(CONFIG.WORLD_SIZE - 50, sy));
            // Heal amount: 10-25 HP
            const heal = Math.floor(rand(10, 25));
            this.healthSupplies.push(new HealthSupply(sx, sy, heal));
        }

        this.healthSupplies = this.healthSupplies.filter(h => {
            const result = h.update(dt, this.player);
            if (result === 'picked') {
                const healed = Math.min(h.healAmount, this.player.maxHp - this.player.hp);
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + h.healAmount);
                this.audio.play('pickup');
                this.addDamageNumber(h.x, h.y - 15, '+' + healed, '#44ff66');
                for (let i = 0; i < 6; i++) this.addParticle(h.x, h.y, '#44ff66', 60, 0.4, 3);
                return false;
            }
            if (result === 'expired') return false;
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

        // Deep space background
        const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
        bgGrad.addColorStop(0, '#14141e');
        bgGrad.addColorStop(1, '#080810');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Nebula fog patches
        for (const n of this.nebulae) {
            const nx = n.x * n.parallax - cam.x * n.parallax, ny = n.y * n.parallax - cam.y * n.parallax;
            if (nx < -n.radius * 2 || nx > W + n.radius * 2 || ny < -n.radius * 2 || ny > H + n.radius * 2) continue;
            const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, n.radius);
            grad.addColorStop(0, n.color + '0.04)');
            grad.addColorStop(1, n.color + '0)');
            ctx.fillStyle = grad;
            ctx.fillRect(nx - n.radius, ny - n.radius, n.radius * 2, n.radius * 2);
        }

        // Twinkling stars
        const at = this.animTime;
        for (const s of this.stars) {
            const starX = s.x * s.parallax - cam.x * s.parallax;
            const starY = s.y * s.parallax - cam.y * s.parallax;
            if (starX < -5 || starX > W + 5 || starY < -5 || starY > H + 5) continue;
            const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(at * s.twinkleSpeed + s.brightness * 10));
            ctx.globalAlpha = twinkle * 0.5;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(starX, starY, s.size, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;

        this.drawGrid(ctx, cam, W, H);
        this.drawWorldBorder(ctx, cam);
        for (const z of this.zones) z.draw(ctx, cam);
        for (const g of this.gems) { const sx = g.x - cam.x, sy = g.y - cam.y; if (sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50) g.draw(ctx, cam); }
        for (const h of this.healthSupplies) { const sx = h.x - cam.x, sy = h.y - cam.y; if (sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50) h.draw(ctx, cam); }
        for (const e of this.enemies) { const sx = e.x - cam.x, sy = e.y - cam.y; if (sx > -100 && sx < W + 100 && sy > -100 && sy < H + 100) e.draw(ctx, cam); }
        this.drawPlayer(ctx, cam);
        this.drawOrbitWeapons(ctx, cam);
        this.drawAuraWeapons(ctx, cam);
        for (const p of this.projectiles) { const sx = p.x - cam.x, sy = p.y - cam.y; if (sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50) p.draw(ctx, cam); }
        for (const l of this.lightnings) this.drawLightning(ctx, cam, l);
        for (const p of this.particles) p.draw(ctx, cam);
        for (const d of this.damageNumbers) d.draw(ctx, cam);

        // Vignette overlay
        const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, W, H);

        this.drawMinimap();
        this.drawCrosshair(ctx);
        this.joystick.drawJoysticks(ctx);
    }

    drawGrid(ctx, cam, W, H) {
        const gs = CONFIG.GRID_SIZE;
        const startX = Math.floor(cam.x / gs) * gs;
        const startY = Math.floor(cam.y / gs) * gs;
        const px = this.player ? this.player.x : cam.x + W / 2;
        const py = this.player ? this.player.y : cam.y + H / 2;

        for (let x = startX; x < cam.x + W + gs; x += gs) {
            for (let y = startY; y < cam.y + H + gs; y += gs) {
                const scrX = x - cam.x, scrY = y - cam.y;
                const d = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
                const proximity = Math.max(0, 1 - d / 400);
                const alpha = 0.025 + proximity * 0.08;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = proximity > 0.3 ? `rgba(0,180,255,1)` : 'rgba(255,255,255,1)';
                ctx.beginPath(); ctx.arc(scrX, scrY, 1 + proximity * 1.5, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    drawWorldBorder(ctx, cam) {
        const ws = CONFIG.WORLD_SIZE, t = this.animTime;
        const pulse = 0.6 + 0.4 * Math.sin(t * 1.5);
        ctx.strokeStyle = `rgba(255,50,50,${(0.5 + pulse * 0.3).toFixed(2)})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 15 + pulse * 10;
        ctx.strokeRect(-cam.x, -cam.y, ws, ws);
        // Inner double edge
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(255,100,100,${(0.15 + pulse * 0.15).toFixed(2)})`;
        ctx.strokeRect(-cam.x + 5, -cam.y + 5, ws - 10, ws - 10);
        ctx.shadowBlur = 0;
    }

    drawPlayer(ctx, cam) {
        const p = this.player, sx = p.x - cam.x, sy = p.y - cam.y;
        const t = this.animTime;
        const breathe = 1 + Math.sin(t * 2.5) * 0.03;

        // Afterimage trail
        for (const tr of this.playerTrail) {
            const ta = clamp(tr.life / 0.3, 0, 1) * 0.12;
            ctx.globalAlpha = ta;
            ctx.fillStyle = '#4488ff';
            ctx.beginPath(); ctx.arc(tr.x - cam.x, tr.y - cam.y, 14, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Pickup radius subtle ring
        ctx.globalAlpha = 0.04;
        ctx.strokeStyle = '#00bfff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, p.pickupRadius, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;

        // Shadow
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(sx, sy + 18, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;

        if (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer / 80) % 2 === 0) ctx.globalAlpha = 0.5;

        // Outer energy glow
        const glowPulse = 0.15 + Math.sin(t * 3) * 0.05;
        ctx.globalAlpha = glowPulse;
        ctx.fillStyle = '#4488ff';
        ctx.beginPath(); ctx.arc(sx, sy, 26 * breathe, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer / 80) % 2 === 0) ? 0.5 : 1;

        // Body
        ctx.fillStyle = '#4488ff';
        ctx.beginPath(); ctx.arc(sx, sy, 16 * breathe, 0, Math.PI * 2); ctx.fill();
        // Inner highlight
        ctx.fillStyle = '#6aadff';
        ctx.beginPath(); ctx.arc(sx - 2, sy - 2, 10 * breathe, 0, Math.PI * 2); ctx.fill();
        // Specular
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(sx - 5, sy - 6, 4, 0, Math.PI * 2); ctx.fill();

        // Eyes
        const ex = this.lastFacing.x * 4, ey = this.lastFacing.y * 4;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx - 4 + ex, sy - 3 + ey, 3.5, 0, Math.PI * 2); ctx.arc(sx + 4 + ex, sy - 3 + ey, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(sx - 4 + ex * 1.2, sy - 3 + ey * 1.2, 1.8, 0, Math.PI * 2); ctx.arc(sx + 4 + ex * 1.2, sy - 3 + ey * 1.2, 1.8, 0, Math.PI * 2); ctx.fill();

        // Shield ring when invincible
        if (p.invincibleTimer > 0) {
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = '#00ffee'; ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath(); ctx.arc(sx, sy, 22, t * 8, t * 8 + Math.PI * 1.8); ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;

        // Player name tag (outlined)
        if (typeof social !== 'undefined' && social.user) {
            ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
            const displayName = social.clan ? `[${social.clan.tag}] ${social.user.name}` : social.user.name;
            ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
            ctx.strokeText(displayName, sx, sy - 26);
            ctx.fillStyle = '#00e0ff'; ctx.globalAlpha = 0.9;
            ctx.fillText(displayName, sx, sy - 26);
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
                // Comet trail
                for (let j = 1; j <= 5; j++) {
                    const ta = a - j * 0.12;
                    const tx = p.x + Math.cos(ta) * radius - cam.x, ty = p.y + Math.sin(ta) * radius - cam.y;
                    ctx.globalAlpha = (1 - j / 5) * 0.2;
                    ctx.fillStyle = w.color;
                    ctx.beginPath(); ctx.arc(tx, ty, 8 - j, 0, Math.PI * 2); ctx.fill();
                }
                // Glow
                ctx.globalAlpha = 0.25; ctx.fillStyle = w.color;
                ctx.beginPath(); ctx.arc(ox, oy, 16, 0, Math.PI * 2); ctx.fill();
                // Core
                ctx.globalAlpha = 1; ctx.fillStyle = w.color;
                ctx.shadowColor = w.color; ctx.shadowBlur = 12;
                ctx.beginPath(); ctx.arc(ox, oy, 8, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                // Bright center
                ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7;
                ctx.beginPath(); ctx.arc(ox - 2, oy - 2, 3, 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
            }
        }
    }

    drawAuraWeapons(ctx, cam) {
        const p = this.player, t = this.animTime;
        for (const w of p.weapons) {
            if (w.type !== 'aura') continue;
            const radius = 80 * Math.pow(WEAPON_DEFS[w.id].evolvePerLevel.radiusMult || 1, w.level - 1);
            const sx = p.x - cam.x, sy = p.y - cam.y;
            // Animated pulse fill
            const pulse = 0.06 + Math.sin(t * 4) * 0.03;
            ctx.globalAlpha = pulse; ctx.fillStyle = w.color;
            ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.fill();
            // Rotating dashed ring
            ctx.globalAlpha = 0.25; ctx.strokeStyle = w.color; ctx.lineWidth = 2;
            ctx.setLineDash([10, 8]);
            ctx.beginPath(); ctx.arc(sx, sy, radius, t * 1.5, t * 1.5 + Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            // Outer subtle ring
            ctx.globalAlpha = 0.08; ctx.strokeStyle = w.color; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(sx, sy, radius + 6 + Math.sin(t * 3) * 3, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    drawLightning(ctx, cam, l) {
        const alpha = l.life / l.maxLife;
        const x1 = l.x1 - cam.x, y1 = l.y1 - cam.y;
        const x2 = l.x2 - cam.x, y2 = l.y2 - cam.y;
        // Generate jagged path
        const points = [{ x: x1, y: y1 }];
        for (let i = 1; i <= 7; i++) {
            const t = i / 8;
            points.push({ x: lerp(x1, x2, t) + (i < 7 ? rand(-25, 25) : 0), y: lerp(y1, y2, t) + (i < 7 ? rand(-25, 25) : 0) });
        }
        points.push({ x: x2, y: y2 });
        // Outer glow stroke
        ctx.globalAlpha = alpha * 0.4; ctx.strokeStyle = '#ffee44'; ctx.lineWidth = 8;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
        // Bright core stroke
        ctx.globalAlpha = alpha; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
        ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        ctx.globalAlpha = 1;
    }

    drawMinimap() {
        const mc = this.miniCtx, mw = this.miniCanvas.width, mh = this.miniCanvas.height, sc = mw / CONFIG.WORLD_SIZE;
        mc.fillStyle = 'rgba(5,8,15,0.85)'; mc.fillRect(0, 0, mw, mh);
        // Enemy dots
        mc.fillStyle = 'rgba(255,60,60,0.7)';
        for (const e of this.enemies) { const sz = e.isBoss ? 3 : 1.5; mc.fillRect(e.x * sc - sz / 2, e.y * sc - sz / 2, sz, sz); }
        // Gems (tiny green dots)
        mc.fillStyle = 'rgba(68,255,68,0.4)';
        for (const g of this.gems) mc.fillRect(g.x * sc, g.y * sc, 1, 1);
        // Player glow + dot
        mc.fillStyle = 'rgba(68,136,255,0.3)';
        mc.beginPath(); mc.arc(this.player.x * sc, this.player.y * sc, 5, 0, Math.PI * 2); mc.fill();
        mc.fillStyle = '#4488ff';
        mc.beginPath(); mc.arc(this.player.x * sc, this.player.y * sc, 2.5, 0, Math.PI * 2); mc.fill();
        // Viewport outline
        mc.strokeStyle = 'rgba(0,200,255,0.35)'; mc.lineWidth = 1;
        mc.strokeRect(this.camera.x * sc, this.camera.y * sc, this.canvas.width * sc, this.canvas.height * sc);
        // Border
        mc.strokeStyle = 'rgba(0,200,255,0.2)'; mc.lineWidth = 1;
        mc.strokeRect(0, 0, mw, mh);
    }

    drawCrosshair(ctx) {
        // Show a crosshair in the shoot direction (mobile joystick or mouse)
        let aimDir = null;
        const aim = this.joystick.getAim();
        if (aim) {
            aimDir = { x: aim.x, y: aim.y };
        } else if (this.mouseDown && this.mouseAim) {
            const p = this.player, cam = this.camera;
            const mx = this.mouseAim.x + cam.x - p.x;
            const my = this.mouseAim.y + cam.y - p.y;
            const len = Math.sqrt(mx * mx + my * my);
            if (len > 0) aimDir = { x: mx / len, y: my / len };
        }
        if (!aimDir) return;

        const p = this.player, cam = this.camera;
        const sx = p.x - cam.x + this.screenShake.x;
        const sy = p.y - cam.y + this.screenShake.y;
        const dist = 55;
        const cx = sx + aimDir.x * dist;
        const cy = sy + aimDir.y * dist;
        const t = this.animTime;
        const pulse = 0.4 + Math.sin(t * 8) * 0.15;

        ctx.globalAlpha = pulse;
        ctx.strokeStyle = '#00eeff';
        ctx.lineWidth = 1.5;
        // Outer ring
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
        // Cross lines
        const g = 3, e = 7;
        ctx.beginPath(); ctx.moveTo(cx - e, cy); ctx.lineTo(cx - g, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + g, cy); ctx.lineTo(cx + e, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - e); ctx.lineTo(cx, cy - g); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + g); ctx.lineTo(cx, cy + e); ctx.stroke();
        // Center dot
        ctx.globalAlpha = pulse + 0.2;
        ctx.fillStyle = '#00eeff';
        ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
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
        // Restart lobby music for lobby/gameover screens
        this.audio.startLobbyMusic();
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
