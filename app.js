// Poker Ride Version 3 Core Logic

const fullDeck = [
  "2♠","3♠","4♠","5♠","6♠","7♠","8♠","9♠","10♠","J♠","Q♠","K♠","A♠",
  "2♥","3♥","4♥","5♥","6♥","7♥","8♥","9♥","10♥","J♥","Q♥","K♥","A♥",
  "2♦","3♦","4♦","5♦","6♦","7♦","8♦","9♦","10♦","J♦","Q♦","K♦","A♦",
  "2♣","3♣","4♣","5♣","6♣","7♣","8♣","9♣","10♣","J♣","Q♣","K♣","A♣"
];

const STORAGE_KEY = "pokerRideV3State";

let state = {
  riderName: "",
  eventId: "",
  mode: "5-card", // modes: '5-card' or '7-card'
  startTime: null,
  deck: [],
  hand: {},
  gameActive: false
};

let scannerInstance = null;

// IndexedDB wrapper for persistence
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PokerRideDB", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("state")) {
        db.createObjectStore("state");
      }
    };
  });
}

async function saveState() {
  try {
    const db = await openDB();
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(state, STORAGE_KEY);
    await tx.complete;
    db.close();
  } catch(e) {
    // fallback to localStorage if needed
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

async function loadState() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readonly");
      const store = tx.objectStore("state");
      const request = store.get(STORAGE_KEY);
      request.onsuccess = () => {
        db.close();
        resolve(request.result);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch(e) {
    // fallback localStorage:
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  }
}

function isLocked() {
  if (!state.startTime) return false;
  const now = Date.now();
  const elapsed = now - state.startTime;
  const dayMs = 24 * 60 * 60 * 1000;
  return elapsed > dayMs;
}

async function startRide() {
  const name = document.getElementById("rider-name").value.trim();
  const eventId = document.getElementById("event-id").value.trim();
  const mode = document.getElementById("mode-select").value;

  if (!name) return alert("Please enter Rider Name.");
  if (!eventId) return alert("Please enter Event ID.");

  state = {
    riderName: name,
    eventId: eventId,
    mode: mode,
    startTime: Date.now(),
    deck: [...fullDeck],
    hand: {},
    gameActive: true
  };
  await saveState();

  showScreen("scan-screen");
  startScanner();
}

function startScanner() {
  const elementId = "qr-reader";
  if (scannerInstance) {
    scannerInstance.stop().catch(() => {});
  }
  scannerInstance = new Html5Qrcode(elementId);
  scannerInstance.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    qrText => {
      scannerInstance.stop().catch(() => {});
      handleQR(qrText);
    }
  ).catch(console.error);
}

function parseStationFromQR(text) {
  try {
    if (text.startsWith("http")) {
      const url = new URL(text);
      return {
        stationId: url.searchParams.get("sid"),
        eventId: url.searchParams.get("event")
      };
    }
  } catch {}

  // fallback parsing: key=value;key=value
  const parts = text.split(";");
  let sid = null, eventId = null;
  parts.forEach(p => {
    const [k,v] = p.split("=");
    if(k === "sid") sid = v;
    if(k === "event") eventId = v;
  });
  return { stationId: sid, eventId };
}

async function handleQR(text) {
  if (isLocked()) {
    showScreen("locked-screen");
    return;
  }

  const { stationId, eventId } = parseStationFromQR(text);
  if (!stationId) {
    alert("Invalid station QR code.");
    goToScan();
    return;
  }

  if (eventId && eventId !== state.eventId) {
    alert("This station belongs to a different event.");
    goToScan();
    return;
  }

  await drawCard(stationId);
}

async function drawCard(stationId) {
  if (state.hand[stationId]) {
    showCard(stationId, state.hand[stationId]);
    return;
  }

  if (state.deck.length === 0) {
    alert("No cards left in deck.");
    return;
  }

  const index = Math.floor(Math.random() * state.deck.length);
  const card = state.deck.splice(index, 1)[0];
  state.hand[stationId] = card;

  await saveState();

  showCard(stationId, card);
}

function showCard(stationId, card) {
  document.getElementById("station-label").innerText = `Station ${stationId}`;
  document.getElementById("card-display").innerText = card;
  showScreen("card-screen");
}

function showHand() {
  const container = document.getElementById("hand-cards");
  container.innerHTML = "";

  const stations = Object.keys(state.hand).sort();
  stations.forEach(station => {
    const div = document.createElement("div");
    div.innerText = `${station}: ${state.hand[station]}`;
    container.appendChild(div);
  });

  const rankDiv = document.getElementById("hand-rank");
  const { best5, rank } = evaluateHand();
  rankDiv.innerText = `Best 5: ${best5.join(", ")} — ${rank}`;

  showScreen("hand-screen");
}

// Placeholder evaluator: returns first 5 cards and "Hand evaluation TBD"
function evaluateHand() {
  const cards = Object.values(state.hand);
  const best5 = cards.slice(0, 5);
  return { best5, rank: "Hand evaluation TBD" };
}

function goToScan() {
  showScreen("scan-screen");
  startScanner();
}

function showExport() {
  const exportDiv = document.getElementById("judge-qr");
  exportDiv.innerHTML = "";

  const { best5, rank } = evaluateHand();
  const payload = {
    event: state.eventId,
    rider: state.riderName,
    mode: state.mode,
    stations: Object.keys(state.hand).sort(),
    hand: state.hand,
    best5,
    rank,
    timestamp: state.startTime
  };

  new QRCode(exportDiv, {
    text: JSON.stringify(payload),
    width: 256,
    height: 256
  });

  showScreen("export-screen");
}

async function resetForNewEvent() {
  state = {
    riderName: "",
    eventId: "",
    mode: "5-card",
    startTime: null,
    deck: [],
    hand: {},
    gameActive: false
  };
  await saveState();
  location.reload();
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

async function loadAppState() {
  const savedState = await loadState();
  if (savedState) {
    state = savedState;

    if (isLocked()) {
      showScreen("locked-screen");
      return;
    }

    if (state.gameActive) {
      showScreen("scan-screen");
      startScanner();
    } else {
      showScreen("start-screen");
    }
  } else {
    showScreen("start-screen");
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.gameActive && !isLocked()) {
    // optionally restart scanner when app returns focus
  }
});

// Initialize app
loadAppState();
