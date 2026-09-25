/* =========================================================
   DJ HUMBERTO — HC PRO
   PROFESSIONAL DJ ENGINE
   CROSS FADER + AUTO MIX + MP3 VISUALIZER + MP4 VIDEO
========================================================= */

"use strict";

/* =========================================================
   ESTADO GLOBAL
========================================================= */

const state = {

  audioContext: null,

  masterGain: null,
  compressor: null,
  analyser: null,
  recordDestination: null,

  recorder: null,
  recordChunks: [],

  started: false,

  activeDeck: "A",

  autoMix: false,
  autoMixTimer: null,
  autoMixCountdownTimer: null,
  autoMixSeconds: 10,

  crossfadeSeconds: 4,

  smartAuto: false,

  library: [],

  voiceFiles: [],
  voiceEnabled: false,
  voiceTimer: null,
  voiceInterval: 10,
  voiceVolume: 0.8,

  micStream: null,
  micGain: null,

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
   INICIO
========================================================= */

document.addEventListener("DOMContentLoaded", init);

function init() {

  bindButtons();
  bindControls();
  updateClock();

  setInterval(updateClock, 1000);

  drawIdleVisualizer();

  setStatus("SISTEMA LISTO");

}


/* =========================================================
   AUDIO ENGINE
========================================================= */

async function startEngine() {

  try {

    if (!state.audioContext) {

      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      state.audioContext = new AudioContext();

      state.masterGain =
        state.audioContext.createGain();

      state.compressor =
        state.audioContext.createDynamicsCompressor();

      state.analyser =
        state.audioContext.createAnalyser();

      state.recordDestination =
        state.audioContext.createMediaStreamDestination();

      state.analyser.fftSize = 2048;

      state.masterGain.gain.value = .9;

      state.compressor.threshold.value = -10;
      state.compressor.knee.value = 15;
      state.compressor.ratio.value = 4;
      state.compressor.attack.value = .003;
      state.compressor.release.value = .2;

      state.masterGain
        .connect(state.compressor);

      state.compressor
        .connect(state.analyser);

      state.compressor
        .connect(state.recordDestination);

      state.analyser.connect(
        state.audioContext.destination
      );

      createDeck("A");
      createDeck("B");

      createVoiceEngine();

    }

    if (state.audioContext.state === "suspended") {
      await state.audioContext.resume();
    }

    state.started = true;

    $("bootScreen").classList.add("hidden");

    setStatus("AUDIO ENGINE ACTIVO");

    animate();

  } catch (error) {

    console.error(error);

    $("bootMessage").textContent =
      "No se pudo activar el motor de audio: " +
      error.message;

    setStatus("ERROR DE AUDIO");

  }

}


/* =========================================================
   CREAR DECK
========================================================= */

function createDeck(letter) {

  const audio =
    letter === "A"
      ? $("audioA")
      : $("audioB");

  const source =
    state.audioContext.createMediaElementSource(audio);

  const inputGain =
    state.audioContext.createGain();

  const volumeGain =
    state.audioContext.createGain();

  const low =
    state.audioContext.createBiquadFilter();

  const mid =
    state.audioContext.createBiquadFilter();

  const high =
    state.audioContext.createBiquadFilter();

  const filter =
    state.audioContext.createBiquadFilter();

  const delay =
    state.audioContext.createDelay(1);

  const feedback =
    state.audioContext.createGain();

  const echoWet =
    state.audioContext.createGain();

  const flangerDelay =
    state.audioContext.createDelay(.05);

  const flangerWet =
    state.audioContext.createGain();

  const reverbDelay =
    state.audioContext.createDelay(2);

  const reverbWet =
    state.audioContext.createGain();

  const dry =
    state.audioContext.createGain();

  const deckGain =
    state.audioContext.createGain();

  /* EQ */

  low.type = "lowshelf";
  low.frequency.value = 180;

  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 1;

  high.type = "highshelf";
  high.frequency.value = 5000;

  /* FX */

  filter.type = "lowpass";
  filter.frequency.value = 18000;

  delay.delayTime.value = .25;
  feedback.gain.value = .25;

  flangerDelay.delayTime.value = .008;

  reverbDelay.delayTime.value = .35;

  echoWet.gain.value = 0;
  flangerWet.gain.value = 0;
  reverbWet.gain.value = 0;

  dry.gain.value = 1;

  inputGain.gain.value = 1;
  volumeGain.gain.value = 1;

  /* =====================================================
     AUDIO GRAPH

     SOURCE
       ↓
     INPUT
       ↓
     EQ
       ↓
     FILTER
       ↓
     DRY / FX
       ↓
     DECK GAIN
       ↓
     MASTER
  ====================================================== */

  source.connect(inputGain);

  inputGain.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(filter);

  /* DRY */

  filter.connect(dry);
  dry.connect(deckGain);

  /* ECHO */

  filter.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(echoWet);
  echoWet.connect(deckGain);

  /* FLANGER */

  filter.connect(flangerDelay);
  flangerDelay.connect(flangerWet);
  flangerWet.connect(deckGain);

  /* REVERB */

  filter.connect(reverbDelay);
  reverbDelay.connect(reverbWet);
  reverbWet.connect(deckGain);

  /* VOLUME */

  deckGain.connect(volumeGain);

  volumeGain.connect(state.masterGain);

  /* Inicialmente sin crossfade */

  deckGain.gain.value = 1;

  state.decks[letter] = {

    letter,
    audio,
    source,

    inputGain,
    volumeGain,

    low,
    mid,
    high,

    filter,

    delay,
    echoWet,

    flangerDelay,
    flangerWet,

    reverbDelay,
    reverbWet,

    dry,
    deckGain,

    file: null,

    effects: {
      filter: false,
      echo: false,
      flanger: false,
      reverb: false
    }

  };

  audio.addEventListener(
    "ended",
    () => handleEnded(letter)
  );

  audio.addEventListener(
    "play",
    () => deckPlaying(letter)
  );

  audio.addEventListener(
    "pause",
    () => deckPaused(letter)
  );

}


/* =========================================================
   VOICE ENGINE
========================================================= */

function createVoiceEngine() {

  const voiceAudio = $("voiceAudio");

  const voiceSource =
    state.audioContext.createMediaElementSource(
      voiceAudio
    );

  const voiceGain =
    state.audioContext.createGain();

  voiceGain.gain.value = state.voiceVolume;

  voiceSource.connect(voiceGain);
  voiceGain.connect(state.masterGain);

  state.voiceGain = voiceGain;

}


/* =========================================================
   LOAD DECK
========================================================= */

function loadDeck(letter, file) {

  if (!file) return;

  ensureAudio();

  const deck = state.decks[letter];

  const url = URL.createObjectURL(file);

  deck.audio.pause();

  deck.audio.src = url;
  deck.audio.load();

  deck.file = file;

  $(letter === "A" ? "trackA" : "trackB").textContent =
    file.name;

  $(letter === "A" ? "statusA" : "statusB").textContent =
    "READY";

  $("visualStatus").textContent =
    "ARCHIVO CARGADO";

  /* Si es MP4 */

  if (isVideo(file)) {

    showVideo(file);

  } else {

    showVisualizer();

  }

  updateScreenMode(file);

}


/* =========================================================
   VIDEO MP4
========================================================= */

function isVideo(file) {

  return (
    file.type.startsWith("video/") ||
    /\.(mp4|webm|ogg)$/i.test(file.name)
  );

}


function showVideo(file) {

  const video = $("videoScreen");

  const url = URL.createObjectURL(file);

  video.src = url;
  video.muted = true;

  video.classList.add("active");

  $("visualizer").style.opacity = "0";

  $("screenMode").textContent =
    "VIDEO MP4";

}


function showVisualizer() {

  const video = $("videoScreen");

  video.pause();
  video.removeAttribute("src");
  video.load();

  video.classList.remove("active");

  $("visualizer").style.opacity = "1";

  $("screenMode").textContent =
    "AUDIO VISUALIZER";

}


/* =========================================================
   PLAY
========================================================= */

async function playDeck(letter) {

  ensureAudio();

  const deck = state.decks[letter];

  if (!deck || !deck.file) {

    alert("Primero cargá un archivo en Deck " + letter);
    return;

  }

  try {

    await deck.audio.play();

    /* Si es MP4 */

    if (isVideo(deck.file)) {

      const video =
        $("videoScreen");

      if (video.src) {

        try {
          await video.play();
        } catch (e) {}

      }

    }

    updateCrossfade();

    scheduleAutoMix();

  } catch (error) {

    console.error(error);

    setStatus(
      "EL NAVEGADOR BLOQUEÓ EL AUDIO"
    );

  }

}


/* =========================================================
   STOP
========================================================= */

function stopDeck(letter) {

  const deck = state.decks[letter];

  if (!deck) return;

  deck.audio.pause();
  deck.audio.currentTime = 0;

  if (
    deck.file &&
    isVideo(deck.file)
  ) {

    $("videoScreen").pause();
    $("videoScreen").currentTime = 0;

  }

  $(letter === "A" ? "statusA" : "statusB")
    .textContent = "STOP";

  $(letter === "A" ? "recordA" : "recordB")
    .classList.remove("playing");

}


/* =========================================================
   ENDED
========================================================= */

function handleEnded(letter) {

  const deck = state.decks[letter];

  $(letter === "A" ? "statusA" : "statusB")
    .textContent = "END";

  $(letter === "A" ? "recordA" : "recordB")
    .classList.remove("playing");

  if (state.autoMix) {

    transitionToOtherDeck(letter);

  }

}


/* =========================================================
   PLAY / PAUSE VISUAL
========================================================= */

function deckPlaying(letter) {

  $(letter === "A" ? "statusA" : "statusB")
    .textContent = "PLAY";

  $(letter === "A" ? "recordA" : "recordB")
    .classList.add("playing");

  $("media-screen")?.classList.add("playing");

  $("visualStatus").textContent =
    "LIVE PLAYBACK";

}


function deckPaused(letter) {

  $(letter === "A" ? "statusA" : "statusB")
    .textContent = "PAUSE";

  $(letter === "A" ? "recordA" : "recordB")
    .classList.remove("playing");

}


/* =========================================================
   CROSS FADER
   CURVA PROFESIONAL
========================================================= */

function updateCrossfade() {

  if (!state.decks.A || !state.decks.B)
    return;

  const x =
    parseFloat(
      $("crossfader").value
    );

  /*
     Equal Power Crossfade

     A = cos(x * PI/2)
     B = sin(x * PI/2)

     Esto evita el agujero de volumen
     en el centro del crossfader.
  */

  const gainA =
    Math.cos(x * Math.PI / 2);

  const gainB =
    Math.sin(x * Math.PI / 2);

  const now =
    state.audioContext.currentTime;

  state.decks.A.deckGain.gain.cancelScheduledValues(now);
  state.decks.B.deckGain.gain.cancelScheduledValues(now);

  state.decks.A.deckGain.gain.setTargetAtTime(
    gainA,
    now,
    .015
  );

  state.decks.B.deckGain.gain.setTargetAtTime(
    gainB,
    now,
    .015
  );

  updateCrossValue(x);

}


function updateCrossValue(x) {

  let text = "CENTER";

  if (x < .08) {
    text = "A FULL";
  } else if (x < .45) {
    text = "A →";
  } else if (x > .92) {
    text = "B FULL";
  } else if (x > .55) {
    text = "→ B";
  }

  $("crossValue").textContent = text;

}


/* =========================================================
   TRANSICIÓN AUTOMÁTICA
========================================================= */

function transitionToOtherDeck(fromLetter) {

  const toLetter =
    fromLetter === "A" ? "B" : "A";

  const from =
    state.decks[fromLetter];

  const to =
    state.decks[toLetter];

  if (!to || !to.file) {

    smartLoadNext(toLetter);

    return;

  }

  if (!from || !from.audio.paused) {

    crossfade(fromLetter, toLetter);

  } else {

    state.activeDeck = toLetter;

    playDeck(toLetter);

  }

}


/* =========================================================
   CROSSFADE AUTOMÁTICO
========================================================= */

async function crossfade(fromLetter, toLetter) {

  const from =
    state.decks[fromLetter];

  const to =
    state.decks[toLetter];

  if (!from || !to || !to.file)
    return;

  ensureAudio();

  const duration =
    Math.max(
      .5,
      Number(
        $("crossfadeDuration").value
      )
    );

  try {

    await to.audio.play();

    const now =
      state.audioContext.currentTime;

    const a =
      Math.cos(.5 * Math.PI / 2);

    const b =
      Math.sin(.5 * Math.PI / 2);

    /* Arrancar B silencioso */

    to.deckGain.gain.cancelScheduledValues(now);

    from.deckGain.gain.cancelScheduledValues(now);

    to.deckGain.gain.setValueAtTime(
      0,
      now
    );

    from.deckGain.gain.setValueAtTime(
      1,
      now
    );

    /*
       Equal-power crossfade
    */

    from.deckGain.gain.exponentialRampToValueAtTime(
      .001,
      now + duration
    );

    to.deckGain.gain.linearRampToValueAtTime(
      1,
      now + duration
    );

    setTimeout(() => {

      from.audio.pause();
      from.audio.currentTime = 0;

      /*
         Dejar la deck nueva en 1
         y la anterior en 0.
      */

      const t =
        state.audioContext.currentTime;

      from.deckGain.gain.cancelScheduledValues(t);
      from.deckGain.gain.setValueAtTime(0, t);

      to.deckGain.gain.cancelScheduledValues(t);
      to.deckGain.gain.setValueAtTime(1, t);

      state.activeDeck = toLetter;

      /*
         Importante:
         sincronizamos el crossfader
         con la deck activa.
      */

      if (toLetter === "A") {

        $("crossfader").value = 0;

      } else {

        $("crossfader").value = 1;

      }

      updateCrossValue(
        Number($("crossfader").value)
      );

      scheduleAutoMix();

    }, duration * 1000 + 100);

  } catch (error) {

    console.error(error);

  }

}


/* =========================================================
   AUTO MIX
========================================================= */

function toggleAutoMix() {

  state.autoMix =
    !state.autoMix;

  const button =
    $("autoMixButton");

  if (state.autoMix) {

    button.textContent =
      "AUTO MIX: ON";

    button.classList.add("active");

    state.autoMixSeconds =
      Number(
        $("autoMixInterval").value
      );

    scheduleAutoMix();

  } else {

    button.textContent =
      "AUTO MIX: OFF";

    button.classList.remove("active");

    clearAutoMix();

  }

}


function scheduleAutoMix() {

  clearAutoMix();

  if (!state.autoMix)
    return;

  const active =
    state.decks[state.activeDeck];

  if (!active || active.audio.paused)
    return;

  state.autoMixSeconds =
    Number(
      $("autoMixInterval").value
    );

  $("autoCountdown").textContent =
    state.autoMixSeconds + "s";

  state.autoMixCountdownTimer =
    setInterval(() => {

      state.autoMixSeconds--;

      $("autoCountdown").textContent =
        Math.max(
          0,
          state.autoMixSeconds
        ) + "s";

      if (state.autoMixSeconds <= 0) {

        clearInterval(
          state.autoMixCountdownTimer
        );

      }

    }, 1000);

  state.autoMixTimer =
    setTimeout(() => {

      const from =
        state.activeDeck;

      const to =
        from === "A" ? "B" : "A";

      if (!state.decks[to].file) {

        smartLoadNext(to);

      }

      if (state.decks[to].file) {

        crossfade(from, to);

      }

    }, Number($("autoMixInterval").value) * 1000);

}


function clearAutoMix() {

  clearTimeout(
    state.autoMixTimer
  );

  clearInterval(
    state.autoMixCountdownTimer
  );

  state.autoMixTimer = null;
  state.autoMixCountdownTimer = null;

  $("autoCountdown").textContent =
    "--";

}


/* =========================================================
   SMART NEXT
========================================================= */

function smartLoadNext(letter) {

  if (!state.library.length)
    return;

  const activeFile =
    state.decks[state.activeDeck]?.file;

  const candidates =
    state.library.filter(
      item => item.file !== activeFile
    );

  if (!candidates.length)
    return;

  const item =
    candidates[
      Math.floor(
        Math.random() * candidates.length
      )
    ];

  loadDeck(letter, item.file);

}


/* =========================================================
   SMART AUTO
========================================================= */

function toggleSmartAuto() {

  state.smartAuto =
    !state.smartAuto;

  const button =
    $("smartAuto");

  button.textContent =
    state.smartAuto
      ? "SMART AUTO: ON"
      : "SMART AUTO: OFF";

  button.classList.toggle(
    "active",
    state.smartAuto
  );

  if (state.smartAuto) {

    const other =
      state.activeDeck === "A"
        ? "B"
        : "A";

    if (!state.decks[other].file) {
      smartLoadNext(other);
    }

  }

}


/* =========================================================
   EFFECTS INDIVIDUALES
========================================================= */

function toggleEffect(letter, effect) {

  const deck =
    state.decks[letter];

  if (!deck)
    return;

  deck.effects[effect] =
    !deck.effects[effect];

  const active =
    deck.effects[effect];

  switch (effect) {

    case "filter":

      deck.filter.frequency.value =
        active ? 850 : 18000;

      break;

    case "echo":

      deck.echoWet.gain.value =
        active ? .35 : 0;

      break;

    case "flanger":

      deck.flangerWet.gain.value =
        active ? .25 : 0;

      break;

    case "reverb":

      deck.reverbWet.gain.value =
        active ? .25 : 0;

      break;

  }

  document
    .querySelectorAll(
      `[data-deck="${letter}"][data-effect="${effect}"]`
    )
    .forEach(btn => {

      btn.classList.toggle(
        "active",
        active
      );

    });

}


/* =========================================================
   EQ
========================================================= */

function setEQ(letter, band, value) {

  const deck =
    state.decks[letter];

  if (!deck)
    return;

  const v =
    Number(value);

  if (band === "low")
    deck.low.gain.value = v;

  if (band === "mid")
    deck.mid.gain.value = v;

  if (band === "high")
    deck.high.gain.value = v;

}


/* =========================================================
   VOLUME
========================================================= */

function setDeckVolume(letter, value) {

  const deck =
    state.decks[letter];

  if (!deck)
    return;

  deck.volumeGain.gain.value =
    Number(value);

}


/* =========================================================
   PITCH
========================================================= */

function setPitch(letter, value) {

  const deck =
    state.decks[letter];

  if (!deck)
    return;

  deck.audio.playbackRate =
    Number(value);

  $(
    letter === "A"
      ? "pitchValueA"
      : "pitchValueB"
  ).textContent =
    Number(value).toFixed(2) + "x";

}


/* =========================================================
   MASTER
========================================================= */

function setMaster(value) {

  if (!state.masterGain)
    return;

  state.masterGain.gain.value =
    Number(value);

  $("masterValue").textContent =
    Math.round(Number(value) * 100) + "%";

}


/* =========================================================
   LIBRARY
========================================================= */

function addLibrary(files) {

  [...files].forEach(file => {

    const exists =
      state.library.some(
        item => item.file.name === file.name &&
                item.file.size === file.size
      );

    if (!exists) {

      state.library.push({
        file
      });

    }

  });

  renderLibrary();

}


function renderLibrary() {

  const list =
    $("libraryList");

  list.innerHTML = "";

  if (!state.library.length) {

    list.innerHTML =
      `<div class="empty-library">
        No hay archivos cargados.
      </div>`;

    return;

  }

  state.library.forEach(
    (item, index) => {

      const row =
        document.createElement("div");

      row.className =
        "library-item";

      const name =
        document.createElement("div");

      name.className =
        "library-name";

      name.textContent =
        item.file.name;

      const btnA =
        document.createElement("button");

      btnA.textContent =
        "A";

      btnA.onclick = () =>
        loadDeck("A", item.file);

      const btnB =
        document.createElement("button");

      btnB.textContent =
        "B";

      btnB.onclick = () =>
        loadDeck("B", item.file);

      row.append(
        name,
        btnA,
        btnB
      );

      list.appendChild(row);

    }
  );

}


/* =========================================================
   VOICE ID
========================================================= */

function loadVoiceFiles(files) {

  state.voiceFiles =
    [...files];

  $("voiceStatus").textContent =
    state.voiceFiles.length +
    " VOICE ID CARGADOS";

}


function toggleVoice() {

  state.voiceEnabled =
    !state.voiceEnabled;

  $("voiceButton").textContent =
    state.voiceEnabled
      ? "VOICE ID: ON"
      : "VOICE ID: OFF";

  $("voiceButton").classList.toggle(
    "active",
    state.voiceEnabled
  );

  clearTimeout(
    state.voiceTimer
  );

  if (state.voiceEnabled) {

    state.voiceInterval =
      Number(
        $("voiceInterval").value
      );

    scheduleVoice();

  }

}


function scheduleVoice() {

  if (!state.voiceEnabled)
    return;

  const minutes =
    Number(
      $("voiceInterval").value
    );

  state.voiceTimer =
    setTimeout(() => {

      playVoiceID();

      scheduleVoice();

    }, minutes * 60 * 1000);

}


async function playVoiceID() {

  if (!state.voiceFiles.length)
    return;

  const file =
    state.voiceFiles[
      Math.floor(
        Math.random() *
        state.voiceFiles.length
      )
    ];

  const url =
    URL.createObjectURL(file);

  const audio =
    $("voiceAudio");

  audio.src = url;

  audio.volume =
    Number(
      $("voiceVolume").value
    );

  /*
     Ducking profesional
  */

  const original =
    state.masterGain.gain.value;

  if (state.masterGain) {

    const now =
      state.audioContext.currentTime;

    state.masterGain.gain.cancelScheduledValues(now);

    state.masterGain.gain.setTargetAtTime(
      original * .35,
      now,
      .05
    );

  }

  try {

    await audio.play();

  } catch (error) {

    console.error(error);

  }

  audio.onended = () => {

    if (state.masterGain) {

      const now =
        state.audioContext.currentTime;

      state.masterGain.gain.setTargetAtTime(
        Number($("masterVolume").value),
        now,
        .15
      );

    }

    URL.revokeObjectURL(url);

  };

}


/* =========================================================
   MIC
========================================================= */

async function toggleMic() {

  if (state.micStream) {

    state.micStream
      .getTracks()
      .forEach(track => track.stop());

    state.micStream = null;

    $("micButton").textContent =
      "🎙 MIC";

    return;

  }

  try {

    const stream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true
        });

    state.micStream =
      stream;

    const source =
      state.audioContext
        .createMediaStreamSource(stream);

    state.micGain =
      state.audioContext.createGain();

    state.micGain.gain.value =
      .8;

    source.connect(
      state.micGain
    );

    state.micGain.connect(
      state.masterGain
    );

    $("micButton").textContent =
      "🎙 MIC ON";

  } catch (error) {

    alert(
      "No se pudo activar el micrófono."
    );

  }

}


