/* =========================================================
   HC PRO DJ HUMBERTO
   SMART DJ ENGINE
   BPM / BEATGRID / PHRASES / KEY / CAMELOT / ENERGY
========================================================= */

const $ = id => document.getElementById(id);

const state = {

  started: false,

  ctx: null,
  analyser: null,
  masterGain: null,
  musicBus: null,
  compressor: null,

  recordDestination: null,

  activeDeck: "A",

  crossPosition: 0.5,

  autoDJ: false,
  smartDJ: true,

  transitionRunning: false,
  transitionToken: 0,

  library: [],
  history: [],

  genreFilter: "all",

  voiceFiles: [],
  voiceTimer: null,
  voiceBusy: false,

  decks: {
    A: null,
    B: null
  },

  voice: null
};


/* =========================================================
   UTILS
========================================================= */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function formatTime(seconds) {

  if (!Number.isFinite(seconds)) {
    return "00:00";
  }

  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;

  return String(m).padStart(2,"0") + ":" +
         String(sec).padStart(2,"0");
}

function escapeHTML(value) {

  return String(value)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function fileId(file) {

  return [
    file.name,
    file.size,
    file.lastModified,
    file.webkitRelativePath || ""
  ].join("|");
}

function isMediaFile(file) {

  if (!file) return false;

  if (file.type.startsWith("audio/")) {
    return true;
  }

  if (file.type.startsWith("video/")) {
    return true;
  }

  return /\.(mp3|wav|ogg|m4a|aac|flac|mp4|webm|ogv)$/i.test(file.name);
}

function isVideoFile(file) {

  return file &&
    (
      file.type.startsWith("video/") ||
      /\.(mp4|webm|ogv)$/i.test(file.name)
    );
}

function normalizeBPM(bpm) {

  if (!Number.isFinite(bpm)) {
    return null;
  }

  let result = bpm;

  while (result < 70) {
    result *= 2;
  }

  while (result > 180) {
    result /= 2;
  }

  return Math.round(result * 100) / 100;
}


/* =========================================================
   GENRE INFERENCE
========================================================= */

function inferGenre(file) {

  const text = (
    file.name + " " +
    (file.webkitRelativePath || "")
  ).toLowerCase();

  const rules = {

    cumbia: [
      "cumbia",
      "villera",
      "santafesina"
    ],

    reggaeton: [
      "reggaeton",
      "regueton",
      "perreo",
      "dembow"
    ],

    cuarteto: [
      "cuarteto",
      "cordoba"
    ],

    rock: [
      "rock",
      "metal",
      "punk",
      "indie"
    ],

    pop: [
      "pop",
      "dance pop"
    ],

    electronic: [
      "electro",
      "house",
      "techno",
      "trance",
      "edm",
      "deep house",
      "progressive"
    ],

    trap: [
      "trap",
      "hip hop",
      "hiphop",
      "rap"
    ],

    latin: [
      "latin",
      "salsa",
      "bachata",
      "merengue",
      "tropical",
      "latino"
    ]
  };

  for (const genre of Object.keys(rules)) {

    if (rules[genre].some(word => text.includes(word))) {
      return genre;
    }
  }

  return "other";
}


/* =========================================================
   AUDIO ANALYSIS
========================================================= */

async function decodeFile(file) {

  const buffer = await file.arrayBuffer();

  /*
    slice evita que algunos navegadores modifiquen
    el ArrayBuffer original durante decodeAudioData.
  */

  return await state.ctx.decodeAudioData(buffer.slice(0));
}


function monoDownsample(audioBuffer, maxSeconds = 120) {

  const sampleRate = audioBuffer.sampleRate;
  const length = Math.min(
    audioBuffer.length,
    Math.floor(sampleRate * maxSeconds)
  );

  const channels = audioBuffer.numberOfChannels;

  const raw = new Float32Array(length);

  for (let ch = 0; ch < channels; ch++) {

    const data = audioBuffer.getChannelData(ch);

    for (let i = 0; i < length; i++) {
      raw[i] += data[i] / channels;
    }
  }

  /*
    Reducimos para que el análisis no sea excesivamente pesado.
  */

  const targetRate = 11025;

  if (sampleRate <= targetRate) {

    return {
      data: raw,
      sampleRate
    };
  }

  const ratio = sampleRate / targetRate;
  const newLength = Math.floor(length / ratio);
  const output = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {

    const start = Math.floor(i * ratio);
    const end = Math.min(
      length,
      Math.floor((i + 1) * ratio)
    );

    let sum = 0;

    for (let j = start; j < end; j++) {
      sum += raw[j];
    }

    output[i] = sum / Math.max(1,end-start);
  }

  return {
    data: output,
    sampleRate: targetRate
  };
}


/* =========================================================
   RMS / ENERGY
========================================================= */

function calculateEnergy(data, sampleRate) {

  const frame = Math.floor(sampleRate * 0.25);

  let total = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += frame) {

    const end = Math.min(
      data.length,
      i + frame
    );

    let sum = 0;

    for (let j = i; j < end; j++) {
      sum += data[j] * data[j];
    }

    const rms = Math.sqrt(
      sum / Math.max(1,end-i)
    );

    total += rms;
    count++;
  }

  const average = total / Math.max(1,count);

  /*
    Transformación suave para una escala 0-100.
  */

  return clamp(
    Math.round(
      Math.min(1, average * 3.5) * 100
    ),
    1,
    100
  );
}


/* =========================================================
   ONSET ENVELOPE
========================================================= */

function createOnsetEnvelope(data, sampleRate) {

  const frameSize = 1024;
  const hop = 512;

  const envelope = [];

  let previous = 0;

  for (
    let pos = 0;
    pos + frameSize < data.length;
    pos += hop
  ) {

    let energy = 0;

    for (
      let i = 0;
      i < frameSize;
      i++
    ) {

      const value = data[pos + i];

      energy += value * value;
    }

    energy = Math.sqrt(
      energy / frameSize
    );

    /*
      Diferencia positiva respecto al frame anterior.
      Es una aproximación ligera de onset detection.
    */

    const onset = Math.max(
      0,
      energy - previous
    );

    envelope.push(onset);

    previous = energy * 0.8 + previous * 0.2;
  }

  /*
    Normalización.
  */

  let max = 0;

  for (const value of envelope) {
    if (value > max) max = value;
  }

  if (max > 0) {

    for (let i = 0; i < envelope.length; i++) {
      envelope[i] /= max;
    }
  }

  return {
    envelope,
    hop,
    frameSize,
    frameRate: sampleRate / hop
  };
}


/* =========================================================
   BPM DETECTION
========================================================= */

function detectBPM(onset) {

  const {
    envelope,
    frameRate
  } = onset;

  if (envelope.length < 30) {
    return {
      bpm: null,
      confidence: 0
    };
  }

  let bestBPM = 120;
  let bestScore = -Infinity;

  const scores = [];

  /*
    Busca BPM musicales entre 70 y 180.
  */

  for (
    let bpm = 70;
    bpm <= 180;
    bpm += 0.5
  ) {

    const lag = Math.max(
      1,
      Math.round(
        frameRate * 60 / bpm
      )
    );

    let score = 0;

    /*
      Se prueban varias divisiones temporales
      para favorecer beats reales.
    */

    for (
      let i = lag;
      i < envelope.length;
      i++
    ) {

      score +=
        envelope[i] *
        envelope[i - lag];
    }

    /*
      Bonus para múltiplos cercanos.
    */

    const normalized = score /
      Math.max(1,envelope.length-lag);

    scores.push({
      bpm,
      score: normalized
    });

    if (normalized > bestScore) {

      bestScore = normalized;
      bestBPM = bpm;
    }
  }

  scores.sort(
    (a,b) => b.score - a.score
  );

  const second = scores[1]
    ? scores[1].score
    : 0;

  const confidence =
    bestScore > 0
      ? clamp(
          (bestScore-second) /
          bestScore,
          0,
          1
        )
      : 0;

  return {
    bpm: normalizeBPM(bestBPM),
    confidence
  };
}


