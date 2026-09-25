"use strict";

/* =========================================================
   DJ HUMBERTO HC PRO
   MIX ENGINE
   CROSSFADE PROFESIONAL A > B / B > A
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

  library: [],

  voiceFiles: [],
  voiceEnabled: false,
  voiceTimer: null,

  decks: {
    A: null,
    B: null
  },

  transitionRunning: false

};

const $ = id => document.getElementById(id);


/* =========================================================
   INIT
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);

function init() {

  bindButtons();
  bindControls();

  updateClock();

  setInterval(
    updateClock,
    1000
  );

  drawIdleVisualizer();

}


/* =========================================================
   START AUDIO ENGINE
========================================================= */

async function startEngine() {

  if (state.started) {

    if (
      state.audioContext.state ===
      "suspended"
    ) {

      await state.audioContext.resume();

    }

    return;

  }

  const AudioContext =
    window.AudioContext ||
    window.webkitAudioContext;

  state.audioContext =
    new AudioContext();

  state.masterGain =
    state.audioContext.createGain();

  state.compressor =
    state.audioContext.createDynamicsCompressor();

  state.analyser =
    state.audioContext.createAnalyser();

  state.recordDestination =
    state.audioContext
      .createMediaStreamDestination();

  state.masterGain.gain.value = .9;

  state.analyser.fftSize = 2048;

  state.compressor.threshold.value = -10;
  state.compressor.knee.value = 12;
  state.compressor.ratio.value = 3;
  state.compressor.attack.value = .003;
  state.compressor.release.value = .2;

  state.masterGain
    .connect(
      state.compressor
    );

  state.compressor
    .connect(
      state.analyser
    );

  state.compressor
    .connect(
      state.recordDestination
    );

  state.analyser
    .connect(
      state.audioContext.destination
    );

  createDeck("A");
  createDeck("B");

  state.started = true;

  const boot =
    $("bootScreen");

  if (boot) {
    boot.classList.add("hidden");
  }

  const led =
    $("systemLed");

  if (led) {
    led.style.background =
      "#00ff9d";
  }

  if (!$("animationStarted")) {

    const marker =
      document.createElement("div");

    marker.id =
      "animationStarted";

    marker.style.display =
      "none";

    document.body.appendChild(marker);

    animate();

  }

}


/* =========================================================
   CREATE DECK
========================================================= */

function createDeck(letter) {

  const audio =
    letter === "A"
      ? $("audioA")
      : $("audioB");

  const source =
    state.audioContext
      .createMediaElementSource(
        audio
      );

  const inputGain =
    state.audioContext
      .createGain();

  const volumeGain =
    state.audioContext
      .createGain();

  const crossGain =
    state.audioContext
      .createGain();

  const low =
    state.audioContext
      .createBiquadFilter();

  const mid =
    state.audioContext
      .createBiquadFilter();

  const high =
    state.audioContext
      .createBiquadFilter();

  /* EQ */

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
     Crossfade inicial:

     A = 1
     B = 0

     Esto significa que al cargar
     A no escuchamos B.
  */

  crossGain.gain.value =
    letter === "A"
      ? 1
      : 0;

  source
    .connect(inputGain);

  inputGain
    .connect(low);

  low
    .connect(mid);

  mid
    .connect(high);

  high
    .connect(volumeGain);

  volumeGain
    .connect(crossGain);

  crossGain
    .connect(
      state.masterGain
    );

  state.decks[letter] = {

    letter,

    audio,

    source,

    inputGain,

    volumeGain,

    crossGain,

    low,
    mid,
    high,

    file: null

  };

  audio.addEventListener(
    "ended",
    () => deckEnded(letter)
  );

}


/* =========================================================
   LOAD
========================================================= */

