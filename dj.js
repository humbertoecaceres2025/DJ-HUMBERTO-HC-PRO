/* =========================================================
   HC PRO DJ HUMBERTO
   PROFESSIONAL SMART DJ SYSTEM
   JS 4.0
========================================================= */

"use strict";


/* =========================================================
   ESTADO PRINCIPAL
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

  started: false,

  audioReady: false,

  animationFrame: null,

  autoTimer: null

};


/* =========================================================
   HELPERS
========================================================= */

function $(id) {

  return document.getElementById(id);

}


function clamp(value, min, max) {

  return Math.max(
    min,
    Math.min(max, value)
  );

}


function oppositeDeck(deck) {

  return deck === "A"
    ? "B"
    : "A";

}


function safeId() {

  if (
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {

    return window.crypto.randomUUID();

  }

  return (
    "track-" +
    Date.now() +
    "-" +
    Math.random()
      .toString(36)
      .slice(2)
  );

}


function fileNameWithoutExtension(name) {

  return name
    .replace(/\.[^/.]+$/, "")
    .trim();

}


/* =========================================================
   DOM READY
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    try {

      initDeckObjects();

      bindEvents();

      renderLibrary();

      updateCrossfader(0);

      updateActiveDeckUI();

      updateEngineStatus(
        "● SISTEMA LISTO",
        true
      );

      startMasterMeter();

    } catch (error) {

      console.error(
        "HC PRO DJ initialization:",
        error
      );

      updateEngineStatus(
        "● INTERFAZ LISTA",
        true
      );

    }

  }
);


/* =========================================================
   DECK OBJECTS
========================================================= */

function initDeckObjects() {

  state.decks.A = createDeck("A");

  state.decks.B = createDeck("B");

}


function createDeck(letter) {

  return {

    letter,

    audio:
      $(
        letter === "A"
          ? "audioA"
          : "audioB"
      ),

    file: null,

    url: null,

    source: null,

    inputGain: null,

    low: null,

    mid: null,

    high: null,

    volumeGain: null,

    crossGain: null,

    playing: false,

    preparedFor: null,

    analysis: {

      bpm: 0,

      key: "--",

      camelot: "--",

      energy: 0,

      phraseLength: 16,

      confidence: 0

    }

  };

}


/* =========================================================
   AUDIO ENGINE
========================================================= */

async function initAudioEngine() {

  if (state.audioReady) {

    if (
      state.ctx &&
      state.ctx.state === "suspended"
    ) {

      await state.ctx.resume();

    }

    return true;

  }


  try {

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {

      throw new Error(
        "Web Audio API no disponible."
      );

    }


    state.ctx =
      new AudioContextClass();


    state.masterGain =
      state.ctx.createGain();


    state.masterGain.gain.value =
      0.9;


    state.musicBus =
      state.ctx.createGain();


    state.musicBus.gain.value =
      1;


    state.compressor =
      state.ctx.createDynamicsCompressor();


    state.compressor.threshold.value =
      -18;

    state.compressor.knee.value =
      18;

    state.compressor.ratio.value =
      4;

    state.compressor.attack.value =
      0.003;

    state.compressor.release.value =
      0.25;


    state.analyser =
      state.ctx.createAnalyser();


    state.analyser.fftSize =
      256;


    state.musicBus
      .connect(state.masterGain);


    state.masterGain
      .connect(state.compressor);


    state.compressor
      .connect(state.analyser);


    state.analyser
      .connect(
        state.ctx.destination
      );


    setupDeckAudio(
      state.decks.A
    );

    setupDeckAudio(
      state.decks.B
    );


    await state.ctx.resume();


    state.audioReady = true;

    state.started = true;


    updateEngineStatus(
      "● AUDIO ENGINE ACTIVO",
      true
    );


    startVisualizer();

    return true;

  } catch (error) {

    console.error(
      "Audio engine error:",
      error
    );

    updateEngineStatus(
      "● INTERFAZ ACTIVA",
      true
    );

    return false;

  }

}


/* =========================================================
   DECK AUDIO GRAPH
========================================================= */

function setupDeckAudio(deck) {

  if (
    !deck ||
    !deck.audio ||
    !state.ctx
  ) {

    return;

  }


  if (deck.source) {

    return;

  }


  try {

    deck.source =
      state.ctx.createMediaElementSource(
        deck.audio
      );


    deck.inputGain =
      state.ctx.createGain();


    deck.low =
      state.ctx.createBiquadFilter();


    deck.mid =
      state.ctx.createBiquadFilter();


    deck.high =
      state.ctx.createBiquadFilter();


    deck.volumeGain =
      state.ctx.createGain();


    deck.crossGain =
      state.ctx.createGain();


    /* LOW */

    deck.low.type =
      "lowshelf";

    deck.low.frequency.value =
      180;

    deck.low.gain.value =
      0;


    /* MID */

    deck.mid.type =
      "peaking";

    deck.mid.frequency.value =
      1000;

    deck.mid.Q.value =
      0.8;

    deck.mid.gain.value =
      0;


    /* HIGH */

    deck.high.type =
      "highshelf";

    deck.high.frequency.value =
      4500;

    deck.high.gain.value =
      0;


    deck.inputGain.gain.value =
      1;

    deck.volumeGain.gain.value =
      1;

    deck.crossGain.gain.value =
      deck.letter === "A"
        ? 1
        : 0;


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
      "ended",
      () => {

        handleTrackEnded(
          deck.letter
        );

      }
    );


    deck.audio.addEventListener(
      "play",
      () => {

        deck.playing = true;

        updateDeckUI(
          deck.letter
        );

      }
    );


    deck.audio.addEventListener(
      "pause",
      () => {

        deck.playing = false;

        updateDeckUI(
          deck.letter
        );

      }
    );

  } catch (error) {

    console.warn(
      "Deck audio graph:",
      error
    );

  }

}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {


  /* FULLSCREEN */

  const fullscreenButton =
    $("fullscreenButton");

  if (fullscreenButton) {

    fullscreenButton.addEventListener(
      "click",
      toggleFullscreen
    );

  }


  /* CROSSFADER */

  const crossfader =
    $("crossfader");

  if (crossfader) {

    crossfader.addEventListener(
      "input",
      event => {

        updateCrossfader(
          Number(event.target.value)
        );

      }
    );

  }


  /* SMART NEXT */

  const smartNextButton =
    $("smartNextButton");

  if (smartNextButton) {

    smartNextButton.addEventListener(
      "click",
      async () => {

        await smartNext(
          false
        );

      }
    );

  }


  /* AUTO DJ */

  const autoDJButton =
    $("autoDJButton");

  if (autoDJButton) {

    autoDJButton.addEventListener(
      "click",
      async () => {

        await toggleAutoDJ();

      }
    );

  }


  /* DECKS */

  bindDeckEvents("A");

  bindDeckEvents("B");


  /* LIBRARY */

  const libraryFiles =
    $("libraryFiles");

  if (libraryFiles) {

    libraryFiles.addEventListener(
      "change",
      event => {

        addFiles(
          event.target.files
        );

      }
    );

  }


  const libraryFolder =
    $("libraryFolder");

  if (libraryFolder) {

    libraryFolder.addEventListener(
      "change",
      event => {

        addFiles(
          event.target.files
        );

      }
    );

  }


  const analyzeButton =
    $("analyzeLibraryButton");

  if (analyzeButton) {

    analyzeButton.addEventListener(
      "click",
      async () => {

        await analyzeLibrary();

      }
    );

  }


  const search =
    $("searchLibrary");

  if (search) {

    search.addEventListener(
      "input",
      renderLibrary
    );

  }


  const genre =
    $("genreFilter");

  if (genre) {

    genre.addEventListener(
      "change",
      renderLibrary
    );

  }


  /* KEYBOARD */

  document.addEventListener(
    "keydown",
    handleKeyboard
  );

}