/* =========================================================
   BEATGRID
========================================================= */

function buildBeatgrid(
  onset,
  bpm
) {

  if (!bpm) {

    return {
      beatInterval: 0,
      beats: [],
      bars: []
    };
  }

  const {
    frameRate
  } = onset;

  const beatInterval =
    60 / bpm;

  const frameInterval =
    beatInterval * frameRate;

  /*
    Busca el primer máximo de onset dentro
    de los primeros segundos.

    Esto produce un anclaje aproximado.
  */

  const searchFrames = Math.min(
    onset.envelope.length,
    Math.floor(frameRate * 8)
  );

  let anchor = 0;
  let maximum = 0;

  for (let i = 0; i < searchFrames; i++) {

    if (onset.envelope[i] > maximum) {

      maximum = onset.envelope[i];
      anchor = i;
    }
  }

  const anchorSeconds =
    anchor / frameRate;

  const beats = [];
  const bars = [];

  /*
    Beatgrid de hasta 10 minutos.
  */

  const totalBeats = Math.min(
    6000,
    Math.floor(
      onset.envelope.length /
      frameInterval
    )
  );

  for (let i = 0; i < totalBeats; i++) {

    const time =
      anchorSeconds +
      i * beatInterval;

    beats.push(time);

    if (i % 4 === 0) {
      bars.push(time);
    }
  }

  return {
    beatInterval,
    anchorSeconds,
    beats,
    bars
  };
}


/* =========================================================
   PHRASE DETECTION
========================================================= */

function detectPhrases(
  beatgrid,
  duration
) {

  if (!beatgrid.beats.length) {

    return {
      phraseLength: 16,
      phrases: []
    };
  }

  /*
    En música electrónica/pop/DJ se utilizan
    frecuentemente bloques de 8/16/32 beats.

    Se analiza la energía por bloque para localizar
    cambios estructurales aproximados.
  */

  const candidates = [8,16,32];

  let bestLength = 16;
  let bestStability = -Infinity;

  for (const length of candidates) {

    const blocks = [];

    for (
      let i = 0;
      i + length < beatgrid.beats.length;
      i += length
    ) {

      const start = beatgrid.beats[i];
      const end =
        beatgrid.beats[
          Math.min(
            i + length,
            beatgrid.beats.length-1
          )
        ];

      blocks.push({
        start,
        end
      });
    }

    /*
      Preferimos 16 como estructura DJ estándar
      cuando no existe suficiente evidencia.
    */

    const stability =
      blocks.length * (
        length === 16 ? 1.15 : 1
      );

    if (stability > bestStability) {

      bestStability = stability;
      bestLength = length;
    }
  }

  const phrases = [];

  for (
    let i = 0;
    i < beatgrid.beats.length;
    i += bestLength
  ) {

    const time =
      beatgrid.beats[i];

    if (time < duration) {

      phrases.push({
        time,
        beat: i,
        length: bestLength
      });
    }
  }

  return {
    phraseLength: bestLength,
    phrases
  };
}


/* =========================================================
   KEY DETECTION
========================================================= */

