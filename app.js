// app.js

const DAYS_ORDER = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

let appData = null;
let originalData = null;
let currentDay = null;
let currentExerciseIndex = -1;

// Timer State
const PHASES = {
    IDLE: 'idle',
    PREP: 'prep',
    WORK: 'work',
    INTERVAL: 'interval',
    COOLDOWN: 'cooldown'
};

const PHASE_COLORS = {
    idle: 'var(--phase-idle)',
    prep: 'var(--phase-prep)',
    work: 'var(--phase-work)',
    interval: 'var(--phase-interval)',
    cooldown: 'var(--phase-cooldown)'
};

let timerState = {
    phase: PHASES.IDLE,
    active: false,
    startTime: 0,
    durationMs: 0,
    remainingMs: 0,
    pausedRemainingMs: 0,
    
    currentSet: 1,
    currentRep: 1,
    
    animationFrameId: null,
    lastBeepSecond: -1
};

// Audio Context
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(frequency, duration) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(1, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start(now);
    oscillator.stop(now + duration);
}

function playTrumpet() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const duration = 1.0;

    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const osc3 = audioCtx.createOscillator();
    
    // ラッパらしいブラス音を作るためノコギリ波と矩形波をミックス
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc3.type = 'square';
    
    // C#5あたりの周波数
    const baseFreq = 440 * Math.pow(2, 4 / 12); 
    
    // 「ぷわーー」の「ぷ」のしゃくり上げ（ピッチベンド）
    osc1.frequency.setValueAtTime(baseFreq * 0.8, now);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.15);
    osc2.frequency.setValueAtTime(baseFreq * 0.8 * 1.01, now);
    osc2.frequency.exponentialRampToValueAtTime(baseFreq * 1.01, now + 0.15);
    osc3.frequency.setValueAtTime(baseFreq * 0.8 * 0.99, now);
    osc3.frequency.exponentialRampToValueAtTime(baseFreq * 0.99, now + 0.15);

    // フィルターでブラス特有の「パァーン」という開きを表現
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.linearRampToValueAtTime(3000, now + 0.1);
    filter.frequency.exponentialRampToValueAtTime(800, now + duration);

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.4, now + 0.1);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.3);
    gainNode.gain.setValueAtTime(0.2, now + duration - 0.2);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    osc3.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    
    osc1.stop(now + duration);
    osc2.stop(now + duration);
    osc3.stop(now + duration);
}

function handleBeep(seconds, phase) {
    if (phase === PHASES.WORK) {
        if (seconds > 0) {
            playTone(880, 0.1);
        } else if (seconds === 0) {
            playTone(1760, 0.5);
        }
    } else if (phase === PHASES.PREP || phase === PHASES.INTERVAL) {
        if (seconds > 0 && seconds <= 4) {
            playTone(880, 0.1);
        } else if (seconds === 0) {
            playTone(1760, 0.5);
        }
    } else if (phase === PHASES.COOLDOWN) {
        if (seconds === 0) {
            playTone(1760, 0.8);
        }
    }
}

// DOM Elements
const daySelector = document.getElementById('day-selector');
const currentDayNameTitle = document.getElementById('current-day-name');
const exerciseList = document.getElementById('exercise-list');

const phaseBadge = document.getElementById('phase-badge');
const progressRing = document.getElementById('progress-ring');
const timeLeftEl = document.getElementById('time-left');
const timeMsEl = document.getElementById('time-ms');
const currentRepEl = document.getElementById('current-rep');
const totalRepsEl = document.getElementById('total-reps');
const currentSetEl = document.getElementById('current-set');
const totalSetsEl = document.getElementById('total-sets');
const timerSection = document.getElementById('timer-section');

const iconPlay = document.getElementById('circle-icon-play');
const iconPause = document.getElementById('circle-icon-pause');
const btnNextSet = document.getElementById('btn-next-set');
const btnNextExercise = document.getElementById('btn-next-exercise');
const btnExport = document.getElementById('btn-export');
const btnReset = document.getElementById('btn-reset');

// Initialization
async function initApp() {
    const localData = localStorage.getItem('webFitTimerData');
    
    try {
        const res = await fetch('data/menu.json');
        originalData = await res.json();
    } catch (e) {
        console.error("Failed to load menu.json", e);
        return;
    }
    
    // スマホ時はローカルキャッシュを無視して常にJSONを参照
    if (localData && window.innerWidth > 768) {
        try {
            appData = JSON.parse(localData);
        } catch(e) {
            console.error("Failed to parse local data", e);
            appData = JSON.parse(JSON.stringify(originalData));
        }
    } else {
        appData = JSON.parse(JSON.stringify(originalData));
        if (window.innerWidth > 768) saveData();
    }
    
    renderSidebar();
    
    // Select current day automatically
    const todayIndex = new Date().getDay(); // 0: Sunday ... 6: Saturday
    const jsDaysMap = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const todayKey = jsDaysMap[todayIndex];
    selectDay(todayKey);
    
    setupEventListeners();
}

