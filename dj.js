/* =========================================================
   HC PRO DJ HUMBERTO
   SMART DJ ENGINE
   AUTO DJ + SMART NEXT + CROSSFADER
========================================================= */

"use strict";


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

const clamp = (value, min, max) =>
    Math.min(Math.max(value, min), max);

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));


/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {

    defaultMaster: 0.85,

    crossCurve: 0.70710678,

    autoLookAhead: 18,

    phraseSeconds: 8,

    bpmTolerance: 0.10,

    recentLimit: 8,

    analysisDuration: 90,

    defaultBpm: 120

};


/* =========================================================
   STATE
========================================================= */

const state = {

    ctx: null,

    started: false,

    masterGain: null,

    musicBus: null,

    compressor: null,

    analyser: null,

    recordDestination: null,

    recorder: null,

    recordChunks: [],

    recording: false,

    activeDeck: "A",

    transition: false,

    transitionToken: 0,

    crossPosition: 0.5,

    autoDJ: false,

    smartDJ: true,

    library: [],

    history: [],

    voiceFiles: [],

    voiceEnabled: false,

    voiceTimer: null,

    voiceBusy: false,

    animation: null,

    decks: {

        A: null,

        B: null

    }

};


/* =========================================================
   DECK CREATION
========================================================= */

function createDeck(letter) {

    const audio =
        $(`audio${letter}`);

    const source =
        state.ctx.createMediaElementSource(audio);

    const inputGain =
        state.ctx.createGain();

    const low =
        state.ctx.createBiquadFilter();

    const mid =
        state.ctx.createBiquadFilter();

    const high =
        state.ctx.createBiquadFilter();

    const volumeGain =
        state.ctx.createGain();

    const crossGain =
        state.ctx.createGain();


    low.type = "lowshelf";
    low.frequency.value = 180;

    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 0.8;

    high.type = "highshelf";
    high.frequency.value = 5000;


    inputGain.gain.value = 1;

    volumeGain.gain.value = 1;

    crossGain.gain.value =
        CONFIG.crossCurve;


    source
        .connect(inputGain)
        .connect(low)
        .connect(mid)
        .connect(high)
        .connect(volumeGain)
        .connect(crossGain)
        .connect(state.musicBus);


    const deck = {

        letter,

        audio,

        source,

        inputGain,

        low,

        mid,

        high,

        volumeGain,

        crossGain,

        file: null,

        url: null,

        meta: null,

        ready: false,

        isVideo: false

    };


    audio.addEventListener(
        "ended",
        () => handleDeckEnded(letter)
    );


    audio.addEventListener(
        "play",
        () => {

            $(`deckPanel${letter}`)
                .classList.add("playing");

            $(`status${letter}`)
                .textContent = "PLAYING";

        }
    );


    audio.addEventListener(
        "pause",
        () => {

            $(`deckPanel${letter}`)
                .classList.remove("playing");

            if (!audio.ended) {

                $(`status${letter}`)
                    .textContent = "PAUSED";
            }
        }
    );


    state.decks[letter] = deck;

    return deck;
}


/* =========================================================
   AUDIO ENGINE
========================================================= */

async function startEngine() {

    if (state.started) {

        if (state.ctx.state === "suspended") {

            await state.ctx.resume();
        }

        return;
    }


    const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

    if (!AudioContext) {

        alert(
            "Este navegador no soporta Web Audio."
        );

        return;
    }


    state.ctx =
        new AudioContext();


    state.musicBus =
        state.ctx.createGain();

    state.compressor =
        state.ctx.createDynamicsCompressor();

    state.masterGain =
        state.ctx.createGain();

    state.analyser =
        state.ctx.createAnalyser();


    state.musicBus.gain.value = 1;

    state.masterGain.gain.value =
        CONFIG.defaultMaster;


    state.compressor.threshold.value = -18;
    state.compressor.knee.value = 12;
    state.compressor.ratio.value = 4;
    state.compressor.attack.value = .003;
    state.compressor.release.value = .2;


    state.analyser.fftSize = 2048;


    state.musicBus
        .connect(state.compressor)
        .connect(state.masterGain)
        .connect(state.analyser)
        .connect(state.ctx.destination);


    state.recordDestination =
        state.ctx.createMediaStreamDestination();


    state.masterGain
        .connect(state.recordDestination);


    createDeck("A");
    createDeck("B");


    setupVoiceAudio();


    await state.ctx.resume();


    state.started = true;


    $("systemStatus")
        .textContent = "SISTEMA ACTIVO";

    $("systemLed")
        .classList.add("active");


    $("bootScreen").style.display = "none";


    startVisualizer();

    startClock();

    startMeters();

    startAutoDJLoop();

    startVoiceTimer();
}


/* =========================================================
   VOICE AUDIO
========================================================= */

function setupVoiceAudio() {

    const audio =
        $("voiceAudio");

    const source =
        state.ctx.createMediaElementSource(audio);

    const gain =
        state.ctx.createGain();

    gain.gain.value = .9;

    source
        .connect(gain)
        .connect(state.masterGain);
}


/* =========================================================
   FILE HELPERS
========================================================= */

function isMediaFile(file) {

    if (!file) return false;

    if (
        file.type &&
        (
            file.type.startsWith("audio/") ||
            file.type.startsWith("video/")
        )
    ) {
        return true;
    }

    return /\.(mp3|wav|ogg|m4a|aac|flac|mp4|webm|mov)$/i
        .test(file.name);
}


function isVideoFile(file) {

    if (!file) return false;

    if (
        file.type &&
        file.type.startsWith("video/")
    ) {
        return true;
    }

    return /\.(mp4|webm|mov|mkv)$/i
        .test(file.name);
}


function fileId(file) {

    return [
        file.name,
        file.size,
        file.lastModified,
        file.webkitRelativePath || ""
    ].join("|");
}


/* =========================================================
   GENRE
========================================================= */

function detectGenre(file) {

    const text =
        (
            file.name +
            " " +
            (file.webkitRelativePath || "")
        )
        .toLowerCase();


    const rules = {

        cumbia: [
            "cumbia",
            "cuarteto",
            "santafesina",
            "villera"
        ],

        reggaeton: [
            "reggaeton",
            "reggaetón",
            "perreo",
            "urbano"
        ],

        rock: [
            "rock",
            "punk",
            "metal",
            "indie"
        ],

        pop: [
            "pop",
            "dance pop"
        ],

        electronic: [
            "electro",
            "electronic",
            "house",
            "techno",
            "trance",
            "edm",
            "deep house"
        ],

        latin: [
            "latin",
            "latino",
            "salsa",
            "bachata",
            "merengue"
        ]

    };


    for (const genre in rules) {

        if (
            rules[genre]
                .some(word => text.includes(word))
        ) {
            return genre;
        }
    }


    return "other";
}


