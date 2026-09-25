/* =====================================================
   DJ HUMBERTO 3.2.2
   HC PRO PROFESSIONAL DJ SYSTEM
===================================================== */

"use strict";


/* =====================================================
   ESTADO
===================================================== */

const state = {

    started: false,

    audio: null,

    master: null,

    analyser: null,

    recordDestination: null,

    recorder: null,

    recordedChunks: [],

    micStream: null,

    micSource: null,

    micGain: null,

    autoDJ: false,

    recording: false,

    micOn: false,

    library: [],

    activeDeck: "A",

    decks: {},

    voiceBuffer: null,

    voiceVolume: 0.7,

    effect: null,

    objectUrls: []

};


/* =====================================================
   HELPERS
===================================================== */

const $ = id => document.getElementById(id);


function safeText(element, value) {

    if (element) {
        element.textContent = value;
    }
}


function formatTime(seconds) {

    if (!Number.isFinite(seconds)) {
        return "00:00";
    }

    seconds = Math.max(0, Math.floor(seconds));

    const minutes = Math.floor(seconds / 60);

    const secs = seconds % 60;

    return String(minutes).padStart(2, "0")
        + ":"
        + String(secs).padStart(2, "0");
}


function randomBPM() {

    return 90 + Math.floor(Math.random() * 61);
}


function randomKey() {

    const keys = [
        "Am",
        "Bm",
        "Cm",
        "Dm",
        "Em",
        "Fm",
        "Gm",
        "C",
        "D",
        "E",
        "F",
        "G"
    ];

    return keys[
        Math.floor(Math.random() * keys.length)
    ];
}


function randomEnergy() {

    return 40 + Math.floor(Math.random() * 61);
}


function getName(file) {

    return file.name
        .replace(/\.[^/.]+$/, "");
}


function setBootMessage(message) {

    safeText(
        $("bootMsg"),
        message
    );
}


/* =====================================================
   AUDIO SYSTEM
===================================================== */

function createAudioSystem() {

    if (state.audio) {
        return true;
    }

    const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

    if (!AudioContext) {

        setBootMessage(
            "Este navegador no soporta Web Audio."
        );

        return false;
    }

    try {

        state.audio = new AudioContext();


        /* MASTER */

        state.master =
            state.audio.createGain();

        state.master.gain.value = 0.85;


        /* ANALYSER */

        state.analyser =
            state.audio.createAnalyser();

        state.analyser.fftSize = 1024;

        state.analyser.smoothingTimeConstant = 0.82;


        /* RECORD */

        state.recordDestination =
            state.audio.createMediaStreamDestination();


        state.master.connect(
            state.analyser
        );

        state.analyser.connect(
            state.audio.destination
        );

        state.master.connect(
            state.recordDestination
        );


        /* DECKS */

        createDeck("A");

        createDeck("B");


        return true;

    } catch (error) {

        console.error(error);

        setBootMessage(
            "No se pudo iniciar el sistema de audio."
        );

        return false;
    }
}


/* =====================================================
   CREAR DECK
===================================================== */

