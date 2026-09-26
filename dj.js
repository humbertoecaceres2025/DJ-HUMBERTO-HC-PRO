/* =========================================================
   HC PRO DJ HUMBERTO 4.0
   SMART AUTO DJ PROFESSIONAL
========================================================= */

"use strict";


/* =========================================================
   CONFIGURACIÓN
========================================================= */

const CONFIG = {

  transitionBars: 16,

  minTransitionMs: 12000,

  maxTransitionMs: 30000,

  autoCheckMs: 250,

  defaultBpm: 120,

  defaultEnergy: 50,

  defaultKey: "C",

  defaultCamelot: "8B",

  maxHistory: 12

};


/* =========================================================
   ESTADO GLOBAL
========================================================= */

const state = {

  audioContext: null,

  masterGain: null,

  compressor: null,

  analyser: null,

  recordDestination: null,

  musicBus: null,

  spotGain: null,

  audioReady: false,

  crossfader: 0,

  activeDeck: "A",

  smartDJ: false,

  autoDJ: false,

  transitioning: false,

  transitionStarted: false,

  library: [],

  history: [],

  spots: [],

  currentSpot: null,

  spotRemaining: 0,

  spotTimer: null,

  mediaRecorder: null,

  recordingChunks: [],

  recording: false,

  nextTrack: null,

  animationFrame: null,

  monitorTimer: null,

  decks: {

    A: null,

    B: null

  }

};


/* =========================================================
   HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


function formatTime(seconds) {

  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const total = Math.floor(seconds);

  const minutes = Math.floor(total / 60);

  const secs = total % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0")
  );
}


function oppositeDeck(deck) {
  return deck === "A" ? "B" : "A";
}


function isVideoFile(file) {

  return (
    file &&
    (
      file.type.startsWith("video/") ||
      /\.(mp4|webm|mov|m4v)$/i.test(file.name)
    )
  );

}


function normalizeName(name) {

  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

}


function fileGenre(file) {

  const path =
    (
      file.webkitRelativePath ||
      file.name ||
      ""
    ).toLowerCase();

  const genres = [

    ["cumbia", "Cumbia"],
    ["cuarteto", "Cuarteto"],
    ["rock", "Rock"],
    ["pop", "Pop"],
    ["reggaeton", "Reggaetón"],
    ["trap", "Trap"],
    ["electronica", "Electrónica"],
    ["electronic", "Electrónica"],
    ["house", "House"],
    ["techno", "Techno"],
    ["salsa", "Salsa"],
    ["bachata", "Bachata"],
    ["merengue", "Merengue"],
    ["folklore", "Folklore"],
    ["folclore", "Folklore"],
    ["tango", "Tango"],
    ["jazz", "Jazz"],
    ["blues", "Blues"],
    ["metal", "Metal"],
    ["country", "Country"],
    ["hip hop", "Hip Hop"],
    ["hiphop", "Hip Hop"],
    ["rap", "Rap"],
    ["r&b", "R&B"]

  ];

  for (const item of genres) {

    if (path.includes(item[0])) {
      return item[1];
    }

  }

  return "General";

}


function mimeForFile(file) {

  if (file.type) {
    return file.type;
  }

  if (/\.mp3$/i.test(file.name)) {
    return "audio/mpeg";
  }

  if (/\.wav$/i.test(file.name)) {
    return "audio/wav";
  }

  if (/\.ogg$/i.test(file.name)) {
    return "audio/ogg";
  }

  if (/\.m4a$/i.test(file.name)) {
    return "audio/mp4";
  }

  if (/\.mp4$/i.test(file.name)) {
    return "video/mp4";
  }

  return "audio/mpeg";
}


/* =========================================================
   CAMELOT
========================================================= */

const CAMELOT_MAJOR = {

  C: "8B",
  G: "9B",
  D: "10B",
  A: "11B",
  E: "12B",
  B: "1B",
  "F#": "2B",
  "C#": "3B",
  "G#": "4B",
  "D#": "5B",
  "A#": "6B",
  F: "7B"

};


const CAMELOT_MINOR = {

  A: "8A",
  E: "9A",
  B: "10A",
  "F#": "11A",
  "C#": "12A",
  "G#": "1A",
  "D#": "2A",
  "A#": "3A",
  F: "4A",
  C: "5A",
  G: "6A",
  D: "7A"

};