function loadDeck(
  letter,
  file
) {

  if (!file)
    return;

  startEngine();

  const deck =
    state.decks[letter];

  if (!deck)
    return;

  deck.audio.pause();

  deck.audio.currentTime = 0;

  const url =
    URL.createObjectURL(file);

  deck.audio.src = url;

  deck.audio.load();

  deck.file = file;

  const label =
    letter === "A"
      ? $("trackA")
      : $("trackB");

  if (label) {

    label.textContent =
      file.name;

  }

  const status =
    letter === "A"
      ? $("statusA")
      : $("statusB");

  if (status) {
    status.textContent =
      "READY";
  }

  /*
     IMPORTANTE:
     al cargar una deck NO modificamos
     el crossfader.

     El usuario decide cuándo entra.
  */

  updateMediaScreen(file);

}


/* =========================================================
   PLAY
========================================================= */

async function playDeck(letter) {

  await startEngine();

  const deck =
    state.decks[letter];

  if (
    !deck ||
    !deck.file
  ) {

    alert(
      "Cargá primero un archivo en Deck " +
      letter
    );

    return;

  }

  try {

    await deck.audio.play();

    /*
       Si el archivo es video,
       sincronizamos la pantalla.
    */

    if (
      isVideoFile(deck.file)
    ) {

      const video =
        $("videoScreen");

      if (
        video &&
        video.src
      ) {

        try {
          await video.play();
        } catch (e) {}

      }

    }

    state.activeDeck =
      letter;

    updateDeckVisual(
      letter,
      true
    );

    if (state.autoMix) {
      scheduleAutoMix();
    }

  } catch (error) {

    console.error(error);

  }

}


/* =========================================================
   STOP
========================================================= */

function stopDeck(letter) {

  const deck =
    state.decks[letter];

  if (!deck)
    return;

  deck.audio.pause();

  deck.audio.currentTime = 0;

  updateDeckVisual(
    letter,
    false
  );

}


/* =========================================================
   DECK END
========================================================= */

function deckEnded(letter) {

  updateDeckVisual(
    letter,
    false
  );

  if (
    state.autoMix &&
    !state.transitionRunning
  ) {

    const next =
      letter === "A"
        ? "B"
        : "A";

    if (
      state.decks[next].file
    ) {

      crossfadeTo(
        letter,
        next
      );

    } else {

      smartLoadNext(next);

      setTimeout(
        () => {

          if (
            state.decks[next].file
          ) {

            crossfadeTo(
              letter,
              next
            );

          }

        },
        100
      );

    }

  }

}


/* =========================================================
   CROSS FADER MANUAL
========================================================= */

function updateCrossfader() {

  if (!state.started)
    return;

  const x =
    Number(
      $("crossfader").value
    );

  /*
     CURVA EQUAL POWER

     A:
     cos(x*pi/2)

     B:
     sin(x*pi/2)

     En el centro:
     A ≈ .707
     B ≈ .707

     No hay caída de volumen.
  */

  const gainA =
    Math.cos(
      x * Math.PI / 2
    );

  const gainB =
    Math.sin(
      x * Math.PI / 2
    );

  setCrossGain(
    "A",
    gainA,
    .015
  );

  setCrossGain(
    "B",
    gainB,
    .015
  );

  updateCrossLabel(x);

}


/* =========================================================
   CROSS GAIN
========================================================= */

function setCrossGain(
  letter,
  value,
  timeConstant = .01
) {

  const deck =
    state.decks[letter];

  if (!deck)
    return;

  const now =
    state.audioContext.currentTime;

  const gain =
    deck.crossGain.gain;

  gain.cancelScheduledValues(now);

  gain.setTargetAtTime(
    Math.max(.0001, value),
    now,
    timeConstant
  );

}


/* =========================================================
   LABEL CROSS
========================================================= */

function updateCrossLabel(x) {

  let text =
    "CENTER";

  if (x <= .03) {

    text =
      "A FULL";

  } else if (x < .45) {

    text =
      "A →";

  } else if (x > .97) {

    text =
      "B FULL";

  } else if (x > .55) {

    text =
      "→ B";

  }

  if ($("crossValue")) {

    $("crossValue")
      .textContent =
      text;

  }

}


/* =========================================================
   TRANSICIÓN A > B / B > A
========================================================= */

