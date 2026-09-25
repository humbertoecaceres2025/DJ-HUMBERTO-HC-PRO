/* =========================================================
   HC PRO DJ HUMBERTO 3.2
   DJ IDENTITY EDITION
========================================================= */

"use strict";


/* =========================================================
   ESTADO PRINCIPAL
========================================================= */

const state = {

  started: false,

  activeDeck: "A",

  autoDJ: false,

  transition: "crossfade",

  library: [],

  history: [],

  smartQueue: [],

  voiceIds: [],

  voiceHistory: [],

  currentVoice: -1,

  autoId: false,

  idInterval: 10,

  idTimer: null,

  idNextTime: null,

  jingleBank: [],

  recorder: null,

  recordingChunks: [],

  micStream: null,

  micSource: null,

  micEnabled: false,

  autoTransitionRunning: false

};


/* =========================================================
   AUDIO ENGINE
========================================================= */

let audioCtx = null;

let masterGain = null;

let musicBus = null;

let masterAnalyser = null;

let recordDestination = null;

let micGainNode = null;

let decks = {};

let voiceGain = null;

let jingleGain = null;


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

function clamp(value, min, max) {

  return Math.max(
    min,
    Math.min(max, value)
  );

}


function formatTime(seconds) {

  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  seconds = Math.max(0, Math.floor(seconds));

  const min = Math.floor(seconds / 60);

  const sec = seconds % 60;

  return (
    String(min).padStart(2,"0") +
    ":" +
    String(sec).padStart(2,"0")
  );

}


function titleFromFile(file) {

  return file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g," ")
    .trim();

}


/* =========================================================
   AUDIO ENGINE START
========================================================= */

async function startAudioEngine() {

  if (audioCtx) {

    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    return;

  }


  audioCtx = new (
    window.AudioContext ||
    window.webkitAudioContext
  )();


  masterGain =
    audioCtx.createGain();

  masterGain.gain.value = 0.8;


  musicBus =
    audioCtx.createGain();

  musicBus.gain.value = 1;


  voiceGain =
    audioCtx.createGain();

  voiceGain.gain.value = 1;


  jingleGain =
    audioCtx.createGain();

  jingleGain.gain.value = 1;


  masterAnalyser =
    audioCtx.createAnalyser();

  masterAnalyser.fftSize = 1024;


  recordDestination =
    audioCtx.createMediaStreamDestination();


  musicBus.connect(masterGain);

  voiceGain.connect(masterGain);

  jingleGain.connect(masterGain);

  masterGain.connect(masterAnalyser);

  masterAnalyser.connect(audioCtx.destination);

  masterAnalyser.connect(recordDestination);


  decks.A =
    createDeck("A");

  decks.B =
    createDeck("B");


  await audioCtx.resume();

}


/* =========================================================
   CREATE DECK
========================================================= */

function createDeck(id) {

  const media =
    $("media" + id);

  const source =
    audioCtx.createMediaElementSource(media);


  const inputGain =
    audioCtx.createGain();

  inputGain.gain.value = 1;


  const low =
    audioCtx.createBiquadFilter();

  low.type = "lowshelf";

  low.frequency.value = 180;


  const mid =
    audioCtx.createBiquadFilter();

  mid.type = "peaking";

  mid.frequency.value = 1000;

  mid.Q.value = 0.8;


  const high =
    audioCtx.createBiquadFilter();

  high.type = "highshelf";

  high.frequency.value = 5000;


  const filter =
    audioCtx.createBiquadFilter();

  filter.type = "lowpass";

  filter.frequency.value = 22000;


  const delay =
    audioCtx.createDelay(2);

  delay.delayTime.value = .22;


  const delayFeedback =
    audioCtx.createGain();

  delayFeedback.gain.value = .25;


  const delayWet =
    audioCtx.createGain();

  delayWet.gain.value = 0;


  const flanger =
    audioCtx.createDelay(.05);

  flanger.delayTime.value = .006;


  const flangerWet =
    audioCtx.createGain();

  flangerWet.gain.value = 0;


  const flangerLfo =
    audioCtx.createOscillator();

  const flangerDepth =
    audioCtx.createGain();

  flangerLfo.frequency.value = .35;

  flangerDepth.gain.value = .003;


  flangerLfo.connect(
    flangerDepth
  );

  flangerDepth.connect(
    flanger.delayTime
  );

  flangerLfo.start();


  const convolver =
    audioCtx.createConvolver();

  convolver.buffer =
    createImpulseResponse(
      audioCtx,
      2.5,
      2
    );


  const reverbWet =
    audioCtx.createGain();

  reverbWet.gain.value = 0;


  const channelGain =
    audioCtx.createGain();

  channelGain.gain.value = .5;


  const analyser =
    audioCtx.createAnalyser();

  analyser.fftSize = 512;


  source.connect(inputGain);

  inputGain.connect(low);

  low.connect(mid);

  mid.connect(high);

  high.connect(filter);


  filter.connect(channelGain);

  filter.connect(delay);

  delay.connect(delayFeedback);

  delayFeedback.connect(delay);

  delay.connect(delayWet);

  delayWet.connect(channelGain);


  filter.connect(flanger);

  flanger.connect(flangerWet);

  flangerWet.connect(channelGain);


  filter.connect(convolver);

  convolver.connect(reverbWet);

  reverbWet.connect(channelGain);


  channelGain.connect(analyser);

  analyser.connect(musicBus);


  media.addEventListener(
    "play",
    () => {

      updateDeckPlaying(
        id,
        true
      );

      state.activeDeck = id;

      $("activeDeckLabel").textContent =
        "DECK " + id;

    }
  );


  media.addEventListener(
    "pause",
    () => {

      updateDeckPlaying(
        id,
        false
      );

    }
  );


  media.addEventListener(
    "ended",
    () => {

      updateDeckPlaying(
        id,
        false
      );

      onDeckEnded(id);

    }
  );


  media.addEventListener(
    "timeupdate",
    () => {

      updateDeckProgress(id);

    }
  );


  media.addEventListener(
    "loadedmetadata",
    () => {

      updateDeckProgress(id);

    }
  );


  return {

    id,

    media,

    source,

    inputGain,

    low,

    mid,

    high,

    filter,

    delayWet,

    flangerWet,

    reverbWet,

    channelGain,

    analyser

  };

}