function saveData() {
    // スマホ時は常にJSON参照とするため保存処理を行わない
    if (window.innerWidth <= 768) return;
    
    localStorage.setItem('webFitTimerData', JSON.stringify(appData));
}

function renderSidebar() {
    daySelector.innerHTML = '';
    DAYS_ORDER.forEach(dayKey => {
        const dayData = appData.routines[dayKey];
        if(!dayData) return;
        
        const btn = document.createElement('button');
        btn.className = 'day-btn';
        btn.textContent = dayData.dayName || dayKey;
        btn.dataset.day = dayKey;
        btn.addEventListener('click', () => selectDay(dayKey));
        daySelector.appendChild(btn);
    });
}

function selectDay(dayKey) {
    currentDay = dayKey;
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.day === dayKey);
    });
    
    const dayData = appData.routines[dayKey];
    currentDayNameTitle.textContent = dayData ? dayData.dayName : 'No Day Selected';
    
    renderExercises();
    
    if (dayData && dayData.exercises && dayData.exercises.length > 0) {
        startExercise(0, true);
    } else {
        stopTimer();
        resetTimerUI();
        currentExerciseIndex = -1;
    }
}

function renderExercises() {
    exerciseList.innerHTML = '';
    const dayData = appData.routines[currentDay];
    if (!dayData || !dayData.exercises || dayData.exercises.length === 0) {
        exerciseList.innerHTML = '<p style="color: var(--text-muted)">No exercises for this day.</p>';
        return;
    }
    
    dayData.exercises.forEach((ex, index) => {
        const card = document.createElement('div');
        card.className = 'exercise-card';
        card.dataset.index = index;
        
        // Header
        const header = document.createElement('div');
        header.className = 'ex-header';
        
        const title = document.createElement('div');
        title.className = 'ex-title';
        title.textContent = ex.name;
        
        header.appendChild(title);
        
        // Controls
        const controls = document.createElement('div');
        controls.className = 'ex-controls';
        
        const exOriginal = (originalData.routines[currentDay] && originalData.routines[currentDay].exercises[index]) || ex;
        
        // Sets
        controls.appendChild(createNumberControl('セット', ex.sets, exOriginal.sets, val => {
            ex.sets = val;
            saveData();
        }));
        
        // Reps
        controls.appendChild(createNumberControl('回数', ex.reps, exOriginal.reps, val => {
            ex.reps = val;
            saveData();
        }));
        
        // Weight
        if (ex.useDumbbell) {
            controls.appendChild(createNumberControl('重量(kg)', ex.weight, exOriginal.weight, val => {
                ex.weight = val;
                saveData();
            }, { isWeight: true }));
        }
        
        card.appendChild(header);
        card.appendChild(controls);
        
        // Clicking card starts exercise immediately
        card.addEventListener('click', () => {
            initAudio();
            document.querySelectorAll('.exercise-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            startExercise(index);
        });
        
        exerciseList.appendChild(card);
    });
}

function createNumberControl(label, initialValue, originalValue, onChange, options = {}) {
    const isWeight = options && options.isWeight;
    const step = (typeof options === 'number') ? options : (options.step || 1);
    const WEIGHT_STEPS = [2.5, 3.5, 5, 6, 7, 8, 9.5, 10.5, 11.5, 13.5, 16, 18.5, 20.5, 23, 24];

    const group = document.createElement('div');
    group.className = 'control-group';
    
    const lbl = document.createElement('label');
    lbl.textContent = `${label} (${originalValue})`;
    
    const inputGroup = document.createElement('div');
    inputGroup.className = 'number-input';
    
    const btnMinus = document.createElement('button');
    btnMinus.textContent = '-';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.value = initialValue;
    input.step = step;
    input.min = 0;
    
    const checkChanged = (val) => {
        if (val !== originalValue) {
            input.style.color = '#f97316'; // Orange
        } else {
            input.style.color = 'var(--text-main)';
        }
    };
    checkChanged(initialValue);
    
    const btnPlus = document.createElement('button');
    btnPlus.textContent = '+';
    
    const updateValue = (newVal) => {
        if (!isWeight) newVal = Math.max(0, newVal);
        input.value = newVal;
        checkChanged(newVal);
        onChange(newVal);
    };
    
    btnMinus.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isWeight) {
            const current = parseFloat(input.value);
            let next = WEIGHT_STEPS.slice().reverse().find(v => v < current);
            if (next === undefined) next = current;
            updateValue(next);
        } else {
            updateValue(parseFloat(input.value) - step);
        }
    });
    
    btnPlus.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isWeight) {
            const current = parseFloat(input.value);
            let next = WEIGHT_STEPS.find(v => v > current);
            if (next === undefined) next = current;
            updateValue(next);
        } else {
            updateValue(parseFloat(input.value) + step);
        }
    });
    
    input.addEventListener('change', (e) => {
        e.stopPropagation();
        let val = parseFloat(input.value);
        if(isNaN(val)) val = initialValue;
        updateValue(val);
    });
    
    input.addEventListener('click', e => e.stopPropagation());
    
    inputGroup.appendChild(btnMinus);
    inputGroup.appendChild(input);
    inputGroup.appendChild(btnPlus);
    
    group.appendChild(lbl);
    group.appendChild(inputGroup);
    
    return group;
}