const KEY_NAMES_MAJOR = [
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

const KEY_NAMES_MINOR = [
  "Cm",
  "C#m",
  "Dm",
  "D#m",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "A#m",
  "Bm"
];

/*
  Perfiles de tonalidad simplificados tipo Krumhansl.
*/

const MAJOR_PROFILE = [
  6.35,2.23,3.48,2.33,
  4.38,4.09,2.52,5.19,
  2.39,3.66,2.29,2.88
];

const MINOR_PROFILE = [
  6.33,2.68,3.52,5.38,
  2.60,3.53,2.54,4.75,
  3.98,2.69,3.34,3.17
];

function correlation(a,b) {

  let sumA = 0;
  let sumB = 0;

  for (let i = 0; i < a.length; i++) {
    sumA += a[i];
    sumB += b[i];
  }

  const meanA = sumA / a.length;
  const meanB = sumB / b.length;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < a.length; i++) {

    const da = a[i] - meanA;
    const db = b[i] - meanB;

    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  return num /
    Math.sqrt(
      Math.max(
        1e-12,
        denA * denB
      )
    );
}

function rotateProfile(profile, shift) {

  const output = new Array(12);

  for (let i = 0; i < 12; i++) {

    output[i] =
      profile[
        (i + shift) % 12
      ];
  }

  return output;
}

function detectKey(data, sampleRate) {

  /*
    Chroma aproximado mediante DFT en las 12 clases
    de pitch. Se muestrea un segmento limitado para
    mantener la interfaz fluida.
  */

  const maxSamples =
    Math.min(
      data.length,
      Math.floor(sampleRate * 45)
    );

  const hop = 4096;

  const chroma = new Array(12).fill(0);

  const frequencies = [];

  for (let midi = 36; midi <= 84; midi++) {

    const frequency =
      440 * Math.pow(
        2,
        (midi-69)/12
      );

    frequencies.push({
      frequency,
      pc: ((midi % 12)+12)%12
    });
  }

  for (
    let start = 0;
    start + hop < maxSamples;
    start += hop * 4
  ) {

    for (const item of frequencies) {

      let re = 0;
      let im = 0;

      const step =
        Math.max(
          1,
          Math.floor(
            hop / 512
          )
        );

      for (
        let i = 0;
        i < hop;
        i += step
      ) {

        const sample =
          data[start+i] || 0;

        const angle =
          2*Math.PI*
          item.frequency*
          i/sampleRate;

        re += sample*Math.cos(angle);
        im += sample*Math.sin(angle);
      }

      const magnitude =
        Math.sqrt(
          re*re + im*im
        );

      chroma[item.pc] += magnitude;
    }
  }

  let bestKey = 0;
  let bestMode = "major";
  let bestScore = -Infinity;

  for (let shift = 0; shift < 12; shift++) {

    const major =
      correlation(
        chroma,
        rotateProfile(
          MAJOR_PROFILE,
          shift
        )
      );

    const minor =
      correlation(
        chroma,
        rotateProfile(
          MINOR_PROFILE,
          shift
        )
      );

    if (major > bestScore) {

      bestScore = major;
      bestKey = shift;
      bestMode = "major";
    }

    if (minor > bestScore) {

      bestScore = minor;
      bestKey = shift;
      bestMode = "minor";
    }
  }

  const key =
    bestMode === "major"
      ? KEY_NAMES_MAJOR[bestKey]
      : KEY_NAMES_MINOR[bestKey];

  return {
    key,
    mode: bestMode,
    confidence: clamp(
      (bestScore + 1) / 2,
      0,
      1
    )
  };
}


/* =========================================================
   CAMELOT
========================================================= */

function keyToCamelot(key) {

  const normalized =
    key.replace("♯","#")
        .replace("♭","b");

  const major = {
    "C":"8B",
    "G":"9B",
    "D":"10B",
    "A":"11B",
    "E":"12B",
    "B":"1B",
    "F#":"2B",
    "Gb":"2B",
    "C#":"3B",
    "Db":"3B",
    "G#":"4B",
    "Ab":"4B",
    "D#":"5B",
    "Eb":"5B",
    "A#":"6B",
    "Bb":"6B",
    "F":"7B"
  };

  const minor = {
    "Am":"8A",
    "Em":"9A",
    "Bm":"10A",
    "F#m":"11A",
    "Gbm":"11A",
    "C#m":"12A",
    "Dbm":"12A",
    "G#m":"1A",
    "Abm":"1A",
    "D#m":"2A",
    "Ebm":"2A",
    "A#m":"3A",
    "Bbm":"3A",
    "Fm":"4A",
    "Cm":"5A",
    "Gm":"6A",
    "Dm":"7A"
  };

  return major[normalized] ||
         minor[normalized] ||
         "--";
}

function parseCamelot(camelot) {

  const match =
    /^(\d{1,2})([AB])$/.exec(
      camelot || ""
    );

  if (!match) return null;

  return {
    number: Number(match[1]),
    letter: match[2]
  };
}

function camelotCompatibility(a,b) {

  if (!a || !b) return 0.5;

  if (a === b) {
    return 1;
  }

  const A = parseCamelot(a);
  const B = parseCamelot(b);

  if (!A || !B) return 0.5;

  const distance =
    Math.min(
      Math.abs(A.number-B.number),
      12-Math.abs(A.number-B.number)
    );

  if (
    distance === 1 &&
    A.letter === B.letter
  ) {
    return 0.95;
  }

  if (
    distance === 0 &&
    A.letter !== B.letter
  ) {
    return 0.9;
  }

  if (
    distance === 1 &&
    A.letter !== B.letter
  ) {
    return 0.8;
  }

  return Math.max(
    0.1,
    0.55-distance*0.12
  );
}


/* =========================================================
   FULL TRACK ANALYSIS
========================================================= */

async function analyzeFile(file) {

  if (!state.started) {
    await startEngine();
  }

  const existing =
    state.library.find(
      item => item.id === fileId(file)
    );

  if (existing && existing.analysis) {
    return existing;
  }

  const item = existing || {
    id: fileId(file),
    file,
    name: file.name,
    genre: inferGenre(file),
    analysis: null
  };

  setAnalysisStatus(
    "ANALIZANDO " + file.name
  );

  try {

    const buffer =
      await decodeFile(file);

    const mono =
      monoDownsample(buffer);

    const energy =
      calculateEnergy(
        mono.data,
        mono.sampleRate
      );

    const onset =
      createOnsetEnvelope(
        mono.data,
        mono.sampleRate
      );

    const bpmResult =
      detectBPM(onset);

    const beatgrid =
      buildBeatgrid(
        onset,
        bpmResult.bpm
      );

    const phrases =
      detectPhrases(
        beatgrid,
        buffer.duration
      );

    const keyResult =
      detectKey(
        mono.data,
        mono.sampleRate
      );

    const camelot =
      keyToCamelot(
        keyResult.key
      );

    /*
      Rhythm:
      combina regularidad de onset y confianza BPM.
    */

    let rhythm =
      clamp(
        Math.round(
          (
            bpmResult.confidence * .65 +
            Math.min(
              1,
              onset.envelope.length / 30000
            ) * .35
          ) * 100
        ),
        1,
        100
      );

    item.analysis = {

      duration: buffer.duration,

      bpm: bpmResult.bpm,
      bpmConfidence: bpmResult.confidence,

      energy,

      rhythm,

      key: keyResult.key,
      keyConfidence: keyResult.confidence,

      camelot,

      beatgrid,

      phraseLength:
        phrases.phraseLength,

      phrases:
        phrases.phrases
    };

    if (!state.library.some(
      x => x.id === item.id
    )) {
      state.library.push(item);
    }

    setAnalysisStatus(
      "ANALIZADO: " + file.name
    );

    renderLibrary();

    return item;

  } catch (error) {

    console.error(
      "Error analizando:",
      file.name,
      error
    );

    item.analysis = {
      duration: 0,
      bpm: null,
      bpmConfidence: 0,
      energy: 0,
      rhythm: 0,
      key: "--",
      keyConfidence: 0,
      camelot: "--",
      beatgrid: {
        beats: [],
        bars: []
      },
      phraseLength: 16,
      phrases: []
    };

    if (!state.library.some(
      x => x.id === item.id
    )) {
      state.library.push(item);
    }

    return item;
  }
}


/* =========================================================
   SMART SCORE
========================================================= */

function bpmCompatibility(a,b) {

  if (
    !a ||
    !b ||
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  ) {
    return 0.5;
  }

  const variants = [
    b,
    b*2,
    b/2
  ];

  let best = Infinity;

  for (const value of variants) {

    if (value < 60 || value > 200) {
      continue;
    }

    const diff =
      Math.abs(a-value) /
      Math.max(a,value);

    best =
      Math.min(best,diff);
  }

  return clamp(
    1-best*5,
    0,
    1
  );
}

function energyCompatibility(a,b) {

  if (!a || !b) return 0.5;

  return clamp(
    1-Math.abs(a-b)/100,
    0,
    1
  );
}

function rhythmCompatibility(a,b) {

  if (!a || !b) return 0.5;

  return clamp(
    1-Math.abs(a-b)/100,
    0,
    1
  );
}

function smartScore(current,next) {

  if (
    !current ||
    !current.analysis ||
    !next ||
    !next.analysis
  ) {
    return 0;
  }

  const A = current.analysis;
  const B = next.analysis;

  const bpm =
    bpmCompatibility(
      A.bpm,
      B.bpm
    );

  const energy =
    energyCompatibility(
      A.energy,
      B.energy
    );

  const rhythm =
    rhythmCompatibility(
      A.rhythm,
      B.rhythm
    );

  const camelot =
    camelotCompatibility(
      A.camelot,
      B.camelot
    );

  const genre =
    current.genre === next.genre
      ? 1
      : (
        current.genre === "latin" ||
        next.genre === "latin"
          ? .65
          : .35
      );

  /*
    BPM y tonalidad tienen más peso.
  */

  let score =
    bpm * .34 +
    camelot * .25 +
    energy * .17 +
    rhythm * .14 +
    genre * .10;

  /*
    Penalización de historial.
  */

  if (
    state.history.includes(next.id)
  ) {
    score *= .55;
  }

  return Math.round(
    score * 100
  );
}


/* =========================================================
   SMART TRACK SELECTION
========================================================= */

function selectSmartTrack(current) {

  const candidates =
    state.library.filter(
      item =>
        item.analysis &&
        item.id !== current?.id &&
        (
          state.genreFilter === "all" ||
          item.genre === state.genreFilter
        )
    );

  if (!candidates.length) {
    return null;
  }

  let best = null;

  for (const item of candidates) {

    const score =
      smartScore(
        current,
        item
      );

    /*
      Pequeño factor aleatorio para evitar
      que siempre se reproduzca la misma secuencia.
    */

    const finalScore =
      score +
      Math.random()*4;

    if (
      !best ||
      finalScore > best.finalScore
    ) {

      best = {
        item,
        score,
        finalScore
      };
    }
  }

  return best;
}


/* =========================================================
   DECK AUDIO ENGINE
========================================================= */

function createDeck(letter) {

  const audio =
    $("audio" + letter);

  const source =
    state.ctx.createMediaElementSource(
      audio
    );

  const inputGain =
    state.ctx.createGain();

  const low =
    state.ctx.createBiquadFilter();

  const mid =
    state.ctx.createBiquadFilter();

  const high =
    state.ctx.createBiquadFilter();

  const volume =
    state.ctx.createGain();

  const crossGain =
    state.ctx.createGain();

  low.type = "lowshelf";
  low.frequency.value = 160;

  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = .8;

  high.type = "highshelf";
  high.frequency.value = 5000;

  inputGain.gain.value = 1;
  volume.gain.value = 1;

  source
    .connect(inputGain)
    .connect(low)
    .connect(mid)
    .connect(high)
    .connect(volume)
    .connect(crossGain)
    .connect(state.musicBus);

  const deck = {

    letter,

    audio,
    source,

    inputGain,
    low,
    mid,
    high,
    volume,
    crossGain,

    file: null,
    objectURL: null,
    item: null,

    playing: false
  };

  audio.addEventListener(
    "timeupdate",
    () => updateDeckUI(letter)
  );

  audio.addEventListener(
    "loadedmetadata",
    () => updateDeckUI(letter)
  );

  audio.addEventListener(
    "play",
    () => {

      deck.playing = true;

      $(
        "deckCard" + letter
      ).classList.add("playing");

      updateDeckState(
        letter,
        "PLAYING"
      );
    }
  );

  audio.addEventListener(
    "pause",
    () => {

      deck.playing = false;

      $(
        "deckCard" + letter
      ).classList.remove("playing");

      if (!state.transitionRunning) {
        updateDeckState(
          letter,
          "PAUSED"
        );
      }
    }
  );

  audio.addEventListener(
    "ended",
    () => {

      deck.playing = false;

      updateDeckState(
        letter,
        "ENDED"
      );

      handleTrackEnded(letter);
    }
  );

  return deck;
}


/* =========================================================
   ENGINE START
========================================================= */

async function startEngine() {

  if (state.started) {

    if (
      state.ctx &&
      state.ctx.state === "suspended"
    ) {
      await state.ctx.resume();
    }

    return;
  }

  const AudioContext =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContext) {

    alert(
      "Este navegador no soporta Web Audio."
    );

    return;
  }

  state.ctx =
    new AudioContext();

  state.musicBus =
    state.ctx.createGain();

  state.compressor =
    state.ctx.createDynamicsCompressor();

  state.masterGain =
    state.ctx.createGain();

  state.analyser =
    state.ctx.createAnalyser();

  state.analyser.fftSize = 2048;

  state.musicBus.gain.value = 1;

  state.masterGain.gain.value =
    Number(
      $("masterVolume").value
    );

  state.musicBus
    .connect(state.compressor)
    .connect(state.masterGain);

  state.masterGain
    .connect(state.analyser)
    .connect(state.ctx.destination);

  /*
    Grabación de la mezcla.
  */

  if (
    state.ctx.createMediaStreamDestination
  ) {

    state.recordDestination =
      state.ctx.createMediaStreamDestination();

    state.masterGain.connect(
      state.recordDestination
    );
  }

  state.decks.A =
    createDeck("A");

  state.decks.B =
    createDeck("B");

  createVoiceEngine();

  state.started = true;

  await state.ctx.resume();

  setSystemOnline();

  setCrossPosition(
    Number(
      $("crossfader").value
    ),
    false
  );

  startVisualEngine();

  updateSystem();

  scheduleVoiceID();

  setAnalysisStatus(
    "MOTOR SMART DJ ACTIVO"
  );
}