async function crossfadeTo(
  fromLetter,
  toLetter
) {

  if (state.transitionRunning)
    return;

  const from =
    state.decks[fromLetter];

  const to =
    state.decks[toLetter];

  if (
    !from ||
    !to ||
    !to.file
  ) {

    return;

  }

  state.transitionRunning =
    true;

  await startEngine();

  const duration =
    Math.max(
      .5,
      Number(
        $("crossfadeDuration")
          ?.value || 4
      )
    );

  /*
     ==================================================
     PASO 1

     El deck que entra comienza a reproducirse
     ANTES de mover el crossfade.

     Esto es lo que evita el corte.
     ==================================================
  */

  try {

    if (to.audio.paused) {

      await to.audio.play();

    }

  } catch (error) {

    console.error(
      "No se pudo iniciar el deck entrante",
      error
    );

    state.transitionRunning =
      false;

    return;

  }

  /*
     ==================================================
     PASO 2

     Tomamos el tiempo exacto del AudioContext.
     ==================================================
  */

  const now =
    state.audioContext.currentTime;

  const end =
    now + duration;

  const fromGain =
    from.crossGain.gain;

  const toGain =
    to.crossGain.gain;

  fromGain.cancelScheduledValues(now);
  toGain.cancelScheduledValues(now);

  /*
     ==================================================
     PASO 3

     Comenzamos exactamente desde los valores actuales.
     ==================================================
  */

  const currentFrom =
    fromGain.value;

  const currentTo =
    toGain.value;

  fromGain.setValueAtTime(
    Math.max(.0001, currentFrom),
    now
  );

  toGain.setValueAtTime(
    Math.max(.0001, currentTo),
    now
  );

  /*
     ==================================================
     PASO 4

     CROSSFADE EQUAL POWER

     A/B no se corta.
     ==================================================
  */

  fromGain.linearRampToValueAtTime(
    .0001,
    end
  );

  toGain.linearRampToValueAtTime(
    1,
    end
  );

  /*
     ==================================================
     PASO 5

     Cuando termina el fade,
     NO reiniciamos el deck entrante.

     Continúa exactamente desde la posición
     donde estaba reproduciendo.
     ==================================================
  */

  setTimeout(
    () => {

      const finalTime =
        state.audioContext.currentTime;

      fromGain.cancelScheduledValues(
        finalTime
      );

      fromGain.setValueAtTime(
        .0001,
        finalTime
      );

      toGain.cancelScheduledValues(
        finalTime
      );

      toGain.setValueAtTime(
        1,
        finalTime
      );

      /*
         Ahora sí detenemos únicamente
         el deck que salió.
      */

      from.audio.pause();

      from.audio.currentTime = 0;

      updateDeckVisual(
        fromLetter,
        false
      );

      updateDeckVisual(
        toLetter,
        true
      );

      state.activeDeck =
        toLetter;

      /*
         Actualizamos físicamente el
         crossfader para que coincida
         con la deck activa.
      */

      const slider =
        $("crossfader");

      if (slider) {

        slider.value =
          toLetter === "A"
            ? 0
            : 1;

      }

      updateCrossLabel(
        toLetter === "A"
          ? 0
          : 1
      );

      state.transitionRunning =
        false;

      /*
         Preparamos la próxima transición.
      */

      if (state.autoMix) {

        scheduleAutoMix();

      }

    },
    duration * 1000 + 100
  );

}


/* =========================================================
   AUTO MIX
========================================================= */

function toggleAutoMix() {

  state.autoMix =
    !state.autoMix;

  const button =
    $("autoMixButton");

  if (
    state.autoMix
  ) {

    button.textContent =
      "AUTO MIX: ON";

    button.classList.add(
      "active"
    );

    scheduleAutoMix();

  } else {

    button.textContent =
      "AUTO MIX: OFF";

    button.classList.remove(
      "active"
    );

    clearAutoMix();

  }

}