/* =========================================================
   AUDIO ANALYSIS
========================================================= */

async function analyzeFile(file) {

    if (!state.ctx) {
        await startEngine();
    }


    const buffer =
        await file.arrayBuffer();


    let decoded;

    try {

        decoded =
            await state.ctx.decodeAudioData(
                buffer.slice(0)
            );

    } catch (error) {

        console.warn(
            "No se pudo analizar:",
            file.name
        );

        return {

            id: fileId(file),

            file,

            name: file.name,

            bpm: CONFIG.defaultBpm,

            energy: .5,

            rhythm: .5,

            genre: detectGenre(file),

            key: "C",

            camelot: "8B",

            phrase: 8,

            confidence: 0

        };
    }


    const duration =
        Math.min(
            decoded.duration,
            CONFIG.analysisDuration
        );


    const channelCount =
        decoded.numberOfChannels;


    const sampleRate =
        decoded.sampleRate;


    const length =
        Math.floor(
            duration * sampleRate
        );


    const mono =
        new Float32Array(length);


    for (
        let ch = 0;
        ch < channelCount;
        ch++
    ) {

        const data =
            decoded.getChannelData(ch);

        for (
            let i = 0;
            i < length;
            i++
        ) {

            mono[i] +=
                data[i] / channelCount;
        }
    }


    const downRate = 11025;

    const step =
        Math.max(
            1,
            Math.floor(
                sampleRate / downRate
            )
        );


    const smallLength =
        Math.floor(length / step);


    const small =
        new Float32Array(smallLength);


    for (
        let i = 0;
        i < smallLength;
        i++
    ) {

        small[i] =
            mono[i * step];
    }


    const frameSize = 1024;

    const hop = 512;

    const frames =
        Math.max(
            1,
            Math.floor(
                (small.length - frameSize) / hop
            )
        );


    const envelope =
        new Float32Array(frames);

    const rms =
        new Float32Array(frames);


    let totalEnergy = 0;


    for (
        let f = 0;
        f < frames;
        f++
    ) {

        const start =
            f * hop;


        let sum = 0;

        let diff = 0;


        for (
            let j = 0;
            j < frameSize;
            j++
        ) {

            const index =
                start + j;

            const value =
                small[index] || 0;

            sum += value * value;

            if (index > 0) {

                diff +=
                    Math.abs(
                        value -
                        small[index - 1]
                    );
            }
        }


        const r =
            Math.sqrt(
                sum / frameSize
            );


        rms[f] = r;

        envelope[f] =
            diff / frameSize;

        totalEnergy += r;
    }


    const averageRms =
        totalEnergy / frames;


    let maxRms = 0;

    for (const value of rms) {

        if (value > maxRms) {
            maxRms = value;
        }
    }


    const energy =
        clamp(
            maxRms
                ? averageRms / maxRms
                : .5,
            0,
            1
        );


    /* -----------------------------------------
       BPM
    ----------------------------------------- */

    let envMax = 0;

    for (const value of envelope) {

        if (value > envMax) {
            envMax = value;
        }
    }


    if (envMax > 0) {

        for (
            let i = 0;
            i < envelope.length;
            i++
        ) {

            envelope[i] /= envMax;
        }
    }


    const envelopeRate =
        downRate / hop;


    let bestBpm =
        CONFIG.defaultBpm;

    let bestScore = -Infinity;

    let secondScore = -Infinity;


    for (
        let bpm = 70;
        bpm <= 180;
        bpm += .5
    ) {

        const lag =
            Math.round(
                envelopeRate * 60 / bpm
            );


        if (
            lag < 2 ||
            lag >= envelope.length
        ) {
            continue;
        }


        let score = 0;

        let count = 0;


        for (
            let i = lag;
            i < envelope.length;
            i++
        ) {

            score +=
                envelope[i] *
                envelope[i - lag];

            count++;
        }


        if (count > 0) {

            score /= count;
        }


        if (score > bestScore) {

            secondScore =
                bestScore;

            bestScore =
                score;

            bestBpm =
                bpm;

        } else if (
            score > secondScore
        ) {

            secondScore =
                score;
        }
    }


    /*
       Corrección de BPM armónico.
       Evita detectar 70 cuando la canción
       realmente está alrededor de 140.
    */

    if (bestBpm < 90) {

        bestBpm *= 2;
    }

    if (bestBpm > 180) {

        bestBpm /= 2;
    }


    const confidence =
        bestScore > 0
            ? clamp(
                bestScore /
                Math.max(
                    bestScore +
                    Math.abs(secondScore),
                    .001
                ),
                0,
                1
            )
            : 0;


    const rhythm =
        clamp(
            bestScore * 5,
            0,
            1
        );


    /*
       Key aproximada.

       El análisis de key exacto de estudio
       requiere FFT/chroma más avanzada.
       Aquí se utiliza una estimación tonal
       para ayudar al Smart DJ.
    */

    const keyInfo =
        estimateKey(
            small,
            downRate
        );


    const genre =
        detectGenre(file);


    return {

        id: fileId(file),

        file,

        name: file.name,

        bpm: Math.round(bestBpm * 10) / 10,

        energy: Math.round(energy * 100) / 100,

        rhythm: Math.round(rhythm * 100) / 100,

        genre,

        key: keyInfo.key,

        camelot: keyInfo.camelot,

        phrase: detectPhraseLength(
            bestBpm
        ),

        confidence:

            Math.round(
                confidence * 100
            ) / 100,

        duration: decoded.duration

    };
}


/* =========================================================
   KEY / CAMELOT
========================================================= */