/* =========================================================
   GRABACIÓN
========================================================= */

function toggleRecording() {

  if (!state.recordDestination)
    return;

  if (
    state.recorder &&
    state.recorder.state === "recording"
  ) {

    stopRecording();
    return;

  }

  startRecording();

}


function startRecording() {

  state.recordChunks = [];

  let options = {};

  if (
    MediaRecorder.isTypeSupported(
      "audio/webm;codecs=opus"
    )
  ) {

    options.mimeType =
      "audio/webm;codecs=opus";

  }

  state.recorder =
    new MediaRecorder(
      state.recordDestination.stream,
      options
    );

  state.recorder.ondataavailable =
    event => {

      if (event.data.size > 0) {
        state.recordChunks.push(
          event.data
        );
      }

    };

  state.recorder.onstop =
    saveRecording;

  state.recorder.start();

  $("recordButton").textContent =
    "■ STOP REC";

  $("recordingStatus").textContent =
    "● GRABANDO";

  $("recordingStatus")
    .classList.add("recording");

}


function stopRecording() {

  if (!state.recorder)
    return;

  state.recorder.stop();

  $("recordButton").textContent =
    "● REC";

  $("recordingStatus").textContent =
    "REC: PROCESANDO";

  $("recordingStatus")
    .classList.remove("recording");

}


