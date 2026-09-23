(() => {

"use strict";


/* =========================================================
   HC PRO DJ HUMBERTO 3.0
   SMART DJ ENGINE
   ========================================================= */

const $ = id => document.getElementById(id);

const clamp = (value,min,max) =>
    Math.max(min,Math.min(max,value));

const formatTime = seconds => {

    if(!isFinite(seconds))
        return "00:00";

    seconds = Math.max(0,seconds);

    const minutes =
        Math.floor(seconds / 60);

    const secs =
        Math.floor(seconds % 60);

    return String(minutes).padStart(2,"0")
        + ":" +
        String(secs).padStart(2,"0");
};


/* =========================================================
   AUDIO ENGINE
   ========================================================= */

let audioContext = null;

let masterGain = null;

let masterAnalyser = null;

let recordDestination = null;

let recorder = null;

let recordingChunks = [];

let micSource = null;

let micGain = null;

let micStream = null;


/* =========================================================
   ESTADO
   ========================================================= */

let activeDeck = "A";

let autoDJ = false;

let autoTimer = null;

let lightsEnabled = true;

const library = [];

const smartQueue = [];

const playHistory =
    JSON.parse(
        localStorage.getItem("hcpro_history") || "[]"
    );


/* =========================================================
   IMPULSE RESPONSE PARA REVERB
   ========================================================= */

function createImpulse(seconds,decay){

    const buffer =
        audioContext.createBuffer(
            2,
            audioContext.sampleRate * seconds,
            audioContext.sampleRate
        );

    for(let channel=0;channel<2;channel++){

        const data =
            buffer.getChannelData(channel);

        for(let i=0;i<data.length;i++){

            data[i] =
                (Math.random()*2-1) *
                Math.pow(
                    1-i/data.length,
                    decay
                );
        }
    }

    return buffer;
}


/* =========================================================
   DECK
   ========================================================= */

class Deck{

    constructor(id){

        this.id = id;

        this.media =
            new Audio();

        this.media.preload = "auto";

        this.file = null;

        this.url = null;

        this.analysis = null;

        this.fx = {

            filter:false,
            echo:false,
            flanger:false,
            reverb:false

        };

        this.nodes = {};


        this.media.addEventListener(
            "loadedmetadata",
            () => {

                $("dur"+this.id)
                    .textContent =
                    formatTime(
                        this.media.duration
                    );

                this.updateScreen();

            }
        );


        this.media.addEventListener(
            "timeupdate",
            () => {

                $("time"+this.id)
                    .textContent =
                    formatTime(
                        this.media.currentTime
                    );

                this.updateScreen();

                this.updateMeter();

                if(
                    autoDJ &&
                    this.id === activeDeck &&
                    this.media.duration -
                    this.media.currentTime < 14
                ){

                    prepareAutoDJ();

                }

            }
        );


        this.media.addEventListener(
            "play",
            () => {

                $("state"+this.id)
                    .textContent = "PLAY";

                $("vinyl"+this.id)
                    .classList.add("spin");

            }
        );


        this.media.addEventListener(
            "pause",
            () => {

                $("state"+this.id)
                    .textContent = "PAUSE";

                $("vinyl"+this.id)
                    .classList.remove("spin");

            }
        );


        this.media.addEventListener(
            "ended",
            () => {

                $("state"+this.id)
                    .textContent = "END";

                $("vinyl"+this.id)
                    .classList.remove("spin");

                if(
                    autoDJ &&
                    this.id === activeDeck
                ){

                    crossfadeToOther();

                }

            }
        );

    }


    /* =====================================================
       CONEXIÓN WEB AUDIO
       ===================================================== */

    connect(){

        if(this.nodes.source)
            return;


        this.nodes.source =
            audioContext
                .createMediaElementSource(
                    this.media
                );


        this.nodes.input =
            audioContext.createGain();


        this.nodes.low =
            audioContext.createBiquadFilter();

        this.nodes.mid =
            audioContext.createBiquadFilter();

        this.nodes.high =
            audioContext.createBiquadFilter();

        this.nodes.filter =
            audioContext.createBiquadFilter();

        this.nodes.dry =
            audioContext.createGain();

        this.nodes.channel =
            audioContext.createGain();


        /* ECHO */

        this.nodes.delay =
            audioContext.createDelay(1);

        this.nodes.feedback =
            audioContext.createGain();

        this.nodes.echoWet =
            audioContext.createGain();


        /* FLANGER */

        this.nodes.flanger =
            audioContext.createDelay(.1);

        this.nodes.flangerWet =
            audioContext.createGain();

        this.nodes.lfo =
            audioContext.createOscillator();

        this.nodes.lfoGain =
            audioContext.createGain();


        /* REVERB */

        this.nodes.reverb =
            audioContext.createConvolver();

        this.nodes.reverbWet =
            audioContext.createGain();


        /* ANALIZADOR */

        this.nodes.analyser =
            audioContext.createAnalyser();

        this.nodes.analyser.fftSize = 256;


        /* EQ */

        this.nodes.low.type = "lowshelf";

        this.nodes.low.frequency.value = 180;


        this.nodes.mid.type = "peaking";

        this.nodes.mid.frequency.value = 1000;

        this.nodes.mid.Q.value = .8;


        this.nodes.high.type = "highshelf";

        this.nodes.high.frequency.value = 6000;


        /* FILTER */

        this.nodes.filter.type = "lowpass";

        this.nodes.filter.frequency.value = 22000;

        this.nodes.filter.Q.value = .7;


        /* ECHO */

        this.nodes.delay.delayTime.value = .28;

        this.nodes.feedback.gain.value = .34;

        this.nodes.echoWet.gain.value = 0;


        /* FLANGER */

        this.nodes.flanger.delayTime.value = .004;

        this.nodes.flangerWet.gain.value = 0;

        this.nodes.lfo.frequency.value = .25;

        this.nodes.lfoGain.gain.value = .002;


        /* REVERB */

        this.nodes.reverb.buffer =
            createImpulse(1.8,2.4);

        this.nodes.reverbWet.gain.value = 0;


        /* LFO */

        this.nodes.lfo.connect(
            this.nodes.lfoGain
        );

        this.nodes.lfoGain.connect(
            this.nodes.flanger.delayTime
        );

        this.nodes.lfo.start();


        /* CADENA PRINCIPAL */

        this.nodes.source

            .connect(this.nodes.input)

            .connect(this.nodes.low)

            .connect(this.nodes.mid)

            .connect(this.nodes.high)

            .connect(this.nodes.filter);


        this.nodes.filter
            .connect(this.nodes.dry)
            .connect(this.nodes.channel);


        /* ECHO */

        this.nodes.filter
            .connect(this.nodes.delay);

        this.nodes.delay
            .connect(this.nodes.feedback);

        this.nodes.feedback
            .connect(this.nodes.delay);

        this.nodes.delay
            .connect(this.nodes.echoWet);

        this.nodes.echoWet
            .connect(this.nodes.channel);


        /* FLANGER */

        this.nodes.filter
            .connect(this.nodes.flanger);

        this.nodes.flanger
            .connect(this.nodes.flangerWet);

        this.nodes.flangerWet
            .connect(this.nodes.channel);


        /* REVERB */

        this.nodes.filter
            .connect(this.nodes.reverb);

        this.nodes.reverb
            .connect(this.nodes.reverbWet);

        this.nodes.reverbWet
            .connect(this.nodes.channel);


        /* MASTER */

        this.nodes.channel

            .connect(this.nodes.analyser)

            .connect(masterGain);

        this.nodes.input.gain.value = 1;

        this.nodes.dry.gain.value = 1;

    }


    /* =====================================================
       CARGAR
       ===================================================== */

    load(file){

        initAudio();

        this.file = file;

        if(this.url)
            URL.revokeObjectURL(this.url);

        this.url =
            URL.createObjectURL(file);

        this.media.src = this.url;

        this.media.load();


        const meta =
            parseFileName(file.name);


        this.analysis = {

            title:meta.title,

            artist:meta.artist,

            genre:meta.genre,

            bpm:null,

            key:null,

            energy:null,

            duration:null

        };


        $("title"+this.id)
            .textContent =
            meta.title;


        $("meta"+this.id)
            .textContent =
            (meta.artist || "HC PRO")
            + " • "
            + file.name;


        $("state"+this.id)
            .textContent =
            "READY";


        setVisualDeck(this.id);

        updateSmartDisplay(
            this.analysis
        );


        analyzeFile(
            file,
            this
        );

    }


    /* =====================================================
       PLAY
       ===================================================== */

    play(){

        initAudio();

        audioContext.resume();

        this.media
            .play()
            .catch(()=>{});

        activeDeck = this.id;

        setVisualDeck(this.id);

    }


    pause(){

        this.media.pause();

    }


    stop(){

        this.media.pause();

        this.media.currentTime = 0;

    }


    /* =====================================================
       CONTROLES
       ===================================================== */

    setControl(type,value){

        if(!this.nodes.input)
            return;


        if(type === "gain")
            this.nodes.input.gain.value =
                Number(value);


        if(type === "low")
            this.nodes.low.gain.value =
                Number(value);


        if(type === "mid")
            this.nodes.mid.gain.value =
                Number(value);


        if(type === "high")
            this.nodes.high.gain.value =
                Number(value);


        if(type === "pitch")
            this.media.playbackRate =
                Number(value);

    }


    /* =====================================================
       FX
       ===================================================== */

    toggleFX(type){

        if(!this.nodes.input)
            return;


        this.fx[type] =
            !this.fx[type];


        const enabled =
            this.fx[type];


        if(type === "filter"){

            this.nodes.filter
                .frequency
                .setTargetAtTime(
                    enabled ? 850 : 22000,
                    audioContext.currentTime,
                    .06
                );

        }


        if(type === "echo"){

            this.nodes.echoWet
                .gain
                .setTargetAtTime(
                    enabled ? .28 : 0,
                    audioContext.currentTime,
                    .05
                );

        }


        if(type === "flanger"){

            this.nodes.flangerWet
                .gain
                .setTargetAtTime(
                    enabled ? .18 : 0,
                    audioContext.currentTime,
                    .05
                );

        }


        if(type === "reverb"){

            this.nodes.reverbWet
                .gain
                .setTargetAtTime(
                    enabled ? .22 : 0,
                    audioContext.currentTime,
                    .05
                );

        }

    }


    /* =====================================================
       VU
       ===================================================== */

    updateMeter(){

        if(!this.nodes.analyser)
            return;


        const data =
            new Uint8Array(
                this.nodes.analyser.frequencyBinCount
            );


        this.nodes.analyser
            .getByteFrequencyData(data);


        let average = 0;


        for(const value of data)
            average += value;


        average /=
            data.length * 255;


        $("meter"+this.id)
            .style.height =
            Math.max(
                2,
                average * 100
            ) + "%";

    }


    /* =====================================================
       PANTALLA
       ===================================================== */

    updateScreen(){

        if(this.id !== activeDeck)
            return;


        $("screenTitle")
            .textContent =
            this.analysis?.title ||
            this.file?.name ||
            "HC PRO DJ HUMBERTO";


        $("screenTime")
            .textContent =
            formatTime(
                this.media.currentTime
            )
            +
            " / "
            +
            formatTime(
                this.media.duration
            );

    }

}


/* =========================================================
   DECKS
   ========================================================= */

const decks = {

    A:new Deck("A"),

    B:new Deck("B")

};


/* =========================================================
   INICIALIZAR AUDIO
   ========================================================= */

function initAudio(){

    if(audioContext)
        return;


    audioContext =
        new (
            window.AudioContext ||
            window.webkitAudioContext
        )();


    masterGain =
        audioContext.createGain();


    masterGain.gain.value =
        .85;


    masterAnalyser =
        audioContext.createAnalyser();


    masterAnalyser.fftSize =
        512;


    recordDestination =
        audioContext
            .createMediaStreamDestination();


    masterGain
        .connect(masterAnalyser);


    masterAnalyser
        .connect(
            audioContext.destination
        );


    masterAnalyser
        .connect(
            recordDestination
        );


    decks.A.connect();

    decks.B.connect();


    $("audioStatus")
        .textContent =
        "AUDIO ONLINE";


    startVisualizer();

}


/* =========================================================
   NOMBRE DE ARCHIVO
   ========================================================= */

function parseFileName(filename){

    let name =
        filename.replace(
            /\.[^/.]+$/,
            ""
        );


    let artist = "";

    let title = name;


    if(name.includes(" - ")){

        const parts =
            name.split(" - ");

        artist =
            parts.shift();

        title =
            parts.join(" - ");

    }


    let genre = "General";

    const lower =
        name.toLowerCase();


    const genres = [

        "rock",
        "pop",
        "cumbia",
        "electronic",
        "house",
        "reggaeton",
        "cuarteto",
        "folklore",
        "dance",
        "techno"

    ];


    for(const g of genres){

        if(lower.includes(g)){

            genre = g;

            break;

        }

    }


    return {

        artist:artist.trim(),

        title:title.trim(),

        genre

    };

}


/* =========================================================
   ANALISIS DE ARCHIVO
   ========================================================= */

async function analyzeFile(file,deck){

    try{

        $("smartState")
            .textContent =
            "ANALYZING";


        const analysisContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();


        const arrayBuffer =
            await file.arrayBuffer();


        const buffer =
            await analysisContext
                .decodeAudioData(
                    arrayBuffer
                );


        const bpm =
            estimateBPM(buffer);


        const energy =
            estimateEnergy(buffer);


        const key =
            estimateKey(buffer);


        deck.analysis = {

            ...deck.analysis,

            bpm,

            energy,

            key,

            duration:
                buffer.duration

        };


        addToLibrary(deck);


        if(deck.id === activeDeck){

            updateSmartDisplay(
                deck.analysis
            );

        }


        $("smartState")
            .textContent =
            "READY";


        analysisContext.close();

    }

    catch(error){

        console.warn(
            "No se pudo analizar:",
            error
        );

        $("smartState")
            .textContent =
            "READY";

    }

}


/* =========================================================
   ENERGY
   ========================================================= */

function estimateEnergy(buffer){

    const channel =
        buffer.getChannelData(0);


    const sampleRate =
        buffer.sampleRate;


    const step =
        Math.max(
            1,
            Math.floor(
                sampleRate * .05
            )
        );


    let total = 0;

    let count = 0;


    for(
        let i=0;
        i<channel.length;
        i+=step
    ){

        let power = 0;

        const size =
            Math.min(
                step,
                channel.length-i
            );


        for(
            let j=0;
            j<size;
            j++
        ){

            power +=
                channel[i+j] *
                channel[i+j];

        }


        total +=
            Math.sqrt(
                power / size
            );


        count++;

    }


    return Math.round(
        clamp(
            (total/count)*190,
            0,
            100
        )
    );

}


/* =========================================================
   BPM
   ========================================================= */

function estimateBPM(buffer){

    const sampleRate =
        buffer.sampleRate;


    const channel =
        buffer.getChannelData(0);


    const seconds =
        Math.min(
            75,
            buffer.duration
        );


    const step =
        Math.max(
            1,
            Math.floor(
                sampleRate * .02
            )
        );


    const envelope = [];


    for(
        let i=0;
        i<seconds*sampleRate;
        i+=step
    ){

        let total = 0;

        const size =
            Math.min(
                step,
                channel.length-i
            );


        for(
            let j=0;
            j<size;
            j++
        ){

            total +=
                Math.abs(
                    channel[i+j]
                );

        }


        envelope.push(
            total/size
        );

    }


    const average =
        envelope.reduce(
            (a,b)=>a+b,
            0
        ) /
        envelope.length;


    for(let i=0;i<envelope.length;i++){

        envelope[i] =
            Math.max(
                0,
                envelope[i]-average
            );

    }


    let bestBPM = 120;

    let bestScore = -Infinity;


    for(
        let bpm=70;
        bpm<=160;
        bpm++
    ){

        const lag =
            Math.round(
                60 /
                bpm /
                (step/sampleRate)
            );


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

            bestScore = score;

            bestBPM = bpm;

        }

    }


    return bestBPM;

}


/* =========================================================
   KEY ESTIMADA
   ========================================================= */

function estimateKey(buffer){

    const channel =
        buffer.getChannelData(0);


    const sampleRate =
        buffer.sampleRate;


    const N = 2048;


    const start =
        Math.max(
            0,
            Math.floor(
                channel.length*.35
            )
        );


    const samples =
        channel.slice(
            start,
            start+N
        );


    const chroma =
        new Array(12)
            .fill(0);


    for(
        let k=1;
        k<N/2;
        k++
    ){

        let real=0;

        let imag=0;


        for(
            let n=0;
            n<samples.length;
            n++
        ){

            const window =
                .5 -
                .5 *
                Math.cos(
                    2*Math.PI*n/
                    (N-1)
                );


            const angle =
                2*Math.PI*k*n/N;


            real +=
                samples[n] *
                window *
                Math.cos(angle);


            imag -=
                samples[n] *
                window *
                Math.sin(angle);

        }


        const magnitude =
            Math.sqrt(
                real*real +
                imag*imag
            );


        const frequency =
            k*sampleRate/N;


        if(
            frequency < 70 ||
            frequency > 1800
        )
            continue;


        const midi =
            Math.round(
                69 +
                12 *
                Math.log2(
                    frequency/440
                )
            );


        const pitchClass =
            ((midi % 12)+12)%12;


        chroma[pitchClass] +=
            magnitude;

    }


    const names = [

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


    let strongest = 0;


    for(
        let i=1;
        i<12;
        i++
    ){

        if(
            chroma[i] >
            chroma[strongest]
        ){

            strongest = i;

        }

    }


    return names[strongest];

}


/* =========================================================
   BIBLIOTECA
   ========================================================= */

function addToLibrary(deck){

    if(!deck.file)
        return;


    const exists =
        library.find(
            item =>
            item.file === deck.file
        );


    if(exists)
        return;


    library.push({

        id:
            crypto.randomUUID
            ?
            crypto.randomUUID()
            :
            String(
                Date.now()+
                Math.random()
            ),

        file:deck.file,

        analysis:
            deck.analysis,

        plays:0,

        lastPlayed:0

    });


    renderLibrary();

}


/* =========================================================
   IMPORTAR
   ========================================================= */

async function importFiles(files){

    initAudio();

    for(const file of files){

        const meta =
            parseFileName(
                file.name
            );


        let analysis = {

            ...meta,

            bpm:null,

            key:null,

            energy:null,

            duration:null

        };


        try{

            const context =
                new (
                    window.AudioContext ||
                    window.webkitAudioContext
                )();


            const buffer =
                await context.decodeAudioData(
                    await file.arrayBuffer()
                );


            analysis.bpm =
                estimateBPM(buffer);


            analysis.energy =
                estimateEnergy(buffer);


            analysis.key =
                estimateKey(buffer);


            analysis.duration =
                buffer.duration;


            context.close();

        }

        catch(error){

            console.warn(
                "No se pudo analizar:",
                file.name
            );

        }


        library.push({

            id:
                crypto.randomUUID
                ?
                crypto.randomUUID()
                :
                String(
                    Date.now()+
                    Math.random()
                ),

            file,

            analysis,

            plays:0,

            lastPlayed:0

        });

    }


    renderLibrary();

}


/* =========================================================
   MOSTRAR BIBLIOTECA
   ========================================================= */

function renderLibrary(){

    const search =
        $("searchInput")
            .value
            .toLowerCase();


    const filtered =
        library.filter(item => {

            const text =
                (
                    item.file.name +
                    " " +
                    item.analysis.title +
                    " " +
                    item.analysis.artist
                )
                .toLowerCase();


            return text.includes(search);

        });


    $("libraryCount")
        .textContent =
        library.length +
        " TRACKS";


    $("libraryList")
        .innerHTML =
        filtered.map(
            (item,index) => `

            <div class="track">

                <span class="num">
                    ${String(index+1).padStart(2,"0")}
                </span>

                <div>

                    <b>
                        ${
                            escapeHTML(
                                item.analysis.artist
                            )
                        }

                        ${
                            item.analysis.artist
                            ? " — "
                            : ""
                        }

                        ${
                            escapeHTML(
                                item.analysis.title
                            )
                        }
                    </b>

                    <small>
                        ${
                            escapeHTML(
                                item.file.name
                            )
                        }
                    </small>

                </div>

                <span class="badge">

                    ${item.analysis.bpm || "--"}
                    BPM

                    •
                    ${item.analysis.key || "--"}

                    • E
                    ${item.analysis.energy ?? "--"}

                </span>


                <button
                    onclick="
                    window.HCPRO.loadTrack(
                        '${item.id}',
                        'A'
                    )">

                    A

                </button>


                <button
                    onclick="
                    window.HCPRO.loadTrack(
                        '${item.id}',
                        'B'
                    )">

                    B

                </button>

            </div>

        `
        )
        .join("");


    if(!filtered.length){

        $("libraryList")
            .innerHTML = `
                <div class="result">
                    Biblioteca vacía.
                    Agrega música para comenzar.
                </div>
            `;

    }

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(text){

    return String(text || "")
        .replace(
            /[&<>"']/g,
            character => ({

                "&":"&amp;",
                "<":"&lt;",
                ">":"&gt;",
                '"':"&quot;",
                "'":"&#039;"

            })[character]
        );

}


/* =========================================================
   CARGAR PISTA
   ========================================================= */

function loadTrack(id,deckID){

    const item =
        library.find(
            x => x.id === id
        );


    if(!item)
        return;


    decks[deckID]
        .load(
            item.file
        );


    decks[deckID]
        .analysis =
        item.analysis;


    setVisualDeck(deckID);

    updateSmartDisplay(
        item.analysis
    );

}


/* =========================================================
   PANTALLA ACTIVA
   ========================================================= */

function setVisualDeck(id){

    activeDeck = id;

    $("visualDeck")
        .textContent =
        "DECK " + id;


    decks[id]
        .updateScreen();

}


/* =========================================================
   SMART DISPLAY
   ========================================================= */

function updateSmartDisplay(analysis){

    $("smartBpm")
        .textContent =
        analysis?.bpm || "--";


    $("smartKey")
        .textContent =
        analysis?.key || "--";


    $("smartEnergy")
        .textContent =
        analysis?.energy ?? "--";

}


/* =========================================================
   COMPATIBILIDAD BPM
   ========================================================= */

function bpmCompatibility(a,b){

    if(!a || !b)
        return 45;


    let difference =
        Math.abs(a-b);


    const ratio =
        b/a;


    if(
        ratio>.48 &&
        ratio<.55
    ){

        difference =
            Math.abs(
                a -
                b*2
            );

    }


    if(
        ratio>1.8 &&
        ratio<2.05
    ){

        difference =
            Math.abs(
                a*2 -
                b
            );

    }


    return clamp(
        100 -
        difference*5,
        0,
        100
    );

}


/* =========================================================
   COMPATIBILIDAD KEY
   ========================================================= */

function keyCompatibility(a,b){

    if(!a || !b)
        return 45;


    if(a===b)
        return 100;


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


    const x =
        keys.indexOf(a);

    const y =
        keys.indexOf(b);


    if(
        x<0 ||
        y<0
    )
        return 45;


    const distance =
        Math.min(
            (x-y+12)%12,
            (y-x+12)%12
        );


    if(distance===1)
        return 88;

    if(distance===2)
        return 70;

    if(distance===3)
        return 52;

    if(distance===6)
        return 45;


    return 25;

}


/* =========================================================
   ENERGY
   ========================================================= */

function energyCompatibility(a,b,mode){

    if(
        a == null ||
        b == null
    )
        return 45;


    const difference =
        b-a;


    if(mode==="build"){

        if(difference>=0)
            return clamp(
                100 -
                difference*4,
                40,
                100
            );


        return clamp(
            70 +
            difference*8,
            0,
            70
        );

    }


    if(mode==="peak"){

        return b>=75
            ? 90
            : 55;

    }


    if(mode==="chill"){

        return b<=a+5
            ? 90
            : 40;

    }


    return clamp(
        100 -
        Math.abs(difference)*5,
        0,
        100
    );

}


/* =========================================================
   COMPATIBILIDAD TOTAL
   ========================================================= */

function calculateCompatibility(
    from,
    to
){

    const mode =
        $("energyMode").value;


    const bpm =
        bpmCompatibility(
            from.bpm,
            to.bpm
        );


    const key =
        keyCompatibility(
            from.key,
            to.key
        );


    const energy =
        energyCompatibility(
            from.energy,
            to.energy,
            mode
        );


    return Math.round(

        bpm*.40 +
        key*.35 +
        energy*.25

    );

}


/* =========================================================
   BUSCAR SIGUIENTE
   ========================================================= */

function findBestNext(){

    const current =
        decks[activeDeck]
            .analysis || {};


    const recent =
        new Set(
            playHistory.slice(-12)
        );


    return library

        .filter(item => {

            if(!item.file)
                return false;


            if(
                decks[activeDeck].file &&
                item.file.name ===
                decks[activeDeck].file.name
            )
                return false;


            if(
                recent.has(
                    item.file.name
                )
            )
                return false;


            return true;

        })

        .map(item => ({

            ...item,

            score:
                calculateCompatibility(
                    current,
                    item.analysis
                )

        }))

        .sort(
            (a,b) =>
            b.score-a.score
        );

}


/* =========================================================
   MOSTRAR CANDIDATOS
   ========================================================= */

function showBestCandidates(){

    const candidates =
        findBestNext()
            .slice(0,5);


    $("smartResults")
        .innerHTML =
        candidates
            .map(
                item => `

                <div class="result">

                    <span>
                        ${
                            escapeHTML(
                                item.analysis.title
                            )
                        }
                    </span>

                    <b>
                        ${item.score}%
                    </b>

                    <button
                        onclick="
                        window.HCPRO.loadTrack(
                            '${item.id}',
                            '${activeDeck==="A"?"B":"A"}'
                        )">

                        PREPARAR

                    </button>

                </div>

                `
            )
            .join("");


    if(!candidates.length){

        $("smartResults")
            .innerHTML = `
                <div class="result">
                    Agrega más canciones
                    a la biblioteca.
                </div>
            `;

        return [];

    }


    $("smartMatch")
        .textContent =
        candidates[0].score +
        "%";


    return candidates;

}


/* =========================================================
   SMART PLAYLIST
   ========================================================= */

function generateSmartPlaylist(){

    smartQueue.length = 0;


    let pool =
        findBestNext();


    let current =
        decks[activeDeck]
            .analysis || {};


    for(
        let i=0;
        i<Math.min(15,pool.length);
        i++
    ){

        pool =
            pool.filter(
                item =>
                !smartQueue.includes(item)
            );


        if(!pool.length)
            break;


        pool.sort(
            (a,b) =>
            calculateCompatibility(
                current,
                b.analysis
            )
            -
            calculateCompatibility(
                current,
                a.analysis
            )
        );


        const next =
            pool.shift();


        next.score =
            calculateCompatibility(
                current,
                next.analysis
            );


        smartQueue.push(
            next
        );


        current =
            next.analysis;

    }


    renderQueue();

}


/* =========================================================
   QUEUE
   ========================================================= */

function renderQueue(){

    $("queueCount")
        .textContent =
        smartQueue.length;


    $("queueList")
        .innerHTML =
        smartQueue
            .map(
                (item,index) => `

                <div class="queue-item">

                    <span>
                        ${index+1}.
                        ${
                            escapeHTML(
                                item.analysis.title
                            )
                        }
                    </span>

                    <b>
                        ${item.score || "--"}%
                    </b>

                </div>

                `
            )
            .join("");


    if(!smartQueue.length){

        $("queueList")
            .innerHTML = `
                <div class="queue-item">
                    Sin pistas en cola.
                </div>
            `;

    }

}


/* =========================================================
   PREPARAR AUTO DJ
   ========================================================= */

function prepareAutoDJ(){

    if(!autoDJ)
        return;


    const inactiveDeck =
        activeDeck === "A"
            ? "B"
            : "A";


    if(
        decks[inactiveDeck].file &&
        decks[inactiveDeck]
            .media.readyState >= 2
    ){

        return;

    }


    let next =
        smartQueue.shift();


    if(!next){

        next =
            findBestNext()[0];

    }


    if(!next)
        return;


    decks[inactiveDeck]
        .load(
            next.file
        );


    if(
        decks[activeDeck].analysis?.bpm &&
        next.analysis?.bpm
    ){

        const speed =
            clamp(
                decks[activeDeck]
                    .analysis.bpm /
                next.analysis.bpm,
                .92,
                1.08
            );


        decks[inactiveDeck]
            .media
            .playbackRate =
            speed;

    }


    renderQueue();


    clearTimeout(autoTimer);


    const remaining =
        decks[activeDeck]
            .media.duration -
        decks[activeDeck]
            .media.currentTime;


    autoTimer =
        setTimeout(
            () => {

                if(autoDJ)
                    crossfadeToOther();

            },
            Math.max(
                3000,
                (remaining-8)*1000
            )
        );

}


/* =========================================================
   CROSSFADE
   ========================================================= */

function crossfadeToOther(){

    const from =
        activeDeck;


    const to =
        activeDeck === "A"
            ? "B"
            : "A";


    if(!decks[to].file){

        prepareAutoDJ();

        return;

    }


    const transition =
        $("transition").value;


    decks[to].play();


    setVisualDeck(to);


    const start =
        performance.now();


    const duration =
        transition === "fade"
            ? 4000
            : 6500;


    function animate(time){

        const progress =
            clamp(
                (time-start)/
                duration,
                0,
                1
            );


        const a =
            Math.cos(
                progress *
                Math.PI/2
            );


        const b =
            Math.sin(
                progress *
                Math.PI/2
            );


        setDeckVolume(
            from,
            a
        );


        setDeckVolume(
            to,
            b
        );


        if(progress < 1){

            requestAnimationFrame(
                animate
            );

        }

        else{

            decks[from].pause();

            activeDeck = to;

            markPlayed(
                decks[to].file
            );


            prepareAutoDJ();

        }

    }


    requestAnimationFrame(
        animate
    );

}


/* =========================================================
   VOLUMEN DECK
   ========================================================= */

function setDeckVolume(
    deckID,
    volume
){

    if(
        decks[deckID]
            .nodes
            .channel
    ){

        decks[deckID]
            .nodes
            .channel
            .gain.value =
            volume;

    }

}


/* =========================================================
   HISTORIAL
   ========================================================= */

function markPlayed(file){

    if(!file)
        return;


    playHistory.push(
        file.name
    );


    while(
        playHistory.length >
        100
    ){

        playHistory.shift();

    }


    localStorage.setItem(
        "hcpro_history",
        JSON.stringify(
            playHistory
        )
    );


    const item =
        library.find(
            x =>
            x.file === file
        );


    if(item){

        item.plays++;

        item.lastPlayed =
            Date.now();

    }

}


/* =========================================================
   AUTO DJ
   ========================================================= */

function toggleAutoDJ(){

    autoDJ =
        !autoDJ;


    $("autoState")
        .textContent =
        autoDJ
            ? "ON"
            : "OFF";


    $("autoBtn")
        .classList.toggle(
            "fx-on",
            autoDJ
        );


    if(autoDJ){

        prepareAutoDJ();

    }

    else{

        clearTimeout(
            autoTimer
        );

    }

}


/* =========================================================
   GRABACIÓN MIX
   ========================================================= */

function toggleRecording(){

    initAudio();


    if(
        recorder &&
        recorder.state ===
        "recording"
    ){

        recorder.stop();

        $("recState")
            .textContent =
            "READY";

        $("recBtn")
            .classList.remove(
                "fx-on"
            );

        return;

    }


    recordingChunks = [];


    const mime =
        MediaRecorder
            .isTypeSupported(
                "audio/webm;codecs=opus"
            )
            ?
            "audio/webm;codecs=opus"
            :
            "audio/webm";


    recorder =
        new MediaRecorder(
            recordDestination.stream,
            {
                mimeType:mime
            }
        );


    recorder.ondataavailable =
        event => {

            if(event.data.size){

                recordingChunks
                    .push(
                        event.data
                    );

            }

        };


    recorder.onstop =
        () => {

            const blob =
                new Blob(
                    recordingChunks,
                    {
                        type:mime
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


            link.href = url;


            link.download =
                "HC_PRO_MIX_" +
                new Date()
                    .toISOString()
                    .replace(
                        /[:.]/g,
                        "-"
                    ) +
                ".webm";


            link.click();


            setTimeout(
                () =>
                URL.revokeObjectURL(url),
                1000
            );

        };


    recorder.start();


    $("recState")
        .textContent =
        "RECORDING";


    $("recBtn")
        .classList.add(
            "fx-on"
        );

}


/* =========================================================
   MICROFONO
   ========================================================= */

async function toggleMicrophone(){

    initAudio();


    if(micSource){

        micSource.disconnect();

        micSource = null;


        if(micStream){

            micStream
                .getTracks()
                .forEach(
                    track =>
                    track.stop()
                );

        }


        $("micBtn")
            .textContent =
            "MIC OFF";


        return;

    }


    try{

        micStream =
            await navigator
                .mediaDevices
                .getUserMedia({
                    audio:true
                });


        micSource =
            audioContext
                .createMediaStreamSource(
                    micStream
                );


        micGain =
            audioContext
                .createGain();


        micGain.gain.value =
            Number(
                $("micGain").value
            );


        micSource
            .connect(micGain)
            .connect(masterGain);


        $("micBtn")
            .textContent =
            "MIC ON";

    }

    catch(error){

        alert(
            "No se pudo acceder al micrófono."
        );

    }

}


/* =========================================================
   VISUALIZADOR
   ========================================================= */

function startVisualizer(){

    const canvas =
        $("visualizer");


    const context =
        canvas.getContext("2d");


    const data =
        new Uint8Array(
            masterAnalyser
                .frequencyBinCount
        );


    function draw(){

        requestAnimationFrame(
            draw
        );


        if(
            canvas.width !==
            canvas.clientWidth
        ){

            canvas.width =
                canvas.clientWidth;

        }


        if(
            canvas.height !==
            canvas.clientHeight
        ){

            canvas.height =
                canvas.clientHeight;

        }


        masterAnalyser
            .getByteFrequencyData(
                data
            );


        context.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );


        const bars = 48;

        const width =
            canvas.width /
            bars;


        for(
            let i=0;
            i<bars;
            i++
        ){

            const value =
                data[i*2] || 0;


            const height =
                value/255 *
                canvas.height;


            if(i%3===0)
                context.fillStyle =
                    "#ff7a18";

            else if(i%3===1)
                context.fillStyle =
                    "#00d9ff";

            else
                context.fillStyle =
                    "#9b5cff";


            context.fillRect(
                i*width,
                canvas.height-height,
                width-2,
                height
            );

        }

    }


    draw();

}


/* =========================================================
   EVENTOS
   ========================================================= */

function bindEvents(){


    $("startAudio").onclick =
        () => {

            initAudio();

            audioContext.resume();

            $("audioStatus")
                .textContent =
                "AUDIO ONLINE";

        };


    $("filesBtn").onclick =
        () =>
        $("fileInput").click();


    $("folderBtn").onclick =
        () =>
        $("folderInput").click();


    $("fileInput").onchange =
        event =>
        importFiles(
            [...event.target.files]
        );


    $("folderInput").onchange =
        event =>
        importFiles(
            [...event.target.files]
        );


    $("searchInput").oninput =
        renderLibrary;


    $("clearHistory").onclick =
        () => {

            playHistory.length = 0;

            localStorage.removeItem(
                "hcpro_history"
            );

        };


    $("analyzeBtn").onclick =
        () =>
        updateSmartDisplay(
            decks[activeDeck]
                .analysis
        );


    $("nextBtn").onclick =
        showBestCandidates;


    $("playlistBtn").onclick =
        generateSmartPlaylist;


    $("autoBtn").onclick =
        toggleAutoDJ;


    $("recBtn").onclick =
        toggleRecording;


    $("micBtn").onclick =
        toggleMicrophone;


    $("micGain").oninput =
        event => {

            if(micGain){

                micGain.gain.value =
                    Number(
                        event.target.value
                    );

            }

        };


    $("master").oninput =
        event => {

            if(masterGain){

                masterGain.gain.value =
                    Number(
                        event.target.value
                    );

            }

        };


    $("crossfader").oninput =
        event => {

            const position =
                Number(
                    event.target.value
                );


            setDeckVolume(
                "A",
                Math.cos(
                    position *
                    Math.PI/2
                )
            );


            setDeckVolume(
                "B",
                Math.sin(
                    position *
                    Math.PI/2
                )
            );

        };


    $("lightsBtn").onclick =
        () => {

            lightsEnabled =
                !lightsEnabled;


            document.body
                .classList.toggle(
                    "lights-off",
                    !lightsEnabled
                );

        };


    $("strobeBtn").onclick =
        () => {

            document.body
                .classList.toggle(
                    "strobe-on"
                );

        };


    /* BOTONES DECK */

    document
        .querySelectorAll(
            "[data-action]"
        )
        .forEach(button => {

            button.onclick =
                () => {

                    const deck =
                        decks[
                            button.dataset.deck
                        ];


                    const action =
                        button.dataset.action;


                    if(action === "load"){

                        const input =
                            document.createElement(
                                "input"
                            );


                        input.type =
                            "file";


                        input.accept =
                            "audio/*,video/*";


                        input.onchange =
                            event => {

                                if(
                                    event.target
                                        .files[0]
                                ){

                                    deck.load(
                                        event.target
                                            .files[0]
                                    );

                                }

                            };


                        input.click();

                    }


                    if(action === "play")
                        deck.play();


                    if(action === "pause")
                        deck.pause();


                    if(action === "stop")
                        deck.stop();

                };

        });


    /* CONTROLES */

    [

        "gain",
        "low",
        "mid",
        "high",
        "pitch"

    ].forEach(
        control => {

            ["A","B"].forEach(
                deckID => {

                    $(control+deckID)
                        .oninput =
                        event => {

                            decks[deckID]
                                .setControl(
                                    control,
                                    event.target.value
                                );

                        };

                }
            );

        }
    );


    /* FX */

    document
        .querySelectorAll(
            "[data-fx]"
        )
        .forEach(button => {

            button.onclick =
                () => {

                    const deck =
                        decks[
                            button.dataset.deck
                        ];


                    const fx =
                        button.dataset.fx;


                    deck.toggleFX(
                        fx
                    );


                    button.classList.toggle(
                        "fx-on",
                        deck.fx[fx]
                    );

                };

        });


    /* RELOJ */

    setInterval(
        () => {

            $("clock")
                .textContent =
                new Date()
                    .toLocaleTimeString(
                        "es-AR"
                    );

        },
        1000
    );


    /* ATAJO ESPACIO */

    document.addEventListener(
        "keydown",
        event => {

            if(
                event.code ===
                "Space" &&
                event.target.tagName !==
                "INPUT"
            ){

                event.preventDefault();

                if(
                    decks[activeDeck]
                        .media.paused
                ){

                    decks[activeDeck]
                        .play();

                }

                else{

                    decks[activeDeck]
                        .pause();

                }

            }

        }
    );

}


/* =========================================================
   API
   ========================================================= */

window.HCPRO = {

    loadTrack

};


/* =========================================================
   ARRANQUE
   ========================================================= */

bindEvents();

renderLibrary();

})();