/* =========================================================
   DECK EVENTS
========================================================= */

function bindDeckEvents(letter) {

  const play =
    $(
      letter === "A"
        ? "playA"
        : "playB"
    );


  const stop =
    $(
      letter === "A"
        ? "stopA"
        : "stopB"
    );


  if (play) {

    play.addEventListener(
      "click",
      async () => {

        await toggleDeckPlay(
          letter
        );

      }
    );

  }


  if (stop) {

    stop.addEventListener(
      "click",
      () => {

        stopDeck(
          letter
        );

      }
    );

  }


  bindSlider(
    letter,
    "volume",
    value => {

      const deck =
        state.decks[letter];

      if (
        deck.volumeGain
      ) {

        deck.volumeGain.gain.value =
          value;

      }

    }
  );


  bindSlider(
    letter,
    "pitch",
    value => {

      const deck =
        state.decks[letter];

      if (deck.audio) {

        deck.audio.playbackRate =
          1 +
          Number(value) / 100;

      }

    }
  );


  bindSlider(
    letter,
    "low",
    value => {

      const deck =
        state.decks[letter];

      if (deck.low) {

        deck.low.gain.value =
          Number(value);

      }

    }
  );


  bindSlider(
    letter,
    "mid",
    value => {

      const deck =
        state.decks[letter];

      if (deck.mid) {

        deck.mid.gain.value =
          Number(value);

      }

    }
  );


  bindSlider(
    letter,
    "high",
    value => {

      const deck =
        state.decks[letter];

      if (deck.high) {

        deck.high.gain.value =
          Number(value);

      }

    }
  );

}


function bindSlider(
  letter,
  type,
  callback
) {

  const id =
    type +
    letter;

  const element =
    $(id);

  if (!element) {

    return;

  }


  element.addEventListener(
    "input",
    event => {

      callback(
        Number(event.target.value)
      );

    }
  );

}


/* =========================================================
   CROSS FADER
========================================================= */

function updateCrossfader(
  position
) {

  position =
    clamp(
      Number(position),
      0,
      1
    );


  state.crossPosition =
    position;


  const deckA =
    state.decks.A;

  const deckB =
    state.decks.B;


  if (
    deckA &&
    deckA.crossGain
  ) {

    const gainA =
      Math.cos(
        position *
        Math.PI /
        2
      );

    deckA.crossGain.gain.value =
      gainA;

  }


  if (
    deckB &&
    deckB.crossGain
  ) {

    const gainB =
      Math.sin(
        position *
        Math.PI /
        2
      );

    deckB.crossGain.gain.value =
      gainB;

  }


  const active =
    position < .5
      ? "A"
      : "B";


  state.activeDeck =
    active;


  updateActiveDeckUI();

}


/* =========================================================
   PLAY / PAUSE
========================================================= */

async function toggleDeckPlay(
  letter
) {

  const deck =
    state.decks[letter];

  if (!deck) {

    return;

  }


  const ready =
    await initAudioEngine();


  if (!ready) {

    return;

  }


  if (!deck.file) {

    if (
      state.library.length
    ) {

      await loadTrackSmart(
        state.library[0],
        letter
      );

    } else {

      updateSmartReason(
        "Carga primero una canción en la biblioteca."
      );

      return;

    }

  }


  try {

    if (
      state.ctx &&
      state.ctx.state === "suspended"
    ) {

      await state.ctx.resume();

    }


    if (
      deck.audio.paused
    ) {

      await deck.audio.play();

    } else {

      deck.audio.pause();

    }

  } catch (error) {

    console.error(
      "Play error:",
      error
    );

    updateSmartReason(
      "El navegador bloqueó el audio. Presiona PLAY nuevamente."
    );

  }

}


/* =========================================================
   STOP
========================================================= */

