/* =========================================================
   HC PRO DJ HUMBERTO
   SMART DJ ENGINE
   A ↔ B AUTOMATIC MIXING
========================================================= */

"use strict";


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

const oppositeDeck = deck =>
  deck === "A" ? "B" : "A";


/* =========================================================
   STATE
========================================================= */

const state = {

  ctx: null,

  masterGain: null,
  musicBus: null,
  compressor: null,
  analyser: null,

  decks: {
    A: null,
    B: null
  },

  activeDeck: "A",

  crossPosition: 0,

  autoDJ: false,

  smartDJ: true,

  transitionRunning: false,

  transitionToken: 0,

  library: [],

  history: [],

  animationFrame: null,

  autoTimer: null,

  started: false

};


/* =========================================================
   INIT
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  initDeckObjects();

  bindEvents();

  renderLibrary();

  updateCrossfader(0);

  updateActiveDeckUI();

});


/* =========================================================
   DECK OBJECTS
========================================================= */

function initDeckObjects() {

  ["A", "B"].forEach(letter => {

    const audio = $("audio" + letter);

    state.decks[letter] = {

      letter,

      audio,

      source: null,

      inputGain: null,

      low: null,

      mid: null,

      high: null,

      volumeGain: null,

      crossGain: null,

      file: null,

      url: null,

      meta: null,

      ready: false,

      playing: false,

      preparedFor: null,

      video: false

    };

  });

}


/* =========================================================
   AUDIO ENGINE
========================================================= */

async function initAudioEngine() {

  if (state.ctx) {

    if (state.ctx.state === "suspended") {
      await state.ctx.resume();
    }

    return;
  }


  const AudioContext =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContext) {

    alert(
      "Este navegador no soporta Web Audio API."
    );

    return;
  }


  state.ctx = new AudioContext();


  state.musicBus =
    state.ctx.createGain();

  state.musicBus.gain.value = 1;


  state.masterGain =
    state.ctx.createGain();

  state.masterGain.gain.value = .9;


  state.compressor =
    state.ctx.createDynamicsCompressor();

  state.compressor.threshold.value = -18;
  state.compressor.knee.value = 18;
  state.compressor.ratio.value = 4;
  state.compressor.attack.value = .003;
  state.compressor.release.value = .25;


  state.analyser =
    state.ctx.createAnalyser();

  state.analyser.fftSize = 2048;


  state.musicBus
    .connect(state.masterGain);

  state.masterGain
    .connect(state.compressor);

  state.compressor
    .connect(state.analyser);

  state.analyser
    .connect(state.ctx.destination);


  ["A", "B"].forEach(letter => {

    setupDeckAudio(
      state.decks[letter]
    );

  });


  if (state.ctx.state === "suspended") {
    await state.ctx.resume();
  }


  state.started = true;

  $("engineStatus").textContent =
    "● SISTEMA ONLINE";

  $("engineStatus").className =
    "status-pill online";


  startVisualizer();

}


/* =========================================================
   SETUP DECK
========================================================= */