function estimateKey(data, sampleRate) {

    /*
       Estimación tonal simplificada.

       Se usa una matriz de perfiles de
       pitch-class para obtener una tonalidad
       aproximada.
    */

    const chroma =
        new Array(12).fill(0);


    const fftSize = 2048;

    const hop = 1024;

    const frames =
        Math.min(
            80,
            Math.floor(
                (data.length - fftSize) / hop
            )
        );


    if (frames <= 0) {

        return {
            key: "C",
            camelot: "8B"
        };
    }


    /*
       Detectamos energía en bandas
       aproximadas de las 12 clases.
    */

    for (
        let f = 0;
        f < frames;
        f++
    ) {

        const start =
            f * hop;


        for (
            let k = 1;
            k < fftSize / 2;
            k += 3
        ) {

            const frequency =
                k * sampleRate /
                fftSize;


            if (
                frequency < 55 ||
                frequency > 1760
            ) {
                continue;
            }


            const midi =
                Math.round(
                    69 +
                    12 *
                    Math.log2(
                        frequency / 440
                    )
                );


            const pitch =
                ((midi % 12) + 12) % 12;


            let energy = 0;


            for (
                let j = 0;
                j < 16;
                j++
            ) {

                const index =
                    start +
                    Math.floor(
                        j *
                        fftSize /
                        16
                    );

                const value =
                    data[index] || 0;

                energy +=
                    Math.abs(value);
            }


            chroma[pitch] +=
                energy;
        }
    }


    let root = 0;

    let max = -Infinity;


    for (
        let i = 0;
        i < 12;
        i++
    ) {

        if (chroma[i] > max) {

            max = chroma[i];

            root = i;
        }
    }


    const keys = [
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


    const key =
        keys[root];


    /*
       Camelot mayor aproximado.
    */

    const camelotMap = {

        C: "8B",
        "C#": "3B",
        D: "10B",
        "D#": "5B",
        E: "12B",
        F: "7B",
        "F#": "2B",
        G: "9B",
        "G#": "4B",
        A: "11B",
        "A#": "6B",
        B: "1B"

    };


    return {

        key,

        camelot:
            camelotMap[key] || "8B"

    };
}


/* =========================================================
   PHRASE
========================================================= */

function detectPhraseLength(bpm) {

    /*
       Un phrase DJ habitual puede ser
       8 / 16 / 32 compases.

       Para Smart DJ se trabaja inicialmente
       con bloques de 16 compases.
    */

    const beatSeconds =
        60 / Math.max(bpm, 1);

    const phraseSeconds =
        beatSeconds * 16;


    return Math.round(
        phraseSeconds
    );
}


/* =========================================================
   LIBRARY
========================================================= */

function addLibraryFiles(files) {

    const valid =
        Array.from(files)
            .filter(isMediaFile);


    for (const file of valid) {

        const id =
            fileId(file);


        if (
            state.library
                .some(track => track.id === id)
        ) {
            continue;
        }


        state.library.push({

            id,

            file,

            name: file.name,

            genre: detectGenre(file),

            analyzed: false,

            bpm: null,

            energy: null,

            rhythm: null,

            key: null,

            camelot: null,

            phrase: null,

            confidence: 0

        });
    }


    renderLibrary();
}


/* =========================================================
   ANALYZE LIBRARY
========================================================= */

async function analyzeLibrary() {

    if (!state.library.length) {

        alert(
            "Primero cargá archivos o una carpeta."
        );

        return;
    }


    const button =
        $("analyzeLibrary");


    button.disabled = true;

    button.textContent =
        "ANALIZANDO...";


    for (
        let i = 0;
        i < state.library.length;
        i++
    ) {

        const track =
            state.library[i];


        if (track.analyzed) {
            continue;
        }


        $("smartReason").textContent =
            `Analizando ${i + 1}/${state.library.length}: ${track.name}`;


        try {

            const result =
                await analyzeFile(
                    track.file
                );


            Object.assign(
                track,
                result,
                {
                    analyzed: true
                }
            );

        } catch (error) {

            console.error(error);
        }


        renderLibrary();

        await sleep(20);
    }


    button.disabled = false;

    button.textContent =
        "ANALIZAR BIBLIOTECA";


    $("smartReason").textContent =
        "Biblioteca analizada. Smart DJ listo.";
}


/* =========================================================
   RENDER LIBRARY
========================================================= */

function renderLibrary() {

    const container =
        $("libraryList");


    const filter =
        $("genreFilter").value;


    const tracks =
        state.library.filter(track => {

            if (filter === "all") {
                return true;
            }

            return track.genre === filter;
        });


    $("libraryCount").textContent =
        state.library.length;


    if (!tracks.length) {

        container.innerHTML =
            `<div class="empty-library">
                NO HAY TEMAS PARA ESTE FILTRO
             </div>`;

        return;
    }


    container.innerHTML = "";


    tracks.forEach(
        (track, index) => {

            const item =
                document.createElement("div");


            item.className =
                "library-item";


            const bpm =
                track.bpm
                    ? `${track.bpm} BPM`
                    : "BPM --";


            const key =
                track.camelot
                    ? `${track.camelot}`
                    : "--";


            item.innerHTML = `

                <div class="library-index">
                    ${index + 1}
                </div>

                <div class="library-name">

                    ${escapeHtml(track.name)}

                    <small>
                        ${track.genre.toUpperCase()}
                        ·
                        ${key}
                    </small>

                </div>

                <div class="library-stat">
                    ${bpm}
                </div>

                <button class="library-load">
                    CARGAR
                </button>
            `;


            item
                .querySelector(".library-load")
                .addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();

                        loadTrackSmart(
                            track,
                            state.activeDeck
                        );
                    }
                );


            item.addEventListener(
                "dblclick",
                () => {

                    loadTrackSmart(
                        track,
                        state.activeDeck
                    );
                }
            );


            container.appendChild(item);
        }
    );
}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   SMART DJ SCORE
========================================================= */

function bpmDistance(a, b) {

    if (!a || !b) {
        return 1;
    }


    const candidates = [

        b,

        b * 2,

        b / 2

    ];


    let best = Infinity;


    for (const value of candidates) {

        const distance =
            Math.abs(a - value) /
            Math.max(a, value);


        best =
            Math.min(
                best,
                distance
            );
    }


    return clamp(
        best,
        0,
        1
    );
}


function genreCompatibility(a, b) {

    if (a === b) {
        return 1;
    }


    const related = {

        cumbia: [
            "latin"
        ],

        latin: [
            "cumbia",
            "reggaeton"
        ],

        reggaeton: [
            "latin"
        ],

        pop: [
            "electronic"
        ],

        electronic: [
            "pop"
        ],

        rock: []

    };


    if (
        related[a] &&
        related[a].includes(b)
    ) {
        return .65;
    }


    return .25;
}


