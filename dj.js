"use strict";

/* =========================================================
   HC PRO DJ HUMBERTO
   SMART DJ ENGINE
========================================================= */


/* =========================================================
   CONFIG
========================================================= */

const CONFIG = {

    crossfadeDefault: 4,

    autoMixDefault: 10,

    voiceIntervalDefault: 10,

    maxHistory: 12,

    bpmTolerance: 12,

    energyTolerance: 0.35

};


/* =========================================================
   STATE
========================================================= */

const state = {

    audioContext: null,

    masterGain: null,

    analyser: null,

    recordDestination: null,

    started: false,

    activeDeck: "A",

    transition: false,

    autoDJ: false,

    autoTimer: null,

    countdownTimer: null,

    autoRemaining: 0,

    crossPosition: 0,

    crossfadeSeconds: CONFIG.crossfadeDefault,

    library: [],

    history: [],

    genreFilter: "all",

    voiceFiles: [],

    voiceTimer: null,

    voicePlaying: false,

    decks: {

        A: null,

        B: null

    }

};


/* =========================================================
   DOM
========================================================= */

const $ = id => document.getElementById(id);


/* =========================================================
   CLOCK
========================================================= */

function updateClock(){

    const now = new Date();

    $("systemClock").textContent =
        now.toLocaleTimeString("es-AR");

}

setInterval(updateClock,1000);
updateClock();


/* =========================================================
   AUDIO ENGINE
========================================================= */

async function startAudioEngine(){

    if(state.audioContext){

        if(state.audioContext.state === "suspended"){
            await state.audioContext.resume();
        }

        return;
    }


    const AC =
        window.AudioContext ||
        window.webkitAudioContext;

    if(!AC){

        alert("Este navegador no soporta Web Audio.");
        return;
    }


    state.audioContext = new AC();


    state.masterGain =
        state.audioContext.createGain();

    state.masterGain.gain.value = .9;


    state.analyser =
        state.audioContext.createAnalyser();

    state.analyser.fftSize = 2048;


    state.recordDestination =
        state.audioContext.createMediaStreamDestination();


    state.masterGain.connect(
        state.analyser
    );

    state.masterGain.connect(
        state.audioContext.destination
    );

    state.masterGain.connect(
        state.recordDestination
    );


    createDeck("A");
    createDeck("B");


    state.started = true;

    $("systemLed").style.background =
        "var(--green)";

    $("visualStatus").textContent =
        "AUDIO ENGINE ACTIVO";


    requestAnimationFrame(drawVisualizer);

}


/* =========================================================
   CREATE DECK
========================================================= */

function createDeck(letter){

    const audio =
        $("audio" + letter);

    const inputGain =
        state.audioContext.createGain();

    const low =
        state.audioContext.createBiquadFilter();

    const mid =
        state.audioContext.createBiquadFilter();

    const high =
        state.audioContext.createBiquadFilter();

    const volumeGain =
        state.audioContext.createGain();

    const crossGain =
        state.audioContext.createGain();


    low.type = "lowshelf";
    low.frequency.value = 180;

    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 1;

    high.type = "highshelf";
    high.frequency.value = 5000;


    inputGain.gain.value = 1;
    volumeGain.gain.value = 1;


    /*
       IMPORTANTE:

       volumeGain = volumen individual.

       crossGain = SOLO crossfader.

       De esta manera el crossfader NO rompe
       el volumen del deck ni corta la canción.
    */

    crossGain.gain.value =
        letter === "A" ? 1 : 0;


    const source =
        state.audioContext.createMediaElementSource(audio);


    source.connect(inputGain);

    inputGain.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(volumeGain);

    volumeGain.connect(crossGain);

    crossGain.connect(
        state.masterGain
    );


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

        objectURL: null,

        analysis: null,

        playing: false,

        crossGainValue:
            letter === "A" ? 1 : 0

    };


    state.decks[letter] = deck;


    audio.addEventListener(
        "play",
        () => {

            deck.playing = true;

            $("record" + letter)
                .classList.add("playing");

            $("status" + letter)
                .textContent = "PLAYING";

            if(letter === state.activeDeck){

                showDeckMedia(letter);

            }

        }
    );


    audio.addEventListener(
        "pause",
        () => {

            deck.playing = false;

            $("record" + letter)
                .classList.remove("playing");

            if(
                $("status" + letter)
            ){
                $("status" + letter)
                    .textContent = "PAUSED";
            }

        }
    );


    audio.addEventListener(
        "ended",
        () => {

            deck.playing = false;

            $("record" + letter)
                .classList.remove("playing");

            if(state.autoDJ){

                prepareAutomaticTransition(
                    letter
                );

            }

        }
    );

}


/* =========================================================
   CROSSGAIN
========================================================= */

function setCrossGain(
    letter,
    value,
    immediate = true
){

    const deck =
        state.decks[letter];

    if(!deck) return;


    value =
        Math.max(
            0,
            Math.min(1,value)
        );


    const now =
        state.audioContext.currentTime;


    deck.crossGain.gain.cancelScheduledValues(now);

    deck.crossGain.gain.setValueAtTime(
        value,
        now
    );


    deck.crossGainValue = value;
}


/* =========================================================
   MANUAL CROSSFADER
========================================================= */