function saveRecording() {

  const blob =
    new Blob(
      state.recordChunks,
      {
        type: "audio/webm"
      }
    );

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;
  a.download =
    "DJ-HUMBERTO-HC-PRO-" +
    Date.now() +
    ".webm";

  a.click();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );

  $("recordingStatus").textContent =
    "REC: GUARDADO";

}


/* =========================================================
   STOP ALL
========================================================= */

function stopAll() {

  ["A", "B"].forEach(
    letter => stopDeck(letter)
  );

  clearAutoMix();

  state.autoMix = false;

  $("autoMixButton").textContent =
    "AUTO MIX: OFF";

  $("autoMixButton")
    .classList.remove("active");

  $("autoCountdown").textContent =
    "--";

}


/* =========================================================
   VISUALIZADOR
========================================================= */

function animate() {

  requestAnimationFrame(animate);

  if (
    !state.analyser ||
    !state.started
  ) {

    drawIdleVisualizer();
    return;

  }

  const analyser =
    state.analyser;

  const canvas =
    $("visualizer");

  const ctx =
    canvas.getContext("2d");

  const rect =
    canvas.getBoundingClientRect();

  if (
    canvas.width !== Math.floor(rect.width * devicePixelRatio) ||
    canvas.height !== Math.floor(rect.height * devicePixelRatio)
  ) {

    canvas.width =
      Math.floor(rect.width * devicePixelRatio);

    canvas.height =
      Math.floor(rect.height * devicePixelRatio);

    ctx.setTransform(
      devicePixelRatio,
      0,
      0,
      devicePixelRatio,
      0,
      0
    );

  }

  const width =
    rect.width;

  const height =
    rect.height;

  const buffer =
    new Uint8Array(
      analyser.frequencyBinCount
    );

  analyser.getByteFrequencyData(
    buffer
  );

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  /* Fondo */

  const gradient =
    ctx.createRadialGradient(
      width / 2,
      height / 2,
      10,
      width / 2,
      height / 2,
      width
    );

  gradient.addColorStop(
    0,
    "rgba(0,234,255,.12)"
  );

  gradient.addColorStop(
    .45,
    "rgba(70,40,180,.08)"
  );

  gradient.addColorStop(
    1,
    "rgba(0,0,0,.8)"
  );

  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  /* BARRAS */

  const bars = 100;
  const step =
    Math.floor(
      buffer.length / bars
    );

  const barWidth =
    width / bars;

  let total = 0;

  for (
    let i = 0;
    i < bars;
    i++
  ) {

    const value =
      buffer[i * step] || 0;

    total += value;

    const h =
      (value / 255) *
      height *
      .65;

    const x =
      i * barWidth;

    const y =
      height / 2 - h / 2;

    const hue =
      180 +
      (i / bars) * 150;

    ctx.fillStyle =
      `hsla(${hue},100%,60%,.75)`;

    ctx.shadowBlur = 15;

    ctx.shadowColor =
      `hsla(${hue},100%,60%,.8)`;

    ctx.fillRect(
      x + 1,
      y,
      Math.max(1, barWidth - 2),
      h
    );

  }

  ctx.shadowBlur = 0;

  updateMeters(total / bars);

  drawMiniWave(buffer);

}


