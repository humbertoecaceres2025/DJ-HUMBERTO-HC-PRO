/* =========================================================
   HC PRO DJ HUMBERTO
   WEB DJ ENGINE
========================================================= */

const $ = id => document.getElementById(id);


/* =========================================================
   ESTADO
========================================================= */

const decks = {

    A: {

        audio:null,
        file:null,
        url:null,
        playing:false,
        volume:1,
        cueTime:0

    },

    B: {

        audio:null,
        file:null,
        url:null,
        playing:false,
        volume:1,
        cueTime:0

    }

};


let library = [];

let autoDJ = false;

let loopEnabled = false;

let recorder = null;

let recordedChunks = [];


/* =========================================================
   RELOJ
========================================================= */

function updateClock(){

    const now = new Date();

    $("clock").textContent =
        now.toLocaleTimeString();

}

setInterval(updateClock,1000);

updateClock();


/* =========================================================
   FULLSCREEN
========================================================= */

$("fullscreenBtn").onclick = async ()=>{

    if(!document.fullscreenElement){

        await document.documentElement.requestFullscreen();

    }else{

        await document.exitFullscreen();

    }

};


/* =========================================================
   CREAR AUDIO
========================================================= */

function createAudio(deck){

    if(deck.audio){

        deck.audio.pause();

        deck.audio.src="";

    }

    deck.audio = new Audio();

    deck.audio.preload="auto";

    deck.audio.volume=deck.volume;

    deck.audio.onloadedmetadata = ()=>{

        updateTime(deck);

    };

    deck.audio.ontimeupdate = ()=>{

        updateTime(deck);

    };

    deck.audio.onplay = ()=>{

        deck.playing=true;

        document
        .querySelector(
            deck===decks.A
            ? ".deck-a"
            : ".deck-b"
        )
        .classList.add("playing");

    };

    deck.audio.onpause = ()=>{

        deck.playing=false;

        document
        .querySelector(
            deck===decks.A
            ? ".deck-a"
            : ".deck-b"
        )
        .classList.remove("playing");

    };

    deck.audio.onended = ()=>{

        deck.playing=false;

        if(loopEnabled){

            deck.audio.currentTime=0;

            deck.audio.play();

            return;

        }

        if(autoDJ){

            autoNext(deck);

        }

    };

}


/* =========================================================
   FORMATO TIEMPO
========================================================= */

function formatTime(seconds){

    if(!Number.isFinite(seconds))
        return "00:00";

    const min =
        Math.floor(seconds/60);

    const sec =
        Math.floor(seconds%60)
        .toString()
        .padStart(2,"0");

    return `${min}:${sec}`;

}


function updateTime(deck){

    const id =
        deck===decks.A
        ? "timeA"
        : "timeB";

    $(id).textContent =
        `${formatTime(deck.audio?.currentTime || 0)}
        / ${formatTime(deck.audio?.duration || 0)}`;

}


/* =========================================================
   CARGAR PISTA
========================================================= */

function loadFile(deck,file){

    if(!file)
        return;

    deck.file=file;

    if(deck.url)
        URL.revokeObjectURL(deck.url);

    deck.url =
        URL.createObjectURL(file);

    if(!deck.audio)
        createAudio(deck);

    deck.audio.src=deck.url;

    deck.audio.load();

    const title =
        deck===decks.A
        ? "titleA"
        : "titleB";

    $(title).textContent=file.name;

    /* video */

    if(file.type.startsWith("video/")){

        const video=$("videoPlayer");

        video.src=deck.url;

        video.style.display="block";

        $("videoPlaceholder").style.display="none";

    }

}


/* =========================================================
   FILE INPUT
========================================================= */

$("loadA").onclick = ()=>{

    $("fileInput").dataset.deck="A";

    $("fileInput").click();

};


$("loadB").onclick = ()=>{

    $("fileInput").dataset.deck="B";

    $("fileInput").click();

};


$("fileInput").onchange = event=>{

    const files =
        [...event.target.files];

    if(!files.length)
        return;

    files.forEach(file=>{

        addToLibrary(file);

    });

    const deck =
        event.target.dataset.deck==="B"
        ? decks.B
        : decks.A;

    loadFile(deck,files[0]);

    event.target.value="";

};


/* =========================================================
   CARPETA
========================================================= */

$("folderBtn").onclick = ()=>{

    $("folderInput").click();

};


$("folderInput").onchange = event=>{

    [...event.target.files]
        .forEach(file=>{

            if(
                file.type.startsWith("audio/") ||
                file.type.startsWith("video/")
            ){

                addToLibrary(file);

            }

        });

    event.target.value="";

};


/* =========================================================
   BIBLIOTECA
========================================================= */

$("filesBtn").onclick=()=>{

    $("fileInput").dataset.deck="";

    $("fileInput").click();

};


function addToLibrary(file){

    const exists =
        library.some(
            item=>item.name===file.name &&
            item.size===file.size
        );

    if(exists)
        return;

    library.push(file);

    renderLibrary();

}