const KEY_NAMES = [

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


function camelotFromKey(key, mode) {

  if (mode === "minor") {
    return CAMELOT_MINOR[key] || CONFIG.defaultCamelot;
  }

  return CAMELOT_MAJOR[key] || CONFIG.defaultCamelot;
}


function camelotCompatibility(a, b) {

  if (!a || !b || a === "--" || b === "--") {
    return 50;
  }

  const numberA = parseInt(a, 10);

  const numberB = parseInt(b, 10);

  const letterA = a.slice(-1);

  const letterB = b.slice(-1);

  if (
    Number.isNaN(numberA) ||
    Number.isNaN(numberB)
  ) {
    return 50;
  }

  if (a === b) {
    return 100;
  }

  if (
    letterA === letterB &&
    Math.abs(numberA - numberB) === 1
  ) {
    return 92;
  }

  if (
    letterA === letterB &&
    Math.abs(numberA - numberB) === 11
  ) {
    return 92;
  }

  if (
    numberA === numberB &&
    letterA !== letterB
  ) {
    return 85;
  }

  return 35;
}


/* =========================================================
   INICIALIZACIÓN
========================================================= */

document.addEventListener("DOMContentLoaded", init);


function init() {

  try {

    createDeckState("A");

    createDeckState("B");

    bindEvents();

    updateAll();

    renderLibrary();

    renderSpots();

    startVisualizer();

    state.monitorTimer =
      setInterval(
        monitorEngine,
        CONFIG.autoCheckMs
      );

    setStatus(
      "SISTEMA LISTO",
      "normal"
    );

  } catch (error) {

    console.error(error);

    setStatus(
      "INTERFAZ LISTA - AUDIO PENDIENTE",
      "normal"
    );

  }

}


/* =========================================================
   CREAR ESTADO DE DECK
========================================================= */

function createDeckState(deck) {

  const audio =
    deck === "A"
      ? $("audioA")
      : $("audioB");

  state.decks[deck] = {

    audio,

    source: null,

    low: null,

    mid: null,

    high: null,

    volumeGain: null,

    crossGain: null,

    track: null,

    playing: false,

    pitch: 1,

    duration: 0

  };

  audio.addEventListener(
    "play",
    () => {

      state.decks[deck].playing = true;

      updateDeckUI(deck);

    }
  );

  audio.addEventListener(
    "pause",
    () => {

      state.decks[deck].playing = false;

      updateDeckUI(deck);

    }
  );

  audio.addEventListener(
    "ended",
    () => {

      state.decks[deck].playing = false;

      if (
        state.autoDJ &&
        deck === state.activeDeck &&
        !state.transitioning
      ) {

        autoDJCheck(true);

      }

      updateDeckUI(deck);

    }
  );

  audio.addEventListener(
    "loadedmetadata",
    () => {

      state.decks[deck].duration =
        audio.duration || 0;

      updateDeckUI(deck);

    }
  );

}


/* =========================================================
   EVENTOS
========================================================= */

function bindEvents() {

  $("playA").addEventListener(
    "click",
    () => playDeck("A")
  );

  $("playB").addEventListener(
    "click",
    () => playDeck("B")
  );


  $("stopA").addEventListener(
    "click",
    () => stopDeck("A")
  );

  $("stopB").addEventListener(
    "click",
    () => stopDeck("B")
  );


  $("loadA").addEventListener(
    "click",
    () => manualLoad("A")
  );

  $("loadB").addEventListener(
    "click",
    () => manualLoad("B")
  );


  $("volumeA").addEventListener(
    "input",
    event =>
      changeVolume(
        "A",
        event.target.value
      )
  );

  $("volumeB").addEventListener(
    "input",
    event =>
      changeVolume(
        "B",
        event.target.value
      )
  );


  $("pitchA").addEventListener(
    "input",
    event =>
      changePitch(
        "A",
        event.target.value
      )
  );

  $("pitchB").addEventListener(
    "input",
    event =>
      changePitch(
        "B",
        event.target.value
      )
  );


  bindEQ("A", "low");

  bindEQ("A", "mid");

  bindEQ("A", "high");

  bindEQ("B", "low");

  bindEQ("B", "mid");

  bindEQ("B", "high");


  $("crossfader").addEventListener(
    "input",
    event => {

      updateCrossfader(
        Number(event.target.value)
      );

    }
  );


  $("progressA").addEventListener(
    "input",
    event =>
      seekDeck(
        "A",
        Number(event.target.value)
      )
  );


  $("progressB").addEventListener(
    "input",
    event =>
      seekDeck(
        "B",
        Number(event.target.value)
      )
  );


  $("smartNextBtn").addEventListener(
    "click",
    () => {

      smartNext(true);

    }
  );


  $("smartDJBtn").addEventListener(
    "click",
    toggleSmartDJ
  );


  $("autoDJBtn").addEventListener(
    "click",
    toggleAutoDJ
  );


  $("libraryFiles").addEventListener(
    "change",
    event =>
      addFiles(
        Array.from(event.target.files || [])
      )
  );


  $("libraryFolder").addEventListener(
    "change",
    event =>
      addFiles(
        Array.from(event.target.files || [])
      )
  );


  $("analyzeBtn").addEventListener(
    "click",
    analyzeLibrary
  );


  $("librarySearch").addEventListener(
    "input",
    renderLibrary
  );


  $("genreFilter").addEventListener(
    "change",
    renderLibrary
  );


  $("recordBtn").addEventListener(
    "click",
    toggleRecording
  );


  $("spotFiles").addEventListener(
    "change",
    event =>
      addSpots(
        Array.from(event.target.files || [])
      )
  );


  $("fullscreenBtn").addEventListener(
    "click",
    toggleFullscreen
  );


  window.addEventListener(
    "keydown",
    keyboardShortcuts
  );

}


/* =========================================================
   EQ
========================================================= */

function bindEQ(deck, band) {

  const id =
    band +
    deck;

  const element = $(id);

  if (!element) {
    return;
  }

  element.addEventListener(
    "input",
    event => {

      const d = state.decks[deck];

      const filter =
        d[band];

      if (filter) {

        filter.gain.value =
          Number(event.target.value);

      }

    }
  );

}


/* =========================================================
   AUDIO ENGINE
========================================================= */

async function ensureAudioEngine() {

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContextClass) {

    throw new Error(
      "Este navegador no soporta Web Audio."
    );

  }


  if (!state.audioContext) {

    state.audioContext =
      new AudioContextClass();


    state.masterGain =
      state.audioContext.createGain();


    state.compressor =
      state.audioContext.createDynamicsCompressor();


    state.analyser =
      state.audioContext.createAnalyser();


    state.recordDestination =
      state.audioContext.createMediaStreamDestination();


    state.musicBus =
      state.audioContext.createGain();


    state.spotGain =
      state.audioContext.createGain();


    state.analyser.fftSize = 1024;

    state.analyser.smoothingTimeConstant = .82;


    state.masterGain.gain.value = .92;


    state.compressor.threshold.value = -18;

    state.compressor.knee.value = 20;

    state.compressor.ratio.value = 5;

    state.compressor.attack.value = .003;

    state.compressor.release.value = .2;


    state.musicBus.connect(
      state.masterGain
    );


    state.spotGain.connect(
      state.masterGain
    );


    state.masterGain.connect(
      state.compressor
    );


    state.compressor.connect(
      state.analyser
    );


    state.analyser.connect(
      state.audioContext.destination
    );


    state.compressor.connect(
      state.recordDestination
    );


    setupDeckAudio("A");

    setupDeckAudio("B");

  }


  if (
    state.audioContext.state === "suspended"
  ) {

    await state.audioContext.resume();

  }


  state.audioReady = true;

  setStatus(
    state.autoDJ
      ? "AUTO DJ ACTIVO"
      : "AUDIO ACTIVO",
    state.autoDJ
      ? "auto"
      : "normal"
  );

}


/* =========================================================
   SETUP AUDIO DECK
========================================================= */

function setupDeckAudio(deck) {

  const d = state.decks[deck];

  if (!d || d.source) {
    return;
  }


  d.source =
    state.audioContext.createMediaElementSource(
      d.audio
    );


  d.low =
    state.audioContext.createBiquadFilter();

  d.low.type = "lowshelf";

  d.low.frequency.value = 180;


  d.mid =
    state.audioContext.createBiquadFilter();

  d.mid.type = "peaking";

  d.mid.frequency.value = 1000;

  d.mid.Q.value = .8;


  d.high =
    state.audioContext.createBiquadFilter();

  d.high.type = "highshelf";

  d.high.frequency.value = 5000;


  d.volumeGain =
    state.audioContext.createGain();

  d.volumeGain.gain.value =
    Number(
      deck === "A"
        ? $("volumeA").value
        : $("volumeB").value
    );


  d.crossGain =
    state.audioContext.createGain();


  d.source
    .connect(d.low)
    .connect(d.mid)
    .connect(d.high)
    .connect(d.volumeGain)
    .connect(d.crossGain)
    .connect(state.musicBus);


  updateCrossfader(
    state.crossfader
  );

}


/* =========================================================
   CROSSFADER
========================================================= */

function updateCrossfader(value) {

  value =
    clamp(
      Number(value),
      0,
      1
    );

  state.crossfader = value;

  $("crossfader").value = value;


  const angle =
    value * Math.PI / 2;


  const gainA =
    Math.cos(angle);


  const gainB =
    Math.sin(angle);


  if (
    state.decks.A &&
    state.decks.A.crossGain
  ) {

    state.decks.A.crossGain.gain.value =
      gainA;

  }


  if (
    state.decks.B &&
    state.decks.B.crossGain
  ) {

    state.decks.B.crossGain.gain.value =
      gainB;

  }


  const percentA =
    Math.round(gainA * 100);

  const percentB =
    Math.round(gainB * 100);


  $("crossValue").textContent =
    `A ${percentA}% / B ${percentB}%`;

}


/* =========================================================
   PLAY
========================================================= */

async function playDeck(deck) {

  try {

    await ensureAudioEngine();

    const d = state.decks[deck];


    if (!d.track) {

      const first =
        chooseInitialTrack();

      if (!first) {

        setAnalysisStatus(
          "Agregá canciones a la biblioteca antes de reproducir."
        );

        return;

      }

      await loadTrackToDeck(
        first,
        deck,
        false
      );

    }


    await d.audio.play();

    setActiveDeck(deck);

    syncVideo();

    if (state.autoDJ) {

      await smartNext(false);

    }

  } catch (error) {

    console.error(error);

    setStatus(
      "PRESIONÁ PLAY PARA ACTIVAR AUDIO",
      "normal"
    );

  }

}


/* =========================================================
   STOP
========================================================= */

function stopDeck(deck) {

  const d = state.decks[deck];

  if (!d) {
    return;
  }

  d.audio.pause();

  d.playing = false;

  updateDeckUI(deck);

}


/* =========================================================
   MANUAL LOAD
========================================================= */

async function manualLoad(deck) {

  const track =
    chooseInitialTrack();

  if (!track) {

    setAnalysisStatus(
      "No hay canciones en la biblioteca."
    );

    return;

  }

  await loadTrackToDeck(
    track,
    deck,
    false
  );

}


/* =========================================================
   LOAD TRACK
========================================================= */

