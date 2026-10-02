document.addEventListener('DOMContentLoaded', () => {

    // 1. UI SELECTORS
    const viewport = document.getElementById('game-viewport');
    const startScreen = document.getElementById('screen-start');
    const gameplayScreen = document.getElementById('screen-gameplay');
    const scoreboardScreen = document.getElementById('screen-scoreboard');
    const countdownOverlay = document.getElementById('countdown-overlay');
    const pauseOverlay = document.getElementById('pause-overlay');
    const rulesPopup = document.getElementById('rules-popup');
    const settingsPopup = document.getElementById('settings-popup');

    // 2. GAME STATE (Endless Mode)
    let score = 0, lives = 3, currentSpeedLevel = 1;
    let gameActive = false, isPaused = false;
    let missingValue = 0;
    let heartInterval, rockSpawnInterval;
    let spawnedStones = [];
    let spawnedHearts = [];

    // 3. AUDIO SYSTEM
    let audioCtx = null;
    let audioMuted = false;
    let bgmInterval = null;
    let bgmStep = 0;
    const bgmMelody = [196, 261.63, 329.63, 261.63];

    function initAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playTone(freq, type, duration, endFreq = null, volume = 0.1) {
        if (audioMuted || !audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, audioCtx.currentTime + duration);
            gain.gain.setValueAtTime(volume, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration);
        } catch (e) { }
    }

    function startBackgroundMusic() {
        if (bgmInterval) return;
        bgmInterval = setInterval(() => {
            if (audioMuted || isPaused || !gameActive) return;
            try {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(bgmMelody[bgmStep], audioCtx.currentTime);
                gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.3);
                bgmStep = (bgmStep + 1) % bgmMelody.length;
            } catch (e) { }
        }, 400);
    }

    function stopBackgroundMusic() {
        if (bgmInterval) {
            clearInterval(bgmInterval);
            bgmInterval = null;
        }
    }

    // 4. COUNTDOWN SEQUENCE
    function launchGameSequence() {
        startScreen.classList.add('hidden');
        scoreboardScreen.classList.add('hidden');
        gameplayScreen.classList.remove('hidden');

        lives = 3;
        score = 0;
        currentSpeedLevel = 1;
        updateHUD();

        document.getElementById('runner').classList.add('hidden');
        document.getElementById('runner').classList.remove('animate-run');

        countdownOverlay.classList.remove('hidden');
        let count = 3;
        countdownOverlay.innerText = count;
        playTone(350, 'sine', 0.15, null, 0.2);

        const countdownTimer = setInterval(() => {
            count--;
            if (count > 0) {
                countdownOverlay.innerText = count;
                playTone(350, 'sine', 0.15, null, 0.2);
            } else if (count === 0) {
                countdownOverlay.innerText = "GO!";
                playTone(600, 'triangle', 0.4, null, 0.25);
            } else {
                clearInterval(countdownTimer);
                countdownOverlay.classList.add('hidden');
                initLevel();
                startBackgroundMusic();
            }
        }, 1000);
    }

    // 5. GAMEPLAY CORE
    function initLevel() {
        gameActive = true;
        isPaused = false;

        generateSequenceProblem();

        clearInterval(rockSpawnInterval);
        rockSpawnInterval = setInterval(updatePhysicsTick, 30);

        clearInterval(heartInterval);
        heartInterval = setInterval(() => {
            if (gameActive && !isPaused && lives < 3 && Math.random() > 0.5) spawnLavaHeart();
        }, 8000);
    }

    function updateHUD() {
        document.getElementById('txt-score').innerText = score;
        document.getElementById('txt-lives').innerText = lives > 0 ? "❤️".repeat(lives) : "☠️";

        // Speed upgrades every 75 points (3 correct answers)
        currentSpeedLevel = Math.floor(score / 75) + 1;
        document.getElementById('txt-speed').innerText = currentSpeedLevel + "x";
    }

    function generateSequenceProblem() {
        document.getElementById('magma-river').innerHTML = '';
        spawnedStones = [];
        spawnedHearts = [];

        // Math difficulty scales gently
        let diffScale = Math.floor(score / 100);
        let maxStep = 3 + diffScale;
        let step = Math.floor(Math.random() * maxStep) + 1;

        let maxStart = 10 + (diffScale * 2);
        let startNum = Math.floor(Math.random() * maxStart) + 2;
        let direction = (diffScale > 4 && Math.random() > 0.5) ? -1 : 1;

        let sequence = [startNum, startNum + (step * direction), startNum + (step * 2 * direction), startNum + (step * 3 * direction)];
        let blankIndex = Math.floor(Math.random() * 4);

        missingValue = sequence[blankIndex];
        let formattedProblem = sequence.map((num, idx) => (idx === blankIndex) ? "___" : num).join(" ➔ ");
        document.getElementById('txt-sequence-problem').innerText = `[ ${formattedProblem} ]`;
        document.getElementById('bridge-gap-target').innerText = "?";

        spawnStoneStep(missingValue, 100);
        spawnStoneStep(missingValue + (step * direction), 350);
        spawnStoneStep(missingValue - (step * direction), 600);
    }

    function spawnStoneStep(value, xPosition) {
        let stone = document.createElement('div');
        stone.className = "stone-step";
        stone.innerText = value;
        stone.style.left = `${xPosition}px`;
        stone.style.top = `${Math.random() * 160 + 40}px`;

        // Base rock speed logic
        stone.dataset.speedX = (Math.random() * 1.5 + 1) * (Math.random() > 0.5 ? 1 : -1);
        stone.dataset.val = value;

        stone.addEventListener('mousedown', () => selectStone(stone));
        document.getElementById('magma-river').appendChild(stone);
        spawnedStones.push(stone);
    }

    function selectStone(selectedEl) {
        if (!gameActive || isPaused) return;
        let selectedVal = parseInt(selectedEl.dataset.val);

        if (selectedVal === missingValue) {
            gameActive = false;
            playTone(523, 'sine', 0.1, 659, 0.2);
            document.getElementById('bridge-gap-target').innerText = missingValue;
            score += 25;
            updateHUD();

            const runnerEl = document.getElementById('runner');
            runnerEl.classList.remove('hidden');
            runnerEl.classList.add('animate-run');

            setTimeout(() => {
                runnerEl.classList.add('hidden');
                runnerEl.classList.remove('animate-run');
                gameActive = true;
                generateSequenceProblem();
            }, 1200);

        } else {
            playTone(130, 'sawtooth', 0.3, null, 0.2);
            playTone(180, 'sawtooth', 0.3, 90, 0.2);
            lives--;
            updateHUD();

            viewport.style.transform = "translate(10px, 10px)";
            setTimeout(() => viewport.style.transform = "none", 100);

            if (lives <= 0) {
                endGame();
            } else {
                generateSequenceProblem();
            }
        }
    }

    function spawnLavaHeart() {
        let heart = document.createElement('div');
        heart.innerText = "💖";
        heart.className = "heart-item";
        heart.style.position = "absolute";
        heart.style.fontSize = "38px";
        heart.style.cursor = "pointer";
        heart.style.zIndex = "500";
        heart.style.userSelect = "none";
        heart.style.textShadow = "0 0 10px rgba(255, 255, 255, 0.8)";

        let startLeft = Math.random() > 0.5 ? -60 : 800;
        heart.style.left = `${startLeft}px`;
        heart.style.top = `${Math.random() * 160 + 40}px`;

        heart.dataset.speedX = (Math.random() * 1.5 + 1) * (startLeft < 0 ? 1 : -1);

        document.getElementById('magma-river').appendChild(heart);
        spawnedHearts.push(heart);

        heart.addEventListener('mousedown', () => {
            if (!gameActive || isPaused) return;
            if (lives < 3) {
                lives++;
                updateHUD();
                playTone(523, 'sine', 0.1, 784, 0.15);
            }
            heart.remove();
            spawnedHearts = spawnedHearts.filter(h => h !== heart);
        });
    }

    function updatePhysicsTick() {
        if (!gameActive || isPaused) return;

        // This is where the magic happens! Every speed level adds 20% more speed.
        let speedMultiplier = 1 + ((currentSpeedLevel - 1) * 0.20);

        spawnedStones.forEach(stone => {
            let nextLeft = parseFloat(stone.style.left) + (parseFloat(stone.dataset.speedX) * speedMultiplier);
            if (nextLeft < -90) nextLeft = 800;
            if (nextLeft > 800) nextLeft = -90;
            stone.style.left = `${nextLeft}px`;
        });

        spawnedHearts.forEach(heart => {
            let nextLeft = parseFloat(heart.style.left) + (parseFloat(heart.dataset.speedX) * speedMultiplier);
            if (nextLeft < -90) nextLeft = 800;
            if (nextLeft > 800) nextLeft = -90;
            heart.style.left = `${nextLeft}px`;
        });
    }

    function endGame() {
        gameActive = false;
        stopBackgroundMusic();
        clearInterval(rockSpawnInterval);
        clearInterval(heartInterval);

        gameplayScreen.classList.add('hidden');
        scoreboardScreen.classList.remove('hidden');
        document.getElementById('txt-final-score').innerText = score;
    }

    // 7. SAFE LISTENERS
    function safeAddListener(id, event, callback) {
        const target = document.getElementById(id);
        if (target) target.addEventListener(event, callback);
    }

    safeAddListener('btn-start', 'click', () => { initAudio(); launchGameSequence(); });
    safeAddListener('btn-how-to', 'click', () => rulesPopup.classList.remove('hidden'));
    safeAddListener('btn-close-rules', 'click', () => rulesPopup.classList.add('hidden'));
    safeAddListener('btn-settings', 'click', () => settingsPopup.classList.remove('hidden'));
    safeAddListener('btn-close-settings', 'click', () => settingsPopup.classList.add('hidden'));

    safeAddListener('btn-toggle-sound', 'click', (e) => {
        audioMuted = !audioMuted;
        e.target.innerText = audioMuted ? "🔇 SOUND: OFF" : "🔊 SOUND: ON";
    });

    safeAddListener('btn-pause', 'click', () => {
        isPaused = true;
        pauseOverlay.classList.remove('hidden');
    });

    safeAddListener('btn-resume', 'click', () => {
        isPaused = false;
        pauseOverlay.classList.add('hidden');
    });

    safeAddListener('btn-home', 'click', () => location.reload());
    safeAddListener('btn-board-retry', 'click', () => launchGameSequence());
    safeAddListener('btn-board-home', 'click', () => location.reload());
});