function scheduleAutoMix() {

  clearAutoMix();

  if (!state.autoMix)
    return;

  const active =
    state.decks[
      state.activeDeck
    ];

  if (
    !active ||
    active.audio.paused
  ) {

    return;

  }

  state.autoMixSeconds =
    Number(
      $("autoMixInterval")
        ?.value || 10
    );

  if ($("autoCountdown")) {

    $("autoCountdown")
      .textContent =
      state.autoMixSeconds + "s";

  }

  state.autoMixCountdownTimer =
    setInterval(
      () => {

        state.autoMixSeconds--;

        if ($("autoCountdown")) {

          $("autoCountdown")
            .textContent =
            Math.max(
              0,
              state.autoMixSeconds
            ) + "s";

        }

      },
      1000
    );

  state.autoMixTimer =
    setTimeout(
      async () => {

        const from =
          state.activeDeck;

        const to =
          from === "A"
            ? "B"
            : "A";

        /*
           Si no hay canción en la deck
           entrante, elegimos automáticamente.
        */

        if (
          !state.decks[to].file
        ) {

          smartLoadNext(to);

        }

        if (
          state.decks[to].file
        ) {

          await crossfadeTo(
            from,
            to
          );

        }

      },
      state.autoMixSeconds * 1000
    );

}


/* =========================================================
   CLEAR AUTO MIX
========================================================= */

function clearAutoMix() {

  clearTimeout(
    state.autoMixTimer
  );

  clearInterval(
    state.autoMixCountdownTimer
  );

  state.autoMixTimer =
    null;

  state.autoMixCountdownTimer =
    null;

  if ($("autoCountdown")) {

    $("autoCountdown")
      .textContent =
      "--";

  }

}


/* =========================================================
   SMART NEXT
========================================================= */

function smartLoadNext(letter) {

  if (!state.library.length)
    return;

  const current =
    state.decks[
      state.activeDeck
    ]?.file;

  const candidates =
    state.library.filter(
      item =>
        item.file !== current
    );

  if (!candidates.length)
    return;

  const item =
    candidates[
      Math.floor(
        Math.random() *
        candidates.length
      )
    ];

  loadDeck(
    letter,
    item.file
  );

}


/* =========================================================
   VIDEO / MP3
========================================================= */

function isVideoFile(file) {

  if (!file)
    return false;

  return (
    file.type.startsWith(
      "video/"
    ) ||
    /\.(mp4|webm|ogg)$/i
      .test(file.name)
  );

}


function updateMediaScreen(file) {

  const screen =
    $("mediaScreen");

  const video =
    $("videoScreen");

  if (
    !screen ||
    !video
  ) return;

  if (
    isVideoFile(file)
  ) {

    const url =
      URL.createObjectURL(file);

    video.pause();

    video.src =
      url;

    video.load();

    video.classList.add(
      "active"
    );

    screen.classList.add(
      "video-mode"
    );

    if ($("screenMode")) {

      $("screenMode")
        .textContent =
        "VIDEO MP4";

    }

  } else {

    video.pause();

    video.removeAttribute(
      "src"
    );

    video.load();

    video.classList.remove(
      "active"
    );

    screen.classList.remove(
      "video-mode"
    );

    if ($("screenMode")) {

      $("screenMode")
        .textContent =
        "AUDIO VISUALIZER";

    }

  }

}


/* =========================================================
   DECK VISUAL
========================================================= */

function updateDeckVisual(
  letter,
  playing
) {

  const record =
    letter === "A"
      ? $("recordA")
      : $("recordB");

  const status =
    letter === "A"
      ? $("statusA")
      : $("statusB");

  if (record) {

    record.classList.toggle(
      "playing",
      playing
    );

  }

  if (status) {

    status.textContent =
      playing
        ? "PLAY"
        : "STOP";

  }

}


/* =========================================================
   MASTER
========================================================= */

function setMaster(
  value
) {

  if (!state.masterGain)
    return;

  state.masterGain.gain.value =
    Number(value);

  if ($("masterValue")) {

    $("masterValue")
      .textContent =
      Math.round(
        Number(value) * 100
      ) + "%";

  }

}


/* =========================================================
   VOLUMEN DECK
========================================================= */

function setDeckVolume(
  letter,
  value
) {

  const deck =
    state.decks[letter];

  if (!deck)
    return;

  /*
     IMPORTANTE:
     cambiamos solamente el volumen
     del canal.

     NO tocamos el crossfader.
  */

  deck.volumeGain.gain.value =
    Number(value);

}


/* =========================================================
   EQ
========================================================= */