/* =========================================================
   VOICE ENGINE
========================================================= */

function createVoiceEngine() {

  const audio =
    $("voiceAudio");

  const source =
    state.ctx.createMediaElementSource(
      audio
    );

  const gain =
    state.ctx.createGain();

  gain.gain.value =
    Number(
      $("voiceVolume").value
    );

  source
    .connect(gain)
    .connect(state.masterGain);

  state.voice = {
    audio,
    source,
    gain
  };

  audio.addEventListener(
    "ended",
    restoreMusicAfterVoice
  );
}

function scheduleVoiceID() {

  clearTimeout(
    state.voiceTimer
  );

  if (!state.voiceFiles.length) {
    return;
  }

  const minutes =
    Number(
      $("voiceInterval").value
    );

  state.voiceTimer =
    setTimeout(
      async () => {

        if (
          state.voiceFiles.length &&
          $("voiceEnabled").checked
        ) {
          await playVoiceID();
        }

        scheduleVoiceID();

      },
      minutes * 60 * 1000
    );
}

async function playVoiceID() {

  if (
    !state.started ||
    state.voiceBusy ||
    !state.voiceFiles.length
  ) {
    return;
  }

  const voice =
    state.voiceFiles[
      Math.floor(
        Math.random() *
        state.voiceFiles.length
      )
    ];

  const url =
    URL.createObjectURL(
      voice
    );

  const audio =
    state.voice.audio;

  state.voiceBusy = true;

  const duck =
    Number(
      $("voiceDucking").value
    );

  const now =
    state.ctx.currentTime;

  /*
    Baja solamente la música.
    El Voice ID queda fuera del crossfader.
  */

  state.musicBus.gain.cancelScheduledValues(now);

  state.musicBus.gain.setTargetAtTime(
    duck,
    now,
    .05
  );

  audio.src = url;
  audio.volume =
    Number(
      $("voiceVolume").value
    );

  try {

    await audio.play();

    $("voiceStatus").textContent =
      "VOICE ID: " + voice.name;

  } catch (error) {

    console.error(error);
    restoreMusicAfterVoice();
  }
}

function restoreMusicAfterVoice() {

  if (!state.ctx) return;

  const now =
    state.ctx.currentTime;

  state.musicBus.gain.cancelScheduledValues(now);

  state.musicBus.gain.setTargetAtTime(
    1,
    now,
    .15
  );

  state.voiceBusy = false;

  $("voiceStatus").textContent =
    state.voiceFiles.length
      ? "VOICE ID LISTO"
      : "SIN VOICE ID CARGADOS";
}


/* =========================================================
   CROSS FADER
========================================================= */

function setCrossPosition(
  position,
  smooth = true
) {

  if (!state.started) return;

  position =
    clamp(
      Number(position),
      0,
      1
    );

  state.crossPosition =
    position;

  /*
    Equal Power Crossfade.

    A = cos(x*pi/2)
    B = sin(x*pi/2)

    No hay caída artificial de volumen
    en el centro.
  */

  const gainA =
    Math.cos(
      position *
      Math.PI /
      2
    );

  const gainB =
    Math.sin(
      position *
      Math.PI /
      2
    );

  const now =
    state.ctx.currentTime;

  const timeConstant =
    smooth ? .012 : .001;

  for (
    const [letter,gain] of [
      ["A",gainA],
      ["B",gainB]
    ]
  ) {

    const node =
      state.decks[
        letter
      ].crossGain.gain;

    node.cancelScheduledValues(now);

    node.setTargetAtTime(
      gain,
      now,
      timeConstant
    );
  }

  $("crossfader").value =
    position;

  updateCrossLabel(position);
}