function smartScore(current, candidate) {

    if (
        !current ||
        !candidate ||
        !candidate.analyzed
    ) {
        return 0;
    }


    const bpmScore =
        1 -
        bpmDistance(
            current.bpm,
            candidate.bpm
        );


    const energyScore =
        1 -
        Math.abs(
            current.energy -
            candidate.energy
        );


    const rhythmScore =
        1 -
        Math.abs(
            current.rhythm -
            candidate.rhythm
        );


    const genreScore =
        genreCompatibility(
            current.genre,
            candidate.genre
        );


    const camelotScore =
        camelotCompatibility(
            current.camelot,
            candidate.camelot
        );


    let score =

        bpmScore * .34 +

        camelotScore * .20 +

        energyScore * .18 +

        rhythmScore * .16 +

        genreScore * .12;


    /*
       Evitar repetir canciones recientes.
    */

    const historyIndex =
        state.history.indexOf(
            candidate.id
        );


    if (historyIndex >= 0) {

        score -=
            .30 /
            (historyIndex + 1);
    }


    /*
       Evitar el mismo tema.
    */

    if (
        state.decks.A &&
        state.decks.A.file === candidate.file
    ) {
        score = -1;
    }

    if (
        state.decks.B &&
        state.decks.B.file === candidate.file
    ) {
        score = -1;
    }


    /*
       Pequeña variación para evitar
       que siempre elija exactamente
       el mismo tema.
    */

    score +=
        Math.random() * .025;


    return score;
}


/* =========================================================
   CAMELOT
========================================================= */

function camelotCompatibility(a, b) {

    if (!a || !b) {
        return .5;
    }


    if (a === b) {
        return 1;
    }


    const matchA =
        a.match(/^(\d+)([AB])$/);

    const matchB =
        b.match(/^(\d+)([AB])$/);


    if (!matchA || !matchB) {
        return .5;
    }


    const numA =
        Number(matchA[1]);

    const numB =
        Number(matchB[1]);


    const letterA =
        matchA[2];

    const letterB =
        matchB[2];


    if (
        numA === numB &&
        letterA !== letterB
    ) {
        return .9;
    }


    if (
        letterA === letterB &&
        (
            numB === numA + 1 ||
            numB === numA - 1 ||
            (numA === 1 && numB === 12) ||
            (numA === 12 && numB === 1)
        )
    ) {
        return .92;
    }


    return .25;
}


/* =========================================================
   FIND SMART NEXT
========================================================= */

function findSmartNext() {

    const active =
        state.decks[state.activeDeck];


    if (!active || !active.meta) {

        /*
           Si todavía no hay canción activa,
           devuelve el primer tema analizado.
        */

        return state.library.find(
            track => track.analyzed
        ) || null;
    }


    const candidates =
        state.library.filter(
            track =>
                track.analyzed &&
                track.file !== active.file
        );


    if (!candidates.length) {
        return null;
    }


    const ranked =
        candidates
            .map(track => ({

                track,

                score:
                    smartScore(
                        active.meta,
                        track
                    )

            }))
            .sort(
                (a, b) =>
                    b.score - a.score
            );


    return ranked[0] || null;
}


/* =========================================================
   SMART NEXT
   CARGA AUTOMÁTICAMENTE EL PLATO CONTRARIO
========================================================= */

async function smartNext() {

    const active =
        state.activeDeck;


    const target =
        active === "A"
            ? "B"
            : "A";


    const current =
        state.decks[active];


    if (
        state.decks[target].ready &&
        !state.decks[target].audio.ended
    ) {

        $("smartReason").textContent =
            `SMART NEXT: ${state.decks[target].meta?.name || "tema preparado"} ya está cargado en ${target}.`;

        return;
    }


    const result =
        findSmartNext();


    if (!result) {

        $("smartReason").textContent =
            "SMART NEXT: no hay un tema analizado compatible.";

        return;
    }


    await loadTrackSmart(
        result.track,
        target
    );


    const currentMeta =
        current.meta;


    $("smartReason").textContent =

        `SMART NEXT → DECK ${target}: ` +
        `${result.track.name} · ` +
        `${result.track.bpm} BPM · ` +
        `${result.track.camelot}. ` +
        `Selección compatible con ` +
        `${currentMeta?.bpm || "--"} BPM / ` +
        `${currentMeta?.camelot || "--"}.`;
}


/* =========================================================
   LOAD TRACK
========================================================= */

async function loadTrackSmart(track, letter) {

    if (!track || !track.file) {
        return;
    }


    const deck =
        state.decks[letter];


    if (!deck) {
        return;
    }


    if (deck.url) {

        try {
            URL.revokeObjectURL(
                deck.url
            );
        } catch (_) {}
    }


    deck.audio.pause();

    deck.audio.currentTime = 0;


    deck.url =
        URL.createObjectURL(
            track.file
        );


    deck.file =
        track.file;


    deck.meta =
        track;


    deck.ready = true;

    deck.isVideo =
        isVideoFile(track.file);


    deck.audio.src =
        deck.url;


    deck.audio.load();


    updateDeckUI(letter);


    if (
        letter === state.activeDeck
    ) {

        updateVisualDeck(
            letter
        );
    }
}


/* =========================================================
   MANUAL FILE LOAD
========================================================= */

async function loadManualFile(
    letter,
    file
) {

    if (!isMediaFile(file)) {
        return;
    }


    let track =
        state.library.find(
            item =>
                item.id === fileId(file)
        );


    if (!track) {

        track = {

            id: fileId(file),

            file,

            name: file.name,

            genre: detectGenre(file),

            analyzed: false

        };


        state.library.push(track);
    }


    if (!track.analyzed) {

        $("smartReason").textContent =
            `Analizando ${file.name}...`;

        const result =
            await analyzeFile(file);


        Object.assign(
            track,
            result,
            {
                analyzed: true
            }
        );
    }


    await loadTrackSmart(
        track,
        letter
    );


    renderLibrary();
}


/* =========================================================
   DECK UI
========================================================= */

function updateDeckUI(letter) {

    const deck =
        state.decks[letter];


    const meta =
        deck.meta;


    if (!meta) {
        return;
    }


    $(`track${letter}`)
        .textContent =
        meta.name;


    $(`bpm${letter}`)
        .textContent =
        `BPM ${meta.bpm || "--"}`;


    $(`key${letter}`)
        .textContent =
        `KEY ${meta.key || "--"}`;


    $(`camelot${letter}`)
        .textContent =
        meta.camelot || "--";


    $(`energy${letter}`)
        .textContent =
        `ENERGY ${
            meta.energy != null
                ? Math.round(
                    meta.energy * 100
                ) + "%"
                : "--"
        }`;


    $(`status${letter}`)
        .textContent =
        "LOADED";
}


/* =========================================================
   PLAY DECK
========================================================= */