function createDeck(name) {

    const media =
        name === "A"
            ? $("mediaA")
            : $("mediaB");

    if (!media) {
        return;
    }

    try {

        const source =
            state.audio.createMediaElementSource(
                media
            );

        const gain =
            state.audio.createGain();

        const low =
            state.audio.createBiquadFilter();

        const mid =
            state.audio.createBiquadFilter();

        const high =
            state.audio.createBiquadFilter();

        const analyser =
            state.audio.createAnalyser();


        low.type = "lowshelf";
        low.frequency.value = 180;

        mid.type = "peaking";
        mid.frequency.value = 1000;
        mid.Q.value = 1;

        high.type = "highshelf";
        high.frequency.value = 4500;


        gain.gain.value = 0.8;

        analyser.fftSize = 512;


        source
            .connect(low)
            .connect(mid)
            .connect(high)
            .connect(analyser)
            .connect(gain)
            .connect(state.master);


        state.decks[name] = {

            media,

            source,

            gain,

            low,

            mid,

            high,

            analyser,

            file: null,

            url: null,

            bpm: null,

            key: null,

            energy: null

        };


        media.addEventListener(
            "loadedmetadata",
            () => {

                updateTime(name);

            }
        );


        media.addEventListener(
            "timeupdate",
            () => {

                updateTime(name);

            }
        );


        media.addEventListener(
            "play",
            () => {

                setDeckPlaying(
                    name,
                    true
                );

                state.activeDeck = name;

                updateNowPlaying(name);

            }
        );


        media.addEventListener(
            "pause",
            () => {

                setDeckPlaying(
                    name,
                    false
                );

            }
        );


        media.addEventListener(
            "ended",
            () => {

                setDeckPlaying(
                    name,
                    false
                );

                if (state.autoDJ) {

                    autoNext(name);

                }

            }
        );


    } catch (error) {

        console.error(
            "Error creando deck",
            name,
            error
        );

        safeText(
            name === "A"
                ? $("deckAState")
                : $("deckBState"),
            "ERROR"
        );
    }
}


/* =====================================================
   CARGAR PISTA EN DECK
===================================================== */

function loadFileToDeck(
    file,
    deckName
) {

    if (!file) {
        return;
    }

    const deck =
        state.decks[deckName];

    if (!deck) {

        setBootMessage(
            "Primero presiona INICIAR DJ HUMBERTO."
        );

        return;
    }


    try {

        if (deck.url) {

            URL.revokeObjectURL(
                deck.url
            );

        }


        const url =
            URL.createObjectURL(file);

        state.objectUrls.push(url);

        deck.url = url;

        deck.file = file;

        deck.media.src = url;

        deck.media.load();


        deck.bpm = randomBPM();

        deck.key = randomKey();

        deck.energy = randomEnergy();


        safeText(
            $("title" + deckName),
            getName(file)
        );


        safeText(
            $("meta" + deckName),
            `BPM ${deck.bpm} • KEY ${deck.key} • ENERGY ${deck.energy}`
        );


        safeText(
            $("deck" + deckName + "State"),
            "LOADED"
        );


        updateSmart(deckName);

        showVideoIfNeeded(
            file,
            url
        );


    } catch (error) {

        console.error(error);

        safeText(
            $("deck" + deckName + "State"),
            "ERROR"
        );
    }
}


/* =====================================================
   VIDEO
===================================================== */

function showVideoIfNeeded(
    file,
    url
) {

    const video =
        $("videoPlayer");

    const placeholder =
        $("screenPlaceholder");

    if (!video || !placeholder) {
        return;
    }


    if (file.type.startsWith("video/")) {

        video.src = url;

        video.style.display =
            "block";

        placeholder.style.display =
            "none";

    } else {

        video.pause();

        video.removeAttribute("src");

        video.load();

        video.style.display =
            "none";

        placeholder.style.display =
            "flex";
    }
}


/* =====================================================
   PLAY
===================================================== */

async function playDeck(name) {

    const deck =
        state.decks[name];

    if (!deck || !deck.media.src) {

        setBootMessage(
            `Carga una pista en Deck ${name}.`
        );

        return;
    }


    try {

        if (
            state.audio &&
            state.audio.state === "suspended"
        ) {

            await state.audio.resume();

        }


        await deck.media.play();

        state.activeDeck = name;

        updateNowPlaying(name);

    } catch (error) {

        console.error(error);

        setBootMessage(
            "El navegador bloqueó la reproducción. Presiona PLAY nuevamente."
        );
    }
}


/* =====================================================
   STOP
===================================================== */

function stopDeck(name) {

    const deck =
        state.decks[name];

    if (!deck) {
        return;
    }

    deck.media.pause();

    deck.media.currentTime = 0;

    setDeckPlaying(
        name,
        false
    );
}