function setupDeckAudio(deck) {

  if (deck.source) return;


  const ctx = state.ctx;


  deck.source =
    ctx.createMediaElementSource(
      deck.audio
    );


  deck.inputGain =
    ctx.createGain();

  deck.volumeGain =
    ctx.createGain();

  deck.crossGain =
    ctx.createGain();


  deck.low =
    ctx.createBiquadFilter();

  deck.low.type = "lowshelf";
  deck.low.frequency.value = 180;


  deck.mid =
    ctx.createBiquadFilter();

  deck.mid.type = "peaking";
  deck.mid.frequency.value = 1000;
  deck.mid.Q.value = .8;


  deck.high =
    ctx.createBiquadFilter();

  deck.high.type = "highshelf";
  deck.high.frequency.value = 5000;


  deck.volumeGain.gain.value = 1;


  deck.source
    .connect(deck.inputGain);

  deck.inputGain
    .connect(deck.low);

  deck.low
    .connect(deck.mid);

  deck.mid
    .connect(deck.high);

  deck.high
    .connect(deck.volumeGain);

  deck.volumeGain
    .connect(deck.crossGain);

  deck.crossGain
    .connect(state.musicBus);


  deck.audio.addEventListener(
    "play",
    () => {

      deck.playing = true;

      updateDeckUI(deck.letter);

      updateActiveDeckUI();

    }
  );


  deck.audio.addEventListener(
    "pause",
    () => {

      deck.playing = false;

      updateDeckUI(deck.letter);

    }
  );


  deck.audio.addEventListener(
    "ended",
    () => {

      deck.playing = false;

      updateDeckUI(deck.letter);

      if (
        state.autoDJ &&
        state.activeDeck === deck.letter
      ) {

        transitionTo(
          oppositeDeck(deck.letter)
        );

      }

    }
  );

}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {


  $("startEngine").addEventListener(
    "click",
    async () => {

      await initAudioEngine();

      $("bootOverlay")
        .classList.add("hidden");

      $("mediaStatus").textContent =
        "SMART DJ LISTO";

    }
  );


  $("fullscreenButton")
    .addEventListener(
      "click",
      toggleFullscreen
    );


  $("crossfader")
    .addEventListener(
      "input",
      event => {

        const value =
          Number(event.target.value);

        state.crossPosition = value;

        updateCrossfader(value);

      }
    );


  $("smartNextButton")
    .addEventListener(
      "click",
      async () => {

        await ensureAudio();

        await smartNext(true);

      }
    );


  $("autoDJButton")
    .addEventListener(
      "click",
      async () => {

        await ensureAudio();

        toggleAutoDJ();

      }
    );


  ["A", "B"].forEach(letter => {

    $("play" + letter)
      .addEventListener(
        "click",
        async () => {

          await ensureAudio();

          await playDeck(letter);

        }
      );


    $("stop" + letter)
      .addEventListener(
        "click",
        () => {

          stopDeck(letter);

        }
      );


    $("volume" + letter)
      .addEventListener(
        "input",
        event => {

          const deck =
            state.decks[letter];

          if (deck.volumeGain) {

            deck.volumeGain.gain.value =
              Number(event.target.value);

          }

        }
      );


    $("pitch" + letter)
      .addEventListener(
        "input",
        event => {

          state.decks[letter]
            .audio.playbackRate =
              Number(event.target.value);

        }
      );


    $("low" + letter)
      .addEventListener(
        "input",
        event => {

          const deck =
            state.decks[letter];

          if (deck.low) {

            deck.low.gain.value =
              Number(event.target.value);

          }

        }
      );


    $("mid" + letter)
      .addEventListener(
        "input",
        event => {

          const deck =
            state.decks[letter];

          if (deck.mid) {

            deck.mid.gain.value =
              Number(event.target.value);

          }

        }
      );


    $("high" + letter)
      .addEventListener(
        "input",
        event => {

          const deck =
            state.decks[letter];

          if (deck.high) {

            deck.high.gain.value =
              Number(event.target.value);

          }

        }
      );

  });


  $("libraryFiles")
    .addEventListener(
      "change",
      event => {

        addFiles(
          Array.from(
            event.target.files
          )
        );

      }
    );


  $("libraryFolder")
    .addEventListener(
      "change",
      event => {

        addFiles(
          Array.from(
            event.target.files
          )
        );

      }
    );


  $("analyzeLibraryButton")
    .addEventListener(
      "click",
      analyzeLibrary
    );


  $("searchLibrary")
    .addEventListener(
      "input",
      renderLibrary
    );


  $("genreFilter")
    .addEventListener(
      "change",
      renderLibrary
    );

}


/* =========================================================
   AUDIO START
========================================================= */

async function ensureAudio() {

  if (!state.ctx) {

    await initAudioEngine();

  }

  if (
    state.ctx.state === "suspended"
  ) {

    await state.ctx.resume();

  }

}


/* =========================================================
   CROSS FADER
========================================================= */

function updateCrossfader(position) {

  position =
    clamp(position, 0, 1);


  state.crossPosition =
    position;


  if (!state.ctx) return;


  const a =
    Math.cos(
      position * Math.PI / 2
    );


  const b =
    Math.sin(
      position * Math.PI / 2
    );


  const deckA =
    state.decks.A;

  const deckB =
    state.decks.B;


  if (deckA.crossGain) {

    deckA.crossGain.gain.value =
      a;

  }


  if (deckB.crossGain) {

    deckB.crossGain.gain.value =
      b;

  }


  $("crossfader").value =
    position;


  $("nextDeck").textContent =
    position < .5 ? "B" : "A";

}


/* =========================================================
   PLAY DECK
========================================================= */

async function playDeck(letter) {

  await ensureAudio();


  const deck =
    state.decks[letter];


  if (!deck.file) {

    const track =
      findSmartNext();

    if (!track) {

      alert(
        "Primero cargá música en la biblioteca."
      );

      return;

    }

    await loadTrackSmart(
      track,
      letter
    );

  }


  if (
    letter !== state.activeDeck
  ) {

    const target =
      letter === "A" ? 0 : 1;

    updateCrossfader(target);

    state.activeDeck =
      letter;

  }


  try {

    await deck.audio.play();

  } catch (error) {

    console.error(error);

    $("mediaStatus").textContent =
      "Presioná PLAY nuevamente";

  }


  updateActiveDeckUI();

}


/* =========================================================
   STOP
========================================================= */

function stopDeck(letter) {

  const deck =
    state.decks[letter];


  deck.audio.pause();

  deck.audio.currentTime = 0;

  deck.playing = false;


  updateDeckUI(letter);

}


/* =========================================================
   FILES
========================================================= */

function addFiles(files) {

  const valid =
    files.filter(
      file =>
        file.type.startsWith("audio/") ||
        file.type.startsWith("video/")
    );


  valid.forEach(file => {

    if (
      state.library.some(
        item =>
          item.file.name === file.name &&
          item.file.size === file.size
      )
    ) {

      return;

    }


    state.library.push({

      id:
        crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now() + Math.random(),

      file,

      meta: {

        title:
          cleanTitle(file.name),

        bpm: null,

        key: null,

        camelot: null,

        energy: null,

        confidence: 0,

        beatInterval: null,

        firstBeat: 0,

        genre:
          detectGenre(file.name),

        phraseLength: 32

      }

    });

  });


  renderLibrary();

}


/* =========================================================
   CLEAN TITLE
========================================================= */

function cleanTitle(name) {

  return name
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

}


/* =========================================================
   GENRE
========================================================= */