/* =========================================================
   IMPULSE RESPONSE
========================================================= */

function createImpulseResponse(
  context,
  duration,
  decay
) {

  const length =
    context.sampleRate *
    duration;

  const impulse =
    context.createBuffer(
      2,
      length,
      context.sampleRate
    );

  for (
    let channel = 0;
    channel < impulse.numberOfChannels;
    channel++
  ) {

    const data =
      impulse.getChannelData(channel);

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

  return impulse;

}


/* =========================================================
   LOAD DECK
========================================================= */

async function loadFileToDeck(
  id,
  file
) {

  if (!audioCtx) {
    await startAudioEngine();
  }

  const deck =
    decks[id];

  const url =
    URL.createObjectURL(file);

  deck.media.src = url;

  deck.media.load();

  $("" + id.toLowerCase() + "Title").textContent =
    titleFromFile(file);

  $("deck" + id + "State").textContent =
    "LOADED";

  updateNowPlaying();

  const libraryItem = {
    id:
      "deck-" +
      id +
      "-" +
      Date.now(),

    name:
      titleFromFile(file),

    file,

    url,

    bpm: null,

    key: null,

    energy: null
  };

  analyzeTrack(
    libraryItem
  ).then(() => {

    if (id === "A") {

      $("aBpm").textContent =
        libraryItem.bpm || "--";

      $("aKey").textContent =
        libraryItem.key || "--";

      $("aEnergy").textContent =
        libraryItem.energy != null
          ? libraryItem.energy
          : "--";

    } else {

      $("bBpm").textContent =
        libraryItem.bpm || "--";

      $("bKey").textContent =
        libraryItem.key || "--";

      $("bEnergy").textContent =
        libraryItem.energy != null
          ? libraryItem.energy
          : "--";

    }

    updateSmartCurrent();

  });

}


/* =========================================================
   PLAY / PAUSE / STOP
========================================================= */

async function playDeck(id) {

  if (!audioCtx) {
    await startAudioEngine();
  }

  const deck =
    decks[id];

  if (!deck.media.src) {

    setStatus(
      "Cargá una canción en DECK " + id
    );

    return;

  }

  try {

    await deck.media.play();

    state.activeDeck = id;

    updateNowPlaying();

  } catch (error) {

    setStatus(
      "Presioná PLAY nuevamente"
    );

  }

}


function pauseDeck(id) {

  decks[id].media.pause();

}


function stopDeck(id) {

  const media =
    decks[id].media;

  media.pause();

  media.currentTime = 0;

}


/* =========================================================
   DECK UI
========================================================= */

function updateDeckPlaying(
  id,
  playing
) {

  const vinyl =
    $("vinyl" + id);

  const stateEl =
    $("deck" + id + "State");

  if (playing) {

    vinyl.classList.add(
      "playing"
    );

    stateEl.textContent =
      "PLAYING";

  } else {

    vinyl.classList.remove(
      "playing"
    );

    stateEl.textContent =
      "PAUSED";

  }

}


function updateDeckProgress(id) {

  const media =
    decks[id].media;

  const progress =
    $("" + id.toLowerCase() + "Progress");

  const time =
    $("" + id.toLowerCase() + "Time");

  if (!media.duration) {

    progress.value = 0;

    time.textContent =
      "00:00 / 00:00";

    return;

  }

  progress.value =
    (
      media.currentTime /
      media.duration
    ) * 100;

  time.textContent =
    formatTime(media.currentTime) +
    " / " +
    formatTime(media.duration);

}


function updateNowPlaying() {

  const id =
    state.activeDeck;

  const media =
    decks[id]?.media;

  if (!media) return;

  const title =
    media.dataset.title ||
    media.src
      ? getDeckTitle(id)
      : "ESPERANDO MÚSICA...";

  $("nowTitle").textContent =
    title || "ESPERANDO MÚSICA...";

  $("screenTrack").textContent =
    title || "HC PRO DJ HUMBERTO";

}


function getDeckTitle(id) {

  const element =
    $("" + id.toLowerCase() + "Title");

  return element
    ? element.textContent
    : "";

}


/* =========================================================
   CROSSFADE
========================================================= */

function updateCrossfader() {

  if (!decks.A || !decks.B) {
    return;
  }

  const value =
    parseFloat(
      $("crossfader").value
    );


  let gainA;
  let gainB;


  if (
    state.transition ===
    "crossfade"
  ) {

    gainA =
      Math.cos(
        value *
        Math.PI /
        2
      );

    gainB =
      Math.cos(
        (1 - value) *
        Math.PI /
        2
      );

  } else {

    gainA =
      1 - value;

    gainB =
      value;

  }


  decks.A.channelGain.gain.value =
    gainA *
    parseFloat(
      $("aGain").value
    ) *
    .75;


  decks.B.channelGain.gain.value =
    gainB *
    parseFloat(
      $("bGain").value
    ) *
    .75;

}


/* =========================================================
   EFFECTS
========================================================= */

document.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        ".fx-button"
      );

    if (!button) return;

    const deckId =
      button.dataset.deck;

    const fx =
      button.dataset.fx;

    toggleFX(
      deckId,
      fx,
      button
    );

  }
);


function toggleFX(
  id,
  fx,
  button
) {

  const deck =
    decks[id];

  if (!deck) return;

  const active =
    button.classList.toggle(
      "active"
    );


  if (fx === "filter") {

    deck.filter.frequency.value =
      active
        ? 1000
        : 22000;

  }


  if (fx === "echo") {

    deck.delayWet.gain.value =
      active
        ? .45
        : 0;

  }


  if (fx === "flanger") {

    deck.flangerWet.gain.value =
      active
        ? .35
        : 0;

  }


  if (fx === "reverb") {

    deck.reverbWet.gain.value =
      active
        ? .35
        : 0;

  }

}


