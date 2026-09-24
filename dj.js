/* =========================================================
   HC PRO DJ HUMBERTO 3.0
   PROFESSIONAL DJ SYSTEM
   SINGLE INTEGRATED ENGINE
========================================================= */

(() => {

"use strict";


/* =========================================================
   HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);


const clamp = (value, min, max) =>
    Math.max(min, Math.min(max, value));


const dbToGain = (db) =>
    Math.pow(10, db / 20);


function formatTime(seconds) {

    if (!Number.isFinite(seconds)) {
        return "00:00";
    }

    seconds = Math.max(0, Math.floor(seconds));

    const minutes = Math.floor(seconds / 60);

    const secs = seconds % 60;

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(secs).padStart(2, "0")
    );
}


function safeText(value) {

    return String(value ?? "")
        .replace(/[&<>"']/g, char => {

            const map = {

                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"

            };

            return map[char];

        });

}


/* =========================================================
   STATE
========================================================= */

const state = {

    started: false,

    activeDeck: "A",

    autoDJ: false,

    transitioning: false,

    transitionSeconds: 10,

    transitionMode: "crossfade",

    library: [],

    history: [],

    smartQueue: [],

    smartResults: [],

    micOn: false,

    recording: false,

    recorder: null,

    recordChunks: [],

    micStream: null,

    micSource: null,

    nextPrepared: false,

    currentTrack: null,

    raf: null

};


/* =========================================================
   AUDIO ENGINE
========================================================= */

const audioEngine = {

    ctx: null,

    masterGain: null,

    analyser: null,

    recordDestination: null,

    micGain: null,

    decks: {},

    initialized: false

};


/* =========================================================
   DECK CLASS
========================================================= */

class Deck {

    constructor(name) {

        this.name = name;

        this.media = document.createElement("audio");

        this.media.id =
            "media" + name;

        this.media.preload = "auto";

        this.media.crossOrigin = "anonymous";

        this.media.volume = 1;

        document.body.appendChild(this.media);


        this.file = null;

        this.url = null;

        this.videoUrl = null;

        this.track = null;

        this.playing = false;

        this.source = null;

        this.inputGain = null;

        this.low = null;

        this.mid = null;

        this.high = null;

        this.filter = null;

        this.channelGain = null;

        this.analyser = null;

        this.delay = null;

        this.delayFeedback = null;

        this.delayWet = null;

        this.flangerDelay = null;

        this.flangerWet = null;

        this.flangerLfo = null;

        this.flangerLfoGain = null;

        this.reverb = null;

        this.reverbWet = null;

        this.filterActive = false;

        this.echoActive = false;

        this.flangerActive = false;

        this.reverbActive = false;

        this.setupEvents();

    }


    initAudio() {

        if (this.source) {
            return;
        }


        const ctx =
            audioEngine.ctx;


        this.source =
            ctx.createMediaElementSource(
                this.media
            );


        this.inputGain =
            ctx.createGain();


        this.low =
            ctx.createBiquadFilter();

        this.low.type =
            "lowshelf";

        this.low.frequency.value =
            200;


        this.mid =
            ctx.createBiquadFilter();

        this.mid.type =
            "peaking";

        this.mid.frequency.value =
            1000;

        this.mid.Q.value =
            0.9;


        this.high =
            ctx.createBiquadFilter();

        this.high.type =
            "highshelf";

        this.high.frequency.value =
            6000;


        this.filter =
            ctx.createBiquadFilter();

        this.filter.type =
            "lowpass";

        this.filter.frequency.value =
            22050;

        this.filter.Q.value =
            0.7;


        this.channelGain =
            ctx.createGain();

        this.channelGain.gain.value =
            0;


        this.analyser =
            ctx.createAnalyser();

        this.analyser.fftSize =
            1024;

        this.analyser.smoothingTimeConstant =
            0.75;


        /* Echo */

        this.delay =
            ctx.createDelay(1);

        this.delay.delayTime.value =
            0.28;


        this.delayFeedback =
            ctx.createGain();

        this.delayFeedback.gain.value =
            0.25;


        this.delayWet =
            ctx.createGain();

        this.delayWet.gain.value =
            0;


        /* Flanger */

        this.flangerDelay =
            ctx.createDelay(.1);

        this.flangerDelay.delayTime.value =
            0.004;


        this.flangerWet =
            ctx.createGain();

        this.flangerWet.gain.value =
            0;


        this.flangerLfo =
            ctx.createOscillator();

        this.flangerLfo.frequency.value =
            0.25;


        this.flangerLfoGain =
            ctx.createGain();

        this.flangerLfoGain.gain.value =
            0.003;


        this.flangerLfo.connect(
            this.flangerLfoGain
        );

        this.flangerLfoGain.connect(
            this.flangerDelay.delayTime
        );


        /* Reverb */

        this.reverb =
            ctx.createConvolver();

        this.reverb.buffer =
            this.createImpulse(
                ctx,
                2.2,
                2
            );


        this.reverbWet =
            ctx.createGain();

        this.reverbWet.gain.value =
            0;


        /* Main signal */

        this.source.connect(
            this.inputGain
        );

        this.inputGain.connect(
            this.low
        );

        this.low.connect(
            this.mid
        );

        this.mid.connect(
            this.high
        );

        this.high.connect(
            this.filter
        );


        /* Dry */

        this.filter.connect(
            this.channelGain
        );


        /* Echo */

        this.filter.connect(
            this.delay
        );

        this.delay.connect(
            this.delayFeedback
        );

        this.delayFeedback.connect(
            this.delay
        );

        this.delay.connect(
            this.delayWet
        );

        this.delayWet.connect(
            this.channelGain
        );


        /* Flanger */

        this.filter.connect(
            this.flangerDelay
        );

        this.flangerDelay.connect(
            this.flangerWet
        );

        this.flangerWet.connect(
            this.channelGain
        );


        /* Reverb */

        this.filter.connect(
            this.reverb
        );

        this.reverb.connect(
            this.reverbWet
        );

        this.reverbWet.connect(
            this.channelGain
        );


        this.channelGain.connect(
            this.analyser
        );

        this.analyser.connect(
            audioEngine.masterGain
        );


        try {
            this.flangerLfo.start();
        } catch (_) {}


        this.setCrossGain(
            0.5
        );

    }


    createImpulse(ctx, seconds, decay) {

        const length =
            ctx.sampleRate * seconds;

        const buffer =
            ctx.createBuffer(
                2,
                length,
                ctx.sampleRate
            );


        for (
            let channel = 0;
            channel < 2;
            channel++
        ) {

            const data =
                buffer.getChannelData(
                    channel
                );

            for (
                let i = 0;
                i < length;
                i++
            ) {

                data[i] =
                    (
                        Math.random() * 2 - 1
                    ) *
                    Math.pow(
                        1 - i / length,
                        decay
                    );

            }

        }

        return buffer;

    }


    setupEvents() {

        this.media.addEventListener(
            "loadedmetadata",
            () => {

                updateDeckDisplay(
                    this.name
                );

                if (
                    this.name === state.activeDeck
                ) {

                    syncCentralVideo();

                }

            }
        );


        this.media.addEventListener(
            "timeupdate",
            () => {

                updateDeckDisplay(
                    this.name
                );

                if (
                    this.name === state.activeDeck
                ) {

                    syncCentralVideo();

                    updateSmartCurrent();

                    if (
                        state.autoDJ
                    ) {

                        checkAutoDJ();

                    }

                }

            }
        );


        this.media.addEventListener(
            "play",
            () => {

                this.playing = true;

                updateDeckVisual(
                    this.name
                );

                if (
                    this.name === state.activeDeck
                ) {

                    playCentralVideo();

                }

            }
        );


        this.media.addEventListener(
            "pause",
            () => {

                this.playing = false;

                updateDeckVisual(
                    this.name
                );

                if (
                    this.name === state.activeDeck
                ) {

                    pauseCentralVideo();

                }

            }
        );


        this.media.addEventListener(
            "ended",
            () => {

                this.playing = false;

                updateDeckVisual(
                    this.name
                );

                if (
                    state.autoDJ
                ) {

                    performAutoTransition(
                        true
                    );

                }

            }
        );


        this.media.addEventListener(
            "error",
            () => {

                setStatus(
                    "Error al reproducir " +
                    this.name,
                    true
                );

            }
        );

    }


    async play() {

        if (!this.track) {

            setStatus(
                "Carga una canción en Deck " +
                this.name,
                true
            );

            return;

        }


        await ensureAudioStarted();


        try {

            await this.media.play();

            setActiveDeck(
                this.name
            );

        } catch (error) {

            setStatus(
                "El navegador bloqueó la reproducción. Pulsa PLAY nuevamente.",
                true
            );

        }

    }


    pause() {

        this.media.pause();

    }


    stop() {

        this.media.pause();

        try {

            this.media.currentTime = 0;

        } catch (_) {}

    }


    loadFile(file, libraryTrack = null) {

        if (!file) {
            return;
        }


        if (
            this.url &&
            this.url.startsWith("blob:")
        ) {

            try {

                URL.revokeObjectURL(
                    this.url
                );

            } catch (_) {}

        }


        this.file = file;

        this.url =
            URL.createObjectURL(
                file
            );


        this.track =
            libraryTrack ||
            createTrackFromFile(
                file
            );


        this.videoUrl =
            file.type.startsWith("video/")
                ? this.url
                : null;


        this.media.src =
            this.url;

        this.media.load();


        updateDeckDisplay(
            this.name
        );


        if (
            this.name ===
            state.activeDeck
        ) {

            showTrackOnScreen(
                this.track,
                this.videoUrl
            );

        }


        setStatus(
            "Cargado en Deck " +
            this.name,
            false
        );

    }


    setGain(db) {

        if (!this.inputGain) {
            return;
        }

        this.inputGain.gain.value =
            dbToGain(
                Number(db)
            );

    }


    setPitch(rate) {

        this.media.playbackRate =
            Number(rate);

    }


    setEQ(type, value) {

        if (!this[type]) {
            return;
        }

        this[type].gain.value =
            Number(value);

    }


    setCrossGain(fader) {

        if (!this.channelGain) {
            return;
        }


        const position =
            clamp(
                Number(fader),
                0,
                1
            );


        if (this.name === "A") {

            this.channelGain.gain.value =
                Math.cos(
                    position *
                    Math.PI /
                    2
                );

        } else {

            this.channelGain.gain.value =
                Math.sin(
                    position *
                    Math.PI /
                    2
                );

        }

    }


    toggleEffect(type) {

        if (type === "filter") {

            this.filterActive =
                !this.filterActive;

            this.filter.frequency.value =
                this.filterActive
                    ? 850
                    : 22050;

            return this.filterActive;

        }


        if (type === "echo") {

            this.echoActive =
                !this.echoActive;

            this.delayWet.gain.value =
                this.echoActive
                    ? .38
                    : 0;

            return this.echoActive;

        }


        if (type === "flanger") {

            this.flangerActive =
                !this.flangerActive;

            this.flangerWet.gain.value =
                this.flangerActive
                    ? .28
                    : 0;

            return this.flangerActive;

        }


        if (type === "reverb") {

            this.reverbActive =
                !this.reverbActive;

            this.reverbWet.gain.value =
                this.reverbActive
                    ? .28
                    : 0;

            return this.reverbActive;

        }


        return false;

    }

}


/* =========================================================
   INITIALIZE AUDIO
========================================================= */

async function ensureAudioStarted() {

    if (
        audioEngine.initialized
    ) {

        if (
            audioEngine.ctx.state ===
            "suspended"
        ) {

            await audioEngine.ctx.resume();

        }

        return;

    }


    const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;


    if (!AudioContextClass) {

        setStatus(
            "Este navegador no soporta Web Audio.",
            true
        );

        return;

    }


    audioEngine.ctx =
        new AudioContextClass();


    audioEngine.masterGain =
        audioEngine.ctx.createGain();


    audioEngine.masterGain.gain.value =
        Number(
            $("masterVolume").value
        );


    audioEngine.analyser =
        audioEngine.ctx.createAnalyser();


    audioEngine.analyser.fftSize =
        2048;

    audioEngine.analyser.smoothingTimeConstant =
        .8;


    audioEngine.recordDestination =
        audioEngine.ctx.createMediaStreamDestination();


    audioEngine.masterGain.connect(
        audioEngine.analyser
    );


    audioEngine.analyser.connect(
        audioEngine.ctx.destination
    );


    audioEngine.masterGain.connect(
        audioEngine.recordDestination
    );


    audioEngine.micGain =
        audioEngine.ctx.createGain();

    audioEngine.micGain.gain.value =
        .8;


    audioEngine.decks.A =
        new Deck("A");

    audioEngine.decks.B =
        new Deck("B");


    audioEngine.decks.A.initAudio();
    audioEngine.decks.B.initAudio();


    await audioEngine.ctx.resume();


    audioEngine.initialized =
        true;


    updateCrossfader();


    setStatus(
        "AUDIO ENGINE ACTIVO",
        false
    );

}


/* =========================================================
   START SYSTEM
========================================================= */

async function startSystem() {

    try {

        $("bootStatus").textContent =
            "INICIANDO AUDIO ENGINE...";


        await ensureAudioStarted();


        state.started = true;


        $("bootOverlay").style.display =
            "none";


        $("app").classList.add(
            "started"
        );


        $("footerStatus").textContent =
            "AUDIO ENGINE ONLINE";


        setStatus(
            "SISTEMA ONLINE",
            false
        );


        startVisualizer();


    } catch (error) {

        console.error(error);

        $("bootStatus").textContent =
            "ERROR: " +
            error.message;

        setStatus(
            "Error de inicialización",
            true
        );

    }

}


/* =========================================================
   STATUS
========================================================= */

function setStatus(message, error = false) {

    const system =
        $("systemStatus");

    if (system) {

        system.textContent =
            message;

        system.style.color =
            error
                ? "var(--red)"
                : "var(--green)";

    }


    const mixer =
        $("mixerMessage");

    if (mixer) {

        mixer.textContent =
            message;

    }


    const screen =
        $("screenStatus");

    if (screen) {

        screen.textContent =
            error
                ? "ERROR"
                : "ONLINE";

    }

}


/* =========================================================
   ACTIVE DECK
========================================================= */

function setActiveDeck(name) {

    state.activeDeck =
        name;


    const deck =
        audioEngine.decks[name];

    if (!deck) {
        return;
    }


    $("screenDeck").textContent =
        "DECK " + name;


    if (deck.track) {

        showTrackOnScreen(
            deck.track,
            deck.videoUrl
        );

    }


    updateSmartCurrent();


    const other =
        name === "A"
            ? "B"
            : "A";


    const otherDeck =
        audioEngine.decks[other];


    if (
        otherDeck &&
        !otherDeck.playing
    ) {

        setCrossfader(
            name === "A"
                ? 0
                : 1
        );

    }

}


/* =========================================================
   FILE LOADING
========================================================= */

function openDeckFile(name) {

    const input =
        $("file" + name);

    if (input) {

        input.value = "";

        input.click();

    }

}


function loadDeckInput(name, file) {

    if (!file) {
        return;
    }


    const deck =
        audioEngine.decks[name];

    if (!deck) {
        return;
    }


    const existing =
        findTrackByFile(
            file
        );


    deck.loadFile(
        file,
        existing
    );


    if (
        existing
    ) {

        state.currentTrack =
            existing;

    }


    setActiveDeck(
        name
    );

}


/* =========================================================
   CENTRAL VIDEO
========================================================= */

function showTrackOnScreen(
    track,
    videoUrl
) {

    const video =
        $("videoPlayer");

    const placeholder =
        $("screenPlaceholder");

    const title =
        $("screenTrack");


    if (!video) {
        return;
    }


    title.textContent =
        track?.title ||
        "NO TRACK";


    if (videoUrl) {

        video.src =
            videoUrl;

        video.style.display =
            "block";

        placeholder.style.display =
            "none";

        video.load();

    } else {

        video.pause();

        video.removeAttribute(
            "src"
        );

        video.load();

        video.style.display =
            "none";

        placeholder.style.display =
            "flex";

    }

}


function playCentralVideo() {

    const deck =
        audioEngine.decks[
            state.activeDeck
        ];


    const video =
        $("videoPlayer");


    if (
        !deck ||
        !deck.videoUrl
    ) {

        return;

    }


    video.playbackRate =
        deck.media.playbackRate;


    try {

        if (
            Math.abs(
                video.currentTime -
                deck.media.currentTime
            ) > .4
        ) {

            video.currentTime =
                deck.media.currentTime;

        }

        video.play();

    } catch (_) {}

}


function pauseCentralVideo() {

    const video =
        $("videoPlayer");

    if (video) {

        video.pause();

    }

}


function stopCentralVideo() {

    const video =
        $("videoPlayer");

    if (!video) {
        return;
    }


    video.pause();

    try {

        video.currentTime =
            0;

    } catch (_) {}

}


function syncCentralVideo() {

    const deck =
        audioEngine.decks[
            state.activeDeck
        ];

    const video =
        $("videoPlayer");


    if (
        !deck ||
        !video ||
        !deck.videoUrl
    ) {

        return;

    }


    if (
        Math.abs(
            video.currentTime -
            deck.media.currentTime
        ) > .35
    ) {

        try {

            video.currentTime =
                deck.media.currentTime;

        } catch (_) {}

    }


    video.playbackRate =
        deck.media.playbackRate;

}


/* =========================================================
   DECK DISPLAY
========================================================= */

function updateDeckDisplay(name) {

    const deck =
        audioEngine.decks[name];

    if (!deck) {
        return;
    }


    const prefix =
        name.toLowerCase();


    $(prefix + "Title").textContent =
        deck.track?.title ||
        "SIN CANCIÓN";


    const duration =
        deck.media.duration;


    $(prefix + "Time").textContent =
        formatTime(
            deck.media.currentTime
        );


    $(prefix + "Duration").textContent =
        formatTime(
            duration
        );


    if (
        Number.isFinite(duration) &&
        duration > 0
    ) {

        $(
            prefix + "Progress"
        ).value =
            (
                deck.media.currentTime /
                duration
            ) *
            100;

    } else {

        $(
            prefix + "Progress"
        ).value =
            0;

    }


    const indicator =
        $(prefix + "Indicator");


    if (indicator) {

        indicator.textContent =
            deck.playing
                ? "PLAYING"
                : deck.track
                    ? "LOADED"
                    : "READY";

        indicator.style.color =
            deck.playing
                ? "var(--green)"
                : "var(--muted)";

    }


    $(prefix + "Bpm").textContent =
        deck.track?.bpm
            ? Math.round(
                deck.track.bpm
            )
            : "---";


    $(prefix + "Key").textContent =
        deck.track?.key ||
        "---";


    $(prefix + "Energy").textContent =
        deck.track?.energy != null
            ? Math.round(
                deck.track.energy
            )
            : "---";


    updateDeckVisual(
        name
    );

}


function updateDeckVisual(name) {

    const deck =
        audioEngine.decks[name];

    const vinyl =
        $("vinyl" + name);

    if (!deck || !vinyl) {
        return;
    }


    vinyl.classList.toggle(
        "spinning",
        deck.playing
    );

}


/* =========================================================
   DECK BUTTONS
========================================================= */

function setupDeckControls(name) {

    const prefix =
        name.toLowerCase();


    $("aLoad" === prefix + "Load"
        ? "aLoad"
        : "bLoad");


    $(prefix + "Load")
        .addEventListener(
            "click",
            () => openDeckFile(name)
        );


    $(prefix + "Play")
        .addEventListener(
            "click",
            () =>
                audioEngine.decks[name].play()
        );


    $(prefix + "Pause")
        .addEventListener(
            "click",
            () =>
                audioEngine.decks[name].pause()
        );


    $(prefix + "Stop")
        .addEventListener(
            "click",
            () => {

                audioEngine.decks[name].stop();

                if (
                    name === state.activeDeck
                ) {

                    stopCentralVideo();

                }

            }
        );


    $(prefix + "Progress")
        .addEventListener(
            "input",
            event => {

                const deck =
                    audioEngine.decks[name];

                if (
                    !deck ||
                    !Number.isFinite(
                        deck.media.duration
                    )
                ) {

                    return;

                }


                deck.media.currentTime =
                    (
                        Number(
                            event.target.value
                        ) / 100
                    ) *
                    deck.media.duration;

            }
        );


    $(prefix + "Gain")
        .addEventListener(
            "input",
            event => {

                const value =
                    Number(
                        event.target.value
                    );

                audioEngine.decks[name]
                    .setGain(value);

                $(prefix + "GainValue")
                    .textContent =
                    value.toFixed(1) +
                    " dB";

            }
        );


    $(prefix + "Pitch")
        .addEventListener(
            "input",
            event => {

                const value =
                    Number(
                        event.target.value
                    );

                audioEngine.decks[name]
                    .setPitch(value);

                $(prefix + "PitchValue")
                    .textContent =
                    value.toFixed(2) +
                    "x";

            }
        );


    ["Low","Mid","High"].forEach(
        band => {

            $(prefix + band)
                .addEventListener(
                    "input",
                    event => {

                        const value =
                            Number(
                                event.target.value
                            );

                        const node =
                            band.toLowerCase();

                        audioEngine
                            .decks[name]
                            .setEQ(
                                node,
                                value
                            );

                        $(prefix + band + "Value")
                            .textContent =
                            value.toFixed(1);

                    }
                );

        }
    );


    ["Filter","Echo","Flanger","Reverb"]
        .forEach(
            effect => {

                $(prefix + effect)
                    .addEventListener(
                        "click",
                        event => {

                            const active =
                                audioEngine
                                    .decks[name]
                                    .toggleEffect(
                                        effect.toLowerCase()
                                    );

                            event.currentTarget
                                .classList.toggle(
                                    "active",
                                    active
                                );

                        }
                    );

            }
        );

}


/* =========================================================
   MIXER
========================================================= */

function setCrossfader(value) {

    const fader =
        clamp(
            Number(value),
            0,
            1
        );


    $("crossfader").value =
        fader;


    updateCrossfader();

}


function updateCrossfader() {

    if (
        !audioEngine.decks.A ||
        !audioEngine.decks.B
    ) {

        return;

    }


    const value =
        Number(
            $("crossfader").value
        );


    audioEngine.decks.A
        .setCrossGain(
            value
        );

    audioEngine.decks.B
        .setCrossGain(
            value
        );


    let label;

    if (value < .47) {

        label = "A";

    } else if (value > .53) {

        label = "B";

    } else {

        label = "CENTER";

    }


    $("crossValue").textContent =
        label;

}


/* =========================================================
   AUTO DJ
========================================================= */

function toggleAutoDJ() {

    state.autoDJ =
        !state.autoDJ;


    const button =
        $("autoDJBtn");


    button.classList.toggle(
        "active",
        state.autoDJ
    );


    button.querySelector(
        "small"
    ).textContent =
        state.autoDJ
            ? "ON"
            : "OFF";


    if (
        state.autoDJ
    ) {

        setStatus(
            "AUTO DJ ACTIVADO",
            false
        );


        prepareNextTrack();

    } else {

        setStatus(
            "AUTO DJ DESACTIVADO",
            false
        );

    }

}


function getActiveDeck() {

    return audioEngine.decks[
        state.activeDeck
    ];

}


function getInactiveDeck() {

    return audioEngine.decks[
        state.activeDeck === "A"
            ? "B"
            : "A"
    ];

}


function checkAutoDJ() {

    if (
        !state.autoDJ ||
        state.transitioning
    ) {

        return;

    }


    const deck =
        getActiveDeck();


    if (
        !deck ||
        !deck.track ||
        !Number.isFinite(
            deck.media.duration
        )
    ) {

        return;

    }


    const remaining =
        deck.media.duration -
        deck.media.currentTime;


    if (
        remaining <=
        state.transitionSeconds
    ) {

        performAutoTransition();

    }

}


async function prepareNextTrack() {

    const inactive =
        getInactiveDeck();


    if (
        !inactive ||
        inactive.playing
    ) {

        return;

    }


    const current =
        getActiveDeck()?.track;


    const next =
        chooseBestNext(
            current
        );


    if (!next) {

        setStatus(
            "No hay siguiente canción compatible.",
            true
        );

        return;

    }


    inactive.loadFile(
        next.file,
        next
    );


    if (
        current &&
        current.bpm &&
        next.bpm
    ) {

        const ratio =
            current.bpm /
            next.bpm;


        const safeRate =
            clamp(
                ratio,
                .92,
                1.08
            );


        const prefix =
            inactive.name.toLowerCase();


        inactive.media.playbackRate =
            safeRate;


        $(
            prefix + "Pitch"
        ).value =
            safeRate;


        $(
            prefix + "PitchValue"
        ).textContent =
            safeRate.toFixed(2) +
            "x";

    }


    state.nextPrepared =
        true;


    setStatus(
        "Siguiente preparada: " +
        next.title,
        false
    );

}


async function performAutoTransition(force = false) {

    if (
        state.transitioning
    ) {

        return;

    }


    const current =
        getActiveDeck();

    const next =
        getInactiveDeck();


    if (
        !current ||
        !next ||
        !next.track
    ) {

        if (!force) {
            await prepareNextTrack();
        }

        return;

    }


    state.transitioning =
        true;


    try {

        await ensureAudioStarted();


        const startValue =
            state.activeDeck === "A"
                ? 0
                : 1;


        const endValue =
            state.activeDeck === "A"
                ? 1
                : 0;


        setCrossfader(
            startValue
        );


        await next.play();


        const duration =
            state.transitionMode === "fade"
                ? 5000
                : 8000;


        if (
            state.transitionMode ===
            "echo"
        ) {

            next.toggleEffect(
                "echo"
            );

        }


        if (
            state.transitionMode ===
            "filter"
        ) {

            current.filter.frequency.value =
                1200;

        }


        const startTime =
            performance.now();


        await new Promise(
            resolve => {

                function animate(now) {

                    const progress =
                        clamp(
                            (
                                now -
                                startTime
                            ) / duration,
                            0,
                            1
                        );


                    const eased =
                        progress *
                        progress *
                        (
                            3 -
                            2 *
                            progress
                        );


                    const value =
                        startValue +
                        (
                            endValue -
                            startValue
                        ) *
                        eased;


                    setCrossfader(
                        value
                    );


                    if (
                        progress < 1
                    ) {

                        requestAnimationFrame(
                            animate
                        );

                    } else {

                        resolve();

                    }

                }


                requestAnimationFrame(
                    animate
                );

            }
        );


        if (
            state.transitionMode ===
            "filter"
        ) {

            current.filter.frequency.value =
                22050;

        }


        current.stop();


        state.activeDeck =
            next.name;


        state.currentTrack =
            next.track;


        state.nextPrepared =
            false;


        setActiveDeck(
            next.name
        );


        setCrossfader(
            next.name === "A"
                ? 0
                : 1
        );


        pushHistory(
            next.track
        );


        await prepareNextTrack();


    } catch (error) {

        console.error(
            "Auto DJ:",
            error
        );

        setStatus(
            "Error durante Auto DJ",
            true
        );

    }


    state.transitioning =
        false;

}


/* =========================================================
   LIBRARY
========================================================= */

function createTrackFromFile(file) {

    const parsed =
        parseFileName(
            file.name
        );


    return {

        id:
            "track_" +
            Date.now() +
            "_" +
            Math.random()
                .toString(36)
                .slice(2),

        file,

        title:
            parsed.title,

        artist:
            parsed.artist,

        genre:
            "General",

        bpm:
            null,

        key:
            null,

        energy:
            null,

        duration:
            null,

        analyzed:
            false

    };

}


function parseFileName(filename) {

    const clean =
        filename.replace(
            /\.[^/.]+$/,
            ""
        );


    const parts =
        clean.split(
            " - "
        );


    if (
        parts.length >= 2
    ) {

        return {

            artist:
                parts.shift().trim(),

            title:
                parts.join(" - ")
                    .trim()

        };

    }


    return {

        artist:
            "HC PRO",

        title:
            clean.trim()

    };

}


function findTrackByFile(file) {

    return state.library.find(
        track =>
            track.file === file
    ) || null;

}


function addFilesToLibrary(files) {

    const valid =
        Array.from(files || [])
            .filter(
                file =>
                    file.type.startsWith(
                        "audio/"
                    ) ||
                    file.type.startsWith(
                        "video/"
                    )
            );


    let added = 0;


    for (const file of valid) {

        if (
            findTrackByFile(file)
        ) {

            continue;

        }


        state.library.push(
            createTrackFromFile(
                file
            )
        );

        added++;

    }


    renderLibrary();


    saveLibraryMetadata();


    setStatus(
        added +
        " archivo(s) agregados a la biblioteca.",
        false
    );

}


function renderLibrary() {

    const body =
        $("libraryBody");


    if (
        !state.library.length
    ) {

        body.innerHTML =
            '<div class="library-empty">' +
            'No hay canciones cargadas.' +
            '</div>';

        return;

    }


    body.innerHTML =
        state.library.map(
            track => `

                <div
                    class="library-row"
                    data-id="${safeText(track.id)}"
                >

                    <div
                        class="library-title"
                        title="${safeText(track.title)}"
                    >
                        ${safeText(track.artist)}
                        -
                        ${safeText(track.title)}
                    </div>

                    <div class="library-data">
                        ${
                            track.bpm
                                ? Math.round(track.bpm)
                                : "---"
                        }
                    </div>

                    <div class="library-data">
                        ${
                            track.key ||
                            "---"
                        }
                    </div>

                    <div class="library-data">
                        ${
                            track.energy != null
                                ? Math.round(track.energy)
                                : "---"
                        }
                    </div>

                    <div class="library-actions">

                        <button
                            data-action="a"
                            data-id="${safeText(track.id)}">
                            A
                        </button>

                        <button
                            data-action="b"
                            data-id="${safeText(track.id)}">
                            B
                        </button>

                        <button
                            data-action="analyze"
                            data-id="${safeText(track.id)}">
                            🔎
                        </button>

                    </div>

                </div>
            `
        ).join("");

}


/* =========================================================
   LIBRARY ACTIONS
========================================================= */

function findTrackById(id) {

    return state.library.find(
        track =>
            track.id === id
    );

}


async function handleLibraryAction(
    action,
    id
) {

    const track =
        findTrackById(id);


    if (!track) {
        return;
    }


    if (
        action === "a"
    ) {

        audioEngine.decks.A
            .loadFile(
                track.file,
                track
            );

        setActiveDeck("A");

        return;

    }


    if (
        action === "b"
    ) {

        audioEngine.decks.B
            .loadFile(
                track.file,
                track
            );

        setActiveDeck("B");

        return;

    }


    if (
        action === "analyze"
    ) {

        await analyzeTrack(
            track
        );

    }

}


/* =========================================================
   ANALYSIS
========================================================= */

async function analyzeTrack(track) {

    if (
        !track ||
        !track.file
    ) {

        return;

    }


    setStatus(
        "Analizando: " +
        track.title,
        false
    );


    try {

        const buffer =
            await track.file.arrayBuffer();


        const decoded =
            await audioEngine.ctx
                .decodeAudioData(
                    buffer.slice(0)
                );


        track.duration =
            decoded.duration;


        const samples =
            getMonoSamples(
                decoded,
                60000
            );


        track.energy =
            estimateEnergy(
                samples
            );


        track.bpm =
            estimateBPM(
                samples,
                decoded.sampleRate
            );


        track.key =
            estimateKey(
                decoded
            );


        track.analyzed =
            true;


        renderLibrary();

        updateDeckTrackIfNeeded(
            track
        );


        saveLibraryMetadata();


        setStatus(
            "Analizado: " +
            track.title,
            false
        );


        return track;

    } catch (error) {

        console.error(
            "Analysis error:",
            error
        );


        setStatus(
            "No se pudo analizar " +
            track.title,
            true
        );

    }

}


/* =========================================================
   MONO SAMPLES
========================================================= */

function getMonoSamples(
    buffer,
    maxMilliseconds
) {

    const channelCount =
        buffer.numberOfChannels;


    const maxSamples =
        Math.min(
            buffer.length,
            Math.floor(
                buffer.sampleRate *
                maxMilliseconds /
                1000
            )
        );


    const result =
        new Float32Array(
            maxSamples
        );


    for (
        let channel = 0;
        channel < channelCount;
        channel++
    ) {

        const data =
            buffer.getChannelData(
                channel
            );


        for (
            let i = 0;
            i < maxSamples;
            i++
        ) {

            result[i] +=
                data[i] /
                channelCount;

        }

    }


    return result;

}


/* =========================================================
   ENERGY
========================================================= */

function estimateEnergy(samples) {

    if (
        !samples ||
        !samples.length
    ) {

        return 0;

    }


    const step =
        Math.max(
            1,
            Math.floor(
                samples.length /
                50000
            )
        );


    let sum = 0;

    let count = 0;


    for (
        let i = 0;
        i < samples.length;
        i += step
    ) {

        sum +=
            samples[i] *
            samples[i];

        count++;

    }


    const rms =
        Math.sqrt(
            sum /
            Math.max(
                1,
                count
            )
        );


    return clamp(
        rms * 300,
        0,
        100
    );

}


/* =========================================================
   BPM ESTIMATOR
   Rough browser estimate
========================================================= */

function estimateBPM(
    samples,
    sampleRate
) {

    if (
        !samples ||
        samples.length < 10000
    ) {

        return null;

    }


    const targetRate =
        22050;


    const ratio =
        sampleRate /
        targetRate;


    const step =
        Math.max(
            1,
            Math.round(
                ratio
            )
        );


    const reducedLength =
        Math.floor(
            samples.length /
            step
        );


    const reduced =
        new Float32Array(
            reducedLength
        );


    for (
        let i = 0;
        i < reducedLength;
        i++
    ) {

        reduced[i] =
            samples[i * step];

    }


    const envelopeRate =
        100;


    const hop =
        Math.max(
            1,
            Math.floor(
                targetRate /
                envelopeRate
            )
        );


    const frame =
        Math.max(
            1,
            Math.floor(
                hop *
                .5
            )
        );


    const envelope = [];


    for (
        let i = 0;
        i + frame < reduced.length;
        i += hop
    ) {

        let sum = 0;

        for (
            let j = 0;
            j < frame;
            j++
        ) {

            const value =
                reduced[i + j] || 0;

            sum +=
                value *
                value;

        }


        envelope.push(
            Math.sqrt(
                sum /
                frame
            )
        );

    }


    if (
        envelope.length < 100
    ) {

        return null;

    }


    const diff = [];

    for (
        let i = 1;
        i < envelope.length;
        i++
    ) {

        diff.push(
            Math.max(
                0,
                envelope[i] -
                envelope[i - 1]
            )
        );

    }


    let bestBpm =
        120;

    let bestScore =
        -Infinity;


    for (
        let bpm = 70;
        bpm <= 180;
        bpm += 1
    ) {

        const period =
            (
                60 /
                bpm
            ) *
            envelopeRate;


        let score = 0;


        for (
            let i = 0;
            i < diff.length - period;
            i++
        ) {

            const index =
                Math.round(
                    i + period
                );


            score +=
                diff[i] *
                (
                    diff[index] || 0
                );

        }


        if (
            score >
            bestScore
        ) {

            bestScore =
                score;

            bestBpm =
                bpm;

        }

    }


    return clamp(
        bestBpm,
        70,
        180
    );

}


/* =========================================================
   KEY ESTIMATOR
   Rough spectral estimate
========================================================= */

function estimateKey(buffer) {

    const sampleRate =
        buffer.sampleRate;


    const channel =
        buffer.getChannelData(
            0
        );


    const size =
        4096;


    let start =
        Math.floor(
            (
                buffer.length -
                size
            ) *
            .5
        );


    start =
        Math.max(
            0,
            start
        );


    const samples =
        channel.slice(
            start,
            start + size
        );


    if (
        samples.length < size
    ) {

        return null;

    }


    const noteNames = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B"
    ];


    const pitchClassEnergy =
        new Array(12).fill(0);


    /*
      Rough Goertzel scan.
      This is intentionally labeled as
      an estimate, not professional key detection.
    */

    for (
        let midi = 40;
        midi <= 84;
        midi++
    ) {

        const frequency =
            440 *
            Math.pow(
                2,
                (
                    midi -
                    69
                ) /
                12
            );


        if (
            frequency >
            sampleRate / 2
        ) {

            continue;

        }


        const power =
            goertzelPower(
                samples,
                sampleRate,
                frequency
            );


        const pc =
            (
                midi %
                12 +
                12
            ) %
            12;


        pitchClassEnergy[pc] +=
            power;

    }


    let best =
        0;


    for (
        let i = 1;
        i < 12;
        i++
    ) {

        if (
            pitchClassEnergy[i] >
            pitchClassEnergy[best]
        ) {

            best =
                i;

        }

    }


    return (
        noteNames[best] +
        " (est.)"
    );

}


function goertzelPower(
    samples,
    sampleRate,
    frequency
) {

    const omega =
        2 *
        Math.PI *
        frequency /
        sampleRate;


    const coefficient =
        2 *
        Math.cos(
            omega
        );


    let q1 = 0;

    let q2 = 0;


    const length =
        samples.length;


    for (
        let i = 0;
        i < length;
        i++
    ) {

        const q0 =
            coefficient *
            q1 -
            q2 +
            samples[i];

        q2 =
            q1;

        q1 =
            q0;

    }


    return (
        q1 * q1 +
        q2 * q2 -
        coefficient *
        q1 *
        q2
    );

}


/* =========================================================
   UPDATE DECK TRACK
========================================================= */

function updateDeckTrackIfNeeded(track) {

    for (
        const name of ["A","B"]
    ) {

        const deck =
            audioEngine.decks[name];


        if (
            deck &&
            deck.track === track
        ) {

            updateDeckDisplay(
                name
            );

        }

    }


    updateSmartCurrent();

}


/* =========================================================
   SMART CURRENT
========================================================= */

function updateSmartCurrent() {

    const deck =
        getActiveDeck();


    const track =
        deck?.track;


    $("smartCurrentTrack")
        .textContent =
        track
            ? track.title
            : "Sin canción";


    $("smartCurrentBpm")
        .textContent =
        track?.bpm
            ? Math.round(
                track.bpm
            )
            : "---";


    $("smartCurrentKey")
        .textContent =
        track?.key ||
        "---";


    $("smartCurrentEnergy")
        .textContent =
        track?.energy != null
            ? Math.round(
                track.energy
            )
            : "---";

}


/* =========================================================
   COMPATIBILITY
========================================================= */

function bpmCompatibility(
    a,
    b
) {

    if (
        !a ||
        !b
    ) {

        return 50;

    }


    let x =
        Number(a);

    let y =
        Number(b);


    if (
        !x ||
        !y
    ) {

        return 50;

    }


    while (
        y < x * .75
    ) {

        y *= 2;

    }


    while (
        y > x * 1.5
    ) {

        y /= 2;

    }


    const difference =
        Math.abs(
            x - y
        ) /
        x;


    return clamp(
        100 -
        difference *
        300,
        0,
        100
    );

}


function keyCompatibility(
    a,
    b
) {

    if (
        !a ||
        !b
    ) {

        return 50;

    }


    const parse =
        value =>
            String(value)
                .charAt(0) ===
                "C"
                ? null
                : null;


    const notes = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B"
    ];


    const getIndex =
        value => {

            const clean =
                String(value)
                    .replace(
                        " (est.)",
                        ""
                    );


            return notes.indexOf(
                clean
            );

        };


    const ia =
        getIndex(a);


    const ib =
        getIndex(b);


    if (
        ia < 0 ||
        ib < 0
    ) {

        return 50;

    }


    const diff =
        Math.min(
            Math.abs(
                ia - ib
            ),
            12 -
            Math.abs(
                ia - ib
            )
        );


    const scores = [
        100,
        88,
        75,
        62,
        52,
        65,
        25
    ];


    return scores[
        Math.min(
            diff,
            6
        )
    ];

}