/* =====================================================
   PLAYING VISUAL
===================================================== */

function setDeckPlaying(
    name,
    playing
) {

    const deckElement =
        document.querySelector(
            name === "A"
                ? ".deck-a"
                : ".deck-b"
        );

    if (!deckElement) {
        return;
    }


    if (playing) {

        deckElement.classList.add(
            "playing"
        );

        safeText(
            $("deck" + name + "State"),
            "PLAYING"
        );

    } else {

        deckElement.classList.remove(
            "playing"
        );

        safeText(
            $("deck" + name + "State"),
            "READY"
        );
    }
}


/* =====================================================
   NOW PLAYING
===================================================== */

function updateNowPlaying(name) {

    const deck =
        state.decks[name];

    if (!deck || !deck.file) {
        return;
    }

    safeText(
        $("nowTitle"),
        getName(deck.file)
    );

    safeText(
        $("nowArtist"),
        `DECK ${name} • ${deck.bpm} BPM • ${deck.key}`
    );


    updateSmart(name);
}


/* =====================================================
   TIEMPO
===================================================== */

function updateTime(name) {

    const deck =
        state.decks[name];

    if (!deck) {
        return;
    }

    const media =
        deck.media;

    const seek =
        $("seek" + name);

    const time =
        $("time" + name + "Value");


    if (
        media.duration &&
        Number.isFinite(media.duration)
    ) {

        seek.value =
            (media.currentTime /
                media.duration) *
            100;

    } else {

        seek.value = 0;

    }


    safeText(
        time,
        formatTime(
            media.currentTime
        )
    );
}


/* =====================================================
   CROSS FADER
===================================================== */

function updateCrossfader() {

    const value =
        Number(
            $("crossfader").value
        ) / 100;

    const a =
        state.decks.A;

    const b =
        state.decks.B;

    if (!a || !b) {
        return;
    }


    const gainA =
        Math.cos(
            value * Math.PI / 2
        );

    const gainB =
        Math.cos(
            (1 - value) * Math.PI / 2
        );


    const volumeA =
        Number(
            $("volumeA").value
        ) / 100;

    const volumeB =
        Number(
            $("volumeB").value
        ) / 100;


    a.gain.gain.value =
        gainA * volumeA;

    b.gain.gain.value =
        gainB * volumeB;
}


/* =====================================================
   VOLUMEN
===================================================== */

function updateDeckVolume(name) {

    const deck =
        state.decks[name];

    if (!deck) {
        return;
    }


    const value =
        Number(
            $("volume" + name).value
        );


    safeText(
        $("volume" + name + "Value"),
        value + "%"
    );


    updateCrossfader();
}


/* =====================================================
   PITCH
===================================================== */

function updatePitch(name) {

    const deck =
        state.decks[name];

    if (!deck) {
        return;
    }


    const value =
        Number(
            $("pitch" + name).value
        );


    deck.media.playbackRate =
        1 + value / 100;


    safeText(
        $("pitch" + name + "Value"),
        `${value}%`
    );
}


/* =====================================================
   SEEK
===================================================== */

function seekDeck(name) {

    const deck =
        state.decks[name];

    if (
        !deck ||
        !deck.media.duration
    ) {
        return;
    }


    const value =
        Number(
            $("seek" + name).value
        );


    deck.media.currentTime =
        deck.media.duration *
        value /
        100;
}


/* =====================================================
   MASTER
===================================================== */

function updateMaster() {

    if (!state.master) {
        return;
    }


    const value =
        Number(
            $("master").value
        );


    state.master.gain.value =
        value / 100;


    safeText(
        $("masterValue"),
        value + "%"
    );
}


/* =====================================================
   EQ
===================================================== */