/* =========================================================
   VOICE ID
========================================================= */

$("voiceIdInput").addEventListener(
  "change",
  async event => {

    const files =
      [...event.target.files];

    if (!files.length) return;

    setStatus(
      "Cargando identificaciones..."
    );


    for (const file of files) {

      try {

        const arrayBuffer =
          await file.arrayBuffer();

        const buffer =
          await audioCtx.decodeAudioData(
            arrayBuffer.slice(0)
          );

        state.voiceIds.push({

          name: file.name,

          buffer,

          duration:
            buffer.duration

        });

      } catch (error) {

        console.error(
          "Error ID:",
          file.name,
          error
        );

      }

    }


    renderVoiceIds();

    setStatus(
      state.voiceIds.length +
      " identificaciones cargadas"
    );

    event.target.value = "";

  }
);


/* =========================================================
   RENDER VOICE IDS
========================================================= */

function renderVoiceIds() {

  const list =
    $("voiceIdList");

  const count =
    state.voiceIds.length;

  $("voiceIdCount").textContent =
    count +
    (
      count === 1
        ? " archivo"
        : " archivos"
    );


  if (!count) {

    list.innerHTML =
      `<div class="empty-library">
        Cargá tus identificaciones MP3.
      </div>`;

    return;

  }


  list.innerHTML = "";


  state.voiceIds.forEach(
    (id,index) => {

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "voice-id-item";


      const name =
        document.createElement(
          "strong"
        );

      name.textContent =
        id.name;


      const play =
        document.createElement(
          "button"
        );

      play.textContent =
        "▶";

      play.title =
        "Reproducir";

      play.addEventListener(
        "click",
        () => playVoiceId(index)
      );


      const remove =
        document.createElement(
          "button"
        );

      remove.textContent =
        "×";

      remove.title =
        "Eliminar";

      remove.addEventListener(
        "click",
        () => {

          state.voiceIds.splice(
            index,
            1
          );

          renderVoiceIds();

        }
      );


      row.appendChild(name);

      row.appendChild(play);

      row.appendChild(remove);

      list.appendChild(row);

    }
  );

}


/* =========================================================
   PLAY VOICE ID
========================================================= */

let activeVoiceSource = null;


function playVoiceId(index) {

  if (!audioCtx) return;

  const item =
    state.voiceIds[index];

  if (!item) return;


  if (activeVoiceSource) {

    try {
      activeVoiceSource.stop();
    } catch {}

    activeVoiceSource = null;

  }


  const source =
    audioCtx.createBufferSource();

  source.buffer =
    item.buffer;


  const gain =
    audioCtx.createGain();

  gain.gain.value =
    parseFloat(
      $("voiceIdVolume").value
    );


  source.connect(gain);

  gain.connect(voiceGain);


  const duck =
    $("voiceDucking").checked;


  if (duck) {
    duckMusic(true);
  }


  source.onended =
    () => {

      if (duck) {
        duckMusic(false);
      }

      activeVoiceSource = null;

      setStatus(
        "ID finalizada — DJ HUMBERTO"
      );

    };


  activeVoiceSource =
    source;


  state.currentVoice =
    index;


  state.voiceHistory.push(
    index
  );


  if (
    state.voiceHistory.length >
    20
  ) {
    state.voiceHistory.shift();
  }


  $("currentIdName").textContent =
    item.name;


  setStatus(
    "EN VIVO DJ HUMBERTO — " +
    item.name
  );


  source.start(0);

}


/* =========================================================
   RANDOM ID
========================================================= */

function playRandomVoiceId() {

  const count =
    state.voiceIds.length;

  if (!count) {

    setStatus(
      "Primero cargá identificaciones DJ HUMBERTO"
    );

    return;

  }


  let choices =
    state.voiceIds.map(
      (_,index) => index
    );


  choices =
    choices.filter(
      index =>
        index !==
        state.currentVoice
    );


  const recent =
    state.voiceHistory.slice(-3);


  choices =
    choices.filter(
      index =>
        !recent.includes(index)
    );


  if (!choices.length) {

    choices =
      state.voiceIds.map(
        (_,index) => index
      );

  }


  const randomIndex =
    choices[
      Math.floor(
        Math.random() *
        choices.length
      )
    ];


  playVoiceId(
    randomIndex
  );

}


/* =========================================================
   NEXT ID
========================================================= */

function playNextVoiceId() {

  if (!state.voiceIds.length) {

    setStatus(
      "No hay identificaciones cargadas"
    );

    return;

  }


  let next =
    state.currentVoice + 1;


  if (
    next >=
    state.voiceIds.length
  ) {
    next = 0;
  }


  playVoiceId(next);

}


$("playRandomId").addEventListener(
  "click",
  playRandomVoiceId
);


$("playNextId").addEventListener(
  "click",
  playNextVoiceId
);


/* =========================================================
   ID VOLUME
========================================================= */

$("voiceIdVolume").addEventListener(
  "input",
  event => {

    const value =
      parseFloat(
        event.target.value
      );

    $("voiceIdVolumeValue").textContent =
      Math.round(value * 100) +
      "%";

  }
);


/* =========================================================
   DUCKING
========================================================= */

function duckMusic(active) {

  if (!musicBus || !audioCtx) {
    return;
  }


  musicBus.gain.cancelScheduledValues(
    audioCtx.currentTime
  );


  musicBus.gain.setTargetAtTime(
    active ? .28 : 1,
    audioCtx.currentTime,
    .05
  );

}


/* =========================================================
   AUTO ID
========================================================= */

$("autoIdToggle").addEventListener(
  "click",
  () => {

    state.autoId =
      !state.autoId;


    updateAutoIdUI();


    if (state.autoId) {

      startAutoIdTimer();

    } else {

      stopAutoIdTimer();

    }

  }
);


