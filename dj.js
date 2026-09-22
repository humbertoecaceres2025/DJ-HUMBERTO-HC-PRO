/* =========================================================
   HC PRO DJ HUMBERTO
   PRO 2.1
   ========================================================= */

const mediaA = document.getElementById("mediaA");
const mediaB = document.getElementById("mediaB");

const stateA = document.getElementById("stateA");
const stateB = document.getElementById("stateB");

const nameA = document.getElementById("nameA");
const nameB = document.getElementById("nameB");

const genreA = document.getElementById("genreA");
const genreB = document.getElementById("genreB");

const currentA = document.getElementById("currentA");
const currentB = document.getElementById("currentB");

const durationA = document.getElementById("durationA");
const durationB = document.getElementById("durationB");

const barA = document.getElementById("barA");
const barB = document.getElementById("barB");

const playA = document.getElementById("playA");
const pauseA = document.getElementById("pauseA");
const nextA = document.getElementById("nextA");

const playB = document.getElementById("playB");
const pauseB = document.getElementById("pauseB");
const nextB = document.getElementById("nextB");

const volumeA = document.getElementById("volumeA");
const volumeB = document.getElementById("volumeB");

const crossfader = document.getElementById("crossfader");
const master = document.getElementById("master");

const fadeTime = document.getElementById("fadeTime");
const fadeValue = document.getElementById("fadeValue");

const autoBtn = document.getElementById("autoBtn");
const autoIndicator = document.getElementById("autoIndicator");

const nextBtn = document.getElementById("nextBtn");

const filesInput = document.getElementById("files");
const folderInput = document.getElementById("folder");

const genreFilter = document.getElementById("genre");
const shuffleBtn = document.getElementById("shuffle");
const shuffleStatus = document.getElementById("shuffleStatus");

const clearBtn = document.getElementById("clear");

const playlist = document.getElementById("playlist");
const count = document.getElementById("count");

const micBtn = document.getElementById("micBtn");
const micVolume = document.getElementById("micVolume");
const micState = document.getElementById("micState");

const fullscreenBtn = document.getElementById("fullscreenBtn");

const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");


/* =========================================================
   VARIABLES
   ========================================================= */

let tracks = [];

let activeDeck = "A";

let autoDJ = false;

let shuffleMode = false;

let fadeSeconds = 10;

let fading = false;

let lastTrackIndex = -1;


/* =========================================================
   AUDIO GRAPH
   ========================================================= */

let audioContext = null;

let sourceA = null;
let sourceB = null;

let gainA = null;
let gainB = null;

let masterGain = null;

let analyser = null;

let micSource = null;
let micGain = null;
let micStream = null;

let audioGraphReady = false;


/* =========================================================
   DECK DATA
   ========================================================= */

const decks = {

    A: {
        media: mediaA,
        index: -1,
        userVolume: 1,
        preparedFor: -1,
        transitionStarted: false
    },

    B: {
        media: mediaB,
        index: -1,
        userVolume: 1,
        preparedFor: -1,
        transitionStarted: false
    }

};


/* =========================================================
   AUDIO GRAPH
   ========================================================= */

async function ensureAudioGraph() {

    if (!audioContext) {

        const AudioCtx =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioCtx) {

            alert("Este navegador no soporta Web Audio API.");

            return false;
        }

        audioContext = new AudioCtx();

        sourceA = audioContext.createMediaElementSource(mediaA);
        sourceB = audioContext.createMediaElementSource(mediaB);

        gainA = audioContext.createGain();
        gainB = audioContext.createGain();

        masterGain = audioContext.createGain();

        analyser = audioContext.createAnalyser();

        analyser.fftSize = 128;

        sourceA.connect(gainA);
        sourceB.connect(gainB);

        gainA.connect(masterGain);
        gainB.connect(masterGain);

        masterGain.connect(analyser);

        analyser.connect(audioContext.destination);

        gainA.gain.value = 0;
        gainB.gain.value = 0;

        masterGain.gain.value =
            parseFloat(master.value);

        audioGraphReady = true;
    }

    if (audioContext.state === "suspended") {

        await audioContext.resume();

    }

    applyVolumes();

    return true;
}


/* =========================================================
   GENRE DETECTION
   ========================================================= */

