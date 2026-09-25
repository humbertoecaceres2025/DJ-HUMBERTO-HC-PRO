"use strict";

/*
==========================================================
 DJ HUMBERTO 3.2.2 PRO
 HC PRO PROFESSIONAL DJ SYSTEM
==========================================================
*/


/* =====================================================
   UTILIDADES
===================================================== */

const $ = id => document.getElementById(id);

const state = {

  started:false,

  audio:null,

  master:null,

  analyser:null,

  recordDestination:null,

  recorder:null,

  recordingChunks:[],

  micStream:null,

  micOn:false,

  autoDJ:false,

  activeDeck:"A",

  library:[],

  voiceBuffer:null,

  voiceVolume:.7,

  decks:{}

};


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


function randomNumber(min,max){

  return Math.floor(
    Math.random() * (max-min+1)
  ) + min;

}


function safeText(text){

  return String(text).replace(
    /[&<>"']/g,
    character => {

      const map = {

        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#039;"

      };

      return map[character];

    }
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
          timeZone:"America/Argentina/La_Rioja"
        }
      ).format(new Date());

  }catch(error){

    $("clock").textContent =
      new Date().toLocaleTimeString(
        "es-AR",
        {hour12:false}
      );

  }

}


/* =====================================================
   INICIO
===================================================== */