document.querySelectorAll(
  "[data-id-interval]"
).forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        state.idInterval =
          parseInt(
            button.dataset.idInterval
          );

        document
          .querySelectorAll(
            "[data-id-interval]"
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


        if (state.autoId) {
          startAutoIdTimer();
        }

      }
    );

  }
);


function updateAutoIdUI() {

  const button =
    $("autoIdToggle");

  if (state.autoId) {

    button.textContent =
      "AUTO ID: ON";

    button.classList.add(
      "active"
    );

  } else {

    button.textContent =
      "AUTO ID: OFF";

    button.classList.remove(
      "active"
    );

    $("nextIdStatus").textContent =
      "AUTO ID DESACTIVADO";

  }

}


function startAutoIdTimer() {

  stopAutoIdTimer();


  const milliseconds =
    state.idInterval *
    60 *
    1000;


  state.idNextTime =
    Date.now() +
    milliseconds;


  state.idTimer =
    setInterval(
      () => {

        if (
          Date.now() >=
          state.idNextTime
        ) {

          if (
            state.voiceIds.length
          ) {

            playRandomVoiceId();

          }

          state.idNextTime =
            Date.now() +
            milliseconds;

        }


        updateNextIdStatus();

      },
      1000
    );

}


function stopAutoIdTimer() {

  if (state.idTimer) {

    clearInterval(
      state.idTimer
    );

    state.idTimer = null;

  }

}


function updateNextIdStatus() {

  if (
    !state.autoId ||
    !state.idNextTime
  ) {

    $("nextIdStatus").textContent =
      "AUTO ID DESACTIVADO";

    return;

  }


  const remaining =
    Math.max(
      0,
      state.idNextTime -
      Date.now()
    );


  const minutes =
    Math.floor(
      remaining / 60000
    );

  const seconds =
    Math.floor(
      (remaining % 60000) / 1000
    );


  $("nextIdStatus").textContent =
    "EN " +
    minutes +
    ":" +
    String(seconds).padStart(2,"0");

}


/* =========================================================
   JINGLE BANK
========================================================= */

$("jingleInput").addEventListener(
  "change",
  async event => {

    const files =
      [...event.target.files];

    if (!files.length) return;


    for (
      let i = 0;
      i < files.length;
      i++
    ) {

      if (
        state.jingleBank.length >= 8
      ) {
        break;
      }


      try {

        const buffer =
          await audioCtx.decodeAudioData(
            (
              await files[i].arrayBuffer()
            ).slice(0)
          );

        state.jingleBank.push({
          name: files[i].name,
          buffer
        });

      } catch (error) {

        console.error(error);

      }

    }


    renderJingleBank();

    event.target.value = "";

  }
);


function renderJingleBank() {

  document
    .querySelectorAll(".jingle")
    .forEach(
      (button,index) => {

        button.classList.toggle(
          "loaded",
          !!state.jingleBank[index]
        );

        if (
          state.jingleBank[index]
        ) {

          button.title =
            state.jingleBank[index].name;

        }

      }
    );

}


document
  .querySelectorAll(".jingle")
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const slot =
            parseInt(
              button.dataset.slot
            ) - 1;

          playJingle(slot);

        }
      );

    }
  );


function playJingle(slot) {

  const item =
    state.jingleBank[slot];

  if (!item) {

    setStatus(
      "Ese Jingle todavía no está cargado"
    );

    return;

  }


  const source =
    audioCtx.createBufferSource();

  source.buffer =
    item.buffer;


  source.connect(
    jingleGain
  );


  source.start(0);


  setStatus(
    "JINGLE — DJ HUMBERTO"
  );

}


/* =========================================================
   DECK INPUTS
========================================================= */

$("aLoad").addEventListener(
  "change",
  event => {

    const file =
      event.target.files[0];

    if (file) {
      loadFileToDeck(
        "A",
        file
      );
    }

  }
);


$("bLoad").addEventListener(
  "change",
  event => {

    const file =
      event.target.files[0];

    if (file) {
      loadFileToDeck(
        "B",
        file
      );
    }

  }
);


$("aPlay").addEventListener(
  "click",
  () =>
    playDeck("A")
);


$("aPause").addEventListener(
  "click",
  () =>
    pauseDeck("A")
);


$("aStop").addEventListener(
  "click",
  () =>
    stopDeck("A")
);


$("bPlay").addEventListener(
  "click",
  () =>
    playDeck("B")
);


$("bPause").addEventListener(
  "click",
  () =>
    pauseDeck("B")
);


$("bStop").addEventListener(
  "click",
  () =>
    stopDeck("B")
);


/* =========================================================
   PROGRESS
========================================================= */

$("aProgress").addEventListener(
  "input",
  event => {

    const media =
      decks.A.media;

    if (media.duration) {

      media.currentTime =
        (
          event.target.value /
          100
        ) *
        media.duration;

    }

  }
);


$("bProgress").addEventListener(
  "input",
  event => {

    const media =
      decks.B.media;

    if (media.duration) {

      media.currentTime =
        (
          event.target.value /
          100
        ) *
        media.duration;

    }

  }
);


/* =========================================================
   GAIN
========================================================= */

$("aGain").addEventListener(
  "input",
  updateCrossfader
);


$("bGain").addEventListener(
  "input",
  updateCrossfader
);


$("crossfader").addEventListener(
  "input",
  updateCrossfader
);


/* =========================================================
   PITCH
========================================================= */

$("aPitch").addEventListener(
  "input",
  event => {

    const value =
      parseFloat(
        event.target.value
      );

    decks.A.media.playbackRate =
      value;

    $("aPitchValue").textContent =
      value.toFixed(2) +
      "x";

  }
);


$("bPitch").addEventListener(
  "input",
  event => {

    const value =
      parseFloat(
        event.target.value
      );

    decks.B.media.playbackRate =
      value;

    $("bPitchValue").textContent =
      value.toFixed(2) +
      "x";

  }
);