function detectGenre(file) {

    const path =
        (file.webkitRelativePath || file.name)
        .toUpperCase();

    const genres = [

        "CUMBIA",
        "TROPICAL",
        "CUARTETO",
        "ROCK",
        "POP",
        "ELECTRONICA",
        "FOLKLORE",
        "REGGAETON",
        "ROMANTICA"

    ];

    for (const g of genres) {

        if (path.includes(g)) {

            return g;

        }

    }

    return "VARIADO";
}


/* =========================================================
   FILE FILTER
   ========================================================= */

function validFile(file) {

    const name =
        file.name.toLowerCase();

    return (

        file.type.startsWith("audio/") ||

        file.type === "video/mp4" ||

        name.endsWith(".mp3") ||

        name.endsWith(".wav") ||

        name.endsWith(".ogg") ||

        name.endsWith(".m4a") ||

        name.endsWith(".aac") ||

        name.endsWith(".mp4")

    );

}


/* =========================================================
   ADD FILES
   ========================================================= */

function addFiles(fileList) {

    const incoming = Array.from(fileList)
        .filter(validFile);

    incoming.forEach(file => {

        const exists =
            tracks.some(
                t =>
                    t.name === file.name &&
                    t.size === file.size
            );

        if (exists) return;

        tracks.push({

            file,

            name: file.name,

            genre: detectGenre(file),

            url: URL.createObjectURL(file)

        });

    });

    renderPlaylist();

    if (
        decks.A.index === -1 &&
        tracks.length > 0
    ) {

        loadTrack("A", 0);

    }

}


/* =========================================================
   INPUT EVENTS
   ========================================================= */

filesInput.addEventListener(
    "change",
    e => addFiles(e.target.files)
);

folderInput.addEventListener(
    "change",
    e => addFiles(e.target.files)
);


/* =========================================================
   LOAD TRACK
   ========================================================= */

function loadTrack(deckName, index) {

    if (!tracks.length) return;

    index =
        ((index % tracks.length) +
        tracks.length) %
        tracks.length;

    const deck = decks[deckName];

    const track = tracks[index];

    deck.media.pause();

    deck.media.src = track.url;

    deck.media.load();

    deck.index = index;

    deck.preparedFor = -1;

    deck.transitionStarted = false;

    const name =
        deckName === "A"
            ? nameA
            : nameB;

    const genre =
        deckName === "A"
            ? genreA
            : genreB;

    name.textContent =
        track.name;

    genre.textContent =
        track.genre;

    updateState(
        deckName,
        "READY"
    );

    updateTime(deckName);

    if (deckName === activeDeck) {

        lastTrackIndex = index;

    }

}


/* =========================================================
   PREPARE NEXT DECK
   ========================================================= */

function prepareWaitingDeck() {

    if (!tracks.length) return;

    const waitingDeck =
        activeDeck === "A"
            ? "B"
            : "A";

    const waiting =
        decks[waitingDeck];

    const active =
        decks[activeDeck];

    let nextIndex =
        getNextIndex(active.index);

    if (
        waiting.index !== nextIndex
    ) {

        loadTrack(
            waitingDeck,
            nextIndex
        );

    }

    waiting.preparedFor =
        nextIndex;

    waiting.media.pause();

    if (audioGraphReady) {

        if (waitingDeck === "A") {

            gainA.gain.value = 0;

        } else {

            gainB.gain.value = 0;

        }

    }

}


/* =========================================================
   NEXT INDEX
   ========================================================= */

function getNextIndex(currentIndex) {

    if (tracks.length <= 1) {

        return currentIndex >= 0
            ? currentIndex
            : 0;

    }

    let index;

    do {

        index =
            Math.floor(
                Math.random() *
                tracks.length
            );

    } while (

        shuffleMode &&
        index === currentIndex

    );

    if (!shuffleMode) {

        index =
            (currentIndex + 1) %
            tracks.length;

    }

    return index;

}


/* =========================================================
   PLAY
   ========================================================= */

async function play(deckName) {

    const deck = decks[deckName];

    if (deck.index < 0) {

        if (!tracks.length) {

            alert(
                "Primero carga música."
            );

            return;
        }

        loadTrack(
            deckName,
            0
        );

    }

    const ready =
        await ensureAudioGraph();

    if (!ready) return;

    try {

        await deck.media.play();

        updateState(
            deckName,
            "PLAYING"
        );

        activeDeck = deckName;

        if (autoDJ) {

            prepareWaitingDeck();

        }

    } catch (error) {

        console.error(error);

    }

}