function stopDeck(
  letter
) {

  const deck =
    state.decks[letter];

  if (!deck) {

    return;

  }


  try {

    deck.audio.pause();

    deck.audio.currentTime =
      0;

  } catch (error) {

    console.warn(error);

  }


  deck.playing =
    false;


  updateDeckUI(
    letter
  );

}


/* =========================================================
   FILE LIBRARY
========================================================= */

function addFiles(
  fileList
) {

  if (!fileList) {

    return;

  }


  const files =
    Array.from(fileList);


  files.forEach(
    file => {

      if (
        !file.type.startsWith("audio/") &&
        !file.type.startsWith("video/")
      ) {

        return;

      }


      const exists =
        state.library.some(
          track =>
            track.name === file.name &&
            track.size === file.size
        );


      if (exists) {

        return;

      }


      state.library.push({

        id: safeId(),

        file,

        name: fileNameWithoutExtension(
          file.name
        ),

        originalName:
          file.name,

        size:
          file.size,

        genre:
          detectGenre(file.name),

        analysis: {

          bpm: 0,

          key: "--",

          camelot: "--",

          energy: 0,

          phraseLength: 16,

          confidence: 0

        }

      });

    }
  );


  renderLibrary();


  updateSmartReason(
    `${files.length} archivo(s) agregado(s) a la biblioteca.`
  );

}


/* =========================================================
   GENRE DETECTION
========================================================= */

function detectGenre(
  name
) {

  const value =
    name.toLowerCase();


  if (
    /rock|metal|punk|guitar/.test(
      value
    )
  ) {

    return "rock";

  }


  if (
    /latin|cumbia|salsa|bachata|reggaeton|reggaetón/.test(
      value
    )
  ) {

    return "latin";

  }


  if (
    /dance|house|techno|trance|edm|electro/.test(
      value
    )
  ) {

    return "dance";

  }


  if (
    /pop/.test(value)
  ) {

    return "pop";

  }


  return "other";

}


/* =========================================================
   RENDER LIBRARY
========================================================= */

function renderLibrary() {

  const container =
    $("libraryList");

  if (!container) {

    return;

  }


  const search =
    (
      $("searchLibrary")?.value ||
      ""
    )
      .toLowerCase()
      .trim();


  const genre =
    $("genreFilter")?.value ||
    "all";


  const tracks =
    state.library.filter(
      track => {

        const matchesSearch =
          !search ||
          track.name
            .toLowerCase()
            .includes(search);


        const matchesGenre =
          genre === "all" ||
          track.genre === genre;


        return (
          matchesSearch &&
          matchesGenre
        );

      }
    );


  if (!tracks.length) {

    container.innerHTML = `

      <div class="empty-library">

        <span>♪</span>

        <strong>
          BIBLIOTECA VACÍA
        </strong>

        <small>
          Carga tus canciones para comenzar.
        </small>

      </div>

    `;

    return;

  }


  container.innerHTML =
    tracks
      .map(
        (track, index) => {

          const analysis =
            track.analysis;


          return `

            <div
              class="library-item"
              data-id="${track.id}"
            >

              <div class="library-number">
                ${String(index + 1).padStart(2, "0")}
              </div>

              <div>

                <div class="library-name">
                  ${escapeHTML(track.name)}
                </div>

                <div class="library-meta">

                  ${
                    analysis.bpm
                      ? `${analysis.bpm} BPM`
                      : "BPM --"
                  }

                  &nbsp; • &nbsp;

                  ${
                    analysis.camelot !== "--"
                      ? analysis.camelot
                      : "KEY --"
                  }

                  &nbsp; • &nbsp;

                  ${track.genre}

                </div>

              </div>

              <button
                class="library-load"
                data-load-id="${track.id}"
              >
                CARGAR
              </button>

            </div>

          `;

        }
      )
      .join("");


  container
    .querySelectorAll(
      "[data-load-id]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async event => {

            const id =
              event.currentTarget
                .dataset
                .loadId;


            const track =
              state.library.find(
                item =>
                  item.id === id
              );


            if (!track) {

              return;

            }


            await loadTrackSmart(
              track,
              state.activeDeck
            );

          }
        );

      }
    );

}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHTML(
  value
) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================================================
   LOAD TRACK
========================================================= */

async function loadTrackSmart(
  track,
  letter
) {

  if (!track) {

    return false;

  }


  const deck =
    state.decks[letter];

  if (!deck) {

    return false;

  }


  await initAudioEngine();


  try {

    if (
      deck.url
    ) {

      try {

        URL.revokeObjectURL(
          deck.url
        );

      } catch (_) {}

    }


    deck.audio.pause();


    deck.url =
      URL.createObjectURL(
        track.file
      );


    deck.audio.src =
      deck.url;


    deck.audio.load();


    deck.file =
      track;


    deck.preparedFor =
      null;


    deck.analysis =
      track.analysis ||
      createEmptyAnalysis();


    state.history.push(
      track.id
    );


    updateDeckUI(
      letter
    );


    updateSmartPanel(
      deck.analysis
    );


    updateVideo(
      track
    );


    updateSmartReason(
      `DECK ${letter}: ${track.name} cargado.`
    );


    return true;

  } catch (error) {

    console.error(
      "Load track error:",
      error
    );

    updateSmartReason(
      "No se pudo cargar la canción."
    );

    return false;

  }

}


/* =========================================================
   EMPTY ANALYSIS
========================================================= */

function createEmptyAnalysis() {

  return {

    bpm: 0,

    key: "--",

    camelot: "--",

    energy: 0,

    phraseLength: 16,

    confidence: 0

  };

}


/* =========================================================
   SMART NEXT
========================================================= */