function updateCrossfader(){

    if(state.transition) return;


    const slider =
        $("crossfader");

    const x =
        Number(slider.value);


    state.crossPosition = x;


    /*
       EQUAL POWER CROSSFADE

       A = cos
       B = sin

       Esto evita el agujero de volumen
       en el centro.
    */

    const angle =
        x * Math.PI / 2;


    const gainA =
        Math.cos(angle);

    const gainB =
        Math.sin(angle);


    setCrossGain(
        "A",
        gainA
    );

    setCrossGain(
        "B",
        gainB
    );


    updateCrossLabel(x);

}


function updateCrossLabel(x){

    if(x < .05){

        $("crossValue").textContent =
            "A FULL";

    }else if(x > .95){

        $("crossValue").textContent =
            "B FULL";

    }else{

        $("crossValue").textContent =
            "A  ↔  B";

    }

}


/* =========================================================
   ROBUST AUTO CROSSFADE
========================================================= */

async function crossfadeTo(
    fromLetter,
    toLetter
){

    if(state.transition) return false;


    const from =
        state.decks[fromLetter];

    const to =
        state.decks[toLetter];


    if(!from || !to || !to.file){

        return false;
    }


    state.transition = true;


    try{

        await startAudioEngine();


        /*
           MUY IMPORTANTE:

           Primero arrancamos el deck entrante.

           Después hacemos el fade.

           Así la canción siguiente ya está sonando
           antes de bajar la anterior.
        */

        if(to.audio.paused){

            await to.audio.play();

        }


        /*
           La pantalla cambia al deck entrante
           desde el inicio de la transición.
        */

        showDeckMedia(toLetter);


        const duration =
            Math.max(
                1,
                Number(
                    $("crossfadeDuration").value
                )
            );


        const start =
            performance.now();


        const initialFrom =
            from.crossGainValue;

        const initialTo =
            to.crossGainValue;


        await new Promise(resolve => {


            function animate(now){

                const elapsed =
                    (now - start) / 1000;


                const p =
                    Math.min(
                        1,
                        elapsed / duration
                    );


                /*
                   Fade equal-power.

                   Siempre desde el estado actual
                   hacia el nuevo deck.
                */

                const curve =
                    p * Math.PI / 2;


                let fadeFrom =
                    Math.cos(curve);

                let fadeTo =
                    Math.sin(curve);


                /*
                   En caso de que la transición
                   comience desde una posición manual,
                   interpolamos hacia los valores finales.
                */

                const valueFrom =
                    initialFrom +
                    (0 - initialFrom) * p;

                const valueTo =
                    initialTo +
                    (1 - initialTo) * p;


                /*
                   Para una transición completa usamos
                   la curva equal-power cuando comienza
                   desde una posición normal.
                */

                let finalFrom =
                    initialFrom >= .95
                        ? fadeFrom
                        : valueFrom;

                let finalTo =
                    initialTo <= .05
                        ? fadeTo
                        : valueTo;


                setCrossGain(
                    fromLetter,
                    finalFrom
                );

                setCrossGain(
                    toLetter,
                    finalTo
                );


                if(p < 1){

                    requestAnimationFrame(
                        animate
                    );

                }else{

                    resolve();

                }

            }


            requestAnimationFrame(
                animate
            );

        });


        /*
           Ahora la canción anterior puede detenerse.

           NUNCA antes.
        */

        from.audio.pause();

        from.audio.currentTime = 0;


        setCrossGain(
            fromLetter,
            0
        );

        setCrossGain(
            toLetter,
            1
        );


        state.activeDeck =
            toLetter;


        state.crossPosition =
            toLetter === "A" ? 0 : 1;


        $("crossfader").value =
            state.crossPosition;


        updateCrossLabel(
            state.crossPosition
        );


        addHistory(
            to.file
        );


        return true;

    }catch(error){

        console.error(
            "Crossfade error:",
            error
        );

        return false;

    }finally{

        state.transition = false;

    }

}


/* =========================================================
   LOAD FILE INTO DECK
========================================================= */

async function loadFileToDeck(
    letter,
    file
){

    if(!file) return;


    await startAudioEngine();


    const deck =
        state.decks[letter];


    if(!deck) return;


    if(deck.objectURL){

        URL.revokeObjectURL(
            deck.objectURL
        );

    }


    deck.objectURL =
        URL.createObjectURL(file);

    deck.file =
        file;


    deck.analysis =
        await analyzeTrack(
            file
        );


    deck.audio.src =
        deck.objectURL;

    deck.audio.load();


    $("track" + letter)
        .textContent =
        file.name;


    $("status" + letter)
        .textContent =
        "ANALIZADO";


    if(letter === state.activeDeck){

        showDeckMedia(letter);

    }

}


/* =========================================================
   PLAY
========================================================= */