/* =========================================================
   PAUSE
   ========================================================= */

function pause(deckName) {

    const deck =
        decks[deckName];

    deck.media.pause();

    updateState(
        deckName,
        "PAUSED"
    );

}


/* =========================================================
   MANUAL NEXT
   ========================================================= */

async function next(deckName) {

    if (!tracks.length) return;

    const deck =
        decks[deckName];

    const nextIndex =
        getNextIndex(deck.index);

    if (
        deck.media.paused ||
        !deck.media.currentTime
    ) {

        loadTrack(
            deckName,
            nextIndex
        );

        await play(deckName);

        return;

    }

    if (
        deckName === activeDeck
    ) {

        await crossFade(
            deckName,
            deckName === "A"
                ? "B"
                : "A",
            nextIndex
        );

    } else {

        loadTrack(
            deckName,
            nextIndex
        );

        await play(deckName);

    }

}


/* =========================================================
   CROSSFADE
   ========================================================= */

async function crossFade(
    fromDeck,
    toDeck,
    forcedIndex = null
) {

    if (fading) return;

    if (!tracks.length) return;

    fading = true;

    const from =
        decks[fromDeck];

    const to =
        decks[toDeck];

    let nextIndex =
        forcedIndex !== null
            ? forcedIndex
            : getNextIndex(from.index);


    /*
       Usamos la pista ya precargada
       cuando coincide.
    */

    if (
        to.index !== nextIndex
    ) {

        loadTrack(
            toDeck,
            nextIndex
        );

    }

    to.preparedFor = -1;

    await ensureAudioGraph();


    /*
       El nuevo deck comienza
       completamente cerrado.
    */

    if (toDeck === "A") {

        gainA.gain.value = 0;

    } else {

        gainB.gain.value = 0;

    }


    try {

        await to.media.play();

    } catch (error) {

        console.error(error);

        fading = false;

        return;

    }


    const oldBase =
        decks[fromDeck].userVolume *
        parseFloat(master.value);

    const newBase =
        decks[toDeck].userVolume *
        parseFloat(master.value);


    const start =
        performance.now();

    const duration =
        fadeSeconds * 1000;


    function animate(now) {

        const progress =
            Math.min(
                1,
                (now - start) /
                duration
            );


        /*
           Curva equal-power.
        */

        const oldVolume =
            oldBase *
            Math.cos(
                progress *
                Math.PI /
                2
            );

        const newVolume =
            newBase *
            Math.sin(
                progress *
                Math.PI /
                2
            );


        if (fromDeck === "A") {

            gainA.gain.value =
                Math.max(
                    0,
                    oldVolume
                );

        } else {

            gainB.gain.value =
                Math.max(
                    0,
                    oldVolume
                );

        }


        if (toDeck === "A") {

            gainA.gain.value =
                Math.max(
                    0,
                    newVolume
                );

        } else {

            gainB.gain.value =
                Math.max(
                    0,
                    newVolume
                );

        }


        if (progress < 1) {

            requestAnimationFrame(
                animate
            );

        } else {

            finishCrossFade(
                fromDeck,
                toDeck
            );

        }

    }

    requestAnimationFrame(animate);

}


/* =========================================================
   FINISH CROSSFADE
   ========================================================= */

function finishCrossFade(
    fromDeck,
    toDeck
) {

    const from =
        decks[fromDeck];

    const to =
        decks[toDeck];


    from.media.pause();

    from.media.currentTime = 0;


    if (fromDeck === "A") {

        gainA.gain.value = 0;

    } else {

        gainB.gain.value = 0;

    }


    const finalVolume =
        to.userVolume *
        parseFloat(master.value);


    if (toDeck === "A") {

        gainA.gain.value =
            finalVolume;

    } else {

        gainB.gain.value =
            finalVolume;

    }


    activeDeck = toDeck;

    to.transitionStarted = false;

    lastTrackIndex = to.index;

    updateState(
        fromDeck,
        "STANDBY"
    );

    updateState(
        toDeck,
        "PLAYING"
    );


    fading = false;


    if (autoDJ) {

        prepareWaitingDeck();

    }

}


/* =========================================================
   AUTO DJ CHECK
   ========================================================= */