/* =========================================================
   EQ
========================================================= */

function connectEQControl(
  deckId,
  elementId,
  node
) {

  $(elementId).addEventListener(
    "input",
    event => {

      node.gain.value =
        parseFloat(
          event.target.value
        );

    }
  );

}


connectEQControl(
  "A",
  "aLow",
  {
    set gain(v) {
      if (decks.A) {
        decks.A.low.gain.value = v;
      }
    }
  }
);


/*
   Direct controls
*/

$("aLow").addEventListener(
  "input",
  e =>
    decks.A.low.gain.value =
      parseFloat(e.target.value)
);

$("aMid").addEventListener(
  "input",
  e =>
    decks.A.mid.gain.value =
      parseFloat(e.target.value)
);

$("aHigh").addEventListener(
  "input",
  e =>
    decks.A.high.gain.value =
      parseFloat(e.target.value)
);

$("bLow").addEventListener(
  "input",
  e =>
    decks.B.low.gain.value =
      parseFloat(e.target.value)
);

$("bMid").addEventListener(
  "input",
  e =>
    decks.B.mid.gain.value =
      parseFloat(e.target.value)
);

$("bHigh").addEventListener(
  "input",
  e =>
    decks.B.high.gain.value =
      parseFloat(e.target.value)
);


/* =========================================================
   MASTER
========================================================= */

$("masterVolume").addEventListener(
  "input",
  event => {

    const value =
      parseFloat(
        event.target.value
      );

    masterGain.gain.value =
      value;

    $("masterValue").textContent =
      Math.round(value * 100) +
      "%";

  }
);


/* =========================================================
   TRANSITION
========================================================= */

$("transitionMode").addEventListener(
  "change",
  event => {

    state.transition =
      event.target.value;

    updateCrossfader();

  }
);


/* =========================================================
   AUTO DJ
========================================================= */

$("autoDJ").addEventListener(
  "click",
  () => {

    state.autoDJ =
      !state.autoDJ;


    const button =
      $("autoDJ");


    button.textContent =
      state.autoDJ
        ? "ON"
        : "OFF";


    button.classList.toggle(
      "active",
      state.autoDJ
    );


    if (state.autoDJ) {

      setStatus(
        "AUTO DJ ACTIVADO"
      );

      prepareNextTrack();

    } else {

      setStatus(
        "AUTO DJ DESACTIVADO"
      );

    }

  }
);


$("prepareNext").addEventListener(
  "click",
  prepareNextTrack
);


async function prepareNextTrack() {

  const inactive =
    state.activeDeck === "A"
      ? "B"
      : "A";


  const suggestion =
    findBestNextTrack();


  if (
    suggestion
  ) {

    await loadFileToDeck(
      inactive,
      suggestion.file
    );

    setStatus(
      "SIGUIENTE PREPARADO EN DECK " +
      inactive
    );

  } else {

    setStatus(
      "No hay siguiente canción disponible"
    );

  }

}


/* =========================================================
   DECK ENDED
========================================================= */

async function onDeckEnded(id) {

  if (!state.autoDJ) {

    updateNowPlaying();

    return;

  }


  if (
    state.autoTransitionRunning
  ) {
    return;
  }


  state.autoTransitionRunning =
    true;


  const next =
    id === "A"
      ? "B"
      : "A";


  if (
    !decks[next].media.src
  ) {

    const suggestion =
      findBestNextTrack();

    if (suggestion) {

      await loadFileToDeck(
        next,
        suggestion.file
      );

    }

  }


  await playDeck(next);


  state.activeDeck =
    next;


  const target =
    next === "A"
      ? 0
      : 1;


  $("crossfader").value =
    target;


  updateCrossfader();


  state.autoTransitionRunning =
    false;

}


/* =========================================================
   LIBRARY
========================================================= */

$("libraryInput").addEventListener(
  "change",
  event => {

    addLibraryFiles(
      [...event.target.files]
    );

    event.target.value = "";

  }
);


$("folderInput").addEventListener(
  "change",
  event => {

    addLibraryFiles(
      [...event.target.files]
    );

    event.target.value = "";

  }
);


function addLibraryFiles(files) {

  const supported =
    files.filter(
      file =>
        file.type.startsWith(
          "audio/"
        ) ||
        file.type.startsWith(
          "video/"
        )
    );


  supported.forEach(
    file => {

      const exists =
        state.library.some(
          item =>
            item.name ===
            file.name &&
            item.file.size ===
            file.size
        );


      if (exists) return;


      state.library.push({

        id:
          "track-" +
          Date.now() +
          "-" +
          Math.random()
            .toString(36)
            .slice(2),

        name:
          titleFromFile(file),

        file,

        url:
          URL.createObjectURL(file),

        bpm: null,

        key: null,

        energy: null

      });

    }
  );


  renderLibrary();

}


/* =========================================================
   ANALYZE LIBRARY
========================================================= */

$("analyzeLibrary").addEventListener(
  "click",
  async () => {

    if (!state.library.length) {

      setStatus(
        "La biblioteca está vacía"
      );

      return;

    }


    setStatus(
      "Analizando biblioteca..."
    );


    for (
      const track of state.library
    ) {

      if (
        track.bpm === null
      ) {

        await analyzeTrack(
          track
        );

      }

      renderLibrary();

    }


    setStatus(
      "Biblioteca analizada"
    );

  }
);


/* =========================================================
   ANALYZE TRACK
========================================================= */

async function analyzeTrack(
  track
) {

  if (!track.file) return track;


  try {

    const buffer =
      await audioCtx.decodeAudioData(
        (
          await track.file.arrayBuffer()
        ).slice(0)
      );


    track.energy =
      calculateEnergy(
        buffer
      );


    track.bpm =
      estimateBPM(
        buffer
      );


    track.key =
      estimateKey(
        buffer
      );


  } catch (error) {

    console.warn(
      "No se pudo analizar:",
      track.name,
      error
    );

  }


  return track;

}