async function playDeck(letter){

    await startAudioEngine();


    const deck =
        state.decks[letter];


    if(!deck || !deck.file){

        alert(
            "Primero carga un archivo en Deck " +
            letter
        );

        return;
    }


    /*
       Si el otro deck está sonando y este
       es diferente, hacemos transición.
    */

    const other =
        letter === "A" ? "B" : "A";


    if(
        state.decks[other] &&
        state.decks[other].playing &&
        state.activeDeck !== letter
    ){

        await crossfadeTo(
            other,
            letter
        );

        return;

    }


    /*
       Si no hay transición,
       hacemos que el deck elegido sea audible.
    */

    if(letter === "A"){

        state.crossPosition = 0;

        setCrossGain("A",1);
        setCrossGain("B",0);

        $("crossfader").value = 0;

    }else{

        state.crossPosition = 1;

        setCrossGain("A",0);
        setCrossGain("B",1);

        $("crossfader").value = 1;

    }


    updateCrossLabel(
        state.crossPosition
    );


    state.activeDeck =
        letter;


    await deck.audio.play();

    showDeckMedia(letter);

}


/* =========================================================
   STOP
========================================================= */

function stopDeck(letter){

    const deck =
        state.decks[letter];

    if(!deck) return;


    deck.audio.pause();

    deck.audio.currentTime = 0;

    deck.playing = false;

    $("record" + letter)
        .classList.remove("playing");


    $("status" + letter)
        .textContent =
        "STOPPED";

}


/* =========================================================
   STOP ALL
========================================================= */

function stopAll(){

    stopDeck("A");
    stopDeck("B");


    setCrossGain("A",1);
    setCrossGain("B",0);


    state.activeDeck = "A";

    state.crossPosition = 0;

    $("crossfader").value = 0;

    updateCrossLabel(0);


    stopAutoDJ();

}


/* =========================================================
   PITCH
========================================================= */

function setPitch(letter,value){

    const deck =
        state.decks[letter];

    if(!deck) return;


    /*
       Pitch aproximado mediante playbackRate.
    */

    const rate =
        Math.pow(
            2,
            Number(value) / 12
        );


    deck.audio.playbackRate =
        rate;


    $("pitchValue" + letter)
        .textContent =
        Number(value).toFixed(1) + "%";

}


/* =========================================================
   EQ
========================================================= */

function setEQ(
    letter,
    band,
    value
){

    const deck =
        state.decks[letter];

    if(!deck) return;


    if(band === "low"){
        deck.low.gain.value =
            Number(value);
    }

    if(band === "mid"){
        deck.mid.gain.value =
            Number(value);
    }

    if(band === "high"){
        deck.high.gain.value =
            Number(value);
    }

}


/* =========================================================
   MASTER
========================================================= */

function setMaster(value){

    if(!state.masterGain) return;

    state.masterGain.gain.value =
        Number(value);

    $("masterValue")
        .textContent =
        Math.round(
            Number(value) * 100
        ) + "%";

}


/* =========================================================
   VIDEO / MP3 SCREEN
========================================================= */

function isVideoFile(file){

    if(!file) return false;


    return (
        file.type.startsWith("video/") ||
        /\.(mp4|webm|ogg|mov)$/i.test(
            file.name
        )
    );

}


/* =========================================================
   SHOW ACTIVE MEDIA
========================================================= */

async function showDeckMedia(letter){

    const deck =
        state.decks[letter];


    if(!deck || !deck.file) return;


    const screen =
        $("mediaScreen");

    const video =
        $("videoScreen");


    if(isVideoFile(deck.file)){

        screen.classList.add(
            "video-mode"
        );


        /*
           Usamos el mismo archivo del deck.

           El audio sale por Web Audio.

           El video está muteado para no duplicar
           el sonido.
        */

        if(video.src !== deck.objectURL){

            video.src =
                deck.objectURL;

            video.load();

        }


        try{

            video.currentTime =
                deck.audio.currentTime;

        }catch(e){}


        video.classList.add(
            "active"
        );


        video.muted = true;


        try{

            await video.play();

        }catch(e){

            console.log(
                "Video requiere interacción.",
                e
            );

        }


        $("visualStatus")
            .textContent =
            "VIDEO • DJ HUMBERTO";


    }else{

        screen.classList.remove(
            "video-mode"
        );


        video.pause();

        video.classList.remove(
            "active"
        );


        $("visualStatus")
            .textContent =
            "AUDIO • SMART VISUALIZER";

    }

}


/* =========================================================
   SYNC VIDEO
========================================================= */

function syncVideo(){

    const deck =
        state.decks[state.activeDeck];


    const video =
        $("videoScreen");


    if(
        deck &&
        deck.file &&
        isVideoFile(deck.file) &&
        !video.paused
    ){

        const difference =
            Math.abs(
                video.currentTime -
                deck.audio.currentTime
            );


        if(difference > .25){

            try{

                video.currentTime =
                    deck.audio.currentTime;

            }catch(e){}

        }

    }


    requestAnimationFrame(
        syncVideo
    );

}

requestAnimationFrame(syncVideo);


/* =========================================================
   VISUALIZER
========================================================= */