async function smartNext(
  force = false
) {

  if (
    !state.library.length
  ) {

    updateSmartReason(
      "SMART NEXT: agrega canciones a la biblioteca."
    );

    return null;

  }


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


  let candidates =
    state.library.filter(
      track =>
        !active.file ||
        track.id !==
          active.file.id
    );


  if (!candidates.length) {

    candidates =
      [...state.library];

  }


  const scored =
    candidates.map(
      track => {

        const score =
          compatibilityScore(
            active
              ? active.analysis
              : null,
            track.analysis,
            active?.file,
            track
          );


        return {
          track,
          score
        };

      }
    );


  scored.sort(
    (a, b) =>
      b.score -
      a.score
  );


  const selected =
    scored[0]?.track;


  if (!selected) {

    return null;

  }


  const loaded =
    await loadTrackSmart(
      selected,
      targetLetter
    );


  if (!loaded) {

    return null;

  }


  target.preparedFor =
    active?.file || null;


  const compatibility =
    Math.round(
      scored[0].score
    );


  updateSmartPanel(
    selected.analysis,
    compatibility
  );


  updateSmartReason(
    `SMART NEXT → DECK ${targetLetter}: ${selected.name} | Compatibilidad ${compatibility}%`
  );


  return selected;

}


/* =========================================================
   COMPATIBILITY
========================================================= */

function compatibilityScore(
  current,
  next,
  currentTrack,
  nextTrack
) {

  if (!next) {

    return 0;

  }


  let score = 45;


  /* BPM */

  if (
    current?.bpm &&
    next.bpm
  ) {

    const bpmDiff =
      Math.abs(
        current.bpm -
        next.bpm
      );


    if (bpmDiff <= 2) {

      score += 28;

    } else if (
      bpmDiff <= 5
    ) {

      score += 20;

    } else if (
      bpmDiff <= 8
    ) {

      score += 12;

    } else if (
      bpmDiff <= 15
    ) {

      score += 5;

    }

  }


  /* CAMELOT */

  score +=
    camelotScore(
      current?.camelot,
      next.camelot
    );


  /* ENERGY */

  if (
    current?.energy &&
    next.energy
  ) {

    const diff =
      Math.abs(
        current.energy -
        next.energy
      );


    if (diff <= .08) {

      score += 15;

    } else if (
      diff <= .18
    ) {

      score += 10;

    } else if (
      diff <= .30
    ) {

      score += 5;

    }

  }


  /* GENRE */

  if (
    currentTrack &&
    nextTrack &&
    currentTrack.genre ===
      nextTrack.genre
  ) {

    score += 7;

  }


  return clamp(
    score,
    0,
    100
  );

}


/* =========================================================
   CAMELOT SCORE
========================================================= */

function camelotScore(
  a,
  b
) {

  if (
    !a ||
    !b ||
    a === "--" ||
    b === "--"
  ) {

    return 0;

  }


  const first =
    parseCamelot(a);

  const second =
    parseCamelot(b);


  if (
    !first ||
    !second
  ) {

    return 0;

  }


  if (
    first.number ===
    second.number &&
    first.letter ===
    second.letter
  ) {

    return 25;

  }


  if (
    first.letter ===
    second.letter
  ) {

    const distance =
      Math.abs(
        first.number -
        second.number
      );


    if (
      distance === 1 ||
      distance === 11
    ) {

      return 18;

    }

  }


  if (
    first.number ===
    second.number
  ) {

    return 16;

  }


  return 0;

}


function parseCamelot(
  value
) {

  const match =
    String(value)
      .match(
        /^(\d{1,2})([AB])$/i
      );


  if (!match) {

    return null;

  }


  return {

    number:
      Number(match[1]),

    letter:
      match[2]
        .toUpperCase()

  };

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


  const incoming =
    state.decks[targetLetter];


  const outgoing =
    state.decks[
      oppositeDeck(
        targetLetter
      )
    ];


  if (
    !incoming ||
    !incoming.file
  ) {

    await smartNext(
      true
    );

    return;

  }


  if (
    incoming.preparedFor &&
    outgoing.file &&
    incoming.preparedFor.id !==
      outgoing.file.id
  ) {

    await loadTrackSmart(
      await chooseNextTrack(
        outgoing
      ),
      targetLetter
    );

  }


  const ready =
    await initAudioEngine();


  if (!ready) {

    return;

  }


  state.transitionRunning =
    true;


  const token =
    ++state.transitionToken;


  try {

    syncIncomingBPM(
      outgoing,
      incoming
    );


    if (
      incoming.audio.paused
    ) {

      await incoming.audio.play();

    }


    const start =
      state.crossPosition;


    const end =
      targetLetter === "A"
        ? 0
        : 1;


    const duration =
      getTransitionDuration(
        outgoing,
        incoming
      );


    const startedAt =
      performance.now();


    await animateCrossfade(
      start,
      end,
      duration,
      token
    );


    if (
      token !==
      state.transitionToken
    ) {

      return;

    }


    outgoing.audio.pause();

    outgoing.audio.currentTime =
      0;


    state.activeDeck =
      targetLetter;


    updateActiveDeckUI();


    updateSmartReason(
      `TRANSICIÓN COMPLETA → DECK ${targetLetter}`
    );


    if (state.autoDJ) {

      await preloadNextForAutoDJ();

    }

  } catch (error) {

    console.error(
      "Transition error:",
      error
    );

  } finally {

    state.transitionRunning =
      false;

  }

}


/* =========================================================
   TRANSITION DURATION
========================================================= */

function getTransitionDuration(
  outgoing,
  incoming
) {

  const bpm =
    incoming?.analysis?.bpm ||
    outgoing?.analysis?.bpm ||
    120;


  const phrase =
    incoming?.analysis?.phraseLength ||
    16;


  const seconds =
    phrase *
    60 /
    bpm;


  return clamp(
    seconds * 1000,
    6000,
    18000
  );

}


/* =========================================================
   ANIMATE CROSSFADER
========================================================= */