function energyCompatibility(
    a,
    b,
    mode
) {

    const ea =
        Number(
            a
        );

    const eb =
        Number(
            b
        );


    if (
        !Number.isFinite(ea) ||
        !Number.isFinite(eb)
    ) {

        return 50;

    }


    const diff =
        Math.abs(
            ea -
            eb
        );


    let score =
        clamp(
            100 -
            diff *
            1.2,
            0,
            100
        );


    if (
        mode === "BUILD" &&
        eb >= ea
    ) {

        score += 15;

    }


    if (
        mode === "CHILL" &&
        eb <= ea
    ) {

        score += 15;

    }


    if (
        mode === "PEAK" &&
        eb >= 70
    ) {

        score += 15;

    }


    return clamp(
        score,
        0,
        100
    );

}


function compatibility(
    current,
    candidate
) {

    if (
        !current ||
        !candidate
    ) {

        return 0;

    }


    const mode =
        $("smartMode").value;


    const bpm =
        bpmCompatibility(
            current.bpm,
            candidate.bpm
        );


    const key =
        keyCompatibility(
            current.key,
            candidate.key
        );


    const energy =
        energyCompatibility(
            current.energy,
            candidate.energy,
            mode
        );


    return (
        bpm * .40 +
        key * .35 +
        energy * .25
    );

}