function drawVisualizer(){

    const canvas =
        $("visualizer");

    const ctx =
        canvas.getContext("2d");


    const rect =
        canvas.getBoundingClientRect();


    if(
        canvas.width !==
        Math.floor(rect.width * devicePixelRatio)
    ){

        canvas.width =
            Math.floor(
                rect.width *
                devicePixelRatio
            );

        canvas.height =
            Math.floor(
                rect.height *
                devicePixelRatio
            );

    }


    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    if(!state.analyser){

        requestAnimationFrame(
            drawVisualizer
        );

        return;

    }


    const buffer =
        new Uint8Array(
            state.analyser.frequencyBinCount
        );


    state.analyser.getByteFrequencyData(
        buffer
    );


    const bars = 100;

    const step =
        Math.floor(
            buffer.length / bars
        );


    const width =
        canvas.width / bars;


    for(let i=0;i<bars;i++){

        const value =
            buffer[i * step] / 255;


        const height =
            value *
            canvas.height *
            .7;


        const gradient =
            ctx.createLinearGradient(
                0,
                canvas.height,
                0,
                canvas.height - height
            );


        gradient.addColorStop(
            0,
            "#00eaff"
        );

        gradient.addColorStop(
            .55,
            "#397cff"
        );

        gradient.addColorStop(
            1,
            "#ff2bd6"
        );


        ctx.fillStyle =
            gradient;


        ctx.fillRect(
            i * width,
            canvas.height - height,
            Math.max(1,width - 2),
            height
        );

    }


    requestAnimationFrame(
        drawVisualizer
    );

}


/* =========================================================
   FILE INPUTS
========================================================= */

function setupFileInputs(){

    $("loadA").onclick =
        () => $("fileA").click();

    $("loadB").onclick =
        () => $("fileB").click();

    $("fileA").addEventListener(
        "change",
        async e => {

            const file =
                e.target.files[0];

            if(file){

                await loadFileToDeck(
                    "A",
                    file
                );

            }

            e.target.value = "";

        }
    );


    $("fileB").addEventListener(
        "change",
        async e => {

            const file =
                e.target.files[0];

            if(file){

                await loadFileToDeck(
                    "B",
                    file
                );

            }

            e.target.value = "";

        }
    );

}


/* =========================================================
   LIBRARY
========================================================= */

function addFilesToLibrary(files){

    const valid =
        [...files].filter(
            file =>
                file.type.startsWith("audio/") ||
                file.type.startsWith("video/")
        );


    valid.forEach(file => {

        const exists =
            state.library.some(
                item =>
                    item.file.name === file.name &&
                    item.file.size === file.size
            );


        if(!exists){

            state.library.push({

                id:
                    crypto.randomUUID
                    ? crypto.randomUUID()
                    : Date.now() +
                      Math.random(),

                file,

                analysis: null

            });

        }

    });


    updateLibrary();

    analyzeLibrary();

}


/* =========================================================
   ANALYZE LIBRARY
========================================================= */

async function analyzeLibrary(){

    for(
        const item of state.library
    ){

        if(!item.analysis){

            item.analysis =
                await analyzeTrack(
                    item.file
                );

        }

        updateLibraryItem(
            item
        );

    }


    updateLibraryStats();

}


/* =========================================================
   TRACK ANALYSIS
========================================================= */

async function analyzeTrack(file){

    /*
       El análisis usa Web Audio.

       BPM = estimación de ritmo.

       ENERGY = energía RMS.

       SPECTRAL = distribución de frecuencias.

       GENRE = clasificación aproximada.
    */


    try{

        const buffer =
            await file.arrayBuffer();


        const Offline =
            window.OfflineAudioContext ||
            window.webkitOfflineAudioContext;


        if(!Offline){

            return basicAnalysis(file);

        }


        const temp =
            new Offline(
                1,
                44100 * 30,
                44100
            );


        const audioBuffer =
            await temp.decodeAudioData(
                buffer.slice(0)
            );


        const channel =
            audioBuffer.getChannelData(0);


        const sampleRate =
            audioBuffer.sampleRate;


        /*
           Analizamos máximo 30 segundos.
        */

        const length =
            Math.min(
                channel.length,
                sampleRate * 30
            );


        let sum = 0;

        let zeroCrossings = 0;

        let previous =
            channel[0] || 0;


        const block =
            Math.max(
                1,
                Math.floor(
                    sampleRate / 100
                )
            );


        let envelope = [];

        for(
            let i=0;
            i<length;
            i++
        ){

            const value =
                channel[i];


            sum +=
                value * value;


            if(
                (value >= 0 &&
                 previous < 0) ||
                (value < 0 &&
                 previous >= 0)
            ){

                zeroCrossings++;

            }


            previous =
                value;


            if(i % block === 0){

                envelope.push(
                    Math.abs(value)
                );

            }

        }


        const rms =
            Math.sqrt(
                sum / length
            );


        /*
           ENERGY normalizada.
        */

        const energy =
            Math.max(
                0,
                Math.min(
                    1,
                    rms * 3
                )
            );


        /*
           Estimación sencilla de BPM
           mediante periodicidad de la envolvente.
        */

        const bpm =
            estimateBPM(
                envelope,
                sampleRate / block
            );


        const spectral =
            estimateSpectralCharacter(
                channel,
                sampleRate,
                length
            );


        const genre =
            detectGenre(
                file,
                bpm,
                energy,
                spectral
            );


        return {

            bpm,

            energy,

            genre,

            rhythm:
                classifyRhythm(bpm),

            spectral,

            duration:
                audioBuffer.duration,

            analyzed:
                true

        };


    }catch(error){

        console.warn(
            "No se pudo analizar:",
            file.name,
            error
        );


        return basicAnalysis(file);

    }

}


/* =========================================================
   BASIC ANALYSIS
========================================================= */

function basicAnalysis(file){

    return {

        bpm:
            guessBPMFromName(
                file.name
            ),

        energy:.5,

        genre:
            detectGenreFromName(
                file.name
            ),

        rhythm:"medium",

        spectral:"balanced",

        analyzed:false

    };

}