function renderLibrary(){

    const container=$("libraryList");

    container.innerHTML="";

    const search =
        $("search").value.toLowerCase();

    const genre =
        $("genreFilter").value.toLowerCase();


    const filtered =
        library.filter(file=>{

            const name =
                file.name.toLowerCase();

            const matchSearch =
                !search ||
                name.includes(search);

            const matchGenre =
                genre==="all" ||
                name.includes(genre);

            return matchSearch && matchGenre;

        });


    if(!filtered.length){

        container.innerHTML=`

            <div class="empty-library">

                🎵

                <p>
                    No hay pistas que coincidan
                </p>

            </div>

        `;

        return;

    }


    filtered.forEach((file,index)=>{

        const row =
            document.createElement("div");

        row.className="track";


        const icon =
            file.type.startsWith("video/")
            ? "🎬"
            : "🎵";


        row.innerHTML=`

            <div class="track-icon">
                ${icon}
            </div>

            <div>

                <div class="track-name">
                    ${escapeHTML(file.name)}
                </div>

                <div class="track-type">
                    ${file.type || "archivo multimedia"}
                </div>

            </div>

            <button class="load-a">
                A
            </button>

            <button class="load-b">
                B
            </button>

        `;


        row.querySelector(".load-a")
            .onclick=()=>{
                loadFile(decks.A,file);
            };


        row.querySelector(".load-b")
            .onclick=()=>{
                loadFile(decks.B,file);
            };


        container.appendChild(row);

    });

}


function escapeHTML(text){

    const div =
        document.createElement("div");

    div.textContent=text;

    return div.innerHTML;

}


$("search").oninput=renderLibrary;

$("genreFilter").onchange=renderLibrary;


/* =========================================================
   PLAY / PAUSE
========================================================= */

$("playA").onclick=()=>playDeck(decks.A);

$("playB").onclick=()=>playDeck(decks.B);

$("pauseA").onclick=()=>pauseDeck(decks.A);

$("pauseB").onclick=()=>pauseDeck(decks.B);


function playDeck(deck){

    if(!deck.audio)
        return;

    deck.audio.play()
        .catch(error=>{
            console.log(error);
        });

}


function pauseDeck(deck){

    if(deck.audio)
        deck.audio.pause();

}


/* =========================================================
   CUE
========================================================= */

$("cueA").onclick=()=>cue(decks.A);

$("cueB").onclick=()=>cue(decks.B);


function cue(deck){

    if(!deck.audio)
        return;

    deck.audio.currentTime=0;

    deck.cueTime=0;

}


/* =========================================================
   VOLUMEN
========================================================= */

$("volumeA").oninput=e=>{

    decks.A.volume=
        Number(e.target.value);

    if(decks.A.audio)
        decks.A.audio.volume=
            decks.A.volume;

};


$("volumeB").oninput=e=>{

    decks.B.volume=
        Number(e.target.value);

    if(decks.B.audio)
        decks.B.audio.volume=
            decks.B.volume;

};


/* =========================================================
   PITCH
========================================================= */

$("pitchA").oninput=e=>{

    if(decks.A.audio){

        decks.A.audio.playbackRate =
            1 +
            Number(e.target.value)/100;

    }

};


$("pitchB").oninput=e=>{

    if(decks.B.audio){

        decks.B.audio.playbackRate =
            1 +
            Number(e.target.value)/100;

    }

};


/* =========================================================
   CROSSFADER
========================================================= */

$("crossfader").oninput=e=>{

    const value =
        Number(e.target.value);

    const a =
        value<=0
        ? 1
        : 1-value;

    const b =
        value>=0
        ? 1
        : 1+value;


    if(decks.A.audio)
        decks.A.audio.volume=
            decks.A.volume*a;

    if(decks.B.audio)
        decks.B.audio.volume=
            decks.B.volume*b;

};


/* =========================================================
   LOOP
========================================================= */

$("loop").onclick=()=>{

    loopEnabled=!loopEnabled;

    $("loop").textContent =
        loopEnabled
        ? "🔁 LOOP ON"
        : "🔁 LOOP";

};


/* =========================================================
   AUTO DJ
========================================================= */

$("autoDJ").onclick=()=>{

    autoDJ=!autoDJ;

    $("autoDJ").textContent =
        autoDJ
        ? "🤖 AUTO DJ ON"
        : "🤖 AUTO DJ";

    if(autoDJ)
        startAutoDJ();

};


function startAutoDJ(){

    if(!library.length)
        return;

    if(
        !decks.A.audio ||
        decks.A.audio.paused
    ){

        const file =
            library[
                Math.floor(
                    Math.random()*library.length
                )
            ];

        loadFile(decks.A,file);

        playDeck(decks.A);

    }

}


function autoNext(deck){

    if(!library.length)
        return;

    const file =
        library[
            Math.floor(
                Math.random()*library.length
            )
        ];

    loadFile(deck,file);

    playDeck(deck);

}


/* =========================================================
   SHUFFLE
========================================================= */

$("shuffle").onclick=()=>{

    library.sort(
        ()=>Math.random()-.5
    );

    renderLibrary();

};


