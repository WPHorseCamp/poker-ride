/* =====================================================================
   Poker Ride — app.js  (multi-hand edition)
   Up to 5 named players share one phone; each gets their own deck.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------- Config ---------------- */
  var STORAGE_KEY = "pokerRideStateV2";   // multi-player format
  var LEGACY_KEY  = "pokerRideState";     // old single-player format (auto-migrated)
  var RESTART_KEY = "pokerRideRestarts";
  var STATIONS    = ["S1","S2","S3","S4","S5"];
  var RANKS       = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  var SUITS       = [
    { s:"S", glyph:"♠", red:false },
    { s:"H", glyph:"♥", red:true  },
    { s:"D", glyph:"♦", red:true  },
    { s:"C", glyph:"♣", red:false }
  ];
  var SUIT_MAP = {};
  SUITS.forEach(function (x) { SUIT_MAP[x.s] = x; });
  var MAX_HANDS = 5;

  /* ---------------- State ---------------- */
  /*
   * state = {
   *   players: [ { name, deck:[{r,s}…], hand:{S1:{r,s},…} }, … ],
   *   active:  0   — index of the player currently being served
   * }
   */
  var state = null;

  function freshDeck() {
    var deck = [];
    for (var i = 0; i < SUITS.length; i++)
      for (var j = 0; j < RANKS.length; j++)
        deck.push({ r: RANKS[j], s: SUITS[i].s });
    return deck; // 52 cards, unshuffled (random draw handles randomness)
  }

  function newPlayer(name) {
    return { name: name || "Rider", hand: {}, deck: freshDeck() };
  }

  /* ---------------- Persistence ---------------- */
  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.players) && s.players.length > 0) return s;
      }
      // Migrate legacy single-player save
      var leg = localStorage.getItem(LEGACY_KEY);
      if (leg) {
        var old = JSON.parse(leg);
        if (old && old.name && old.deck && old.hand) {
          var migrated = { players:[{ name:old.name, deck:old.deck, hand:old.hand }], active:0 };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return migrated;
        }
      }
    } catch (e) {}
    return null;
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast("Could not save — storage full or blocked."); }
  }

  /* ---------------- Player helpers ---------------- */
  function curPlayer() {
    if (!state || !state.players) return null;
    return state.players[state.active] || state.players[0];
  }

  function drawnCountFor(p) {
    if (!p || !p.hand) return 0;
    return STATIONS.filter(function (s) { return p.hand[s]; }).length;
  }

  function drawnCount() { return drawnCountFor(curPlayer()); }

  /* ---------------- Daily restart counter ---------------- */
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate();
  }
  function getRestartInfo() {
    try {
      var r = JSON.parse(localStorage.getItem(RESTART_KEY));
      if (r && r.date === todayStr() && typeof r.count === "number") return r;
    } catch(e) {}
    return { date:todayStr(), count:0 };
  }
  function bumpRestart() {
    var info = getRestartInfo();
    info.count += 1; info.date = todayStr();
    try { localStorage.setItem(RESTART_KEY, JSON.stringify(info)); } catch(e) {}
    return info;
  }

  /* ---------------- Draw logic ---------------- */
  function drawForStation(sid) {
    var p = curPlayer();
    if (!p) return null;
    if (p.hand[sid]) return p.hand[sid];         // already drawn — return same card
    if (!p.deck || p.deck.length === 0) return null;
    var idx  = Math.floor(Math.random() * p.deck.length);
    var card = p.deck.splice(idx, 1)[0];
    p.hand[sid] = card;
    saveState();
    return card;
  }

  /* ---------------- Screen routing ---------------- */
  var screens = {
    start: document.getElementById("screen-start"),
    scan:  document.getElementById("screen-scan"),
    card:  document.getElementById("screen-card"),
    hand:  document.getElementById("screen-hand")
  };
  var current = "start";

  function show(name) {
    if (current === "scan" && name !== "scan") stopScanner();
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("active", k === name);
    });
    current = name;
    if (name === "scan") { buildPlayerTabs(); startScanner(); }
    if (name === "hand")   renderHand();
    window.scrollTo(0, 0);
  }

  /* ---------------- Player tabs on scan screen ---------------- */
  function buildPlayerTabs() {
    var container = document.getElementById("player-tabs");
    if (!container || !state) return;
    container.innerHTML = "";

    if (state.players.length <= 1) {
      container.classList.add("hidden");
      updateScanTitle();
      return;
    }

    container.classList.remove("hidden");
    state.players.forEach(function (p, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      var cnt = drawnCountFor(p);
      btn.textContent = p.name + (cnt === STATIONS.length ? " ✓" : " ("+cnt+"/5)");
      btn.className   = "player-tab" + (i === state.active ? " active" : "");
      btn.addEventListener("click", function () {
        state.active = i;
        saveState();
        buildPlayerTabs();
        refreshManual();
        updateScanTitle();
        // Show/hide camera overlay for newly selected player
        var done = drawnCount() === STATIONS.length;
        var statusEl = document.getElementById("scan-status");
        if (done) {
          if (statusEl) statusEl.textContent = p.name + " has all 5 cards! Tap ♠ to view hand.";
          showCameraOverlay(false);
          setManualVisible(true);
        } else {
          if (statusEl) statusEl.textContent = "Tap the button above to open your camera.";
          showCameraOverlay(true);
          setManualVisible(false);
        }
      });
      container.appendChild(btn);
    });
    updateScanTitle();
  }

  function updateScanTitle() {
    var title = document.getElementById("scan-topbar-title");
    if (!title || !state) return;
    title.textContent = (state.players.length > 1 && curPlayer())
      ? curPlayer().name + "'s turn"
      : "Scan station";
  }

  /* ---------------- Card display screen ---------------- */
  function renderCard(sid, card) {
    var suit      = SUIT_MAP[card.s];
    var stationNo = sid.replace(/^S/i, "");
    var p         = curPlayer();
    var titleEl   = document.getElementById("card-station-title");
    if (titleEl) titleEl.textContent = (state.players.length > 1 && p)
      ? p.name + " — Station " + stationNo
      : "Station " + stationNo;

    var el = document.getElementById("playing-card");
    el.classList.toggle("red", suit.red);
    el.querySelector(".pc-suit-big").textContent = suit.glyph;
    var ranks = el.querySelectorAll(".pc-rank");
    ranks[0].textContent = card.r;
    ranks[1].textContent = card.r;
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";

    var cap = document.getElementById("card-caption");
    if (cap) cap.textContent = cardName(card) + " of " + suitName(card.s);
    var prog = document.getElementById("card-progress");
    var n    = drawnCount();
    if (prog) prog.textContent = n + " of " + STATIONS.length + " stations drawn" +
      (n === STATIONS.length ? " — ride complete!" : "");
  }

  function cardName(c) { return { J:"Jack",Q:"Queen",K:"King",A:"Ace" }[c.r] || c.r; }
  function suitName(s) { return { S:"Spades",H:"Hearts",D:"Diamonds",C:"Clubs" }[s]; }

  /* ---------------- Hand screen — all players ---------------- */
  function renderHand() {
    var stage = document.getElementById("hand-stage");
    if (!stage || !state) return;
    stage.innerHTML = "";  // JS builds all content

    var multi = state.players.length > 1;

    state.players.forEach(function (p, idx) {
      var filled = STATIONS.map(function(s){ return p.hand[s]||null; }).filter(Boolean);

      var section = document.createElement("div");
      section.className = "hand-player-section";

      // Player name heading (multi-player only)
      if (multi) {
        var nameEl = document.createElement("p");
        nameEl.className = "hand-rider";
        nameEl.textContent = p.name;
        section.appendChild(nameEl);
      }

      // Mini cards
      var cardsDiv = document.createElement("div");
      cardsDiv.className = "hand-cards";
      STATIONS.forEach(function (s) {
        var card = p.hand[s];
        var mc   = document.createElement("div");
        if (card) {
          var suit = SUIT_MAP[card.s];
          mc.className = "mini-card" + (suit.red ? " red" : "");
          mc.innerHTML = "<span class='mini-rank'>"+card.r+"</span>"+
                         "<span class='mini-suit'>"+suit.glyph+"</span>"+
                         "<span class='mini-station'>"+s+"</span>";
        } else {
          mc.className = "mini-card empty";
          mc.innerHTML = "<span class='mini-rank'>?</span>"+
                         "<span class='mini-station'>"+s+"</span>";
        }
        cardsDiv.appendChild(mc);
      });
      section.appendChild(cardsDiv);

      // Hand evaluation
      var rankDiv = document.createElement("div");
      rankDiv.className = "hand-rank";
      if (filled.length > 0) {
        var res = evaluateHand(filled);
        rankDiv.innerHTML = "<div class='rank-name'>"+res.name+"</div>"+
          "<div class='rank-desc'>"+(filled.length===STATIONS.length
            ? res.desc
            : res.desc + " &middot; draw "+(STATIONS.length-filled.length)+" more")+"</div>";
      } else {
        rankDiv.innerHTML = "<div class='rank-desc'>No cards yet — scan a station first.</div>";
      }
      section.appendChild(rankDiv);

      // Finish-line QR (only when all 5 stations done)
      if (filled.length === STATIONS.length) {
        var qrSec = document.createElement("div");
        qrSec.className = "hand-qr-section";
        var qrLbl = document.createElement("p");
        qrLbl.className = "qr-label";
        qrLbl.textContent = "\uD83D\uDCF1 Show this QR at the finish line";
        var qrDiv = document.createElement("div");
        qrDiv.className = "hand-qr";
        qrSec.appendChild(qrLbl);
        qrSec.appendChild(qrDiv);
        section.appendChild(qrSec);
        renderHandQR(p, qrDiv);
      }

      stage.appendChild(section);

      // Divider between players
      if (multi && idx < state.players.length - 1) {
        var hr = document.createElement("hr");
        hr.className = "player-divider";
        stage.appendChild(hr);
      }
    });

    // Daily restart count (shown once, below all players)
    var n  = getRestartInfo().count;
    var rs = document.createElement("p");
    rs.className = "hand-restarts" + (n > 0 ? " flag" : "");
    rs.textContent = n === 0
      ? "Restarts today: 0"
      : "⚠ Ride restarted " + n + (n===1 ? " time today" : " times today");
    stage.appendChild(rs);
  }

  /* ---------------- Poker evaluation (unchanged) ---------------- */
  function rankVal(r) {
    return { J:11,Q:12,K:13,A:14 }[r] || parseInt(r, 10);
  }

  function evaluateHand(cards) {
    if (!cards.length) return { name:"No cards yet", desc:"" };
    var vals  = cards.map(function(c){ return rankVal(c.r); }).sort(function(a,b){ return a-b; });
    var suits = cards.map(function(c){ return c.s; });

    var counts = {};
    vals.forEach(function(v){ counts[v]=(counts[v]||0)+1; });
    var groups = Object.keys(counts).map(function(k){ return counts[k]; }).sort(function(a,b){ return b-a; });

    var isFlush    = cards.length===5 && suits.every(function(s){ return s===suits[0]; });
    var isStraight = false;
    if (cards.length === 5) {
      var uniq = Object.keys(counts).map(Number).sort(function(a,b){ return a-b; });
      if (uniq.length === 5) {
        if (uniq[4]-uniq[0]===4) isStraight = true;
        if (uniq[0]===2&&uniq[1]===3&&uniq[2]===4&&uniq[3]===5&&uniq[4]===14) isStraight = true;
      }
    }
    if (cards.length === 5) {
      if (isStraight&&isFlush&&vals[4]===14&&vals[0]===10) return { name:"Royal Flush",    desc:"10–A, all one suit. Unbeatable!" };
      if (isStraight&&isFlush)                              return { name:"Straight Flush", desc:"Five in a row, all one suit." };
      if (groups[0]===4)                                    return { name:"Four of a Kind", desc:"Four matching ranks." };
      if (groups[0]===3&&groups[1]===2)                     return { name:"Full House",     desc:"Three of a kind plus a pair." };
      if (isFlush)                                          return { name:"Flush",          desc:"Five cards of one suit." };
      if (isStraight)                                       return { name:"Straight",       desc:"Five cards in a row." };
    }
    if (groups[0]===3)             return { name:"Three of a Kind", desc:"Three matching ranks." };
    if (groups[0]===2&&groups[1]===2) return { name:"Two Pair",     desc:"Two separate pairs." };
    if (groups[0]===2)             return { name:"One Pair",        desc:"Two matching ranks." };
    return { name:"High Card", desc:"Highest card: "+topCardName(vals[vals.length-1])+"." };
  }

  function topCardName(v) {
    return { 11:"Jack",12:"Queen",13:"King",14:"Ace" }[v] || String(v);
  }

  /* ---------------- Station handling ---------------- */
  function handleStation(rawText) {
    var sid = parseStation(rawText);
    if (!sid) { toast("That QR code isn't a station code."); return; }
    if (STATIONS.indexOf(sid) === -1) { toast("Unknown station: " + sid); return; }
    var p       = curPlayer();
    var already = p && !!p.hand[sid];
    var card    = drawForStation(sid);
    if (!card) { toast("Deck is empty."); return; }
    renderCard(sid, card);
    show("card");
    if (already) toast("You already drew at " + sid +
      (state.players.length > 1 && p ? " for " + p.name : "") + ".");
    refreshManual();
  }

  function parseStation(text) {
    if (!text) return null;
    var m = String(text).trim().match(/S\s*([0-9]+)/i);
    return m ? "S" + m[1] : null;
  }

  /* ---------------- Camera engine selection ---------------- */
  var video  = document.getElementById("scan-video");
  var canvas = document.getElementById("scan-canvas");
  var ctx    = canvas ? canvas.getContext("2d", { willReadFrequently:true }) : null;
  var stream = null, rafId = null, scanning = false, detector = null;
  var engine = "none";
  var h5 = null, h5running = false;

  function getH5Lib() {
    if (window.__Html5QrcodeLibrary__ && window.__Html5QrcodeLibrary__.Html5Qrcode)
      return window.__Html5QrcodeLibrary__.Html5Qrcode;
    if (typeof window.Html5Qrcode !== "undefined") return window.Html5Qrcode;
    return null;
  }
  function pickEngine() {
    if (getH5Lib())                       return "html5qrcode";
    if (typeof window.jsQR==="function")  return "jsqr";
    if ("BarcodeDetector" in window)      return "barcode";
    return "none";
  }

  /* ---------------- Scanner (tap-to-start for older iOS) ---------------- */
  function startScanner() {
    var status = document.getElementById("scan-status");
    refreshManual();
    var done = drawnCount() === STATIONS.length;

    if (done) {
      var p = curPlayer();
      if (status) status.textContent = (state && state.players.length > 1 && p)
        ? p.name + " has all 5 cards! Tap ♠ to view hand."
        : "All 5 stations done! Tap ♠ to view your hand.";
      showCameraOverlay(false);
      setManualVisible(true);
      return;
    }

    engine = pickEngine();
    if (engine === "none") {
      if (status) status.textContent = "Live scanning not supported. Tap your station below.";
      showCameraOverlay(false);
      setManualVisible(true);
      return;
    }

    showCameraOverlay(true);
    setManualVisible(false);
    if (status) status.textContent = "Tap the button above to open your camera.";
  }

  function showCameraOverlay(visible) {
    var overlay = document.getElementById("camera-start-overlay");
    if (overlay) overlay.classList.toggle("hidden", !visible);
    var frame = document.querySelector(".scan-frame");
    if (frame) frame.classList.toggle("hidden", visible);
  }

  function startCameraFeed() {
    showCameraOverlay(false);
    var status   = document.getElementById("scan-status");
    var retryBtn = document.getElementById("camera-retry-btn");
    if (retryBtn) retryBtn.classList.add("hidden");

    var done  = drawnCount() === STATIONS.length;
    var frame = document.querySelector(".scan-frame");
    var reader = document.getElementById("qr-reader");

    function onCameraFail(msg) {
      if (status) status.innerHTML = msg;
      setManualVisible(true);
      if (retryBtn) retryBtn.classList.remove("hidden");
    }

    if (engine === "html5qrcode") {
      video.classList.add("hidden");
      if (frame) frame.classList.add("hidden");
      reader.classList.remove("hidden");
      setManualVisible(false);
      if (!done && status) status.textContent = "Starting camera…";
      var Lib = getH5Lib();
      try { h5 = new Lib("qr-reader", { verbose:false }); }
      catch(e) { h5 = new Lib("qr-reader"); }
      h5.start({ facingMode:"environment" },
        { fps:10, qrbox:function(w,h){ var m=Math.floor(Math.min(w,h)*0.7); return {width:m,height:m}; }, aspectRatio:1.0 },
        function(text){ onDetected(text); },
        function(){}
      ).then(function(){
        h5running = true;
        if (!done && status) status.textContent = "Point your camera at the station QR code.";
      }).catch(function(){
        onCameraFail("Camera access was blocked.<br>"+
          "<small>iPhone: Settings → Safari → Camera → Allow<br>"+
          "Then tap <strong>Try Camera Again</strong> below.</small>");
        cleanupH5();
      });
      return;
    }

    video.classList.remove("hidden");
    if (frame) frame.classList.remove("hidden");
    reader.classList.add("hidden");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onCameraFail("Camera not available. Tap your station below."); return;
    }
    setManualVisible(false);
    if (!done && status) status.textContent = "Starting camera…";
    navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:"environment" } }, audio:false })
      .then(function(s){ stream=s; video.srcObject=s; return video.play(); })
      .then(function(){
        scanning = true;
        if (!done && status) status.textContent = "Point your camera at the station QR code.";
        if (engine==="barcode") {
          try { detector=new window.BarcodeDetector({ formats:["qr_code"] }); }
          catch(e) { detector=new window.BarcodeDetector(); }
        }
        tick();
      }).catch(function(){
        onCameraFail("Camera access was blocked.<br>"+
          "<small>Go to Settings and allow camera access, then tap <strong>Try Camera Again</strong> below.</small>");
      });
  }

  function cleanupH5() {
    if (h5) { try { h5.clear(); } catch(e){} }
    h5 = null; h5running = false;
  }

  function stopScanner() {
    scanning = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (stream) { stream.getTracks().forEach(function(t){ t.stop(); }); stream = null; }
    try { video.srcObject = null; } catch(e){}
    if (h5) {
      var inst = h5;
      if (h5running) inst.stop().then(function(){ try{inst.clear();}catch(e){} }).catch(function(){ try{inst.clear();}catch(e){} });
      else try { inst.clear(); } catch(e){}
      h5 = null; h5running = false;
    }
  }

  function tick() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      if (engine === "jsqr") {
        var w=video.videoWidth, ht=video.videoHeight;
        if (w && ht) {
          canvas.width=w; canvas.height=ht;
          ctx.drawImage(video,0,0,w,ht);
          var img  = ctx.getImageData(0,0,w,ht);
          var code = window.jsQR(img.data,w,ht,{ inversionAttempts:"dontInvert" });
          if (code && code.data) { onDetected(code.data); return; }
        }
        rafId = requestAnimationFrame(tick);
      } else if (engine === "barcode") {
        detector.detect(video).then(function(codes){
          if (codes && codes.length) { onDetected(codes[0].rawValue); return; }
          rafId = requestAnimationFrame(tick);
        }).catch(function(){ rafId = requestAnimationFrame(tick); });
      }
    } else { rafId = requestAnimationFrame(tick); }
  }

  var lastDetectAt = 0;
  function onDetected(text) {
    var now = Date.now();
    if (now - lastDetectAt < 1200) {
      if (engine==="jsqr"||engine==="barcode") rafId = requestAnimationFrame(tick);
      return;
    }
    lastDetectAt = now;
    if (navigator.vibrate) try { navigator.vibrate(40); } catch(e){}
    stopScanner();
    handleStation(text);
  }

  /* ---------------- Manual station buttons ---------------- */
  function buildManual() {
    var grid = document.getElementById("manual-stations");
    if (!grid) return;
    grid.innerHTML = "";
    STATIONS.forEach(function (sid) {
      var b = document.createElement("button");
      b.type = "button"; b.dataset.sid = sid; b.textContent = sid;
      b.addEventListener("click", function(){ handleStation(sid); });
      grid.appendChild(b);
    });
  }

  function refreshManual() {
    if (!state) return;
    var p    = curPlayer();
    var grid = document.getElementById("manual-stations");
    if (!grid || !p) return;
    Array.prototype.forEach.call(grid.children, function(b){
      b.classList.toggle("done", !!(p.hand[b.dataset.sid]));
    });
  }

  function setManualVisible(vis) {
    var block = document.querySelector(".manual-block");
    if (block) block.classList.toggle("hidden", !vis);
  }

  /* ---------------- QR code per player ---------------- */
  function buildHandPayload(player) {
    var cards = STATIONS.map(function(sid){
      var c = player.hand[sid]; return c ? (c.r+c.s) : "??";
    });
    return "PR1|" + player.name + "|" + cards.join(",");
  }

  function renderHandQR(player, container) {
    if (!container) return;
    container.innerHTML = "";
    var payload = buildHandPayload(player);
    if (typeof QRCode !== "undefined") {
      try {
        new QRCode(container, { text:payload, width:200, height:200,
          colorDark:"#1c1c1c", colorLight:"#f6f1e3", correctLevel:QRCode.CorrectLevel.M });
        return;
      } catch(e){}
    }
    container.innerHTML = "<p class='qr-fallback'>QR library not loaded — show this code:<br>"+
      "<strong>"+payload+"</strong></p>";
  }

  /* ---------------- Dynamic start form ---------------- */
  var nameInputCount = 1;

  function buildStartForm() {
    nameInputCount = 1;
    var container = document.getElementById("name-inputs-container");
    if (!container) return;
    container.innerHTML = "";
    addNameRow(container, 1);
    updateAddHandBtn();
  }

  function addNameRow(container, num) {
    var row   = document.createElement("div");
    row.className = "name-row";

    var label = document.createElement("label");
    label.className   = "name-row-label";
    label.textContent = num === 1 ? "Your name" : "Hand " + num + " name";

    var wrap  = document.createElement("div");
    wrap.className = "name-row-wrap";

    var input = document.createElement("input");
    input.type = "text"; input.inputMode = "text"; input.maxLength = 24;
    input.className   = "name-row-input";
    input.placeholder = num === 1 ? "e.g. Joe" : "e.g. Sam";
    if (num === 1) input.required = true;
    wrap.appendChild(input);

    if (num > 1) {
      var rmBtn = document.createElement("button");
      rmBtn.type = "button"; rmBtn.className = "remove-name-btn";
      rmBtn.textContent = "✕";
      rmBtn.setAttribute("aria-label", "Remove hand " + num);
      rmBtn.addEventListener("click", function(){
        row.remove(); renumberRows(); updateAddHandBtn();
      });
      wrap.appendChild(rmBtn);
    }

    row.appendChild(label);
    row.appendChild(wrap);
    container.appendChild(row);
  }

  function renumberRows() {
    var rows = document.querySelectorAll(".name-row");
    rows.forEach(function(row, i){
      var num = i + 1;
      var lbl = row.querySelector(".name-row-label");
      if (lbl) lbl.textContent = num===1 ? "Your name" : "Hand " + num + " name";
      var inp = row.querySelector(".name-row-input");
      if (inp) {
        inp.placeholder = num===1 ? "e.g. Joe" : "e.g. Sam";
        if (num===1) inp.required = true; else inp.removeAttribute("required");
      }
    });
    nameInputCount = rows.length;
  }

  function updateAddHandBtn() {
    var btn  = document.getElementById("add-hand-btn");
    if (!btn) return;
    var rows = document.querySelectorAll(".name-row");
    var atMax = rows.length >= MAX_HANDS;
    btn.disabled = atMax;
    btn.classList.toggle("hidden", atMax);
  }

  function getStartFormNames() {
    var names = [];
    document.querySelectorAll(".name-row-input").forEach(function(inp){
      var v = inp.value.trim(); if (v) names.push(v);
    });
    return names;
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.add("hidden"); }, 2600);
  }

  /* ---------------- Wiring ---------------- */
  function init() {
    buildManual();
    buildStartForm();

    // ---- + ADD HAND button ----
    var addBtn = document.getElementById("add-hand-btn");
    if (addBtn) {
      addBtn.addEventListener("click", function(){
        var container = document.getElementById("name-inputs-container");
        if (!container) return;
        var rows = container.querySelectorAll(".name-row");
        if (rows.length >= MAX_HANDS) return;
        nameInputCount = rows.length + 1;
        addNameRow(container, nameInputCount);
        updateAddHandBtn();
        var allInputs = container.querySelectorAll(".name-row-input");
        if (allInputs.length) allInputs[allInputs.length-1].focus();
      });
    }

    // ---- Resume button ----
    var saved = loadState();
    var resumeBtn = document.getElementById("resume-btn");
    if (saved && saved.players && saved.players.length > 0) {
      state = saved;
      var names = saved.players.map(function(p){ return p.name; }).join(", ");
      var totalDrawn    = saved.players.reduce(function(acc,p){ return acc+drawnCountFor(p); },0);
      var totalPossible = saved.players.length * STATIONS.length;
      resumeBtn.textContent = "Resume ride — " + names + " (" + totalDrawn + "/" + totalPossible + ")";
      resumeBtn.classList.remove("hidden");
      resumeBtn.addEventListener("click", function(){ show("scan"); });
      // Pre-fill first name
      var firstInput = document.querySelector(".name-row-input");
      if (firstInput && saved.players[0]) firstInput.value = saved.players[0].name;
    }

    // ---- Start form submit ----
    document.getElementById("start-form").addEventListener("submit", function(e){
      e.preventDefault();
      var names = getStartFormNames();
      if (!names.length || !names[0]) { toast("Please enter at least one rider name."); return; }
      state = { players: names.map(function(n){ return newPlayer(n); }), active:0 };
      saveState();
      show("scan");
    });

    // ---- Restart button ----
    document.getElementById("restart-btn").addEventListener("click", function(){
      if (!confirm("Restart the ride? This clears all cards.")) return;
      var info   = bumpRestart();
      var names  = state && state.players ? state.players.map(function(p){return p.name;}) : ["Rider"];
      state = null;
      show("start");
      // Re-populate the start form with existing names so rider just taps Start Ride
      buildStartForm();
      var container = document.getElementById("name-inputs-container");
      if (container) {
        var firstInput = container.querySelector(".name-row-input");
        if (firstInput && names[0]) firstInput.value = names[0];
        for (var i=1; i<names.length; i++) {
          addNameRow(container, i+1);
          var allInputs = container.querySelectorAll(".name-row-input");
          if (allInputs[i]) allInputs[i].value = names[i];
        }
        updateAddHandBtn();
      }
      toast("Ride reset (restart #" + info.count + " today).");
    });

    // ---- Camera buttons ----
    var camBtn   = document.getElementById("camera-start-btn");
    var retryBtn = document.getElementById("camera-retry-btn");
    if (camBtn)   camBtn.addEventListener("click",   function(){ startCameraFeed(); });
    if (retryBtn) retryBtn.addEventListener("click", function(){ startCameraFeed(); });

    // ---- Nav buttons ----
    document.querySelectorAll("[data-nav]").forEach(function(el){
      el.addEventListener("click", function(){
        var dest = el.getAttribute("data-nav");
        if (!state && dest !== "start") return;
        show(dest);
      });
    });

    // ---- Pause camera when tab hidden ----
    document.addEventListener("visibilitychange", function(){
      if (document.hidden && current==="scan") stopScanner();
      else if (!document.hidden && current==="scan") startScanner();
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  /* ---------------- Service worker ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("service-worker.js").catch(function(){});
    });
  }

  /* testing exports */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { freshDeck:freshDeck, evaluateHand:evaluateHand,
      parseStation:parseStation, rankVal:rankVal, STATIONS:STATIONS,
      getRestartInfo:getRestartInfo, bumpRestart:bumpRestart, todayStr:todayStr };
  }
})();