/* =========================================================
   BPM
========================================================= */

function estimateBPM(
    envelope,
    rate
){

    if(envelope.length < 20){

        return 120;

    }


    let bestLag = 0;

    let bestScore = -Infinity;


    const minBPM = 70;

    const maxBPM = 180;


    const minLag =
        Math.floor(
            rate * 60 / maxBPM
        );


    const maxLag =
        Math.floor(
            rate * 60 / minBPM
        );


    for(
        let lag=minLag;
        lag<=maxLag;
        lag++
    ){

        let score = 0;


        for(
            let i=lag;
            i<envelope.length;
            i++
        ){

            score +=
                envelope[i] *
                envelope[i-lag];

        }


        if(score > bestScore){

            bestScore =
                score;

            bestLag =
                lag;

        }

    }


    if(!bestLag){

        return 120;

    }


    let bpm =
        60 * rate / bestLag;


    /*
       Normalizamos a un rango musical.
    */

    while(bpm < 80){
        bpm *= 2;
    }

    while(bpm > 170){
        bpm /= 2;
    }


    return Math.round(bpm);

}


/* =========================================================
   SPECTRAL CHARACTER
========================================================= */

function estimateSpectralCharacter(
    channel,
    sampleRate,
    length
){

    /*
       Heurística sencilla basada en
       cruces por cero y energía de muestras.
    */

    let high = 0;

    let low = 0;


    const step =
        Math.max(
            1,
            Math.floor(
                length / 12000
            )
        );


    for(
        let i=0;
        i<length;
        i+=step
    ){

        const value =
            Math.abs(
                channel[i]
            );


        if(value > .5){

            high += value;

        }else{

            low += value;

        }

    }


    if(high > low * 1.15){

        return "bright";

    }


    if(low > high * 1.35){

        return "warm";

    }


    return "balanced";

}


/* =========================================================
   GENRE
========================================================= */

function detectGenre(
    file,
    bpm,
    energy,
    spectral
){

    const fromName =
        detectGenreFromName(
            file.name
        );


    if(fromName !== "other"){

        return fromName;

    }


    if(
        bpm >= 118 &&
        energy > .65
    ){

        return "electronic";

    }


    if(
        bpm >= 105 &&
        energy > .55
    ){

        return "dance";

    }


    if(
        bpm >= 90 &&
        bpm <= 120 &&
        spectral === "bright"
    ){

        return "pop";

    }


    if(
        bpm >= 80 &&
        bpm <= 115
    ){

        return "latin";

    }


    return "other";

}


/* =========================================================
   GENRE FROM FILENAME/FOLDER
========================================================= */

function detectGenreFromName(name){

    const n =
        name.toLowerCase();


    if(
        /rock|metal|punk|grunge/.test(n)
    ){
        return "rock";
    }


    if(
        /pop|top40|hits|hit/.test(n)
    ){
        return "pop";
    }


    if(
        /electro|techno|house|trance|edm|deep/.test(n)
    ){
        return "electronic";
    }


    if(
        /dance|club|disco/.test(n)
    ){
        return "dance";
    }


    if(
        /latin|latino|cumbia|reggaeton|salsa|bachata|cuarteto/.test(n)
    ){
        return "latin";
    }


    return "other";

}


/* =========================================================
   BPM FROM NAME
========================================================= */

function guessBPMFromName(name){

    const match =
        name.match(
            /(?:^|\D)([7-9]\d|1[0-7]\d)(?:\D|$)/
        );


    if(match){

        return Number(
            match[1]
        );

    }


    return 120;

}


/* =========================================================
   RHYTHM
========================================================= */

function classifyRhythm(bpm){

    if(bpm < 95){

        return "slow";

    }

    if(bpm < 120){

        return "medium";

    }

    if(bpm < 145){

        return "fast";

    }

    return "very-fast";

}


/* =========================================================
   SMART DJ SCORE
========================================================= */

function smartScore(
    current,
    candidate
){

    if(!candidate.analysis){

        return -999;

    }


    let score = 0;


    /*
       BPM
    */

    const bpmDiff =
        Math.abs(
            current.bpm -
            candidate.analysis.bpm
        );


    score +=
        Math.max(
            0,
            40 -
            bpmDiff * 2
        );


    /*
       GÉNERO
    */

    if(
        current.genre ===
        candidate.analysis.genre
    ){

        score += 25;

    }else{

        /*
           Algunos géneros son
           naturalmente compatibles.
        */

        if(
            (
                current.genre === "pop" &&
                candidate.analysis.genre === "dance"
            ) ||
            (
                current.genre === "dance" &&
                candidate.analysis.genre === "electronic"
            ) ||
            (
                current.genre === "latin" &&
                candidate.analysis.genre === "pop"
            )
        ){

            score += 10;

        }

    }


    /*
       ENERGÍA
    */

    const energyDiff =
        Math.abs(
            current.energy -
            candidate.analysis.energy
        );


    score +=
        Math.max(
            0,
            20 -
            energyDiff * 40
        );


    /*
       RITMO
    */

    if(
        current.rhythm ===
        candidate.analysis.rhythm
    ){

        score += 10;

    }


    /*
       ESPECTRO
    */

    if(
        current.spectral ===
        candidate.analysis.spectral
    ){

        score += 5;

    }


    /*
       EVITAR REPETICIÓN
    */

    if(
        state.history.includes(
            candidate.id
        )
    ){

        score -= 80;

    }


    return score;

}