// Timer Logic
function startExercise(index, autoPause = false) {
    currentExerciseIndex = index;
    document.querySelectorAll('.exercise-card').forEach((c, i) => {
        c.classList.toggle('active', i === index);
    });
    
    const ex = appData.routines[currentDay].exercises[index];
    
    totalSetsEl.textContent = ex.sets;
    totalRepsEl.textContent = ex.reps;
    
    timerState.currentSet = 1;
    timerState.currentRep = 1;
    
    // 準備時間を全メニュー共通で5秒(5000ms)に固定
    startPhase(PHASES.PREP, 5000);
    
    if (autoPause) {
        timerState.active = false;
        timerState.pausedRemainingMs = timerState.remainingMs;
        cancelAnimationFrame(timerState.animationFrameId);
        timerSection.classList.remove('timer-active');
        updatePlayPauseIcon();
    }
}

function startPhase(phase, durationMs) {
    timerState.phase = phase;
    timerState.durationMs = durationMs;
    timerState.remainingMs = durationMs;
    timerState.active = true;
    timerState.startTime = Date.now();
    timerState.lastBeepSecond = Math.ceil(durationMs / 1000);
    
    updateTimerUIColors();
    updatePlayPauseIcon();
    
    // プログレスリングの巻き戻りアニメーションを防ぐ
    progressRing.classList.add('no-transition');
    progressRing.style.strokeDashoffset = 0;
    void progressRing.getBoundingClientRect(); // 強制的にリフローさせて適用
    progressRing.classList.remove('no-transition');
    
    if(timerState.animationFrameId) cancelAnimationFrame(timerState.animationFrameId);
    timerState.animationFrameId = requestAnimationFrame(timerTick);
}

function stopTimer() {
    timerState.active = false;
    timerState.phase = PHASES.IDLE;
    if(timerState.animationFrameId) {
        cancelAnimationFrame(timerState.animationFrameId);
        timerState.animationFrameId = null;
    }
    updatePlayPauseIcon();
    updateTimerUIColors();
}

function resetTimerUI() {
    timeLeftEl.textContent = "00:00";
    timeMsEl.textContent = ".00";
    progressRing.style.strokeDashoffset = 0;
    phaseBadge.textContent = "IDLE";
    currentSetEl.textContent = "0";
    currentRepEl.textContent = "0";
    totalSetsEl.textContent = "0";
    totalRepsEl.textContent = "0";
    
    timerSection.style.setProperty('--current-glow', 'transparent');
    progressRing.style.stroke = 'var(--phase-idle)';
    phaseBadge.style.color = 'var(--phase-idle)';
}

function togglePlayPause() {
    if (timerState.phase === PHASES.IDLE) return;
    
    if (timerState.active) {
        // Pause
        timerState.active = false;
        timerState.pausedRemainingMs = timerState.remainingMs;
        cancelAnimationFrame(timerState.animationFrameId);
        timerSection.classList.remove('timer-active');
    } else {
        // Play
        timerState.active = true;
        timerState.startTime = Date.now() - (timerState.durationMs - timerState.pausedRemainingMs);
        timerState.animationFrameId = requestAnimationFrame(timerTick);
        timerSection.classList.add('timer-active');
    }
    updatePlayPauseIcon();
}

function updatePlayPauseIcon() {
    if(timerState.active) {
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
        timerSection.classList.add('timer-active');
    } else {
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
        timerSection.classList.remove('timer-active');
    }
}

function updateTimerUIColors() {
    const color = PHASE_COLORS[timerState.phase];
    phaseBadge.textContent = timerState.phase.toUpperCase();
    phaseBadge.style.color = color;
    progressRing.style.stroke = color;
    timerSection.style.setProperty('--current-glow', color);
    
    currentSetEl.textContent = timerState.currentSet;
    currentRepEl.textContent = timerState.currentRep;
}