function checkAuto(deckName) {

    if (!autoDJ) return;

    if (fading) return;

    if (deckName !== activeDeck) return;

    const deck =
        decks[deckName];

    const media =
        deck.media;

    if (!media.duration) return;

    if (media.paused) return;


    const remaining =
        media.duration -
        media.currentTime;


    if (
        remaining <= fadeSeconds
    ) {

        /*
           Protección contra
           múltiples disparos.
        */

        if (
            deck.transitionStarted
        ) {

            return;

        }

        deck.transitionStarted = true;


        const toDeck =
            deckName === "A"
                ? "B"
                : "A";


        const nextIndex =
            getNextIndex(
                deck.index
            );


        crossFade(
            deckName,
            toDeck,
            nextIndex
        );

    }

}


/* =========================================================
   AUTO DJ
   ========================================================= */

autoBtn.addEventListener(
    "click",
    async () => {

        autoDJ = !autoDJ;

        if (autoDJ) {

            autoBtn.textContent =
                "AUTO DJ ON";

            autoBtn.classList.add(
                "active"
            );

            autoIndicator.textContent =
                "AUTO DJ ACTIVO";

            autoIndicator.classList.add(
                "active"
            );


            /*
               Auto DJ toma el control
               del mezclador.
            */

            crossfader.value = 0.5;


            await play(
                activeDeck
            );

            prepareWaitingDeck();

        } else {

            autoBtn.textContent =
                "AUTO DJ OFF";

            autoBtn.classList.remove(
                "active"
            );

            autoIndicator.textContent =
                "MANUAL";

            autoIndicator.classList.remove(
                "active"
            );

            applyVolumes();

        }

    }
);


/* =========================================================
   VOLUMES
   ========================================================= */

function applyVolumes() {

    if (!audioGraphReady) return;

    if (fading) return;


    const masterValue =
        parseFloat(
            master.value
        );


    if (autoDJ) {

        if (activeDeck === "A") {

            gainA.gain.value =
                decks.A.userVolume *
                masterValue;

            gainB.gain.value = 0;

        } else {

            gainA.gain.value = 0;

            gainB.gain.value =
                decks.B.userVolume *
                masterValue;

        }

        return;

    }


    const cf =
        parseFloat(
            crossfader.value
        );


    gainA.gain.value =
        (1 - cf) *
        masterValue *
        decks.A.userVolume;


    gainB.gain.value =
        cf *
        masterValue *
        decks.B.userVolume;

}


/* =========================================================
   CONTROLS
   ========================================================= */

volumeA.addEventListener(
    "input",
    () => {

        decks.A.userVolume =
            parseFloat(
                volumeA.value
            );

        applyVolumes();

    }
);


volumeB.addEventListener(
    "input",
    () => {

        decks.B.userVolume =
            parseFloat(
                volumeB.value
            );

        applyVolumes();

    }
);


master.addEventListener(
    "input",
    () => {

        if (!fading) {

            applyVolumes();

        }

    }
);


crossfader.addEventListener(
    "input",
    () => {

        if (!autoDJ) {

            applyVolumes();

        }

    }
);


/* =========================================================
   FADE TIME
   ========================================================= */

fadeTime.addEventListener(
    "input",
    () => {

        fadeSeconds =
            parseInt(
                fadeTime.value
            );

        fadeValue.textContent =
            fadeSeconds + " s";

    }
);


/* =========================================================
   BUTTONS
   ========================================================= */

playA.onclick =
    () => play("A");

pauseA.onclick =
    () => pause("A");

nextA.onclick =
    () => next("A");

playB.onclick =
    () => play("B");

pauseB.onclick =
    () => pause("B");

nextB.onclick =
    () => next("B");

nextBtn.onclick =
    () => next(activeDeck);


/* =========================================================
   MEDIA EVENTS
   ========================================================= */

mediaA.addEventListener(
    "timeupdate",
    () => {

        updateTime("A");

        checkAuto("A");

    }
);


mediaB.addEventListener(
    "timeupdate",
    () => {

        updateTime("B");

        checkAuto("B");

    }
);


mediaA.addEventListener(
    "loadedmetadata",
    () => updateTime("A")
);

mediaB.addEventListener(
    "loadedmetadata",
    () => updateTime("B")
);


mediaA.addEventListener(
    "ended",
    () => {

        if (!autoDJ) {

            next("A");

        }

    }
);