/* =========================================================
   SMART DJ SELECT
========================================================= */

function chooseSmartNext(){

    const active =
        state.decks[state.activeDeck];


    if(
        !active ||
        !active.analysis
    ){

        return randomLibraryItem();

    }


    const candidates =
        state.library.filter(
            item =>
                item.file !== active.file &&
                item.analysis
        );


    if(!candidates.length){

        return randomLibraryItem();

    }


    const ranked =
        candidates
            .map(
                item => ({

                    item,

                    score:
                        smartScore(
                            active.analysis,
                            {
                                ...item,
                                id:item.id
                            }
                        )

                })
            )
            .sort(
                (a,b) =>
                    b.score - a.score
            );


    /*
       Elegimos entre las mejores
       para evitar que siempre sea
       exactamente la misma canción.
    */

    const top =
        ranked.slice(
            0,
            Math.min(3,ranked.length)
        );


    const selected =
        top[
            Math.floor(
                Math.random() *
                top.length
            )
        ];


    return selected.item;

}


/* =========================================================
   RANDOM
========================================================= */

function randomLibraryItem(){

    if(!state.library.length){

        return null;

    }


    const available =
        state.library.filter(
            item =>
                !state.history.includes(
                    item.id
                )
        );


    const pool =
        available.length
            ? available
            : state.library;


    return pool[
        Math.floor(
            Math.random() *
            pool.length
        )
    ];

}


/* =========================================================
   PRELOAD SMART NEXT
========================================================= */

async function preloadSmartNext(){

    const targetLetter =
        state.activeDeck === "A"
            ? "B"
            : "A";


    const deck =
        state.decks[targetLetter];


    if(
        deck &&
        deck.file &&
        deck.analysis
    ){

        return deck;

    }


    const selected =
        chooseSmartNext();


    if(!selected){

        return null;

    }


    await loadFileToDeck(
        targetLetter,
        selected.file
    );


    $("smartInfo").textContent =
        `${selected.file.name} • ` +
        `${selected.analysis.bpm} BPM • ` +
        `${selected.analysis.genre} • ` +
        `ENERGÍA ${Math.round(selected.analysis.energy * 100)}%`;


    return state.decks[
        targetLetter
    ];

}


/* =========================================================
   AUTOMATIC TRANSITION
========================================================= */

async function prepareAutomaticTransition(
    finishedLetter
){

    if(!state.autoDJ) return;


    const nextLetter =
        finishedLetter === "A"
            ? "B"
            : "A";


    let next =
        state.decks[nextLetter];


    if(
        !next ||
        !next.file
    ){

        next =
            await preloadSmartNext();

    }


    if(
        next &&
        next.file
    ){

        await crossfadeTo(
            finishedLetter,
            nextLetter
        );

    }

}


/* =========================================================
   AUTO DJ
========================================================= */

function startAutoDJ(){

    if(state.autoDJ) return;


    state.autoDJ = true;


    $("autoMixButton")
        .textContent =
        "AUTO DJ ON";


    $("autoMixButton")
        .classList.add("active");


    $("autoLed").style.background =
        "var(--green)";


    preloadSmartNext();


    scheduleAutoDJ();

}


/* =========================================================
   SCHEDULE AUTO DJ
========================================================= */

function scheduleAutoDJ(){

    clearTimeout(
        state.autoTimer
    );

    clearInterval(
        state.countdownTimer
    );


    if(!state.autoDJ) return;


    const seconds =
        Number(
            $("autoMixInterval").value
        );


    state.autoRemaining =
        seconds;


    $("autoCountdown")
        .textContent =
        `PRÓXIMO SMART MIX EN ${seconds}s`;


    state.countdownTimer =
        setInterval(
            () => {

                state.autoRemaining--;

                if(
                    state.autoRemaining <= 0
                ){

                    clearInterval(
                        state.countdownTimer
                    );

                    return;

                }


                $("autoCountdown")
                    .textContent =
                    `PRÓXIMO SMART MIX EN ${state.autoRemaining}s`;

            },
            1000
        );


    state.autoTimer =
        setTimeout(
            async () => {

                if(!state.autoDJ) return;


                const from =
                    state.activeDeck;


                const to =
                    from === "A"
                        ? "B"
                        : "A";


                let target =
                    state.decks[to];


                if(
                    !target ||
                    !target.file
                ){

                    target =
                        await preloadSmartNext();

                }


                if(
                    target &&
                    target.file
                ){

                    await crossfadeTo(
                        from,
                        to
                    );

                }


                if(state.autoDJ){

                    scheduleAutoDJ();

                }

            },
            seconds * 1000
        );

}


/* =========================================================
   STOP AUTO DJ
========================================================= */

function stopAutoDJ(){

    state.autoDJ = false;


    clearTimeout(
        state.autoTimer
    );

    clearInterval(
        state.countdownTimer
    );


    $("autoMixButton")
        .textContent =
        "AUTO DJ OFF";


    $("autoMixButton")
        .classList.remove("active");


    $("autoLed").style.background =
        "var(--red)";


    $("autoCountdown")
        .textContent =
        "AUTO DJ DETENIDO";

}