async function playDeck(letter) {

    await startEngine();


    const deck =
        state.decks[letter];


    if (!deck.ready) {

        alert(
            `No hay canción cargada en Deck ${letter}.`
        );

        return;
    }


    /*
       Cuando el usuario inicia manualmente
       un deck, ese deck pasa a ser activo.
    */

    if (
        state.activeDeck !== letter &&
        !state.transition
    ) {

        state.activeDeck =
            letter;

        setCrossPosition(
            letter === "A"
                ? 0
                : 1
        );

        updateVisualDeck(letter);
    }


    try {

        await deck.audio.play();

    } catch (error) {

        console.error(error);

        $("smartReason").textContent =
            "El navegador bloqueó la reproducción. Presioná PLAY nuevamente.";
    }


    addHistory(deck);
}


/* =========================================================
   HISTORY
========================================================= */

function addHistory(deck) {

    if (!deck || !deck.file) {
        return;
    }


    const id =
        fileId(deck.file);


    state.history =
        state.history.filter(
            value => value !== id
        );


    state.history.unshift(id);


    state.history =
        state.history.slice(
            0,
            CONFIG.recentLimit
        );
}


/* =========================================================
   STOP
========================================================= */

function stopDeck(letter) {

    const deck =
        state.decks[letter];


    if (!deck) {
        return;
    }


    deck.audio.pause();

    deck.audio.currentTime = 0;


    $(`status${letter}`)
        .textContent =
        deck.ready
            ? "LOADED"
            : "READY";


    $(`deckPanel${letter}`)
        .classList.remove("playing");
}


function stopAll() {

    state.transitionToken++;

    state.transition = false;

    stopDeck("A");
    stopDeck("B");


    state.activeDeck = "A";

    setCrossPosition(.5);

    $("autoState")
        .textContent =
        "ESPERA";

    updateVisualDeck("A");
}


/* =========================================================
   CROSSFADER
========================================================= */

function setCrossPosition(
    value,
    immediate = false
) {

    value =
        clamp(
            Number(value),
            0,
            1
        );


    state.crossPosition =
        value;


    const aGain =
        Math.cos(
            value *
            Math.PI /
            2
        );


    const bGain =
        Math.sin(
            value *
            Math.PI /
            2
        );


    setDeckCrossGain(
        "A",
        aGain,
        immediate
    );


    setDeckCrossGain(
        "B",
        bGain,
        immediate
    );


    $("crossfader").value =
        value;


    let label = "CENTER";


    if (value <= .05) {
        label = "A";
    } else if (value >= .95) {
        label = "B";
    } else if (value < .45) {
        label = "A → B";
    } else if (value > .55) {
        label = "A → B";
    }


    $("crossPosition")
        .textContent =
        label;
}


function setDeckCrossGain(
    letter,
    value,
    immediate = false
) {

    const deck =
        state.decks[letter];


    if (!deck || !state.ctx) {
        return;
    }


    const param =
        deck.crossGain.gain;


    const now =
        state.ctx.currentTime;


    param.cancelScheduledValues(now);


    if (immediate) {

        param.setValueAtTime(
            value,
            now
        );

    } else {

        param.setTargetAtTime(
            value,
            now,
            .015
        );
    }
}


/* =========================================================
   AUTO DJ TRANSITION
========================================================= */