/* =========================================================
   CHOOSE BEST NEXT
========================================================= */

function chooseBestNext(
    current
) {

    const candidates =
        state.library.filter(
            track => {

                if (
                    !track ||
                    track === current
                ) {

                    return false;

                }


                if (
                    state.history
                        .slice(-5)
                        .includes(
                            track.id
                        )
                ) {

                    return false;

                }


                return true;

            }
        );


    if (
        !candidates.length
    ) {

        return (
            state.library.find(
                track =>
                    track !== current
            ) ||
            null
        );

    }


    if (!current) {

        return candidates[0];

    }


    return candidates
        .map(
            track => ({
                track,
                score:
                    compatibility(
                        current,
                        track
                    )
            })
        )
        .sort(
            (a,b) =>
                b.score -
                a.score
        )[0]
        ?.track ||
        null;

}


/* =========================================================
   SMART SEARCH
========================================================= */

function findBestNext() {

    const current =
        getActiveDeck()?.track;


    if (!current) {

        setStatus(
            "Carga una canción actual primero.",
            true
        );

        return;

    }


    if (
        !state.library.length
    ) {

        setStatus(
            "Importa canciones a la biblioteca.",
            true
        );

        return;

    }


    const results =
        state.library
            .filter(
                track =>
                    track !== current
            )
            .map(
                track => ({
                    track,
                    score:
                        compatibility(
                            current,
                            track
                        )
                })
            )
            .sort(
                (a,b) =>
                    b.score -
                    a.score
            )
            .slice(
                0,
                10
            );


    state.smartResults =
        results;


    renderSmartResults(
        results
    );


    setStatus(
        "Búsqueda Smart DJ completada.",
        false
    );

}