function animateCrossfade(
  start,
  end,
  duration,
  token
) {

  return new Promise(
    resolve => {

      const startTime =
        performance.now();


      function frame(now) {

        if (
          token !==
          state.transitionToken
        ) {

          resolve();

          return;

        }


        const elapsed =
          now -
          startTime;


        const progress =
          clamp(
            elapsed /
              duration,
            0,
            1
          );


        const eased =
          progress < .5
            ? 2 *
              progress *
              progress
            : 1 -
              Math.pow(
                -2 *
                  progress +
                  2,
                2
              ) /
                2;


        const value =
          start +
          (
            end -
            start
          ) *
          eased;


        updateCrossfader(
          value
        );


        if (
          progress >= 1
        ) {

          resolve();

          return;

        }


        requestAnimationFrame(
          frame
        );

      }


      requestAnimationFrame(
        frame
      );

    }
  );

}


/* =========================================================
   SYNC BPM
========================================================= */

function syncIncomingBPM(
  outgoing,
  incoming
) {

  if (
    !outgoing ||
    !incoming
  ) {

    return;

  }


  const outBpm =
    outgoing.analysis.bpm;


  const inBpm =
    incoming.analysis.bpm;


  if (
    !outBpm ||
    !inBpm ||
    !incoming.audio
  ) {

    return;

  }


  let ratio =
    outBpm /
    inBpm;


  ratio =
    clamp(
      ratio,
      .92,
      1.08
    );


  incoming.audio.playbackRate =
    ratio;

}


/* =========================================================
   CHOOSE NEXT
========================================================= */

async function chooseNextTrack(
  outgoing
) {

  const candidates =
    state.library.filter(
      track =>
        !outgoing.file ||
        track.id !==
          outgoing.file.id
    );


  if (!candidates.length) {

    return null;

  }


  const scored =
    candidates
      .map(
        track => ({

          track,

          score:
            compatibilityScore(
              outgoing.analysis,
              track.analysis,
              outgoing.file,
              track
            )

        })
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );


  return (
    scored[0]?.track ||
    candidates[0]
  );

}


/* =========================================================
   PRELOAD NEXT
========================================================= */

async function preloadNextForAutoDJ() {

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
    !active ||
    !active.file
  ) {

    return;

  }


  if (
    target.file &&
    target.preparedFor &&
    target.preparedFor.id ===
      active.file.id
  ) {

    return;

  }


  const next =
    await chooseNextTrack(
      active
    );


  if (!next) {

    return;

  }


  await loadTrackSmart(
    next,
    targetLetter
  );


  target.preparedFor =
    active.file;


  updateSmartReason(
    `AUTO DJ: siguiente preparada en DECK ${targetLetter} → ${next.name}`
  );

}


/* =========================================================
   AUTO DJ
========================================================= */

async function toggleAutoDJ() {

  state.autoDJ =
    !state.autoDJ;


  const button =
    $("autoDJButton");


  if (button) {

    button.classList.toggle(
      "active",
      state.autoDJ
    );

  }


  const stateLabel =
    $("autoState");


  if (stateLabel) {

    stateLabel.textContent =
      state.autoDJ
        ? "SMART AUTO DJ"
        : "MANUAL";

  }


  if (state.autoDJ) {

    const ready =
      await initAudioEngine();


    if (!ready) {

      state.autoDJ =
        false;

      return;

    }


    await preloadNextForAutoDJ();


    updateSmartReason(
      "SMART AUTO DJ ACTIVO — seleccionará, cargará y mezclará automáticamente."
    );


    startAutoDJ();

  } else {

    stopAutoDJ();


    updateSmartReason(
      "SMART AUTO DJ detenido. Crossfader disponible en modo manual."
    );

  }

}


/* =========================================================
   AUTO DJ LOOP
========================================================= */

function startAutoDJ() {

  stopAutoDJ();


  state.autoTimer =
    setInterval(
      autoDJTick,
      700
    );

}


function stopAutoDJ() {

  if (
    state.autoTimer
  ) {

    clearInterval(
      state.autoTimer
    );

    state.autoTimer =
      null;

  }

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


  const targetLetter =
    oppositeDeck(
      state.activeDeck
    );


  const target =
    state.decks[
      targetLetter
    ];


  if (
    !active ||
    !active.file ||
    active.audio.paused
  ) {

    return;

  }


  const duration =
    active.audio.duration;


  const current =
    active.audio.currentTime;


  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {

    return;

  }


  const remaining =
    duration -
    current;


  const bpm =
    active.analysis.bpm ||
    120;


  const phraseSeconds =
    (
      active.analysis.phraseLength ||
      16
    ) *
    60 /
    bpm;


  const transitionWindow =
    clamp(
      phraseSeconds * 1.5,
      12,
      35
    );


  /* =========================================
     BUSCAR Y CARGAR SIGUIENTE
  ========================================== */

  if (
    !target.file ||
    (
      target.preparedFor &&
      target.preparedFor.id !==
        active.file.id
    )
  ) {

    await preloadNextForAutoDJ();

  }


  /* =========================================
     INICIAR MEZCLA
  ========================================== */

  if (
    remaining <=
    transitionWindow
  ) {

    await transitionTo(
      targetLetter
    );

  }

}


/* =========================================================
   TRACK ENDED
========================================================= */

async function handleTrackEnded(
  letter
) {

  const deck =
    state.decks[letter];


  if (
    !deck
  ) {

    return;

  }


  deck.playing =
    false;


  if (
    state.autoDJ &&
    state.activeDeck ===
      letter
  ) {

    const targetLetter =
      oppositeDeck(
        letter
      );


    const target =
      state.decks[
        targetLetter
      ];


    if (
      target.file
    ) {

      state.crossPosition =
        targetLetter === "A"
          ? 0
          : 1;


      updateCrossfader(
        state.crossPosition
      );


      state.activeDeck =
        targetLetter;


      updateActiveDeckUI();


      await preloadNextForAutoDJ();

    }

  }


  updateDeckUI(
    letter
  );

}


