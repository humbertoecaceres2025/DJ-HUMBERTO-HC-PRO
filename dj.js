/* =====================================================
   HC PRO DJ HUMBERTO
   PROFESSIONAL DJ ENGINE
   ===================================================== */

const video = document.getElementById("videoPlayer");
const audioFile = document.getElementById("audioFile");
const videoFile = document.getElementById("videoFile");

const master = document.getElementById("masterVolume");
const crossfader = document.getElementById("crossfader");

const decks = {
  A: {
    audio: new Audio(),
    element: document.querySelector("#deckA .vinyl"),
    name: document.getElementById("nameA"),
    time: document.getElementById("timeA"),
    gain: document.getElementById("gainA"),
    pitch: document.getElementById("pitchA"),
    low: document.getElementById("lowA"),
    mid: document.getElementById("midA"),
    high: document.getElementById("highA"),
    loaded: false
  },

  B: {
    audio: new Audio(),
    element: document.querySelector("#deckB .vinyl"),
    name: document.getElementById("nameB"),
    time: document.getElementById("timeB"),
    gain: document.getElementById("gainB"),
    pitch: document.getElementById("pitchB"),
    low: document.getElementById("lowB"),
    mid: document.getElementById("midB"),
    high: document.getElementById("highB"),
    loaded: false
  }
};

let selectedDeck = "A";
let autoDJ = false;
let lightsOn = true;
let recording = false;
let mediaRecorder = null;
let recordedChunks = [];

const systemStatus = document.getElementById("systemStatus");
const trackDisplay = document.getElementById("trackDisplay");
const videoState = document.getElementById("videoState");
const strobe = document.getElementById("strobe");

/* =====================================================
   UTILIDADES
   ===================================================== */

function formatTime(seconds) {

  if (!isFinite(seconds)) return "00:00";

  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);

  return (
    String(min).padStart(2, "0") +
    ":" +
    String(sec).padStart(2, "0")
  );
}

function updateStatus(text) {
  systemStatus.textContent = text;
}

/* =====================================================
   SELECCIONAR DECK
   ===================================================== */

function loadDeck(deck) {

  selectedDeck = deck;

  audioFile.value = "";

  audioFile.click();
}

/* =====================================================
   CARGAR AUDIO
   ===================================================== */

audioFile.addEventListener("change", function () {

  const file = this.files[0];

  if (!file) return;

  const deck = decks[selectedDeck];

  deck.audio.pause();

  deck.audio.src = URL.createObjectURL(file);

  deck.audio.load();

  deck.loaded = true;

  deck.name.textContent = file.name;

  trackDisplay.textContent =
    selectedDeck + " • " + file.name;

  updateStatus(
    "DECK " + selectedDeck + " READY"
  );

});

/* =====================================================
   CARGAR VIDEO
   ===================================================== */

videoFile.addEventListener("change", function () {

  const file = this.files[0];

  if (!file) return;

  video.src = URL.createObjectURL(file);

  video.load();

  videoState.textContent = "VIDEO READY";

  updateStatus("VIDEO READY");

});

/* =====================================================
   PLAY
   ===================================================== */

function playDeck(deckName) {

  const deck = decks[deckName];

  if (!deck.loaded) {

    alert(
      "Primero cargá una pista en DECK " +
      deckName
    );

    return;
  }

  deck.audio.playbackRate =
    parseFloat(deck.pitch.value);

  deck.audio.volume =
    calculateDeckVolume(deckName);

  deck.audio.play();

  deck.element.classList.add("playing");

  updateStatus(
    "PLAY • DECK " + deckName
  );

  /*
    Si existe un video cargado y pertenece
    a la sesión visual, también se reproduce.
  */

  if (video.src) {

    video.play().catch(() => {});

    videoState.textContent = "PLAYING";

  }
}

/* =====================================================
   PAUSE
   ===================================================== */

function pauseDeck(deckName) {

  const deck = decks[deckName];

  deck.audio.pause();

  deck.element.classList.remove("playing");

  if (!decks.A.audio.paused ||
      !decks.B.audio.paused) {
    return;
  }

  video.pause();

  videoState.textContent = "PAUSED";
}

/* =====================================================
   STOP
   ===================================================== */

function stopDeck(deckName) {

  const deck = decks[deckName];

  deck.audio.pause();

  deck.audio.currentTime = 0;

  deck.element.classList.remove("playing");

}

/* =====================================================
   VOLUMEN DECK
   ===================================================== */

function calculateDeckVolume(deckName) {

  const deck = decks[deckName];

  const gain =
    parseFloat(deck.gain.value);

  const masterVolume =
    parseFloat(master.value);

  const cf =
    parseFloat(crossfader.value);

  let channel;

  if (deckName === "A") {
    channel = 1 - cf;
  } else {
    channel = cf;
  }

  return gain * masterVolume * channel;
}

function updateVolumes() {

  decks.A.audio.volume =
    calculateDeckVolume("A");

  decks.B.audio.volume =
    calculateDeckVolume("B");

}

master.addEventListener("input", updateVolumes);

crossfader.addEventListener("input", updateVolumes);

decks.A.gain.addEventListener(
  "input",
  updateVolumes
);

decks.B.gain.addEventListener(
  "input",
  updateVolumes
);

/* =====================================================
   PITCH
   ===================================================== */

decks.A.pitch.addEventListener("input", () => {

  decks.A.audio.playbackRate =
    parseFloat(decks.A.pitch.value);

});