function renderSmartResults(
    results
) {

    const container =
        $("smartResults");


    if (
        !results.length
    ) {

        container.innerHTML =
            '<div class="empty-smart">' +
            'No se encontraron canciones.' +
            '</div>';

        return;

    }


    container.innerHTML =
        results.map(
            item => {

                const track =
                    item.track;


                return `

                    <div class="smart-result">

                        <div
                            class="smart-result-title"
                            title="${safeText(track.title)}"
                        >
                            ${safeText(track.artist)}
                            -
                            ${safeText(track.title)}
                        </div>

                        <div class="smart-mini">
                            BPM:
                            ${
                                track.bpm
                                    ? Math.round(track.bpm)
                                    : "---"
                            }
                        </div>

                        <div class="smart-mini">
                            ${
                                track.key ||
                                "---"
                            }
                        </div>

                        <div class="smart-score">
                            ${Math.round(item.score)}%
                        </div>

                        <button
                            class="smart-load"
                            data-smart-id="${safeText(track.id)}"
                        >
                            CARGAR B
                        </button>

                    </div>

                `;

            }
        ).join("");

}


/* =========================================================
   SMART PLAYLIST
========================================================= */

function createSmartPlaylist() {

    const current =
        getActiveDeck()?.track;


    if (
        !current
    ) {

        setStatus(
            "Carga una canción para crear la playlist.",
            true
        );

        return;

    }


    const available =
        state.library.filter(
            track =>
                track !== current
        );


    const queue = [];

    let base =
        current;


    const used =
        new Set([
            current.id
        ]);


    for (
        let i = 0;
        i < Math.min(
            12,
            available.length
        );
        i++
    ) {

        const candidates =
            available.filter(
                track =>
                    !used.has(
                        track.id
                    )
            );


        if (
            !candidates.length
        ) {

            break;

        }


        const next =
            candidates
                .map(
                    track => ({
                        track,
                        score:
                            compatibility(
                                base,
                                track
                            )
                    })
                )
                .sort(
                    (a,b) =>
                        b.score -
                        a.score
                )[0];


        if (!next) {
            break;
        }


        queue.push(
            next.track
        );


        used.add(
            next.track.id
        );


        base =
            next.track;

    }


    state.smartQueue =
        queue;


    renderQueue();


    setStatus(
        "Playlist Smart creada: " +
        queue.length +
        " canciones.",
        false
    );

}