function detectGenre(name) {

  const n =
    name.toLowerCase();


  if (/cumbia/.test(n))
    return "cumbia";

  if (/cuarteto/.test(n))
    return "cuarteto";

  if (/reggaeton|reguet[oó]n/.test(n))
    return "reggaeton";

  if (/rock/.test(n))
    return "rock";

  if (/pop/.test(n))
    return "pop";

  if (/electro|house|techno|edm/.test(n))
    return "electronic";

  if (/latin|latino/.test(n))
    return "latin";

  return "other";

}


/* =========================================================
   LIBRARY RENDER
========================================================= */

function renderLibrary() {

  const container =
    $("libraryList");


  const search =
    (
      $("searchLibrary")?.value ||
      ""
    ).toLowerCase();


  const genre =
    $("genreFilter")?.value ||
    "all";


  const items =
    state.library.filter(item => {

      const title =
        item.meta.title.toLowerCase();


      const matchSearch =
        title.includes(search);


      const matchGenre =
        genre === "all" ||
        item.meta.genre === genre;


      return matchSearch &&
        matchGenre;

    });


  if (!items.length) {

    container.innerHTML = `
      <div class="empty-library">
        Cargá música para comenzar.
      </div>
    `;

    return;

  }


  container.innerHTML =
    items.map(
      (item, index) => {

        const m =
          item.meta;


        return `
          <div class="library-item">

            <div class="library-number">
              ${index + 1}
            </div>

            <div>

              <div class="library-title">
                ${escapeHTML(m.title)}
              </div>

              <div class="library-meta">

                ${m.bpm ? m.bpm + " BPM" : "-- BPM"}
                ·
                ${m.camelot || "--"}
                ·
                ${m.genre}

              </div>

            </div>

            <button
              class="library-load"
              data-id="${item.id}">
              CARGAR
            </button>

          </div>
        `;

      }
    )
    .join("");


  container
    .querySelectorAll(".library-load")
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          await ensureAudio();

          const item =
            state.library.find(
              x =>
                String(x.id) ===
                String(button.dataset.id)
            );


          if (!item) return;


          const target =
            state.activeDeck;


          await loadTrackSmart(
            item,
            target
          );

        }
      );

    });

}


/* =========================================================
   ESCAPE
========================================================= */

