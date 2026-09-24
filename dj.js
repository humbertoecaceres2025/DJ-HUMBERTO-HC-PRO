"use strict";

/*
 HC PRO DJ HUMBERTO 3.1
 Motor principal:
 - Dual Deck
 - Web Audio
 - EQ
 - Filter
 - Echo
 - Flanger
 - Reverb
 - Visualizer
 - Smart DJ
 - Biblioteca
 - Auto DJ
 - Crossfader
 - Micrófono
 - Grabación
*/

document.addEventListener("DOMContentLoaded", () => {

  const $ = id => document.getElementById(id);

  const state = {
    started: false,
    active: "A",
    autoDJ: false,
    transition: "crossfade",
    library: [],
    history: [],
    smartQueue: [],
    recorder: null,
    recordingChunks: [],
    micStream: null,
    micSource: null,
    micGainNode: null,
    mediaRecorderReady: false,
    autoTransitionRunning: false
  };

  let audioCtx = null;
  let masterGain = null;
  let masterAnalyser = null;
  let recordDestination = null;

  const decks = {};

  function setStatus(message) {
    const el = $("systemMessage");
    if (el) el.textContent = message;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00";

    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);

    return String(m).padStart(2, "0") + ":" +
           String(s).padStart(2, "0");
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseFilename(filename) {

    let name = filename.replace(/\.[^/.]+$/, "");

    let artist = "DJ HUMBERTO";
    let title = name;

    if (name.includes(" - ")) {
      const parts = name.split(" - ");
      artist = parts.shift().trim() || artist;
      title = parts.join(" - ").trim() || title;
    }

    return {
      artist,
      title,
      genre: "General"
    };
  }


  /*
   --------------------------------------------------
   AUDIO ENGINE
   --------------------------------------------------
  */

  async function startAudioEngine() {

    if (audioCtx) {
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      return;
    }

    try {

      audioCtx = new (
        window.AudioContext ||
        window.webkitAudioContext
      )();

      masterGain = audioCtx.createGain();
      masterAnalyser = audioCtx.createAnalyser();

      masterAnalyser.fftSize = 2048;
      masterAnalyser.smoothingTimeConstant = .75;

      masterGain.gain.value =
        parseFloat($("masterVolume").value);

      recordDestination =
        audioCtx.createMediaStreamDestination();

      masterGain.connect(masterAnalyser);
      masterAnalyser.connect(audioCtx.destination);
      masterGain.connect(recordDestination);

      createDeck("A");
      createDeck("B");

      setStatus("MOTOR DE AUDIO ACTIVO");

    } catch (error) {

      console.error(error);
      setStatus("ERROR DE AUDIO: " + error.message);
    }
  }


  function createDeck(id) {

    const media = new Audio();

    media.preload = "metadata";
    media.crossOrigin = "anonymous";

    const source =
      audioCtx.createMediaElementSource(media);

    const inputGain = audioCtx.createGain();

    const low = audioCtx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 200;

    const mid = audioCtx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 1;

    const high = audioCtx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 6000;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 20000;
    filter.Q.value = .7;

    const delay = audioCtx.createDelay(2);
    const feedback = audioCtx.createGain();
    const delayWet = audioCtx.createGain();

    delay.delayTime.value = .28;
    feedback.gain.value = .25;
    delayWet.gain.value = 0;

    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(delayWet);

    const flangerDelay = audioCtx.createDelay(.1);
    const flangerWet = audioCtx.createGain();
    const flangerLFO = audioCtx.createOscillator();
    const flangerDepth = audioCtx.createGain();

    flangerDelay.delayTime.value = .005;
    flangerWet.gain.value = 0;
    flangerDepth.gain.value = .003;

    flangerLFO.frequency.value = .25;
    flangerLFO.connect(flangerDepth);
    flangerDepth.connect(flangerDelay.delayTime);
    flangerLFO.start();

    const convolver = audioCtx.createConvolver();
    const reverbWet = audioCtx.createGain();

    reverbWet.gain.value = 0;
    convolver.buffer = createImpulseResponse(1.8, 2.5);

    const channelGain = audioCtx.createGain();

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = .75;

    source.connect(inputGain);
    inputGain.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(filter);

    filter.connect(channelGain);

    filter.connect(delay);
    delayWet.connect(channelGain);

    filter.connect(flangerDelay);
    flangerDelay.connect(flangerWet);
    flangerWet.connect(channelGain);

    filter.connect(convolver);
    convolver.connect(reverbWet);
    reverbWet.connect(channelGain);

    channelGain.connect(analyser);
    analyser.connect(masterGain);

    decks[id] = {
      id,
      media,
      source,
      inputGain,
      low,
      mid,
      high,
      filter,
      delay,
      delayWet,
      flangerWet,
      flangerDelay,
      reverbWet,
      analyser,
      channelGain,
      file: null,
      url: null,
      libraryId: null,
      objectURL: null
    };

    media.addEventListener("loadedmetadata", () => {
      updateDeckDisplay(id);
    });

    media.addEventListener("timeupdate", () => {
      updateDeckDisplay(id);
      checkAutoDJ(id);
    });

    media.addEventListener("play", () => {
      updateVinyl(id, true);
      updateVideo(id);
    });

    media.addEventListener("pause", () => {
      updateVinyl(id, false);
    });

    media.addEventListener("ended", () => {
      updateVinyl(id, false);

      if (state.autoDJ) {
        startAutoTransition(id);
      }
    });

    media.addEventListener("error", () => {
      setStatus("No se pudo reproducir el archivo del Deck " + id);
    });
  }


  function createImpulseResponse(duration, decay) {

    const rate = audioCtx.sampleRate;
    const length = rate * duration;
    const impulse = audioCtx.createBuffer(
      2,
      length,
      rate
    );

    for (let channel = 0; channel < 2; channel++) {

      const data = impulse.getChannelData(channel);

      for (let i = 0; i < length; i++) {
        data[i] =
          (Math.random() * 2 - 1) *
          Math.pow(1 - i / length, decay);
      }
    }

    return impulse;
  }


  /*
   --------------------------------------------------
   FILE LOADING
   --------------------------------------------------
  */

  async function loadFileToDeck(id, file, libraryId = null) {

    if (!file) return;

    await startAudioEngine();

    const deck = decks[id];

    if (!deck) return;

    if (deck.objectURL) {
      URL.revokeObjectURL(deck.objectURL);
    }

    const url = URL.createObjectURL(file);

    deck.file = file;
    deck.objectURL = url;
    deck.libraryId = libraryId;

    deck.media.src = url;
    deck.media.load();

    const info = parseFilename(file.name);

    $(id.toLowerCase() + "Title").textContent =
      info.artist + " — " + info.title;

    $(id.toLowerCase() + "Bpm").textContent =
      "BPM --";

    setStatus(
      "CARGADO EN DECK " + id + ": " + file.name
    );

    state.active = id;

    updateActiveLabel();
    updateVideo(id);
  }


  /*
   --------------------------------------------------
   DECK CONTROLS
   --------------------------------------------------
  */

  async function playDeck(id) {

    await startAudioEngine();

    const deck = decks[id];

    if (!deck || !deck.media.src) {
      setStatus("Primero cargá un archivo en Deck " + id);
      return;
    }

    try {

      await deck.media.play();

      state.active = id;

      updateActiveLabel();
      updateNowPlaying(id);

      setStatus("REPRODUCIENDO DECK " + id);

    } catch (error) {

      console.error(error);
      setStatus("El navegador bloqueó la reproducción.");
    }
  }


  function pauseDeck(id) {

    const deck = decks[id];

    if (!deck) return;

    deck.media.pause();
    setStatus("PAUSA DECK " + id);
  }


  function stopDeck(id) {

    const deck = decks[id];

    if (!deck) return;

    deck.media.pause();
    deck.media.currentTime = 0;

    updateVinyl(id, false);

    setStatus("STOP DECK " + id);
  }


  function updateDeckDisplay(id) {

    const deck = decks[id];

    if (!deck) return;

    const prefix = id.toLowerCase();

    const duration = deck.media.duration || 0;
    const current = deck.media.currentTime || 0;

    const progress =
      duration > 0
        ? (current / duration) * 100
        : 0;

    const progressEl = $(prefix + "Progress");

    if (progressEl) {
      progressEl.value = progress;
    }

    const timeEl = $(prefix + "Time");

    if (timeEl) {
      timeEl.textContent =
        formatTime(current) +
        " / " +
        formatTime(duration);
    }
  }


  function updateVinyl(id, spinning) {

    const vinyl = $("vinyl" + id);

    if (!vinyl) return;

    vinyl.classList.toggle("spinning", spinning);
  }


  function updateNowPlaying(id) {

    const deck = decks[id];

    if (!deck || !deck.file) return;

    const info = parseFilename(deck.file.name);

    $("nowTitle").textContent =
      info.artist + " — " + info.title;

    $("smartCurrentTrack").textContent =
      info.artist + " — " + info.title;

    if (deck.libraryId) {

      const item =
        state.library.find(
          x => x.id === deck.libraryId
        );

      if (item) {
        updateSmartCurrent(item);
      }
    }
  }


  function updateActiveLabel() {

    $("activeDeckLabel").textContent =
      "DECK " + state.active + " ACTIVO";
  }


  function updateVideo(id) {

    const deck = decks[id];

    if (!deck || !deck.file) return;

    const video = $("videoPlayer");
    const placeholder = $("screenPlaceholder");

    if (deck.file.type.startsWith("video/")) {

      video.src = deck.objectURL;
      video.muted = true;
      video.currentTime = deck.media.currentTime;

      placeholder.style.display = "none";

    } else {

      video.removeAttribute("src");
      video.load();

      placeholder.style.display = "grid";
    }
  }


  /*
   --------------------------------------------------
   CONTROLS / EQ
   --------------------------------------------------
  */

  function connectControl(id, elementId, callback) {

    const element = $(elementId);

    if (!element) return;

    element.addEventListener("input", () => {
      callback(parseFloat(element.value));
    });
  }


  function setupDeckControls(id) {

    const prefix = id.toLowerCase();

    connectControl(
      id,
      prefix + "Gain",
      value => {
        if (decks[id]) {
          decks[id].inputGain.gain.value = value;
        }
      }
    );

    connectControl(
      id,
      prefix + "Pitch",
      value => {
        if (decks[id]) {
          decks[id].media.playbackRate = value;
        }
      }
    );

    connectControl(
      id,
      prefix + "Low",
      value => {
        if (decks[id]) {
          decks[id].low.gain.value = value;
        }
      }
    );

    connectControl(
      id,
      prefix + "Mid",
      value => {
        if (decks[id]) {
          decks[id].mid.gain.value = value;
        }
      }
    );

    connectControl(
      id,
      prefix + "High",
      value => {
        if (decks[id]) {
          decks[id].high.gain.value = value;
        }
      }
    );

    connectControl(
      id,
      prefix + "Filter",
      value => {

        if (!decks[id]) return;

        const min = 500;
        const max = 20000;

        decks[id].filter.frequency.value =
          min +
          (max - min) * value;
      }
    );
  }


  /*
   --------------------------------------------------
   CROSSFADER
   --------------------------------------------------
  */

  function updateCrossfader(value) {

    if (!decks.A || !decks.B) return;

    const angle = value * Math.PI / 2;

    decks.A.channelGain.gain.value =
      Math.cos(angle);

    decks.B.channelGain.gain.value =
      Math.sin(angle);
  }


  /*
   --------------------------------------------------
   EFFECTS
   --------------------------------------------------
  */

  function toggleFX(id, fx) {

    const deck = decks[id];

    if (!deck) return;

    if (fx === "echo") {

      const active =
        deck.delayWet.gain.value > 0;

      deck.delayWet.gain.value =
        active ? 0 : .35;

      setStatus(
        "ECHO " +
        (active ? "OFF" : "ON") +
        " — DECK " + id
      );
    }

    if (fx === "flanger") {

      const active =
        deck.flangerWet.gain.value > 0;

      deck.flangerWet.gain.value =
        active ? 0 : .35;

      setStatus(
        "FLANGER " +
        (active ? "OFF" : "ON") +
        " — DECK " + id
      );
    }

    if (fx === "reverb") {

      const active =
        deck.reverbWet.gain.value > 0;

      deck.reverbWet.gain.value =
        active ? 0 : .3;

      setStatus(
        "REVERB " +
        (active ? "OFF" : "ON") +
        " — DECK " + id
      );
    }
  }


  /*
   --------------------------------------------------
   SMART DJ
   --------------------------------------------------
  */

  function createLibraryItem(file) {

    const info = parseFilename(file.name);

    return {
      id:
        Date.now().toString(36) +
        Math.random().toString(36).slice(2),

      file,
      name: file.name,
      artist: info.artist,
      title: info.title,
      genre: info.genre,
      bpm: null,
      key: null,
      energy: null,
      analyzed: false
    };
  }


  function addFilesToLibrary(files) {

    let added = 0;

    Array.from(files).forEach(file => {

      if (!file.type.startsWith("audio/") &&
          !file.type.startsWith("video/")) {
        return;
      }

      const exists =
        state.library.some(
          item => item.name === file.name &&
                  item.file.size === file.size
        );

      if (!exists) {

        state.library.push(
          createLibraryItem(file)
        );

        added++;
      }
    });

    renderLibrary();

    setStatus(
      added +
      " tema(s) agregado(s) a la biblioteca"
    );
  }


  async function analyzeTrack(item) {

    if (!item || !item.file) return item;

    try {

      const buffer =
        await item.file.arrayBuffer();

      const decoded =
        await audioCtx.decodeAudioData(buffer.slice(0));

      const channel =
        decoded.getChannelData(0);

      item.energy =
        calculateEnergy(channel);

      item.bpm =
        estimateBPM(channel, decoded.sampleRate);

      item.key =
        estimateKey(decoded);

      item.analyzed = true;

    } catch (error) {

      console.warn(
        "No se pudo analizar:",
        item.name,
        error
      );

      item.energy = item.energy ?? 50;
      item.bpm = item.bpm ?? 120;
      item.key = item.key ?? "--";
      item.analyzed = true;
    }

    return item;
  }


  function calculateEnergy(data) {

    const maxSamples =
      Math.min(data.length, 500000);

    const step =
      Math.max(1, Math.floor(data.length / maxSamples));

    let sum = 0;
    let count = 0;

    for (
      let i = 0;
      i < data.length;
      i += step
    ) {

      const value = data[i];

      sum += value * value;
      count++;
    }

    const rms =
      Math.sqrt(sum / Math.max(1, count));

    return Math.max(
      1,
      Math.min(100, Math.round(rms * 220))
    );
  }


  function estimateBPM(data, sampleRate) {

    /*
      Estimación rápida.
      No pretende sustituir un análisis profesional.
    */

    const targetRate = 3000;

    const ratio =
      Math.max(
        1,
        Math.floor(sampleRate / targetRate)
      );

    const envelope = [];

    let accumulator = 0;
    let counter = 0;

    for (
      let i = 0;
      i < data.length;
      i += ratio
    ) {

      const value =
        Math.abs(data[i]);

      accumulator += value;
      counter++;

      if (counter >= 20) {

        envelope.push(
          accumulator / counter
        );

        accumulator = 0;
        counter = 0;
      }
    }

    if (envelope.length < 100) {
      return 120;
    }

    const minBPM = 70;
    const maxBPM = 180;

    const sampleRateEnvelope =
      sampleRate / ratio / 20;

    let bestBPM = 120;
    let bestScore = -Infinity;

    for (
      let bpm = minBPM;
      bpm <= maxBPM;
      bpm += 1
    ) {

      const period =
        sampleRateEnvelope * 60 / bpm;

      let score = 0;
      let count = 0;

      for (
        let i = Math.floor(period);
        i < envelope.length;
        i += Math.max(1, Math.floor(period))
      ) {

        score += envelope[i];
        count++;
      }

      score /= Math.max(1, count);

      if (score > bestScore) {
        bestScore = score;
        bestBPM = bpm;
      }
    }

    return bestBPM;
  }


  function estimateKey(buffer) {

    /*
      Estimación tonal simplificada.
      Se presenta como KEY estimada.
    */

    const data =
      buffer.getChannelData(0);

    const sampleRate =
      buffer.sampleRate;

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

    const testFrequencies = [
      261.63,
      277.18,
      293.66,
      311.13,
      329.63,
      349.23,
      369.99,
      392,
      415.30,
      440,
      466.16,
      493.88
    ];

    let bestIndex = 0;
    let bestPower = -Infinity;

    const maxSamples =
      Math.min(data.length, sampleRate * 8);

    const step =
      Math.max(
        1,
        Math.floor(data.length / maxSamples)
      );

    for (
      let n = 0;
      n < testFrequencies.length;
      n++
    ) {

      const freq =
        testFrequencies[n];

      const period =
        sampleRate / freq;

      let power = 0;

      for (
        let i = 0;
        i < data.length;
        i += step * 30
      ) {

        const angle =
          2 * Math.PI * i / period;

        power +=
          data[i] *
          Math.sin(angle);
      }

      if (Math.abs(power) > bestPower) {

        bestPower =
          Math.abs(power);

        bestIndex = n;
      }
    }

    return notes[bestIndex];
  }


  function updateSmartCurrent(item) {

    $("smartCurrentTrack").textContent =
      item.artist + " — " + item.title;

    $("smartCurrentBpm").textContent =
      item.bpm ? item.bpm : "--";

    $("smartCurrentKey").textContent =
      item.key || "--";

    $("smartCurrentEnergy").textContent =
      item.energy ? item.energy : "--";
  }


  function compatibility(current, candidate) {

    if (!current || !candidate) return 0;

    let bpmScore = 60;

    if (current.bpm && candidate.bpm) {

      let a = candidate.bpm;
      let b = current.bpm;

      while (a < b * .75) a *= 2;
      while (a > b * 1.5) a /= 2;

      const diff =
        Math.abs(a - b) / b;

      bpmScore =
        Math.max(
          0,
          100 - diff * 180
        );
    }

    let keyScore = 60;

    if (current.key && candidate.key) {

      const notes = [
        "C","C#","D","D#","E","F",
        "F#","G","G#","A","A#","B"
      ];

      const a =
        notes.indexOf(current.key);

      const b =
        notes.indexOf(candidate.key);

      if (a >= 0 && b >= 0) {

        const distance =
          Math.min(
            Math.abs(a - b),
            12 - Math.abs(a - b)
          );

        keyScore =
          Math.max(
            0,
            100 - distance * 17
          );
      }
    }

    let energyScore = 60;

    if (
      Number.isFinite(current.energy) &&
      Number.isFinite(candidate.energy)
    ) {

      energyScore =
        Math.max(
          0,
          100 -
          Math.abs(
            current.energy -
            candidate.energy
          ) * 2
        );
    }

    return Math.round(
      bpmScore * .40 +
      keyScore * .35 +
      energyScore * .25
    );
  }


  async function getCurrentLibraryItem() {

    const deck = decks[state.active];

    if (!deck || !deck.libraryId) {
      return null;
    }

    return state.library.find(
      item => item.id === deck.libraryId
    ) || null;
  }


  async function findBestNext() {

    if (!state.library.length) {

      setStatus("La biblioteca está vacía.");
      return;
    }

    await startAudioEngine();

    let current =
      await getCurrentLibraryItem();

    if (!current) {

      const activeDeck =
        decks[state.active];

      if (activeDeck && activeDeck.file) {

        current = createLibraryItem(
          activeDeck.file
        );

        current.bpm = 120;
        current.key = "C";
        current.energy = 50;
      }
    }

    if (!current) {

      setStatus(
        "Cargá primero un tema en un Deck."
      );

      return;
    }

    const candidates =
      state.library.filter(
        item =>
          item.id !== current.id &&
          !state.history.includes(item.id)
      );

    if (!candidates.length) {

      state.history = [];

      setStatus(
        "Se reinició el historial para continuar."
      );
    }

    const pool =
      candidates.length
        ? candidates
        : state.library.filter(
            item => item.id !== current.id
          );

    for (const item of pool) {

      if (!item.analyzed) {
        await analyzeTrack(item);
      }
    }

    let mode =
      $("smartMode").value;

    let best = null;

    let bestScore = -Infinity;

    pool.forEach(item => {

      let score =
        compatibility(current, item);

      if (mode === "build") {

        score +=
          ((item.energy || 50) -
           (current.energy || 50)) * .5;
      }

      if (mode === "peak") {

        score +=
          (item.energy || 50) * .35;
      }

      if (mode === "chill") {

        score +=
          (100 -
           (item.energy || 50)) * .35;
      }

      if (score > bestScore) {

        bestScore = score;
        best = item;
      }
    });

    if (!best) return;

    renderSmartResult(
      [best],
      current
    );

    return best;
  }


  function renderSmartResult(items, current) {

    const container =
      $("smartResults");

    container.innerHTML = "";

    items.forEach(item => {

      const score =
        compatibility(current, item);

      const card =
        document.createElement("div");

      card.className = "smart-card";

      card.innerHTML = `
        <div>
          <strong>${escapeHTML(item.artist)} — ${escapeHTML(item.title)}</strong>
          <br>
          <small>${escapeHTML(item.name)}</small>
        </div>

        <div>${item.bpm || "--"} BPM</div>
        <div>${item.key || "--"}</div>
        <div>ENERGY ${item.energy || "--"}</div>
        <div class="score">${score}%</div>
      `;

      const button =
        document.createElement("button");

      button.textContent =
        "PREPARAR B";

      button.addEventListener(
        "click",
        () => prepareLibraryItem("B", item)
      );

      card.appendChild(button);

      container.appendChild(card);
    });
  }


  async function prepareLibraryItem(id, item) {

    if (!item) return;

    await loadFileToDeck(
      id,
      item.file,
      item.id
    );

    if (decks[id] && item.bpm) {

      const currentDeck =
        decks[state.active];

      if (
        currentDeck &&
        currentDeck.media &&
        currentDeck.media.playbackRate
      ) {

        const sourceBPM =
          item.bpm;

        const targetBPM =
          getDeckBPM(currentDeck) || sourceBPM;

        const rate =
          Math.max(
            .92,
            Math.min(
              1.08,
              targetBPM / sourceBPM
            )
          );

        decks[id].media.playbackRate =
          rate;
      }
    }

    setStatus(
      "SIGUIENTE PREPARADO EN DECK " + id
    );
  }


  function getDeckBPM(deck) {

    if (!deck || !deck.libraryId) {
      return null;
    }

    const item =
      state.library.find(
        x => x.id === deck.libraryId
      );

    return item ? item.bpm : null;
  }


  async function analyzeLibrary() {

    await startAudioEngine();

    if (!state.library.length) {

      setStatus("No hay temas en la biblioteca.");
      return;
    }

    setStatus("ANALIZANDO BIBLIOTECA...");

    for (let i = 0; i < state.library.length; i++) {

      const item =
        state.library[i];

      if (!item.analyzed) {

        await analyzeTrack(item);

        renderLibrary();
      }
    }

    setStatus(
      "ANÁLISIS DE BIBLIOTECA TERMINADO"
    );
  }


  async function generateSmartPlaylist() {

    await startAudioEngine();

    if (!state.library.length) {

      setStatus("Agregá música primero.");
      return;
    }

    await analyzeLibrary();

    state.smartQueue = [];

    let current =
      await getCurrentLibraryItem();

    if (!current) {

      current =
        state.library[0];
    }

    const available =
      state.library.filter(
        item => item.id !== current.id
      );

    while (
      state.smartQueue.length <
        Math.min(10, available.length)
    ) {

      let best = null;
      let bestScore = -Infinity;

      available.forEach(item => {

        if (
          state.smartQueue.some(
            x => x.id === item.id
          )
        ) {
          return;
        }

        const score =
          compatibility(
            current,
            item
          );

        if (score > bestScore) {

          bestScore = score;
          best = item;
        }
      });

      if (!best) break;

      state.smartQueue.push(best);
      current = best;
    }

    renderQueue();

    setStatus(
      "SMART PLAYLIST GENERADA"
    );
  }


  function renderQueue() {

    const container =
      $("smartQueue");

    container.innerHTML = "";

    state.smartQueue.forEach(
      (item, index) => {

        const div =
          document.createElement("div");

        div.className = "library-row";

        div.innerHTML = `
          <span>${index + 1}</span>
          <span class="title">
            ${escapeHTML(item.artist)} — ${escapeHTML(item.title)}
          </span>
          <span>${item.bpm || "--"}</span>
          <span>${item.key || "--"}</span>
          <span>${item.energy || "--"}</span>
          <span>
            <button data-queue-id="${item.id}">
              CARGAR B
            </button>
          </span>
        `;

        div.querySelector("button")
          .addEventListener(
            "click",
            () => prepareLibraryItem("B", item)
          );

        container.appendChild(div);
      }
    );
  }


  /*
   --------------------------------------------------
   LIBRARY UI
   --------------------------------------------------
  */

  function renderLibrary() {

    const body =
      $("libraryBody");

    const search =
      $("librarySearch").value
        .toLowerCase()
        .trim();

    body.innerHTML = "";

    const visible =
      state.library.filter(item => {

        const text =
          (
            item.name +
            " " +
            item.artist +
            " " +
            item.title
          ).toLowerCase();

        return text.includes(search);
      });

    visible.forEach((item, index) => {

      const row =
        document.createElement("div");

      row.className = "library-row";

      row.innerHTML = `
        <span>${index + 1}</span>

        <span class="title">
          ${escapeHTML(item.artist)} — ${escapeHTML(item.title)}
        </span>

        <span>${item.bpm || "--"}</span>

        <span>${item.key || "--"}</span>

        <span>${item.energy || "--"}</span>

        <span>
          <button class="load-a">A</button>
          <button class="load-b">B</button>
        </span>
      `;

      row.querySelector(".load-a")
        .addEventListener(
          "click",
          () => prepareLibraryItem("A", item)
        );

      row.querySelector(".load-b")
        .addEventListener(
          "click",
          () => prepareLibraryItem("B", item)
        );

      body.appendChild(row);
    });

    $("libraryCount").textContent =
      state.library.length + " TEMAS";
  }


  /*
   --------------------------------------------------
   AUTO DJ
   --------------------------------------------------
  */

  async function prepareNextTrack() {

    const best =
      await findBestNext();

    if (!best) return;

    const inactive =
      state.active === "A"
        ? "B"
        : "A";

    await prepareLibraryItem(
      inactive,
      best
    );

    return best;
  }


  async function startAutoDJ() {

    if (state.autoDJ) {

      state.autoDJ = false;

      $("autoDJ").textContent =
        "AUTO DJ: OFF";

      $("autoDJ").classList.remove("active");

      setStatus("AUTO DJ DESACTIVADO");

      return;
    }

    await startAudioEngine();

    if (!decks.A.media.src &&
        !decks.B.media.src) {

      setStatus(
        "Cargá al menos un tema antes de activar AUTO DJ."
      );

      return;
    }

    state.autoDJ = true;

    $("autoDJ").textContent =
      "AUTO DJ: ON";

    $("autoDJ").classList.add("active");

    setStatus("AUTO DJ ACTIVADO");

    const activeDeck =
      decks[state.active];

    if (
      activeDeck &&
      activeDeck.media.paused
    ) {
      await playDeck(state.active);
    }

    await prepareNextTrack();
  }


  async function checkAutoDJ(id) {

    if (!state.autoDJ) return;

    if (state.autoTransitionRunning) return;

    const deck =
      decks[id];

    if (!deck ||
        deck.media.paused ||
        !Number.isFinite(deck.media.duration)) {
      return;
    }

    const remaining =
      deck.media.duration -
      deck.media.currentTime;

    if (remaining <= 12) {

      await startAutoTransition(id);
    }
  }


  async function startAutoTransition(fromId) {

    if (!state.autoDJ) return;

    if (state.autoTransitionRunning) return;

    state.autoTransitionRunning = true;

    const toId =
      fromId === "A" ? "B" : "A";

    const from =
      decks[fromId];

    const to =
      decks[toId];

    if (!to || !to.media.src) {

      await prepareNextTrack();
    }

    if (!to.media.src) {

      state.autoTransitionRunning = false;
      return;
    }

    try {

      await to.media.play();

    } catch (error) {

      console.warn(error);
      state.autoTransitionRunning = false;
      return;
    }

    const start =
      parseFloat($("crossfader").value);

    const target =
      toId === "B" ? 1 : 0;

    const duration = 10000;
    const startTime = performance.now();

    function animate(now) {

      const elapsed =
        now - startTime;

      const progress =
        Math.min(
          1,
          elapsed / duration
        );

      const eased =
        progress < .5
          ? 2 * progress * progress
          : 1 -
            Math.pow(
              -2 * progress + 2,
              2
            ) / 2;

      const value =
        start +
        (target - start) * eased;

      $("crossfader").value = value;

      updateCrossfader(value);

      if (progress < 1) {

        requestAnimationFrame(animate);

      } else {

        from.media.pause();

        state.active = toId;

        updateActiveLabel();
        updateNowPlaying(toId);
        updateVideo(toId);

        state.history.push(
          from.libraryId
        );

        if (state.history.length > 30) {
          state.history.shift();
        }

        state.autoTransitionRunning = false;

        prepareNextTrack();
      }
    }

    requestAnimationFrame(animate);
  }


  /*
   --------------------------------------------------
   MICROPHONE
   --------------------------------------------------
  */

  async function toggleMicrophone() {

    await startAudioEngine();

    if (state.micStream) {

      state.micStream
        .getTracks()
        .forEach(track => track.stop());

      state.micStream = null;

      if (state.micSource) {
        state.micSource.disconnect();
        state.micSource = null;
      }

      $("micToggle").textContent =
        "MIC: OFF";

      setStatus("MICRÓFONO DESACTIVADO");

      return;
    }

    try {

      const stream =
        await navigator.mediaDevices
          .getUserMedia({
            audio: true
          });

      state.micStream = stream;

      state.micSource =
        audioCtx.createMediaStreamSource(
          stream
        );

      state.micGainNode =
        audioCtx.createGain();

      state.micGainNode.gain.value =
        parseFloat(
          $("micGain").value
        );

      state.micSource.connect(
        state.micGainNode
      );

      state.micGainNode.connect(
        masterGain
      );

      $("micToggle").textContent =
        "MIC: ON";

      setStatus("MICRÓFONO ACTIVADO");

    } catch (error) {

      console.error(error);

      setStatus(
        "No se pudo acceder al micrófono."
      );
    }
  }


  /*
   --------------------------------------------------
   RECORDING
   --------------------------------------------------
  */

  function startRecording() {

    if (!recordDestination) {

      setStatus(
        "Iniciá primero el sistema de audio."
      );

      return;
    }

    if (
      !window.MediaRecorder
    ) {

      setStatus(
        "Este navegador no permite grabación WebM."
      );

      return;
    }

    state.recordingChunks = [];

    const mimeTypes = [
      "audio/webm;codecs=opus",
      "audio/webm"
    ];

    let mime = "";

    for (const type of mimeTypes) {

      if (
        MediaRecorder.isTypeSupported(type)
      ) {
        mime = type;
        break;
      }
    }

    try {

      state.recorder =
        new MediaRecorder(
          recordDestination.stream,
          mime ? { mimeType: mime } : undefined
        );

      state.recorder.ondataavailable =
        event => {

          if (event.data.size > 0) {
            state.recordingChunks.push(
              event.data
            );
          }
        };

      state.recorder.onstop =
        saveRecording;

      state.recorder.start();

      setStatus("GRABANDO MIX...");

    } catch (error) {

      console.error(error);

      setStatus(
        "No se pudo iniciar la grabación."
      );
    }
  }


  function stopRecording() {

    if (
      state.recorder &&
      state.recorder.state !== "inactive"
    ) {

      state.recorder.stop();

      setStatus(
        "PROCESANDO GRABACIÓN..."
      );
    }
  }


  function saveRecording() {

    const blob =
      new Blob(
        state.recordingChunks,
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
      "DJ-HUMBERTO-HC-PRO-MIX-" +
      Date.now() +
      ".webm";

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      2000
    );

    setStatus(
      "GRABACIÓN GUARDADA"
    );
  }


  /*
   --------------------------------------------------
   VISUALIZER
   --------------------------------------------------
  */

  function drawVisualizer() {

    const canvas =
      $("visualizer");

    const ctx =
      canvas.getContext("2d");

    const analyser =
      masterAnalyser;

    function resize() {

      const rect =
        canvas.getBoundingClientRect();

      canvas.width =
        Math.max(
          300,
          Math.floor(rect.width)
        );

      canvas.height =
        Math.max(
          80,
          Math.floor(rect.height)
        );
    }

    resize();

    window.addEventListener(
      "resize",
      resize
    );

    function render() {

      requestAnimationFrame(render);

      if (!analyser) return;

      const bufferLength =
        analyser.frequencyBinCount;

      const data =
        new Uint8Array(bufferLength);

      analyser.getByteFrequencyData(data);

      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      const bars = 80;

      const step =
        Math.floor(
          bufferLength / bars
        );

      const barWidth =
        canvas.width / bars;

      for (let i = 0; i < bars; i++) {

        const value =
          data[i * step] || 0;

        const height =
          (value / 255) *
          canvas.height;

        const x =
          i * barWidth;

        const y =
          canvas.height - height;

        const gradient =
          ctx.createLinearGradient(
            0,
            canvas.height,
            0,
            0
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
          "#ff6b00"
        );

        ctx.fillStyle =
          gradient;

        ctx.fillRect(
          x,
          y,
          Math.max(1, barWidth - 2),
          height
        );
      }

      updateMeters();
    }

    render();
  }


  function updateMeters() {

    ["A", "B"].forEach(id => {

      const deck =
        decks[id];

      if (!deck) return;

      const data =
        new Uint8Array(
          deck.analyser.frequencyBinCount
        );

      deck.analyser.getByteFrequencyData(
        data
      );

      let sum = 0;

      for (let i = 0; i < data.length; i++) {
        sum += data[i];
      }

      const avg =
        sum / Math.max(1, data.length);

      const level =
        Math.min(
          100,
          avg / 2.55
        );

      $("meter" + id).style.height =
        level + "%";
    });
  }


  /*
   --------------------------------------------------
   EVENTOS
   --------------------------------------------------
  */

  $("startAudioBtn").addEventListener(
    "click",
    async () => {

      await startAudioEngine();

      state.started = true;

      $("bootOverlay")
        .classList.add("hidden");

      $("app")
        .classList.remove("hidden");

      drawVisualizer();

      setStatus(
        "HC PRO DJ HUMBERTO 3.1 LISTO"
      );
    }
  );


  $("aLoad").addEventListener(
    "click",
    () => $("mediaA").click()
  );

  $("bLoad").addEventListener(
    "click",
    () => $("mediaB").click()
  );


  $("mediaA").addEventListener(
    "change",
    event => {

      const file =
        event.target.files[0];

      if (file) {
        loadFileToDeck("A", file);
      }
    }
  );


  $("mediaB").addEventListener(
    "change",
    event => {

      const file =
        event.target.files[0];

      if (file) {
        loadFileToDeck("B", file);
      }
    }
  );


  $("aPlay").addEventListener(
    "click",
    () => playDeck("A")
  );

  $("bPlay").addEventListener(
    "click",
    () => playDeck("B")
  );

  $("aPause").addEventListener(
    "click",
    () => pauseDeck("A")
  );

  $("bPause").addEventListener(
    "click",
    () => pauseDeck("B")
  );

  $("aStop").addEventListener(
    "click",
    () => stopDeck("A")
  );

  $("bStop").addEventListener(
    "click",
    () => stopDeck("B")
  );


  $("aProgress").addEventListener(
    "input",
    event => {

      const deck =
        decks.A;

      if (!deck) return;

      if (Number.isFinite(deck.media.duration)) {

        deck.media.currentTime =
          deck.media.duration *
          (parseFloat(event.target.value) / 100);
      }
    }
  );


  $("bProgress").addEventListener(
    "input",
    event => {

      const deck =
        decks.B;

      if (!deck) return;

      if (Number.isFinite(deck.media.duration)) {

        deck.media.currentTime =
          deck.media.duration *
          (parseFloat(event.target.value) / 100);
      }
    }
  );


  setupDeckControls("A");
  setupDeckControls("B");


  $("masterVolume").addEventListener(
    "input",
    event => {

      if (masterGain) {
        masterGain.gain.value =
          parseFloat(event.target.value);
      }
    }
  );


  $("crossfader").addEventListener(
    "input",
    event => {

      updateCrossfader(
        parseFloat(event.target.value)
      );
    }
  );


  $("transitionMode").addEventListener(
    "change",
    event => {

      state.transition =
        event.target.value;

      setStatus(
        "TRANSICIÓN: " +
        event.target.value.toUpperCase()
      );
    }
  );


  $("prepareNext").addEventListener(
    "click",
    prepareNextTrack
  );


  $("autoDJ").addEventListener(
    "click",
    startAutoDJ
  );


  $("micToggle").addEventListener(
    "click",
    toggleMicrophone
  );


  $("micGain").addEventListener(
    "input",
    event => {

      if (state.micGainNode) {

        state.micGainNode.gain.value =
          parseFloat(event.target.value);
      }
    }
  );


  $("recordStart").addEventListener(
    "click",
    startRecording
  );


  $("recordStop").addEventListener(
    "click",
    stopRecording
  );


  document
    .querySelectorAll("[data-fx]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          toggleFX(
            button.dataset.deck,
            button.dataset.fx
          );
        }
      );
    });


  $("libraryInput").addEventListener(
    "change",
    event => {

      addFilesToLibrary(
        event.target.files
      );

      event.target.value = "";
    }
  );


  $("folderInput").addEventListener(
    "change",
    event => {

      addFilesToLibrary(
        event.target.files
      );

      event.target.value = "";
    }
  );


  $("analyzeLibrary").addEventListener(
    "click",
    analyzeLibrary
  );


  $("smartAnalyze").addEventListener(
    "click",
    async () => {

      await startAudioEngine();

      const current =
        await getCurrentLibraryItem();

      if (!current) {

        setStatus(
          "El tema actual debe estar cargado desde la biblioteca."
        );

        return;
      }

      await analyzeTrack(current);

      updateSmartCurrent(current);
      renderLibrary();

      setStatus(
        "TEMA ACTUAL ANALIZADO"
      );
    }
  );


  $("findNext").addEventListener(
    "click",
    findBestNext
  );


  $("smartPlaylist").addEventListener(
    "click",
    generateSmartPlaylist
  );


  $("librarySearch").addEventListener(
    "input",
    renderLibrary
  );


  $("clearLibrary").addEventListener(
    "click",
    () => {

      state.library = [];
      state.history = [];
      state.smartQueue = [];

      renderLibrary();
      renderQueue();

      $("smartResults").innerHTML =
        '<div class="empty-state">No hay resultados todavía.</div>';

      setStatus(
        "BIBLIOTECA LIMPIADA"
      );
    }
  );


  /*
   --------------------------------------------------
   KEYBOARD
   --------------------------------------------------
  */

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.target.tagName === "INPUT" ||
        event.target.tagName === "SELECT"
      ) {
        return;
      }

      if (event.code === "Space") {

        event.preventDefault();

        const deck =
          decks[state.active];

        if (!deck) return;

        if (deck.media.paused) {
          playDeck(state.active);
        } else {
          pauseDeck(state.active);
        }
      }

      if (event.key === "1") {
        playDeck("A");
      }

      if (event.key === "2") {
        playDeck("B");
      }

      if (event.key.toLowerCase() === "r") {

        if (
          state.recorder &&
          state.recorder.state === "recording"
        ) {
          stopRecording();
        } else {
          startRecording();
        }
      }

      if (event.key === "ArrowLeft") {

        const current =
          parseFloat(
            $("crossfader").value
          );

        const next =
          Math.max(0, current - .05);

        $("crossfader").value = next;
        updateCrossfader(next);
      }

      if (event.key === "ArrowRight") {

        const current =
          parseFloat(
            $("crossfader").value
          );

        const next =
          Math.min(1, current + .05);

        $("crossfader").value = next;
        updateCrossfader(next);
      }
    }
  );


  /*
   --------------------------------------------------
   VIDEO SYNC
   --------------------------------------------------
  */

  $("videoPlayer").addEventListener(
    "loadedmetadata",
    () => {

      const deck =
        decks[state.active];

      if (!deck) return;

      try {
        $("videoPlayer").currentTime =
          deck.media.currentTime;
      } catch (_) {}
    }
  );


  setInterval(
    () => {

      const deck =
        decks[state.active];

      if (!deck) return;

      const video =
        $("videoPlayer");

      if (
        video.src &&
        !video.paused &&
        Math.abs(
          video.currentTime -
          deck.media.currentTime
        ) > .4
      ) {

        try {
          video.currentTime =
            deck.media.currentTime;
        } catch (_) {}
      }

    },
    500
  );


  /*
   --------------------------------------------------
   INITIAL STATE
   --------------------------------------------------
  */

  renderLibrary();
  updateActiveLabel();

  console.log(
    "HC PRO DJ HUMBERTO 3.1 cargado correctamente."
  );

});
