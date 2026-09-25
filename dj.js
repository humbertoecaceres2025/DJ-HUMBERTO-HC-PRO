"use strict";

/* =========================================================
   DJ HUMBERTO 3.2.1
   HC PRO PROFESSIONAL DJ SYSTEM
========================================================= */

const $ = id => document.getElementById(id);

const state = {

  started:false,

  active:"A",

  autoDJ:false,

  transition:"crossfade",

  audio:null,

  master:null,

  musicBus:null,

  idBus:null,

  analyser:null,

  recordDestination:null,

  recorder:null,

  chunks:[],

  mic:null,

  idTimer:null,

  voiceIds:[],

  library:[],

  history:[],

  decks:{}

};


/* =========================================================
   UTILIDADES
========================================================= */

function formatTime(seconds){

  if(!Number.isFinite(seconds)){
    return "00:00";
  }

  seconds=Math.max(0,Math.floor(seconds));

  const min=String(Math.floor(seconds/60)).padStart(2,"0");

  const sec=String(seconds%60).padStart(2,"0");

  return `${min}:${sec}`;

}


function escapeHTML(text){

  return String(text||"").replace(/[&<>"']/g,char=>({

    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"

  }[char]));

}


/* =========================================================
   INICIAR SISTEMA
========================================================= */

$("startAudioBtn").addEventListener("click",startSystem);


async function startSystem(){

  if(state.started)return;

  try{

    const AudioContext=
      window.AudioContext||
      window.webkitAudioContext;

    state.audio=new AudioContext();

    state.master=
      state.audio.createGain();

    state.master.gain.value=.85;

    state.musicBus=
      state.audio.createGain();

    state.musicBus.gain.value=1;

    state.idBus=
      state.audio.createGain();

    state.idBus.gain.value=.8;

    state.analyser=
      state.audio.createAnalyser();

    state.analyser.fftSize=1024;

    state.recordDestination=
      state.audio.createMediaStreamDestination();

    state.musicBus
      .connect(state.analyser)
      .connect(state.master);

    state.idBus
      .connect(state.master);

    state.master
      .connect(state.audio.destination);

    state.master
      .connect(state.recordDestination);

    createDeck("A");
    createDeck("B");

    await state.audio.resume();

    state.started=true;

    $("bootOverlay").classList.add("hidden");

    $("app").classList.remove("hidden");

    $("systemState").textContent=
      "● SISTEMA ONLINE";

    startClock();

    bindControls();

    startVisualizer();

  }catch(error){

    $("bootMsg").textContent=
      "Error al iniciar audio: "+error.message;

  }

}


/* =========================================================
   DECK
========================================================= */

function createDeck(id){

  const media=$("media"+id);

  const source=
    state.audio.createMediaElementSource(media);

  const gain=
    state.audio.createGain();

  const low=
    state.audio.createBiquadFilter();

  const mid=
    state.audio.createBiquadFilter();

  const high=
    state.audio.createBiquadFilter();

  const filter=
    state.audio.createBiquadFilter();

  const analyser=
    state.audio.createAnalyser();

  low.type="lowshelf";
  low.frequency.value=180;

  mid.type="peaking";
  mid.frequency.value=1100;
  mid.Q.value=.9;

  high.type="highshelf";
  high.frequency.value=5000;

  filter.type="lowpass";
  filter.frequency.value=22000;

  analyser.fftSize=512;

  source
    .connect(gain)
    .connect(low)
    .connect(mid)
    .connect(high)
    .connect(filter)
    .connect(analyser)
    .connect(state.musicBus);

  const deck={

    id,

    media,

    source,

    gain,

    low,

    mid,

    high,

    filter,

    analyser,

    file:null,

    url:null,

    title:"Sin pista",

    bpm:null,

    key:null,

    energy:null,

    fx:{
      filter:false,
      echo:false,
      flanger:false,
      reverb:false
    }

  };

  state.decks[id]=deck;

  media.addEventListener(
    "loadedmetadata",
    ()=>updateDeckUI(id)
  );

  media.addEventListener(
    "timeupdate",
    ()=>updateDeckUI(id)
  );

  media.addEventListener(
    "play",
    ()=>{
      $("platter"+id)
        .classList.add("playing");
    }
  );

  media.addEventListener(
    "pause",
    ()=>{
      $("platter"+id)
        .classList.remove("playing");
    }
  );

  media.addEventListener(
    "ended",
    ()=>deckEnded(id)
  );

}