async function loadTrackToDeck(
  track,
  deck,
  autoplay = false
) {

  if (!track) {
    return;
  }


  const d =
    state.decks[deck];


  try {

    await ensureAudioEngine();

  } catch (error) {

    console.error(error);

  }


  d.audio.pause();


  d.audio.src = track.url;

  d.audio.load();


  d.track = track;

  d.duration = 0;

  d.playing = false;


  d.audio.playbackRate =
    d.pitch || 1;


  track.loadedDeck = deck;


  updateDeckUI(deck);


  if (
    deck === state.activeDeck
  ) {

    syncVideo();

  }


  if (autoplay) {

    try {

      await d.audio.play();

    } catch (error) {

      console.warn(
        "Autoplay bloqueado:",
        error
      );

    }

  }

}


/* =========================================================
   ACTIVAR DECK
========================================================= */

function setActiveDeck(deck) {

  state.activeDeck = deck;

  $("activeDeck").textContent =
    deck;

  $("nextDeck").textContent =
    oppositeDeck(deck);

  $("activeDeckLabel").textContent =
    `DECK ${deck}`;


  $("deckA").classList.toggle(
    "active",
    deck === "A"
  );


  $("deckB").classList.toggle(
    "active",
    deck === "B"
  );


  updateMediaForActiveDeck();

}


/* =========================================================
   VOLUMEN
========================================================= */

async function changeVolume(
  deck,
  value
) {

  try {

    await ensureAudioEngine();

  } catch (error) {}

  const d =
    state.decks[deck];

  if (
    d &&
    d.volumeGain
  ) {

    d.volumeGain.gain.value =
      Number(value);

  }

}


/* =========================================================
   PITCH
========================================================= */

function changePitch(
  deck,
  value
) {

  const d =
    state.decks[deck];

  if (!d) {
    return;
  }

  d.pitch =
    Number(value);

  d.audio.playbackRate =
    d.pitch;

}


/* =========================================================
   SEEK
========================================================= */

function seekDeck(
  deck,
  percent
) {

  const d =
    state.decks[deck];

  if (
    !d ||
    !d.audio.duration
  ) {
    return;
  }

  d.audio.currentTime =
    d.audio.duration *
    (percent / 100);

  syncVideo();

}


/* =========================================================
   SMART DJ
========================================================= */

function toggleSmartDJ() {

  state.smartDJ =
    !state.smartDJ;


  $("smartDJBtn").classList.toggle(
    "active",
    state.smartDJ
  );


  if (state.smartDJ) {

    $("autoStatus").textContent =
      "SMART DJ";

    setStatus(
      "SMART DJ ACTIVO",
      "auto"
    );

    smartNext(true);

  } else {

    if (!state.autoDJ) {

      $("autoStatus").textContent =
        "MANUAL";

      setStatus(
        "MODO MANUAL",
        "normal"
      );

    }

  }

}


/* =========================================================
   AUTO DJ
========================================================= */

async function toggleAutoDJ() {

  if (state.autoDJ) {

    stopAutoDJ();

    return;

  }


  try {

    await ensureAudioEngine();

  } catch (error) {

    console.error(error);

  }


  state.smartDJ = true;

  state.autoDJ = true;

  state.transitioning = false;

  state.transitionStarted = false;


  $("smartDJBtn").classList.add(
    "active"
  );


  $("autoDJBtn").classList.add(
    "active"
  );


  $("autoStatus").textContent =
    "AUTO DJ";


  setStatus(
    "AUTO DJ ACTIVO",
    "auto"
  );


  let active =
    state.decks[state.activeDeck];


  if (!active.track) {

    const first =
      chooseInitialTrack();

    if (!first) {

      stopAutoDJ();

      setAnalysisStatus(
        "Cargá canciones para iniciar Auto DJ."
      );

      return;

    }

    await loadTrackToDeck(
      first,
      state.activeDeck,
      false
    );

    active =
      state.decks[state.activeDeck];

  }


  /*
     Auto DJ coloca el crossfader
     inicialmente completamente sobre
     el deck que está reproduciendo.
  */

  updateCrossfader(
    state.activeDeck === "A"
      ? 0
      : 1
  );


  try {

    await active.audio.play();

  } catch (error) {

    console.warn(
      "El navegador necesita una pulsación PLAY:",
      error
    );

    setStatus(
      "PRESIONÁ PLAY PARA INICIAR AUTO DJ",
      "auto"
    );

    return;

  }


  setActiveDeck(
    state.activeDeck
  );


  await smartNext(false);

}


function stopAutoDJ() {

  state.autoDJ = false;

  state.transitioning = false;

  state.transitionStarted = false;


  $("autoDJBtn").classList.remove(
    "active"
  );


  $("autoStatus").textContent =
    state.smartDJ
      ? "SMART DJ"
      : "MANUAL";


  setStatus(
    state.smartDJ
      ? "SMART DJ ACTIVO"
      : "MODO MANUAL",
    state.smartDJ
      ? "auto"
      : "normal"
  );

}


/* =========================================================
   SMART NEXT
========================================================= */

async function smartNext(force = false) {

  if (!state.library.length) {

    return null;

  }


  const activeDeck =
    state.activeDeck;

  const targetDeck =
    oppositeDeck(activeDeck);


  const activeTrack =
    state.decks[activeDeck].track;


  /*
     Si todavía no existe una canción
     activa, carga la primera.
  */

  if (!activeTrack) {

    const first =
      chooseInitialTrack();

    if (!first) {
      return null;
    }

    await loadTrackToDeck(
      first,
      activeDeck,
      false
    );

    return first;

  }


  const existing =
    state.decks[targetDeck].track;


  if (
    existing &&
    existing.preparedFor === activeTrack.id &&
    !force
  ) {

    state.nextTrack =
      existing;

    renderSmartCompatibility(
      activeTrack,
      existing
    );

    return existing;

  }


  const candidate =
    chooseCompatibleTrack(
      activeTrack,
      force
    );


  if (!candidate) {

    return null;

  }


  candidate.preparedFor =
    activeTrack.id;


  await loadTrackToDeck(
    candidate,
    targetDeck,
    false
  );


  /*
     Ajuste de tempo del deck entrante.
  */

  alignTempo(
    targetDeck,
    activeTrack,
    candidate
  );


  state.nextTrack =
    candidate;


  renderSmartCompatibility(
    activeTrack,
    candidate
  );


  $("prepared" + targetDeck).textContent =
    "SÍ";


  return candidate;

}


/* =========================================================
   SELECCIÓN COMPATIBLE
========================================================= */

function chooseCompatibleTrack(
  base,
  force
) {

  const candidates =
    state.library.filter(
      track =>
        track.id !== base.id &&
        (
          force ||
          !state.history.includes(track.id)
        )
    );


  if (!candidates.length) {

    return (
      state.library.find(
        track =>
          track.id !== base.id
      ) ||
      null
    );

  }


  let best = null;

  let bestScore = -Infinity;


  for (const candidate of candidates) {

    const score =
      compatibilityScore(
        base,
        candidate
      );


    if (score > bestScore) {

      bestScore = score;

      best = candidate;

    }

  }


  return best;

}


/* =========================================================
   COMPATIBILIDAD
========================================================= */