function escapeHTML(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


/* =========================================================
   ANALYZE LIBRARY
========================================================= */

async function analyzeLibrary() {

  await ensureAudio();


  if (!state.library.length) {

    alert("No hay música cargada.");

    return;

  }


  $("smartReason").textContent =
    "Analizando...";


  for (
    let i = 0;
    i < state.library.length;
    i++
  ) {

    const item =
      state.library[i];


    if (
      item.meta.bpm &&
      item.meta.key
    ) {

      continue;

    }


    $("smartReason").textContent =
      `Analizando ${i + 1}/${state.library.length}`;


    try {

      await analyzeTrack(item);

    } catch (error) {

      console.error(
        "Error analizando:",
        error
      );

    }


    renderLibrary();

    await new Promise(
      resolve =>
        setTimeout(resolve, 20)
    );

  }


  $("smartReason").textContent =
    "Biblioteca analizada";

}


/* =========================================================
   ANALYZE TRACK
========================================================= */

async function analyzeTrack(item) {

  const file =
    item.file;


  if (
    file.type.startsWith("video/")
  ) {

    item.meta.bpm = 120;

    item.meta.key = "C";

    item.meta.camelot = "8B";

    item.meta.energy = .6;

    item.meta.confidence = .15;

    item.meta.beatInterval =
      60 / 120;

    return;

  }


  const buffer =
    await file.arrayBuffer();


  const audioBuffer =
    await state.ctx.decodeAudioData(
      buffer.slice(0)
    );


  const channel =
    audioBuffer.getChannelData(0);


  const sampleRate =
    audioBuffer.sampleRate;


  const analysis =
    createAnalysisBuffer(
      channel,
      sampleRate
    );


  const bpmData =
    detectBPM(
      analysis.data,
      analysis.sampleRate
    );


  item.meta.bpm =
    bpmData.bpm;


  item.meta.confidence =
    bpmData.confidence;


  item.meta.beatInterval =
    60 / bpmData.bpm;


  item.meta.firstBeat =
    bpmData.firstBeat;


  item.meta.energy =
    calculateEnergy(
      analysis.data
    );


  const keyData =
    estimateKey(
      analysis.data,
      analysis.sampleRate
    );


  item.meta.key =
    keyData.key;


  item.meta.camelot =
    keyData.camelot;


  item.meta.phraseLength =
    detectPhraseLength(
      analysis.data,
      analysis.sampleRate,
      bpmData.bpm
    );


  return item.meta;

}


/* =========================================================
   ANALYSIS BUFFER
========================================================= */

function createAnalysisBuffer(
  channel,
  sampleRate
) {

  const targetRate = 11025;

  const step =
    Math.max(
      1,
      Math.floor(
        sampleRate / targetRate
      )
    );


  const length =
    Math.floor(
      channel.length / step
    );


  const data =
    new Float32Array(length);


  for (
    let i = 0;
    i < length;
    i++
  ) {

    data[i] =
      channel[i * step];

  }


  return {

    data,

    sampleRate:
      sampleRate / step

  };

}


/* =========================================================
   BPM
========================================================= */

function detectBPM(
  data,
  sampleRate
) {

  const maxSeconds =
    Math.min(
      data.length / sampleRate,
      90
    );


  const usableLength =
    Math.floor(
      maxSeconds * sampleRate
    );


  const envelopeRate =
    100;


  const hop =
    Math.max(
      1,
      Math.floor(
        sampleRate / envelopeRate
      )
    );


  const envelope = [];


  for (
    let i = 0;
    i < usableLength;
    i += hop
  ) {

    let sum = 0;

    const end =
      Math.min(
        i + hop,
        usableLength
      );


    for (
      let j = i;
      j < end;
      j++
    ) {

      sum +=
        Math.abs(data[j]);

    }


    envelope.push(
      sum / Math.max(1, end - i)
    );

  }


  const smooth =
    smoothArray(envelope, 3);


  const onset =
    new Float32Array(
      smooth.length
    );


  for (
    let i = 1;
    i < smooth.length;
    i++
  ) {

    onset[i] =
      Math.max(
        0,
        smooth[i] - smooth[i - 1]
      );

  }


  const minBPM = 70;
  const maxBPM = 180;


  let bestBPM = 120;
  let bestScore = -Infinity;


  for (
    let bpm = minBPM;
    bpm <= maxBPM;
    bpm += .5
  ) {

    const period =
      envelopeRate *
      60 /
      bpm;


    let score = 0;


    for (
      let i = 0;
      i < onset.length;
      i += period
    ) {

      const idx =
        Math.round(i);


      if (
        idx >= 0 &&
        idx < onset.length
      ) {

        score +=
          onset[idx];

      }

    }


    if (
      score > bestScore
    ) {

      bestScore = score;

      bestBPM = bpm;

    }

  }


  const half =
    bestBPM / 2;


  const double =
    bestBPM * 2;


  if (
    half >= 70 &&
    half <= 180
  ) {

    if (
      autocorrelationBPM(
        onset,
        envelopeRate,
        half
      ) >
      autocorrelationBPM(
        onset,
        envelopeRate,
        bestBPM
      )
    ) {

      bestBPM = half;

    }

  }


  if (
    double >= 70 &&
    double <= 180
  ) {

    if (
      autocorrelationBPM(
        onset,
        envelopeRate,
        double
      ) >
      autocorrelationBPM(
        onset,
        envelopeRate,
        bestBPM
      )
    ) {

      bestBPM = double;

    }

  }


  const confidence =
    clamp(
      Math.abs(bestScore) /
      Math.max(
        .0001,
        onset.length * .01
      ),
      0,
      1
    );


  let firstBeat = 0;


  let maximum = 0;


  for (
    let i = 0;
    i < Math.min(3000, onset.length);
    i++
  ) {

    if (
      onset[i] > maximum
    ) {

      maximum =
        onset[i];

      firstBeat =
        i / envelopeRate;

    }

  }


  return {

    bpm:
      Math.round(
        bestBPM * 10
      ) / 10,

    confidence,

    firstBeat

  };

}


/* =========================================================
   AUTOCORRELATION BPM
========================================================= */

function autocorrelationBPM(
  onset,
  rate,
  bpm
) {

  const period =
    rate * 60 / bpm;


  let score = 0;


  for (
    let i = 0;
    i < onset.length - period;
    i += Math.max(1, period)
  ) {

    score +=
      onset[
        Math.round(i)
      ] *
      onset[
        Math.round(i + period)
      ];

  }


  return score;

}


/* =========================================================
   ENERGY
========================================================= */

function calculateEnergy(data) {

  const length =
    Math.min(
      data.length,
      11025 * 60
    );


  let sum = 0;


  for (
    let i = 0;
    i < length;
    i++
  ) {

    sum +=
      data[i] *
      data[i];

  }


  const rms =
    Math.sqrt(
      sum / Math.max(1, length)
    );


  return clamp(
    rms * 4,
    0,
    1
  );

}


/* =========================================================
   KEY
========================================================= */

function estimateKey(
  data,
  sampleRate
) {

  const names = [

    ["C", "8B"],
    ["C#", "3B"],
    ["D", "10B"],
    ["D#", "5B"],
    ["E", "12B"],
    ["F", "7B"],
    ["F#", "2B"],
    ["G", "9B"],
    ["G#", "4B"],
    ["A", "11B"],
    ["A#", "6B"],
    ["B", "1B"]

  ];


  const minorNames = [

    ["A", "8A"],
    ["A#", "3A"],
    ["B", "10A"],
    ["C", "5A"],
    ["C#", "12A"],
    ["D", "7A"],
    ["D#", "2A"],
    ["E", "9A"],
    ["F", "4A"],
    ["F#", "11A"],
    ["G", "6A"],
    ["G#", "1A"]

  ];


  const chroma =
    new Float32Array(12);


  const size =
    4096;


  const step =
    Math.max(
      size,
      Math.floor(
        data.length / 30
      )
    );


  for (
    let start = 0;
    start + size < data.length;
    start += step
  ) {

    const slice =
      data.subarray(
        start,
        start + size
      );


    for (
      let k = 0;
      k < 12;
      k++
    ) {

      const freq =
        65.41 *
        Math.pow(
          2,
          k / 12
        );


      let real = 0;
      let imag = 0;


      for (
        let n = 0;
        n < slice.length;
        n += 8
      ) {

        const angle =
          2 *
          Math.PI *
          freq *
          n /
          sampleRate;


        real +=
          slice[n] *
          Math.cos(angle);

        imag +=
          slice[n] *
          Math.sin(angle);

      }


      chroma[k] +=
        Math.sqrt(
          real * real +
          imag * imag
        );

    }

  }


  let maxIndex = 0;


  for (
    let i = 1;
    i < 12;
    i++
  ) {

    if (
      chroma[i] >
      chroma[maxIndex]
    ) {

      maxIndex = i;

    }

  }


  const major =
    names[maxIndex];


  const minor =
    minorNames[
      (maxIndex + 3) % 12
    ];


  const majorEnergy =
    chroma[maxIndex];


  const minorEnergy =
    chroma[
      (maxIndex + 3) % 12
    ];


  if (
    minorEnergy > majorEnergy * .9
  ) {

    return {

      key:
        minor[0] + "m",

      camelot:
        minor[1]

    };

  }


  return {

    key:
      major[0],

    camelot:
      major[1]

  };

}


/* =========================================================
   PHRASE
========================================================= */

function detectPhraseLength(
  data,
  sampleRate,
  bpm
) {

  const seconds =
    data.length /
    sampleRate;


  if (seconds < 60)
    return 16;


  return 32;

}


/* =========================================================
   SMOOTH
========================================================= */

function smoothArray(
  array,
  radius
) {

  const result =
    new Float32Array(
      array.length
    );


  for (
    let i = 0;
    i < array.length;
    i++
  ) {

    let sum = 0;

    let count = 0;


    for (
      let j =
        Math.max(0, i - radius);

      j <=
        Math.min(
          array.length - 1,
          i + radius
        );

      j++
    ) {

      sum += array[j];

      count++;

    }


    result[i] =
      sum / count;

  }


  return result;

}


/* =========================================================
   LOAD TRACK
========================================================= */

async function loadTrackSmart(
  item,
  letter
) {

  if (!item) return false;


  const deck =
    state.decks[letter];


  if (
    deck.playing
  ) {

    return false;

  }


  await ensureAudio();


  if (deck.url) {

    URL.revokeObjectURL(
      deck.url
    );

  }


  deck.audio.pause();

  deck.audio.removeAttribute("src");

  deck.audio.load();


  deck.file =
    item.file;

  deck.meta =
    item.meta;

  deck.url =
    URL.createObjectURL(
      item.file
    );


  deck.video =
    item.file.type.startsWith(
      "video/"
    );


  deck.ready = true;

  deck.playing = false;

  deck.preparedFor = null;


  deck.audio.src =
    deck.url;

  deck.audio.load();


  updateDeckUI(letter);


  return true;

}


/* =========================================================
   CLEAR DECK
========================================================= */

function clearDeck(letter) {

  const deck =
    state.decks[letter];


  if (
    deck.playing
  ) {

    deck.audio.pause();

  }


  if (deck.url) {

    URL.revokeObjectURL(
      deck.url
    );

  }


  deck.audio.removeAttribute("src");

  deck.audio.load();


  deck.file = null;

  deck.url = null;

  deck.meta = null;

  deck.ready = false;

  deck.playing = false;

  deck.preparedFor = null;

  deck.video = false;


  updateDeckUI(letter);

}


/* =========================================================
   FIND SMART NEXT
========================================================= */

function findSmartNext() {

  const active =
    state.decks[
      state.activeDeck
    ];


  if (!state.library.length)
    return null;


  const current =
    active.meta;


  const blocked =
    new Set(
      state.history.slice(-6)
    );


  const candidates =
    state.library.filter(
      item => {

        if (
          active.file ===
          item.file
        ) {

          return false;

        }


        if (
          blocked.has(item.id)
        ) {

          return false;

        }


        if (
          item.file ===
          state.decks[
            oppositeDeck(
              state.activeDeck
            )
          ].file
        ) {

          return false;

        }


        return true;

      }
    );


  if (!candidates.length) {

    return state.library.find(
      item =>
        item.file !==
        active.file
    ) || null;

  }


  let best =
    null;

  let bestScore =
    -Infinity;


  candidates.forEach(
    item => {

      const score =
        compatibilityScore(
          current,
          item.meta
        );


      if (
        score >
        bestScore
      ) {

        bestScore =
          score;

        best =
          item;

      }

    }
  );


  if (best) {

    $("smartCompatibility")
      .textContent =
      Math.round(
        bestScore * 100
      ) + "%";

  }


  return best;

}


/* =========================================================
   COMPATIBILITY
========================================================= */

function compatibilityScore(
  current,
  next
) {

  if (!next)
    return 0;


  if (!current)
    return .5;


  let score = 0;


  /* BPM */

  if (
    current.bpm &&
    next.bpm
  ) {

    const ratio =
      Math.min(
        current.bpm,
        next.bpm
      ) /
      Math.max(
        current.bpm,
        next.bpm
      );


    const bpmScore =
      clamp(
        (ratio - .7) / .3,
        0,
        1
      );


    score +=
      bpmScore * .28;

  } else {

    score += .14;

  }


  /* CAMELOT */

  if (
    current.camelot &&
    next.camelot
  ) {

    score +=
      camelotCompatibility(
        current.camelot,
        next.camelot
      ) * .25;

  } else {

    score += .125;

  }


  /* ENERGY */

  if (
    current.energy != null &&
    next.energy != null
  ) {

    score +=
      (
        1 -
        Math.abs(
          current.energy -
          next.energy
        )
      ) * .17;

  } else {

    score += .08;

  }


  /* GENRE */

  if (
    current.genre &&
    next.genre
  ) {

    if (
      current.genre ===
      next.genre
    ) {

      score += .12;

    } else {

      score += .05;

    }

  }


  /* RANDOM SMALL VARIATION */

  score +=
    Math.random() * .05;


  return clamp(
    score,
    0,
    1
  );

}


/* =========================================================
   CAMELOT
========================================================= */

function camelotCompatibility(
  a,
  b
) {

  if (a === b)
    return 1;


  const numberA =
    parseInt(a);


  const numberB =
    parseInt(b);


  if (
    a.endsWith(
      b.endsWith("A") ? "A" : "B"
    )
  ) {

    if (
      Math.abs(
        numberA -
        numberB
      ) === 1
    ) {

      return .9;

    }

  }


  if (
    a.slice(-1) !==
    b.slice(-1)
  ) {

    if (
      numberA === numberB
    ) {

      return .82;

    }

  }


  return .35;

}


/* =========================================================
   SMART NEXT
========================================================= */

async function smartNext(
  force = false
) {

  await ensureAudio();


  const active =
    state.decks[
      state.activeDeck
    ];


  const targetLetter =
    oppositeDeck(
      state.activeDeck
    );


  const target =
    state.decks[
      targetLetter
    ];


  if (
    !active.file
  ) {

    const first =
      state.library[0];


    if (!first) {

      $("smartReason").textContent =
        "Sin música";

      return false;

    }


    await loadTrackSmart(
      first,
      state.activeDeck
    );


    return true;

  }


  if (
    target.file &&
    target.preparedFor ===
    active.file &&
    !force
  ) {

    updateSmartStatus();

    return true;

  }


  if (
    target.playing
  ) {

    return false;

  }


  const next =
    findSmartNext();


  if (!next) {

    $("smartReason").textContent =
      "No hay siguiente canción";

    return false;

  }


  const loaded =
    await loadTrackSmart(
      next,
      targetLetter
    );


  if (loaded) {

    target.preparedFor =
      active.file;


    $("smartReason").textContent =
      `Siguiente: ${next.meta.title}`;

    updateSmartStatus();

  }


  return loaded;

}


/* =========================================================
   BPM SYNC
========================================================= */

function syncIncomingBPM(
  outgoing,
  incoming
) {

  if (
    !outgoing.meta ||
    !incoming.meta ||
    !outgoing.meta.bpm ||
    !incoming.meta.bpm
  ) {

    incoming.audio.playbackRate =
      1;

    return;

  }


  const ratio =
    outgoing.meta.bpm /
    incoming.meta.bpm;


  const rate =
    clamp(
      ratio,
      .92,
      1.08
    );


  incoming.audio.playbackRate =
    rate;


  try {

    incoming.audio.preservesPitch =
      true;

    incoming.audio.mozPreservesPitch =
      true;

    incoming.audio.webkitPreservesPitch =
      true;

  } catch (error) {}

}


/* =========================================================
   TRANSITION LENGTH
========================================================= */

function calculateMixDuration(
  outgoing
) {

  if (
    !outgoing.meta ||
    !outgoing.meta.bpm
  ) {

    return 10000;

  }


  const beats =
    outgoing.meta.phraseLength ||
    16;


  return clamp(
    beats *
    60 /
    outgoing.meta.bpm *
    1000,
    6000,
    24000
  );

}


/* =========================================================
   TRANSITION
========================================================= */

async function transitionTo(
  targetLetter
) {

  if (
    state.transitionRunning
  ) {

    return;

  }


  const outgoingLetter =
    state.activeDeck;


  if (
    targetLetter ===
    outgoingLetter
  ) {

    return;

  }


  const outgoing =
    state.decks[
      outgoingLetter
    ];


  const incoming =
    state.decks[
      targetLetter
    ];


  if (
    !outgoing.file
  ) {

    return;

  }


  if (
    !incoming.file ||
    incoming.preparedFor !==
    outgoing.file
  ) {

    const ok =
      await smartNext(true);


    if (!ok) return;

    if (
      !incoming.file
    ) return;

  }


  await ensureAudio();


  state.transitionRunning =
    true;


  const token =
    ++state.transitionToken;


  syncIncomingBPM(
    outgoing,
    incoming
  );


  const incomingStart =
    incoming.audio.currentTime;


  try {

    await incoming.audio.play();

  } catch (error) {

    console.error(error);

    state.transitionRunning =
      false;

    return;

  }


  const startPosition =
    state.crossPosition;


  const endPosition =
    targetLetter === "A"
      ? 0
      : 1;


  const duration =
    calculateMixDuration(
      outgoing
    );


  const startTime =
    performance.now();


  $("autoState").textContent =
    `MEZCLANDO ${outgoingLetter} → ${targetLetter}`;


  $("mediaStatus").textContent =
    `SMART MIX ${outgoingLetter} → ${targetLetter}`;


  await new Promise(
    resolve => {

      function step(now) {

        if (
          token !==
          state.transitionToken
        ) {

          resolve();

          return;

        }


        const progress =
          clamp(
            (
              now -
              startTime
            ) / duration,
            0,
            1
          );


        const eased =
          progress *
          progress *
          (3 - 2 * progress);


        const position =
          startPosition +
          (
            endPosition -
            startPosition
          ) *
          eased;


        updateCrossfader(
          position
        );


        if (
          progress >= 1
        ) {

          resolve();

          return;

        }


        requestAnimationFrame(
          step
        );

      }


      requestAnimationFrame(
        step
      );

    }
  );


  if (
    token !==
    state.transitionToken
  ) {

    state.transitionRunning =
      false;

    return;

  }


  /* Guardamos la canción que terminó */

  if (outgoing.file) {

    const outgoingItem =
      state.library.find(
        item =>
          item.file ===
          outgoing.file
      );


    if (outgoingItem) {

      state.history.push(
        outgoingItem.id
      );

      if (
        state.history.length >
        30
      ) {

        state.history.shift();

      }

    }

  }


  /* El nuevo deck pasa a ser activo */

  state.activeDeck =
    targetLetter;


  updateActiveDeckUI();


  /* Reiniciamos y limpiamos el deck anterior */

  outgoing.audio.pause();

  outgoing.audio.currentTime =
    0;


  clearDeck(
    outgoingLetter
  );


  /*
     El deck anterior ahora está libre.
     Cargamos inmediatamente la próxima
     canción allí.
  */

  if (state.autoDJ) {

    await smartNext(true);

  }


  state.transitionRunning =
    false;


  $("autoState").textContent =
    "SMART AUTO DJ ACTIVO";


  $("mediaStatus").textContent =
    `EN VIVO • PLATO ${state.activeDeck}`;

}


/* =========================================================
   AUTO DJ
========================================================= */

function toggleAutoDJ() {

  state.autoDJ =
    !state.autoDJ;


  const button =
    $("autoDJButton");


  if (
    state.autoDJ
  ) {

    button.textContent =
      "■ SMART AUTO DJ: ON";

    button.classList.add(
      "active"
    );


    $("autoState").textContent =
      "SMART AUTO DJ ACTIVO";


    startAutoDJ();


  } else {

    button.textContent =
      "▶ SMART AUTO DJ: OFF";

    button.classList.remove(
      "active"
    );


    $("autoState").textContent =
      "SMART AUTO DJ DETENIDO";


    stopAutoDJ();

  }

}


/* =========================================================
   AUTO DJ START
========================================================= */

async function startAutoDJ() {

  await ensureAudio();


  clearInterval(
    state.autoTimer
  );


  await smartNext(true);


  state.autoTimer =
    setInterval(
      autoDJTick,
      700
    );


  await autoDJTick();

}


/* =========================================================
   AUTO DJ STOP
========================================================= */

function stopAutoDJ() {

  clearInterval(
    state.autoTimer
  );

  state.autoTimer =
    null;

}


/* =========================================================
   AUTO DJ TICK
========================================================= */

async function autoDJTick() {

  if (
    !state.autoDJ ||
    state.transitionRunning
  ) {

    return;

  }


  const active =
    state.decks[
      state.activeDeck
    ];


  if (
    !active.file
  ) {

    return;

  }


  if (
    !active.playing
  ) {

    return;

  }


  const targetLetter =
    oppositeDeck(
      state.activeDeck
    );


  const target =
    state.decks[
      targetLetter
    ];


  if (
    !target.file ||
    target.preparedFor !==
    active.file
  ) {

    await smartNext(true);

  }


  if (
    !target.file
  ) {

    return;

  }


  const remaining =
    active.audio.duration -
    active.audio.currentTime;


  const mixSeconds =
    calculateMixDuration(
      active
    ) / 1000;


  /*
     La transición se dispara
     automáticamente antes del final.
  */

  if (
    remaining <=
    Math.max(
      mixSeconds,
      8
    )
  ) {

    await transitionTo(
      targetLetter
    );

  }

}


/* =========================================================
   UPDATE SMART STATUS
========================================================= */

function updateSmartStatus() {

  const active =
    state.decks[
      state.activeDeck
    ];


  if (!active.meta) {

    return;

  }


  $("smartBpm").textContent =
    active.meta.bpm || "--";


  $("smartKey").textContent =
    active.meta.key || "--";


  $("smartCamelot").textContent =
    active.meta.camelot || "--";


  $("smartEnergy").textContent =
    active.meta.energy != null
      ? Math.round(
          active.meta.energy * 100
        )
      : "--";


  $("nextDeck").textContent =
    oppositeDeck(
      state.activeDeck
    );

}


/* =========================================================
   UI DECK
========================================================= */

function updateDeckUI(letter) {

  const deck =
    state.decks[letter];


  const status =
    $("status" + letter);


  if (!deck.file) {

    status.textContent =
      "VACÍO";

    $("track" + letter)
      .textContent =
      "Sin canción";

    $("bpm" + letter)
      .textContent =
      "--";

    $("key" + letter)
      .textContent =
      "--";

    $("camelot" + letter)
      .textContent =
      "--";

    $("energy" + letter)
      .textContent =
      "--";

    $("platter" + letter)
      .classList.remove(
        "playing"
      );

    return;

  }


  const m =
    deck.meta;


  $("track" + letter)
    .textContent =
    m.title;


  $("bpm" + letter)
    .textContent =
    m.bpm || "--";


  $("key" + letter)
    .textContent =
    m.key || "--";


  $("camelot" + letter)
    .textContent =
    m.camelot || "--";


  $("energy" + letter)
    .textContent =
    m.energy != null
      ? Math.round(
          m.energy * 100
        )
      : "--";


  status.textContent =
    deck.playing
      ? "REPRODUCIENDO"
      : "PREPARADO";


  $("platter" + letter)
    .classList.toggle(
      "playing",
      deck.playing
    );

}


/* =========================================================
   ACTIVE DECK
========================================================= */

function updateActiveDeckUI() {

  ["A", "B"].forEach(
    letter => {

      $("deckPanel" + letter)
        .classList.toggle(
          "active",
          letter ===
          state.activeDeck
        );

    }
  );


  $("channelLightA")
    .classList.toggle(
      "active-a",
      state.activeDeck === "A"
    );


  $("channelLightB")
    .classList.toggle(
      "active-b",
      state.activeDeck === "B"
    );


  updateSmartStatus();


  updateVideo();

}


/* =========================================================
   VIDEO
========================================================= */

function updateVideo() {

  const screen =
    $("videoScreen");


  const active =
    state.decks[
      state.activeDeck
    ];


  if (
    !active ||
    !active.video ||
    !active.url
  ) {

    screen.pause();

    screen.removeAttribute(
      "src"
    );

    screen.style.display =
      "none";

    return;

  }


  screen.src =
    active.url;

  screen.style.display =
    "block";


  screen.play()
    .catch(
      () => {}
    );


  syncVideo();

}


/* =========================================================
   VIDEO SYNC
========================================================= */

function syncVideo() {

  const screen =
    $("videoScreen");


  const active =
    state.decks[
      state.activeDeck
    ];


  if (
    !active ||
    !active.video
  ) {

    return;

  }


  try {

    const difference =
      Math.abs(
        screen.currentTime -
        active.audio.currentTime
      );


    if (
      difference > .15
    ) {

      screen.currentTime =
        active.audio.currentTime;

    }

  } catch (error) {}

}


/* =========================================================
   VISUALIZER
========================================================= */

function startVisualizer() {

  const canvas =
    $("visualizer");


  const ctx =
    canvas.getContext(
      "2d"
    );


  function resize() {

    canvas.width =
      canvas.clientWidth *
      devicePixelRatio;

    canvas.height =
      canvas.clientHeight *
      devicePixelRatio;

  }


  resize();


  window.addEventListener(
    "resize",
    resize
  );


  const data =
    new Uint8Array(
      state.analyser.frequencyBinCount
    );


  function draw() {

    state.animationFrame =
      requestAnimationFrame(
        draw
      );


    state.analyser
      .getByteFrequencyData(
        data
      );


    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    const width =
      canvas.width;

    const height =
      canvas.height;


    const bars =
      100;


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

      const value =
        data[i * step] /
        255;


      const barHeight =
        value *
        height *
        .45;


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
        "#00eaff"
      );

      gradient.addColorStop(
        .5,
        "#9c4dff"
      );

      gradient.addColorStop(
        1,
        "#ff244f"
      );


      ctx.fillStyle =
        gradient;


      ctx.fillRect(
        x,
        y,
        Math.max(
          1,
          barWidth - 2
        ),
        barHeight
      );

    }


    syncVideo();

  }


  draw();

}