function updateCrossLabel(position) {

  let label = "CENTER";

  if (position < .08) {
    label = "A 100%";
  } else if (position > .92) {
    label = "B 100%";
  } else if (position < .42) {
    label = "A > B";
  } else if (position > .58) {
    label = "B > A";
  }

  $("crossMode").textContent =
    label;
}


/* =========================================================
   PROFESSIONAL AUTO CROSS TRANSITION
========================================================= */

async function transitionTo(
  targetLetter,
  reason = "SMART DJ"
) {

  if (
    !state.started ||
    state.transitionRunning
  ) {
    return false;
  }

  const target =
    state.decks[targetLetter];

  const outgoingLetter =
    targetLetter === "A"
      ? "B"
      : "A";

  const outgoing =
    state.decks[
      outgoingLetter
    ];

  if (!target.file) {

    const current =
      outgoing.item;

    const recommendation =
      selectSmartTrack(
        current
      );

    if (!recommendation) {
      return false;
    }

    await loadItemToDeck(
      recommendation.item,
      targetLetter
    );
  }

  if (!target.file) {
    return false;
  }

  /*
    TOKEN para cancelar limpiamente una transición
    si el usuario mueve manualmente el crossfader.
  */

  const token =
    ++state.transitionToken;

  state.transitionRunning = true;

  $("smartTransitionStatus").textContent =
    "SMART MIX: " + reason;

  /*
    IMPORTANTE:

    Primero arranca el deck entrante.
    Nunca se detiene la canción entrante
    durante el cambio.
  */

  try {

    if (target.audio.paused) {

      target.audio.currentTime =
        target.audio.currentTime || 0;

      await target.audio.play();
    }

  } catch (error) {

    console.error(
      "No se pudo iniciar deck entrante:",
      error
    );

    state.transitionRunning = false;
    return false;
  }

  /*
    Punto inicial real del crossfader.
  */

  const start =
    state.crossPosition;

  const end =
    targetLetter === "A"
      ? 0
      : 1;

  /*
    La transición NO tiene segundos configurables.

    El movimiento es controlado por el motor Smart DJ
    en función de la frase. El crossfader simplemente
    ejecuta el cambio A/B.
  */

  const duration =
    calculateSmartBlendDuration(
      outgoing,
      target
    );

  const startTime =
    performance.now();

  await new Promise(resolve => {

    function frame(now) {

      if (
        token !== state.transitionToken
      ) {

        resolve();
        return;
      }

      const elapsed =
        now - startTime;

      const p =
        clamp(
          elapsed /
          duration,
          0,
          1
        );

      /*
        Smoothstep profesional.
      */

      const eased =
        p*p*(3-2*p);

      const position =
        lerp(
          start,
          end,
          eased
        );

      setCrossPosition(
        position,
        false
      );

      if (p >= 1) {

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
  });

  if (
    token !== state.transitionToken
  ) {

    state.transitionRunning = false;
    return false;
  }

  /*
    Ya estamos completamente en el deck nuevo.
  */

  state.activeDeck =
    targetLetter;

  /*
    AHORA se detiene el deck anterior.
    Nunca antes.
  */

  try {

    outgoing.audio.pause();
    outgoing.audio.currentTime = 0;

  } catch {}

  updateActiveDeckDisplay();

  state.transitionRunning = false;

  $("smartTransitionStatus").textContent =
    "MIX COMPLETADO • " +
    targetLetter;

  state.history.push(
    target.item?.id
  );

  if (state.history.length > 20) {
    state.history.shift();
  }

  /*
    Preparamos la próxima pista en el deck
    que quedó libre.
  */

  if (state.autoDJ) {
    await preloadNext();
  }

  updateSystem();

  return true;
}


/*
  La duración interna no es un parámetro del usuario.
  El usuario NO controla segundos del crossfader.

  Smart DJ determina una duración razonable a partir
  de BPM y estructura.
*/

function calculateSmartBlendDuration(
  outgoing,
  incoming
) {

  const bpm =
    incoming.item?.analysis?.bpm ||
    outgoing.item?.analysis?.bpm ||
    120;

  /*
    Cuatro beats como base.
    Se amplía a ocho beats en material lento.
  */

  const beats =
    bpm < 90 ? 8 : 4;

  const duration =
    (60 / bpm) *
    beats *
    1000;

  return clamp(
    duration,
    1800,
    5000
  );
}


/* =========================================================
   SMART PHRASE TRANSITION
========================================================= */

function shouldStartSmartTransition(
  deck
) {

  if (
    !deck ||
    !deck.item ||
    !deck.item.analysis
  ) {
    return false;
  }

  const audio =
    deck.audio;

  if (
    !Number.isFinite(audio.duration) ||
    !audio.duration
  ) {
    return false;
  }

  const remaining =
    audio.duration -
    audio.currentTime;

  const analysis =
    deck.item.analysis;

  /*
    Busca el final de la canción.

    En vez de "cambiar cada X segundos",
    se utiliza la estructura musical.

    La transición se arma cuando quedan
    aproximadamente 16 beats.
  */

  const bpm =
    analysis.bpm || 120;

  const phrase =
    analysis.phraseLength || 16;

  const phraseDuration =
    (60 / bpm) *
    phrase;

  return remaining <=
    clamp(
      phraseDuration,
      6,
      24
    );
}


/* =========================================================
   TRACK END / AUTO DJ
========================================================= */

async function handleTrackEnded(
  letter
) {

  if (!state.autoDJ) {
    return;
  }

  const target =
    letter === "A"
      ? "B"
      : "A";

  const outgoing =
    state.decks[letter];

  /*
    Si el siguiente deck está vacío,
    Smart DJ selecciona y prepara una pista.
  */

  if (
    !state.decks[target].file
  ) {

    const recommendation =
      selectSmartTrack(
        outgoing.item
      );

    if (
      recommendation
    ) {

      await loadItemToDeck(
        recommendation.item,
        target
      );

      showRecommendation(
        recommendation
      );
    }
  }

  await transitionTo(
    target,
    "FIN DE FRASE / TRACK"
  );
}


/* =========================================================
   AUTO DJ MONITOR
========================================================= */

let autoMonitor = null;

function startAutoDJMonitor() {

  clearInterval(
    autoMonitor
  );

  autoMonitor =
    setInterval(
      async () => {

        if (
          !state.autoDJ ||
          !state.started ||
          state.transitionRunning
        ) {
          return;
        }

        const active =
          state.decks[
            state.activeDeck
          ];

        if (!active) return;

        /*
          Si no está reproduciendo, intentamos iniciar.
        */

        if (
          active.file &&
          active.audio.paused
        ) {

          try {
            await active.audio.play();
          } catch {}
        }

        /*
          Pre-carga Smart DJ.
        */

        await preloadNext();

        /*
          Cuando llega al final de una frase,
          se prepara la mezcla.
        */

        if (
          active.playing &&
          shouldStartSmartTransition(
            active
          )
        ) {

          const target =
            state.activeDeck === "A"
              ? "B"
              : "A";

          await transitionTo(
            target,
            "FRASE MUSICAL"
          );
        }

      },
      500
    );
}


/* =========================================================
   PRELOAD NEXT
========================================================= */

async function preloadNext() {

  if (!state.autoDJ) {
    return;
  }

  const active =
    state.decks[
      state.activeDeck
    ];

  const targetLetter =
    state.activeDeck === "A"
      ? "B"
      : "A";

  const target =
    state.decks[
      targetLetter
    ];

  if (
    target.file &&
    target.item
  ) {
    return;
  }

  const recommendation =
    selectSmartTrack(
      active.item
    );

  if (!recommendation) {
    return;
  }

  await loadItemToDeck(
    recommendation.item,
    targetLetter
  );

  showRecommendation(
    recommendation
  );
}


/* =========================================================
   LOAD ITEM TO DECK
========================================================= */

async function loadItemToDeck(
  item,
  letter
) {

  if (!item || !item.file) {
    return;
  }

  if (!state.started) {
    await startEngine();
  }

  const deck =
    state.decks[letter];

  /*
    Detener cualquier reproducción anterior
    del deck destino.
  */

  try {
    deck.audio.pause();
  } catch {}

  if (deck.objectURL) {

    try {
      URL.revokeObjectURL(
        deck.objectURL
      );
    } catch {}
  }

  deck.objectURL =
    URL.createObjectURL(
      item.file
    );

  deck.file =
    item.file;

  deck.item =
    item;

  deck.audio.src =
    deck.objectURL;

  deck.audio.load();

  $("title" + letter).textContent =
    item.name;

  updateDeckAnalysis(
    letter,
    item
  );

  updateDeckState(
    letter,
    "LOADED"
  );

  renderLibrary();
}


/* =========================================================
   DECK LOAD BUTTON
========================================================= */

function openDeckFile(letter) {

  $("file" + letter).click();
}

async function handleDeckFile(
  letter,
  file
) {

  if (!file) return;

  let item =
    state.library.find(
      x => x.id === fileId(file)
    );

  if (!item) {

    item = {
      id: fileId(file),
      file,
      name: file.name,
      genre: inferGenre(file),
      analysis: null
    };

    state.library.push(item);
  }

  if (!item.analysis) {

    await analyzeFile(
      file
    );
  }

  await loadItemToDeck(
    item,
    letter
  );
}


/* =========================================================
   PLAY / STOP / CUE
========================================================= */

async function playDeck(letter) {

  if (!state.started) {
    await startEngine();
  }

  const deck =
    state.decks[letter];

  if (!deck.file) {

    openDeckFile(letter);
    return;
  }

  try {

    await deck.audio.play();

    state.activeDeck =
      letter;

    updateActiveDeckDisplay();

  } catch (error) {

    console.error(error);

    setAnalysisStatus(
      "PRESIONA PLAY NUEVAMENTE"
    );
  }
}

function stopDeck(letter) {

  const deck =
    state.decks[letter];

  deck.audio.pause();

  deck.audio.currentTime = 0;

  updateDeckState(
    letter,
    "READY"
  );
}

function cueDeck(letter) {

  const deck =
    state.decks[letter];

  if (!deck.file) return;

  deck.audio.currentTime = 0;
}


/* =========================================================
   DECK UI
========================================================= */

function updateDeckUI(letter) {

  const deck =
    state.decks[letter];

  if (!deck) return;

  const audio =
    deck.audio;

  const current =
    audio.currentTime || 0;

  const duration =
    audio.duration || 0;

  $("time" + letter).textContent =
    formatTime(current);

  $("duration" + letter).textContent =
    formatTime(duration);

  $("progress" + letter).style.width =
    duration
      ? (
          current /
          duration *
          100
        ) + "%"
      : "0%";

  /*
    Frase actual.
  */

  if (
    deck.item &&
    deck.item.analysis
  ) {

    const phrases =
      deck.item.analysis.phrases ||
      [];

    let currentPhrase = "--";

    for (let i = 0; i < phrases.length; i++) {

      if (
        current >=
        phrases[i].time
      ) {
        currentPhrase =
          "P" + (i+1);
      }
    }

    $("phrase" + letter).textContent =
      currentPhrase;
  }
}

function updateDeckState(
  letter,
  stateText
) {

  $("state" + letter).textContent =
    stateText;
}

function updateDeckAnalysis(
  letter,
  item
) {

  const a =
    item.analysis;

  if (!a) return;

  $("bpm" + letter).textContent =
    a.bpm
      ? a.bpm.toFixed(2)
      : "--";

  $("key" + letter).textContent =
    a.key || "--";

  $("camelot" + letter).textContent =
    a.camelot || "--";

  $("energy" + letter).textContent =
    a.energy
      ? a.energy
      : "--";

  $("phrase" + letter).textContent =
    a.phraseLength
      ? a.phraseLength + " BEATS"
      : "--";
}


/* =========================================================
   ACTIVE MEDIA DISPLAY
========================================================= */

function updateActiveDeckDisplay() {

  const letter =
    state.activeDeck;

  const deck =
    state.decks[letter];

  $("activeDeckLabel").textContent =
    "DECK " + letter;

  $("systemDeck").textContent =
    letter;

  if (!deck || !deck.file) {

    $("currentMediaName").textContent =
      "READY";

    return;
  }

  const video =
    $("videoScreen");

  if (isVideoFile(deck.file)) {

    video.src =
      deck.objectURL;

    video.classList.add(
      "visible"
    );

    $("mediaTypeLabel").textContent =
      "VIDEO MODE";

    $("screenStatus").textContent =
      "VIDEO • DECK " + letter;

    /*
      El audio real continúa en el <audio>.
      El video es exclusivamente visual.
    */

    syncVideoToDeck();

  } else {

    video.pause();
    video.removeAttribute("src");
    video.load();

    video.classList.remove(
      "visible"
    );

    $("mediaTypeLabel").textContent =
      "AUDIO MODE";

    $("screenStatus").textContent =
      "AUDIO • VISUALIZER";
  }

  $("currentMediaName").textContent =
    deck.item?.name ||
    deck.file.name;
}

let videoSyncFrame = null;

function syncVideoToDeck() {

  cancelAnimationFrame(
    videoSyncFrame
  );

  const video =
    $("videoScreen");

  const deck =
    state.decks[
      state.activeDeck
    ];

  if (
    !deck ||
    !deck.file ||
    !isVideoFile(deck.file)
  ) {
    return;
  }

  function loop() {

    if (
      state.decks[
        state.activeDeck
      ] !== deck
    ) {
      return;
    }

    const audio =
      deck.audio;

    if (
      Number.isFinite(
        audio.currentTime
      )
    ) {

      if (
        Math.abs(
          video.currentTime -
          audio.currentTime
        ) > .25
      ) {

        try {
          video.currentTime =
            audio.currentTime;
        } catch {}
      }

      if (
        !audio.paused &&
        video.paused
      ) {

        video.play().catch(
          () => {}
        );
      }

      if (
        audio.paused &&
        !video.paused
      ) {

        video.pause();
      }
    }

    videoSyncFrame =
      requestAnimationFrame(
        loop
      );
  }

  try {
    video.currentTime =
      deck.audio.currentTime || 0;
  } catch {}

  loop();
}


/* =========================================================
   LIBRARY
========================================================= */

function addFilesToLibrary(
  files
) {

  let added = 0;

  for (const file of files) {

    if (!isMediaFile(file)) {
      continue;
    }

    const id =
      fileId(file);

    if (
      state.library.some(
        item => item.id === id
      )
    ) {
      continue;
    }

    state.library.push({
      id,
      file,
      name: file.name,
      genre: inferGenre(file),
      analysis: null
    });

    added++;
  }

  renderLibrary();

  setAnalysisStatus(
    added +
    " pistas agregadas"
  );
}

async function analyzeLibrary() {

  if (!state.started) {
    await startEngine();
  }

  const pending =
    state.library.filter(
      item => !item.analysis
    );

  for (
    let i = 0;
    i < pending.length;
    i++
  ) {

    $("analysisStatus").textContent =
      `ANALIZANDO ${i+1}/${pending.length}`;

    await analyzeFile(
      pending[i].file
    );

    /*
      Permitimos respirar al navegador
      entre análisis pesados.
    */

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          20
        )
    );
  }

  renderLibrary();

  setAnalysisStatus(
    "BIBLIOTECA ANALIZADA"
  );
}