function setEQ(
  letter,
  band,
  value
) {

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
   PITCH
========================================================= */

function setPitch(
  letter,
  value
) {

  const deck =
    state.decks[letter];

  if (!deck)
    return;

  deck.audio.playbackRate =
    Number(value);

  const label =
    letter === "A"
      ? $("pitchValueA")
      : $("pitchValueB");

  if (label) {

    label.textContent =
      Number(value)
        .toFixed(2) +
      "x";

  }

}


/* =========================================================
   LIBRARY
========================================================= */

function addLibrary(
  files
) {

  [...files].forEach(
    file => {

      const exists =
        state.library.some(
          item =>
            item.file.name ===
              file.name &&
            item.file.size ===
              file.size
        );

      if (!exists) {

        state.library.push({
          file
        });

      }

    }
  );

  renderLibrary();

}


function renderLibrary() {

  const list =
    $("libraryList");

  if (!list)
    return;

  list.innerHTML = "";

  if (!state.library.length) {

    list.innerHTML =
      `<div class="empty-library">
        No hay archivos cargados.
      </div>`;

    return;

  }

  state.library.forEach(
    item => {

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "library-item";

      const name =
        document.createElement(
          "div"
        );

      name.className =
        "library-name";

      name.textContent =
        item.file.name;

      const a =
        document.createElement(
          "button"
        );

      a.textContent =
        "A";

      a.onclick =
        () =>
          loadDeck(
            "A",
            item.file
          );

      const b =
        document.createElement(
          "button"
        );

      b.textContent =
        "B";

      b.onclick =
        () =>
          loadDeck(
            "B",
            item.file
          );

      row.append(
        name,
        a,
        b
      );

      list.appendChild(
        row
      );

    }
  );

}


/* =========================================================
   STOP ALL
========================================================= */

function stopAll() {

  stopDeck("A");
  stopDeck("B");

  clearAutoMix();

  state.autoMix =
    false;

  state.transitionRunning =
    false;

  if ($("autoMixButton")) {

    $("autoMixButton")
      .textContent =
      "AUTO MIX: OFF";

    $("autoMixButton")
      .classList.remove(
        "active"
      );

  }

}


/* =========================================================
   CLOCK
========================================================= */

function updateClock() {

  const clock =
    $("clock");

  if (!clock)
    return;

  clock.textContent =
    new Date()
      .toLocaleTimeString(
        "es-AR",
        {
          hour12: false
        }
      );

}


/* =========================================================
   VISUALIZER
========================================================= */

function animate() {

  requestAnimationFrame(
    animate
  );

  if (
    !state.analyser
  ) {

    drawIdleVisualizer();

    return;

  }

  const canvas =
    $("visualizer");

  if (!canvas)
    return;

  const rect =
    canvas.getBoundingClientRect();

  if (
    !rect.width ||
    !rect.height
  ) return;

  const dpr =
    window.devicePixelRatio ||
    1;

  if (
    canvas.width !==
    rect.width * dpr
  ) {

    canvas.width =
      rect.width * dpr;

    canvas.height =
      rect.height * dpr;

  }

  const ctx =
    canvas.getContext(
      "2d"
    );

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  const width =
    rect.width;

  const height =
    rect.height;

  const data =
    new Uint8Array(
      state.analyser
        .frequencyBinCount
    );

  state.analyser
    .getByteFrequencyData(
      data
    );

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  const bars = 100;

  const step =
    Math.max(
      1,
      Math.floor(
        data.length / bars
      )
    );

  const barWidth =
    width / bars;

  for (
    let i = 0;
    i < bars;
    i++
  ) {

    const value =
      data[i * step] ||
      0;

    const h =
      value / 255 *
      height *
      .75;

    const x =
      i * barWidth;

    const y =
      height / 2 -
      h / 2;

    const hue =
      180 +
      i / bars *
      160;

    ctx.fillStyle =
      `hsla(
        ${hue},
        100%,
        60%,
        .8
      )`;

    ctx.shadowBlur =
      15;

    ctx.shadowColor =
      `hsla(
        ${hue},
        100%,
        60%,
        .7
      )`;

    ctx.fillRect(
      x + 1,
      y,
      Math.max(
        1,
        barWidth - 2
      ),
      h
    );

  }

  ctx.shadowBlur =
    0;

}


/* =========================================================
   IDLE
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
    rect.width *
    (window.devicePixelRatio || 1);

  canvas.height =
    rect.height *
    (window.devicePixelRatio || 1);

  const ctx =
    canvas.getContext(
      "2d"
    );

  const dpr =
    window.devicePixelRatio ||
    1;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  const center =
    rect.height / 2;

  ctx.beginPath();

  for (
    let x = 0;
    x < rect.width;
    x += 3
  ) {

    const y =
      center +
      Math.sin(
        x * .035
      ) * 8 +
      Math.sin(
        x * .08
      ) * 4;

    if (x === 0)
      ctx.moveTo(x, y);
    else
      ctx.lineTo(x, y);

  }

  ctx.strokeStyle =
    "rgba(0,234,255,.5)";

  ctx.lineWidth =
    2;

  ctx.stroke();

}


/* =========================================================
   BUTTONS
========================================================= */

function bindButtons() {

  $("startEngine")
    ?.addEventListener(
      "click",
      startEngine
    );

  $("loadA")
    ?.addEventListener(
      "click",
      () =>
        $("fileA").click()
    );

  $("loadB")
    ?.addEventListener(
      "click",
      () =>
        $("fileB").click()
    );

  $("fileA")
    ?.addEventListener(
      "change",
      e =>
        loadDeck(
          "A",
          e.target.files[0]
        )
    );

  $("fileB")
    ?.addEventListener(
      "change",
      e =>
        loadDeck(
          "B",
          e.target.files[0]
        )
    );

  $("playA")
    ?.addEventListener(
      "click",
      () =>
        playDeck("A")
    );

  $("playB")
    ?.addEventListener(
      "click",
      () =>
        playDeck("B")
    );

  $("stopA")
    ?.addEventListener(
      "click",
      () =>
        stopDeck("A")
    );

  $("stopB")
    ?.addEventListener(
      "click",
      () =>
        stopDeck("B")
    );

  $("autoMixButton")
    ?.addEventListener(
      "click",
      toggleAutoMix
    );

  $("stopAll")
    ?.addEventListener(
      "click",
      stopAll
    );

  $("libraryLoad")
    ?.addEventListener(
      "click",
      () =>
        $("libraryFiles").click()
    );

  $("libraryFiles")
    ?.addEventListener(
      "change",
      e =>
        addLibrary(
          e.target.files
        )
    );

}


/* =========================================================
   CONTROLES
========================================================= */

function bindControls() {

  $("crossfader")
    ?.addEventListener(
      "input",
      updateCrossfader
    );

  $("masterVolume")
    ?.addEventListener(
      "input",
      e =>
        setMaster(
          e.target.value
        )
    );

  ["A", "B"].forEach(
    letter => {

      $(
        "volume" + letter
      )?.addEventListener(
        "input",
        e =>
          setDeckVolume(
            letter,
            e.target.value
          )
      );

      $(
        "pitch" + letter
      )?.addEventListener(
        "input",
        e =>
          setPitch(
            letter,
            e.target.value
          )
      );

      [
        "low",
        "mid",
        "high"
      ].forEach(
        band => {

          $(
            band + letter
          )?.addEventListener(
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


  $("autoMixInterval")
    ?.addEventListener(
      "change",
      () => {

        if (state.autoMix) {

          scheduleAutoMix();

        }

      }
    );


  $("crossfadeDuration")
    ?.addEventListener(
      "change",
      () => {

        if (state.autoMix) {

          scheduleAutoMix();

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
      event.target.tagName ===
      "INPUT" ||
      event.target.tagName ===
      "SELECT"
    ) return;

    if (
      event.code ===
      "Space"
    ) {

      event.preventDefault();

      const deck =
        state.decks[
          state.activeDeck
        ];

      if (!deck)
        return;

      if (
        deck.audio.paused
      ) {

        playDeck(
          state.activeDeck
        );

      } else {

        deck.audio.pause();

      }

    }

  }
);