/* =========================================================
   UPDATE DECK UI
========================================================= */

function updateDeckUI(
  letter
) {

  const deck =
    state.decks[letter];


  if (!deck) {

    return;

  }


  const status =
    $(
      letter === "A"
        ? "statusA"
        : "statusB"
    );


  const track =
    $(
      letter === "A"
        ? "trackA"
        : "trackB"
    );


  const bpm =
    $(
      letter === "A"
        ? "bpmA"
        : "bpmB"
    );


  const key =
    $(
      letter === "A"
        ? "keyA"
        : "keyB"
    );


  const camelot =
    $(
      letter === "A"
        ? "camelotA"
        : "camelotB"
    );


  const energy =
    $(
      letter === "A"
        ? "energyA"
        : "energyB"
    );


  const platter =
    $(
      letter === "A"
        ? "platterA"
        : "platterB"
    );


  if (track) {

    track.textContent =
      deck.file
        ? deck.file.name
        : "Sin canción";

  }


  if (bpm) {

    bpm.textContent =
      deck.analysis.bpm
        ? Math.round(
            deck.analysis.bpm
          )
        : "--";

  }


  if (key) {

    key.textContent =
      deck.analysis.key ||
      "--";

  }


  if (camelot) {

    camelot.textContent =
      deck.analysis.camelot ||
      "--";

  }


  if (energy) {

    energy.textContent =
      deck.analysis.energy
        ? Math.round(
            deck.analysis.energy *
              100
          )
        : "--";

  }


  if (status) {

    if (!deck.file) {

      status.textContent =
        "VACÍO";

    } else if (
      deck.audio &&
      !deck.audio.paused
    ) {

      status.textContent =
        "PLAYING";

    } else {

      status.textContent =
        "READY";

    }

  }


  if (platter) {

    platter.classList.toggle(
      "spinning",
      Boolean(
        deck.audio &&
        !deck.audio.paused
      )
    );

  }

}


/* =========================================================
   ACTIVE DECK UI
========================================================= */

function updateActiveDeckUI() {

  const panelA =
    $("deckPanelA");

  const panelB =
    $("deckPanelB");


  if (panelA) {

    panelA.classList.toggle(
      "active",
      state.activeDeck === "A"
    );

  }


  if (panelB) {

    panelB.classList.toggle(
      "active",
      state.activeDeck === "B"
    );

  }


  const lightA =
    $("channelLightA");

  const lightB =
    $("channelLightB");


  if (lightA) {

    lightA.classList.toggle(
      "active",
      state.activeDeck === "A"
    );

  }


  if (lightB) {

    lightB.classList.toggle(
      "active",
      state.activeDeck === "B"
    );

  }


  const nextDeck =
    $("nextDeck");


  if (nextDeck) {

    nextDeck.textContent =
      `SIGUIENTE: ${oppositeDeck(
        state.activeDeck
      )}`;

  }


  updateMediaStatus();

}


/* =========================================================
   MEDIA STATUS
========================================================= */

function updateMediaStatus() {

  const active =
    state.decks[
      state.activeDeck
    ];


  const status =
    $("mediaStatus");


  if (!status) {

    return;

  }


  if (!active || !active.file) {

    status.textContent =
      "SISTEMA DJ EN ESPERA";

    return;

  }


  status.textContent =
    `${state.activeDeck} • ${active.file.name}`;

}


/* =========================================================
   VIDEO
========================================================= */

function updateVideo(
  track
) {

  const video =
    $("videoScreen");


  const visualizer =
    $("visualizer");


  if (
    !video ||
    !track
  ) {

    return;

  }


  const isVideo =
    track.file.type.startsWith(
      "video/"
    );


  if (!isVideo) {

    video.pause();

    video.removeAttribute(
      "src"
    );

    video.style.display =
      "none";


    if (visualizer) {

      visualizer.style.display =
        "flex";

    }

    return;

  }


  try {

    video.src =
      track.url;

    video.style.display =
      "block";


    if (visualizer) {

      visualizer.style.display =
        "none";

    }


    video.play()
      .catch(
        () => {}
      );

  } catch (error) {

    console.warn(
      "Video error:",
      error
    );

  }

}


/* =========================================================
   SMART PANEL
========================================================= */

function updateSmartPanel(
  analysis,
  compatibility = null
) {

  if (!analysis) {

    return;

  }


  const bpm =
    $("smartBpm");

  const key =
    $("smartKey");

  const camelot =
    $("smartCamelot");

  const energy =
    $("smartEnergy");

  const compatible =
    $("smartCompatibility");


  if (bpm) {

    bpm.textContent =
      analysis.bpm
        ? Math.round(
            analysis.bpm
          )
        : "--";

  }


  if (key) {

    key.textContent =
      analysis.key ||
      "--";

  }


  if (camelot) {

    camelot.textContent =
      analysis.camelot ||
      "--";

  }


  if (energy) {

    energy.textContent =
      analysis.energy
        ? Math.round(
            analysis.energy *
              100
          )
        : "--";

  }


  if (
    compatible &&
    compatibility !== null
  ) {

    compatible.textContent =
      `${Math.round(
        compatibility
      )}%`;

  }

}


/* =========================================================
   SMART REASON
========================================================= */

function updateSmartReason(
  text
) {

  const element =
    $("smartReason");


  if (element) {

    element.textContent =
      text;

  }

}


/* =========================================================
   ENGINE STATUS
========================================================= */

function updateEngineStatus(
  text,
  active = false
) {

  const element =
    $("engineStatus");


  if (!element) {

    return;

  }


  element.textContent =
    text;


  element.style.color =
    active
      ? "var(--green)"
      : "var(--orange)";

}


/* =========================================================
   LIBRARY ANALYSIS
========================================================= */

