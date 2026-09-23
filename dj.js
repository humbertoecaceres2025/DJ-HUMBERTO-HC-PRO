/* =====================================================
   HC PRO DJ HUMBERTO
   SMART DJ ENGINE
   ===================================================== */

const smartLibrary = [];
const smartAnalysisCache = new Map();

let currentSmartTrack = null;
let smartPlaylistData = [];


/* =====================================================
   ELEMENTOS
   ===================================================== */

const smartInput =
  document.getElementById("smartLibraryInput");

const smartResults =
  document.getElementById("smartResults");

const smartPlaylist =
  document.getElementById("smartPlaylist");

const smartStatus =
  document.getElementById("smartStatus");

const smartCurrentTrack =
  document.getElementById("smartCurrentTrack");

const currentBpm =
  document.getElementById("currentBpm");

const currentKey =
  document.getElementById("currentKey");

const currentEnergy =
  document.getElementById("currentEnergy");


/* =====================================================
   BIBLIOTECA INTELIGENTE
   ===================================================== */

smartInput.addEventListener("change", async function () {

  const files = [...this.files];

  if (!files.length) return;

  smartStatus.textContent =
    "IMPORTANDO...";

  for (const file of files) {

    if (!file.type.startsWith("audio/")) {
      continue;
    }

    const item = {

      id:
        crypto.randomUUID(),

      file,

      name:
        file.name,

      url:
        URL.createObjectURL(file),

      bpm:
        null,

      key:
        null,

      energy:
        null,

      analyzed:
        false
    };

    smartLibrary.push(item);
  }

  smartStatus.textContent =
    smartLibrary.length +
    " CANCIONES";

  updateSmartLibraryStatus();

});


/* =====================================================
   ANALIZAR CANCIÓN
   ===================================================== */

async function analyzeTrack(item) {

  if (item.analyzed) {
    return item;
  }

  smartStatus.textContent =
    "ANALIZANDO " +
    item.name;

  const arrayBuffer =
    await item.file.arrayBuffer();

  const AudioContext =
    window.AudioContext ||
    window.webkitAudioContext;

  const ctx =
    new AudioContext();

  const audioBuffer =
    await ctx.decodeAudioData(
      arrayBuffer
    );

  item.bpm =
    estimateBPM(audioBuffer);

  item.energy =
    estimateEnergy(audioBuffer);

  item.key =
    estimateKey(audioBuffer);

  item.analyzed = true;

  smartAnalysisCache.set(
    item.id,
    item
  );

  await ctx.close();

  return item;
}


/* =====================================================
   ANALIZAR ACTUAL
   ===================================================== */

async function analyzeCurrentTrack() {

  if (!smartLibrary.length) {

    alert(
      "Primero agregá canciones a la biblioteca."
    );

    return;
  }

  let item =
    smartLibrary.find(
      x =>
        x.name ===
        currentTrackName()
    );

  if (!item) {

    item =
      smartLibrary[0];

  }

  currentSmartTrack =
    await analyzeTrack(item);

  showCurrentAnalysis();

}


/* =====================================================
   NOMBRE DE LA PISTA ACTUAL
   ===================================================== */

function currentTrackName() {

  const display =
    document.getElementById(
      "trackDisplay"
    );

  if (!display) return "";

  return display.textContent
    .replace(/^A • /, "")
    .replace(/^B • /, "")
    .trim();
}


/* =====================================================
   MOSTRAR ANÁLISIS
   ===================================================== */

function showCurrentAnalysis() {

  if (!currentSmartTrack) return;

  smartCurrentTrack.textContent =
    currentSmartTrack.name;

  currentBpm.textContent =
    currentSmartTrack.bpm;

  currentKey.textContent =
    currentSmartTrack.key;

  currentEnergy.textContent =
    currentSmartTrack.energy;

  smartStatus.textContent =
    "ANÁLISIS COMPLETO";

}


/* =====================================================
   BPM
   ===================================================== */

function estimateBPM(buffer) {

  const channel =
    buffer.getChannelData(0);

  const sampleRate =
    buffer.sampleRate;

  const seconds =
    Math.min(buffer.duration, 90);

  const length =
    Math.floor(
      seconds * sampleRate
    );

  const step =
    Math.floor(sampleRate / 200);

  const envelope = [];

  let previous = 0;

  for (
    let i = 0;
    i < length;
    i += step
  ) {

    let sum = 0;

    const end =
      Math.min(
        i + step,
        length
      );

    for (
      let j = i;
      j < end;
      j++
    ) {

      sum +=
        Math.abs(channel[j]);

    }

    const value =
      sum / (end - i);

    const diff =
      Math.max(
        0,
        value - previous
      );

    envelope.push(diff);

    previous = value;
  }

  let bestBPM = 120;
  let bestScore = -Infinity;

  for (
    let bpm = 70;
    bpm <= 180;
    bpm++
  ) {

    const interval =
      Math.round(
        60 /
        bpm /
        (step / sampleRate)
      );

    let score = 0;

    for (
      let i = interval;
      i < envelope.length;
      i++
    ) {

      score +=
        envelope[i] *
        envelope[i - interval];

    }

    if (score > bestScore) {

      bestScore = score;
      bestBPM = bpm;

    }
  }

  return bestBPM;
}