async function transitionTo(
    targetLetter
) {

    if (state.transition) {
        return;
    }


    const target =
        state.decks[targetLetter];


    const outgoingLetter =
        targetLetter === "A"
            ? "B"
            : "A";


    const outgoing =
        state.decks[outgoingLetter];


    if (!target || !target.ready) {

        await smartNext();

        return;
    }


    await startEngine();


    state.transition = true;

    const token =
        ++state.transitionToken;


    $("autoState")
        .textContent =
        `MEZCLANDO ${outgoingLetter} → ${targetLetter}`;


    /*
       El plato entrante SIEMPRE empieza
       antes de bajar el plato saliente.
    */

    try {

        if (target.audio.paused) {

            await target.audio.play();
        }

    } catch (error) {

        state.transition = false;

        console.error(error);

        return;
    }


    addHistory(target);


    /*
       Partimos desde el crossfader real.
       A = 0
       B = 1
    */

    const start =
        state.crossPosition;


    const destination =
        targetLetter === "A"
            ? 0
            : 1;


    const duration =

        calculateAutoMixDuration(
            outgoing,
            target
        );


    const startTime =
        performance.now();


    await new Promise(resolve => {

        function animate(now) {

            if (
                token !==
                state.transitionToken
            ) {

                resolve();

                return;
            }


            const elapsed =
                now - startTime;


            const raw =
                clamp(
                    elapsed /
                    duration,
                    0,
                    1
                );


            /*
               Smoothstep:
               entrada y salida suaves.
            */

            const progress =
                raw *
                raw *
                (3 - 2 * raw);


            const position =
                start +
                (
                    destination -
                    start
                ) *
                progress;


            setCrossPosition(
                position
            );


            if (raw < 1) {

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
    });


    if (
        token !==
        state.transitionToken
    ) {

        state.transition = false;

        return;
    }


    /*
       Ahora el target es el plato activo.
       IMPORTANTE:
       no se pausa ni se reinicia el target.
    */

    state.activeDeck =
        targetLetter;


    /*
       El plato que salió recién se detiene
       SOLO después de terminar el crossfade.
    */

    outgoing.audio.pause();

    outgoing.audio.currentTime = 0;


    state.transition = false;


    updateVisualDeck(
        targetLetter
    );


    $("autoState")
        .textContent =
        "SMART DJ ACTIVO";


    /*
       Inmediatamente prepara el siguiente
       tema en el plato que acaba de quedar libre.
    */

    if (state.autoDJ) {

        setTimeout(
            () => smartNext(),
            250
        );
    }
}


/* =========================================================
   AUTO MIX DURATION
   No es una configuración del usuario.
   El algoritmo la determina.
========================================================= */

function calculateAutoMixDuration(
    outgoing,
    incoming
) {

    const bpmA =
        outgoing.meta?.bpm || 120;

    const bpmB =
        incoming.meta?.bpm || 120;


    const average =
        (
            bpmA +
            bpmB
        ) / 2;


    /*
       Frase aproximada:
       8 beats / 16 beats según BPM.
    */

    const beat =
        60 /
        Math.max(
            average,
            1
        );


    let duration =
        beat * 8;


    duration =
        clamp(
            duration * 1000,
            3500,
            10000
        );


    return duration;
}


/* =========================================================
   AUTO DJ LOOP
========================================================= */

let autoDJInterval = null;


function startAutoDJLoop() {

    clearInterval(
        autoDJInterval
    );


    autoDJInterval =
        setInterval(
            autoDJTick,
            1000
        );
}


async function autoDJTick() {

    if (!state.autoDJ) {
        return;
    }


    if (state.transition) {
        return;
    }


    const active =
        state.decks[state.activeDeck];


    if (!active || !active.ready) {

        return;
    }


    /*
       Si el plato activo está detenido,
       iniciar reproducción.
    */

    if (
        active.audio.paused &&
        active.audio.currentTime === 0
    ) {

        try {

            await active.audio.play();

        } catch (_) {}

        return;
    }


    /*
       Smart Next:
       si no hay canción en el plato contrario,
       la carga automáticamente.
    */

    const nextLetter =
        state.activeDeck === "A"
            ? "B"
            : "A";


    const next =
        state.decks[nextLetter];


    if (
        !next.ready ||
        next.audio.ended
    ) {

        await smartNext();

        return;
    }


    /*
       No hacer crossfade si el tema activo
       todavía está lejos del final.

       Se toma como referencia la frase
       y el tiempo restante.
    */

    if (!Number.isFinite(
        active.audio.duration
    )) {

        return;
    }


    const remaining =
        active.audio.duration -
        active.audio.currentTime;


    const mixWindow =
        calculateAutoMixDuration(
            active,
            next
        ) / 1000;


    /*
       Ventana de entrada.
    */

    if (
        remaining <=
        mixWindow +
        1
    ) {

        await transitionTo(
            nextLetter
        );
    }
}


/* =========================================================
   DECK ENDED
========================================================= */

async function handleDeckEnded(
    letter
) {

    if (
        state.transition
    ) {
        return;
    }


    if (!state.autoDJ) {

        $(`status${letter}`)
            .textContent =
            "ENDED";

        return;
    }


    /*
       Si terminó el plato activo,
       usamos el plato contrario.
    */

    if (
        letter ===
        state.activeDeck
    ) {

        const nextLetter =
            letter === "A"
                ? "B"
                : "A";


        const next =
            state.decks[nextLetter];


        if (!next.ready) {

            await smartNext();
        }


        if (
            state.decks[nextLetter].ready
        ) {

            await transitionTo(
                nextLetter
            );
        }
    }
}


/* =========================================================
   VISUAL DECK
========================================================= */

function updateVisualDeck(
    letter
) {

    const deck =
        state.decks[letter];


    if (!deck) {
        return;
    }


    $("activeDeckLabel")
        .textContent =
        letter;


    if (!deck.file) {

        $("visualMessage")
            .textContent =
            "CARGÁ TU BIBLIOTECA MUSICAL";

        return;
    }


    $("visualMessage")
        .textContent = "";


    $("visualTrack")
        .textContent =
        deck.meta?.name ||
        deck.file.name;


    $("mediaType")
        .textContent =
        deck.isVideo
            ? "VIDEO PERFORMANCE"
            : "AUDIO PERFORMANCE";


    const screen =
        document.querySelector(
            ".visual-screen"
        );


    if (deck.isVideo) {

        screen.classList.add(
            "video-mode"
        );


        const video =
            $("videoScreen");


        video.src =
            deck.url;


        video.currentTime =
            deck.audio.currentTime;


        video.play()
            .catch(() => {});


    } else {

        screen.classList.remove(
            "video-mode"
        );


        $("videoScreen")
            .pause();

        $("videoScreen")
            .removeAttribute("src");
    }
}


/* =========================================================
   VIDEO SYNC
========================================================= */

function syncVideo() {

    const deck =
        state.decks[state.activeDeck];


    const video =
        $("videoScreen");


    if (
        deck &&
        deck.isVideo &&
        deck.audio &&
        video.src
    ) {

        const difference =
            Math.abs(
                video.currentTime -
                deck.audio.currentTime
            );


        if (difference > .25) {

            try {

                video.currentTime =
                    deck.audio.currentTime;

            } catch (_) {}
        }


        if (
            !deck.audio.paused &&
            video.paused
        ) {

            video.play()
                .catch(() => {});
        }
    }


    requestAnimationFrame(
        syncVideo
    );
}


/* =========================================================
   VISUALIZER
========================================================= */

function startVisualizer() {

    const canvas =
        $("visualizer");


    const ctx =
        canvas.getContext("2d");


    function resize() {

        canvas.width =
            canvas.clientWidth *
            devicePixelRatio;

        canvas.height =
            canvas.clientHeight *
            devicePixelRatio;

        ctx.scale(
            devicePixelRatio,
            devicePixelRatio
        );
    }


    resize();

    window.addEventListener(
        "resize",
        resize
    );


    const data =
        new Uint8Array(
            state.analyser.frequencyBinCount
        );


    function draw() {

        requestAnimationFrame(draw);


        const width =
            canvas.clientWidth;

        const height =
            canvas.clientHeight;


        state.analyser.getByteFrequencyData(
            data
        );


        ctx.clearRect(
            0,
            0,
            width,
            height
        );


        const bars = 100;

        const step =
            Math.floor(
                data.length /
                bars
            );


        const barWidth =
            width / bars;


        for (
            let i = 0;
            i < bars;
            i++
        ) {

            const value =
                data[i * step] / 255;


            const barHeight =
                value *
                height *
                .55;


            const x =
                i *
                barWidth;


            const y =
                height -
                barHeight;


            const gradient =
                ctx.createLinearGradient(
                    0,
                    height,
                    0,
                    y
                );


            gradient.addColorStop(
                0,
                "#00f6ff"
            );

            gradient.addColorStop(
                .5,
                "#a855f7"
            );

            gradient.addColorStop(
                1,
                "#ff2bd6"
            );


            ctx.fillStyle =
                gradient;


            ctx.fillRect(
                x + 1,
                y,
                Math.max(
                    barWidth - 2,
                    1
                ),
                barHeight
            );
        }
    }


    draw();

    syncVideo();
}


/* =========================================================
   METERS
========================================================= */

function startMeters() {

    const data =
        new Uint8Array(
            state.analyser.frequencyBinCount
        );


    function meterLoop() {

        requestAnimationFrame(
            meterLoop
        );


        state.analyser.getByteFrequencyData(
            data
        );


        let sum = 0;


        for (const value of data) {
            sum += value;
        }


        const level =
            data.length
                ? sum /
                  data.length /
                  255
                : 0;


        const active =
            state.activeDeck;


        const a =
            active === "A"
                ? level
                : level *
                  state.decks.B?.crossGain.gain.value ||
                  0;


        const b =
            active === "B"
                ? level
                : level *
                  state.decks.A?.crossGain.gain.value ||
                  0;


        $("meterA").style.width =
            `${clamp(a * 100, 0, 100)}%`;

        $("meterB").style.width =
            `${clamp(b * 100, 0, 100)}%`;

        $("meterAText").textContent =
            `${Math.round(
                clamp(a * 100, 0, 100)
            )}%`;

        $("meterBText").textContent =
            `${Math.round(
                clamp(b * 100, 0, 100)
            )}%`;
    }


    meterLoop();
}


/* =========================================================
   VOICE ID
========================================================= */

function loadVoiceFiles(files) {

    state.voiceFiles =
        Array.from(files)
            .filter(
                file =>
                    file.type.startsWith(
                        "audio/"
                    )
            );


    renderVoiceList();

    startVoiceTimer();
}


function renderVoiceList() {

    const container =
        $("voiceList");


    if (!state.voiceFiles.length) {

        container.textContent =
            "No hay Voice ID cargados.";

        return;
    }


    container.innerHTML =
        state.voiceFiles
            .map(
                file =>
                    `• ${escapeHtml(
                        file.name
                    )}`
            )
            .join("<br>");
}


function startVoiceTimer() {

    clearInterval(
        state.voiceTimer
    );


    if (!state.started) {
        return;
    }


    state.voiceTimer =
        setInterval(
            () => {

                if (
                    state.voiceEnabled
                ) {

                    playVoiceID();
                }

            },
            60 * 1000
        );
}


async function playVoiceID() {

    if (
        state.voiceBusy ||
        !state.voiceFiles.length
    ) {
        return;
    }


    await startEngine();


    const file =
        state.voiceFiles[
            Math.floor(
                Math.random() *
                state.voiceFiles.length
            )
        ];


    const audio =
        $("voiceAudio");


    state.voiceBusy = true;


    const url =
        URL.createObjectURL(
            file
        );


    audio.src = url;

    audio.volume = .9;


    /*
       Ducking profesional:
       baja solamente la música.
       El Voice ID permanece audible.
    */

    const now =
        state.ctx.currentTime;


    state.musicBus.gain.cancelScheduledValues(
        now
    );

    state.musicBus.gain.setTargetAtTime(
        .35,
        now,
        .04
    );


    $("voiceStatus")
        .textContent =
        "ON AIR";


    try {

        await audio.play();

    } catch (error) {

        console.error(error);

        restoreMusicAfterVoice();

        state.voiceBusy = false;

        URL.revokeObjectURL(url);
    }


    audio.onended =
        () => {

            restoreMusicAfterVoice();

            state.voiceBusy = false;

            URL.revokeObjectURL(url);

            $("voiceStatus")
                .textContent =
                state.voiceEnabled
                    ? "AUTO"
                    : "OFF";
        };
}


function restoreMusicAfterVoice() {

    if (!state.ctx) {
        return;
    }


    const now =
        state.ctx.currentTime;


    state.musicBus.gain.cancelScheduledValues(
        now
    );


    state.musicBus.gain.setTargetAtTime(
        1,
        now,
        .12
    );
}


/* =========================================================
   RECORD
========================================================= */

function toggleRecording() {

    if (!state.started) {
        return;
    }


    if (state.recording) {

        state.recorder.stop();

        return;
    }


    const stream =
        state.recordDestination.stream;


    let mime =
        "audio/webm;codecs=opus";


    if (
        !MediaRecorder.isTypeSupported(
            mime
        )
    ) {

        mime =
            "audio/webm";
    }


    state.recordChunks = [];


    state.recorder =
        new MediaRecorder(
            stream,
            {
                mimeType: mime
            }
        );


    state.recorder.ondataavailable =
        event => {

            if (
                event.data &&
                event.data.size
            ) {

                state.recordChunks.push(
                    event.data
                );
            }
        };


    state.recorder.onstop =
        () => {

            const blob =
                new Blob(
                    state.recordChunks,
                    {
                        type: mime
                    }
                );


            const url =
                URL.createObjectURL(
                    blob
                );


            const a =
                document.createElement("a");


            a.href = url;

            a.download =
                `HC-PRO-DJ-${Date.now()}.webm`;

            a.click();


            setTimeout(
                () =>
                    URL.revokeObjectURL(
                        url
                    ),
                2000
            );


            state.recording = false;


            $("recordButton")
                .classList.remove(
                    "recording"
                );

            $("recordButton")
                .textContent =
                "● REC";
        };


    state.recorder.start();

    state.recording = true;


    $("recordButton")
        .classList.add(
            "recording"
        );

    $("recordButton")
        .textContent =
        "■ GRABANDO";
}


/* =========================================================
   CLOCK
========================================================= */

function startClock() {

    function update() {

        const now =
            new Date();


        $("clock")
            .textContent =
            now.toLocaleTimeString(
                "es-AR",
                {
                    hour12: false
                }
            );
    }


    update();

    setInterval(
        update,
        1000
    );
}


/* =========================================================
   CONTROLS
========================================================= */

function setupControls() {

    $("startEngine")
        .addEventListener(
            "click",
            startEngine
        );


    $("loadA")
        .addEventListener(
            "click",
            () =>
                $("fileA").click()
        );


    $("loadB")
        .addEventListener(
            "click",
            () =>
                $("fileB").click()
        );


    $("fileA")
        .addEventListener(
            "change",
            event => {

                const file =
                    event.target.files[0];

                if (file) {

                    loadManualFile(
                        "A",
                        file
                    );
                }
            }
        );


    $("fileB")
        .addEventListener(
            "change",
            event => {

                const file =
                    event.target.files[0];

                if (file) {

                    loadManualFile(
                        "B",
                        file
                    );
                }
            }
        );


    $("playA")
        .addEventListener(
            "click",
            () =>
                playDeck("A")
        );


    $("playB")
        .addEventListener(
            "click",
            () =>
                playDeck("B")
        );


    $("stopA")
        .addEventListener(
            "click",
            () =>
                stopDeck("A")
        );


    $("stopB")
        .addEventListener(
            "click",
            () =>
                stopDeck("B")
        );


    $("stopAll")
        .addEventListener(
            "click",
            stopAll
        );


    $("crossfader")
        .addEventListener(
            "input",
            event => {

                /*
                   Si el usuario mueve el
                   crossfader durante Auto DJ,
                   no se reinicia ninguna canción.
                */

                if (state.transition) {

                    state.transitionToken++;

                    state.transition =
                        false;

                    $("autoState")
                        .textContent =
                        "CONTROL MANUAL";
                }


                setCrossPosition(
                    event.target.value
                );
            }
        );


    $("master")
        .addEventListener(
            "input",
            event => {

                if (!state.masterGain) {
                    return;
                }

                state.masterGain.gain.value =
                    event.target.value;

                $("masterValue")
                    .textContent =
                    `${Math.round(
                        event.target.value * 100
                    )}%`;
            }
        );


    ["A", "B"].forEach(
        letter => {

            $(`volume${letter}`)
                .addEventListener(
                    "input",
                    event => {

                        const deck =
                            state.decks[letter];

                        if (!deck) {
                            return;
                        }


                        deck.volumeGain.gain.value =
                            event.target.value;


                        $(
                            `volumeValue${letter}`
                        )
                            .textContent =
                            `${Math.round(
                                event.target.value * 100
                            )}%`;
                    }
                );


            $(`pitch${letter}`)
                .addEventListener(
                    "input",
                    event => {

                        const deck =
                            state.decks[letter];

                        if (!deck) {
                            return;
                        }


                        deck.audio.playbackRate =
                            1 +
                            Number(
                                event.target.value
                            ) / 100;


                        $(
                            `pitchValue${letter}`
                        )
                            .textContent =
                            `${event.target.value}%`;
                    }
                );


            $(`low${letter}`)
                .addEventListener(
                    "input",
                    event => {

                        const deck =
                            state.decks[letter];

                        if (deck) {

                            deck.low.gain.value =
                                event.target.value;
                        }
                    }
                );


            $(`mid${letter}`)
                .addEventListener(
                    "input",
                    event => {

                        const deck =
                            state.decks[letter];

                        if (deck) {

                            deck.mid.gain.value =
                                event.target.value;
                        }
                    }
                );


            $(`high${letter}`)
                .addEventListener(
                    "input",
                    event => {

                        const deck =
                            state.decks[letter];

                        if (deck) {

                            deck.high.gain.value =
                                event.target.value;
                        }
                    }
                );
        }
    );


    $("smartAutoBtn")
        .addEventListener(
            "click",
            toggleSmartAutoDJ
        );


    $("smartNextBtn")
        .addEventListener(
            "click",
            smartNext
        );


    $("libraryFiles")
        .addEventListener(
            "change",
            event =>
                addLibraryFiles(
                    event.target.files
                )
        );


    $("libraryFolder")
        .addEventListener(
            "change",
            event =>
                addLibraryFiles(
                    event.target.files
                )
        );


    $("analyzeLibrary")
        .addEventListener(
            "click",
            analyzeLibrary
        );


    $("genreFilter")
        .addEventListener(
            "change",
            renderLibrary
        );


    $("voiceFiles")
        .addEventListener(
            "change",
            event =>
                loadVoiceFiles(
                    event.target.files
                )
        );


    $("voiceEnabled")
        .addEventListener(
            "change",
            event => {

                state.voiceEnabled =
                    event.target.checked;


                $("voiceStatus")
                    .textContent =
                    state.voiceEnabled
                        ? "AUTO"
                        : "OFF";


                startVoiceTimer();
            }
        );


    $("voiceTest")
        .addEventListener(
            "click",
            playVoiceID
        );


    $("recordButton")
        .addEventListener(
            "click",
            toggleRecording
        );
}


/* =========================================================
   SMART AUTO DJ ON/OFF
========================================================= */

async function toggleSmartAutoDJ() {

    await startEngine();


    state.autoDJ =
        !state.autoDJ;


    const button =
        $("smartAutoBtn");


    const dot =
        document.querySelector(
            ".engine-dot"
        );


    if (state.autoDJ) {

        button.textContent =
            "SMART AUTO DJ: ON";


        button.classList.add(
            "active"
        );


        dot.classList.add(
            "active"
        );


        $("autoState")
            .textContent =
            "SMART DJ ACTIVO";


        /*
           Si ya hay una canción reproduciendo,
           prepara inmediatamente el siguiente
           plato.
        */

        const active =
            state.decks[
                state.activeDeck
            ];


        if (
            active &&
            active.ready
        ) {

            if (
                active.audio.paused
            ) {

                try {
                    await active.audio.play();
                } catch (_) {}
            }


            await smartNext();

        } else {

            /*
               Si no hay nada activo,
               busca el primer tema analizado.
            */

            const first =
                state.library.find(
                    track =>
                        track.analyzed
                );


            if (first) {

                await loadTrackSmart(
                    first,
                    "A"
                );


                state.activeDeck =
                    "A";


                setCrossPosition(
                    0,
                    true
                );


                await playDeck("A");


                await smartNext();
            }
        }

    } else {

        button.textContent =
            "SMART AUTO DJ: OFF";


        button.classList.remove(
            "active"
        );


        dot.classList.remove(
            "active"
        );


        $("autoState")
            .textContent =
            "ESPERA";
    }
}


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.target.tagName ===
            "INPUT"
        ) {
            return;
        }


        switch (
            event.code
        ) {

            case "Space":

                event.preventDefault();

                const active =
                    state.decks[
                        state.activeDeck
                    ];

                if (active?.ready) {

                    if (
                        active.audio.paused
                    ) {
                        playDeck(
                            state.activeDeck
                        );
                    } else {
                        active.audio.pause();
                    }
                }

                break;


            case "ArrowLeft":

                setCrossPosition(
                    state.crossPosition -
                    .05
                );

                break;


            case "ArrowRight":

                setCrossPosition(
                    state.crossPosition +
                    .05
                );

                break;


            case "KeyA":

                if (!event.ctrlKey) {

                    state.activeDeck =
                        "A";

                    setCrossPosition(
                        0
                    );

                    updateVisualDeck(
                        "A"
                    );
                }

                break;


            case "KeyB":

                if (!event.ctrlKey) {

                    state.activeDeck =
                        "B";

                    setCrossPosition(
                        1
                    );

                    updateVisualDeck(
                        "B"
                    );
                }

                break;
        }
    }
);


/* =========================================================
   INITIALIZE
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setupControls();

        /*
           La interfaz se prepara,
           pero AudioContext solamente se
           inicia mediante interacción del usuario.
        */

        $("crossfader").value =
            .5;
    }
);