function renderQueue() {

    const container =
        $("smartQueue");


    if (
        !state.smartQueue.length
    ) {

        container.innerHTML =
            "<span>Sin cola inteligente.</span>";

        return;

    }


    container.innerHTML =
        state.smartQueue
            .map(
                (track, index) => `

                    <div class="queue-item">

                        ${index + 1}.
                        ${safeText(track.title)}

                    </div>

                `
            )
            .join("");

}


/* =========================================================
   LOAD SMART RESULT
========================================================= */

function loadSmartToB(id) {

    const track =
        findTrackById(
            id
        );


    if (!track) {
        return;
    }


    audioEngine.decks.B
        .loadFile(
            track.file,
            track
        );


    setStatus(
        "Smart DJ preparó Deck B.",
        false
    );

}


/* =========================================================
   MIC
========================================================= */

async function toggleMic() {

    if (
        !audioEngine.initialized
    ) {

        await ensureAudioStarted();

    }


    if (
        state.micOn
    ) {

        if (
            state.micStream
        ) {

            state.micStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );

        }


        state.micOn =
            false;


        $("micBtn")
            .classList.remove(
                "active"
            );


        $("micBtn")
            .querySelector(
                "small"
            ).textContent =
            "OFF";


        setStatus(
            "Micrófono OFF",
            false
        );


        return;

    }


    try {

        const stream =
            await navigator
                .mediaDevices
                .getUserMedia({
                    audio: true
                });


        state.micStream =
            stream;


        state.micSource =
            audioEngine.ctx
                .createMediaStreamSource(
                    stream
                );


        state.micSource.connect(
            audioEngine.micGain
        );


        audioEngine.micGain.connect(
            audioEngine.masterGain
        );


        state.micOn =
            true;


        $("micBtn")
            .classList.add(
                "active"
            );


        $("micBtn")
            .querySelector(
                "small"
            ).textContent =
            "ON";


        setStatus(
            "Micrófono ON",
            false
        );

    } catch (error) {

        console.error(error);

        setStatus(
            "No se pudo activar el micrófono.",
            true
        );

    }

}