mediaB.addEventListener(
    "ended",
    () => {

        if (!autoDJ) {

            next("B");

        }

    }
);


/* =========================================================
   UPDATE TIME
   ========================================================= */

function updateTime(deckName) {

    const deck =
        decks[deckName];

    const media =
        deck.media;

    const current =
        media.currentTime || 0;

    const duration =
        media.duration || 0;


    const currentEl =
        deckName === "A"
            ? currentA
            : currentB;

    const durationEl =
        deckName === "A"
            ? durationA
            : durationB;

    const bar =
        deckName === "A"
            ? barA
            : barB;


    currentEl.textContent =
        formatTime(current);

    durationEl.textContent =
        formatTime(duration);


    if (duration > 0) {

        bar.style.width =
            (
                current /
                duration *
                100
            ) + "%";

    } else {

        bar.style.width =
            "0%";

    }

}


/* =========================================================
   FORMAT TIME
   ========================================================= */

function formatTime(seconds) {

    if (
        !Number.isFinite(seconds)
    ) {

        return "00:00";

    }

    const min =
        Math.floor(
            seconds / 60
        );

    const sec =
        Math.floor(
            seconds % 60
        );


    return (
        String(min).padStart(2, "0") +
        ":" +
        String(sec).padStart(2, "0")
    );

}


/* =========================================================
   STATES
   ========================================================= */

function updateState(
    deckName,
    state
) {

    const el =
        deckName === "A"
            ? stateA
            : stateB;

    el.textContent =
        state;

}


/* =========================================================
   PLAYLIST
   ========================================================= */

function renderPlaylist() {

    playlist.innerHTML = "";

    const selected =
        genreFilter.value;


    const visible =
        tracks.filter(
            track =>
                selected === "TODOS" ||
                track.genre === selected
        );


    count.textContent =
        tracks.length;


    visible.forEach(
        (track, position) => {

            const realIndex =
                tracks.indexOf(track);


            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "track-item";


            item.innerHTML = `

                <div class="track-number">
                    ${position + 1}
                </div>

                <div class="track-title">
                    ${escapeHTML(track.name)}
                </div>

                <div class="genre">
                    ${track.genre}
                </div>

            `;


            item.addEventListener(
                "dblclick",
                () => {

                    loadTrack(
                        activeDeck,
                        realIndex
                    );

                    play(activeDeck);

                }
            );


            playlist.appendChild(item);

        }
    );

}


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHTML(text) {

    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


/* =========================================================
   FILTER
   ========================================================= */

genreFilter.addEventListener(
    "change",
    renderPlaylist
);


/* =========================================================
   SHUFFLE
   ========================================================= */

shuffleBtn.addEventListener(
    "click",
    () => {

        shuffleMode =
            !shuffleMode;


        if (shuffleMode) {

            shuffleBtn.textContent =
                "🔀 SHUFFLE ON";

            shuffleStatus.textContent =
                "SHUFFLE ON";

            shuffleStatus.classList.add(
                "active"
            );

        } else {

            shuffleBtn.textContent =
                "🔀 SHUFFLE";

            shuffleStatus.textContent =
                "SHUFFLE OFF";

            shuffleStatus.classList.remove(
                "active"
            );

        }

    }
);


/* =========================================================
   CLEAR
   ========================================================= */

clearBtn.addEventListener(
    "click",
    () => {

        mediaA.pause();
        mediaB.pause();

        tracks.forEach(
            track => {

                URL.revokeObjectURL(
                    track.url
                );

            }
        );


        tracks = [];

        playlist.innerHTML = "";

        count.textContent = "0";


        decks.A.index = -1;
        decks.B.index = -1;

        decks.A.preparedFor = -1;
        decks.B.preparedFor = -1;


        nameA.textContent =
            "Ninguna canción";

        nameB.textContent =
            "Ninguna canción";

        genreA.textContent = "—";
        genreB.textContent = "—";

        updateState(
            "A",
            "STANDBY"
        );

        updateState(
            "B",
            "STANDBY"
        );

    }
);


/* =========================================================
   MICROPHONE
   ========================================================= */

micBtn.addEventListener(
    "click",
    toggleMicrophone
);


async function toggleMicrophone() {

    const ready =
        await ensureAudioGraph();

    if (!ready) return;


    if (!micStream) {

        try {

            micStream =
                await navigator.mediaDevices
                    .getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });


            micSource =
                audioContext
                    .createMediaStreamSource(
                        micStream
                    );


            micGain =
                audioContext.createGain();


            micGain.gain.value =
                parseFloat(
                    micVolume.value
                );


            micSource.connect(
                micGain
            );


            micGain.connect(
                masterGain
            );


            micBtn.textContent =
                "MIC ON";

            micBtn.classList.add(
                "active"
            );

            micState.textContent =
                "MICRÓFONO ACTIVO";

            micState.classList.add(
                "active"
            );


        } catch (error) {

            console.error(error);

            alert(
                "No fue posible acceder al micrófono. Verifica los permisos del navegador."
            );

        }

    } else {

        micStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );


        micStream = null;

        micSource = null;


        if (micGain) {

            micGain.gain.value = 0;

        }


        micBtn.textContent =
            "MIC OFF";

        micBtn.classList.remove(
            "active"
        );

        micState.textContent =
            "DESACTIVADO";

        micState.classList.remove(
            "active"
        );

    }

}