/* =========================================================
   ENERGY
========================================================= */

function calculateEnergy(
  buffer
) {

  const channel =
    buffer.getChannelData(0);

  const step =
    Math.max(
      1,
      Math.floor(
        channel.length / 30000
      )
    );


  let sum = 0;

  let count = 0;


  for (
    let i = 0;
    i < channel.length;
    i += step
  ) {

    sum +=
      channel[i] *
      channel[i];

    count++;

  }


  const rms =
    Math.sqrt(
      sum / count
    );


  return clamp(
    Math.round(
      rms * 180
    ),
    1,
    100
  );

}


/* =========================================================
   BPM
========================================================= */

function estimateBPM(
  buffer
) {

  const data =
    buffer.getChannelData(0);

  const sampleRate =
    buffer.sampleRate;


  const duration =
    buffer.duration;


  if (
    duration < 10
  ) {
    return 120;
  }


  const maxSeconds =
    Math.min(
      duration,
      45
    );


  const sampleCount =
    Math.min(
      data.length,
      Math.floor(
        maxSeconds *
        sampleRate
      )
    );


  const window =
    Math.max(
      1,
      Math.floor(
        sampleRate *
        0.03
      )
    );


  const peaks = [];


  let previous =
    0;


  for (
    let i = 0;
    i < sampleCount - window;
    i += window
  ) {

    let energy = 0;

    for (
      let j = 0;
      j < window;
      j += 8
    ) {

      const value =
        data[i + j] || 0;

      energy +=
        value * value;

    }


    energy /=
      Math.max(
        1,
        Math.floor(
          window / 8
        )
      );


    if (
      energy >
      previous * 1.5 &&
      energy >
      0.005
    ) {

      peaks.push(
        i / sampleRate
      );

    }


    previous =
      previous * .8 +
      energy * .2;

  }


  if (
    peaks.length < 3
  ) {
    return 120;
  }


  const intervals = [];


  for (
    let i = 1;
    i < peaks.length;
    i++
  ) {

    const diff =
      peaks[i] -
      peaks[i - 1];

    if (
      diff > .25 &&
      diff < 1.2
    ) {

      intervals.push(diff);

    }

  }


  if (!intervals.length) {
    return 120;
  }


  const avg =
    intervals.reduce(
      (a,b) => a+b,
      0
    ) /
    intervals.length;


  let bpm =
    60 / avg;


  while (bpm < 80) {
    bpm *= 2;
  }

  while (bpm > 180) {
    bpm /= 2;
  }


  return Math.round(bpm);

}


/* =========================================================
   KEY ESTIMATION
========================================================= */

function estimateKey(
  buffer
) {

  const keys = [
    "C",
    "Cm",
    "D",
    "Dm",
    "E",
    "Em",
    "F",
    "Fm",
    "G",
    "Gm",
    "A",
    "Am",
    "B",
    "Bm"
  ];


  const data =
    buffer.getChannelData(0);


  let sum = 0;

  const step =
    Math.max(
      1,
      Math.floor(
        data.length / 50000
      )
    );


  for (
    let i = 0;
    i < data.length;
    i += step
  ) {

    sum +=
      Math.abs(
        data[i]
      );

  }


  const index =
    Math.floor(
      sum * 1000
    ) %
    keys.length;


  return keys[index];

}


/* =========================================================
   SMART DJ
========================================================= */

$("smartAnalyze").addEventListener(
  "click",
  async () => {

    const track =
      getActiveLibraryTrack();


    if (!track) {

      $("smartResults").textContent =
        "No hay canción activa en la biblioteca.";

      return;

    }


    await analyzeTrack(
      track
    );


    updateSmartCurrent();


    $("smartResults").textContent =
      "Tema analizado correctamente.";

  }
);


function getActiveLibraryTrack() {

  const title =
    getDeckTitle(
      state.activeDeck
    );


  return (
    state.library.find(
      track =>
        track.name === title
    ) ||
    state.library.find(
      track =>
        title.includes(
          track.name
        )
    )
  );

}


function updateSmartCurrent() {

  const track =
    getActiveLibraryTrack();


  if (!track) {

    $("smartCurrentTrack").textContent =
      getDeckTitle(
        state.activeDeck
      ) ||
      "Sin canción";

    return;

  }


  $("smartCurrentTrack").textContent =
    track.name;

  $("smartCurrentBpm").textContent =
    track.bpm || "--";

  $("smartCurrentKey").textContent =
    track.key || "--";

  $("smartCurrentEnergy").textContent =
    track.energy || "--";

}


$("findNext").addEventListener(
  "click",
  () => {

    const next =
      findBestNextTrack();


    if (!next) {

      $("smartResults").textContent =
        "No encontré una canción compatible.";

      return;

    }


    $("smartResults").innerHTML =
      `
      <strong>${escapeHTML(next.name)}</strong>
      <br><br>
      BPM: ${next.bpm || "--"}
      <br>
      KEY: ${next.key || "--"}
      <br>
      ENERGY: ${next.energy || "--"}
      <br><br>
      COMPATIBILIDAD:
      <strong>${next.score}%</strong>
      `;


    state.smartQueue =
      [next];

  }
);


/* =========================================================
   FIND BEST TRACK
========================================================= */

function findBestNextTrack() {

  const current =
    getActiveLibraryTrack();


  if (!current) {

    const available =
      state.library.filter(
        track =>
          !state.history.includes(
            track.id
          )
      );


    if (!available.length) {
      return null;
    }


    return {
      ...available[
        Math.floor(
          Math.random() *
          available.length
        )
      ],
      score: 50
    };

  }


  const candidates =
    state.library.filter(
      track =>
        track.id !== current.id &&
        !state.history.includes(
          track.id
        )
    );


  if (!candidates.length) {

    state.history = [];

    return findBestNextTrack();

  }


  const mode =
    $("smartMode").value;


  let best =
    null;


  let bestScore =
    -Infinity;


  candidates.forEach(
    track => {

      const score =
        compatibilityScore(
          current,
          track,
          mode
        );


      if (
        score >
        bestScore
      ) {

        bestScore =
          score;

        best =
          track;

      }

    }
  );


  return best
    ? {
        ...best,
        score:
          Math.round(
            bestScore
          )
      }
    : null;

}