function updateEQ() {

    if (!state.decks.A) {
        return;
    }


    const high =
        Number(
            $("eqHigh").value
        );

    const mid =
        Number(
            $("eqMid").value
        );

    const low =
        Number(
            $("eqLow").value
        );


    for (const name of ["A", "B"]) {

        const deck =
            state.decks[name];

        if (!deck) {
            continue;
        }

        deck.low.gain.value =
            low;

        deck.mid.gain.value =
            mid;

        deck.high.gain.value =
            high;
    }
}


/* =====================================================
   SMART DJ
===================================================== */

function updateSmart(name) {

    const deck =
        state.decks[name];

    if (!deck) {
        return;
    }


    safeText(
        $("energyValue"),
        deck.energy
            ? deck.energy + "%"
            : "--"
    );

    safeText(
        $("bpmValue"),
        deck.bpm || "--"
    );

    safeText(
        $("keyValue"),
        deck.key || "--"
    );
}


/* =====================================================
   SMART NEXT
===================================================== */

function smartNext() {

    if (!state.library.length) {

        safeText(
            $("smartState"),
            "AGREGA MÚSICA"
        );

        return;
    }


    const inactive =
        state.activeDeck === "A"
            ? "B"
            : "A";


    const item =
        state.library[
            Math.floor(
                Math.random() *
                state.library.length
            )
        ];


    loadFileToDeck(
        item.file,
        inactive
    );


    safeText(
        $("nextValue"),
        getName(item.file)
    );


    safeText(
        $("smartState"),
        `SIGUIENTE → DECK ${inactive}`
    );
}


/* =====================================================
   AUTO DJ
===================================================== */

function toggleAutoDJ() {

    state.autoDJ =
        !state.autoDJ;


    const button =
        $("autoDjBtn");


    if (state.autoDJ) {

        button.textContent =
            "🤖 AUTO DJ ON";

        button.classList.add(
            "active"
        );

        safeText(
            $("smartState"),
            "AUTO DJ ACTIVADO"
        );

    } else {

        button.textContent =
            "🤖 AUTO DJ OFF";

        button.classList.remove(
            "active"
        );

        safeText(
            $("smartState"),
            "AUTO DJ OFF"
        );
    }
}


/* =====================================================
   AUTO NEXT
===================================================== */

function autoNext(finishedDeck) {

    if (!state.library.length) {
        return;
    }


    const nextDeck =
        finishedDeck === "A"
            ? "B"
            : "A";


    const item =
        state.library[
            Math.floor(
                Math.random() *
                state.library.length
            )
        ];


    loadFileToDeck(
        item.file,
        nextDeck
    );


    setTimeout(
        () => {

            playDeck(nextDeck);

            $("crossfader").value =
                nextDeck === "A"
                    ? 0
                    : 100;

            updateCrossfader();

        },
        300
    );
}


/* =====================================================
   BIBLIOTECA
===================================================== */

function addFiles(
    files
) {

    if (!files || !files.length) {
        return;
    }


    for (const file of files) {

        const item = {

            id:
                Date.now() +
                Math.random(),

            file

        };


        state.library.push(
            item
        );
    }


    renderLibrary();
}


/* =====================================================
   RENDER LIBRARY
===================================================== */