/* =========================================================
   CONTROLES
========================================================= */

function bindControls(){

  $("fullscreenBtn").onclick=()=>{

    if(document.documentElement.requestFullscreen){

      document.documentElement.requestFullscreen();

    }

  };


  $("masterVolume").oninput=e=>{

    state.master.gain.value=
      Number(e.target.value);

  };


  $("crossfader").oninput=e=>{

    applyCrossfade(
      Number(e.target.value)
    );

  };


  $("transitionMode").onchange=e=>{

    state.transition=e.target.value;

  };


  ["A","B"].forEach(id=>{

    const p=id.toLowerCase();

    $(p+"Load").onchange=e=>{

      const file=e.target.files[0];

      if(file){

        loadDeck(id,file);

      }

    };


    $(p+"Play").onclick=()=>playDeck(id);

    $(p+"Pause").onclick=()=>{

      state.decks[id].media.pause();

    };

    $(p+"Stop").onclick=()=>stopDeck(id);


    $(p+"Progress").oninput=e=>{

      seekDeck(
        id,
        Number(e.target.value)
      );

    };


    $(p+"Gain").oninput=e=>{

      state.decks[id].gain.gain.value=
        Number(e.target.value);

    };


    $(p+"Pitch").oninput=e=>{

      state.decks[id].media.playbackRate=
        Number(e.target.value);

    };


    $(p+"Low").oninput=e=>{

      state.decks[id].low.gain.value=
        Number(e.target.value);

    };


    $(p+"Mid").oninput=e=>{

      state.decks[id].mid.gain.value=
        Number(e.target.value);

    };


    $(p+"High").oninput=e=>{

      state.decks[id].high.gain.value=
        Number(e.target.value);

    };


    $(p+"Filter").oninput=e=>{

      const value=
        Number(e.target.value);

      state.decks[id]
        .filter
        .frequency
        .value=
        300+(22000*value);

    };

  });


  $("masterProgress").oninput=e=>{

    const deck=
      state.decks[state.active];

    if(deck.media.duration){

      deck.media.currentTime=
        deck.media.duration*
        Number(e.target.value)/100;

    }

  };


  $("autoDJ").onclick=toggleAutoDJ;

  $("prepareNext").onclick=prepareNext;

  $("smartAnalyze").onclick=analyzeCurrent;

  $("findNext").onclick=findNext;

  $("smartPlaylist").onclick=smartPlaylist;


  $("libraryInput").onchange=e=>{

    addFiles([...e.target.files]);

  };


  $("folderInput").onchange=e=>{

    addFiles([...e.target.files]);

  };


  $("librarySearch").oninput=
    renderLibrary;


  $("clearLibrary").onclick=()=>{

    state.library=[];

    renderLibrary();

  };


  $("loadVoiceIds").onclick=
    loadVoiceIds;

  $("playRandomId").onclick=
    playRandomID;


  $("idVolume").oninput=e=>{

    state.idBus.gain.value=
      Number(e.target.value);

  };


  $("autoId").onchange=
    configureIDTimer;

  $("idInterval").onchange=
    configureIDTimer;


  $("micToggle").onclick=
    toggleMicrophone;


  $("recordStart").onclick=
    startRecording;

  $("recordStop").onclick=
    stopRecording;


  $("cueA").onclick=()=>{

    state.decks.A.media.currentTime=0;

  };


  $("cueB").onclick=()=>{

    state.decks.B.media.currentTime=0;

  };


  $("clearHistory").onclick=()=>{

    state.history=[];

  };


  $("savePlaylist").onclick=
    savePlaylist;


  document
    .querySelectorAll("[data-fx]")
    .forEach(button=>{

      button.onclick=()=>{

        toggleFX(
          button.dataset.deck,
          button.dataset.fx,
          button
        );

      };

    });


  document.addEventListener(
    "keydown",
    keyboard
  );

}