/* =========================================================
   MINI WAVE
========================================================= */

function drawMiniWave(buffer) {

  const canvas =
    $("miniWave");

  const rect =
    canvas.getBoundingClientRect();

  canvas.width =
    Math.floor(rect.width * devicePixelRatio);

  canvas.height =
    Math.floor(rect.height * devicePixelRatio);

  const ctx =
    canvas.getContext("2d");

  ctx.setTransform(
    devicePixelRatio,
    0,
    0,
    devicePixelRatio,
    0,
    0
  );

  const width =
    rect.width;

  const height =
    rect.height;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  ctx.beginPath();

  for (
    let x = 0;
    x < width;
    x++
  ) {

    const index =
      Math.floor(
        x / width *
        buffer.length
      );

    const value =
      buffer[index] || 0;

    const y =
      height / 2 -
      (value / 255) *
      height / 2;

    if (x === 0)
      ctx.moveTo(x, y);
    else
      ctx.lineTo(x, y);

  }

  ctx.strokeStyle =
    "#00eaff";

  ctx.lineWidth = 1.5;

  ctx.shadowBlur = 8;
  ctx.shadowColor = "#00eaff";

  ctx.stroke();

  ctx.shadowBlur = 0;

}


/* =========================================================
   IDLE VISUALIZER
========================================================= */