/* =========================================================
   HISTORY
========================================================= */

function addHistory(file){

    const item =
        state.library.find(
            x =>
                x.file === file
        );


    if(!item) return;


    state.history =
        state.history.filter(
            id =>
                id !== item.id
        );


    state.history.unshift(
        item.id
    );


    state.history =
        state.history.slice(
            0,
            CONFIG.maxHistory
        );

}


/* =========================================================
   LIBRARY UI
========================================================= */

function updateLibrary(){

    const list =
        $("libraryList");


    if(!state.library.length){

        list.innerHTML =
            `<div class="empty-library">
                Carga archivos o una carpeta musical.
             </div>`;

        updateLibraryStats();

        return;

    }


    renderLibrary();

}


function renderLibrary(){

    const list =
        $("libraryList");


    const filtered =
        state.library.filter(
            item =>
                state.genreFilter === "all" ||
                (
                    item.analysis &&
                    item.analysis.genre ===
                    state.genreFilter
                )
        );


    list.innerHTML = "";


    filtered.forEach(
        (item,index) => {

            const a =
                item.analysis;


            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "library-item";


            row.innerHTML = `

                <div class="library-number">
                    ${index + 1}
                </div>

                <div class="library-name">

                    <strong>
                        ${escapeHTML(
                            item.file.name
                        )}
                    </strong>

                    <span>
                        ${
                            a
                            ? `${a.genre.toUpperCase()} • ${a.rhythm}`
                            : "ANALIZANDO..."
                        }
                    </span>

                </div>

                <div class="library-meta">

                    ${
                        a
                        ? `
                        <span class="tag bpm">
                            ${a.bpm} BPM
                        </span>

                        <span class="tag energy">
                            ${Math.round(a.energy*100)}%
                        </span>
                        `
                        : ""
                    }

                    <button
                        class="library-play"
                        data-id="${item.id}">
                        LOAD
                    </button>

                </div>

            `;


            row.querySelector(
                ".library-play"
            ).addEventListener(
                "click",
                async () => {

                    const letter =
                        state.activeDeck === "A"
                            ? "B"
                            : "A";


                    await loadFileToDeck(
                        letter,
                        item.file
                    );


                    await playDeck(
                        letter
                    );

                }
            );


            list.appendChild(
                row
            );

        }
    );


    updateLibraryStats();

}


function updateLibraryItem(item){

    renderLibrary();

}


/* =========================================================
   STATS
========================================================= */

function updateLibraryStats(){

    $("libraryCount")
        .textContent =
        state.library.length;


    const analyzed =
        state.library.filter(
            x => x.analysis
        ).length;


    $("analyzedCount")
        .textContent =
        analyzed;


    const genres =
        new Set(
            state.library
                .filter(
                    x => x.analysis
                )
                .map(
                    x =>
                        x.analysis.genre
                )
        );


    $("genreCount")
        .textContent =
        genres.size;

}


/* =========================================================
   VOICE ID
========================================================= */

function setupVoiceID(){

    $("voiceFilesButton")
        .addEventListener(
            "click",
            () =>
                $("voiceFiles").click()
        );


    $("voiceFiles")
        .addEventListener(
            "change",
            event => {

                state.voiceFiles =
                    [...event.target.files]
                        .filter(
                            file =>
                                file.type.startsWith(
                                    "audio/"
                                )
                        );


                $("voiceFileName")
                    .textContent =
                    state.voiceFiles.length
                    ? `${state.voiceFiles.length} VOICE ID CARGADOS`
                    : "SIN ARCHIVOS";


                if(state.voiceFiles.length){

                    startVoiceTimer();

                }

            }
        );


    $("voiceRandom")
        .addEventListener(
            "click",
            playVoiceID
        );

}


/* =========================================================
   VOICE TIMER
========================================================= */

function startVoiceTimer(){

    clearInterval(
        state.voiceTimer
    );


    const minutes =
        Number(
            $("voiceInterval").value
        );


    state.voiceTimer =
        setInterval(
            () => {

                if(
                    !state.voicePlaying &&
                    state.voiceFiles.length
                ){

                    playVoiceID();

                }

            },
            minutes * 60 * 1000
        );

}


/* =========================================================
   VOICE ID PLAY
========================================================= */