function renderLibrary() {

    const library =
        $("library");

    if (!library) {
        return;
    }


    safeText(
        $("libraryCount"),
        `${state.library.length} PISTAS`
    );


    library.innerHTML = "";


    if (!state.library.length) {

        library.innerHTML =
            `<div class="empty-library">
                No hay pistas cargadas.
             </div>`;

        return;
    }


    state.library.forEach(
        (item, index) => {

            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "library-item";


            div.innerHTML = `

                <strong>
                    ${escapeHTML(
                        getName(item.file)
                    )}
                </strong>

                <span>
                    ${item.file.type || "audio"}
                    • ${formatBytes(item.file.size)}
                </span>

            `;


            div.addEventListener(
                "click",
                () => {

                    const deck =
                        state.activeDeck;

                    loadFileToDeck(
                        item.file,
                        deck
                    );

                }
            );


            library.appendChild(div);
        }
    );
}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHTML(text) {

    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =====================================================
   FILE SIZE
===================================================== */

function formatBytes(bytes) {

    if (!bytes) {
        return "0 KB";
    }


    const mb =
        bytes /
        1024 /
        1024;


    if (mb >= 1) {

        return mb.toFixed(1) + " MB";

    }


    return (
        bytes /
        1024
    ).toFixed(0) + " KB";
}


/* =====================================================
   SHUFFLE
===================================================== */

function shuffleLibrary() {

    for (
        let i = state.library.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() *
                (i + 1)
            );


        [
            state.library[i],
            state.library[j]
        ] =
        [
            state.library[j],
            state.library[i]
        ];
    }


    renderLibrary();
}


/* =====================================================
   CLEAR LIBRARY
===================================================== */

function clearLibrary() {

    state.library = [];

    renderLibrary();

    safeText(
        $("nextValue"),
        "AUTOMÁTICO"
    );
}


/* =====================================================
   EFFECTS
===================================================== */

function toggleEffect(
    button
) {

    document
        .querySelectorAll(
            ".fx-buttons button"
        )
        .forEach(
            b =>
                b.classList.remove(
                    "active"
                )
        );


    button.classList.add(
        "active"
    );


    const effect =
        button.dataset.effect;


    state.effect =
        state.effect === effect
            ? null
            : effect;


    if (!state.effect) {

        button.classList.remove(
            "active"
        );
    }
}


/* =====================================================
   MIC
===================================================== */

async function toggleMic() {

    if (!state.audio) {
        return;
    }


    if (state.micOn) {

        if (state.micStream) {

            state.micStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );
        }


        state.micOn = false;

        safeText(
            $("micBtn"),
            "🎤 MIC OFF"
        );

        $("micBtn")
            .classList.remove(
                "active"
            );

        safeText(
            $("voiceState"),
            "OFF"
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
            state.audio
                .createMediaStreamSource(
                    stream
                );


        state.micGain =
            state.audio
                .createGain();


        state.micGain.gain.value =
            0.8;


        state.micSource
            .connect(
                state.micGain
            )
            .connect(
                state.master
            );


        state.micOn = true;


        safeText(
            $("micBtn"),
            "🎤 MIC ON"
        );

        $("micBtn")
            .classList.add(
                "active"
            );

        safeText(
            $("voiceState"),
            "MIC ON"
        );

    } catch (error) {

        console.error(error);

        safeText(
            $("bootMsg"),
            "No se pudo acceder al micrófono."
        );
    }
}


/* =====================================================
   VOICE ID
===================================================== */

async function loadVoice(
    file
) {

    if (!file || !state.audio) {
        return;
    }


    try {

        const buffer =
            await file.arrayBuffer();


        state.voiceBuffer =
            await state.audio.decodeAudioData(
                buffer
            );


        safeText(
            $("voiceState"),
            "ID LISTO"
        );

    } catch (error) {

        console.error(error);

        safeText(
            $("voiceState"),
            "ERROR"
        );
    }
}


function playVoice() {

    if (
        !state.audio ||
        !state.voiceBuffer
    ) {
        return;
    }


    const source =
        state.audio
            .createBufferSource();


    const gain =
        state.audio
            .createGain();


    gain.gain.value =
        state.voiceVolume;


    source.buffer =
        state.voiceBuffer;


    source
        .connect(gain)
        .connect(state.master);


    source.start();
}


/* =====================================================
   GRABACIÓN
===================================================== */

function toggleRecording() {

    if (!state.audio) {
        return;
    }


    if (state.recording) {

        stopRecording();

        return;
    }


    startRecording();
}