/* =========================================================
   COMPATIBILITY
========================================================= */

function compatibilityScore(
  current,
  next,
  mode
) {

  let score = 50;


  if (
    current.bpm &&
    next.bpm
  ) {

    const diff =
      Math.abs(
        current.bpm -
        next.bpm
      );


    score +=
      Math.max(
        0,
        30 - diff * 1.5
      );

  }


  if (
    current.key &&
    next.key
  ) {

    if (
      current.key ===
      next.key
    ) {

      score += 20;

    }

  }


  if (
    current.energy != null &&
    next.energy != null
  ) {

    const diff =
      next.energy -
      current.energy;


    if (
      mode ===
      "energy-up"
    ) {

      score +=
        diff > 0
          ? 15
          : -10;

    }


    if (
      mode ===
      "energy-down"
    ) {

      score +=
        diff < 0
          ? 15
          : -10;

    }


    if (
      mode ===
      "balanced"
    ) {

      score +=
        Math.max(
          0,
          15 -
          Math.abs(diff)
        );

    }

  }


  if (
    mode ===
    "same-key" &&
    current.key ===
    next.key
  ) {

    score += 25;

  }


  return clamp(
    score,
    0,
    100
  );

}


/* =========================================================
   SMART QUEUE
========================================================= */

$("smartQueue").addEventListener(
  "click",
  () => {

    if (
      !state.smartQueue.length
    ) {

      setStatus(
        "Primero buscá un siguiente tema"
      );

      return;

    }


    setStatus(
      "Tema agregado a cola"
    );

  }
);


/* =========================================================
   LIBRARY RENDER
========================================================= */

function renderLibrary() {

  const body =
    $("libraryBody");

  const search =
    $("librarySearch")
      .value
      .toLowerCase()
      .trim();


  const filtered =
    state.library.filter(
      track =>
        track.name
          .toLowerCase()
          .includes(search)
    );


  $("libraryCount").textContent =
    state.library.length +
    (
      state.library.length === 1
        ? " canción"
        : " canciones"
    );


  if (!filtered.length) {

    body.innerHTML =
      `<div class="empty-library">
        La biblioteca está vacía.
      </div>`;

    return;

  }


  body.innerHTML = "";


  filtered.forEach(
    (track,index) => {

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "library-row";


      row.innerHTML =
        `
        <span>${index + 1}</span>

        <strong>
          ${escapeHTML(track.name)}
        </strong>

        <span>
          ${track.bpm || "--"}
        </span>

        <span>
          ${track.key || "--"}
        </span>

        <span>
          ${track.energy || "--"}
        </span>

        <button class="library-play">
          CARGAR A DECK
        </button>
        `;


      row
        .querySelector(
          ".library-play"
        )
        .addEventListener(
          "click",
          () =>
            loadFileToDeck(
              state.activeDeck,
              track.file
            )
        );


      body.appendChild(row);

    }
  );

}


$("librarySearch").addEventListener(
  "input",
  renderLibrary
);


$("clearLibrary").addEventListener(
  "click",
  () => {

    state.library = [];

    state.history = [];

    renderLibrary();

  }
);


/* =========================================================
   MICROPHONE
========================================================= */

$("micToggle").addEventListener(
  "click",
  async () => {

    if (
      state.micEnabled
    ) {

      disableMicrophone();

    } else {

      await enableMicrophone();

    }

  }
);


async function enableMicrophone() {

  try {

    if (!audioCtx) {
      await startAudioEngine();
    }


    state.micStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });


    state.micSource =
      audioCtx.createMediaStreamSource(
        state.micStream
      );


    micGainNode =
      audioCtx.createGain();

    micGainNode.gain.value =
      parseFloat(
        $("micGain").value
      );


    state.micSource.connect(
      micGainNode
    );

    micGainNode.connect(
      musicBus
    );


    state.micEnabled =
      true;


    $("micToggle").textContent =
      "MIC ON";

    $("micToggle").classList.add(
      "active"
    );


    setStatus(
      "Micrófono activado"
    );


  } catch (error) {

    setStatus(
      "No se pudo activar el micrófono"
    );

  }

}


function disableMicrophone() {

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


  state.micStream =
    null;

  state.micSource =
    null;

  state.micEnabled =
    false;


  $("micToggle").textContent =
    "MIC OFF";

  $("micToggle").classList.remove(
    "active"
  );


  setStatus(
    "Micrófono desactivado"
  );

}


$("micGain").addEventListener(
  "input",
  event => {

    if (micGainNode) {

      micGainNode.gain.value =
        parseFloat(
          event.target.value
        );

    }

  }
);


/* =========================================================
   RECORDING
========================================================= */

$("recordStart").addEventListener(
  "click",
  startRecording
);


$("recordStop").addEventListener(
  "click",
  stopRecording
);


function startRecording() {

  if (!recordDestination) {

    setStatus(
      "Iniciá primero el sistema"
    );

    return;

  }


  if (
    state.recorder &&
    state.recorder.state ===
    "recording"
  ) {

    return;

  }


  state.recordingChunks =
    [];


  let mimeType =
    "audio/webm;codecs=opus";


  if (
    !MediaRecorder.isTypeSupported(
      mimeType
    )
  ) {

    mimeType =
      "audio/webm";

  }


  state.recorder =
    new MediaRecorder(
      recordDestination.stream,
      {
        mimeType
      }
    );


  state.recorder.ondataavailable =
    event => {

      if (
        event.data.size
      ) {

        state.recordingChunks.push(
          event.data
        );

      }

    };


  state.recorder.onstop =
    saveRecording;


  state.recorder.start();


  $("recordStatus").textContent =
    "● GRABANDO DJ HUMBERTO";


  setStatus(
    "Grabación iniciada"
  );

}