decks.B.pitch.addEventListener("input", () => {

  decks.B.audio.playbackRate =
    parseFloat(decks.B.pitch.value);

});

/* =====================================================
   TIEMPO
   ===================================================== */

decks.A.audio.addEventListener(
  "timeupdate",
  () => {
    decks.A.time.textContent =
      formatTime(decks.A.audio.currentTime);
  }
);

decks.B.audio.addEventListener(
  "timeupdate",
  () => {
    decks.B.time.textContent =
      formatTime(decks.B.audio.currentTime);
  }
);

/* =====================================================
   FIN DE PISTA
   ===================================================== */

decks.A.audio.addEventListener(
  "ended",
  () => {

    decks.A.element.classList.remove(
      "playing"
    );

    if (autoDJ) {
      autoNext("A");
    }
  }
);

decks.B.audio.addEventListener(
  "ended",
  () => {

    decks.B.element.classList.remove(
      "playing"
    );

    if (autoDJ) {
      autoNext("B");
    }
  }
);

/* =====================================================
   AUTO DJ
   ===================================================== */

function toggleAutoDJ() {

  autoDJ = !autoDJ;

  const button =
    document.getElementById("autoButton");

  button.classList.toggle(
    "active",
    autoDJ
  );

  updateStatus(
    autoDJ
      ? "AUTO DJ ON"
      : "AUTO DJ OFF"
  );

  if (autoDJ) {

    if (!decks.A.loaded &&
        !decks.B.loaded) {

      alert(
        "Cargá primero una pista para iniciar AUTO DJ."
      );

      autoDJ = false;

      button.classList.remove("active");

      return;
    }

  }
}

function autoNext(deckName) {

  const other =
    deckName === "A" ? "B" : "A";

  if (decks[other].loaded) {

    playDeck(other);

  } else {

    updateStatus(
      "AUTO DJ • CARGAR SIGUIENTE PISTA"
    );

  }
}

/* =====================================================
   EFECTOS
   ===================================================== */

function effect(type) {

  document.body.classList.remove(
    "fx-echo",
    "fx-filter",
    "fx-flanger"
  );

  if (type === "echo") {

    document.body.classList.add(
      "fx-echo"
    );

    updateStatus("FX • ECHO");

  }

  if (type === "filter") {

    document.body.classList.add(
      "fx-filter"
    );

    updateStatus("FX • FILTER");

  }

  if (type === "flanger") {

    document.body.classList.add(
      "fx-flanger"
    );

    updateStatus("FX • FLANGER");

  }

  if (type === "none") {

    updateStatus("FX CLEAR");

  }
}

/* =====================================================
   STROBE
   ===================================================== */

function toggleStrobe() {

  strobe.classList.toggle("strobe-on");

  document
    .getElementById("strobeButton")
    .classList.toggle(
      "active"
    );
}

/* =====================================================
   LUCES
   ===================================================== */

function toggleLights() {

  lightsOn = !lightsOn;

  document.body.classList.toggle(
    "lights-off",
    !lightsOn
  );

  document
    .getElementById("lightsButton")
    .classList.toggle(
      "active",
      lightsOn
    );
}

/* =====================================================
   REC MICRÓFONO
   ===================================================== */

async function startRecording() {

  if (recording) return;

  try {

    const stream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true
        });

    recordedChunks = [];

    mediaRecorder =
      new MediaRecorder(stream);

    mediaRecorder.ondataavailable =
      event => {

        if (event.data.size > 0) {
          recordedChunks.push(
            event.data
          );
        }
      };

    mediaRecorder.onstop =
      saveRecording;

    mediaRecorder.start();

    recording = true;

    document.getElementById(
      "recStatus"
    ).textContent = "● RECORDING";

    updateStatus("RECORDING");

  } catch (error) {

    alert(
      "No se pudo acceder al micrófono."
    );
  }
}

function stopRecording() {

  if (!mediaRecorder ||
      !recording) return;

  mediaRecorder.stop();

  recording = false;

  document.getElementById(
    "recStatus"
  ).textContent = "REC READY";

}

function saveRecording() {

  const blob =
    new Blob(
      recordedChunks,
      { type: "audio/webm" }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    "HC-PRO-DJ-HUMBERTO-REC.webm";

  link.click();

  updateStatus(
    "RECORDING SAVED"
  );
}

/* =====================================================
   VISUALIZADOR
   ===================================================== */

const bars =
  document.querySelectorAll(
    ".visual-bars span"
  );

function animateVisualizer() {

  bars.forEach(bar => {

    const height =
      10 + Math.random() * 85;

    bar.style.height =
      height + "%";

  });

  requestAnimationFrame(
    animateVisualizer
  );
}

animateVisualizer();

/* =====================================================
   TECLADO
   ===================================================== */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.code === "Space" &&
      !["INPUT", "BUTTON"].includes(
        document.activeElement.tagName
      )
    ) {

      event.preventDefault();

      if (!decks.A.audio.paused) {

        pauseDeck("A");

      } else {

        playDeck("A");

      }
    }

  }
);

/* =====================================================
   INICIALIZACIÓN
   ===================================================== */

master.value = ".8";

updateVolumes();

updateStatus("SYSTEM READY");

console.log(
  "HC PRO DJ HUMBERTO • PROFESSIONAL SYSTEM READY"
);