function startRecording() {

    if (
        !state.recordDestination
    ) {
        return;
    }


    const mimeTypes = [

        "audio/webm;codecs=opus",

        "audio/webm",

        "audio/ogg;codecs=opus"

    ];


    let mimeType = "";


    for (
        const type of mimeTypes
    ) {

        if (
            window.MediaRecorder &&
            MediaRecorder.isTypeSupported &&
            MediaRecorder.isTypeSupported(type)
        ) {

            mimeType = type;

            break;
        }
    }


    try {

        state.recordedChunks = [];


        state.recorder =
            mimeType
                ? new MediaRecorder(
                    state.recordDestination.stream,
                    { mimeType }
                )
                : new MediaRecorder(
                    state.recordDestination.stream
                );


        state.recorder.ondataavailable =
            event => {

                if (
                    event.data &&
                    event.data.size
                ) {

                    state.recordedChunks.push(
                        event.data
                    );
                }
            };


        state.recorder.onstop =
            saveRecording;


        state.recorder.start();

        state.recording = true;


        $("recordBtn")
            .classList.add(
                "recording"
            );


        safeText(
            $("recordBtn"),
            "■ DETENER GRABACIÓN"
        );

        safeText(
            $("recordStatus"),
            "REC ON"
        );

    } catch (error) {

        console.error(error);

        safeText(
            $("recordStatus"),
            "REC ERROR"
        );
    }
}


function stopRecording() {

    if (
        state.recorder &&
        state.recording
    ) {

        state.recorder.stop();

    }

    state.recording = false;


    $("recordBtn")
        .classList.remove(
            "recording"
        );


    safeText(
        $("recordBtn"),
        "● GRABAR MIX"
    );

    safeText(
        $("recordStatus"),
        "PROCESANDO..."
    );
}