function compatibilityScore(
  a,
  b
) {

  const bpmA =
    Number(a.bpm) ||
    CONFIG.defaultBpm;

  const bpmB =
    Number(b.bpm) ||
    CONFIG.defaultBpm;


  const bpmDifference =
    Math.abs(
      bpmA - bpmB
    );


  const bpmPercent =
    bpmDifference /
    Math.max(bpmA, 1);


  let bpmScore =
    100 -
    (
      bpmPercent * 500
    );


  bpmScore =
    clamp(
      bpmScore,
      0,
      100
    );


  const camelotScore =
    camelotCompatibility(
      a.camelot,
      b.camelot
    );


  const energyA =
    Number(a.energy) ||
    CONFIG.defaultEnergy;

  const energyB =
    Number(b.energy) ||
    CONFIG.defaultEnergy;


  const energyDifference =
    Math.abs(
      energyA - energyB
    );


  const energyScore =
    clamp(
      100 -
      energyDifference * 2,
      0,
      100
    );


  let genreScore = 50;


  if (
    a.genre &&
    b.genre
  ) {

    if (
      a.genre === b.genre
    ) {

      genreScore = 100;

    } else if (
      a.genre === "General" ||
      b.genre === "General"
    ) {

      genreScore = 65;

    } else {

      genreScore = 35;

    }

  }


  const novelty =
    state.history.includes(b.id)
      ? 15
      : 100;


  /*
     Peso musical.
  */

  const score =
    bpmScore * .35 +
    camelotScore * .30 +
    energyScore * .15 +
    genreScore * .15 +
    novelty * .05;


  return Math.round(score);

}


/* =========================================================
   ALINEAR TEMPO
========================================================= */

function alignTempo(
  deck,
  outgoing,
  incoming
) {

  const outgoingBpm =
    Number(outgoing.bpm) ||
    CONFIG.defaultBpm;

  const incomingBpm =
    Number(incoming.bpm) ||
    CONFIG.defaultBpm;


  let ratio =
    outgoingBpm /
    incomingBpm;


  ratio =
    clamp(
      ratio,
      .92,
      1.08
    );


  const pitch =
    ratio;


  state.decks[deck].pitch =
    pitch;


  state.decks[deck].audio.playbackRate =
    pitch;


  const pitchSlider =
    $("pitch" + deck);


  if (pitchSlider) {

    pitchSlider.value =
      pitch;

  }

}


/* =========================================================
   AUTO DJ CHECK
========================================================= */

async function autoDJCheck(force = false) {

  if (
    !state.autoDJ ||
    state.transitioning
  ) {

    return;

  }


  const active =
    state.decks[state.activeDeck];


  if (
    !active ||
    !active.track
  ) {

    return;

  }


  if (!active.playing) {

    return;

  }


  const targetDeck =
    oppositeDeck(
      state.activeDeck
    );


  if (
    !state.decks[targetDeck].track
  ) {

    await smartNext(false);

    return;

  }


  const remaining =
    (
      active.audio.duration -
      active.audio.currentTime
    );


  const transitionSeconds =
    calculateTransitionSeconds(
      active.track
    );


  if (
    force ||
    remaining <= transitionSeconds
  ) {

    await performAutomaticTransition();

  }

}


/* =========================================================
   DURACIÓN DE TRANSICIÓN
========================================================= */

function calculateTransitionSeconds(
  track
) {

  const bpm =
    Number(track.bpm) ||
    CONFIG.defaultBpm;


  const secondsPerBeat =
    60 / bpm;


  const seconds =
    secondsPerBeat *
    4 *
    CONFIG.transitionBars;


  return clamp(
    seconds,
    12,
    30
  );

}


/* =========================================================
   TRANSICIÓN AUTOMÁTICA
========================================================= */

async function performAutomaticTransition() {

  if (
    state.transitioning
  ) {

    return;

  }


  const outgoingDeck =
    state.activeDeck;


  const incomingDeck =
    oppositeDeck(
      outgoingDeck
    );


  const outgoing =
    state.decks[outgoingDeck];


  const incoming =
    state.decks[incomingDeck];


  if (
    !outgoing.track
  ) {

    return;

  }


  if (
    !incoming.track
  ) {

    await smartNext(false);

  }


  if (
    !incoming.track
  ) {

    return;

  }


  state.transitioning = true;

  state.transitionStarted = true;


  /*
     Comienza la canción entrante
     desde el principio.
  */

  incoming.audio.currentTime = 0;


  alignTempo(
    incomingDeck,
    outgoing.track,
    incoming.track
  );


  try {

    await incoming.audio.play();

  } catch (error) {

    console.warn(
      "No se pudo iniciar deck entrante:",
      error
    );

    state.transitioning = false;

    return;

  }


  const from =
    outgoingDeck === "A"
      ? 0
      : 1;


  const to =
    incomingDeck === "A"
      ? 0
      : 1;


  const duration =
    clamp(
      calculateTransitionSeconds(
        outgoing.track
      ) * 1000,
      CONFIG.minTransitionMs,
      CONFIG.maxTransitionMs
    );


  setStatus(
    `MEZCLANDO ${outgoingDeck} → ${incomingDeck}`,
    "auto"
  );


  const start =
    performance.now();


  await new Promise(
    resolve => {

      function animate(now) {

        const elapsed =
          now - start;


        const raw =
          clamp(
            elapsed / duration,
            0,
            1
          );


        /*
           Ease in/out.
        */

        const eased =
          raw < .5
            ? 2 * raw * raw
            : 1 -
              Math.pow(
                -2 * raw + 2,
                2
              ) / 2;


        const value =
          from +
          (
            to - from
          ) *
          eased;


        updateCrossfader(
          value
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

    }
  );


  outgoing.audio.pause();


  addHistory(
    outgoing.track.id
  );


  /*
     El deck que estaba saliendo
     queda libre para preparar
     la siguiente canción.
  */

  releaseDeck(
    outgoingDeck
  );


  state.activeDeck =
    incomingDeck;


  setActiveDeck(
    incomingDeck
  );


  updateCrossfader(
    incomingDeck === "A"
      ? 0
      : 1
  );


  state.transitioning = false;


  setStatus(
    "AUTO DJ REPRODUCIENDO",
    "auto"
  );


  /*
     Prepara inmediatamente
     la próxima canción.
  */

  await smartNext(false);


  if (
    $("spotAuto").checked
  ) {

    playAutomaticSpot();

  }

}


/* =========================================================
   LIBERAR DECK
========================================================= */

function releaseDeck(deck) {

  const d =
    state.decks[deck];

  if (!d) {
    return;
  }


  d.audio.pause();

  d.audio.removeAttribute("src");

  d.audio.load();

  d.track = null;

  d.duration = 0;

  d.playing = false;


  $("prepared" + deck).textContent =
    "NO";


  updateDeckUI(deck);

}


/* =========================================================
   HISTORIAL
========================================================= */

function addHistory(id) {

  if (!id) {
    return;
  }


  state.history =
    state.history.filter(
      item => item !== id
    );


  state.history.push(id);


  while (
    state.history.length >
    CONFIG.maxHistory
  ) {

    state.history.shift();

  }

}


/* =========================================================
   TRACK INICIAL
========================================================= */

function chooseInitialTrack() {

  if (!state.library.length) {
    return null;
  }


  const notUsed =
    state.library.find(
      track =>
        !state.history.includes(
          track.id
        )
    );


  return (
    notUsed ||
    state.library[0]
  );

}


/* =========================================================
   ANALIZADOR DE BIBLIOTECA
========================================================= */

async function analyzeLibrary() {

  if (!state.library.length) {

    setAnalysisStatus(
      "No hay archivos para analizar."
    );

    return;

  }


  const total =
    state.library.length;


  for (
    let i = 0;
    i < total;
    i++
  ) {

    const track =
      state.library[i];


    setAnalysisStatus(
      `Analizando ${i + 1}/${total}: ${track.name}`
    );


    try {

      await analyzeTrack(
        track
      );

    } catch (error) {

      console.warn(
        "Análisis fallido:",
        track.name,
        error
      );


      /*
         Nunca bloqueamos la aplicación.
      */

      applyFallbackAnalysis(
        track
      );

    }


    renderLibrary();

    renderSmartCompatibilityCurrent();

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          10
        )
    );

  }


  populateGenres();


  setAnalysisStatus(
    `Análisis terminado: ${total} archivos.`
  );


  renderLibrary();

}


/* =========================================================
   ANALIZAR TRACK
========================================================= */