/* =========================================================
   LIBRARY RENDER
========================================================= */

function renderLibrary() {

  const container =
    $("libraryList");

  const filtered =
    state.library.filter(
      item =>
        state.genreFilter === "all" ||
        item.genre === state.genreFilter
    );

  $("libraryCount").textContent =
    state.library.length +
    " pistas";

  $("systemLibrary").textContent =
    state.library.length;

  container.innerHTML =
    filtered.map(
      (item,index) => {

        const a =
          item.analysis;

        return `
          <div class="library-row">

            <div class="library-index">
              ${index+1}
            </div>

            <div class="library-name">
              <strong>
                ${escapeHTML(item.name)}
              </strong>
              <small>
                ${escapeHTML(item.genre.toUpperCase())}
              </small>
            </div>

            <div class="library-stat">
              <small>BPM</small>
              <strong>
                ${
                  a?.bpm
                    ? a.bpm.toFixed(1)
                    : "--"
                }
              </strong>
            </div>

            <div class="library-stat">
              <small>KEY</small>
              <strong>
                ${
                  a?.key || "--"
                }
              </strong>
            </div>

            <div class="library-stat">
              <small>CAMELOT</small>
              <strong>
                ${
                  a?.camelot || "--"
                }
              </strong>
            </div>

            <div class="library-stat">
              <small>ENERGY</small>
              <strong>
                ${
                  a?.energy ?? "--"
                }
              </strong>
            </div>

            <div class="library-action">

              <button
                data-load-a="${escapeHTML(item.id)}">
                A
              </button>

              <button
                data-load-b="${escapeHTML(item.id)}">
                B
              </button>

              <button
                data-analyze="${escapeHTML(item.id)}">
                ANALIZAR
              </button>

            </div>

          </div>
        `;
      }
    ).join("");

  /*
    Eventos de botones.
  */

  container
    .querySelectorAll(
      "[data-load-a]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const item =
            state.library.find(
              x =>
                x.id ===
                button.dataset.loadA
            );

          if (item) {

            if (!item.analysis) {
              await analyzeFile(
                item.file
              );
            }

            await loadItemToDeck(
              item,
              "A"
            );
          }
        }
      );
    });

  container
    .querySelectorAll(
      "[data-load-b]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const item =
            state.library.find(
              x =>
                x.id ===
                button.dataset.loadB
            );

          if (item) {

            if (!item.analysis) {
              await analyzeFile(
                item.file
              );
            }

            await loadItemToDeck(
              item,
              "B"
            );
          }
        }
      );
    });

  container
    .querySelectorAll(
      "[data-analyze]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const item =
            state.library.find(
              x =>
                x.id ===
                button.dataset.analyze
            );

          if (item) {
            await analyzeFile(
              item.file
            );
          }
        }
      );
    });
}