function saveRecording() {

    if (
        !state.recordedChunks.length
    ) {

        safeText(
            $("recordStatus"),
            "SIN AUDIO"
        );

        return;
    }


    const blob =
        new Blob(
            state.recordedChunks,
            {
                type:
                    state.recordedChunks[0]
                        .type ||
                    "audio/webm"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const a =
        document.createElement(
            "a"
        );


    a.href = url;

    a.download =
        `DJ-HUMBERTO-MIX-${Date.now()}.webm`;


    document.body.appendChild(a);

    a.click();

    a.remove();


    setTimeout(
        () =>
            URL.revokeObjectURL(
                url
            ),
        1000
    );


    safeText(
        $("recordStatus"),
        "REC GUARDADA"
    );
}


/* =====================================================
   RELOJ
===================================================== */

function updateClock() {

    const now =
        new Date();


    try {

        safeText(
            $("clock"),

            new Intl.DateTimeFormat(
                "es-AR",
                {
                    timeZone:
                        "America/Argentina/La_Rioja",

                    hour:
                        "2-digit",

                    minute:
                        "2-digit",

                    second:
                        "2-digit"
                }
            ).format(now)
        );

    } catch {

        safeText(
            $("clock"),
            now.toLocaleTimeString(
                "es-AR"
            )
        );
    }
}


/* =====================================================
   VISUALIZER
===================================================== */

function startVisualizer() {

    const canvas =
        $("visualizer");

    if (!canvas) {
        return;
    }


    const ctx =
        canvas.getContext("2d");


    function resize() {

        canvas.width =
            canvas.clientWidth *
            window.devicePixelRatio;

        canvas.height =
            canvas.clientHeight *
            window.devicePixelRatio;

        ctx.setTransform(
            window.devicePixelRatio,
            0,
            0,
            window.devicePixelRatio,
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
            state.analyser
                ? state.analyser.frequencyBinCount
                : 512
        );


    function draw() {

        requestAnimationFrame(
            draw
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


        if (
            !state.analyser
        ) {
            return;
        }


        state.analyser
            .getByteFrequencyData(
                data
            );


        const bars = 80;

        const gap = 3;

        const barWidth =
            width /
            bars -
            gap;


        for (
            let i = 0;
            i < bars;
            i++
        ) {

            const index =
                Math.floor(
                    i *
                    data.length /
                    bars
                );


            const value =
                data[index] / 255;


            const barHeight =
                value *
                height *
                .45;


            const x =
                i *
                (barWidth + gap);


            const y =
                height -
                barHeight -
                10;


            const gradient =
                ctx.createLinearGradient(
                    0,
                    y,
                    0,
                    height
                );


            gradient.addColorStop(
                0,
                "rgba(0,234,255,.9)"
            );

            gradient.addColorStop(
                .5,
                "rgba(139,92,255,.7)"
            );

            gradient.addColorStop(
                1,
                "rgba(255,43,214,.15)"
            );


            ctx.fillStyle =
                gradient;


            ctx.fillRect(
                x,
                y,
                Math.max(
                    1,
                    barWidth
                ),
                barHeight
            );
        }
    }


    draw();
}


/* =====================================================
   CONTROLES
===================================================== */

function bindControls() {

    /* START */

    $("startAudioBtn")
        .addEventListener(
            "click",
            startSystem
        );


    /* DECK A */

    $("loadA")
        .addEventListener(
            "click",
            () =>
                $("fileA").click()
        );


    $("fileA")
        .addEventListener(
            "change",
            event =>
                loadFileToDeck(
                    event.target.files[0],
                    "A"
                )
        );


    $("playA")
        .addEventListener(
            "click",
            () =>
                playDeck("A")
        );


    $("stopA")
        .addEventListener(
            "click",
            () =>
                stopDeck("A")
        );


    $("volumeA")
        .addEventListener(
            "input",
            () =>
                updateDeckVolume("A")
        );


    $("pitchA")
        .addEventListener(
            "input",
            () =>
                updatePitch("A")
        );


    $("seekA")
        .addEventListener(
            "input",
            () =>
                seekDeck("A")
        );


    /* DECK B */

    $("loadB")
        .addEventListener(
            "click",
            () =>
                $("fileB").click()
        );


    $("fileB")
        .addEventListener(
            "change",
            event =>
                loadFileToDeck(
                    event.target.files[0],
                    "B"
                )
        );


    $("playB")
        .addEventListener(
            "click",
            () =>
                playDeck("B")
        );


    $("stopB")
        .addEventListener(
            "click",
            () =>
                stopDeck("B")
        );


    $("volumeB")
        .addEventListener(
            "input",
            () =>
                updateDeckVolume("B")
        );


    $("pitchB")
        .addEventListener(
            "input",
            () =>
                updatePitch("B")
        );


    $("seekB")
        .addEventListener(
            "input",
            () =>
                seekDeck("B")
        );


    /* MIXER */

    $("master")
        .addEventListener(
            "input",
            updateMaster
        );


    $("crossfader")
        .addEventListener(
            "input",
            updateCrossfader
        );


    $("eqHigh")
        .addEventListener(
            "input",
            updateEQ
        );


    $("eqMid")
        .addEventListener(
            "input",
            updateEQ
        );


    $("eqLow")
        .addEventListener(
            "input",
            updateEQ
        );


    /* EFFECTS */

    document
        .querySelectorAll(
            ".fx-buttons button"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () =>
                        toggleEffect(
                            button
                        )
                );

            }
        );


    /* LIBRARY */

    $("addMusic")
        .addEventListener(
            "click",
            () =>
                $("musicFiles").click()
        );


    $("musicFiles")
        .addEventListener(
            "change",
            event =>
                addFiles(
                    event.target.files
                )
        );


    $("clearLibrary")
        .addEventListener(
            "click",
            clearLibrary
        );


    $("shuffleBtn")
        .addEventListener(
            "click",
            shuffleLibrary
        );


    /* SMART */

    $("smartNext")
        .addEventListener(
            "click",
            smartNext
        );


    $("autoDjBtn")
        .addEventListener(
            "click",
            toggleAutoDJ
        );


    /* MIC */

    $("micBtn")
        .addEventListener(
            "click",
            toggleMic
        );


    /* RECORD */

    $("recordBtn")
        .addEventListener(
            "click",
            toggleRecording
        );


    /* VOICE */

    $("voiceLoad")
        .addEventListener(
            "click",
            () =>
                $("voiceFile").click()
        );


    $("voiceFile")
        .addEventListener(
            "change",
            event =>
                loadVoice(
                    event.target.files[0]
                )
        );


    $("voicePlay")
        .addEventListener(
            "click",
            playVoice
        );


    $("voiceVolume")
        .addEventListener(
            "input",
            event => {

                state.voiceVolume =
                    Number(
                        event.target.value
                    ) / 100;
            }
        );


    /* KEYBOARD */

    document.addEventListener(
        "keydown",
        keyboardShortcuts
    );
}


/* =====================================================
   START SYSTEM
===================================================== */

async function startSystem() {

    if (state.started) {
        return;
    }


    setBootMessage(
        "Iniciando sistema..."
    );


    const success =
        createAudioSystem();


    if (!success) {

        safeText(
            $("systemState"),
            "● MODO VISUAL"
        );

        $("systemState")
            .classList.remove(
                "offline"
            );

        $("systemState")
            .classList.add(
                "online"
            );

        return;
    }


    try {

        await state.audio.resume();

    } catch (error) {

        console.warn(
            "AudioContext:",
            error
        );
    }


    state.started = true;


    safeText(
        $("systemState"),
        "● SISTEMA ONLINE"
    );


    $("systemState")
        .classList.remove(
            "offline"
        );

    $("systemState")
        .classList.add(
        "online"
    );


    $("bootOverlay")
        .classList.add(
            "hide"
        );


    setBootMessage(
        "Sistema iniciado."
    );


    updateMaster();

    updateCrossfader();

    updateEQ();

    startVisualizer();


    safeText(
        $("smartState"),
        "SISTEMA ONLINE"
    );
}


/* =====================================================
   TECLADO
===================================================== */

function keyboardShortcuts(event) {

    if (
        event.target.matches(
            "input, textarea"
        )
    ) {
        return;
    }


    switch (
        event.code
    ) {

        case "Space":

            event.preventDefault();

            if (
                state.activeDeck === "A"
            ) {

                const deck =
                    state.decks.A;

                if (
                    deck &&
                    !deck.media.paused
                ) {

                    deck.media.pause();

                } else {

                    playDeck("A");

                }

            } else {

                const deck =
                    state.decks.B;

                if (
                    deck &&
                    !deck.media.paused
                ) {

                    deck.media.pause();

                } else {

                    playDeck("B");

                }
            }

            break;


        case "KeyA":

            playDeck("A");

            break;


        case "KeyB":

            playDeck("B");

            break;


        case "KeyS":

            stopDeck(
                state.activeDeck
            );

            break;


        case "KeyR":

            toggleRecording();

            break;
    }
}


/* =====================================================
   INIT
===================================================== */

function init() {

    try {

        bindControls();

        updateClock();

        setInterval(
            updateClock,
            1000
        );


        renderLibrary();


        console.log(
            "DJ HUMBERTO 3.2.2 listo."
        );

    } catch (error) {

        console.error(
            "Error de inicialización:",
            error
        );

        setBootMessage(
            "DJ HUMBERTO cargó con algunas funciones limitadas."
        );
    }
}


/* =====================================================
   ERRORES GLOBALES
===================================================== */

window.addEventListener(
    "error",
    event => {

        console.error(
            "Error:",
            event.error || event.message
        );
    }
);


window.addEventListener(
    "unhandledrejection",
    event => {

        console.error(
            "Promise error:",
            event.reason
        );
    }
);


/* =====================================================
   ARRANQUE
===================================================== */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        init
    );

} else {

    init();

}
