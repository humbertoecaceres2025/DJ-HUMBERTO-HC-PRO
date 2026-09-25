"use strict";

/* =====================================================
   DJ HUMBERTO 3.3 PRO
===================================================== */

const $ = id => document.getElementById(id);

const STATE = {

    started:false,

    audio:null,

    master:null,

    analyser:null,

    recordDestination:null,

    recorder:null,

    recordingChunks:[],

    micStream:null,

    autoMix:false,

    autoVoice:false,

    mixTimer:null,

    voiceTimer:null,

    voiceMinutes:0,

    voiceBuffer:null,

    activeDeck:"A",

    library:[],

    decks:{}

};


/* =====================================================
   UTILIDADES
===================================================== */

function formatTime(seconds){

    seconds = Math.max(
        0,
        Math.floor(seconds || 0)
    );

    const minutes =
        Math.floor(seconds / 60);

    const secs =
        seconds % 60;

    return (
        String(minutes).padStart(2,"0")
        + ":" +
        String(secs).padStart(2,"0")
    );
}


function cleanName(filename){

    return filename.replace(
        /\.[^/.]+$/,
        ""
    );

}


function random(min,max){

    return Math.floor(
        Math.random() *
        (max-min+1)
    ) + min;

}


function escapeHTML(text){

    return String(text).replace(
        /[&<>"']/g,
        char => ({
            "&":"&amp;",
            "<":"&lt;",
            ">":"&gt;",
            '"':"&quot;",
            "'":"&#039;"
        }[char])
    );

}


/* =====================================================
   RELOJ
===================================================== */

function updateClock(){

    try{

        $("clock").textContent =
            new Intl.DateTimeFormat(
                "es-AR",
                {
                    hour:"2-digit",
                    minute:"2-digit",
                    second:"2-digit",
                    hour12:false,
                    timeZone:
                        "America/Argentina/La_Rioja"
                }
            ).format(new Date());

    }catch(error){

        $("clock").textContent =
            new Date().toLocaleTimeString(
                "es-AR",
                {
                    hour12:false
                }
            );

    }

}


/* =====================================================
   IMPULSE RESPONSE REVERB
===================================================== */

function createImpulse(){

    const seconds = 1.3;

    const length =
        STATE.audio.sampleRate *
        seconds;

    const buffer =
        STATE.audio.createBuffer(
            2,
            length,
            STATE.audio.sampleRate
        );

    for(
        let channel=0;
        channel<2;
        channel++
    ){

        const data =
            buffer.getChannelData(
                channel
            );

        for(
            let i=0;
            i<length;
            i++
        ){

            data[i] =
                (
                    Math.random()*2-1
                ) *
                Math.pow(
                    1-i/length,
                    3
                );

        }

    }

    return buffer;

}


/* =====================================================
   INICIAR
===================================================== */

async function startSystem(){

    if(STATE.started){

        return;

    }

    try{

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if(!AudioContext){

            throw new Error(
                "Web Audio no disponible"
            );

        }

        STATE.audio =
            new AudioContext();


        /* MASTER */

        STATE.master =
            STATE.audio.createGain();

        STATE.master.gain.value =
            .85;


        /* ANALYSER */

        STATE.analyser =
            STATE.audio.createAnalyser();

        STATE.analyser.fftSize =
            1024;


        /* RECORD */

        STATE.recordDestination =
            STATE.audio.createMediaStreamDestination();


        STATE.master.connect(
            STATE.analyser
        );


        STATE.analyser.connect(
            STATE.audio.destination
        );


        STATE.master.connect(
            STATE.recordDestination
        );


        /* DECKS */

        createDeck("A");

        createDeck("B");


        await STATE.audio.resume();


        STATE.started =
            true;


        $("systemStatus").textContent =
            "● SYSTEM ONLINE";


        $("bootMessage").textContent =
            "Audio activado";


        $("boot").style.display =
            "none";


        startVisualizer();


    }catch(error){

        console.error(error);

        $("bootMessage").textContent =
            "Pulsa nuevamente para activar el audio.";

    }

}


/* =====================================================
   CREAR DECK
===================================================== */

function createDeck(deckName){

    const audioElement =
        deckName === "A"
            ? $("audioA")
            : $("audioB");


    const source =
        STATE.audio.createMediaElementSource(
            audioElement
        );


    const input =
        STATE.audio.createGain();


    /* EQ */

    const low =
        STATE.audio.createBiquadFilter();

    low.type =
        "lowshelf";

    low.frequency.value =
        180;


    const mid =
        STATE.audio.createBiquadFilter();

    mid.type =
        "peaking";

    mid.frequency.value =
        1000;

    mid.Q.value =
        1;


    const high =
        STATE.audio.createBiquadFilter();

    high.type =
        "highshelf";

    high.frequency.value =
        4500;


    /* FILTER */

    const filter =
        STATE.audio.createBiquadFilter();

    filter.type =
        "lowpass";

    filter.frequency.value =
        20000;


    /* ECHO */

    const delay =
        STATE.audio.createDelay(2);

    delay.delayTime.value =
        .25;


    const feedback =
        STATE.audio.createGain();

    feedback.gain.value =
        0;


    const echoWet =
        STATE.audio.createGain();

    echoWet.gain.value =
        0;


    /* REVERB */

    const reverb =
        STATE.audio.createConvolver();

    reverb.buffer =
        createImpulse();


    const reverbWet =
        STATE.audio.createGain();

    reverbWet.gain.value =
        0;


    /* FLANGER */

    const flanger =
        STATE.audio.createDelay();

    flanger.delayTime.value =
        .012;


    const flangerWet =
        STATE.audio.createGain();

    flangerWet.gain.value =
        0;


    /* CADENA PRINCIPAL */

    source
        .connect(low)
        .connect(mid)
        .connect(high)
        .connect(input)
        .connect(filter);


    filter.connect(
        STATE.master
    );


    /* ECHO */

    filter.connect(
        delay
    );

    delay.connect(
        feedback
    );

    feedback.connect(
        delay
    );

    delay.connect(
        echoWet
    );

    echoWet.connect(
        STATE.master
    );


    /* REVERB */

    filter.connect(
        reverb
    );

    reverb.connect(
        reverbWet
    );

    reverbWet.connect(
        STATE.master
    );


    /* FLANGER */

    filter.connect(
        flanger
    );

    flanger.connect(
        flangerWet
    );

    flangerWet.connect(
        STATE.master
    );


    STATE.decks[deckName] = {

        audio:audioElement,

        source,

        input,

        low,

        mid,

        high,

        filter,

        delay,

        feedback,

        echoWet,

        reverb,

        reverbWet,

        flanger,

        flangerWet,

        file:null,

        url:null,

        bpm:null,

        key:null,

        energy:null,

        effects:{
            filter:false,
            echo:false,
            reverb:false,
            flanger:false
        }

    };


    audioElement.addEventListener(
        "play",
        () => {

            setDeckPlaying(
                deckName,
                true
            );

            STATE.activeDeck =
                deckName;

            updateNowPlaying(
                deckName
            );

        }
    );


    audioElement.addEventListener(
        "pause",
        () => {

            setDeckPlaying(
                deckName,
                false
            );

        }
    );


    audioElement.addEventListener(
        "timeupdate",
        () => {

            updateTime(
                deckName
            );

        }
    );


    audioElement.addEventListener(
        "ended",
        () => {

            setDeckPlaying(
                deckName,
                false
            );

        }
    );

}


/* =====================================================
   CARGAR PISTA
===================================================== */

function loadTrack(
    file,
    deckName
){

    if(!file){

        return;

    }


    if(!STATE.started){

        $("bootMessage").textContent =
            "Pulsa INICIAR DJ HUMBERTO primero.";

        return;

    }


    const deck =
        STATE.decks[deckName];


    if(!deck){

        return;

    }


    if(deck.url){

        URL.revokeObjectURL(
            deck.url
        );

    }


    deck.url =
        URL.createObjectURL(
            file
        );

    deck.file =
        file;

    deck.audio.src =
        deck.url;

    deck.audio.load();


    /* DATOS DJ */

    deck.bpm =
        random(90,150);

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

    deck.key =
        keys[
            random(
                0,
                keys.length-1
            )
        ];

    deck.energy =
        random(40,100);


    $("title"+deckName)
        .textContent =
        cleanName(file.name);


    $("info"+deckName)
        .textContent =
        `BPM ${deck.bpm} • KEY ${deck.key} • ENERGY ${deck.energy}%`;


    $("deckStatus"+deckName)
        .textContent =
        "LOADED";


    updateSmart(
        deckName
    );

}


/* =====================================================
   PLAY
===================================================== */

async function playDeck(
    deckName
){

    const deck =
        STATE.decks[deckName];


    if(
        !deck ||
        !deck.file
    ){

        $("bootMessage").textContent =
            "Carga una pista primero.";

        return;

    }


    try{

        await STATE.audio.resume();

        await deck.audio.play();

        STATE.activeDeck =
            deckName;

    }catch(error){

        console.error(error);

    }

}


/* =====================================================
   STOP
===================================================== */

function stopDeck(
    deckName
){

    const deck =
        STATE.decks[deckName];


    if(!deck){

        return;

    }


    deck.audio.pause();

    deck.audio.currentTime =
        0;

}


/* =====================================================
   ESTADO DECK
===================================================== */

function setDeckPlaying(
    deckName,
    playing
){

    const deck =
        $("deck"+deckName);

    deck.classList.toggle(
        "playing",
        playing
    );


    $("deckStatus"+deckName)
        .textContent =
        playing
            ? "PLAYING"
            : "READY";

}


/* =====================================================
   NOW PLAYING
===================================================== */

function updateNowPlaying(
    deckName
){

    const deck =
        STATE.decks[deckName];


    if(
        !deck ||
        !deck.file
    ){

        return;

    }


    $("nowPlaying")
        .textContent =
        cleanName(
            deck.file.name
        );


    $("nowInfo")
        .textContent =
        `DECK ${deckName} • ${deck.bpm} BPM • ${deck.key}`;


    updateSmart(
        deckName
    );

}


/* =====================================================
   TIME
===================================================== */

function updateTime(
    deckName
){

    const deck =
        STATE.decks[deckName];


    $("time"+deckName)
        .textContent =
        formatTime(
            deck.audio.currentTime
        );


    if(
        deck.audio.duration &&
        Number.isFinite(
            deck.audio.duration
        )
    ){

        $("seek"+deckName).value =
            (
                deck.audio.currentTime /
                deck.audio.duration
            ) * 100;

    }

}


/* =====================================================
   VOLUMEN
===================================================== */

function updateVolume(
    deckName
){

    const value =
        Number(
            $("volume"+deckName).value
        );


    $("volume"+deckName+"Value")
        .textContent =
        value + "%";


    updateCrossfader();

}


/* =====================================================
   CROSS FADER
===================================================== */

function updateCrossfader(){

    if(
        !STATE.decks.A ||
        !STATE.decks.B
    ){

        return;

    }


    const cross =
        Number(
            $("crossfader").value
        ) / 100;


    const volumeA =
        Number(
            $("volumeA").value
        ) / 100;


    const volumeB =
        Number(
            $("volumeB").value
        ) / 100;


    /*
       Curva suave:
       A = izquierda
       B = derecha
    */

    STATE.decks.A.input.gain.value =
        Math.cos(
            cross *
            Math.PI /
            2
        ) *
        volumeA;


    STATE.decks.B.input.gain.value =
        Math.sin(
            cross *
            Math.PI /
            2
        ) *
        volumeB;


    $("crossValue")
        .textContent =
        Math.round(
            cross * 100
        ) + "%";

}


/* =====================================================
   PITCH
===================================================== */

function updatePitch(
    deckName
){

    const deck =
        STATE.decks[deckName];


    const value =
        Number(
            $("pitch"+deckName).value
        );


    deck.audio.playbackRate =
        1 + value / 100;


    $("pitch"+deckName+"Value")
        .textContent =
        value + "%";

}


/* =====================================================
   SEEK
===================================================== */

function updateSeek(
    deckName
){

    const deck =
        STATE.decks[deckName];


    if(
        !deck.audio.duration
    ){

        return;

    }


    deck.audio.currentTime =
        deck.audio.duration *
        Number(
            $("seek"+deckName).value
        ) / 100;

}


/* =====================================================
   MASTER
===================================================== */

function updateMaster(){

    const value =
        Number(
            $("master").value
        );


    STATE.master.gain.value =
        value / 100;


    $("masterValue")
        .textContent =
        value + "%";

}


/* =====================================================
   EQ
===================================================== */

function updateEQ(){

    ["A","B"].forEach(
        deckName => {

            const deck =
                STATE.decks[deckName];

            if(!deck){

                return;

            }


            deck.low.gain.value =
                Number(
                    $("eqLow").value
                );


            deck.mid.gain.value =
                Number(
                    $("eqMid").value
                );


            deck.high.gain.value =
                Number(
                    $("eqHigh").value
                );

        }
    );

}


/* =====================================================
   EFECTOS INDIVIDUALES
===================================================== */

function toggleEffect(
    deckName,
    effect
){

    const deck =
        STATE.decks[deckName];


    if(!deck){

        return;

    }


    deck.effects[effect] =
        !deck.effects[effect];


    const button =
        document.querySelector(
            `[data-deck="${deckName}"][data-effect="${effect}"]`
        );


    button.classList.toggle(
        "active",
        deck.effects[effect]
    );


    if(effect === "filter"){

        deck.filter.frequency =
            deck.effects.filter
                ? 1200
                : 20000;

    }


    if(effect === "echo"){

        deck.echoWet.gain.value =
            deck.effects.echo
                ? .45
                : 0;

        deck.feedback.gain.value =
            deck.effects.echo
                ? .32
                : 0;

    }


    if(effect === "reverb"){

        deck.reverbWet.gain.value =
            deck.effects.reverb
                ? .35
                : 0;

    }


    if(effect === "flanger"){

        deck.flangerWet.gain.value =
            deck.effects.flanger
                ? .30
                : 0;

    }

}


/* =====================================================
   FX MIX
===================================================== */

function updateFXMix(
    deckName
){

    const deck =
        STATE.decks[deckName];


    const mix =
        Number(
            $("fxMix"+deckName).value
        ) / 100;


    if(deck.effects.echo){

        deck.echoWet.gain.value =
            mix * .7;

    }


    if(deck.effects.reverb){

        deck.reverbWet.gain.value =
            mix * .6;

    }


    if(deck.effects.flanger){

        deck.flangerWet.gain.value =
            mix * .5;

    }

}


/* =====================================================
   SMART DJ
===================================================== */

function updateSmart(
    deckName
){

    const deck =
        STATE.decks[deckName];


    if(!deck){

        return;

    }


    $("smartBpm")
        .textContent =
        deck.bpm || "--";


    $("smartKey")
        .textContent =
        deck.key || "--";


    $("smartEnergy")
        .textContent =
        deck.energy
            ? deck.energy + "%"
            : "--";

}


/* =====================================================
   SMART NEXT
===================================================== */

function smartNext(){

    if(!STATE.library.length){

        $("smartStatus").textContent =
            "AGREGA MÚSICA";

        return;

    }


    const nextDeck =
        STATE.activeDeck === "A"
            ? "B"
            : "A";


    const item =
        STATE.library[
            random(
                0,
                STATE.library.length-1
            )
        ];


    loadTrack(
        item.file,
        nextDeck
    );


    $("nextTrack")
        .textContent =
        cleanName(
            item.file.name
        );


    $("smartStatus")
        .textContent =
        `NEXT → DECK ${nextDeck}`;

}


/* =====================================================
   AUTOMIX
===================================================== */

function toggleAutoMix(){

    STATE.autoMix =
        !STATE.autoMix;


    const button =
        $("autoMixButton");


    button.classList.toggle(
        "active",
        STATE.autoMix
    );


    button.textContent =
        STATE.autoMix
            ? "🔀 AUTOMIX ON"
            : "🔀 AUTOMIX OFF";


    clearInterval(
        STATE.mixTimer
    );


    if(STATE.autoMix){

        $("autoMixStatus")
            .textContent =
            "Automix funcionando";

        checkAutoMix();

        STATE.mixTimer =
            setInterval(
                checkAutoMix,
                1000
            );

    }else{

        $("autoMixStatus")
            .textContent =
            "Automix detenido";

    }

}


/* =====================================================
   CONTROL AUTOMIX
===================================================== */

function checkAutoMix(){

    const current =
        STATE.decks[
            STATE.activeDeck
        ];


    if(
        !current ||
        !current.file ||
        !current.audio.duration
    ){

        return;

    }


    const transitionSeconds =
        Number(
            $("mixDuration").value
        );


    const remaining =
        current.audio.duration -
        current.audio.currentTime;


    if(
        remaining <=
        transitionSeconds
    ){

        const nextDeck =
            STATE.activeDeck === "A"
                ? "B"
                : "A";


        if(
            !STATE.decks[
                nextDeck
            ].file
        ){

            loadSmartTrack(
                nextDeck
            );

        }


        if(
            STATE.decks[
                nextDeck
            ].file
        ){

            startAutomaticMix(
                nextDeck,
                transitionSeconds
            );

        }

    }

}


/* =====================================================
   CARGA INTELIGENTE
===================================================== */

function loadSmartTrack(
    deckName
){

    if(
        !STATE.library.length
    ){

        return;

    }


    const currentName =
        STATE.decks[
            deckName
        ].file?.name;


    let available =
        STATE.library.filter(
            item =>
                item.file.name !==
                currentName
        );


    if(
        !available.length
    ){

        available =
            STATE.library;

    }


    const item =
        available[
            random(
                0,
                available.length-1
            )
        ];


    loadTrack(
        item.file,
        deckName
    );


    $("nextTrack")
        .textContent =
        cleanName(
            item.file.name
        );

}


/* =====================================================
   TRANSICIÓN AUTOMÁTICA
===================================================== */

function startAutomaticMix(
    nextDeck,
    seconds
){

    const currentDeck =
        STATE.activeDeck === "A"
            ? "B"
            : "A";


    const next =
        STATE.decks[
            nextDeck
        ];


    if(
        !next ||
        !next.file
    ){

        return;

    }


    playDeck(
        nextDeck
    );


    const start =
        Date.now();


    const duration =
        seconds * 1000;


    const timer =
        setInterval(
            () => {

                const progress =
                    Math.min(
                        1,
                        (
                            Date.now() -
                            start
                        ) /
                        duration
                    );


                /*
                   A → B
                */

                if(nextDeck === "B"){

                    $("crossfader").value =
                        progress * 100;

                }else{

                    $("crossfader").value =
                        100 -
                        progress * 100;

                }


                updateCrossfader();


                if(progress >= 1){

                    clearInterval(
                        timer
                    );


                    stopDeck(
                        currentDeck
                    );


                    STATE.activeDeck =
                        nextDeck;

                }

            },
            100
        );

}


/* =====================================================
   BIBLIOTECA
===================================================== */

function addMusicFiles(
    files
){

    Array.from(files).forEach(
        file => {

            STATE.library.push({
                file
            });

        }
    );


    renderLibrary();

}


function renderLibrary(){

    const library =
        $("library");


    $("trackCount")
        .textContent =
        STATE.library.length +
        " PISTAS";


    library.innerHTML =
        "";


    if(
        !STATE.library.length
    ){

        library.innerHTML =
            `
            <div class="library-empty">
                No hay pistas cargadas.
            </div>
            `;

        return;

    }


    STATE.library.forEach(
        item => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "library-item";


            element.innerHTML =
                `
                <strong>
                    ${escapeHTML(
                        cleanName(
                            item.file.name
                        )
                    )}
                </strong>

                <small>
                    ${escapeHTML(
                        item.file.type ||
                        "audio"
                    )}
                    •
                    ${
                        (
                            item.file.size /
                            1048576
                        ).toFixed(1)
                    }
                    MB
                </small>
                `;


            element.addEventListener(
                "click",
                () => {

                    loadTrack(
                        item.file,
                        STATE.activeDeck
                    );

                }
            );


            library.appendChild(
                element
            );

        }
    );

}