/* =========================================================
   CARGAR DECK
========================================================= */

function loadDeck(id,file){

  const deck=state.decks[id];

  if(deck.url){

    URL.revokeObjectURL(deck.url);

  }

  deck.file=file;

  deck.url=
    URL.createObjectURL(file);

  deck.media.src=deck.url;

  deck.media.load();

  deck.title=
    file.name.replace(/\.[^.]+$/,"");

  deck.bpm=
    estimateBPM(deck.title);

  deck.key=
    estimateKey(deck.title);

  deck.energy=
    estimateEnergy(deck.title);

  renderDeckTitle(id);

  showVideo(file,deck.url);

  state.active=id;

  setNowPlaying(id);

  addLibrary(file,deck.url);

}


/* =========================================================
   REPRODUCCIÓN
========================================================= */

async function playDeck(id){

  const deck=state.decks[id];

  if(!deck.url)return;

  try{

    await state.audio.resume();

    await deck.media.play();

    state.active=id;

    setNowPlaying(id);

  }catch(error){

    $("systemState").textContent=
      "● PERMITIR AUDIO";

  }

}


function stopDeck(id){

  const media=
    state.decks[id].media;

  media.pause();

  media.currentTime=0;

}


function seekDeck(id,value){

  const media=
    state.decks[id].media;

  if(media.duration){

    media.currentTime=
      media.duration*value/100;

  }

}


/* =========================================================
   UI DECK
========================================================= */

function updateDeckUI(id){

  const deck=state.decks[id];

  const media=deck.media;

  const p=id.toLowerCase();

  $(p+"Time").textContent=
    formatTime(media.currentTime);

  $(p+"Duration").textContent=
    formatTime(media.duration);

  $(p+"Progress").value=
    media.duration
      ? media.currentTime/media.duration*100
      : 0;

  if(id===state.active){

    $("masterProgress").value=
      media.duration
        ? media.currentTime/media.duration*100
        : 0;

    $("masterTime").textContent=
      formatTime(media.currentTime)+
      " / "+
      formatTime(media.duration);

  }

}


function renderDeckTitle(id){

  const deck=state.decks[id];

  const p=id.toLowerCase();

  $(p+"Title").textContent=
    deck.title;

  $(p+"Bpm").textContent=
    (deck.bpm||"--")+" BPM";

}


function setNowPlaying(id){

  const deck=state.decks[id];

  $("activeDeck").textContent=
    "DECK "+id+" • EN REPRODUCCIÓN";

  $("nowTitle").textContent=
    deck.title;

  $("nowArtist").textContent=
    "DJ HUMBERTO • HC PRO";

  $("smartCurrentBpm").textContent=
    deck.bpm||"--";

  $("smartCurrentKey").textContent=
    deck.key||"--";

  $("smartCurrentEnergy").textContent=
    deck.energy||"--";

}


/* =========================================================
   VIDEO
========================================================= */

function showVideo(file,url){

  const video=$("videoPlayer");

  if(file.type.startsWith("video/")){

    video.src=url;

    video.style.display="block";

    $("screenPlaceholder")
      .style.display="none";

    video.play().catch(()=>{});

  }else{

    video.pause();

    video.removeAttribute("src");

    video.load();

    video.style.display="none";

    $("screenPlaceholder")
      .style.display="block";

  }

}


/* =========================================================
   CROSSFADER
========================================================= */

function applyCrossfade(value){

  const a=state.decks.A;

  const b=state.decks.B;

  if(!a||!b)return;

  if(state.transition==="cut"){

    a.gain.gain.value=
      value<.5?1:0;

    b.gain.gain.value=
      value>=.5?1:0;

  }else{

    a.gain.gain.value=
      Math.cos(value*Math.PI/2);

    b.gain.gain.value=
      Math.cos((1-value)*Math.PI/2);

  }

}


/* =========================================================
   FIN DE PISTA
========================================================= */