async function analyzeLibrary() {

  if (
    !state.library.length
  ) {

    updateSmartReason(
      "No hay canciones para analizar."
    );

    return;

  }


  updateSmartReason(
    "SMART DJ: analizando biblioteca..."
  );


  for (
    let i = 0;
    i < state.library.length;
    i++
  ) {

    const track =
      state.library[i];


    try {

      track.analysis =
        await analyzeAudioFile(
          track.file
        );

    } catch (error) {

      console.warn(
        "Analysis error:",
        track.name,
        error
      );

      track.analysis =
        createFallbackAnalysis();

    }


    renderLibrary();


    updateSmartReason(
      `Analizando ${i + 1}/${state.library.length}: ${track.name}`
    );


    await sleep(30);

  }


  updateSmartReason(
    "SMART DJ: análisis completo. La biblioteca está lista para Auto DJ."
  );

}


/* =========================================================
   AUDIO ANALYSIS
========================================================= */

async function analyzeAudioFile(
  file
) {

  const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;


  if (!AudioContextClass) {

    return createFallbackAnalysis();

  }


  const context =
    new AudioContextClass();


  try {

    const buffer =
      await file.arrayBuffer();


    const audioBuffer =
      await context.decodeAudioData(
        buffer.slice(0)
      );


    const channel =
      audioBuffer
        .getChannelData(0);


    const sampleRate =
      audioBuffer.sampleRate;


    const duration =
      audioBuffer.duration;


    const energy =
      calculateEnergy(
        channel
      );


    const bpm =
      detectBPM(
        channel,
        sampleRate
      );


    const key =
      estimateKey(
        channel,
        sampleRate
      );


    const camelot =
      keyToCamelot(
        key
      );


    const phraseLength =
      choosePhraseLength(
        bpm,
        duration
      );


    return {

      bpm,

      key,

      camelot,

      energy,

      phraseLength,

      confidence:
        bpm
          ? .65
          : .2

    };

  } catch (error) {

    console.warn(
      "Decode failed:",
      error
    );

    return createFallbackAnalysis();

  } finally {

    try {

      await context.close();

    } catch (_) {}

  }

}


/* =========================================================
   FALLBACK ANALYSIS
========================================================= */

function createFallbackAnalysis() {

  return {

    bpm: 120,

    key: "C",

    camelot: "8B",

    energy: .5,

    phraseLength: 16,

    confidence: .1

  };

}


/* =========================================================
   ENERGY
========================================================= */

function calculateEnergy(
  data
) {

  if (
    !data ||
    !data.length
  ) {

    return .5;

  }


  const maxSamples =
    Math.min(
      data.length,
      150000
    );


  const step =
    Math.max(
      1,
      Math.floor(
        data.length /
        maxSamples
      )
    );


  let sum = 0;

  let count = 0;


  for (
    let i = 0;
    i < data.length;
    i += step
  ) {

    const value =
      data[i];


    sum +=
      value *
      value;


    count++;

  }


  const rms =
    Math.sqrt(
      sum /
      Math.max(
        count,
        1
      )
    );


  return clamp(
    rms * 3.5,
    0,
    1
  );

}


/* =========================================================
   BPM
========================================================= */

function detectBPM(
  data,
  sampleRate
) {

  if (
    !data ||
    !data.length
  ) {

    return 120;

  }


  /*
     Análisis rápido de envolvente.
     Se utiliza una ventana reducida para
     que el navegador pueda procesar archivos
     grandes sin congelar la interfaz.
  */


  const targetRate =
    11025;


  const ratio =
    sampleRate /
    targetRate;


  const step =
    Math.max(
      1,
      Math.floor(
        ratio
      )
    );


  const envelope = [];


  let previous =
    0;


  const frameSize =
    Math.max(
      128,
      Math.floor(
        targetRate *
        .02
      )
    );


  for (
    let i = 0;
    i < data.length;
    i +=
      frameSize * step
  ) {

    let sum = 0;

    let count = 0;


    for (
      let j = 0;
      j < frameSize;
      j++
    ) {

      const index =
        i +
        j * step;


      if (
        index >=
        data.length
      ) {

        break;

      }


      const value =
        Math.abs(
          data[index]
        );


      sum += value;

      count++;

    }


    const average =
      count
        ? sum / count
        : 0;


    const onset =
      Math.max(
        0,
        average -
          previous
      );


    envelope.push(
      onset
    );


    previous =
      average;

  }


  if (
    envelope.length < 20
  ) {

    return 120;

  }


  const minBPM =
    70;


  const maxBPM =
    180;


  const sampleInterval =
    .02;


  let bestBPM =
    120;


  let bestScore =
    -Infinity;


  for (
    let bpm = minBPM;
    bpm <= maxBPM;
    bpm++
  ) {

    const period =
      60 /
      bpm;


    const lag =
      Math.max(
        1,
        Math.round(
          period /
          sampleInterval
        )
      );


    let score = 0;


    for (
      let i = lag;
      i < envelope.length;
      i++
    ) {

      score +=
        envelope[i] *
        envelope[
          i - lag
        ];

    }


    if (
      score >
      bestScore
    ) {

      bestScore =
        score;

      bestBPM =
        bpm;

    }

  }


  /*
     Normaliza valores muy altos.
  */

  while (
    bestBPM > 160
  ) {

    bestBPM /=
      2;

  }


  while (
    bestBPM < 85
  ) {

    bestBPM *=
      2;

  }


  return Math.round(
    bestBPM
  );

}


/* =========================================================
   KEY ESTIMATION
========================================================= */