/* =========================================================
   RECORDING
========================================================= */

function getRecorderMime() {

    const options = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus"
    ];


    return options.find(
        type =>
            MediaRecorder
                .isTypeSupported(
                    type
                )
    ) || "";

}


function startRecording() {

    if (
        !audioEngine.recordDestination
    ) {

        setStatus(
            "Inicia primero el sistema.",
            true
        );

        return;

    }


    if (
        typeof MediaRecorder ===
        "undefined"
    ) {

        setStatus(
            "Este navegador no soporta grabación.",
            true
        );

        return;

    }


    const mime =
        getRecorderMime();


    try {

        state.recordChunks =
            [];


        state.recorder =
            new MediaRecorder(
                audioEngine
                    .recordDestination
                    .stream,
                mime
                    ? {
                        mimeType:
                            mime
                    }
                    : undefined
            );


        state.recorder.ondataavailable =
            event => {

                if (
                    event.data &&
                    event.data.size
                ) {

                    state.recordChunks
                        .push(
                            event.data
                        );

                }

            };


        state.recorder.onstop =
            saveRecording;


        state.recorder.start();


        state.recording =
            true;


        $("recordStart")
            .disabled =
            true;


        $("recordStop")
            .disabled =
            false;


        setStatus(
            "GRABANDO MIX...",
            false
        );

    } catch (error) {

        console.error(error);

        setStatus(
            "No se pudo iniciar la grabación.",
            true
        );

    }

}