/* =====================================================
   SHUFFLE
===================================================== */

function shuffleLibrary(){

    for(
        let i =
            STATE.library.length - 1;
        i > 0;
        i--
    ){

        const j =
            random(
                0,
                i
            );


        [
            STATE.library[i],
            STATE.library[j]
        ] =
        [
            STATE.library[j],
            STATE.library[i]
        ];

    }


    renderLibrary();

}


/* =====================================================
   VOICE ID
===================================================== */

async function loadVoiceID(
    file
){

    if(
        !file ||
        !STATE.audio
    ){

        return;

    }


    try{

        const buffer =
            await file.arrayBuffer();


        STATE.voiceBuffer =
            await STATE.audio.decodeAudioData(
                buffer
            );


        $("voiceReady")
            .textContent =
            "ID LISTO";


        $("voiceStatus")
            .textContent =
            "Voice ID cargado";

    }catch(error){

        console.error(error);

        $("voiceStatus")
            .textContent =
            "Error al cargar ID";

    }

}


/* =====================================================
   REPRODUCIR VOICE ID
===================================================== */

function playVoiceID(){

    if(
        !STATE.voiceBuffer ||
        !STATE.audio
    ){

        $("voiceStatus")
            .textContent =
            "Primero carga un Voice ID";

        return;

    }


    const source =
        STATE.audio.createBufferSource();


    const gain =
        STATE.audio.createGain();


    source.buffer =
        STATE.voiceBuffer;


    gain.gain.value =
        .70;


    source
        .connect(gain)
        .connect(STATE.master);


    source.start();


    $("voiceReady")
        .textContent =
        "PLAYING";

}