function timerTick() {
    if (!timerState.active) return;
    
    const now = Date.now();
    const elapsed = now - timerState.startTime;
    timerState.remainingMs = Math.max(0, timerState.durationMs - elapsed);
    
    const totalSeconds = Math.ceil(timerState.remainingMs / 1000);
    if (timerState.lastBeepSecond !== totalSeconds) {
        handleBeep(totalSeconds, timerState.phase);
        timerState.lastBeepSecond = totalSeconds;
    }
    
    updateTimerDisplay();
    
    if (timerState.remainingMs === 0) {
        handlePhaseComplete();
    } else {
        timerState.animationFrameId = requestAnimationFrame(timerTick);
    }
}

function updateTimerDisplay() {
    const totalSeconds = Math.ceil(timerState.remainingMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const ms = Math.floor((timerState.remainingMs % 1000) / 10);
    
    timeLeftEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    timeMsEl.textContent = `.${String(ms).padStart(2, '0')}`;
    
    const progress = timerState.remainingMs / timerState.durationMs;
    // Circumference is 816.814
    const offset = 816.814 - (progress * 816.814);
    progressRing.style.strokeDashoffset = offset;
}

function handlePhaseComplete() {
    const ex = appData.routines[currentDay].exercises[currentExerciseIndex];
    if (!ex) return;
    
    switch (timerState.phase) {
        case PHASES.PREP:
            startPhase(PHASES.WORK, ex.timers.repDuration * 1000);
            break;
            
        case PHASES.WORK:
            if (timerState.currentRep < ex.reps) {
                // Next rep
                timerState.currentRep++;
                startPhase(PHASES.WORK, ex.timers.repDuration * 1000);
            } else {
                // Finished all reps for this set
                if (timerState.currentSet < ex.sets) {
                    startPhase(PHASES.INTERVAL, ex.timers.interval * 1000);
                } else {
                    // 全セット終了時（ラッパ音を鳴らす）
                    playTrumpet();
                    
                    const exercises = appData.routines[currentDay].exercises;
                    if (currentExerciseIndex >= 0 && currentExerciseIndex < exercises.length - 1) {
                        // 次のメニューへ自動遷移して即開始
                        startExercise(currentExerciseIndex + 1, false);
                    } else {
                        // 全てのメニューが終了したらクールダウンへ
                        startPhase(PHASES.COOLDOWN, ex.timers.cooldown * 1000);
                    }
                }
            }
            break;
            
        case PHASES.INTERVAL:
            timerState.currentSet++;
            timerState.currentRep = 1;
            startPhase(PHASES.WORK, ex.timers.repDuration * 1000);
            break;
            
        case PHASES.COOLDOWN:
            stopTimer();
            resetTimerUI();
            break;
    }
}

function skipToNextSet() {
    if (timerState.phase === PHASES.IDLE) return;
    
    const ex = appData.routines[currentDay].exercises[currentExerciseIndex];
    if (!ex) return;
    
    if (timerState.currentSet < ex.sets) {
        timerState.currentSet++;
        timerState.currentRep = 1;
        startPhase(PHASES.WORK, ex.timers.repDuration * 1000);
    } else {
        const exercises = appData.routines[currentDay].exercises;
        if (currentExerciseIndex >= 0 && currentExerciseIndex < exercises.length - 1) {
            startExercise(currentExerciseIndex + 1, false);
        } else {
            startPhase(PHASES.COOLDOWN, ex.timers.cooldown * 1000);
        }
    }
}

function skipToNextExercise() {
    const exercises = appData.routines[currentDay].exercises;
    if (currentExerciseIndex >= 0 && currentExerciseIndex < exercises.length - 1) {
        startExercise(currentExerciseIndex + 1);
    } else {
        stopTimer();
        resetTimerUI();
    }
}

function exportJSON() {
    if (!appData) return;
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = "menu_backup.json";
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 0);
}

function reloadJSON() {
    localStorage.removeItem('webFitTimerData');
    location.reload();
}

function setupEventListeners() {
    document.getElementById('time-circle').addEventListener('click', () => { initAudio(); togglePlayPause(); });
    btnNextSet.addEventListener('click', () => { initAudio(); skipToNextSet(); });
    btnNextExercise.addEventListener('click', () => { initAudio(); skipToNextExercise(); });
    btnExport.addEventListener('click', exportJSON);
    btnReset.addEventListener('click', reloadJSON);
}

// Start app
document.addEventListener('DOMContentLoaded', initApp);