function stopRecording() {

    if (
        !state.recorder ||
        !state.recording
    ) {

        return;

    }


    state.recorder.stop();


    state.recording =
        false;


    $("recordStart")
        .disabled =
        false;


    $("recordStop")
        .disabled =
        true;


    setStatus(
        "Procesando grabación...",
        false
    );
}


function saveRecording() {

    const blob =
        new Blob(
            state.recordChunks,
            {
                type:
                    state.recorder
                        ?.mimeType ||
                    "audio/webm"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    link.href =
        url;


    link.download =
        "HC-PRO-DJ-HUMBERTO-" +
        new Date()
            .toISOString()
            .replace(
                /[:.]/g,
                "-"
            ) +
        ".webm";


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    setTimeout(
        () =>
            URL.revokeObjectURL(
                url
            ),
        2000
    );


    setStatus(
        "Grabación guardada.",
        false
    );

}


/* =========================================================
   VISUALIZER
========================================================= */

function startVisualizer() {

    if (
        state.raf
    ) {

        cancelAnimationFrame(
            state.raf
        );

    }


    const canvas =
        $("visualizer");


    const ctx =
        canvas.getContext(
            "2d"
        );


    const bars =
        Array.from(
            $("visualizerBars")
                .querySelectorAll(
                    "span"
                )
        );


    function resize() {

        const rect =
            canvas.getBoundingClientRect();


        const dpr =
            window.devicePixelRatio ||
            1;


        canvas.width =
            rect.width *
            dpr;


        canvas.height =
            rect.height *
            dpr;


        ctx.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );

    }


    resize();

   window.addEventListener(
        "resize",
        resize
    );


    const data =
        new Uint8Array(
            audioEngine
                .analyser
                .frequencyBinCount
        );


    function draw() {

        state.raf =
            requestAnimationFrame(
                draw
            );


        if (
            !audioEngine.analyser
        ) {

            return;

        }


        audioEngine.analyser
            .getByteFrequencyData(
                data
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


        const barCount =
            70;


        const barWidth =
            width /
            barCount;


        for (
            let i = 0;
            i < barCount;
            i++
        ) {

            const index =
                Math.floor(
                    i *
                    data.length /
                    barCount
                );


            const value =
                data[index] /
                255;


            const barHeight =
                value *
                height *
                .8;


            const x =
                i *
                barWidth;


            const gradient =
                ctx.createLinearGradient(
                    0,
                    height,
                    0,
                    height -
                    barHeight
                );


            gradient.addColorStop(
                0,
                "#ff6a00"
            );


            gradient.addColorStop(
                1,
                "#00e5ff"
            );


            ctx.fillStyle =
                gradient;


            ctx.fillRect(
                x,
                height -
                barHeight,
                Math.max(
                    1,
                    barWidth -
                    2
                ),
                barHeight
            );

        }


        updateVisualBars(
            data
        );


        updateMeters(
            data
        );

    }


    draw();

}


function updateVisualBars(data) {

    const bars =
        Array.from(
            $("visualizerBars")
                .querySelectorAll(
                    "span"
                )
        );


    bars.forEach(
        (bar, index) => {

            const dataIndex =
                Math.floor(
                    index *
                    data.length /
                    bars.length
                );


            const value =
                data[dataIndex] /
                255;


            const height =
                15 +
                value *
                85;


            bar.style.height =
                height +
                "%";

        }
    );

}


function updateMeters(data) {

    if (
        !data ||
        !data.length
    ) {

        return;

    }


    let sum = 0;


    for (
        let i = 0;
        i < data.length;
        i++
    ) {

        const normalized =
            data[i] /
            255;

        sum +=
            normalized *
            normalized;

    }


    const rms =
        Math.sqrt(
            sum /
            data.length
        );


    const level =
        clamp(
            rms *
            250,
            0,
            100
        );


    $("meterL").style.width =
        level +
        "%";


    $("meterR").style.width =
        clamp(
            level *
            (
                .9 +
                Math.random() *
                .15
            ),
            0,
            100
        ) +
        "%";

}
   /* =========================================================
   HISTORY
========================================================= */

function pushHistory(track) {

    if (!track) {
        return;
    }


    state.history.push(
        track.id
    );


    if (
        state.history.length >
        30
    ) {

        state.history.shift();

    }


    try {

        localStorage.setItem(
            "HC_PRO_HISTORY",
            JSON.stringify(
                state.history
            )
        );

    } catch (_) {}

}


/* =========================================================
   LOCAL STORAGE
========================================================= */

function saveLibraryMetadata() {

    try {

        const data =
            state.library.map(
                track => ({
                    id:
                        track.id,

                    title:
                        track.title,

                    artist:
                        track.artist,

                    genre:
                        track.genre,

                    bpm:
                        track.bpm,

                    key:
                        track.key,

                    energy:
                        track.energy,

                    duration:
                        track.duration,

                    analyzed:
                        track.analyzed
                })
            );


        localStorage.setItem(
            "HC_PRO_LIBRARY_METADATA",
            JSON.stringify(
                data
            )
        );

    } catch (_) {}

}
  /* =========================================================
   CLEAR LIBRARY
========================================================= */

function clearLibrary() {

    if (
        !state.library.length
    ) {

        return;

    }


    const confirmClear =
        window.confirm(
            "¿Limpiar toda la biblioteca?"
        );


    if (!confirmClear) {
        return;
    }


    state.library =
        [];


    state.smartQueue =
        [];


    state.smartResults =
        [];


    renderLibrary();

    renderQueue();


    $("smartResults").innerHTML =
        '<div class="empty-smart">' +
        'Importa música para comenzar.' +
        '</div>';


    try {

        localStorage.removeItem(
            "HC_PRO_LIBRARY_METADATA"
        );

    } catch (_) {}


    setStatus(
        "Biblioteca limpiada.",
        false
    );

}


/* =========================================================
   KEYBOARD
========================================================= */

function setupKeyboard() {

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.target.tagName ===
                "INPUT" ||
                event.target.tagName ===
                "SELECT" ||
                event.target.tagName ===
                "BUTTON"
            ) {

                return;

            }


            if (
                event.code ===
                "Space"
            ) {

                event.preventDefault();


                const deck =
                    getActiveDeck();


                if (!deck) {
                    return;
                }


                if (
                    deck.media.paused
                ) {

                    deck.play();

                } else {

                    deck.pause();

                }

            }


            if (
                event.key === "1"
            ) {

                setActiveDeck("A");

            }


            if (
                event.key === "2"
            ) {

                setActiveDeck("B");

            }


            if (
                event.key.toLowerCase() ===
                "q"
            ) {

                setCrossfader(0);

            }


            if (
                event.key.toLowerCase() ===
                "w"
            ) {

                setCrossfader(.5);

            }


            if (
                event.key.toLowerCase() ===
                "e"
            ) {

                setCrossfader(1);

            }

        }
    );

} 
 /* =========================================================
   EVENT BINDINGS
========================================================= */