async function analyzeTrack(track) {

  if (
    !state.audioContext
  ) {

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error(
        "Web Audio no disponible."
      );
    }

    state.audioContext =
      new AudioContextClass();

  }


  const buffer =
    await track.file.arrayBuffer();


  const audioBuffer =
    await state.audioContext.decodeAudioData(
      buffer.slice(0)
    );


  const channel =
    audioBuffer.getChannelData(0);


  const sampleRate =
    audioBuffer.sampleRate;


  track.duration =
    audioBuffer.duration;


  track.energy =
    estimateEnergy(
      channel
    );


  track.bpm =
    estimateBPM(
      channel,
      sampleRate
    );


  const key =
    estimateKey(
      channel,
      sampleRate
    );


  track.key =
    key.key;


  track.mode =
    key.mode;


  track.camelot =
    camelotFromKey(
      key.key,
      key.mode
    );


  track.phraseBars =
    track.duration > 180
      ? 16
      : 8;


  track.analyzed =
    true;


  return track;

}


/* =========================================================
   FALLBACK
========================================================= */

function applyFallbackAnalysis(track) {

  track.duration =
    track.duration || 0;

  track.bpm =
    CONFIG.defaultBpm;

  track.energy =
    CONFIG.defaultEnergy;

  track.key =
    CONFIG.defaultKey;

  track.mode =
    "major";

  track.camelot =
    CONFIG.defaultCamelot;

  track.phraseBars =
    16;

  track.analyzed =
    false;

}


/* =========================================================
   ENERGY
========================================================= */

function estimateEnergy(samples) {

  const length =
    Math.min(
      samples.length,
      2205000
    );


  const step =
    Math.max(
      1,
      Math.floor(
        samples.length /
        length
      )
    );


  let sum = 0;

  let count = 0;


  for (
    let i = 0;
    i < samples.length;
    i += step
  ) {

    const value =
      samples[i];

    sum +=
      value * value;

    count++;

  }


  const rms =
    Math.sqrt(
      sum /
      Math.max(count, 1)
    );


  /*
     Conversión aproximada a 0-100.
  */

  const energy =
    clamp(
      (
        20 *
        Math.log10(
          Math.max(rms, .00001)
        ) +
        100
      ),
      0,
      100
    );


  return Math.round(
    energy
  );

}


/* =========================================================
   BPM
========================================================= */