/* =========================================================
   RECORDING
========================================================= */

$("record").onclick=async()=>{

    if(recorder){

        recorder.stop();

        $("record").textContent="⏺ REC";

        return;

    }


    const stream =
        await navigator.mediaDevices
        .getUserMedia({
            audio:true
        });


    recordedChunks=[];


    recorder =
        new MediaRecorder(stream);


    recorder.ondataavailable=e=>{

        if(e.data.size>0)
            recordedChunks.push(e.data);

    };


    recorder.onstop=()=>{

        const blob =
            new Blob(
                recordedChunks,
                {
                    type:"audio/webm"
                }
            );


        const url =
            URL.createObjectURL(blob);


        const a =
            document.createElement("a");

        a.href=url;

        a.download=
            `HC-PRO-DJ-${Date.now()}.webm`;

        a.click();


        recorder=null;

    };


    recorder.start();

    $("record").textContent="⏹ STOP REC";

};


/* =========================================================
   VISUALIZADOR
========================================================= */

const visualizer=
    $("visualizer");

const vctx=
    visualizer.getContext("2d");


function resizeCanvas(){

    visualizer.width=
        visualizer.clientWidth*
        devicePixelRatio;

    visualizer.height=
        visualizer.clientHeight*
        devicePixelRatio;

}


window.addEventListener(
    "resize",
    resizeCanvas
);

resizeCanvas();


function drawVisualizer(){

    const w=visualizer.width;

    const h=visualizer.height;

    vctx.clearRect(
        0,
        0,
        w,
        h
    );


    const bars=70;

    const gap=3;

    const bw=
        (w-bars*gap)/bars;


    for(let i=0;i<bars;i++){

        const t=
            Date.now()/220;

        const wave=
            Math.sin(
                t+i*.35
            );

        const height=
            Math.max(
                5,
                (wave+1)/2*h*.85
            );


        const x=
            i*(bw+gap);


        vctx.fillStyle =
            i%3===0
            ? "#ff6a00"
            : i%3===1
            ? "#00e5ff"
            : "#9b5cff";


        vctx.fillRect(
            x,
            h-height,
            bw,
            height
        );

    }


    requestAnimationFrame(
        drawVisualizer
    );

}

drawVisualizer();


/* =========================================================
   WAVEFORMS
========================================================= */

function animateWave(canvas){

    const ctx=canvas.getContext("2d");


    function draw(){

        const w=canvas.width=
            canvas.clientWidth*
            devicePixelRatio;

        const h=canvas.height=
            canvas.clientHeight*
            devicePixelRatio;


        ctx.clearRect(
            0,
            0,
            w,
            h
        );


        ctx.beginPath();


        for(
            let x=0;
            x<w;
            x+=4
        ){

            const y=
                h/2+
                Math.sin(
                    x*.03+
                    Date.now()/300
                )*
                h*.25;


            if(x===0)
                ctx.moveTo(x,y);
            else
                ctx.lineTo(x,y);

        }


        ctx.strokeStyle="#00e5ff";

        ctx.lineWidth=2;

        ctx.stroke();


        requestAnimationFrame(draw);

    }


    draw();

}


animateWave(
    $("waveA")
    .querySelector("canvas")
);

animateWave(
    $("waveB")
    .querySelector("canvas")
);


/* =========================================================
   VU METERS
========================================================= */

function updateVU(){

    const a=
        decks.A.playing
        ? 20+Math.random()*80
        : 3;

    const b=
        decks.B.playing
        ? 20+Math.random()*80
        : 3;


    $("vuA").style.width=
        `${a}%`;

    $("vuB").style.width=
        `${b}%`;


    requestAnimationFrame(updateVU);

}

updateVU();


/* =========================================================
   TECLADO
========================================================= */

document.addEventListener(
    "keydown",
    event=>{

        if(event.target.tagName==="INPUT")
            return;


        switch(event.code){

            case "Space":

                event.preventDefault();

                if(decks.A.playing)
                    pauseDeck(decks.A);
                else
                    playDeck(decks.A);

                break;


            case "KeyA":

                playDeck(decks.A);

                break;


            case "KeyB":

                playDeck(decks.B);

                break;


            case "KeyL":

                $("loop").click();

                break;


            case "KeyR":

                $("record").click();

                break;

        }

    }
);


/* =========================================================
   GUARDAR CONFIGURACIÓN
========================================================= */

window.addEventListener(
    "beforeunload",
    ()=>{

        localStorage.setItem(
            "hcpro-master",
            $("masterVolume").value
        );

    }
);


const savedMaster =
    localStorage.getItem(
        "hcpro-master"
    );


if(savedMaster){

    $("masterVolume").value=
        savedMaster;

}


/* =========================================================
   MASTER VOLUME
========================================================= */

$("masterVolume").oninput=e=>{

    const master=
        Number(e.target.value);


    if(decks.A.audio)
        decks.A.audio.volume=
            decks.A.volume*master;


    if(decks.B.audio)
        decks.B.audio.volume=
            decks.B.volume*master;

};