/* =========================================================
   FULLSCREEN
========================================================= */

async function toggleFullscreen() {

  try {

    if (
      !document.fullscreenElement
    ) {

      await document.documentElement
        .requestFullscreen();

    } else {

      await document
        .exitFullscreen();

    }

  } catch (error) {

    console.error(
      "Fullscreen:",
      error
    );

  }

}


document.addEventListener(
  "fullscreenchange",
  () => {

    const active =
      !!document.fullscreenElement;


    document.body
      .classList.toggle(
        "fullscreen-mode",
        active
      );


    $("fullscreenButton")
      .textContent =
      active
        ? "⛶ SALIR PANTALLA COMPLETA"
        : "⛶ PANTALLA COMPLETA";

  }
);


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
  "keydown",
  async event => {

    if (
      event.target.tagName ===
      "INPUT"
    ) {

      return;

    }


    if (
      event.code ===
      "Space"
    ) {

      event.preventDefault();


      const deck =
        state.decks[
          state.activeDeck
        ];


      if (!deck.file) return;


      if (
        deck.playing
      ) {

        deck.audio.pause();

      } else {

        await ensureAudio();

        await deck.audio.play();

      }

    }


    if (
      event.key.toLowerCase() ===
      "f"
    ) {

      toggleFullscreen();

    }


    if (
      event.key.toLowerCase() ===
      "n"
    ) {

      await ensureAudio();

      await smartNext(true);

    }


    if (
      event.key.toLowerCase() ===
      "a"
    ) {

      await ensureAudio();

      toggleAutoDJ();

    }

  }
);


/* =========================================================
   DEBUG
========================================================= */

window.HCProDJ = {

  state,

  smartNext,

  transitionTo,

  toggleAutoDJ,

  loadTrackSmart,

  analyzeLibrary

};