function estimateBPM(
  samples,
  sampleRate
) {

  /*
     Reducimos la señal para detectar
     pulsos sin consumir demasiada memoria.
  */

  const targetRate =
    200;


  const ratio =
    sampleRate /
    targetRate;


  const maxSeconds =
    Math.min(
      90,
      samples.length /
      sampleRate
    );


  const sourceLength =
    Math.floor(
      maxSeconds *
      sampleRate
    );


  const envelopeLength =
    Math.floor(
      sourceLength /
      ratio
    );


  const envelope =
    new Float32Array(
      envelopeLength
    );


  let previous = 0;


  for (
    let i = 0;
    i < envelopeLength;
    i++
  ) {

    const start =
      Math.floor(
        i * ratio
      );


    const end =
      Math.min(
        sourceLength,
        Math.floor(
          (i + 1) * ratio
        )
      );


    let sum = 0;


    for (
      let j = start;
      j < end;
      j += 1
    ) {

      const value =
        Math.abs(
          samples[j]
        );

      sum += value;

    }


    const avg =
      sum /
      Math.max(
        1,
        end - start
      );


    const onset =
      Math.max(
        0,
        avg - previous
      );


    envelope[i] =
      onset;


    previous =
      avg;

  }


  /*
     Suavizado.
  */

  const smooth =
    new Float32Array(
      envelope.length
    );


  const radius = 3;


  for (
    let i = 0;
    i < envelope.length;
    i++
  ) {

    let sum = 0;

    let count = 0;


    for (
      let j =
        Math.max(0, i - radius);

      j <=
        Math.min(
          envelope.length - 1,
          i + radius
        );

      j++
    ) {

      sum +=
        envelope[j];

      count++;

    }


    smooth[i] =
      sum / count;

  }


  let bestBpm =
    CONFIG.defaultBpm;


  let bestScore =
    -Infinity;


  const minBpm = 70;

  const maxBpm = 180;


  for (
    let bpm = minBpm;
    bpm <= maxBpm;
    bpm++
  ) {

    const period =
      targetRate *
      60 /
      bpm;


    let score = 0;


    for (
      let i = 0;
      i < smooth.length;
      i += Math.max(
        1,
        Math.floor(
          period / 4
        )
      )
    ) {

      const index =
        Math.round(
          i / period
        ) *
        period;


      const idx =
        Math.round(index);


      if (
        idx >= 0 &&
        idx < smooth.length
      ) {

        score +=
          smooth[idx];

      }

    }


    /*
       Reforzar subdivisión de 2 beats.
    */

    for (
      let i = 0;
      i < smooth.length;
      i += Math.max(
        1,
        Math.floor(
          period
        )
      )
    ) {

      score +=
        smooth[i] * .5;

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


  /*
     Normalización musical:
     evitar resultados extremos.
  */

  while (
    bestBpm < 85
  ) {

    bestBpm *= 2;

  }


  while (
    bestBpm > 175
  ) {

    bestBpm /= 2;

  }


  return Math.round(
    bestBpm
  );

}


/* =========================================================
   ESTIMACIÓN DE TONALIDAD
========================================================= */

function estimateKey(
  samples,
  sampleRate
) {

  /*
     Perfil aproximado de Krumhansl.
  */

  const majorProfile = [
    6.35,
    2.23,
    3.48,
    2.33,
    4.38,
    4.09,
    2.52,
    5.19,
    2.39,
    3.66,
    2.29,
    2.88
  ];


  const minorProfile = [
    6.33,
    2.68,
    3.52,
    5.38,
    2.60,
    3.53,
    2.54,
    4.75,
    3.98,
    2.69,
    3.34,
    3.17
  ];


  const chroma =
    new Float32Array(12);


  /*
     Tomamos segmentos distribuidos
     en la primera parte de la canción.
  */

  const frames = 12;


  const duration =
    samples.length /
    sampleRate;


  const usable =
    Math.min(
      duration,
      90
    );


  for (
    let frame = 0;
    frame < frames;
    frame++
  ) {

    const position =
      (
        frame /
        frames
      ) *
      usable;


    const start =
      Math.floor(
        position *
        sampleRate
      );


    const size =
      Math.min(
        4096,
        samples.length - start
      );


    if (size <= 0) {
      continue;
    }


    for (
      let pc = 0;
      pc < 12;
      pc++
    ) {

      let energy = 0;


      for (
        let octave = 3;
        octave <= 5;
        octave++
      ) {

        const midi =
          12 *
          (
            octave + 1
          ) +
          pc;


        const frequency =
          440 *
          Math.pow(
            2,
            (
              midi - 69
            ) / 12
          );


        if (
          frequency >=
          sampleRate / 2
        ) {

          continue;

        }


        energy +=
          goertzelMagnitude(
            samples,
            start,
            size,
            sampleRate,
            frequency
          );

      }


      chroma[pc] +=
        energy;

    }

  }


  /*
     Normalizar.
  */

  let total = 0;


  for (
    let i = 0;
    i < 12;
    i++
  ) {

    total +=
      chroma[i];

  }


  if (total > 0) {

    for (
      let i = 0;
      i < 12;
      i++
    ) {

      chroma[i] /=
        total;

    }

  }


  let best = {
    score: -Infinity,
    key: "C",
    mode: "major"
  };


  for (
    let root = 0;
    root < 12;
    root++
  ) {

    const majorScore =
      profileCorrelation(
        chroma,
        majorProfile,
        root
      );


    if (
      majorScore >
      best.score
    ) {

      best = {
        score: majorScore,
        key: KEY_NAMES[root],
        mode: "major"
      };

    }


    const minorScore =
      profileCorrelation(
        chroma,
        minorProfile,
        root
      );


    if (
      minorScore >
      best.score
    ) {

      best = {
        score: minorScore,
        key: KEY_NAMES[root],
        mode: "minor"
      };

    }

  }


  return best;

}


/* =========================================================
   GOERTZEL
========================================================= */

function goertzelMagnitude(
  samples,
  start,
  length,
  sampleRate,
  frequency
) {

  const omega =
    2 *
    Math.PI *
    frequency /
    sampleRate;


  const coeff =
    2 *
    Math.cos(
      omega
    );


  let sPrev = 0;

  let sPrev2 = 0;


  const limit =
    Math.min(
      samples.length,
      start + length
    );


  for (
    let i = start;
    i < limit;
    i++
  ) {

    const sample =
      samples[i];


    const s =
      sample +
      coeff * sPrev -
      sPrev2;


    sPrev2 =
      sPrev;

    sPrev =
      s;

  }


  const power =
    sPrev2 * sPrev2 +
    sPrev * sPrev -
    coeff *
    sPrev *
    sPrev2;


  return Math.sqrt(
    Math.max(
      power,
      0
    )
  );

}


/* =========================================================
   CORRELACIÓN
========================================================= */

function profileCorrelation(
  chroma,
  profile,
  root
) {

  let sum = 0;

  let a = 0;

  let b = 0;


  for (
    let i = 0;
    i < 12;
    i++
  ) {

    const x =
      chroma[i];


    const y =
      profile[
        (
          i - root + 12
        ) % 12
      ];


    sum +=
      x * y;

    a +=
      x * x;

    b +=
      y * y;

  }


  if (
    a === 0 ||
    b === 0
  ) {

    return 0;

  }


  return (
    sum /
    Math.sqrt(
      a * b
    )
  );

}


/* =========================================================
   AGREGAR ARCHIVOS
========================================================= */

function addFiles(files) {

  const supported =
    files.filter(
      file =>
        file.type.startsWith("audio/") ||
        file.type.startsWith("video/") ||
        /\.(mp3|wav|ogg|m4a|aac|flac|mp4|webm|mov|m4v)$/i.test(
          file.name
        )
    );


  for (const file of supported) {

    const duplicate =
      state.library.some(
        track =>
          track.name === file.name &&
          track.file.size === file.size
      );


    if (duplicate) {
      continue;
    }


    const track = {

      id:
        cryptoRandomId(),

      file,

      name:
        file.name,

      url:
        URL.createObjectURL(file),

      genre:
        fileGenre(file),

      mime:
        mimeForFile(file),

      duration:
        0,

      bpm:
        CONFIG.defaultBpm,

      key:
        "--",

      mode:
        "--",

      camelot:
        "--",

      energy:
        CONFIG.defaultEnergy,

      phraseBars:
        16,

      analyzed:
        false,

      preparedFor:
        null

    };


    state.library.push(
      track
    );

  }


  populateGenres();

  renderLibrary();


  setAnalysisStatus(
    `${state.library.length} canciones disponibles.`
  );

}


function cryptoRandomId() {

  if (
    window.crypto &&
    crypto.randomUUID
  ) {

    return crypto.randomUUID();

  }

  return (
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .slice(2)
  );

}


/* =========================================================
   GÉNEROS
========================================================= */

function populateGenres() {

  const select =
    $("genreFilter");


  const current =
    select.value;


  const genres =
    [
      ...new Set(
        state.library.map(
          track =>
            track.genre
        )
      )
    ]
    .sort();


  select.innerHTML =
    `<option value="all">
       Todos los géneros
     </option>`;


  for (const genre of genres) {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      genre;

    option.textContent =
      genre;

    select.appendChild(
      option
    );

  }


  if (
    genres.includes(current)
  ) {

    select.value =
      current;

  }

}


/* =========================================================
   RENDER BIBLIOTECA
========================================================= */

function renderLibrary() {

  const container =
    $("libraryList");


  if (!container) {
    return;
  }


  const search =
    normalizeName(
      $("librarySearch").value
    );


  const genre =
    $("genreFilter").value;


  const filtered =
    state.library.filter(
      track => {

        const matchesSearch =
          !search ||
          normalizeName(
            track.name
          ).includes(search);


        const matchesGenre =
          genre === "all" ||
          track.genre === genre;


        return (
          matchesSearch &&
          matchesGenre
        );

      }
    );


  $("libraryStats").textContent =
    `${state.library.length} canciones`;


  if (!filtered.length) {

    container.innerHTML =
      `<div class="empty-library">
        No hay canciones que coincidan.
      </div>`;

    return;

  }


  container.innerHTML =
    "";


  filtered.forEach(
    (track, index) => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "library-item";


      const duration =
        track.duration
          ? formatTime(
              track.duration
            )
          : "--:--";


      item.innerHTML = `

        <div class="library-main">

          <div class="library-name">
            ${escapeHtml(track.name)}
          </div>

          <div class="library-meta">

            <span>${escapeHtml(track.genre)}</span>

            <span>
              BPM ${track.bpm || "--"}
            </span>

            <span>
              ${track.camelot || "--"}
            </span>

            <span>
              E ${track.energy || "--"}
            </span>

            <span>
              ${duration}
            </span>

            <span>
              ${
                track.analyzed
                  ? "✓ ANALIZADO"
                  : "PENDIENTE"
              }
            </span>

          </div>

        </div>

        <div class="library-actions">

          <button
            class="mini-button"
            data-action="A"
            data-id="${track.id}">
            A
          </button>

          <button
            class="mini-button"
            data-action="B"
            data-id="${track.id}">
            B
          </button>

          <button
            class="mini-button"
            data-action="delete"
            data-id="${track.id}">
            ×
          </button>

        </div>

      `;


      item
        .querySelectorAll(
          ".mini-button"
        )
        .forEach(
          button => {

            button.addEventListener(
              "click",
              () => {

                const action =
                  button.dataset.action;

                const id =
                  button.dataset.id;


                if (
                  action ===
                  "delete"
                ) {

                  removeTrack(id);

                  return;

                }


                const track =
                  state.library.find(
                    t =>
                      t.id === id
                  );


                if (track) {

                  loadTrackToDeck(
                    track,
                    action,
                    false
                  );

                }

              }
            );

          }
        );


      container.appendChild(
        item
      );

    }
  );

}


function removeTrack(id) {

  const index =
    state.library.findIndex(
      track =>
        track.id === id
    );


  if (index < 0) {
    return;
  }


  const track =
    state.library[index];


  /*
     No revocamos la URL si
     está actualmente cargada
     en un deck.
  */

  if (
    !state.decks.A.track ||
    state.decks.A.track.id !== id
  ) {

    if (
      !state.decks.B.track ||
      state.decks.B.track.id !== id
    ) {

      URL.revokeObjectURL(
        track.url
      );

    }

  }


  state.library.splice(
    index,
    1
  );


  populateGenres();

  renderLibrary();

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(value) {

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
   UI DECK
========================================================= */

function updateDeckUI(deck) {

  const d =
    state.decks[deck];


  if (!d) {
    return;
  }


  const suffix =
    deck;


  const track =
    d.track;


  $("title" + suffix).textContent =
    track
      ? track.name
      : "Sin canción";


  $("file" + suffix).textContent =
    track
      ? `${track.genre} • ${track.mime}`
      : "Deck disponible";


  $("bpm" + suffix).textContent =
    track
      ? track.bpm
      : "--";


  $("key" + suffix).textContent =
    track
      ? track.key
      : "--";


  $("camelot" + suffix).textContent =
    track
      ? track.camelot
      : "--";


  $("energy" + suffix).textContent =
    track
      ? track.energy
      : "--";


  $("state" + suffix).textContent =
    d.playing
      ? "REPRODUCIENDO"
      : track
        ? "CARGADO"
        : "STANDBY";


  $("prepared" + suffix).textContent =
    track
      ? "SÍ"
      : "NO";


  const current =
    d.audio.currentTime || 0;


  const duration =
    d.audio.duration ||
    d.duration ||
    0;


  $("current" + suffix).textContent =
    formatTime(current);


  $("duration" + suffix).textContent =
    formatTime(duration);


  $("progress" + suffix).value =
    duration
      ? (
          current /
          duration *
          100
        )
      : 0;

}


/* =========================================================
   UPDATE GENERAL
========================================================= */

function updateAll() {

  updateDeckUI("A");

  updateDeckUI("B");

  updateCrossfader(
    state.crossfader
  );


  $("activeDeck").textContent =
    state.activeDeck;


  $("nextDeck").textContent =
    oppositeDeck(
      state.activeDeck
    );

}


/* =========================================================
   MONITOR
========================================================= */

function monitorEngine() {

  updateDeckUI("A");

  updateDeckUI("B");


  if (
    state.autoDJ
  ) {

    autoDJCheck(false);

  }


  syncVideo();

  updateMeters();

}


/* =========================================================
   VISUALIZADOR
========================================================= */

function startVisualizer() {

  const canvas =
    $("visualizer");


  const ctx =
    canvas.getContext(
      "2d"
    );


  function resize() {

    const rect =
      canvas.getBoundingClientRect();


    const dpr =
      window.devicePixelRatio ||
      1;


    canvas.width =
      rect.width * dpr;


    canvas.height =
      rect.height * dpr;


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


  function draw() {

    state.animationFrame =
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

      drawIdleVisualizer(
        ctx,
        width,
        height
      );

      return;

    }


    const data =
      new Uint8Array(
        state.analyser.frequencyBinCount
      );


    state.analyser.getByteFrequencyData(
      data
    );


    const bars = 80;

    const step =
      Math.floor(
        data.length /
        bars
      );


    const barWidth =
      width /
      bars;


    for (
      let i = 0;
      i < bars;
      i++
    ) {

      let value =
        data[
          i * step
        ] || 0;


      const percent =
        value / 255;


      const barHeight =
        percent *
        height *
        .75;


      const x =
        i *
        barWidth;


      const y =
        height -
        barHeight;


      const gradient =
        ctx.createLinearGradient(
          0,
          y,
          0,
          height
        );


      gradient.addColorStop(
        0,
        "#00f0ff"
      );

      gradient.addColorStop(
        .5,
        "#9b5cff"
      );

      gradient.addColorStop(
        1,
        "#ff3158"
      );


      ctx.fillStyle =
        gradient;


      ctx.fillRect(
        x + 1,
        y,
        Math.max(
          1,
          barWidth - 2
        ),
        barHeight
      );

    }

  }


  draw();

}


function drawIdleVisualizer(
  ctx,
  width,
  height
) {

  const center =
    height / 2;


  for (
    let i = 0;
    i < 80;
    i++
  ) {

    const wave =
      Math.sin(
        (
          i * .18
        ) +
        Date.now() / 700
      );


    const h =
      8 +
      (
        (
          wave + 1
        ) / 2
      ) *
      35;


    const x =
      i *
      (
        width / 80
      );


    ctx.fillStyle =
      i % 3 === 0
        ? "#00f0ff"
        : i % 3 === 1
          ? "#9b5cff"
          : "#ff3158";


    ctx.globalAlpha =
      .3;


    ctx.fillRect(
      x,
      center - h / 2,
      Math.max(
        1,
        width / 80 - 2
      ),
      h
    );

  }


  ctx.globalAlpha = 1;

}


/* =========================================================
   METROS
========================================================= */

function updateMeters() {

  if (
    !state.analyser
  ) {

    $("meterA").style.height =
      "4%";

    $("meterB").style.height =
      "4%";

    return;

  }


  const data =
    new Uint8Array(
      state.analyser.frequencyBinCount
    );


  state.analyser.getByteFrequencyData(
    data
  );


  let sum = 0;


  for (
    let i = 0;
    i < data.length;
    i++
  ) {

    sum +=
      data[i];

  }


  const average =
    sum /
    Math.max(
      1,
      data.length
    );


  const value =
    clamp(
      average / 255 * 100,
      4,
      100
    );


  const cross =
    state.crossfader;


  $("meterA").style.height =
    (
      value *
      Math.cos(
        cross *
        Math.PI / 2
      )
    ) + "%";


  $("meterB").style.height =
    (
      value *
      Math.sin(
        cross *
        Math.PI / 2
      )
    ) + "%";

}


/* =========================================================
   VIDEO
========================================================= */

function syncVideo() {

  const video =
    $("videoScreen");


  const d =
    state.decks[
      state.activeDeck
    ];


  if (
    !d ||
    !d.track
  ) {

    video.pause();

    video.removeAttribute(
      "src"
    );

    video.style.display =
      "none";

    $("mediaPlaceholder").style.display =
      "grid";

    return;

  }


  if (
    !isVideoFile(
      d.track.file
    )
  ) {

    video.pause();

    video.style.display =
      "none";

    $("mediaPlaceholder").style.display =
      "grid";

    return;

  }


  if (
    video.src !==
    d.track.url
  ) {

    video.src =
      d.track.url;

    video.load();

  }


  video.style.display =
    "block";


  $("mediaPlaceholder").style.display =
    "none";


  /*
     El video está muteado porque
     el audio principal pasa por
     Web Audio.
  */

  video.muted = true;

  video.currentTime =
    d.audio.currentTime || 0;


  if (
    d.playing
  ) {

    video.play()
      .catch(
        () => {}
      );

  } else {

    video.pause();

  }

}


function updateMediaForActiveDeck() {

  const d =
    state.decks[
      state.activeDeck
    ];


  if (
    d &&
    d.track &&
    isVideoFile(
      d.track.file
    )
  ) {

    $("mediaStatus").textContent =
      "VIDEO 16:9";

  } else {

    $("mediaStatus").textContent =
      "VISUALIZADOR";

  }

}


/* =========================================================
   SMART COMPATIBILITY UI
========================================================= */

function renderSmartCompatibility(
  base,
  next
) {

  if (!base || !next) {
    return;
  }


  const score =
    compatibilityScore(
      base,
      next
    );


  $("smartScore").textContent =
    score + "%";


  $("smartBpm").textContent =
    `${base.bpm} → ${next.bpm}`;


  $("smartCamelot").textContent =
    `${base.camelot} → ${next.camelot}`;


  $("smartEnergy").textContent =
    `${base.energy} → ${next.energy}`;


  $("smartGenre").textContent =
    next.genre;


  $("nextTrackInfo").textContent =
    `${next.name} • ${next.genre} • BPM ${next.bpm} • ${next.camelot} • Compatibilidad ${score}%`;

}


function renderSmartCompatibilityCurrent() {

  const active =
    state.decks[
      state.activeDeck
    ];


  const next =
    state.decks[
      oppositeDeck(
        state.activeDeck
      )
    ];


  if (
    active &&
    active.track &&
    next &&
    next.track
  ) {

    renderSmartCompatibility(
      active.track,
      next.track
    );

  }

}


/* =========================================================
   ESTADO
========================================================= */

function setStatus(
  message,
  type = "normal"
) {

  $("systemStatus").textContent =
    message;


  const led =
    $("systemLed");


  led.classList.remove(
    "error",
    "auto"
  );


  if (
    type === "auto"
  ) {

    led.classList.add(
      "auto"
    );

  } else if (
    type === "error"
  ) {

    led.classList.add(
      "error"
    );

  }

}


function setAnalysisStatus(
  message
) {

  $("analysisStatus").textContent =
    message;

}


/* =========================================================
   SPOTS
========================================================= */

function addSpots(files) {

  for (const file of files) {

    const spot = {

      id:
        cryptoRandomId(),

      file,

      name:
        file.name,

      url:
        URL.createObjectURL(file)

    };


    state.spots.push(
      spot
    );

  }


  renderSpots();

}


function renderSpots() {

  const container =
    $("spotsList");


  if (!state.spots.length) {

    container.innerHTML =
      `<div class="empty-library">
        No hay spots cargados.
      </div>`;

    return;

  }


  container.innerHTML =
    "";


  state.spots.forEach(
    (spot, index) => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "spot-item";


      item.innerHTML = `

        <div class="spot-name">
          📢 ${escapeHtml(spot.name)}
        </div>

        <div class="library-actions">

          <button class="mini-button">
            ▶ PLAY
          </button>

          <button class="mini-button">
            ×
          </button>

        </div>

      `;


      const buttons =
        item.querySelectorAll(
          "button"
        );


      buttons[0].addEventListener(
        "click",
        () =>
          playSpot(index)
      );


      buttons[1].addEventListener(
        "click",
        () =>
          removeSpot(index)
      );


      container.appendChild(
        item
      );

    }
  );

}


function removeSpot(index) {

  const spot =
    state.spots[index];


  if (!spot) {
    return;
  }


  URL.revokeObjectURL(
    spot.url
  );


  state.spots.splice(
    index,
    1
  );


  renderSpots();

}


/* =========================================================
   REPRODUCIR SPOT
========================================================= */

async function playSpot(
  index
) {

  const spot =
    state.spots[index];


  if (!spot) {
    return;
  }


  try {

    await ensureAudioEngine();

  } catch (error) {

    console.error(error);

  }


  const audio =
    $("spotAudio");


  audio.pause();

  audio.src =
    spot.url;

  audio.load();


  state.currentSpot =
    spot;


  state.spotRemaining =
    Math.max(
      1,
      Number(
        $("spotRepeat").value
      ) || 1
    );


  audio.onended =
    handleSpotEnded;


  try {

    await audio.play();

  } catch (error) {

    console.warn(
      "Spot bloqueado:",
      error
    );

  }

}


async function handleSpotEnded() {

  state.spotRemaining--;


  if (
    state.spotRemaining <= 0
  ) {

    state.currentSpot =
      null;

    return;

  }


  const interval =
    Math.max(
      0,
      Number(
        $("spotInterval").value
      ) || 0
    );


  clearTimeout(
    state.spotTimer
  );


  state.spotTimer =
    setTimeout(
      () => {

        const audio =
          $("spotAudio");


        audio.currentTime =
          0;


        audio.play()
          .catch(
            () => {}
          );

      },
      interval * 1000
    );

}


function playAutomaticSpot() {

  if (
    !state.spots.length
  ) {

    return;

  }


  playSpot(0);

}


/* =========================================================
   GRABACIÓN
========================================================= */

async function toggleRecording() {

  if (
    state.recording
  ) {

    stopRecording();

  } else {

    await startRecording();

  }

}


async function startRecording() {

  try {

    await ensureAudioEngine();

  } catch (error) {

    console.error(error);

    return;

  }


  if (
    !state.recordDestination
  ) {

    return;

  }


  if (
    !window.MediaRecorder
  ) {

    $("recordStatus").textContent =
      "MediaRecorder no disponible.";

    return;

  }


  const stream =
    state.recordDestination.stream;


  let mimeType =
    "";


  const options = [

    "audio/webm;codecs=opus",

    "audio/webm",

    "audio/ogg;codecs=opus"

  ];


  for (
    const type of options
  ) {

    if (
      MediaRecorder.isTypeSupported(
        type
      )
    ) {

      mimeType =
        type;

      break;

    }

  }


  try {

    state.mediaRecorder =
      mimeType
        ? new MediaRecorder(
            stream,
            {
              mimeType
            }
          )
        : new MediaRecorder(
            stream
          );


  } catch (error) {

    console.error(error);

    $("recordStatus").textContent =
      "No se pudo iniciar la grabación.";

    return;

  }


  state.recordingChunks =
    [];


  state.mediaRecorder.ondataavailable =
    event => {

      if (
        event.data &&
        event.data.size > 0
      ) {

        state.recordingChunks.push(
          event.data
        );

      }

    };


  state.mediaRecorder.onstop =
    createRecording;


  state.mediaRecorder.start(
    1000
  );


  state.recording =
    true;


  $("recordBtn").textContent =
    "■ DETENER GRABACIÓN";


  $("recordBtn").classList.add(
    "recording"
  );


  $("recordStatus").textContent =
    "Grabando set en vivo...";

}


function stopRecording() {

  if (
    !state.mediaRecorder
  ) {

    return;

  }


  if (
    state.mediaRecorder.state !==
    "inactive"
  ) {

    state.mediaRecorder.stop();

  }


  state.recording =
    false;


  $("recordBtn").textContent =
    "● INICIAR GRABACIÓN";


  $("recordBtn").classList.remove(
    "recording"
  );


  $("recordStatus").textContent =
    "Procesando grabación...";

}


function createRecording() {

  const blob =
    new Blob(
      state.recordingChunks,
      {
        type:
          state.mediaRecorder.mimeType ||
          "audio/webm"
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    $("downloadRecording");


  link.href =
    url;


  link.classList.remove(
    "hidden"
  );


  $("recordStatus").textContent =
    "Set listo para descargar.";

}


/* =========================================================
   FULLSCREEN
========================================================= */

async function toggleFullscreen() {

  try {

    if (
      document.fullscreenElement
    ) {

      await document.exitFullscreen();

      document.body.classList.remove(
        "fullscreen-mode"
      );

      return;

    }


    if (
      document.documentElement.requestFullscreen
    ) {

      await document.documentElement.requestFullscreen();

    }


    document.body.classList.add(
      "fullscreen-mode"
    );

  } catch (error) {

    document.body.classList.toggle(
      "fullscreen-mode"
    );

  }

}


document.addEventListener(
  "fullscreenchange",
  () => {

    document.body.classList.toggle(
      "fullscreen-mode",
      Boolean(
        document.fullscreenElement
      )
    );

  }
);


/* =========================================================
   TECLADO
========================================================= */

function keyboardShortcuts(
  event
) {

  /*
     No interferir cuando el usuario
     está escribiendo.
  */

  const tag =
    event.target.tagName;


  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT"
  ) {

    return;

  }


  if (
    event.code ===
    "Space"
  ) {

    event.preventDefault();


    if (
      state.decks[
        state.activeDeck
      ].playing
    ) {

      stopDeck(
        state.activeDeck
      );

    } else {

      playDeck(
        state.activeDeck
      );

    }

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
    "s"
  ) {

    smartNext(true);

  }


  if (
    event.key.toLowerCase() ===
    "d"
  ) {

    toggleAutoDJ();

  }

}


/* =========================================================
   VIDEO SYNC
========================================================= */

setInterval(
  () => {

    const video =
      $("videoScreen");


    const d =
      state.decks[
        state.activeDeck
      ];


    if (
      !video ||
      !d ||
      !d.track ||
      !isVideoFile(
        d.track.file
      )
    ) {

      return;

    }


    if (
      Math.abs(
        video.currentTime -
        d.audio.currentTime
      ) > .5
    ) {

      try {

        video.currentTime =
          d.audio.currentTime;

      } catch (error) {}

    }

  },
  500
);


/* =========================================================
   ERROR GLOBAL
   NUNCA BLOQUEAR LA INTERFAZ
========================================================= */

window.addEventListener(
  "error",
  event => {

    console.error(
      "HC PRO error:",
      event.error ||
      event.message
    );

    /*
       La aplicación permanece
       abierta aunque un módulo
       produzca un error.
    */

  }
);


window.addEventListener(
  "unhandledrejection",
  event => {

    console.warn(
      "HC PRO promise:",
      event.reason
    );

    event.preventDefault();

  }
);


/* =========================================================
   FIN HC PRO DJ HUMBERTO 4.0
========================================================= */