async function startSystem(){

  if(state.started){

    return;

  }

  const message =
    $("bootMessage");

  try{

    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if(!AudioContext){

      throw new Error(
        "Este navegador no permite Web Audio."
      );

    }

    state.audio =
      new AudioContext();


    /* MASTER */

    state.master =
      state.audio.createGain();

    state.master.gain.value =
      Number($("master").value) / 100;


    /* ANALYSER */

    state.analyser =
      state.audio.createAnalyser();

    state.analyser.fftSize = 1024;


    /* GRABACIÓN */

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


    await state.audio.resume();


    state.started = true;


    $("systemStatus").textContent =
      "● SISTEMA ONLINE";

    $("systemStatus").style.color =
      "#00f5a0";


    message.textContent =
      "Sistema de audio activado";


    $("bootScreen").classList.add(
      "hidden"
    );


    startVisualizer();


  }catch(error){

    console.error(
      "DJ HUMBERTO:",
      error
    );


    /*
      IMPORTANTE:
      La aplicación NO queda bloqueada
      aunque el audio no pueda iniciarse.
    */

    message.textContent =
      "Interfaz activa. Pulsa nuevamente si deseas activar el audio.";

    $("systemStatus").textContent =
      "● MODO VISUAL";

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
    state.audio.createMediaElementSource(
      audioElement
    );


  const gain =
    state.audio.createGain();


  const low =
    state.audio.createBiquadFilter();

  low.type =
    "lowshelf";

  low.frequency.value =
    180;


  const mid =
    state.audio.createBiquadFilter();

  mid.type =
    "peaking";

  mid.frequency.value =
    1000;

  mid.Q.value =
    1;


  const high =
    state.audio.createBiquadFilter();

  high.type =
    "highshelf";

  high.frequency.value =
    4500;


  source
    .connect(low)
    .connect(mid)
    .connect(high)
    .connect(gain)
    .connect(state.master);


  state.decks[deckName] = {

    audio:audioElement,

    source,

    gain,

    low,

    mid,

    high,

    file:null,

    url:null,

    bpm:null,

    key:null,

    energy:null

  };


  audioElement.addEventListener(
    "play",
    () => {

      setDeckPlaying(
        deckName,
        true
      );

      state.activeDeck =
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


      if(state.autoDJ){

        automaticNext(
          deckName
        );

      }

    }
  );

}


/* =====================================================
   CARGAR PISTA
===================================================== */

function loadTrack(file,deckName){

  if(!file){

    return;

  }


  if(!state.started){

    $("bootMessage").textContent =
      "Primero pulsa INICIAR DJ HUMBERTO.";

    return;

  }


  const deck =
    state.decks[deckName];


  if(!deck){

    return;

  }


  if(deck.url){

    URL.revokeObjectURL(
      deck.url
    );

  }


  const url =
    URL.createObjectURL(file);


  deck.url = url;

  deck.file = file;

  deck.audio.src = url;

  deck.audio.load();


  /*
     Valores simulados de análisis.
     El navegador no calcula BPM real
     de forma fiable sin procesamiento
     adicional.
  */

  deck.bpm =
    randomNumber(90,150);

  const keys = [
    "Am","Bm","Cm","Dm",
    "Em","Fm","Gm",
    "C","D","E","F","G"
  ];

  deck.key =
    keys[
      randomNumber(
        0,
        keys.length-1
      )
    ];

  deck.energy =
    randomNumber(40,100);


  $("title"+deckName)
    .textContent =
    cleanName(file.name);


  $("info"+deckName)
    .textContent =
    `BPM ${deck.bpm} • KEY ${deck.key} • ENERGY ${deck.energy}%`;


  $("deckStatus"+deckName)
    .textContent =
    "LOADED";


  /*
     Mostrar video cuando corresponda.
  */

  const video =
    $("videoPlayer");


  if(file.type.startsWith("video/")){

    video.src = url;

    video.style.display =
      "block";

  }else{

    video.pause();

    video.removeAttribute(
      "src"
    );

    video.style.display =
      "none";

  }


  updateSmart(
    deckName
  );

}


/* =====================================================
   PLAY
===================================================== */

async function playDeck(deckName){

  const deck =
    state.decks[deckName];


  if(!deck || !deck.file){

    $("bootMessage").textContent =
      "Carga una pista primero.";

    return;

  }


  try{

    await state.audio.resume();

    await deck.audio.play();

    state.activeDeck =
      deckName;

  }catch(error){

    console.error(error);

    $("bootMessage").textContent =
      "El navegador bloqueó el audio. Pulsa PLAY nuevamente.";

  }

}


/* =====================================================
   STOP
===================================================== */

function stopDeck(deckName){

  const deck =
    state.decks[deckName];

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

  const deckElement =
    $("deck"+deckName);

  const status =
    $("deckStatus"+deckName);


  deckElement.classList.toggle(
    "playing",
    playing
  );


  status.textContent =
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
    state.decks[deckName];


  if(!deck || !deck.file){

    return;

  }


  $("nowTitle")
    .textContent =
    cleanName(deck.file.name);


  $("nowInfo")
    .textContent =
    `DECK ${deckName} • ${deck.bpm} BPM • ${deck.key}`;


  updateSmart(
    deckName
  );

}


/* =====================================================
   TIEMPO
===================================================== */

function updateTime(
  deckName
){

  const deck =
    state.decks[deckName];


  if(!deck){

    return;

  }


  const timeOutput =
    $("time"+deckName);

  const seek =
    $("seek"+deckName);


  timeOutput.textContent =
    formatTime(
      deck.audio.currentTime
    );


  if(
    deck.audio.duration &&
    Number.isFinite(
      deck.audio.duration
    )
  ){

    seek.value =
      (
        deck.audio.currentTime /
        deck.audio.duration
      ) * 100;

  }

}


/* =====================================================
   CROSSFADE
===================================================== */

function updateCrossfader(){

  if(!state.decks.A ||
     !state.decks.B){

    return;

  }


  const value =
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
     Curva suave de crossfader.
  */

  state.decks.A.gain.gain.value =
    Math.cos(
      value * Math.PI / 2
    ) * volumeA;


  state.decks.B.gain.gain.value =
    Math.cos(
      (1-value) * Math.PI / 2
    ) * volumeB;

}


/* =====================================================
   VOLUMEN DECK
===================================================== */

function updateDeckVolume(
  deckName
){

  const deck =
    state.decks[deckName];


  if(!deck){

    return;

  }


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
   PITCH
===================================================== */

function updatePitch(
  deckName
){

  const deck =
    state.decks[deckName];


  if(!deck){

    return;

  }


  const value =
    Number(
      $("pitch"+deckName).value
    );


  $("pitch"+deckName+"Value")
    .textContent =
    value + "%";


  deck.audio.playbackRate =
    1 + value / 100;

}


/* =====================================================
   SEEK
===================================================== */

function seekDeck(
  deckName
){

  const deck =
    state.decks[deckName];


  if(
    !deck ||
    !deck.audio.duration
  ){

    return;

  }


  const percentage =
    Number(
      $("seek"+deckName).value
    );


  deck.audio.currentTime =
    deck.audio.duration *
    percentage / 100;

}


/* =====================================================
   EQ
===================================================== */

function updateEQ(){

  ["A","B"].forEach(
    deckName => {

      const deck =
        state.decks[deckName];

      if(!deck){

        return;

      }


      deck.low.gain.value =
        Number(
          $("low").value
        );


      deck.mid.gain.value =
        Number(
          $("mid").value
        );


      deck.high.gain.value =
        Number(
          $("high").value
        );

    }
  );

}


/* =====================================================
   MASTER
===================================================== */

function updateMaster(){

  if(!state.master){

    return;

  }


  const value =
    Number(
      $("master").value
    );


  state.master.gain.value =
    value / 100;


  $("masterValue")
    .textContent =
    value + "%";

}


/* =====================================================
   SMART DJ
===================================================== */

function updateSmart(
  deckName
){

  const deck =
    state.decks[deckName];


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
   SIGUIENTE INTELIGENTE
===================================================== */

function smartNext(){

  if(!state.library.length){

    $("smartStatus").textContent =
      "AGREGA MÚSICA";

    return;

  }


  const nextDeck =
    state.activeDeck === "A"
      ? "B"
      : "A";


  const item =
    state.library[
      randomNumber(
        0,
        state.library.length-1
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
    `SIGUIENTE → DECK ${nextDeck}`;

}


/* =====================================================
   AUTO DJ
===================================================== */

function toggleAutoDJ(){

  state.autoDJ =
    !state.autoDJ;


  $("autoDj").textContent =
    state.autoDJ
      ? "🤖 AUTO DJ ON"
      : "🤖 AUTO DJ OFF";


  $("smartStatus").textContent =
    state.autoDJ
      ? "AUTO DJ ACTIVADO"
      : "AUTO DJ OFF";

}


function automaticNext(
  finishedDeck
){

  if(!state.library.length){

    return;

  }


  const nextDeck =
    finishedDeck === "A"
      ? "B"
      : "A";


  const item =
    state.library[
      randomNumber(
        0,
        state.library.length-1
      )
    ];


  loadTrack(
    item.file,
    nextDeck
  );


  setTimeout(
    () => {

      playDeck(
        nextDeck
      );

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

function addMusicFiles(
  files
){

  const selected =
    Array.from(files);


  selected.forEach(
    file => {

      state.library.push({
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
    state.library.length +
    " PISTAS";


  library.innerHTML =
    "";


  if(!state.library.length){

    library.innerHTML =
      `<div class="library-empty">
        No hay pistas cargadas.
      </div>`;

    return;

  }


  state.library.forEach(
    (item,index) => {

      const element =
        document.createElement(
          "div"
        );


      element.className =
        "library-item";


      element.innerHTML = `
        <strong>
          ${safeText(
            cleanName(
              item.file.name
            )
          )}
        </strong>

        <small>
          ${safeText(
            item.file.type ||
            "audio"
          )}
          •
          ${(
            item.file.size /
            1048576
          ).toFixed(1)}
          MB
        </small>
      `;


      element.addEventListener(
        "click",
        () => {

          loadTrack(
            item.file,
            state.activeDeck
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
      state.library.length - 1;
    i > 0;
    i--
  ){

    const j =
      randomNumber(0,i);


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
   GRABACIÓN
===================================================== */

function toggleRecording(){

  if(!state.recordDestination){

    return;

  }


  if(
    !state.recorder
  ){

    let mime = "";


    if(
      window.MediaRecorder &&
      MediaRecorder.isTypeSupported &&
      MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus"
      )
    ){

      mime =
        "audio/webm;codecs=opus";

    }


    try{

      state.recorder =
        new MediaRecorder(
          state.recordDestination.stream,
          mime
            ? {mimeType:mime}
            : undefined
        );

    }catch(error){

      state.recorder =
        new MediaRecorder(
          state.recordDestination.stream
        );

    }


    state.recordingChunks =
      [];


    state.recorder.ondataavailable =
      event => {

        if(event.data.size){

          state.recordingChunks.push(
            event.data
          );

        }

      };


    state.recorder.onstop =
      saveRecording;


    state.recorder.start();


    $("recordButton").textContent =
      "■ DETENER GRABACIÓN";

    $("recordStatus").textContent =
      "REC ON";

    return;

  }


  state.recorder.stop();

  state.recorder =
    null;


  $("recordButton").textContent =
    "● GRABAR MIX";

  $("recordStatus").textContent =
    "REC OFF";

}


function saveRecording(){

  const blob =
    new Blob(
      state.recordingChunks,
      {
        type:
          state.recordingChunks[0]?.type ||
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
    () => URL.revokeObjectURL(url),
    1000
  );

}


/* =====================================================
   MICRÓFONO
===================================================== */

async function toggleMicrophone(){

  if(state.micOn){

    if(state.micStream){

      state.micStream
        .getTracks()
        .forEach(
          track =>
            track.stop()
        );

    }


    state.micOn =
      false;


    $("micButton").textContent =
      "🎤 MIC OFF";

    return;

  }


  if(
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ){

    $("bootMessage").textContent =
      "Este navegador no permite acceder al micrófono.";

    return;

  }


  try{

    state.micStream =
      await navigator.mediaDevices.getUserMedia(
        {
          audio:true
        }
      );


    const micSource =
      state.audio.createMediaStreamSource(
        state.micStream
      );


    const micGain =
      state.audio.createGain();


    micGain.gain.value =
      .8;


    micSource
      .connect(micGain)
      .connect(state.master);


    state.micOn =
      true;


    $("micButton").textContent =
      "🎤 MIC ON";


  }catch(error){

    console.error(error);

    $("bootMessage").textContent =
      "No se pudo activar el micrófono.";

  }

}


/* =====================================================
   VOICE ID
===================================================== */

async function loadVoiceID(
  file
){

  if(!file ||
     !state.audio){

    return;

  }


  try{

    const arrayBuffer =
      await file.arrayBuffer();


    state.voiceBuffer =
      await state.audio.decodeAudioData(
        arrayBuffer
      );


    $("voiceStatus").textContent =
      "ID LISTO";

  }catch(error){

    console.error(error);

    $("voiceStatus").textContent =
      "ERROR";

  }

}


function playVoiceID(){

  if(!state.voiceBuffer){

    return;

  }


  const source =
    state.audio.createBufferSource();


  const gain =
    state.audio.createGain();


  source.buffer =
    state.voiceBuffer;


  gain.gain.value =
    state.voiceVolume;


  source
    .connect(gain)
    .connect(state.master);


  source.start();

}


/* =====================================================
   VISUALIZADOR
===================================================== */

function startVisualizer(){

  const canvas =
    $("visualizer");


  const context =
    canvas.getContext("2d");


  const data =
    new Uint8Array(
      state.analyser.frequencyBinCount
    );


  function resize(){

    const ratio =
      window.devicePixelRatio || 1;


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


    state.analyser.getByteFrequencyData(
      data
    );


    const bars = 80;

    const barWidth =
      width / bars;


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
        data[index] / 255;


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
        context.createLinearGradient(
          0,
          height,
          0,
          y
        );


      gradient.addColorStop(
        0,
        "#00eaff"
      );


      gradient.addColorStop(
        1,
        "#8b5cff"
      );


      context.fillStyle =
        gradient;


      context.fillRect(
        x,
        y,
        Math.max(
          2,
          barWidth-2
        ),
        barHeight
      );

    }

  }


  draw();

}


/* =====================================================
   EFECTOS VISUALES
===================================================== */

function setupEffects(){

  document
    .querySelectorAll(
      "[data-effect]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            button.classList.toggle(
              "active"
            );

          }
        );

      }
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
          "input"
        )
      ){

        return;

      }


      if(
        event.code === "Space"
      ){

        event.preventDefault();


        const deck =
          state.decks[
            state.activeDeck
          ];


        if(!deck){

          return;

        }


        if(deck.audio.paused){

          playDeck(
            state.activeDeck
          );

        }else{

          deck.audio.pause();

        }

      }


      if(
        event.key.toLowerCase() === "a"
      ){

        playDeck("A");

      }


      if(
        event.key.toLowerCase() === "b"
      ){

        playDeck("B");

      }


      if(
        event.key.toLowerCase() === "r"
      ){

        toggleRecording();

      }

    }
  );

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
      () => $("fileA").click()
    );


  $("fileA")
    .addEventListener(
      "change",
      event => {

        loadTrack(
          event.target.files[0],
          "A"
        );

      }
    );


  $("loadB")
    .addEventListener(
      "click",
      () => $("fileB").click()
    );


  $("fileB")
    .addEventListener(
      "change",
      event => {

        loadTrack(
          event.target.files[0],
          "B"
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


  ["A","B"].forEach(
    deckName => {

      $("volume"+deckName)
        .addEventListener(
          "input",
          () =>
            updateDeckVolume(
              deckName
            )
        );


      $("pitch"+deckName)
        .addEventListener(
          "input",
          () =>
            updatePitch(
              deckName
            )
        );


      $("seek"+deckName)
        .addEventListener(
          "input",
          () =>
            seekDeck(
              deckName
            )
        );

    }
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


  ["high","mid","low"].forEach(
    control => {

      $(control)
        .addEventListener(
          "input",
          updateEQ
        );

    }
  );


  $("smartNext")
    .addEventListener(
      "click",
      smartNext
    );


  $("autoDj")
    .addEventListener(
      "click",
      toggleAutoDJ
    );


  $("shuffle")
    .addEventListener(
      "click",
      shuffleLibrary
    );


  $("addMusic")
    .addEventListener(
      "click",
      () => $("musicFiles").click()
    );


  $("musicFiles")
    .addEventListener(
      "change",
      event => {

        addMusicFiles(
          event.target.files
        );

      }
    );


  $("clearLibrary")
    .addEventListener(
      "click",
      () => {

        state.library =
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
      () => $("voiceFile").click()
    );


  $("voiceFile")
    .addEventListener(
      "change",
      event => {

        loadVoiceID(
          event.target.files[0]
        );

      }
    );


  $("playVoice")
    .addEventListener(
      "click",
      playVoiceID
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

}


/* =====================================================
   ARRANQUE SEGURO
===================================================== */

function bootApplication(){

  /*
     La aplicación ya está visible
     aunque el audio todavía no haya
     sido iniciado.
  */

  updateClock();

  setInterval(
    updateClock,
    1000
  );


  renderLibrary();

  setupEvents();

  setupEffects();

  setupKeyboard();

}


/* =====================================================
   DOM READY
===================================================== */

if(
  document.readyState ===
  "loading"
){

  document.addEventListener(
    "DOMContentLoaded",
    bootApplication
  );

}else{

  bootApplication();

}


/* =====================================================
   ERRORES
===================================================== */

window.addEventListener(
  "error",
  event => {

    console.error(
      "Error DJ HUMBERTO:",
      event.error ||
      event.message
    );

  }
);