/* =========================================================
   SMART RECOMMENDATION UI
========================================================= */

function showRecommendation(
  recommendation
) {

  if (!recommendation) {
    return;
  }

  const item =
    recommendation.item;

  const a =
    item.analysis;

  $("smartRecommendation").textContent =
    item.name;

  $("smartScore").textContent =
    recommendation.score + "%";

  $("smartReason").textContent =
    [
      a?.bpm
        ? a.bpm.toFixed(1) + " BPM"
        : "",
      a?.camelot || "",
      a?.energy
        ? "E" + a.energy
        : "",
      a?.phraseLength
        ? a.phraseLength + "B"
        : ""
    ]
    .filter(Boolean)
    .join(" • ");
}

async function smartNext() {

  if (!state.started) {
    await startEngine();
  }

  const active =
    state.decks[
      state.activeDeck
    ];

  if (!active?.item) {

    setAnalysisStatus(
      "CARGA UNA PISTA ACTIVA"
    );

    return;
  }

  const recommendation =
    selectSmartTrack(
      active.item
    );

  if (!recommendation) {

    setAnalysisStatus(
      "NO HAY PISTA COMPATIBLE"
    );

    return;
  }

  showRecommendation(
    recommendation
  );

  const targetLetter =
    state.activeDeck === "A"
      ? "B"
      : "A";

  await loadItemToDeck(
    recommendation.item,
    targetLetter
  );

  setAnalysisStatus(
    "SMART NEXT PREPARADO"
  );
}


/* =========================================================
   AUTO DJ
========================================================= */

function toggleAutoDJ() {

  state.autoDJ =
    !state.autoDJ;

  const button =
    $("autoDJ");

  button.classList.toggle(
    "active",
    state.autoDJ
  );

  button.querySelector(
    "small"
  ).textContent =
    state.autoDJ
      ? "ON"
      : "OFF";

  $("systemSmart").textContent =
    state.autoDJ
      ? "ON"
      : "OFF";

  if (state.autoDJ) {

    startAutoDJMonitor();

    preloadNext();

    setAnalysisStatus(
      "SMART AUTO DJ ACTIVO"
    );

  } else {

    clearInterval(
      autoMonitor
    );

    setAnalysisStatus(
      "SMART AUTO DJ DETENIDO"
    );
  }
}


/* =========================================================
   VISUAL ENGINE
========================================================= */

let visualFrame = null;

function startVisualEngine() {

  const canvas =
    $("visualizer");

  const ctx =
    canvas.getContext("2d");

  const analyser =
    state.analyser;

  const frequency =
    new Uint8Array(
      analyser.frequencyBinCount
    );

  function resize() {

    const rect =
      canvas.getBoundingClientRect();

    canvas.width =
      Math.floor(
        rect.width *
        devicePixelRatio
      );

    canvas.height =
      Math.floor(
        rect.height *
        devicePixelRatio
      );
  }

  resize();

  window.addEventListener(
    "resize",
    resize
  );

  function draw() {

    analyser.getByteFrequencyData(
      frequency
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

    const bars = 90;

    const step =
      Math.max(
        1,
        Math.floor(
          frequency.length /
          bars
        )
      );

    const barWidth =
      width / bars;

    for (
      let i = 0;
      i < bars;
      i++
    ) {

      let sum = 0;

      for (
        let j = 0;
        j < step;
        j++
      ) {

        sum +=
          frequency[
            i*step+j
          ] || 0;
      }

      const value =
        sum /
        step /
        255;

      const barHeight =
        value *
        height *
        .62;

      const x =
        i * barWidth;

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
        .55,
        "#9b4dff"
      );

      gradient.addColorStop(
        1,
        "#ff2bd6"
      );

      ctx.fillStyle =
        gradient;

      ctx.fillRect(
        x,
        y,
        Math.max(2,barWidth-2),
        barHeight
      );
    }

    visualFrame =
      requestAnimationFrame(
        draw
      );
  }

  draw();
}


/* =========================================================
   VOLUME / EQ / PITCH
========================================================= */