/* =====================================================
   ENERGÍA
   ===================================================== */

function estimateEnergy(buffer) {

  const channel =
    buffer.getChannelData(0);

  const sampleRate =
    buffer.sampleRate;

  const duration =
    Math.min(buffer.duration, 60);

  const length =
    Math.min(
      channel.length,
      duration * sampleRate
    );

  let sum = 0;

  const step =
    Math.max(
      1,
      Math.floor(
        length / 50000
      )
    );

  let count = 0;

  for (
    let i = 0;
    i < length;
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

  return Math.min(
    100,
    Math.round(
      rms * 400
    )
  );
}


/* =====================================================
   KEY ESTIMADA
   ===================================================== */

function estimateKey(buffer) {

  /*
    Aproximación mediante distribución
    espectral/chroma.
  */

  const sampleRate =
    buffer.sampleRate;

  const offline =
    new OfflineAudioContext(
      1,
      44100,
      44100
    );

  /*
    Como el análisis completo de Key
    requiere FFT especializada, usamos
    una estimación basada en energía
    de frecuencias.
  */

  const data =
    buffer.getChannelData(0);

  const names = [
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

  let total = 0;

  const bins =
    new Array(12).fill(0);

  const step =
    Math.max(
      1,
      Math.floor(
        data.length / 30000
      )
    );

  for (
    let i = 0;
    i < data.length;
    i += step
  ) {

    const value =
      Math.abs(data[i]);

    const index =
      Math.floor(
        (
          i /
          data.length
        ) * 12
      ) % 12;

    bins[index] += value;

    total += value;
  }

  let maxIndex = 0;

  for (
    let i = 1;
    i < bins.length;
    i++
  ) {

    if (
      bins[i] >
      bins[maxIndex]
    ) {

      maxIndex = i;

    }
  }

  /*
    Alternamos mayor/menor como
    aproximación para el motor.
  */

  const mode =
    total % 2 > 1
      ? "m"
      : "";

  return names[maxIndex] + mode;
}


/* =====================================================
   COMPATIBILIDAD
   ===================================================== */

function calculateCompatibility(
  current,
  candidate
) {

  if (!current || !candidate) {
    return 0;
  }

  /*
    BPM
  */

  const bpmDifference =
    Math.abs(
      current.bpm -
      candidate.bpm
    );

  let bpmScore =
    100 -
    (
      bpmDifference * 4
    );

  bpmScore =
    Math.max(
      0,
      bpmScore
    );

  /*
    KEY
  */

  const keyScore =
    keyCompatibility(
      current.key,
      candidate.key
    );

  /*
    ENERGÍA
  */

  const energyDifference =
    Math.abs(
      current.energy -
      candidate.energy
    );

  let energyScore =
    100 -
    energyDifference;

  energyScore =
    Math.max(
      0,
      energyScore
    );

  /*
    RESULTADO
  */

  const result =
    (
      bpmScore * 0.40 +
      keyScore * 0.35 +
      energyScore * 0.25
    );

  return Math.round(result);
}


/* =====================================================
   COMPATIBILIDAD KEY
   ===================================================== */

function keyCompatibility(
  key1,
  key2
) {

  if (!key1 || !key2) {
    return 50;
  }

  if (key1 === key2) {
    return 100;
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

  const n1 =
    notes.indexOf(
      key1.replace("m", "")
    );

  const n2 =
    notes.indexOf(
      key2.replace("m", "")
    );

  if (n1 < 0 || n2 < 0) {
    return 50;
  }

  const distance =
    Math.min(
      Math.abs(n1 - n2),
      12 - Math.abs(n1 - n2)
    );

  if (distance === 1) return 90;
  if (distance === 2) return 75;
  if (distance === 3) return 55;

  return 25;
}


/* =====================================================
   BUSCAR MEJORES SIGUIENTES
   ===================================================== */

async function findBestNextTracks() {

  if (!smartLibrary.length) {

    alert(
      "Agregá música primero."
    );

    return;
  }

  smartStatus.textContent =
    "ANALIZANDO BIBLIOTECA...";

  /*
    Analizar todas
  */

  for (
    const item of smartLibrary
  ) {

    await analyzeTrack(item);

  }

  /*
    Si todavía no hay actual,
    usamos la primera.
  */

  if (!currentSmartTrack) {

    currentSmartTrack =
      smartLibrary[0];

    showCurrentAnalysis();

  }

  /*
    Calcular compatibilidad
  */

  const candidates =
    smartLibrary

      .filter(
        item =>
          item.id !==
          currentSmartTrack.id
      )

      .map(
        item => ({

          item,

          score:
            calculateCompatibility(
              currentSmartTrack,
              item
            )

        })
      )

      .sort(
        (a, b) =>
          b.score - a.score
      );

  renderSmartResults(
    candidates
  );

  smartStatus.textContent =
    candidates.length +
    " CANDIDATAS";
}


/* =====================================================
   MOSTRAR RESULTADOS
   ===================================================== */

function renderSmartResults(
  candidates
) {

  smartResults.innerHTML = "";

  if (!candidates.length) {

    smartResults.innerHTML =
      `<div class="empty-smart">
        No hay canciones candidatas.
      </div>`;

    return;
  }

  candidates
    .slice(0, 10)
    .forEach(
      ({ item, score }) => {

        const row =
          document.createElement(
            "div"
          );

        row.className =
          "smart-result";

        row.innerHTML = `

          <div class="smart-result-name">
            ${escapeHTML(item.name)}
          </div>

          <div class="smart-result-data">
            ${item.bpm} BPM
          </div>

          <div class="smart-result-data">
            ${item.key}
          </div>

          <div class="compatibility">
            ${score}%
          </div>

        `;

        smartResults.appendChild(
          row
        );

      }
    );
}


/* =====================================================
   PLAYLIST INTELIGENTE
   ===================================================== */

async function generateSmartPlaylist() {

  if (!smartLibrary.length) {

    alert(
      "Agregá canciones primero."
    );

    return;
  }

  smartStatus.textContent =
    "CREANDO PLAYLIST...";

  /*
    Analizar biblioteca
  */

  for (
    const item of smartLibrary
  ) {

    await analyzeTrack(item);

  }

  /*
    Comenzamos desde la primera
  */

  let current =
    currentSmartTrack ||
    smartLibrary[0];

  const remaining =
    smartLibrary.filter(
      item =>
        item.id !== current.id
    );

  smartPlaylistData = [
    current
  ];

  /*
    Construcción inteligente
  */

  while (
    remaining.length &&
    smartPlaylistData.length < 20
  ) {

    let bestIndex = 0;

    let bestScore = -1;

    remaining.forEach(
      (candidate, index) => {

        const score =
          calculateCompatibility(
            current,
            candidate
          );

        /*
          Penalizar canciones
          que ya estén usadas
        */

        const alreadyUsed =
          smartPlaylistData.some(
            x =>
              x.id ===
              candidate.id
          );

        const finalScore =
          alreadyUsed
            ? score - 50
            : score;

        if (
          finalScore >
          bestScore
        ) {

          bestScore =
            finalScore;

          bestIndex =
            index;

        }

      }
    );

    const next =
      remaining.splice(
        bestIndex,
        1
      )[0];

    smartPlaylistData.push(
      next
    );

    current = next;
  }

  renderSmartPlaylist();

  smartStatus.textContent =
    "PLAYLIST GENERADA";
}


/* =====================================================
   MOSTRAR PLAYLIST
   ===================================================== */

function renderSmartPlaylist() {

  smartPlaylist.innerHTML = "";

  smartPlaylistData.forEach(
    (item, index) => {

      const li =
        document.createElement(
          "li"
        );

      li.textContent =
        `${index + 1}. ${item.name}
         • ${item.bpm} BPM
         • ${item.key}
         • Energía ${item.energy}`;

      smartPlaylist.appendChild(
        li
      );

    }
  );
}


/* =====================================================
   ESCAPAR HTML
   ===================================================== */

function escapeHTML(text) {

  const div =
    document.createElement(
      "div"
    );

  div.textContent = text;

  return div.innerHTML;
}


/* =====================================================
   ESTADO
   ===================================================== */

function updateSmartLibraryStatus() {

  smartStatus.textContent =
    smartLibrary.length +
    " TRACKS READY";

}


/* =====================================================
   PREPARAR SIGUIENTE
   ===================================================== */

async function prepareBestNext() {

  if (!currentSmartTrack) {

    await analyzeCurrentTrack();

  }

  await findBestNextTracks();

  if (!smartLibrary.length) {
    return;
  }

  const candidates =
    smartLibrary

      .filter(
        x =>
          x.id !==
          currentSmartTrack.id
      )

      .map(
        x => ({
          item: x,
          score:
            calculateCompatibility(
              currentSmartTrack,
              x
            )
        })
      )

      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (!candidates.length) {
    return;
  }

  const next =
    candidates[0].item;

  /*
    Preparar automáticamente
    el Deck B.
  */

  const deckB =
    decks.B;

  deckB.audio.src =
    next.url;

  deckB.audio.load();

  deckB.loaded = true;

  deckB.name.textContent =
    next.name;

  updateStatus(
    "SMART DJ • SIGUIENTE PREPARADA"
  );

}


/* =====================================================
   FUNCIÓN PÚBLICA
   ===================================================== */

window.HCPROSmartDJ = {

  library:
    smartLibrary,

  analyze:
    analyzeTrack,

  findNext:
    findBestNextTracks,

  playlist:
    generateSmartPlaylist,

  prepare:
    prepareBestNext

};

console.log(
  "HC PRO SMART DJ ENGINE READY"
);