async function playVoiceID(){

    if(
        state.voicePlaying ||
        !state.voiceFiles.length
    ){

        return;

    }


    await startAudioEngine();


    state.voicePlaying = true;


    const file =
        state.voiceFiles[
            Math.floor(
                Math.random() *
                state.voiceFiles.length
            )
        ];


    const url =
        URL.createObjectURL(
            file
        );


    const voice =
        new Audio(url);


    voice.volume =
        Number(
            $("voiceVolume").value
        );


    /*
       Ducking de los decks.
    */

    const duck =
        Number(
            $("voiceDucking").value
        );


    const originalA =
        state.decks.A
            ? state.decks.A.volumeGain.gain.value
            : 1;


    const originalB =
        state.decks.B
            ? state.decks.B.volumeGain.gain.value
            : 1;


    if(state.decks.A){

        state.decks.A.volumeGain.gain.value =
            originalA * duck;

    }


    if(state.decks.B){

        state.decks.B.volumeGain.gain.value =
            originalB * duck;

    }


    $("voiceLed").style.background =
        "var(--cyan)";


    try{

        await voice.play();


        await new Promise(
            resolve => {

                voice.onended =
                    resolve;

            }
        );

    }catch(error){

        console.error(
            "Voice ID:",
            error
        );

    }


    /*
       Restaurar música.
    */

    if(state.decks.A){

        state.decks.A.volumeGain.gain.value =
            originalA;

    }


    if(state.decks.B){

        state.decks.B.volumeGain.gain.value =
            originalB;

    }


    URL.revokeObjectURL(
        url
    );


    state.voicePlaying = false;


    $("voiceLed").style.background =
        "var(--green)";

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value){

    return String(value)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");

}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents(){

    $("startEngine")
        .addEventListener(
            "click",
            async () => {

                await startAudioEngine();

                $("bootScreen")
                    .classList.add(
                        "hidden"
                    );

            }
        );


    $("playA")
        .addEventListener(
            "click",
            () => playDeck("A")
        );


    $("playB")
        .addEventListener(
            "click",
            () => playDeck("B")
        );


    $("stopA")
        .addEventListener(
            "click",
            () => stopDeck("A")
        );


    $("stopB")
        .addEventListener(
            "click",
            () => stopDeck("B")
        );


    $("stopAll")
        .addEventListener(
            "click",
            stopAll
        );


    $("crossfader")
        .addEventListener(
            "input",
            updateCrossfader
        );


    $("masterVolume")
        .addEventListener(
            "input",
            e =>
                setMaster(
                    e.target.value
                )
        );


    ["A","B"].forEach(
        letter => {


            $("volume" + letter)
                .addEventListener(
                    "input",
                    e => {

                        const deck =
                            state.decks[
                                letter
                            ];

                        if(deck){

                            deck.volumeGain.gain.value =
                                Number(
                                    e.target.value
                                );

                        }


                        $("volumeValue" + letter)
                            .textContent =
                            Math.round(
                                Number(
                                    e.target.value
                                ) * 100
                            ) + "%";

                    }
                );


            $("pitch" + letter)
                .addEventListener(
                    "input",
                    e =>
                        setPitch(
                            letter,
                            e.target.value
                        )
                );


            ["low","mid","high"]
                .forEach(
                    band => {

                        $(band + letter)
                            .addEventListener(
                                "input",
                                e =>
                                    setEQ(
                                        letter,
                                        band,
                                        e.target.value
                                    )
                            );

                    }
                );

        }
    );


    $("autoMixButton")
        .addEventListener(
            "click",
            () => {

                if(state.autoDJ){

                    stopAutoDJ();

                }else{

                    startAutoDJ();

                }

            }
        );


    $("autoMixInterval")
        .addEventListener(
            "change",
            () => {

                if(state.autoDJ){

                    scheduleAutoDJ();

                }

            }
        );


    $("crossfadeDuration")
        .addEventListener(
            "change",
            e => {

                state.crossfadeSeconds =
                    Number(
                        e.target.value
                    );

            }
        );


    $("smartNext")
        .addEventListener(
            "click",
            async () => {

                const deck =
                    await preloadSmartNext();


                if(deck){

                    $("smartInfo")
                        .textContent =
                        `${deck.file.name} • ` +
                        `${deck.analysis.bpm} BPM • ` +
                        `${deck.analysis.genre.toUpperCase()}`;

                }

            }
        );


    $("libraryLoad")
        .addEventListener(
            "click",
            () =>
                $("libraryFiles").click()
        );


    $("folderLoad")
        .addEventListener(
            "click",
            () =>
                $("folderFiles").click()
        );


    $("libraryFiles")
        .addEventListener(
            "change",
            e => {

                addFilesToLibrary(
                    e.target.files
                );

                e.target.value = "";

            }
        );


    $("folderFiles")
        .addEventListener(
            "change",
            e => {

                addFilesToLibrary(
                    e.target.files
                );

                e.target.value = "";

            }
        );


    document
        .querySelectorAll(".genre-btn")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        document
                            .querySelectorAll(
                                ".genre-btn"
                            )
                            .forEach(
                                x =>
                                    x.classList.remove(
                                        "active"
                                    )
                            );


                        button.classList.add(
                            "active"
                        );


                        state.genreFilter =
                            button.dataset.genre;


                        renderLibrary();

                    }
                );

            }
        );


    $("voiceInterval")
        .addEventListener(
            "change",
            startVoiceTimer
        );

}


/* =========================================================
   INIT
========================================================= */

setupFileInputs();

setupVoiceID();

setupEvents();


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if(
            event.target.tagName ===
            "INPUT"
        ){

            return;

        }


        if(event.code === "Space"){

            event.preventDefault();

            playDeck(
                state.activeDeck
            );

        }


        if(event.key.toLowerCase() === "a"){

            state.activeDeck = "A";

        }


        if(event.key.toLowerCase() === "b"){

            state.activeDeck = "B";

        }

    }
);


/* =========================================================
   READY
========================================================= */

$("smartInfo").textContent =
    "SMART DJ LISTO • CARGA TU BIBLIOTECA";


console.log(
    "HC PRO DJ HUMBERTO — SMART DJ SYSTEM READY"
);