function deckEnded(id){

  $("platter"+id)
    .classList.remove("playing");

  state.history.push(
    state.decks[id].title
  );

  if(state.autoDJ){

    setTimeout(
      prepareNext,
      500
    );

  }

}


/* =========================================================
   LIBRARY
========================================================= */

function addLibrary(file,url){

  if(
    state.library.some(
      item=>item.file===file
    )
  )return;

  state.library.push({

    file,

    url,

    title:file.name
      .replace(/\.[^.]+$/,""),

    bpm:estimateBPM(file.name),

    key:estimateKey(file.name),

    energy:estimateEnergy(file.name)

  });

  renderLibrary();

}


function addFiles(files){

  files
    .filter(
      file=>
        file.type.startsWith("audio/")||
        file.type.startsWith("video/")
    )
    .forEach(file=>
      addLibrary(file)
    );

}


function renderLibrary(){

  const query=
    $("librarySearch")
      .value
      .toLowerCase();

  const items=
    state.library.filter(
      item=>
        item.title
          .toLowerCase()
          .includes(query)
    );

  $("libraryCount").textContent=
    state.library.length;

  $("libraryBody").innerHTML=
    items.map(item=>{

      const index=
        state.library.indexOf(item);

      return `
        <div class="track">

          <div>
            <b>${escapeHTML(item.title)}</b>
            <br>
            <small>
              ${item.bpm} BPM •
              ${item.key} •
              energía ${item.energy}
            </small>
          </div>

          <button data-load="${index}">
            CARGAR
          </button>

        </div>
      `;

    }).join("")
    ||
    "<div class='recordStatus'>Biblioteca vacía</div>";


  $("libraryBody")
    .querySelectorAll("[data-load]")
    .forEach(button=>{

      button.onclick=()=>{

        const item=
          state.library[
            Number(button.dataset.load)
          ];

        const deck=
          state.active==="A"?"B":"A";

        loadDeck(
          deck,
          item.file
        );

        playDeck(deck);

      };

    });

}


/* =========================================================
   SMART DJ
========================================================= */

function estimateBPM(name){

  const match=
    name.match(
      /(?:^|[\s_-])(\d{2,3})\s*bpm/i
    );

  if(match){

    return Number(match[1]);

  }

  let hash=0;

  for(const char of name){

    hash=
      (hash*31+
       char.charCodeAt(0))%1000;

  }

  return 90+(hash%61);

}