/* =====================================================
   VOICE ID AUTOMÁTICO
===================================================== */

function toggleAutoVoice(){

    STATE.autoVoice =
        !STATE.autoVoice;


    const button =
        $("autoVoiceButton");


    button.classList.toggle(
        "active",
        STATE.autoVoice
    );


    button.textContent =
        STATE.autoVoice
            ? "🎙 VOICE ID ON"
            : "🎙 VOICE ID OFF";


    clearInterval(
        STATE.voiceTimer
    );


    STATE.voiceMinutes =
        0;


    if(
        STATE.autoVoice
    ){

        $("voiceStatus")
            .textContent =
            "Voice ID automático activo";


        STATE.voiceTimer =
            setInterval(
                voiceMinuteTick,
                60000
            );

    }else{

        $("voiceStatus")
            .textContent =
            "Voice ID automático detenido";

    }

}


function voiceMinuteTick(){

    STATE.voiceMinutes++;


    const interval =
        Number(
            $("voiceInterval").value
        );


    if(
        STATE.voiceMinutes >=
        interval
    ){

        STATE.voiceMinutes =
            0;


        playVoiceID();

    }

}


/* =====================================================
   GRABACIÓN
===================================================== */

function toggleRecording(){

    if(
        !STATE.recordDestination
    ){

        return;

    }


    if(
        STATE.recorder
    ){

        STATE.recorder.stop();

        STATE.recorder =
            null;


        $("recordButton")
            .textContent =
            "● GRABAR";

        return;

    }


    STATE.recordingChunks =
        [];


    let options = {};


    if(
        window.MediaRecorder &&
        MediaRecorder.isTypeSupported &&
        MediaRecorder.isTypeSupported(
            "audio/webm;codecs=opus"
        )
    ){

        options.mimeType =
            "audio/webm;codecs=opus";

    }


    try{

        STATE.recorder =
            new MediaRecorder(
                STATE.recordDestination.stream,
                options
            );

    }catch(error){

        STATE.recorder =
            new MediaRecorder(
                STATE.recordDestination.stream
            );

    }


    STATE.recorder.ondataavailable =
        event => {

            if(
                event.data.size
            ){

                STATE.recordingChunks.push(
                    event.data
                );

            }

        };


    STATE.recorder.onstop =
        saveRecording;


    STATE.recorder.start();


    $("recordButton")
        .textContent =
        "■ DETENER";

}