micVolume.addEventListener(
    "input",
    () => {

        if (micGain) {

            micGain.gain.value =
                parseFloat(
                    micVolume.value
                );

        }

    }
);


/* =========================================================
   FULLSCREEN
   ========================================================= */

fullscreenBtn.addEventListener(
    "click",
    async () => {

        try {

            if (!document.fullscreenElement) {

                await document.documentElement
                    .requestFullscreen();

            } else {

                await document.exitFullscreen();

            }

        } catch (error) {

            console.error(error);

        }

    }
);


/* =========================================================
   AUDIO VISUALIZER
   ========================================================= */

function resizeCanvas() {

    const rect =
        canvas.getBoundingClientRect();

    canvas.width =
        rect.width *
        window.devicePixelRatio;

    canvas.height =
        rect.height *
        window.devicePixelRatio;

    ctx.scale(
        window.devicePixelRatio,
        window.devicePixelRatio
    );

}


window.addEventListener(
    "resize",
    resizeCanvas
);

resizeCanvas();


function drawVisualizer() {

    requestAnimationFrame(
        drawVisualizer
    );


    const width =
        canvas.clientWidth;

    const height =
        canvas.clientHeight;


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    if (!analyser) {

        drawIdleVisualizer(
            width,
            height
        );

        return;

    }


    const data =
        new Uint8Array(
            analyser.frequencyBinCount
        );


    analyser.getByteFrequencyData(
        data
    );


    const bars =
        data.length;


    const barWidth =
        width / bars;


    for (
        let i = 0;
        i < bars;
        i++
    ) {

        const value =
            data[i] / 255;


        const barHeight =
            value * height * .85;


        const x =
            i * barWidth;


        const y =
            height - barHeight;


        const gradient =
            ctx.createLinearGradient(
                0,
                height,
                0,
                0
            );


        gradient.addColorStop(
            0,
            "#ff3d00"
        );

        gradient.addColorStop(
            .5,
            "#ff7a00"
        );

        gradient.addColorStop(
            1,
            "#ffd000"
        );


        ctx.fillStyle =
            gradient;


        ctx.fillRect(
            x + 1,
            y,
            Math.max(
                2,
                barWidth - 3
            ),
            barHeight
        );

    }

}


function drawIdleVisualizer(
    width,
    height
) {

    ctx.beginPath();

    ctx.lineWidth = 2;

    ctx.strokeStyle =
        "rgba(255,122,0,.35)";


    const t =
        performance.now() / 700;


    for (
        let x = 0;
        x < width;
        x += 4
    ) {

        const y =
            height / 2 +
            Math.sin(
                x * .025 + t
            ) * 20;


        if (x === 0) {

            ctx.moveTo(
                x,
                y
            );

        } else {

            ctx.lineTo(
                x,
                y
            );

        }

    }


    ctx.stroke();

}


drawVisualizer();


/* =========================================================
   INITIAL STATE
   ========================================================= */

fadeValue.textContent =
    fadeSeconds + " s";

updateState(
    "A",
    "STANDBY"
);

updateState(
    "B",
    "STANDBY"
);

console.log(
    "HC PRO DJ HUMBERTO PRO 2.1 iniciado."
);




// ==========================================
// HC PRO DJ HUMBERTO
// CONTROL PRINCIPAL
// ==========================================