function drawIdleVisualizer() {

  const canvas =
    $("visualizer");

  if (!canvas)
    return;

  const rect =
    canvas.getBoundingClientRect();

  if (!rect.width)
    return;

  canvas.width =
    Math.floor(rect.width * devicePixelRatio);

  canvas.height =
    Math.floor(rect.height * devicePixelRatio);

  const ctx =
    canvas.getContext("2d");

  ctx.setTransform(
    devicePixelRatio,
    0,
    0,
    devicePixelRatio,
    0,
    0
  );

  const width =
    rect.width;

  const height =
    rect.height;

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const center =
    height / 2;

  ctx.beginPath();

  for (
    let x = 0;
    x < width;
    x += 3
  ) {

    const wave =
      Math.sin(x * .035) * 8 +
      Math.sin(x * .08) * 4;

    const y =
      center + wave;

    if (x === 0)
      ctx.moveTo(x, y);
    else
      ctx.lineTo(x, y);

  }

  ctx.strokeStyle =
    "rgba(0,234,255,.45)";

  ctx.lineWidth = 2;

  ctx.stroke();

}


/* =========================================================
   METERS
========================================================= */

function updateMeters(level) {

  const normalized =
    Math.min(
      100,
      Math.max(
        0,
        level / 1.8
      )
    );

  const aPlaying =
    state.decks.A &&
    !state.decks.A.audio.paused;

  const bPlaying =
    state.decks.B &&
    !state.decks.B.audio.paused;

  $("vuA").style.width =
    aPlaying
      ? normalized + "%"
      : "0%";

  $("vuB").style.width =
    bPlaying
      ? normalized + "%"
      : "0%";

}