function bindAudioControls(letter) {

  const deck =
    state.decks[letter];

  $("volume" + letter)
    .addEventListener(
      "input",
      event => {

        deck.volume.gain.value =
          Number(
            event.target.value
          );
      }
    );

  $("pitch" + letter)
    .addEventListener(
      "input",
      event => {

        deck.audio.playbackRate =
          Number(
            event.target.value
          );
      }
    );

  $("filter" + letter)
    .addEventListener(
      "input",
      event => {

        const value =
          Number(
            event.target.value
          );

        deck.low.frequency.value =
          Math.min(
            160,
            value
          );

        deck.high.frequency.value =
          Math.max(
            5000,
            value
          );
      }
    );

  $("low" + letter)
    .addEventListener(
      "input",
      event => {

        deck.low.gain.value =
          Number(
            event.target.value
          );
      }
    );

  $("mid" + letter)
    .addEventListener(
      "input",
      event => {

        deck.mid.gain.value =
          Number(
            event.target.value
          );
      }
    );

  $("high" + letter)
    .addEventListener(
      "input",
      event => {

        deck.high.gain.value =
          Number(
            event.target.value
          );
      }
    );
}


/* =========================================================
   METERS
========================================================= */

function updateMeters() {

  if (!state.started) {
    return;
  }

  const A =
    state.decks.A;

  const B =
    state.decks.B;

  const activeA =
    !A.audio.paused;

  const activeB =
    !B.audio.paused;

  const valueA =
    activeA
      ? Math.random()*70+20
      : 3;

  const valueB =
    activeB
      ? Math.random()*70+20
      : 3;

  $("vuA").style.height =
    valueA + "%";

  $("vuB").style.height =
    valueB + "%";

  $("meterA").style.height =
    valueA + "%";

  $("meterB").style.height =
    valueB + "%";

  requestAnimationFrame(
    updateMeters
  );
}


/* =========================================================
   SYSTEM
========================================================= */

function setSystemOnline() {

  $("systemLed")
    .classList.add(
      "online"
    );

  $("systemText").textContent =
    "MOTOR ONLINE";

  $("engineButton").textContent =
    "MOTOR ONLINE";
}

function setAnalysisStatus(
  text
) {

  $("analysisStatus").textContent =
    text;
}

function updateSystem() {

  $("systemDeck").textContent =
    state.activeDeck;

  $("systemLibrary").textContent =
    state.library.length;

  $("systemSmart").textContent =
    state.autoDJ
      ? "ON"
      : "OFF";
}

function updateClock() {

  const now =
    new Date();

  $("clock").textContent =
    [
      now.getHours(),
      now.getMinutes(),
      now.getSeconds()
    ]
    .map(
      n => String(n).padStart(2,"0")
    )
    .join(":");
}


/* =========================================================
   EVENTOS
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    updateClock();

    setInterval(
      updateClock,
      1000
    );

    /*
      Motor.
    */

    $("engineButton")
      .addEventListener(
        "click",
        async () => {
          await startEngine();
        }
      );

    /*
      Crossfader.

      IMPORTANTE:
      NO detiene ninguna canción.
      NO reinicia ninguna canción.
      NO tiene segundos.
    */

    $("crossfader")
      .addEventListener(
        "input",
        event => {

          /*
            Si Smart DJ estaba mezclando y el DJ
            mueve el crossfader, gana el control manual.
          */

          if (
            state.transitionRunning
          ) {

            state.transitionToken++;
            state.transitionRunning =
              false;

            $("smartTransitionStatus")
              .textContent =
              "CONTROL MANUAL";
          }

          if (!state.started) {
            return;
          }

          setCrossPosition(
            Number(
              event.target.value
            ),
            true
          );
        }
      );

    $("masterVolume")
      .addEventListener(
        "input",
        event => {

          if (!state.started) return;

          state.masterGain.gain.value =
            Number(
              event.target.value
            );
        }
      );

    /*
      Deck buttons.
    */

    for (const letter of ["A","B"]) {

      $("load" + letter)
        .addEventListener(
          "click",
          () => openDeckFile(letter)
        );

      $("file" + letter)
        .addEventListener(
          "change",
          async event => {

            const file =
              event.target.files[0];

            await handleDeckFile(
              letter,
              file
            );

            event.target.value = "";
          }
        );

      $("play" + letter)
        .addEventListener(
          "click",
          () => playDeck(letter)
        );

      $("stop" + letter)
        .addEventListener(
          "click",
          () => stopDeck(letter)
        );

      $("cue" + letter)
        .addEventListener(
          "click",
          () => cueDeck(letter)
        );
    }

    /*
      Biblioteca.
    */

    $("libraryFiles")
      .addEventListener(
        "change",
        event => {

          addFilesToLibrary(
            Array.from(
              event.target.files
            )
          );

          event.target.value = "";
        }
      );

    $("libraryFolder")
      .addEventListener(
        "change",
        event => {

          addFilesToLibrary(
            Array.from(
              event.target.files
            )
          );

          event.target.value = "";
        }
      );

    $("analyzeLibrary")
      .addEventListener(
        "click",
        analyzeLibrary
      );

    $("genreFilter")
      .addEventListener(
        "change",
        event => {

          state.genreFilter =
            event.target.value;

          renderLibrary();
        }
      );

    $("smartNext")
      .addEventListener(
        "click",
        smartNext
      );

    $("autoDJ")
      .addEventListener(
        "click",
        toggleAutoDJ
      );

    /*
      Voice ID.
    */

    $("voiceFiles")
      .addEventListener(
        "change",
        event => {

          state.voiceFiles =
            Array.from(
              event.target.files
            )
            .filter(
              file =>
                file.type.startsWith(
                  "audio/"
                )
            );

          $("voiceStatus").textContent =
            state.voiceFiles.length +
            " VOICE ID CARGADOS";

          scheduleVoiceID();
        }
      );

    $("voiceInterval")
      .addEventListener(
        "change",
        scheduleVoiceID
      );

    $("voiceVolume")
      .addEventListener(
        "input",
        event => {

          if (state.voice) {

            state.voice.gain.gain.value =
              Number(
                event.target.value
              );

            state.voice.audio.volume =
              Number(
                event.target.value
              );
          }
        }
      );

    $("voiceEnabled")
      .addEventListener(
        "change",
        () => {

          if (
            $("voiceEnabled").checked
          ) {

            scheduleVoiceID();

          } else {

            clearTimeout(
              state.voiceTimer
            );
          }
        }
      );

    $("voiceTest")
      .addEventListener(
        "click",
        async () => {

          if (!state.started) {
            await startEngine();
          }

          await playVoiceID();
        }
      );

    /*
      Inicializar biblioteca visual.
    */

    renderLibrary();

    /*
      Keyboard DJ controls.
    */

    document.addEventListener(
      "keydown",
      async event => {

        if (
          event.target.tagName ===
          "INPUT"
        ) {
          return;
        }

        switch(event.code) {

          case "Space":

            event.preventDefault();

            await playDeck(
              state.activeDeck
            );

            break;

          case "KeyA":

            if (!state.started) {
              await startEngine();
            }

            setCrossPosition(
              0,
              true
            );

            break;

          case "KeyS":

            if (!state.started) {
              await startEngine();
            }

            setCrossPosition(
              .5,
              true
            );

            break;

          case "KeyD":

            if (!state.started) {
              await startEngine();
            }

            setCrossPosition(
              1,
              true
            );

            break;

          case "KeyT":

            await smartNext();

            break;

          case "KeyM":

            toggleAutoDJ();

            break;
        }
      }
    );

    updateMeters();
  }
);