function estimateKey(
  data,
  sampleRate
) {

  if (
    !data ||
    !data.length
  ) {

    return "C";

  }


  /*
     Estimación espectral simplificada.
     No pretende sustituir software de análisis
     profesional dedicado, pero proporciona una
     tonalidad utilizable para Smart DJ.
  */


  const size =
    Math.min(
      16384,
      data.length
    );


  const start =
    Math.max(
      0,
      Math.floor(
        (
          data.length -
          size
        ) / 2
      )
    );


  const sample =
    data.slice(
      start,
      start + size
    );


  const chroma =
    new Array(12)
      .fill(0);


  const frequencies = [

    65.41,
    69.30,
    73.42,
    77.78,
    82.41,
    87.31,
    92.50,
    98.00,
    103.83,
    110.00,
    116.54,
    123.47

  ];


  for (
    let bin = 1;
    bin < sample.length / 2;
    bin++
  ) {

    const frequency =
      bin *
      sampleRate /
      sample.length;


    if (
      frequency < 60 ||
      frequency > 1500
    ) {

      continue;

    }


    const magnitude =
      Math.abs(
        sample[bin]
      );


    let nearest =
      0;


    let distance =
      Infinity;


    for (
      let note = 0;
      note < 12;
      note++
    ) {

      const ratio =
        frequency /
        frequencies[note];


      const semitone =
        12 *
        Math.log2(
          ratio
        );


      const nearestSemitone =
        Math.round(
          semitone
        );


      const error =
        Math.abs(
          semitone -
          nearestSemitone
        );


      if (
        error <
        distance
      ) {

        distance =
          error;

        nearest =
          (
            note +
            nearestSemitone
          ) % 12;

        if (
          nearest < 0
        ) {

          nearest +=
            12;

        }

      }

    }


    chroma[nearest] +=
      magnitude;

  }


  let best =
    0;


  for (
    let i = 1;
    i < chroma.length;
    i++
  ) {

    if (
      chroma[i] >
      chroma[best]
    ) {

      best =
        i;

    }

  }


  const notes = [

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


  return (
    notes[best] ||
    "C"
  );

}


/* =========================================================
   KEY -> CAMELOT
========================================================= */

function keyToCamelot(
  key
) {

  const map = {

    "C": "8B",
    "C#": "3B",
    "D": "10B",
    "D#": "5B",
    "E": "12B",
    "F": "7B",
    "F#": "2B",
    "G": "9B",
    "G#": "4B",
    "A": "11B",
    "A#": "6B",
    "B": "1B"

  };


  return (
    map[key] ||
    "8B"
  );

}


/* =========================================================
   PHRASE LENGTH
========================================================= */

function choosePhraseLength(
  bpm,
  duration
) {

  if (
    !bpm ||
    !duration
  ) {

    return 16;

  }


  const bar =
    60 /
    bpm *
    4;


  const possible =
    Math.floor(
      duration /
      bar
    );


  if (
    possible >= 32
  ) {

    return 32;

  }


  return 16;

}


/* =========================================================
   UPDATE LIBRARY ANALYSIS
========================================================= */

function updateTrackAnalysis(
  track,
  analysis
) {

  if (!track) {

    return;

  }


  track.analysis =
    analysis;


  renderLibrary();

}


/* =========================================================
   VISUALIZER
========================================================= */

function startVisualizer() {

  if (
    state.animationFrame
  ) {

    return;

  }


  const bars =
    document.querySelectorAll(
      ".visualizer-bars span"
    );


  function animate() {

    if (
      state.analyser
    ) {

      const data =
        new Uint8Array(
          state.analyser.frequencyBinCount
        );


      state.analyser.getByteFrequencyData(
        data
      );


      bars.forEach(
        (bar, index) => {

          const source =
            data[
              Math.min(
                index * 3,
                data.length - 1
              )
            ] || 0;


          const height =
            15 +
            (
              source /
              255
            ) *
            130;


          bar.style.height =
            `${height}px`;

        }
      );

    }


    state.animationFrame =
      requestAnimationFrame(
        animate
      );

  }


  animate();

}


/* =========================================================
   MASTER METER
========================================================= */

function startMasterMeter() {

  const meter =
    $("masterMeter");


  if (!meter) {

    return;

  }


  function update() {

    let level = 0;


    if (
      state.analyser
    ) {

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


      level =
        clamp(
          average /
            170 *
            100,
          0,
          100
        );

    }


    meter.style.width =
      `${level}%`;


    requestAnimationFrame(
      update
    );

  }


  update();

}


/* =========================================================
   FULLSCREEN
========================================================= */

async function toggleFullscreen() {

  try {

    if (
      !document.fullscreenElement
    ) {

      if (
        document.documentElement
          .requestFullscreen
      ) {

        await document.documentElement
          .requestFullscreen();

      }

      document.body.classList.add(
        "fullscreen-mode"
      );

    } else {

      if (
        document.exitFullscreen
      ) {

        await document.exitFullscreen();

      }

      document.body.classList.remove(
        "fullscreen-mode"
      );

    }

  } catch (error) {

    console.warn(
      "Fullscreen:",
      error
    );

    /*
       Fallback visual para navegadores
       que no permiten Fullscreen API.
    */

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
   KEYBOARD
========================================================= */

function handleKeyboard(
  event
) {

  if (
    event.target &&
    (
      event.target.tagName ===
        "INPUT" ||
      event.target.tagName ===
        "SELECT" ||
      event.target.tagName ===
        "TEXTAREA"
    )
  ) {

    return;

  }


  if (
    event.code ===
    "Space"
  ) {

    event.preventDefault();

    toggleDeckPlay(
      state.activeDeck
    );

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

    smartNext();

  }


  if (
    event.key.toLowerCase() ===
    "a"
  ) {

    toggleAutoDJ();

  }

}


/* =========================================================
   SLEEP
========================================================= */

function sleep(
  ms
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


/* =========================================================
   PUBLIC API
========================================================= */

window.HCProDJ = {

  state,

  smartNext,

  transitionTo,

  toggleAutoDJ,

  loadTrackSmart,

  analyzeLibrary,

  initAudioEngine

};


/* =========================================================
   FIN
========================================================= */