const video = document.getElementById("videoPlayer");
const videoFile = document.getElementById("videoFile");
const audioFile = document.getElementById("audioFile");

const vinylA = document.getElementById("vinylA");
const vinylB = document.getElementById("vinylB");

const trackName = document.getElementById("trackName");
const videoStatus = document.getElementById("videoStatus");

let audioPlayer = new Audio();

let deckAPlaying = false;
let deckBPlaying = false;


// ==========================================
// CARGAR VIDEO
// ==========================================

videoFile.addEventListener("change", function () {

  const file = this.files[0];

  if (!file) return;

  const videoURL = URL.createObjectURL(file);

  video.src = videoURL;

  video.load();

  videoStatus.textContent = "VIDEO CARGADO";

  videoStatus.style.color = "#00ffcc";

});


// ==========================================
// CARGAR AUDIO
// ==========================================

audioFile.addEventListener("change", function () {

  const file = this.files[0];

  if (!file) return;

  const audioURL = URL.createObjectURL(file);

  audioPlayer.src = audioURL;

  trackName.textContent = file.name;

  audioPlayer.load();

});


// ==========================================
// PLAY AUDIO
// ==========================================

function playAudio() {

  if (!audioPlayer.src) {

    alert("Primero selecciona un archivo de audio.");

    return;
  }

  audioPlayer.play();

  vinylA.classList.add("playing");

  vinylB.classList.add("playing");

}


// ==========================================
// PAUSE AUDIO
// ==========================================

function pauseAudio() {

  audioPlayer.pause();

  vinylA.classList.remove("playing");

  vinylB.classList.remove("playing");

}


// ==========================================
// STOP AUDIO
// ==========================================

function stopAudio() {

  audioPlayer.pause();

  audioPlayer.currentTime = 0;

  vinylA.classList.remove("playing");

  vinylB.classList.remove("playing");

}


// ==========================================
// CONTROL DECK A / B
// ==========================================

function toggleDeck(deck) {

  if (deck === "A") {

    deckAPlaying = !deckAPlaying;

    vinylA.classList.toggle(
      "playing",
      deckAPlaying
    );

  }

  if (deck === "B") {

    deckBPlaying = !deckBPlaying;

    vinylB.classList.toggle(
      "playing",
      deckBPlaying
    );

  }

}


// ==========================================
// CARGAR AUDIO DESDE DECK
// ==========================================

function loadAudio(deck) {

  audioFile.click();

}


// ==========================================
// VOLUMEN MASTER
// ==========================================

const masterVolume =
  document.getElementById("masterVolume");

masterVolume.addEventListener("input", function () {

  audioPlayer.volume = this.value;

  video.volume = this.value;

});


// ==========================================
// VIDEO
// ==========================================

video.addEventListener("play", function () {

  videoStatus.textContent = "VIDEO EN REPRODUCCIÓN";

  videoStatus.style.color = "#00ffcc";

});

video.addEventListener("pause", function () {

  videoStatus.textContent = "VIDEO PAUSADO";

});


// ==========================================
// PANTALLA COMPLETA
// ==========================================

function fullscreenVideo() {

  if (video.requestFullscreen) {

    video.requestFullscreen();

  } else if (video.webkitRequestFullscreen) {

    video.webkitRequestFullscreen();

  }

}


// ==========================================
// ANIMACIÓN DE VINILOS SEGÚN AUDIO
// ==========================================

audioPlayer.addEventListener("play", function () {

  vinylA.classList.add("playing");
  vinylB.classList.add("playing");

});

audioPlayer.addEventListener("pause", function () {

  vinylA.classList.remove("playing");
  vinylB.classList.remove("playing");

});

audioPlayer.addEventListener("ended", function () {

  vinylA.classList.remove("playing");
  vinylB.classList.remove("playing");

});


// ==========================================
// TECLADO DJ
// ==========================================

document.addEventListener("keydown", function(event) {

  // ESPACIO = PLAY / PAUSE

  if (event.code === "Space") {

    event.preventDefault();

    if (audioPlayer.paused) {

      playAudio();

    } else {

      pauseAudio();

    }

  }

});


// ==========================================
// INICIO
// ==========================================

audioPlayer.volume = 0.8;

console.log(
  "HC PRO DJ HUMBERTO — Sistema iniciado correctamente."
);