/* =========================================================
   CLOCK
========================================================= */

function updateClock() {

  const now =
    new Date();

  $("clock").textContent =
    now.toLocaleTimeString(
      "es-AR",
      {
        hour12: false
      }
    );

}


/* =========================================================
   SCREEN MODE
========================================================= */

function updateScreenMode(file) {

  $("screenMode").textContent =
    isVideo(file)
      ? "VIDEO MP4"
      : "AUDIO VISUALIZER";

}


/* =========================================================
   STATUS
========================================================= */

function setStatus(text) {

  $("systemStatus").textContent =
    text;

}


/* =========================================================
   ENSURE AUDIO
========================================================= */

function ensureAudio() {

  if (!state.started) {

    startEngine();

  }

}


/* =========================================================
   EVENTOS
========================================================= */

function bindButtons() {

  $("startEngine")
    .addEventListener(
      "click",
      startEngine
    );

  $("loadA")
    .addEventListener(
      "click",
      () => $("fileA").click()
    );

  $("loadB")
    .addEventListener(
      "click",
      () => $("fileB").click()
    );

  $("fileA")
    .addEventListener(
      "change",
      e => loadDeck(
        "A",
        e.target.files[0]
      )
    );

  $("fileB")
    .addEventListener(
      "change",
      e => loadDeck(
        "B",
        e.target.files[0]
      )
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

  $("autoMixButton")
    .addEventListener(
      "click",
      toggleAutoMix
    );

  $("stopAll")
    .addEventListener(
      "click",
      stopAll
    );

  $("recordButton")
    .addEventListener(
      "click",
      toggleRecording
    );

  $("micButton")
    .addEventListener(
      "click",
      toggleMic
    );

  $("libraryLoad")
    .addEventListener(
      "click",
      () => $("libraryFiles").click()
    );

  $("libraryFiles")
    .addEventListener(
      "change",
      e => addLibrary(
        e.target.files
      )
    );

  $("smartNext")
    .addEventListener(
      "click",
      () => {

        const other =
          state.activeDeck === "A"
            ? "B"
            : "A";

        smartLoadNext(other);

      }
    );

  $("smartAuto")
    .addEventListener(
      "click",
      toggleSmartAuto
    );

  $("voiceLoad")
    .addEventListener(
      "click",
      () => $("voiceFiles").click()
    );

  $("voiceFiles")
    .addEventListener(
      "change",
      e => loadVoiceFiles(
        e.target.files
      )
    );

  $("voiceButton")
    .addEventListener(
      "click",
      toggleVoice
    );

}


/* =========================================================
   CONTROLES
========================================================= */

function bindControls() {

  $("crossfader")
    .addEventListener(
      "input",
      updateCrossfade
    );

  $("masterVolume")
    .addEventListener(
      "input",
      e => setMaster(
        e.target.value
      )
    );

  ["A", "B"].forEach(letter => {

    $("volume" + letter)
      .addEventListener(
        "input",
        e => setDeckVolume(
          letter,
          e.target.value
        )
      );

    $("pitch" + letter)
      .addEventListener(
        "input",
        e => setPitch(
          letter,
          e.target.value
        )
      );

    ["low", "mid", "high"].forEach(
      band => {

        $(band + letter)
          .addEventListener(
            "input",
            e => setEQ(
              letter,
              band,
              e.target.value
            )
          );

      }
    );

  });


  document
    .querySelectorAll(
      ".effects button"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => toggleEffect(
          button.dataset.deck,
          button.dataset.effect
        )
      );

    });


  $("autoMixInterval")
    .addEventListener(
      "change",
      () => {

        if (state.autoMix) {
          scheduleAutoMix();
        }

      }
    );


  $("crossfadeDuration")
    .addEventListener(
      "change",
      () => {

        const interval =
          Number(
            $("autoMixInterval").value
          );

        const duration =
          Number(
            $("crossfadeDuration").value
          );

        /*
           Evita una duración de crossfade
           mayor que el intervalo programado.
        */

        if (duration >= interval) {

          const options =
            [...$("crossfadeDuration").options];

          const valid =
            options.find(
              option =>
                Number(option.value) <
                interval
            );

          if (valid) {

            $("crossfadeDuration").value =
              valid.value;

          }

        }

      }
    );


  $("voiceVolume")
    .addEventListener(
      "input",
      e => {

        state.voiceVolume =
          Number(e.target.value);

        if (state.voiceGain) {

          state.voiceGain.gain.value =
            state.voiceVolume;

        }

      }
    );


  $("voiceInterval")
    .addEventListener(
      "change",
      () => {

        if (state.voiceEnabled) {

          clearTimeout(
            state.voiceTimer
          );

          scheduleVoice();

        }

      }
    );

}


/* =========================================================
   TECLADO
========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.target.tagName === "INPUT" ||
      event.target.tagName === "SELECT"
    ) return;

    switch (event.code) {

      case "Space":

        event.preventDefault();

        if (
          state.decks[state.activeDeck]
            ?.audio.paused
        ) {

          playDeck(
            state.activeDeck
          );

        } else {

          state.decks[state.activeDeck]
            ?.audio.pause();

        }

        break;


      case "KeyA":

        state.activeDeck = "A";

        break;


      case "KeyB":

        state.activeDeck = "B";

        break;


      case "KeyM":

        toggleAutoMix();

        break;


      case "KeyR":

        toggleRecording();

        break;

    }

  }
);


/* =========================================================
   CORRECCIÓN IMPORTANTE:
   EL VIDEO NO MUESTRA EL NOMBRE DE LA CANCIÓN
========================================================= */

$("videoScreen").addEventListener(
  "loadedmetadata",
  () => {

    /*
       El navegador solamente muestra
       el contenido del video.
       No agregamos ningún título
       ni nombre del archivo.
    */

    $("visualStatus").textContent =
      "VIDEO EN REPRODUCCIÓN";

  }
);