function estimateKey(name){

  const match=
    name.match(
      /\b([A-G](?:#|b)?m?)\b/i
    );

  if(match){

    return match[1]
      .toUpperCase();

  }

  const keys=[
    "C","G","Am",
    "F","Dm","Em","Bb"
  ];

  return keys[
    name.length%keys.length
  ];

}


function estimateEnergy(name){

  let value=0;

  for(const char of name){

    value=
      (value+
       char.charCodeAt(0))%100;

  }

  return 35+(value%66);

}


function analyzeCurrent(){

  const deck=
    state.decks[state.active];

  if(!deck.url)return;

  deck.bpm=
    estimateBPM(deck.title);

  deck.key=
    estimateKey(deck.title);

  deck.energy=
    estimateEnergy(deck.title);

  renderDeckTitle(
    state.active
  );

  setNowPlaying(
    state.active
  );

}


function compatibility(a,b,mode){

  const bpm=
    Math.max(
      0,
      100-
      Math.abs(a.bpm-b.bpm)*5
    );

  let energy;

  if(mode==="energy"){

    energy=
      b.energy>=a.energy
        ?100
        :Math.max(
          0,
          100-
          Math.abs(
            a.energy-b.energy
          )*3
        );

  }else{

    energy=
      Math.max(
        0,
        100-
        Math.abs(
          a.energy-b.energy
        )*2
      );

  }

  const key=
    a.key===b.key
      ?100
      :50;

  return Math.round(
    bpm*.45+
    energy*.30+
    key*.25
  );

}


function findNext(){

  const current=
    state.decks[state.active];

  if(!current.url)return;

  const mode=
    $("smartMode").value;

  const candidates=
    state.library
      .filter(item=>
        item.title!==current.title &&
        !state.history.includes(
          item.title
        )
      )
      .map(item=>({

        ...item,

        score:
          compatibility(
            current,
            item,
            mode
          )

      }))
      .sort(
        (a,b)=>b.score-a.score
      )
      .slice(0,8);


  $("smartResults").innerHTML=
    candidates.map((item,index)=>{

      const libraryIndex=
        state.library.indexOf(item);

      return `
        <div class="result">

          <span>
            ${index+1}.
            ${escapeHTML(item.title)}
            <br>
            <small>
              ${item.bpm} BPM •
              ${item.key} •
              ${item.energy} •
              ${item.score}%
            </small>
          </span>

          <button
            data-smart="${libraryIndex}">
            CARGAR
          </button>

        </div>
      `;

    }).join("")
    ||
    "<div class='recordStatus'>No hay candidatos.</div>";


  $("smartResults")
    .querySelectorAll("[data-smart]")
    .forEach(button=>{

      button.onclick=()=>{

        const item=
          state.library[
            Number(
              button.dataset.smart
            )
          ];

        const deck=
          state.active==="A"?"B":"A";

        loadDeck(
          deck,
          item.file
        );

        playDeck(deck);

      };

    });

}


function smartPlaylist(){

  findNext();

}


/* =========================================================
   AUTO DJ
========================================================= */

function toggleAutoDJ(){

  state.autoDJ=
    !state.autoDJ;

  $("autoDJ").textContent=
    state.autoDJ
      ? "🤖 AUTO DJ ON"
      : "🤖 AUTO DJ OFF";

  if(state.autoDJ){

    prepareNext();

  }

}


function prepareNext(){

  if(!state.library.length)return;

  const current=
    state.decks[state.active];

  const nextDeck=
    state.active==="A"
      ?"B"
      :"A";

  let candidates=
    state.library.filter(item=>
      item.title!==current.title &&
      !state.history.includes(
        item.title
      )
    );

  if(!candidates.length){

    candidates=
      state.library.filter(
        item=>
          item.title!==current.title
      );

  }

  if(!candidates.length)return;

  const mode=
    $("smartMode").value;

  candidates.sort(
    (a,b)=>
      compatibility(
        current,
        b,
        mode
      )-
      compatibility(
        current,
        a,
        mode
      )
  );

  const next=
    candidates[0];

  loadDeck(
    nextDeck,
    next.file
  );

  state.decks[
    nextDeck
  ].media.currentTime=0;

  if(state.autoDJ){

    state.active=nextDeck;

    const cross=
      nextDeck==="B"?1:0;

    $("crossfader").value=
      cross;

    applyCrossfade(cross);

    playDeck(nextDeck);

  }

}


/* =========================================================
   VOICE ID
========================================================= */

$("loadVoiceIds").addEventListener(
  "click",
  loadVoiceIds
);


function loadVoiceIds(){

  const files=
    [...$("voiceIdInput").files];

  files.forEach(file=>{

    const reader=
      new FileReader();

    reader.onload=async()=>{

      try{

        const buffer=
          await state.audio
            .decodeAudioData(
              reader.result
            );

        state.voiceIds.push({

          name:file.name,

          buffer

        });

        renderVoiceIDs();

      }catch(error){

        console.error(error);

      }

    };

    reader.readAsArrayBuffer(file);

  });

}


function renderVoiceIDs(){

  $("voiceList").innerHTML=
    state.voiceIds.map(
      (voice,index)=>`

        <div class="track">

          <span>
            🎙️
            ${escapeHTML(voice.name)}
          </span>

          <button
            data-id="${index}">
            ▶
          </button>

        </div>

      `
    ).join("");

  $("voiceList")
    .querySelectorAll("[data-id]")
    .forEach(button=>{

      button.onclick=()=>{

        playVoiceID(
          Number(button.dataset.id)
        );

      };

    });

}


$("playRandomId").addEventListener(
  "click",
  playRandomID
);


function playRandomID(){

  if(!state.voiceIds.length)return;

  const index=
    Math.floor(
      Math.random()*
      state.voiceIds.length
    );

  playVoiceID(index);

}


function playVoiceID(index){

  const voice=
    state.voiceIds[index];

  if(!voice)return;

  const source=
    state.audio.createBufferSource();

  const gain=
    state.audio.createGain();

  gain.gain.value=
    Number(
      $("idVolume").value
    );

  source.buffer=
    voice.buffer;

  source
    .connect(gain)
    .connect(state.idBus);

  const duck=
    $("idDucking").checked;

  const oldVolume=
    state.musicBus.gain.value;

  if(duck){

    state.musicBus.gain
      .setTargetAtTime(
        .35,
        state.audio.currentTime,
        .05
      );

  }

  source.onended=()=>{

    if(duck){

      state.musicBus.gain
        .setTargetAtTime(
          oldVolume,
          state.audio.currentTime,
          .15
        );

    }

  };

  source.start();

}


function configureIDTimer(){

  clearInterval(
    state.idTimer
  );

  if(
    $("autoId").checked
  ){

    const minutes=
      Number(
        $("idInterval").value
      );

    state.idTimer=
      setInterval(
        playRandomID,
        minutes*60000
      );

  }

}


/* =========================================================
   MICRÓFONO
========================================================= */

async function toggleMicrophone(){

  if(state.mic){

    state.mic
      .getTracks()
      .forEach(track=>
        track.stop()
      );

    state.mic=null;

    $("micToggle").textContent=
      "🎤 MIC OFF";

    return;

  }

  try{

    state.mic=
      await navigator
        .mediaDevices
        .getUserMedia({
          audio:true
        });

    const source=
      state.audio
        .createMediaStreamSource(
          state.mic
        );

    const gain=
      state.audio.createGain();

    gain.gain.value=.8;

    source
      .connect(gain)
      .connect(state.master);

    $("micToggle").textContent=
      "🎤 MIC ON";

  }catch(error){

    alert(
      "No se pudo acceder al micrófono."
    );

  }

}


/* =========================================================
   GRABACIÓN
========================================================= */

function startRecording(){

  if(
    state.recorder &&
    state.recorder.state==="recording"
  )return;

  state.chunks=[];

  let mime=
    "audio/webm;codecs=opus";

  if(
    !MediaRecorder.isTypeSupported(mime)
  ){

    mime="audio/webm";

  }

  try{

    state.recorder=
      new MediaRecorder(
        state.recordDestination.stream,
        {mimeType:mime}
      );

    state.recorder.ondataavailable=
      event=>{

        if(event.data.size){

          state.chunks.push(
            event.data
          );

        }

      };

    state.recorder.onstop=
      saveRecording;

    state.recorder.start();

    $("recordStatus").textContent=
      "🔴 GRABANDO MIX";

  }catch(error){

    $("recordStatus").textContent=
      "Grabación no disponible.";

  }

}


function stopRecording(){

  if(
    state.recorder &&
    state.recorder.state==="recording"
  ){

    state.recorder.stop();

  }

}


function saveRecording(){

  const blob=
    new Blob(
      state.chunks,
      {type:"audio/webm"}
    );

  const link=
    document.createElement("a");

  link.href=
    URL.createObjectURL(blob);

  link.download=
    "DJ-HUMBERTO-MIX-"+Date.now()+".webm";

  link.click();

  $("recordStatus").textContent=
    "Grabación guardada.";

}


/* =========================================================
   FX
========================================================= */

function toggleFX(id,fx,button){

  const deck=
    state.decks[id];

  deck.fx[fx]=
    !deck.fx[fx];

  button.classList.toggle(
    "active",
    deck.fx[fx]
  );

  if(fx==="filter"){

    deck.filter.frequency.value=
      deck.fx[fx]
        ?800
        :22000;

  }

}


/* =========================================================
   PLAYLIST
========================================================= */

function savePlaylist(){

  const playlist=
    state.library.map(
      item=>({

        title:item.title,

        bpm:item.bpm,

        key:item.key,

        energy:item.energy

      })
    );

  const blob=
    new Blob(
      [
        JSON.stringify(
          playlist,
          null,
          2
        )
      ],
      {
        type:"application/json"
      }
    );

  const link=
    document.createElement("a");

  link.href=
    URL.createObjectURL(blob);

  link.download=
    "DJ-HUMBERTO-PLAYLIST.json";

  link.click();

}


/* =========================================================
   TECLADO
========================================================= */

function keyboard(event){

  if(
    ["INPUT","SELECT","BUTTON"]
      .includes(
        document.activeElement.tagName
      )
  )return;


  if(event.code==="Space"){

    event.preventDefault();

    const deck=
      state.decks[state.active];

    if(deck.media.paused){

      playDeck(state.active);

    }else{

      deck.media.pause();

    }

  }


  if(
    event.key.toLowerCase()==="a"
  ){

    state.active="A";

    setNowPlaying("A");

  }


  if(
    event.key.toLowerCase()==="b"
  ){

    state.active="B";

    setNowPlaying("B");

  }


  if(
    event.key.toLowerCase()==="r"
  ){

    if(
      state.recorder &&
      state.recorder.state==="recording"
    ){

      stopRecording();

    }else{

      startRecording();

    }

  }


  if(event.key==="ArrowLeft"){

    const slider=
      $("crossfader");

    slider.value=
      Math.max(
        0,
        Number(slider.value)-.05
      );

    applyCrossfade(
      Number(slider.value)
    );

  }


  if(event.key==="ArrowRight"){

    const slider=
      $("crossfader");

    slider.value=
      Math.min(
        1,
        Number(slider.value)+.05
      );

    applyCrossfade(
      Number(slider.value)
    );

  }


  if(event.key==="ArrowUp"){

    const slider=
      $("masterVolume");

    slider.value=
      Math.min(
        1,
        Number(slider.value)+.05
      );

    state.master.gain.value=
      Number(slider.value);

  }


  if(event.key==="ArrowDown"){

    const slider=
      $("masterVolume");

    slider.value=
      Math.max(
        0,
        Number(slider.value)-.05
      );

    state.master.gain.value=
      Number(slider.value);

  }

}


/* =========================================================
   RELOJ
========================================================= */

function startClock(){

  updateClock();

  setInterval(
    updateClock,
    1000
  );

}


function updateClock(){

  $("clock").textContent=
    new Intl.DateTimeFormat(
      "es-AR",
      {
        timeZone:
          "America/Argentina/La_Rioja",

        hour:"2-digit",

        minute:"2-digit",

        second:"2-digit"

      }
    ).format(
      new Date()
    );

}


/* =========================================================
   VISUALIZADOR
========================================================= */

function startVisualizer(){

  const canvas=
    $("visualizer");

  const context=
    canvas.getContext("2d");

  const analyser=
    state.analyser;

  const data=
    new Uint8Array(
      analyser.frequencyBinCount
    );


  function draw(){

    requestAnimationFrame(draw);

    analyser.getByteFrequencyData(
      data
    );

    canvas.width=
      canvas.clientWidth*
      devicePixelRatio;

    canvas.height=
      canvas.clientHeight*
      devicePixelRatio;

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    const step=
      canvas.width/
      data.length;

    context.beginPath();

    data.forEach(
      (value,index)=>{

        const y=
          canvas.height-
          (value/255)*
          canvas.height*.9;

        if(index===0){

          context.moveTo(
            0,
            y
          );

        }else{

          context.lineTo(
            index*step,
            y
          );

        }

      }
    );

    context.strokeStyle=
      "#55eaff";

    context.lineWidth=
      2*devicePixelRatio;

    context.stroke();


    ["A","B"].forEach(id=>{

      const deck=
        state.decks[id];

      const buffer=
        new Uint8Array(
          deck.analyser.frequencyBinCount
        );

      deck.analyser
        .getByteFrequencyData(
          buffer
        );

      const average=
        buffer.reduce(
          (a,b)=>a+b,
          0
        )/
        buffer.length;

      $("meter"+id)
        .style.height=
          Math.max(
            2,
            Math.min(
              100,
              average/255*150
            )
          )+"%";

    });

  }

  draw();

}