function stopRecording() {

  if (
    !state.recorder ||
    state.recorder.state !==
    "recording"
  ) {
    return;
  }


  state.recorder.stop();

}


function saveRecording() {

  const blob =
    new Blob(
      state.recordingChunks,
      {
        type:
          state.recorder.mimeType ||
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

  a.href =
    url;

  a.download =
    "DJ_HUMBERTO_HC_PRO_" +
    new Date()
      .toISOString()
      .replace(/[:.]/g,"-") +
    ".webm";


  a.click();


  URL.revokeObjectURL(
    url
  );


  $("recordStatus").textContent =
    "Grabación guardada";


  setStatus(
    "Mix DJ HUMBERTO guardado"
  );

}


/* =========================================================
   VIDEO
========================================================= */

const videoPlayer =
  $("videoPlayer");

videoPlayer.addEventListener(
  "loadeddata",
  () => {

    videoPlayer.style.display =
      "block";

    $("screenPlaceholder")
      .style.display =
      "none";

  }
);


videoPlayer.addEventListener(
  "play",
  () => {

    setStatus(
      "VIDEO ACTIVO — DJ HUMBERTO"
    );

  }
);


/* =========================================================
   VISUALIZER
========================================================= */

function drawVisualizer() {

  requestAnimationFrame(
    drawVisualizer
  );


  const canvas =
    $("visualizer");

  const ctx =
    canvas.getContext("2d");


  const width =
    canvas.width =
      canvas.clientWidth *
      window.devicePixelRatio;


  const height =
    canvas.height =
      canvas.clientHeight *
      window.devicePixelRatio;


  ctx.clearRect(
    0,
    0,
    width,
    height
  );


  if (!masterAnalyser) {
    return;
  }


  const data =
    new Uint8Array(
      masterAnalyser.frequencyBinCount
    );


  masterAnalyser.getByteFrequencyData(
    data
  );


  const bars =
    Math.min(
      80,
      data.length
    );


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
      value * height;


    const x =
      i * barWidth;


    const gradient =
      ctx.createLinearGradient(
        0,
        height,
        0,
        height - barHeight
      );


    gradient.addColorStop(
      0,
      "#00eaff"
    );

    gradient.addColorStop(
      .5,
      "#a855f7"
    );

    gradient.addColorStop(
      1,
      "#ff7a00"
    );


    ctx.fillStyle =
      gradient;


    ctx.fillRect(
      x,
      height - barHeight,
      Math.max(
        1,
        barWidth - 2
      ),
      barHeight
    );

  }

}


/* =========================================================
   METERS
========================================================= */

function updateMeters() {

  requestAnimationFrame(
    updateMeters
  );


  if (
    !decks.A ||
    !decks.B
  ) {
    return;
  }


  updateMeter(
    decks.A.analyser,
    $("meterA")
  );

  updateMeter(
    decks.B.analyser,
    $("meterB")
  );

}


function updateMeter(
  analyser,
  element
) {

  const data =
    new Uint8Array(
      analyser.frequencyBinCount
    );


  analyser.getByteFrequencyData(
    data
  );


  let sum = 0;


  for (
    let i = 0;
    i < data.length;
    i++
  ) {

    sum += data[i];

  }


  const average =
    sum /
    data.length;


  element.style.width =
    clamp(
      average / 255 * 100,
      3,
      100
    ) +
    "%";

}


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.target.tagName ===
      "INPUT" ||
      event.target.tagName ===
      "SELECT" ||
      event.target.tagName ===
      "TEXTAREA"
    ) {
      return;
    }


    if (
      event.code ===
      "Space"
    ) {

      event.preventDefault();

      toggleActiveDeck();

    }


    if (
      event.key.toLowerCase() ===
      "a"
    ) {

      playDeck("A");

    }


    if (
      event.key.toLowerCase() ===
      "b"
    ) {

      playDeck("B");

    }


    if (
      event.key.toLowerCase() ===
      "r"
    ) {

      playRandomVoiceId();

    }

  }
);


function toggleActiveDeck() {

  const id =
    state.activeDeck;


  const media =
    decks[id].media;


  if (
    media.paused
  ) {

    playDeck(id);

  } else {

    pauseDeck(id);

  }

}


/* =========================================================
   STATUS
========================================================= */

let statusTimer = null;


function setStatus(message) {

  $("systemStatus").textContent =
    message;


  clearTimeout(
    statusTimer
  );


  statusTimer =
    setTimeout(
      () => {

        $("systemStatus").textContent =
          "SISTEMA LISTO";

      },
      4000
    );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(value) {

  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   INICIALIZACIÓN
========================================================= */

$("startAudioBtn").addEventListener(
  "click",
  async () => {

    try {

      await startAudioEngine();


      state.started =
        true;


      $("bootOverlay")
        .classList.add(
          "hidden"
        );


      $("app")
        .classList.remove(
          "hidden"
        );


      setStatus(
        "DJ HUMBERTO — SISTEMA ACTIVO"
      );


      updateCrossfader();


      renderLibrary();

      renderVoiceIds();

      renderJingleBank();


      drawVisualizer();

      updateMeters();


      $("aPitchValue").textContent =
        "1.00x";

      $("bPitchValue").textContent =
        "1.00x";


    } catch (error) {

      console.error(error);

      alert(
        "No se pudo iniciar el sistema de audio."
      );

    }

  }
);


/* =========================================================
   PREPARAR ID INTERVALO INICIAL
========================================================= */

document
  .querySelector(
    '[data-id-interval="10"]'
  )
  ?.classList.add(
    "active"
  );


/* =========================================================
   RESIZE
========================================================= */

window.addEventListener(
  "resize",
  () => {}
);


/* =========================================================
   FINAL
========================================================= */

console.log(
  "HC PRO DJ HUMBERTO 3.2 — DJ IDENTITY EDITION"
);

console.log(
  "Identidad principal: DJ HUMBERTO"
);