function bindEvents() {

    $("startAudioBtn")
        .addEventListener(
            "click",
            startSystem
        );


    setupDeckControls("A");

    setupDeckControls("B");


    $("fileA")
        .addEventListener(
            "change",
            event =>
                loadDeckInput(
                    "A",
                    event.target.files[0]
                )
        );


    $("fileB")
        .addEventListener(
            "change",
            event =>
                loadDeckInput(
                    "B",
                    event.target.files[0]
                )
        );


    $("masterVolume")
        .addEventListener(
            "input",
            event => {

                const value =
                    Number(
                        event.target.value
                    );


                if (
                    audioEngine.masterGain
                ) {

                    audioEngine.masterGain
                        .gain.value =
                        value;

                }


                $("masterValue")
                    .textContent =
                    Math.round(
                        value * 100
                    ) +
                    "%";

            }
        );


    $("crossfader")
        .addEventListener(
            "input",
            updateCrossfader
        );


    $("transitionMode")
        .addEventListener(
            "change",
            event => {

                state.transitionMode =
                    event.target.value;

            }
        );


    $("autoDJBtn")
        .addEventListener(
            "click",
            toggleAutoDJ
        );


    $("prepareNextBtn")
        .addEventListener(
            "click",
            prepareNextTrack
        );


    $("micBtn")
        .addEventListener(
            "click",
            toggleMic
        );


    $("recordStart")
        .addEventListener(
            "click",
            startRecording
        );


    $("recordStop")
        .addEventListener(
            "click",
            stopRecording
        );


    $("libraryInput")
        .addEventListener(
            "change",
            event => {

                addFilesToLibrary(
                    event.target.files
                );

                event.target.value =
                    "";

            }
        );


    $("folderInput")
        .addEventListener(
            "change",
            event => {

                addFilesToLibrary(
                    event.target.files
                );

                event.target.value =
                    "";

            }
        );


    $("analyzeLibrary")
        .addEventListener(
            "click",
            analyzeAllLibrary
        );


    $("smartAnalyzeBtn")
        .addEventListener(
            "click",
            async () => {

                const track =
                    getActiveDeck()?.track;


                if (!track) {

                    setStatus(
                        "No hay canción actual.",
                        true
                    );

                    return;

                }


                await analyzeTrack(
                    track
                );

            }
        );


    $("findNextBtn")
        .addEventListener(
            "click",
            findBestNext
        );


    $("smartPlaylistBtn")
        .addEventListener(
            "click",
            createSmartPlaylist
        );


    $("clearLibrary")
        .addEventListener(
            "click",
            clearLibrary
        );


    $("libraryBody")
        .addEventListener(
            "click",
            async event => {

                const button =
                    event.target.closest(
                        "button"
                    );


                if (!button) {
                    return;
                }


                await handleLibraryAction(
                    button.dataset.action,
                    button.dataset.id
                );

            }
        );


    $("smartResults")
        .addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        "[data-smart-id]"
                    );


                if (!button) {
                    return;
                }


                loadSmartToB(
                    button.dataset.smartId
                );

            }
        );


    $("videoPlayer")
        .addEventListener(
            "click",
            () => {

                const deck =
                    getActiveDeck();


                if (!deck) {
                    return;
                }


                if (
                    deck.media.paused
                ) {

                    deck.play();

                } else {

                    deck.pause();

                }

            }
        );


    setupKeyboard();

}
   /* =========================================================
   ANALYZE ALL
========================================================= */

async function analyzeAllLibrary() {

    if (
        !state.library.length
    ) {

        setStatus(
            "La biblioteca está vacía.",
            true
        );

        return;

    }


    await ensureAudioStarted();


    for (
        let i = 0;
        i < state.library.length;
        i++
    ) {

        const track =
            state.library[i];


        setStatus(
            "Analizando " +
            (i + 1) +
            "/" +
            state.library.length +
            ": " +
            track.title,
            false
        );


        await analyzeTrack(
            track
        );


        /*
          Small delay prevents UI freeze.
        */

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    20
                )
        );

    }


    setStatus(
        "Análisis de biblioteca terminado.",
        false
    );

}


/* =========================================================
   RESTORE HISTORY
========================================================= */

function restoreHistory() {

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(
                    "HC_PRO_HISTORY"
                ) ||
                "[]"
            );


        if (
            Array.isArray(saved)
        ) {

            state.history =
                saved;

        }

    } catch (_) {}

}


/* =========================================================
   INITIALIZATION
========================================================= */

function initializeApp() {

    try {

        restoreHistory();

        bindEvents();

        renderLibrary();

        renderQueue();

        updateCrossfader();

        setStatus(
            "SISTEMA LISTO",
            false
        );


        console.log(
            "HC PRO DJ HUMBERTO 3.0 READY"
        );


    } catch (error) {

        console.error(
            "HC PRO initialization error:",
            error
        );


        const status =
            $("systemStatus");


        if (status) {

            status.textContent =
                "ERROR JS";

            status.style.color =
                "var(--red)";

        }

    }

}

 /* =========================================================
   PUBLIC API
========================================================= */

window.HCPRO = {

    version:
        "3.0",

    state,

    audioEngine,

    start:
        startSystem,

    prepareNext:
        prepareNextTrack,

    smartNext:
        findBestNext,

    autoDJ:
        toggleAutoDJ

};


/* =========================================================
   START
========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeApp
    );

} else {

    initializeApp();

}


})();
