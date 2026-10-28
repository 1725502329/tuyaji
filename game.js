(() => {
  'use strict';

  /* =========================================================
     涂鸦鸡
     A very small pet game about the original scribbled chick.
     No dependencies, no servers, no sad endings.
     ========================================================= */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  const SAVE_KEY = 'doodle-chick-v2';
  const PHOTO_KEY = 'doodle-chick-original-photo-v1';
  const STAT_KEYS = ['satiety', 'clean', 'mood', 'energy'];
  const STAT_LABELS = { satiety: '饱腹', clean: '清洁', mood: '心情', energy: '精力' };
  const STAT_XP = { feed: 7, bath: 10, play: 9, pet: 5, nap: 4 };
  const MAX_FX = 150;

  const BOND_LEVELS = [
    { xp: 0, name: '初次见面' },
    { xp: 40, name: '点头之交' },
    { xp: 110, name: '小跟班' },
    { xp: 210, name: '好伙伴' },
    { xp: 340, name: '贴心朋友' },
    { xp: 500, name: '形影不离' },
    { xp: 700, name: '灵魂搭子' },
    { xp: 950, name: '最佳拍档' },
    { xp: 1250, name: '像家人一样' },
    { xp: 1600, name: '命中注定的搭子' }
  ];

  const FOODS = {
    apple: {
      name: '脆脆苹果',
      satiety: 24,
      mood: 3,
      energy: 2,
      line: '咔嚓！苹果脆得像一张新纸。'
    },
    riceball: {
      name: '海苔饭团',
      satiety: 34,
      mood: 1,
      energy: 7,
      line: '饭团把肚子填得满满当当。'
    },
    cookie: {
      name: '星星饼干',
      satiety: 16,
      mood: 9,
      energy: -1,
      line: '先吃掉星星的五个角，嘿嘿。'
    }
  };

  const IDLE_LINES = [
    '今天也要一起发呆吗？',
    '我的肚子里好像住着一支铅笔。',
    '你闻到了吗？是阳光烤热纸张的味道。',
    '再摸一下，就一下。',
    '我刚刚练习了转圈，要看吗？',
    '草稿纸外面的世界，是不是也这么白？',
    '如果我是画出来的，那你会不会也是？',
    '我数过了，今天有 27 个泡泡。',
    '安静的时候，能听见铅笔沙沙响。',
    '我把开心藏在翅膀下面了。'
  ];

  const HAPPY_LINES = [
    '开心到要转圈圈啦！',
    '今天最喜欢你，明天再说。',
    '嘿！看我的转圈舞！',
    '心里冒出了好多好多小爱心。'
  ];

  const PLAY_SPOTS = [
    { x: 16, y: 27 },
    { x: 83, y: 27 },
    { x: 13, y: 58 },
    { x: 87, y: 57 },
    { x: 50, y: 17 }
  ];

  const BUBBLE_COLORS = ['#e8c56a', '#cf6a5b', '#a6c5cf', '#a9c8b6', '#bdb3cd'];

  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  /* ---------------- state ---------------- */

  let state;
  let mode = 'idle';
  let feedOpen = false;
  let bootOfflineMinutes = 0;
  let introOpen = true;
  let resetting = false;

  const bath = {
    active: false,
    progress: 0,
    scrubbing: false,
    lastX: 0,
    lastY: 0,
    foamAcc: 0,
    startDirt: 0.72,
    finished: false
  };

  const petting = {
    active: false,
    count: 0,
    lastStroke: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    timer: null
  };

  const play = {
    active: false,
    remaining: 0,
    total: 5,
    bubbles: []
  };

  let napTimer = null;
  let levelTimer = null;
  let speechTimer = null;
  let actionTimer = null;
  let danceFxTimer = null;
  let lastDanceAt = 0;
  let lastPetReactAt = 0;
  let tickCount = 0;
  let lastTickAt = Date.now();

  /* ---------------- persistence ---------------- */

  function defaultState() {
    return {
      version: 1,
      name: '涂鸦鸡',
      satiety: 64,
      clean: 70,
      mood: 78,
      energy: 84,
      bondXp: 12,
      counts: { feed: 0, bath: 0, play: 0, pet: 0 },
      daily: { date: '', feed: false, bath: false, play: false, claimed: false },
      sound: true,
      createdAt: Date.now(),
      lastSaved: Date.now(),
      introSeen: false
    };
  }

  function normalizeState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const base = defaultState();
    const merged = { ...base, ...source };

    const numberOr = (value, fallback) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    };

    merged.name = '涂鸦鸡';
    merged.satiety = clamp(numberOr(merged.satiety, base.satiety), 0, 100);
    merged.clean = clamp(numberOr(merged.clean, base.clean), 0, 100);
    merged.mood = clamp(numberOr(merged.mood, base.mood), 0, 100);
    merged.energy = clamp(numberOr(merged.energy, base.energy), 0, 100);
    merged.bondXp = clamp(numberOr(merged.bondXp, base.bondXp), 0, 99999);
    merged.sound = merged.sound !== false;
    merged.createdAt = numberOr(merged.createdAt, Date.now());
    merged.lastSaved = numberOr(merged.lastSaved, Date.now());
    merged.introSeen = Boolean(merged.introSeen);
    merged.counts = { ...base.counts, ...(source.counts || {}) };
    merged.daily = { ...base.daily, ...(source.daily || {}) };

    ['feed', 'bath', 'play', 'pet'].forEach((key) => {
      merged.counts[key] = Math.max(0, Number(merged.counts[key]) || 0);
    });

    return merged;
  }

  function applyOfflineDecay(target) {
    const elapsedMinutes = clamp((Date.now() - target.lastSaved) / 60000, 0, 120);
    if (elapsedMinutes < 1) return 0;

    target.satiety = clamp(target.satiety - elapsedMinutes * 0.32, 0, 100);
    target.clean = clamp(target.clean - elapsedMinutes * 0.25, 0, 100);
    target.mood = clamp(target.mood - elapsedMinutes * 0.17, 0, 100);
    target.energy = clamp(target.energy + elapsedMinutes * 0.16, 0, 100);
    target.lastSaved = Date.now();
    return elapsedMinutes;
  }

  function loadState() {
    let raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (error) {
      raw = null;
    }

    if (!raw) {
      return { state: defaultState(), fresh: true, offline: 0 };
    }

    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeState(parsed);
      const offline = applyOfflineDecay(normalized);
      return { state: normalized, fresh: false, offline };
    } catch (error) {
      return { state: defaultState(), fresh: true, offline: 0 };
    }
  }

  function saveState() {
    if (resetting) return;
    state.lastSaved = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (error) {
      /* localStorage can be unavailable for local files — the game still works. */
    }
  }

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function ensureDaily() {
    const today = dateKey();
    if (state.daily.date === today) return false;

    state.daily = {
      date: today,
      feed: false,
      bath: false,
      play: false,
      claimed: false
    };
    return true;
  }

  function dayNumber() {
    const elapsed = Date.now() - (Number(state.createdAt) || Date.now());
    return Math.max(1, Math.floor(elapsed / 86400000) + 1);
  }

  function bondInfo(xp) {
    let index = 0;
    for (let i = 0; i < BOND_LEVELS.length; i += 1) {
      if (xp >= BOND_LEVELS[i].xp) index = i;
    }

    const current = BOND_LEVELS[index];
    const next = BOND_LEVELS[index + 1] || null;
    const currentXp = xp - current.xp;
    const neededXp = next ? next.xp - current.xp : 0;
    const progress = next ? clamp(currentXp / neededXp, 0, 1) : 1;

    return {
      level: index + 1,
      name: current.name,
      currentXp,
      neededXp,
      progress,
      total: xp,
      next
    };
  }

  /* ---------------- dom ---------------- */

  const els = {
    stage: $('#stage'),
    speech: $('#speech'),
    speechText: $('#speechText'),
    dayText: $('#dayText'),
    soundBtn: $('#soundBtn'),
    helpBtn: $('#helpBtn'),
    quickNapBtn: $('#quickNapBtn'),
    petZone: $('#petZone'),
    petArt: $('#petArt'),
    petSvg: $('#petSvg'),
    petPhoto: $('#petPhoto'),
    photoTip: $('#photoTip'),
    petHit: $('#petHit'),
    petNameTag: $('#petNameTag'),
    spongeCursor: $('#spongeCursor'),
    fxLayer: $('#fxLayer'),
    bubbleLayer: $('#bubbleLayer'),
    modeBanner: $('#modeBanner'),
    modeIcon: $('#modeIcon'),
    modeText: $('#modeText'),
    modeFill: $('#modeFill'),
    modeCancel: $('#modeCancel'),
    levelPop: $('#levelPop'),
    levelPopText: $('#levelPopText'),
    feedTray: $('#feedTray'),
    feedClose: $('#feedClose'),
    foodCards: $$('.food-card'),
    profileName: $('#profileName'),
    levelBadge: $('#levelBadge'),
    rankName: $('#rankName'),
    mobileDaily: $('#mobileDaily'),
    bondText: $('#bondText'),
    bondFill: $('#bondFill'),
    napBtn: $('#napBtn'),
    missionDate: $('#missionDate'),
    missionItems: $$('.mission-list li'),
    missionNote: $('#missionNote'),
    missionStamp: $('#missionStamp'),
    feedCount: $('#feedCount'),
    bathCount: $('#bathCount'),
    playCount: $('#playCount'),
    petCount: $('#petCount'),
    careTip: $('#careTip'),
    feedBtn: $('#feedBtn'),
    bathBtn: $('#bathBtn'),
    petBtn: $('#petBtn'),
    playBtn: $('#playBtn'),
    introOverlay: $('#introOverlay'),
    startBtn: $('#startBtn'),
    helpOverlay: $('#helpOverlay'),
    helpCloseBtn: $('#helpCloseBtn'),
    helpResumeBtn: $('#helpResumeBtn'),
    loadPhotoBtn: $('#loadPhotoBtn'),
    photoInput: $('#photoInput'),
    resetBtn: $('#resetBtn'),
    toast: $('#toast'),
    meterRows: {},
    meterFills: {},
    meterValues: {}
  };

  STAT_KEYS.forEach((key) => {
    els.meterRows[key] = $(`.meter-row[data-stat="${key}"]`);
    els.meterFills[key] = $(`[data-fill="${key}"]`);
    els.meterValues[key] = $(`[data-value="${key}"]`);
  });

  /* ---------------- audio ---------------- */

  let audioCtx = null;
  let masterGain = null;

  function initAudio() {
    if (audioCtx) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;

    try {
      audioCtx = new AudioCtor();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = state.sound ? 0.2 : 0;
      masterGain.connect(audioCtx.destination);
    } catch (error) {
      audioCtx = null;
      masterGain = null;
    }
  }

  function unlockAudio() {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  function syncAudioGain() {
    if (masterGain) {
      masterGain.gain.value = state.sound ? 0.2 : 0;
    }
  }

  function playTone(freq, duration = 0.14, type = 'sine', delay = 0, volume = 0.38, slideTo = null) {
    if (!state.sound) return;
    initAudio();
    if (!audioCtx || !masterGain) return;

    try {
      const now = audioCtx.currentTime + delay;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    } catch (error) {
      /* Ignore audio scheduling hiccups. */
    }
  }

  function playNoise(duration = 0.28, volume = 0.16, cutoff = 1000, delay = 0) {
    if (!state.sound) return;
    initAudio();
    if (!audioCtx || !masterGain) return;

    try {
      const sampleCount = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
      const buffer = audioCtx.createBuffer(1, sampleCount, audioCtx.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i += 1) {
        channel[i] = Math.random() * 2 - 1;
      }

      const source = audioCtx.createBufferSource();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime + delay;

      source.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      source.start(now);
    } catch (error) {
      /* Ignore audio scheduling hiccups. */
    }
  }

  function sfx(name) {
    if (!state.sound) return;

    switch (name) {
      case 'click':
        playTone(560, 0.055, 'triangle', 0, 0.2, 660);
        break;
      case 'open':
        playTone(520, 0.09, 'sine', 0, 0.24, 760);
        playTone(780, 0.1, 'sine', 0.07, 0.2, 920);
        break;
      case 'eat':
        playNoise(0.09, 0.12, 1400);
        playNoise(0.08, 0.1, 900, 0.16);
        playTone(190, 0.12, 'square', 0.03, 0.12, 150);
        break;
      case 'water':
        playNoise(0.7, 0.13, 1900);
        playTone(680, 0.2, 'sine', 0.04, 0.16, 420);
        break;
      case 'scrub':
        playNoise(0.09, 0.07, 2200);
        break;
      case 'pop':
        playTone(360, 0.12, 'sine', 0, 0.3, 900);
        playTone(760, 0.08, 'triangle', 0.05, 0.16, 1120);
        break;
      case 'pet':
        playTone(660, 0.15, 'sine', 0, 0.24, 880);
        playTone(880, 0.18, 'sine', 0.1, 0.18, 1040);
        break;
      case 'happy':
        [523, 659, 784, 1047].forEach((note, index) => {
          playTone(note, 0.24, 'triangle', index * 0.095, 0.24);
        });
        break;
      case 'level':
        [392, 523, 659, 784, 1047].forEach((note, index) => {
          playTone(note, 0.32, 'triangle', index * 0.11, 0.26);
        });
        break;
      case 'sleep':
        playTone(440, 0.5, 'sine', 0, 0.16, 330);
        playTone(330, 0.6, 'sine', 0.35, 0.12, 262);
        break;
      case 'wake':
        playTone(523, 0.16, 'sine', 0, 0.22);
        playTone(784, 0.24, 'triangle', 0.12, 0.22);
        break;
      case 'refuse':
        playTone(220, 0.16, 'square', 0, 0.12, 190);
        playTone(180, 0.22, 'square', 0.12, 0.1, 150);
        break;
      default:
        break;
    }
  }

  /* ---------------- ui helpers ---------------- */

  function updateBondUI() {
    const info = bondInfo(state.bondXp);
    els.profileName.textContent = state.name;
    els.petSvg.setAttribute('aria-label', '涂鸦鸡：圆滚滚的黑色铅笔线身体、两个圈圈触角、面条手臂和火柴腿');
    document.title = '涂鸦鸡 · 草稿纸宠物';
    els.levelBadge.textContent = `Lv.${info.level}`;
    els.rankName.textContent = info.name;
    els.bondFill.style.width = `${Math.round(info.progress * 100)}%`;

    if (info.next) {
      els.bondText.textContent = `${Math.floor(info.currentXp)} / ${info.neededXp}`;
    } else {
      els.bondText.textContent = 'MAX';
    }
  }

  function updateStatsUI() {
    STAT_KEYS.forEach((key) => {
      const value = Math.round(state[key]);
      const row = els.meterRows[key];
      const fill = els.meterFills[key];
      const valueEl = els.meterValues[key];
      const track = row.querySelector('.meter-track');

      fill.style.width = `${value}%`;
      valueEl.textContent = String(value);
      row.classList.toggle('is-low', value < 28);

      track.setAttribute('aria-valuenow', String(value));
      track.setAttribute('aria-valuetext', `${STAT_LABELS[key]} ${value}`);
    });
  }

  function updateDailyUI() {
    const daily = state.daily;
    let doneCount = 0;

    els.missionItems.forEach((item) => {
      const task = item.dataset.task;
      const done = Boolean(daily[task]);
      item.classList.toggle('is-done', done);
      if (done) doneCount += 1;
    });

    els.missionStamp.hidden = !daily.claimed;

    if (daily.claimed) {
      els.missionNote.textContent = '今天也被好好照顾了，盖个章。';
    } else if (doneCount === 3) {
      els.missionNote.textContent = '三项都完成，正在盖章…';
    } else {
      els.missionNote.textContent = `完成 ${doneCount} / 3 项，全部完成 +20 亲密度。`;
    }

    if (els.mobileDaily) {
      els.mobileDaily.textContent = daily.claimed
        ? '今日照顾已达标 ✓'
        : `今日照顾 ${doneCount} / 3`;
    }

    const today = new Date();
    els.missionDate.textContent = `${today.getMonth() + 1}月${today.getDate()}日`;
  }

  function updateCountsUI() {
    els.feedCount.textContent = String(state.counts.feed || 0);
    els.bathCount.textContent = String(state.counts.bath || 0);
    els.playCount.textContent = String(state.counts.play || 0);
    els.petCount.textContent = String(state.counts.pet || 0);
  }

  function updateDayLabel() {
    const hour = new Date().getHours();
    const slot = hour < 6 ? '凌晨' : hour < 11 ? '上午' : hour < 14 ? '中午' : hour < 18 ? '下午' : '晚上';
    els.dayText.textContent = `第 ${dayNumber()} 天 · ${slot}`;
  }

  function updateCareTip() {
    let tip = '它不会生病，也不会离开。慢慢来就好。';
    if (state.satiety < 28) {
      tip = `${state.name}的肚子在打鼓，先喂点东西吧。`;
    } else if (state.clean < 30) {
      tip = '它身上沾了墨水，洗个澡会舒服很多。';
    } else if (state.energy < 25) {
      tip = '眼皮快合上了，让它打个盹吧。';
    } else if (state.mood < 35) {
      tip = '它今天有点安静，摸摸它或者玩会儿泡泡吧。';
    } else if (state.daily.claimed) {
      tip = '今天的照顾清单完成啦，它很满足。';
    }
    els.careTip.textContent = tip;
  }

  function syncSoundButton() {
    document.body.classList.toggle('is-muted', !state.sound);
    els.soundBtn.setAttribute('aria-pressed', String(state.sound));
    els.soundBtn.setAttribute('aria-label', state.sound ? '关闭音效' : '打开音效');
    syncAudioGain();
  }

  function updateUI() {
    updateBondUI();
    updateStatsUI();
    updateDailyUI();
    updateCountsUI();
    updateCareTip();
    updateDayLabel();
    syncSoundButton();

    els.petNameTag.textContent = state.name;
    els.napBtn.disabled = mode !== 'idle';
    if (els.quickNapBtn) els.quickNapBtn.disabled = mode !== 'idle';
  }

  function toast(message, duration = 2600) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    els.toast.style.animation = 'none';
    void els.toast.offsetWidth;
    els.toast.style.animation = '';

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      els.toast.hidden = true;
    }, duration);
  }

  function say(message, duration = 5200) {
    els.speechText.textContent = message;
    els.speech.classList.add('is-visible');
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      els.speech.classList.remove('is-visible');
    }, duration);
  }

  /* ---------------- bond + daily ---------------- */

  function showLevelPop(info) {
    els.levelPopText.textContent = `亲密度 Lv.${info.level} · ${info.name}`;
    els.levelPop.hidden = false;
    clearTimeout(levelTimer);
    levelTimer = setTimeout(() => {
      els.levelPop.hidden = true;
    }, 2800);
    spawnConfetti(18);
  }

  function addBond(amount, silent = false) {
    const before = bondInfo(state.bondXp).level;
    state.bondXp = Math.max(0, state.bondXp + amount);
    const after = bondInfo(state.bondXp);
    updateBondUI();

    if (!silent && after.level > before) {
      showLevelPop(after);
      sfx('level');
    }
  }

  function markDaily(task) {
    if (ensureDaily()) {
      updateDailyUI();
    }
    if (state.daily[task] || state.daily.claimed) return;

    state.daily[task] = true;
    const everyTaskDone = ['feed', 'bath', 'play'].every((key) => state.daily[key]);

    if (everyTaskDone) {
      state.daily.claimed = true;
      addBond(20);
      updateDailyUI();
      toast('今日照顾清单全部完成！亲密度 +20');
      spawnConfetti(24);
      sfx('level');
    } else {
      updateDailyUI();
    }

    saveState();
  }

  function recordCare(type) {
    if (Object.prototype.hasOwnProperty.call(state.counts, type)) {
      state.counts[type] = (state.counts[type] || 0) + 1;
    }

    addBond(STAT_XP[type] || 0);
    if (type === 'feed' || type === 'bath' || type === 'play') {
      markDaily(type);
    }

    updateCountsUI();
    updateCareTip();
    saveState();
  }

  /* ---------------- pet face + actions ---------------- */

  function setFace(face) {
    if (els.petSvg.dataset.face !== face) {
      els.petSvg.dataset.face = face;
    }
  }

  function setAction(name, duration = 0) {
    clearTimeout(actionTimer);
    els.petArt.dataset.action = name || 'idle';

    if (duration > 0) {
      actionTimer = setTimeout(() => {
        if (els.petArt.dataset.action === name) {
          els.petArt.dataset.action = 'idle';
        }
      }, duration);
    }
  }

  function refreshFace() {
    if (feedOpen) {
      setFace('wow');
      return;
    }

    if (mode === 'sleeping') {
      setFace('sleep');
      return;
    }

    if (state.energy < 17) {
      setFace('sleep');
      return;
    }

    if (state.satiety < 23 || state.clean < 22 || state.mood < 40) {
      setFace('sad');
      return;
    }

    if (state.mood >= 84) {
      setFace('happy');
    } else {
      setFace('normal');
    }
  }

  function updateDirt() {
    let alpha = 0;

    if (mode === 'bath' && bath.active) {
      alpha = Math.max(0, bath.startDirt * (1 - bath.progress / 100));
    } else if (state.clean < 82) {
      alpha = clamp((82 - state.clean) / 62, 0, 1) * 0.72;
    }

    els.petSvg.style.setProperty('--dirt-alpha', alpha.toFixed(2));
    els.petZone.classList.toggle('is-dirty', state.clean < 36 && mode !== 'bath');
  }

  function refreshPetState() {
    updateDirt();
    if (mode === 'idle') {
      refreshFace();
    }
  }

  function makeTransparentLineArt(image) {
    try {
      const sourceWidth = image.naturalWidth;
      const sourceHeight = image.naturalHeight;
      if (!sourceWidth || !sourceHeight) return null;

      // Keep only the dark ink: white becomes fully transparent, gray edges
      // become semi-transparent black. Large photos are downscaled a little.
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;

      context.drawImage(image, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const pixels = frame.data;

      for (let i = 0; i < pixels.length; i += 4) {
        const luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        const ink = clamp((160 - luminance) / 150, 0, 1);
        const sourceAlpha = pixels[i + 3] / 255;
        const alpha = Math.round(ink * sourceAlpha * 255);
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = alpha;
      }

      context.putImageData(frame, 0, 0);
      return canvas.toDataURL('image/png');
    } catch (error) {
      // A file:// image can taint the canvas; then CSS multiply is the fallback.
      return null;
    }
  }

  function initPetPhoto() {
    const photo = els.petPhoto;
    if (!photo) return;

    const sources = [];
    try {
      const storedPhoto = localStorage.getItem(PHOTO_KEY);
      if (storedPhoto && storedPhoto.startsWith('data:image/')) {
        sources.push(storedPhoto);
      }
    } catch (error) {
      /* The original image can still load from its file path. */
    }

    sources.push('pet-original.jpg');
    if (photo.dataset.originalSrc) sources.push(photo.dataset.originalSrc);

    let sourceIndex = 0;

    const usePhoto = () => {
      if (!photo.naturalWidth) return;

      if (photo.dataset.processed !== '1') {
        const transparentPng = makeTransparentLineArt(photo);
        if (transparentPng) {
          photo.dataset.processed = '1';
          els.petArt.classList.add('has-processed');
          photo.src = transparentPng;
          return;
        }
      }

      els.petArt.classList.add('has-photo');
      photo.removeAttribute('aria-hidden');
      els.petSvg.setAttribute('aria-hidden', 'true');
      if (els.photoTip) els.photoTip.hidden = true;
    };

    const useFallback = () => {
      els.petArt.classList.remove('has-photo');
      els.petArt.classList.remove('has-processed');
      photo.hidden = true;
      photo.setAttribute('aria-hidden', 'true');
      els.petSvg.removeAttribute('aria-hidden');
      if (els.photoTip) els.photoTip.hidden = false;
    };

    const tryNextSource = () => {
      if (photo.dataset.manual === '1') return;
      if (sourceIndex >= sources.length) {
        useFallback();
        return;
      }
      photo.hidden = false;
      photo.src = sources[sourceIndex];
      sourceIndex += 1;
    };

    photo.addEventListener('load', usePhoto);
    photo.addEventListener('error', tryNextSource);
    photo.addEventListener('error', () => {
      if (photo.dataset.manual === '1') useFallback();
    });

    setTimeout(() => {
      if (!els.petArt.classList.contains('has-photo') && !photo.complete) {
        if (els.photoTip) els.photoTip.hidden = false;
      }
    }, 1800);

    tryNextSource();
  }

  function loadLocalPhoto(file) {
    if (!file) return;
    const looksLikeImage = (file.type && file.type.startsWith('image/'))
      || /\.(jpe?g|png|webp|gif)$/i.test(file.name || '');
    if (!looksLikeImage) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl.startsWith('data:image/')) return;

      delete els.petPhoto.dataset.processed;
      els.petArt.classList.remove('has-processed');
      els.petPhoto.dataset.manual = '1';
      els.petPhoto.hidden = false;
      els.petPhoto.src = dataUrl;

      if (dataUrl.length > 2500000) {
        toast('原图较大，本次有效；刷新后请重新载入。', 4200);
        return;
      }

      try {
        localStorage.setItem(PHOTO_KEY, dataUrl);
      } catch (error) {
        toast('浏览器存不下这张图，本次有效；刷新后请重新载入。', 4200);
      }
    });
    reader.readAsDataURL(file);
  }

  /* ---------------- particles ---------------- */

  const FX_GLYPHS = {
    heart: ['♥', '♡'],
    star: ['✦', '✧', '★'],
    note: ['♪', '♫'],
    sparkle: ['✦', '✧', '·'],
    zzz: ['z', 'Z', 'zz']
  };

  function stageRect() {
    return els.stage.getBoundingClientRect();
  }

  function pointerPoint(event) {
    if (!event) return null;
    const rect = stageRect();
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height)
    };
  }

  function petPoint(fx = 0.5, fy = 0.5) {
    const petRect = els.petSvg.getBoundingClientRect();
    const rect = stageRect();
    return {
      x: petRect.left - rect.left + petRect.width * fx,
      y: petRect.top - rect.top + petRect.height * fy
    };
  }

  function elementPoint(element) {
    const elementRect = element.getBoundingClientRect();
    const rect = stageRect();
    return {
      x: elementRect.left - rect.left + elementRect.width / 2,
      y: elementRect.top - rect.top + elementRect.height / 2
    };
  }

  function spawnFx(type, x, y, options = {}) {
    if (!els.fxLayer) return;
    if (els.fxLayer.childElementCount > MAX_FX) {
      const oldest = els.fxLayer.firstElementChild;
      if (oldest) oldest.remove();
    }

    const el = document.createElement('span');
    el.className = `fx fx-${type}`;

    if (FX_GLYPHS[type]) {
      el.textContent = options.glyph || pick(FX_GLYPHS[type]);
      el.style.fontSize = `${options.size || rand(13, 22)}px`;
    } else {
      const size = options.size || 8;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
    }

    if (options.color) {
      el.style.color = options.color;
      if (type === 'confetti') el.style.background = options.color;
    }
    if (options.width) el.style.width = `${options.width}px`;
    if (options.height) el.style.height = `${options.height}px`;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--dx', `${options.dx ?? rand(-64, 64)}px`);
    el.style.setProperty('--dy', `${options.dy ?? rand(-110, -42)}px`);
    el.style.setProperty('--r', `${options.r ?? rand(-70, 70)}deg`);
    el.style.setProperty('--s', String(options.s ?? rand(0.75, 1.45)));
    el.style.setProperty('--dur', `${options.dur ?? rand(0.85, 1.45)}s`);

    els.fxLayer.appendChild(el);

    const remove = () => {
      if (el.parentNode) el.remove();
    };
    el.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 2600);
  }

  function burst(type, count, x, y, options = {}) {
    const amount = prefersReducedMotion ? Math.min(count, 3) : count;
    for (let i = 0; i < amount; i += 1) {
      spawnFx(type, x + rand(-options.spreadX || -18, options.spreadX || 18), y + rand(-12, 12), {
        ...options,
        dx: rand(-(options.spreadX || 55), options.spreadX || 55),
        dy: rand(-95, -35)
      });
    }
  }

  function spawnConfetti(count = 24) {
    if (!els.fxLayer) return;
    const rect = stageRect();
    const amount = prefersReducedMotion ? Math.min(count, 8) : count;

    for (let i = 0; i < amount; i += 1) {
      spawnFx('confetti', rand(12, rect.width - 12), rand(8, rect.height * 0.35), {
        size: rand(5, 9),
        color: pick(BUBBLE_COLORS),
        dx: rand(-70, 70),
        dy: rand(120, 260),
        r: rand(180, 720),
        s: rand(0.8, 1.5),
        dur: rand(1.2, 2)
      });
    }
  }

  function littleHearts(source = 'head') {
    const point = source === 'head' ? petPoint(0.5, 0.3) : petPoint(0.68, 0.55);
    burst('heart', 5, point.x, point.y, { spreadX: 46, size: rand(15, 24) });
  }

  /* ---------------- level pop ---------------- */

  /* ---------------- speech helpers ---------------- */

  function idleLine() {
    if (state.satiety < 28) return '肚肚在打鼓……咚咚咚。';
    if (state.clean < 30) return '身上沾到墨水了，痒痒的。';
    if (state.energy < 22) return '眼皮……好重……';
    if (state.mood < 40) return '今天可以多陪我玩一会儿吗？';
    if (state.mood >= 84) return pick(HAPPY_LINES);
    return pick(IDLE_LINES);
  }

  /* ---------------- modes ---------------- */

  function setMode(next) {
    mode = next;
    els.stage.dataset.mode = next;

    const busy = next !== 'idle';
    [els.feedBtn, els.bathBtn, els.petBtn, els.playBtn, els.napBtn, els.quickNapBtn].forEach((button) => {
      if (button) button.disabled = busy;
    });

    if (next === 'idle') {
      els.modeBanner.hidden = true;
    }
  }

  function showBanner(icon, text, progress = 0, canCancel = true) {
    els.modeBanner.hidden = false;
    els.modeIcon.textContent = icon;
    els.modeText.textContent = text;
    els.modeFill.style.width = `${clamp(progress, 0, 100)}%`;
    els.modeCancel.hidden = !canCancel;
  }

  function setBannerProgress(progress, text) {
    els.modeFill.style.width = `${clamp(progress, 0, 100)}%`;
    if (typeof text === 'string') els.modeText.textContent = text;
  }

  function hideBanner() {
    els.modeBanner.hidden = true;
  }

  /* ---------------- feeding ---------------- */

  function openFeedTray() {
    if (mode !== 'idle') return;
    if (!els.introOverlay.hidden) return;

    feedOpen = true;
    els.feedTray.hidden = false;
    setFace('wow');
    say('今天吃什么呀？', 3600);
    sfx('open');
    requestAnimationFrame(() => {
      if (feedOpen && els.foodCards[0]) {
        els.foodCards[0].focus({ preventScroll: true });
      }
    });
  }

  function closeFeedTray() {
    if (!feedOpen) return;
    feedOpen = false;
    els.feedTray.hidden = true;
    if (mode === 'idle') refreshFace();
  }

  function flyFood(sourceSvg, sourceRect, onArrive) {
    if (!sourceSvg || !sourceRect) {
      onArrive();
      return;
    }

    const rect = stageRect();
    const start = {
      x: sourceRect.left - rect.left + sourceRect.width / 2,
      y: sourceRect.top - rect.top + sourceRect.height / 2
    };
    const target = petPoint(0.56, 0.58);

    const flyer = document.createElement('div');
    flyer.className = 'food-fly';
    flyer.innerHTML = sourceSvg.outerHTML;
    flyer.style.left = `${start.x}px`;
    flyer.style.top = `${start.y}px`;
    els.fxLayer.appendChild(flyer);

    const dx = target.x - start.x;
    const dy = target.y - start.y;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      flyer.remove();
      onArrive();
    };

    if (typeof flyer.animate === 'function') {
      try {
        const animation = flyer.animate(
          [
            { transform: 'translate(-50%, -50%) translate(0, 0) scale(1) rotate(0deg)' },
            {
              transform: `translate(-50%, -50%) translate(${dx * 0.52}px, ${dy * 0.52 - 88}px) scale(1.18) rotate(-16deg)`,
              offset: 0.56
            },
            {
              transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.18) rotate(24deg)`
            }
          ],
          { duration: 640, easing: 'cubic-bezier(0.25, 0.7, 0.3, 1)' }
        );
        animation.onfinish = finish;
        animation.oncancel = finish;
        setTimeout(finish, 900);
      } catch (error) {
        setTimeout(finish, 420);
      }
    } else {
      setTimeout(finish, 500);
    }
  }

  function feedWithFood(card) {
    if (mode !== 'idle' || !feedOpen) return;

    const food = FOODS[card.dataset.food];
    if (!food) return;

    const sourceSvg = card.querySelector('svg');
    const sourceRect = sourceSvg.getBoundingClientRect();
    closeFeedTray();
    setFace('wow');

    // Lock the other actions while the food is in the air, so a nap or a
    // bubble game cannot start underneath the feeding callback.
    setMode('feeding');
    showBanner('●', '食物飞过去啦…', 20, false);
    flyFood(sourceSvg, sourceRect, () => {
      if (mode === 'feeding') performFeeding(food);
    });

    // Watchdog: never leave the action dock locked if the animation stalls.
    setTimeout(() => {
      if (mode === 'feeding') {
        hideBanner();
        setMode('idle');
        refreshFace();
      }
    }, 2200);
  }

  function performFeeding(food) {
    if (mode !== 'feeding') return;

    const veryFull = state.satiety >= 96;

    setMode('eating');
    setFace('happy');
    setAction('eat', 1500);
    showBanner('●', veryFull ? '已经很饱啦，只咬一小口…' : '涂鸦鸡正在嚼嚼嚼…', 46, false);

    state.satiety = clamp(state.satiety + (veryFull ? 2 : food.satiety), 0, 100);
    state.mood = clamp(state.mood + (veryFull ? 2 : food.mood), 0, 100);
    state.energy = clamp(state.energy + (veryFull ? 0 : food.energy), 0, 100);

    updateStatsUI();
    updateCareTip();
    if (veryFull) {
      markDaily('feed');
    } else {
      recordCare('feed');
    }
    sfx('eat');
    say(veryFull ? '肚皮圆滚滚的，但还是一小口吃掉啦。' : food.line, 4600);

    const mouth = petPoint(0.56, 0.59);
    let crumbCount = 0;
    const crumbTimer = setInterval(() => {
      spawnFx('crumb', mouth.x + rand(-12, 12), mouth.y + rand(-7, 8), {
        size: rand(3, 6),
        dx: rand(-28, 28),
        dy: rand(-12, 26),
        dur: 0.8
      });
      crumbCount += 1;
      if (crumbCount >= 4) clearInterval(crumbTimer);
    }, 240);

    setTimeout(() => {
      hideBanner();
      setMode('idle');
      setAction('hop', 520);
      setFace('happy');
      littleHearts('head');
      sfx('happy');
      setTimeout(() => {
        if (mode === 'idle') refreshFace();
      }, 900);
    }, 1500);
  }

  /* ---------------- bathing ---------------- */

  function startBath() {
    if (mode !== 'idle') return;

    closeFeedTray();
    setMode('bath');
    setFace('happy');
    setAction('scrub');
    bath.active = true;
    bath.progress = 0;
    bath.scrubbing = false;
    bath.foamAcc = 0;
    bath.startDirt = 0.72;
    bath.finished = false;

    els.stage.classList.remove('is-rinsing');
    els.petSvg.style.setProperty('--dirt-alpha', bath.startDirt.toFixed(2));
    els.spongeCursor.classList.remove('is-on');
    showBanner('≈', '按住涂鸦鸡来回搓一搓 · 0%', 0, true);
    say('泡泡时间！把墨水味都洗掉。', 4600);
    sfx('water');
  }

  function updateBathProgress() {
    const progress = Math.round(bath.progress);
    setBannerProgress(progress, `按住涂鸦鸡来回搓一搓 · ${progress}%`);

    const alpha = Math.max(0, bath.startDirt * (1 - bath.progress / 100));
    els.petSvg.style.setProperty('--dirt-alpha', alpha.toFixed(2));
  }

  function addScrub(amount, event) {
    if (mode !== 'bath' || bath.finished) return;

    bath.progress = Math.min(100, bath.progress + amount);
    bath.foamAcc += amount;

    if (bath.foamAcc > 7) {
      bath.foamAcc = 0;
      const point = pointerPoint(event) || petPoint(0.5, 0.5);
      spawnFx('foam', point.x + rand(-18, 18), point.y + rand(-14, 14), {
        size: rand(9, 21),
        dx: rand(-28, 28),
        dy: rand(-72, -18),
        dur: rand(0.7, 1.2)
      });
      if (Math.random() < 0.3) sfx('scrub');
    }

    updateBathProgress();

    if (bath.progress >= 100) {
      beginRinse();
    }
  }

  function beginRinse() {
    if (bath.finished) return;

    bath.finished = true;
    bath.scrubbing = false;
    els.spongeCursor.classList.remove('is-on');
    els.stage.classList.add('is-rinsing');
    showBanner('≈', '冲水啦——', 100, false);
    setFace('happy');
    setAction('scrub');
    sfx('water');

    let drops = 0;
    const dropTimer = setInterval(() => {
      const rect = stageRect();
      spawnFx('drop', rect.width * 0.75 + rand(-20, 20), rect.height * 0.22 + rand(0, 18), {
        size: rand(4, 8),
        dx: rand(-34, 12),
        dy: rand(120, 210),
        dur: rand(0.6, 0.9),
        r: 0
      });
      drops += 1;
      if (drops >= 14) clearInterval(dropTimer);
    }, 90);

    setTimeout(() => {
      state.clean = clamp(state.clean + 62, 0, 100);
      state.mood = clamp(state.mood + 10, 0, 100);
      state.energy = clamp(state.energy - 5, 0, 100);

      updateStatsUI();
      updateCareTip();
      recordCare('bath');
      els.stage.classList.remove('is-rinsing');
      updateDirt();

      setAction('shake', 900);
      setFace('happy');
      say('甩甩甩——现在我是最香的涂鸦鸡！', 4700);
      sfx('happy');
      burst('sparkle', 10, petPoint(0.5, 0.45).x, petPoint(0.5, 0.45).y, { spreadX: 80, size: rand(12, 20) });

      setTimeout(() => {
        if (mode !== 'bath') return;
        hideBanner();
        setMode('idle');
        setAction('dance', 1850);
        littleHearts('head');
        setTimeout(() => {
          if (mode === 'idle') refreshFace();
        }, 1950);
      }, 950);
    }, 1250);
  }

  function cancelBath() {
    bath.finished = true;
    bath.scrubbing = false;
    els.spongeCursor.classList.remove('is-on');
    els.stage.classList.remove('is-rinsing');
    hideBanner();
    setMode('idle');
    setAction('shake', 450);
    updateDirt();
    say('好吧，下次再洗香香。', 3300);
    setTimeout(refreshFace, 650);
  }

  /* ---------------- petting ---------------- */

  function startPetting() {
    if (mode !== 'idle') return;

    closeFeedTray();
    setMode('petting');
    petting.active = true;
    petting.count = 0;
    petting.dragging = false;
    petting.lastStroke = 0;
    setFace('happy');
    showBanner('♥', '摸摸涂鸦鸡的头 · 0 / 5', 0, true);
    say('咕噜咕噜…再摸一下。', 3600);
    sfx('pet');

    clearTimeout(petting.timer);
    petting.timer = setTimeout(() => {
      if (mode === 'petting' && petting.active) {
        cancelPetting();
      }
    }, 45000);
  }

  function addPetStroke(event) {
    if (!petting.active) return;

    const now = performance.now();
    if (now - petting.lastStroke < 90) return;
    petting.lastStroke = now;
    petting.count += 1;

    const point = pointerPoint(event) || petPoint(0.5, 0.3);
    spawnFx('heart', point.x + rand(-10, 10), point.y - 8, {
      size: rand(16, 24),
      dx: rand(-32, 32),
      dy: rand(-86, -46),
      dur: rand(0.8, 1.2)
    });

    setAction('pet', 520);
    state.mood = clamp(state.mood + 1.5, 0, 100);
    updateStatsUI();
    updateCareTip();

    setBannerProgress(
      (petting.count / 5) * 100,
      petting.count >= 5 ? '开心值满格！' : `摸摸涂鸦鸡的头 · ${petting.count} / 5`
    );

    if (petting.count >= 5) {
      finishPetting();
    }
  }

  function finishPetting() {
    if (!petting.active) return;

    petting.active = false;
    petting.dragging = false;
    clearTimeout(petting.timer);
    showBanner('♥', '开心值满格！', 100, false);

    state.mood = clamp(state.mood + 8, 0, 100);
    state.energy = clamp(state.energy - 3, 0, 100);
    updateStatsUI();
    updateCareTip();
    recordCare('pet');

    setFace('happy');
    setAction('dance', 1850);
    sfx('happy');
    say('嘿！看我的转圈舞！', 4300);

    const head = petPoint(0.5, 0.38);
    burst('heart', 7, head.x, head.y, { spreadX: 70, size: rand(15, 24) });
    burst('note', 4, head.x, head.y - 20, { spreadX: 82, size: rand(14, 22), dy: rand(-150, -90) });

    setTimeout(() => {
      if (mode !== 'petting') return;
      hideBanner();
      setMode('idle');
      refreshFace();
    }, 1900);
  }

  function cancelPetting() {
    petting.active = false;
    petting.dragging = false;
    clearTimeout(petting.timer);
    hideBanner();
    setMode('idle');
    refreshFace();
    say('下次再摸久一点嘛。', 3200);
  }

  /* ---------------- play ---------------- */

  function startPlay() {
    if (mode !== 'idle') return;

    closeFeedTray();
    setMode('play');
    play.active = true;
    play.remaining = play.total;
    play.bubbles = [];
    els.bubbleLayer.replaceChildren();
    setFace('happy');
    showBanner('○', '戳破 5 个泡泡 · 0 / 5', 0, true);
    say('泡泡！泡泡！抓住你！', 3500);
    sfx('open');

    PLAY_SPOTS.forEach((spot, index) => {
      createBubble(spot, index);
    });

    requestAnimationFrame(() => {
      const firstBubble = els.bubbleLayer.querySelector('.play-bubble');
      if (firstBubble) firstBubble.focus({ preventScroll: true });
    });
  }

  function createBubble(spot, index) {
    const slot = document.createElement('div');
    slot.className = 'bubble-slot';
    slot.style.left = `${spot.x + rand(-2.5, 2.5)}%`;
    slot.style.top = `${spot.y + rand(-2.5, 2.5)}%`;

    const bubble = document.createElement('button');
    bubble.type = 'button';
    bubble.className = 'play-bubble';
    bubble.style.setProperty('--bubble', BUBBLE_COLORS[index % BUBBLE_COLORS.length]);
    bubble.style.animationDelay = `${-index * 0.38}s`;
    bubble.setAttribute('aria-label', `戳破第 ${index + 1} 个泡泡`);
    bubble.innerHTML = `<span aria-hidden="true">${pick(['✦', '♪', '★', '♥', '○'])}</span>`;

    bubble.addEventListener('click', (event) => popBubble(event, bubble));
    slot.appendChild(bubble);
    els.bubbleLayer.appendChild(slot);
    play.bubbles.push(slot);
  }

  function popBubble(event, bubble) {
    if (!play.active || bubble.classList.contains('is-popped')) return;

    const point = event && (event.clientX || event.clientY)
      ? pointerPoint(event)
      : elementPoint(bubble);
    bubble.classList.add('is-popped');
    const slot = bubble.parentElement;
    setTimeout(() => slot.remove(), 320);

    burst('star', 3, point.x, point.y, { spreadX: 42, size: rand(11, 18) });
    spawnFx('sparkle', point.x, point.y, { size: rand(12, 18), dx: rand(-20, 20), dy: -60 });
    sfx('pop');

    play.remaining = Math.max(0, play.remaining - 1);
    const done = play.total - play.remaining;
    setBannerProgress((done / play.total) * 100, `戳破泡泡 · ${done} / ${play.total}`);
    state.mood = clamp(state.mood + 2.2, 0, 100);
    updateStatsUI();
    updateCareTip();
    setAction('hop', 520);

    if (play.remaining === 0) {
      finishPlay();
    } else {
      const nextBubble = els.bubbleLayer.querySelector('.play-bubble:not(.is-popped)');
      if (nextBubble) nextBubble.focus({ preventScroll: true });
    }
  }

  function finishPlay() {
    if (!play.active) return;

    play.active = false;
    showBanner('○', '全部戳破！涂鸦鸡开心到转圈', 100, false);

    state.mood = clamp(state.mood + 10, 0, 100);
    state.energy = clamp(state.energy - 6, 0, 100);
    updateStatsUI();
    updateCareTip();
    recordCare('play');

    setFace('happy');
    setAction('dance', 1900);
    sfx('happy');
    say('我抓住泡泡啦！再玩一次好不好？', 4600);
    spawnConfetti(28);
    littleHearts('head');

    setTimeout(() => {
      if (mode !== 'play') return;
      hideBanner();
      setMode('idle');
      refreshFace();
    }, 2000);
  }

  function cancelPlay() {
    play.active = false;
    els.bubbleLayer.replaceChildren();
    play.bubbles = [];
    hideBanner();
    setMode('idle');
    refreshFace();
    say('那先歇一会儿。', 2900);
  }

  /* ---------------- nap ---------------- */

  function startNap() {
    if (mode !== 'idle') return;

    if (state.energy >= 96) {
      setFace('wow');
      setAction('hop', 520);
      say('我还精神得很，不想睡！', 3600);
      sfx('refuse');
      setTimeout(refreshFace, 700);
      return;
    }

    closeFeedTray();
    setMode('sleeping');
    setFace('sleep');
    setAction('sleep');
    showBanner('☾', '涂鸦鸡睡着了…', 0, true);
    say('呼……呼……', 6000);
    sfx('sleep');
    els.stage.classList.add('is-night');

    const startedAt = Date.now();
    clearInterval(napTimer);
    napTimer = setInterval(() => {
      if (mode !== 'sleeping') {
        clearInterval(napTimer);
        napTimer = null;
        els.stage.classList.remove('is-night');
        return;
      }

      const elapsed = Date.now() - startedAt;
      state.energy = clamp(state.energy + 0.72, 0, 100);
      updateStatsUI();

      const progress = Math.min(100, (elapsed / 6000) * 100);
      setBannerProgress(progress, progress < 94 ? '涂鸦鸡睡着了…' : '快醒啦…');

      if (Math.round(elapsed) % 800 < 110) {
        const head = petPoint(0.55, 0.25);
        spawnFx('zzz', head.x + rand(10, 30), head.y, {
          size: rand(15, 23),
          dx: rand(10, 40),
          dy: rand(-90, -55),
          dur: 1.4
        });
      }

      if (elapsed >= 6000) {
        finishNap();
      }
    }, 100);
  }

  function cancelNap() {
    clearInterval(napTimer);
    napTimer = null;
    els.stage.classList.remove('is-night');

    if (mode !== 'sleeping') return;

    hideBanner();
    setMode('idle');
    setAction('idle');
    refreshFace();
    say('才眯了一小会儿，也可以。', 3200);
  }

  function finishNap() {
    clearInterval(napTimer);
    napTimer = null;
    els.stage.classList.remove('is-night');

    if (mode !== 'sleeping') return;

    setMode('waking');

    state.energy = clamp(state.energy + 18, 0, 100);
    state.mood = clamp(state.mood + 4, 0, 100);
    updateStatsUI();
    updateCareTip();
    addBond(4);
    saveState();

    showBanner('☾', '睡醒啦，精神满满！', 100, false);
    setFace('happy');
    setAction('hop', 560);
    sfx('wake');
    say('睡醒啦！现在可以再玩一会儿。', 4000);
    littleHearts('head');

    setTimeout(() => {
      if (mode !== 'waking') return;
      hideBanner();
      setMode('idle');
      refreshFace();
    }, 900);
  }

  /* ---------------- cancel current mode ---------------- */

  function cancelMode() {
    if (mode === 'bath') {
      if (!bath.finished) cancelBath();
    } else if (mode === 'petting') {
      cancelPetting();
    } else if (mode === 'play') {
      cancelPlay();
    } else if (mode === 'sleeping') {
      cancelNap();
    }
  }

  /* ---------------- signature happy dance ---------------- */

  function signatureDance(spontaneous = false) {
    if (!spontaneous && mode !== 'idle' && mode !== 'petting') return;
    if (spontaneous && mode !== 'idle') return;

    lastDanceAt = Date.now();
    setFace('happy');
    setAction('dance', 1850);
    sfx('happy');

    let count = 0;
    clearInterval(danceFxTimer);
    danceFxTimer = setInterval(() => {
      count += 1;
      const point = count % 2 === 0 ? petPoint(0.72, 0.35) : petPoint(0.3, 0.4);
      spawnFx(count % 3 === 0 ? 'note' : 'heart', point.x + rand(-10, 10), point.y, {
        size: rand(14, 22),
        dx: rand(-48, 48),
        dy: rand(-110, -55),
        dur: rand(0.9, 1.4)
      });
      if (count >= 8) clearInterval(danceFxTimer);
    }, 210);

    if (spontaneous) {
      say(pick(HAPPY_LINES), 3900);
    }

    setTimeout(() => {
      if (mode === 'idle') refreshFace();
    }, 1950);
  }

  /* ---------------- general pet reaction ---------------- */

  function petReact(event) {
    if (mode !== 'idle' || introOpen) return;

    const now = Date.now();
    if (now - lastPetReactAt < 850) return;
    lastPetReactAt = now;

    setAction('hop', 520);
    setFace('happy');
    const point = pointerPoint(event) || petPoint(0.5, 0.3);
    spawnFx('heart', point.x + rand(-8, 8), point.y - 6, {
      size: rand(16, 22),
      dx: rand(-30, 30),
      dy: rand(-80, -48),
      dur: 1
    });

    state.mood = clamp(state.mood + 0.6, 0, 100);
    updateStatsUI();
    updateCareTip();
    sfx('pet');

    if (state.mood >= 84 && Math.random() < 0.28) {
      setTimeout(() => {
        if (mode === 'idle') signatureDance(true);
      }, 650);
    } else {
      setTimeout(() => {
        if (mode === 'idle') refreshFace();
      }, 900);
    }
  }

  /* ---------------- pointer + keyboard input ---------------- */

  function onPetPointerDown(event) {
    unlockAudio();

    if (mode === 'bath') {
      event.preventDefault();
      if (bath.finished) return;
      bath.scrubbing = true;
      bath.lastX = event.clientX;
      bath.lastY = event.clientY;
      try {
        els.petHit.setPointerCapture(event.pointerId);
      } catch (error) {
        /* Pointer capture is best-effort. */
      }
      addScrub(8, event);
      return;
    }

    if (mode === 'petting') {
      event.preventDefault();
      petting.dragging = true;
      petting.lastX = event.clientX;
      petting.lastY = event.clientY;
      try {
        els.petHit.setPointerCapture(event.pointerId);
      } catch (error) {
        /* Pointer capture is best-effort. */
      }
      addPetStroke(event);
      return;
    }

    if (mode === 'idle') {
      petReact(event);
    }
  }

  function onPetPointerMove(event) {
    if (mode === 'bath' && bath.scrubbing && !bath.finished) {
      const dx = event.clientX - bath.lastX;
      const dy = event.clientY - bath.lastY;
      const distance = Math.hypot(dx, dy);
      if (distance > 2) {
        bath.lastX = event.clientX;
        bath.lastY = event.clientY;
        addScrub(distance * 0.13, event);
      }
      return;
    }

    if (mode === 'petting' && petting.dragging) {
      const dx = event.clientX - petting.lastX;
      const dy = event.clientY - petting.lastY;
      const distance = Math.hypot(dx, dy);
      if (distance > 26) {
        petting.lastX = event.clientX;
        petting.lastY = event.clientY;
        addPetStroke(event);
      }
    }
  }

  function onPetPointerUp() {
    bath.scrubbing = false;
    petting.dragging = false;
  }

  function onStagePointerMove(event) {
    if (mode !== 'bath' || bath.finished) {
      els.spongeCursor.classList.remove('is-on');
      return;
    }

    els.spongeCursor.classList.add('is-on');
    els.spongeCursor.style.left = `${event.clientX}px`;
    els.spongeCursor.style.top = `${event.clientY - 20}px`;
  }

  function onStagePointerLeave() {
    els.spongeCursor.classList.remove('is-on');
  }

  function keyboardShortcuts(event) {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (event.key === 'Escape') {
      if (!els.helpOverlay.hidden) {
        closeHelp();
        return;
      }
      if (feedOpen) {
        closeFeedTray();
        return;
      }
      if (mode !== 'idle') {
        cancelMode();
      }
      return;
    }

    if (!els.helpOverlay.hidden) return;
    if (els.introOverlay.hidden === false) return;

    if (mode === 'bath' && (event.code === 'Space' || event.key === 'Enter')) {
      event.preventDefault();
      addScrub(10, null);
      return;
    }

    if (mode === 'petting' && (event.code === 'Space' || event.key === 'Enter')) {
      event.preventDefault();
      addPetStroke(null);
      return;
    }

    if (mode !== 'idle') return;

    const map = {
      '1': els.feedBtn,
      '2': els.bathBtn,
      '3': els.petBtn,
      '4': els.playBtn
    };

    if (map[event.key]) {
      event.preventDefault();
      map[event.key].click();
    }
  }

  /* ---------------- intro + help ---------------- */

  function startGame() {
    unlockAudio();
    state.introSeen = true;
    introOpen = false;
    els.introOverlay.hidden = true;
    updateBondUI();
    els.petNameTag.textContent = state.name;
    saveState();

    setFace('happy');
    setAction('hop', 560);
    sfx('happy');
    burst('heart', 7, petPoint(0.5, 0.35).x, petPoint(0.5, 0.35).y, { spreadX: 60, size: rand(15, 24) });
    say('你好，我就是草稿纸上的那只涂鸦鸡。以后请多关照！', 5600);

    setTimeout(() => {
      if (mode === 'idle') refreshFace();
    }, 900);
  }

  function openHelp() {
    if (els.introOverlay.hidden === false) return;
    unlockAudio();
    els.helpOverlay.hidden = false;
    sfx('click');
    els.helpCloseBtn.focus();
  }

  function closeHelp() {
    els.helpOverlay.hidden = true;
    sfx('click');
    els.helpBtn.focus();
  }

  function toggleSound() {
    state.sound = !state.sound;
    syncSoundButton();
    saveState();
    if (state.sound) {
      unlockAudio();
      sfx('click');
    }
  }

  function resetGame() {
    const confirmed = window.confirm(`要和${state.name}重新认识一次吗？现在的照顾记录会清空。`);
    if (!confirmed) return;

    resetting = true;
    window.removeEventListener('beforeunload', saveState);
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      /* Ignore storage restrictions. */
    }
    window.location.reload();
  }

  /* ---------------- idle life ---------------- */

  function startLoops() {
    setInterval(() => {
      const now = Date.now();
      const delta = clamp((now - lastTickAt) / 1000, 0, 5);
      lastTickAt = now;

      if (document.hidden || introOpen) return;

      if (ensureDaily()) {
        updateDailyUI();
      }

      if (mode === 'idle') {
        state.satiety = clamp(state.satiety - delta * 0.038, 0, 100);
        state.clean = clamp(state.clean - delta * 0.03, 0, 100);
        state.mood = clamp(state.mood - delta * 0.018, 0, 100);
        state.energy = clamp(state.energy - delta * 0.012, 0, 100);

        updateStatsUI();
        updateCareTip();
        refreshPetState();
      }

      tickCount += 1;
      if (tickCount % 10 === 0) {
        saveState();
      }
    }, 1000);

    setInterval(() => {
      updateDayLabel();
    }, 60000);

    setInterval(() => {
      if (document.hidden || mode !== 'idle' || !els.introOverlay.hidden) return;

      if (!els.speech.classList.contains('is-visible')) {
        say(idleLine(), 5000);
      }

      if (
        state.mood >= 84 &&
        Date.now() - lastDanceAt > 46000 &&
        !prefersReducedMotion &&
        Math.random() < 0.28
      ) {
        signatureDance(true);
      } else if (Math.random() < 0.42) {
        setAction('hop', 520);
      }
    }, 26000);

    const blink = () => {
      if (
        !prefersReducedMotion &&
        mode === 'idle' &&
        els.petSvg.dataset.face === 'normal'
      ) {
        els.petSvg.classList.add('is-blinking');
        setTimeout(() => els.petSvg.classList.remove('is-blinking'), 150);
      }
      setTimeout(blink, rand(2600, 5200));
    };
    setTimeout(blink, 1600);
  }

  /* ---------------- wiring ---------------- */

  function wireEvents() {
    els.feedBtn.addEventListener('click', () => {
      unlockAudio();
      if (feedOpen) {
        closeFeedTray();
      } else {
        openFeedTray();
      }
    });

    els.bathBtn.addEventListener('click', () => {
      unlockAudio();
      startBath();
    });

    els.petBtn.addEventListener('click', () => {
      unlockAudio();
      startPetting();
    });

    els.playBtn.addEventListener('click', () => {
      unlockAudio();
      startPlay();
    });

    els.napBtn.addEventListener('click', () => {
      unlockAudio();
      startNap();
    });

    if (els.quickNapBtn) {
      els.quickNapBtn.addEventListener('click', () => {
        unlockAudio();
        startNap();
      });
    }

    els.feedClose.addEventListener('click', () => {
      sfx('click');
      closeFeedTray();
    });

    els.foodCards.forEach((card) => {
      card.addEventListener('click', () => {
        unlockAudio();
        feedWithFood(card);
      });
    });

    els.stage.addEventListener('pointerdown', (event) => {
      if (!feedOpen) return;
      if (event.target.closest('#feedTray')) return;
      closeFeedTray();
    });

    els.stage.addEventListener('pointermove', onStagePointerMove);
    els.stage.addEventListener('pointerleave', onStagePointerLeave);
    els.petHit.addEventListener('pointerdown', onPetPointerDown);
    els.petHit.addEventListener('pointermove', onPetPointerMove);
    els.petHit.addEventListener('pointerup', onPetPointerUp);
    els.petHit.addEventListener('pointercancel', onPetPointerUp);
    els.petHit.addEventListener('lostpointercapture', onPetPointerUp);

    els.modeCancel.addEventListener('click', () => {
      sfx('click');
      cancelMode();
    });

    els.soundBtn.addEventListener('click', toggleSound);
    els.helpBtn.addEventListener('click', openHelp);
    els.helpCloseBtn.addEventListener('click', closeHelp);
    els.helpResumeBtn.addEventListener('click', closeHelp);
    els.resetBtn.addEventListener('click', resetGame);

    if (els.loadPhotoBtn && els.photoInput) {
      const openPhotoPicker = () => els.photoInput.click();

      els.loadPhotoBtn.addEventListener('click', openPhotoPicker);
      if (els.photoTip) els.photoTip.addEventListener('click', openPhotoPicker);

      els.photoInput.addEventListener('change', () => {
        const file = els.photoInput.files && els.photoInput.files[0];
        if (file) loadLocalPhoto(file);
        els.photoInput.value = '';
      });
    }

    els.helpOverlay.addEventListener('click', (event) => {
      if (event.target === els.helpOverlay) closeHelp();
    });

    els.startBtn.addEventListener('click', startGame);

    document.addEventListener('keydown', keyboardShortcuts);
    document.addEventListener('pointerdown', unlockAudio, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        saveState();
      } else {
        lastTickAt = Date.now();
      }
    });

    window.addEventListener('beforeunload', saveState);
  }

  /* ---------------- boot ---------------- */

  function init() {
    const loaded = loadState();
    state = loaded.state;
    bootOfflineMinutes = loaded.offline;

    ensureDaily();
    introOpen = !state.introSeen;
    els.introOverlay.hidden = !introOpen;

    STAT_KEYS.forEach((key) => {
      const track = els.meterRows[key].querySelector('.meter-track');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-label', STAT_LABELS[key]);
    });

    initPetPhoto();
    updateUI();
    refreshPetState();
    wireEvents();

    if (introOpen) {
      setTimeout(() => {
        els.startBtn.focus({ preventScroll: true });
      }, 260);
    } else {
      starters();
    }

    startLoops();
    saveState();
  }

  function starters() {
    setTimeout(() => {
      if (bootOfflineMinutes >= 25) {
        say('你回来啦，我等了好久好久。', 5500);
        setFace('happy');
        setAction('hop', 560);
        littleHearts('head');
        return;
      }

      if (bootOfflineMinutes >= 2) {
        say('你回来啦，我刚刚在数纸张的纹路。', 5200);
      } else {
        say('欢迎回来，今天也一起发呆吗？', 4800);
      }

      refreshFace();
    }, 650);
  }

  init();
})();