/* =====================================================
   GUARDAR GRABACIÓN
===================================================== */

function saveRecording(){

    const blob =
        new Blob(
            STATE.recordingChunks,
            {
                type:
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
        "DJ-HUMBERTO-MIX.webm";


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    setTimeout(
        () => {

            URL.revokeObjectURL(
                url
            );

        },
        1000
    );

}


/* =====================================================
   MICRÓFONO
===================================================== */

async function toggleMicrophone(){

    if(
        STATE.micStream
    ){

        STATE.micStream
            .getTracks()
            .forEach(
                track =>
                    track.stop()
            );


        STATE.micStream =
            null;


        $("micButton")
            .textContent =
            "🎤 MIC OFF";

        return;

    }


    try{

        STATE.micStream =
            await navigator
                .mediaDevices
                .getUserMedia({
                    audio:true
                });


        const source =
            STATE.audio
                .createMediaStreamSource(
                    STATE.micStream
                );


        const gain =
            STATE.audio.createGain();


        gain.gain.value =
            .70;


        source
            .connect(gain)
            .connect(
                STATE.master
            );


        $("micButton")
            .textContent =
            "🎤 MIC ON";

    }catch(error){

        console.error(error);

        $("bootMessage")
            .textContent =
            "No se pudo activar el micrófono.";

    }

}


/* =====================================================
   VISUALIZADOR
===================================================== */

function startVisualizer(){

    const canvas =
        $("visualizer");


    const context =
        canvas.getContext(
            "2d"
        );


    const data =
        new Uint8Array(
            STATE.analyser
                .frequencyBinCount
        );


    function resize(){

        const ratio =
            window.devicePixelRatio ||
            1;


        canvas.width =
            canvas.clientWidth *
            ratio;


        canvas.height =
            canvas.clientHeight *
            ratio;


        context.setTransform(
            ratio,
            0,
            0,
            ratio,
            0,
            0
        );

    }


    resize();


    window.addEventListener(
        "resize",
        resize
    );


    function draw(){

        requestAnimationFrame(
            draw
        );


        const width =
            canvas.clientWidth;


        const height =
            canvas.clientHeight;


        context.clearRect(
            0,
            0,
            width,
            height
        );


        STATE.analyser
            .getByteFrequencyData(
                data
            );


        const bars =
            100;


        let total = 0;


        for(
            let i=0;
            i<bars;
            i++
        ){

            const index =
                Math.floor(
                    i *
                    data.length /
                    bars
                );


            const value =
                data[index] /
                255;


            total +=
                value;


            const barHeight =
                value *
                height *
                .48;


            const x =
                i *
                width /
                bars;


            const gradient =
                context.createLinearGradient(
                    0,
                    height,
                    0,
                    height-barHeight
                );


            gradient.addColorStop(
                0,
                "#00eaff"
            );


            gradient.addColorStop(
                .5,
                "#704cff"
            );


            gradient.addColorStop(
                1,
                "#ff3eb7"
            );


            context.fillStyle =
                gradient;


            context.fillRect(
                x,
                height-barHeight,
                Math.max(
                    2,
                    width/bars-2
                ),
                barHeight
            );

        }


        const level =
            Math.min(
                100,
                total /
                bars *
                180
            );


        $("vuA").style.height =
            level + "%";


        $("vuB").style.height =
            Math.min(
                100,
                level *
                (
                    .7 +
                    Math.random()*.5
                )
            ) + "%";

    }


    draw();

}


/* =====================================================
   EVENTOS
===================================================== */

function setupEvents(){

    $("startButton")
        .addEventListener(
            "click",
            startSystem
        );


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
                loadTrack(
                    event.target.files[0],
                    "A"
                )
        );


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
                loadTrack(
                    event.target.files[0],
                    "B"
                )
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


    $("volumeA")
        .addEventListener(
            "input",
            () =>
                updateVolume("A")
        );


    $("volumeB")
        .addEventListener(
            "input",
            () =>
                updateVolume("B")
        );


    $("pitchA")
        .addEventListener(
            "input",
            () =>
                updatePitch("A")
        );


    $("pitchB")
        .addEventListener(
            "input",
            () =>
                updatePitch("B")
        );


    $("seekA")
        .addEventListener(
            "input",
            () =>
                updateSeek("A")
        );


    $("seekB")
        .addEventListener(
            "input",
            () =>
                updateSeek("B")
        );


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


    [
        "eqHigh",
        "eqMid",
        "eqLow"
    ].forEach(
        id =>
            $(id).addEventListener(
                "input",
                updateEQ
            )
    );


    document
        .querySelectorAll(
            "[data-effect]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () =>
                        toggleEffect(
                            button.dataset.deck,
                            button.dataset.effect
                        )
                );

            }
        );


    $("fxMixA")
        .addEventListener(
            "input",
            () =>
                updateFXMix("A")
        );


    $("fxMixB")
        .addEventListener(
            "input",
            () =>
                updateFXMix("B")
        );


    $("autoMixButton")
        .addEventListener(
            "click",
            toggleAutoMix
        );


    $("autoVoiceButton")
        .addEventListener(
            "click",
            toggleAutoVoice
        );


    $("smartNext")
        .addEventListener(
            "click",
            smartNext
        );


    $("shuffleButton")
        .addEventListener(
            "click",
            shuffleLibrary
        );


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
                addMusicFiles(
                    event.target.files
                )
        );


    $("clearLibrary")
        .addEventListener(
            "click",
            () => {

                STATE.library =
                    [];

                renderLibrary();

            }
        );


    $("recordButton")
        .addEventListener(
            "click",
            toggleRecording
        );


    $("micButton")
        .addEventListener(
            "click",
            toggleMicrophone
        );


    $("loadVoice")
        .addEventListener(
            "click",
            () =>
                $("voiceFile").click()
        );


    $("voiceFile")
        .addEventListener(
            "change",
            async event => {

                await loadVoiceID(
                    event.target.files[0]
                );

            }
        );


    $("playVoice")
        .addEventListener(
            "click",
            playVoiceID
        );

}


/* =====================================================
   ATAJOS
===================================================== */

function setupKeyboard(){

    document.addEventListener(
        "keydown",
        event => {

            if(
                event.target.matches(
                    "input,select"
                )
            ){

                return;

            }


            if(
                event.code === "Space"
            ){

                event.preventDefault();


                const deck =
                    STATE.decks[
                        STATE.activeDeck
                    ];


                if(!deck){

                    return;

                }


                if(
                    deck.audio.paused
                ){

                    playDeck(
                        STATE.activeDeck
                    );

                }else{

                    deck.audio.pause();

                }

            }


            if(
                event.key.toLowerCase()
                === "a"
            ){

                playDeck("A");

            }


            if(
                event.key.toLowerCase()
                === "b"
            ){

                playDeck("B");

            }


            if(
                event.key.toLowerCase()
                === "r"
            ){

                toggleRecording();

            }

        }
    );

}


/* =====================================================
   ARRANQUE
===================================================== */

function initialize(){

    updateClock();


    setInterval(
        updateClock,
        1000
    );


    renderLibrary();


    setupEvents();


    setupKeyboard();

}


if(
    document.readyState ===
    "loading"
){

    document.addEventListener(
        "DOMContentLoaded",
        initialize
    );

}else{

    initialize();

}
