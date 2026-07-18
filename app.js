/* =====================================================================
   Poker Ride — app.js  v3.0
   Elderly-friendly redesign | 5 & 7 card modes | Settings | Auto-save
   ===================================================================== */
(function () {
  "use strict";

  /* ---- Storage keys ---- */
  var SETTINGS_KEY = "pokerRideSettings";
  var STORAGE_KEY  = "pokerRideStateV2";
  var LEGACY_KEY   = "pokerRideState";
  var RESTART_KEY  = "pokerRideRestarts";
  var MAX_HANDS    = 5;

  /* ---- Settings ---- */
  var settings = { clubName:"Poker Ride", rideDate:"", contact:"", stations:5 };

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s.clubName  !== undefined) settings.clubName  = s.clubName;
        if (s.rideDate  !== undefined) settings.rideDate  = s.rideDate;
        if (s.contact   !== undefined) settings.contact   = s.contact;
        if (s.stations  !== undefined) settings.stations  = +s.stations;
      }
    } catch(e) {}
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e) {}
  }

  /* ---- Stations list (computed from settings.stations) ---- */
  var STATIONS = [];
  function makeStations() {
    var n = settings.stations === 7 ? 7 : 5;
    var arr = [];
    for (var i = 1; i <= n; i++) arr.push("S" + i);
    return arr;
  }

  /* ---- Deck & cards ---- */
  var RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  var SUITS = [
    { s:"S", glyph:"\u2660", red:false },
    { s:"H", glyph:"\u2665", red:true  },
    { s:"D", glyph:"\u2666", red:true  },
    { s:"C", glyph:"\u2663", red:false }
  ];
  var SUIT_MAP = {};
  SUITS.forEach(function(x) { SUIT_MAP[x.s] = x; });

  function freshDeck() {
    var deck = [];
    for (var i = 0; i < SUITS.length; i++)
      for (var j = 0; j < RANKS.length; j++)
        deck.push({ r:RANKS[j], s:SUITS[i].s });
    return deck;
  }

  function newPlayer(name) {
    return { name:name||"Rider", hand:{}, deck:freshDeck() };
  }

  /* ---- State ---- */
  var state = null;

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate();
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.players) && s.players.length > 0) return s;
      }
      var leg = localStorage.getItem(LEGACY_KEY);
      if (leg) {
        var old = JSON.parse(leg);
        if (old && old.name && old.deck && old.hand) {
          var m = { players:[{name:old.name,deck:old.deck,hand:old.hand}], active:0, date:todayStr() };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
          return m;
        }
      }
    } catch(e) {}
    return null;
  }

  /* Auto-save after every card drawn — survives battery death, app switching, phone calls */
  function saveState() {
    if (!state) return;
    state.date = state.date || todayStr();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
  }

  /* ---- Player helpers ---- */
  function curPlayer() {
    if (!state || !state.players) return null;
    return state.players[state.active] || state.players[0];
  }

  function drawnCountFor(p) {
    if (!p || !p.hand) return 0;
    return STATIONS.filter(function(s) { return p.hand[s]; }).length;
  }

  function drawnCount() { return drawnCountFor(curPlayer()); }

  /* ---- Restart counter ---- */
  function getRestartInfo() {
    try {
      var r = JSON.parse(localStorage.getItem(RESTART_KEY));
      if (r && r.date === todayStr() && typeof r.count === "number") return r;
    } catch(e) {}
    return { date:todayStr(), count:0 };
  }

  function bumpRestart() {
    var info = getRestartInfo();
    info.count++; info.date = todayStr();
    try { localStorage.setItem(RESTART_KEY, JSON.stringify(info)); } catch(e) {}
    return info;
  }

  /* ---- Draw logic ---- */
  function drawForStation(sid) {
    var p = curPlayer();
    if (!p) return null;
    if (p.hand[sid]) return p.hand[sid];
    if (!p.deck || p.deck.length === 0) return null;
    var idx  = Math.floor(Math.random() * p.deck.length);
    var card = p.deck.splice(idx, 1)[0];
    p.hand[sid] = card;
    saveState();   /* <-- auto-save immediately on every draw */
    return card;
  }

  /* ================================================================
     POKER EVALUATION
  ================================================================ */
  function rankVal(r) {
    return { J:11, Q:12, K:13, A:14 }[r] || parseInt(r, 10);
  }

  function scoreHand5(cards) {
    if (!cards || cards.length < 5) return [0];
    var vals  = cards.map(function(c){ return rankVal(c.r); }).sort(function(a,b){ return a-b; });
    var suits = cards.map(function(c){ return c.s; });
    var counts = {};
    vals.forEach(function(v){ counts[v]=(counts[v]||0)+1; });
    var groups = Object.keys(counts).map(function(k){ return {val:+k, cnt:counts[k]}; })
                     .sort(function(a,b){ return b.cnt-a.cnt||b.val-a.val; });
    var isFlush = suits.every(function(s){ return s===suits[0]; });
    var uniq = Object.keys(counts).map(Number).sort(function(a,b){ return a-b; });
    var isStraight = false, straightHigh = vals[4];
    if (uniq.length === 5) {
      if (uniq[4]-uniq[0]===4) { isStraight=true; straightHigh=uniq[4]; }
      if (uniq[0]===2&&uniq[1]===3&&uniq[2]===4&&uniq[3]===5&&uniq[4]===14)
        { isStraight=true; straightHigh=5; }
    }
    var hi = vals.slice().reverse();
    if (isStraight&&isFlush) return [8, straightHigh];
    if (groups[0].cnt===4)   return [7, groups[0].val, groups[1]?groups[1].val:0];
    if (groups[0].cnt===3&&groups[1]&&groups[1].cnt===2) return [6, groups[0].val, groups[1].val];
    if (isFlush)    return [5].concat(hi);
    if (isStraight) return [4, straightHigh];
    if (groups[0].cnt===3) return [3, groups[0].val, groups[1]?groups[1].val:0, groups[2]?groups[2].val:0];
    if (groups[0].cnt===2&&groups[1]&&groups[1].cnt===2) {
      var p1=Math.max(groups[0].val,groups[1].val), p2=Math.min(groups[0].val,groups[1].val);
      return [2, p1, p2, groups[2]?groups[2].val:0];
    }
    if (groups[0].cnt===2) {
      var kickers = groups.slice(1).map(function(g){ return g.val; }).sort(function(a,b){ return b-a; });
      return [1, groups[0].val].concat(kickers);
    }
    return [0].concat(hi);
  }

  function compareScore(a, b) {
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      var diff = (a[i]||0) - (b[i]||0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  /* Best 5 of 7 (for 7-card high hand) */
  function bestFiveOf(cards) {
    if (cards.length <= 5) return { hand:cards, indices:[0,1,2,3,4] };
    var best=null, bestScore=null, bestIdx=null;
    for (var i = 0; i < cards.length-1; i++) {
      for (var j = i+1; j < cards.length; j++) {
        var idx=[], hand=[];
        for (var k=0;k<cards.length;k++) { if(k!==i&&k!==j){idx.push(k);hand.push(cards[k]);} }
        var score=scoreHand5(hand);
        if (!best||compareScore(score,bestScore)>0){best=hand;bestScore=score;bestIdx=idx;}
      }
    }
    return { hand:best, indices:bestIdx, score:bestScore };
  }

  var HAND_NAMES = ['High Card','One Pair','Two Pair','Three of a Kind',
    'Straight','Flush','Full House','Four of a Kind','Straight Flush'];
  var HAND_DESCS = [
    'Highest card plays','Two matching ranks','Two separate pairs',
    'Three matching ranks','Five cards in a row','Five cards of one suit',
    'Three of a kind plus a pair','Four matching ranks','Five in a row, same suit'];

  function evaluateHand(cards) {
    if (!cards||!cards.length) return { name:"No cards yet", desc:"", rank:-1, score:[0] };
    var filled = cards.filter(Boolean);
    if (filled.length < 5) return { name:filled.length+" cards drawn",
      desc:"Visit "+(STATIONS.length-filled.length)+" more station"+(STATIONS.length-filled.length!==1?"s":""),
      rank:-1, score:[0] };
    var score = scoreHand5(filled);
    var isRoyal = score[0]===8 && score[1]===14;
    return {
      name: isRoyal ? 'Royal Flush! \uD83D\uDC51' : HAND_NAMES[score[0]],
      desc: HAND_DESCS[score[0]], rank:score[0], score:score
    };
  }

  /* Max draw cards allowed based on hand strength */
  function maxDiscards(handResult) {
    if (!handResult||handResult.rank<0) return 0;
    if (handResult.rank===0) return 3;
    if (handResult.rank===1) return (handResult.score[1]>=11)?1:2;
    if (handResult.rank===2) return 1;
    return 0;
  }

  /* ================================================================
     SCREEN ROUTING
  ================================================================ */
  var current = "start";

  function show(name) {
    if (current==="scan" && name!=="scan") stopScanner();
    document.querySelectorAll(".screen").forEach(function(s) {
      s.classList.toggle("active", s.id==="screen-"+name);
    });
    current = name;
    if (name==="start")    updateStartScreen();
    if (name==="scan")     { buildPlayerTabs(); startScanner(); updateHandStrip(); }
    if (name==="card")     updateHandStrip();
    if (name==="hand")     renderHand();
    if (name==="settings") populateSettings();
    window.scrollTo(0, 0);
  }

  /* ================================================================
     START SCREEN
  ================================================================ */
  function updateStartScreen() {
    var el;
    el = document.getElementById("club-name-display");
    if (el) el.textContent = settings.clubName || "Poker Ride";
    el = document.getElementById("ride-date-display");
    if (el) { el.textContent = settings.rideDate||""; el.style.display=settings.rideDate?"":"none"; }

    var saved = loadState();
    var resumeBtn = document.getElementById("resume-btn");
    if (saved && saved.players && saved.players.length>0) {
      state = saved;
      var names = saved.players.map(function(p){return p.name;}).join(", ");
      var drawn = saved.players.reduce(function(acc,p){return acc+drawnCountFor(p);},0);
      var total = saved.players.length * STATIONS.length;
      var isToday = saved.date === todayStr();
      resumeBtn.textContent = "\u25B6  " + (isToday?"Resume Today":"Resume Previous") +
        "  \u2014  " + names + "  (" + drawn + "/" + total + ")";
      resumeBtn.classList.remove("hidden");
    } else {
      resumeBtn.classList.add("hidden");
    }
  }

  /* ================================================================
     SETTINGS SCREEN
  ================================================================ */
  function populateSettings() {
    var el;
    el=document.getElementById("set-club-name"); if(el) el.value=settings.clubName||"";
    el=document.getElementById("set-ride-date"); if(el) el.value=settings.rideDate||"";
    el=document.getElementById("set-contact");   if(el) el.value=settings.contact||"";
    var s5=document.getElementById("mode-5"),s7=document.getElementById("mode-7");
    if(s5) s5.classList.toggle("active",settings.stations===5);
    if(s7) s7.classList.toggle("active",settings.stations===7);
  }

  function saveSettingsFromForm() {
    var el;
    el=document.getElementById("set-club-name"); if(el) settings.clubName=el.value.trim()||"Poker Ride";
    el=document.getElementById("set-ride-date"); if(el) settings.rideDate=el.value;
    el=document.getElementById("set-contact");   if(el) settings.contact=el.value.trim();
    saveSettings();
    STATIONS = makeStations();
    buildManual();
    toast("Settings saved!");
    show("start");
  }

  /* ================================================================
     PLAYER TABS
  ================================================================ */
  function buildPlayerTabs() {
    var container = document.getElementById("player-tabs");
    if (!container||!state) return;
    container.innerHTML = "";
    if (state.players.length<=1) { container.classList.add("hidden"); updateScanTitle(); return; }
    container.classList.remove("hidden");
    state.players.forEach(function(p, i) {
      var btn = document.createElement("button");
      btn.type="button";
      var cnt=drawnCountFor(p);
      btn.textContent = p.name+(cnt===STATIONS.length?" \u2713":" ("+cnt+"/"+STATIONS.length+")");
      btn.className = "player-tab"+(i===state.active?" active":"");
      btn.addEventListener("click", function() {
        state.active=i; saveState(); buildPlayerTabs(); refreshManual(); updateScanTitle(); updateHandStrip();
        var done=drawnCount()===STATIONS.length;
        var st=document.getElementById("scan-status");
        if (done) {
          if(st) st.textContent=p.name+" has all "+STATIONS.length+" cards! Tap VIEW MY HAND.";
          showCameraOverlay(false); setManualVisible(true);
        } else {
          if(st) st.textContent="Tap the button above to open your camera.";
          showCameraOverlay(true); setManualVisible(false);
        }
      });
      container.appendChild(btn);
    });
    updateScanTitle();
  }

  function updateScanTitle() {
    var title=document.getElementById("scan-topbar-title");
    if (!title||!state) return;
    title.textContent=(state.players.length>1&&curPlayer())
      ? curPlayer().name+"'s Turn" : "Scan Station";
  }

  /* ================================================================
     HAND STRIP  (mini cards visible on scan and card screens)
  ================================================================ */
  function updateHandStrip() {
    ["hand-strip","hand-strip-card"].forEach(function(stripId) {
      var strip=document.getElementById(stripId);
      if (!strip) return;
      if (!state) { strip.innerHTML=""; return; }
      var p=curPlayer();
      strip.innerHTML="";
      STATIONS.forEach(function(s) {
        var card=p&&p.hand[s];
        var mc=document.createElement("div");
        if (card) {
          var suit=SUIT_MAP[card.s];
          mc.className="strip-card"+(suit.red?" red":"");
          mc.innerHTML="<span class='strip-rank'>"+card.r+"</span><span class='strip-suit'>"+suit.glyph+"</span>";
        } else {
          mc.className="strip-card empty";
          mc.textContent=s;
        }
        strip.appendChild(mc);
      });
    });
  }

  /* ================================================================
     CARD SCREEN
  ================================================================ */
  function renderCard(sid, card) {
    var suit=SUIT_MAP[card.s];
    var p=curPlayer();
    var titleEl=document.getElementById("card-station-title");
    if (titleEl) titleEl.textContent=(state&&state.players.length>1&&p)
      ? p.name+" \u2014 Station "+sid.replace(/^S/i,"")
      : "Station "+sid.replace(/^S/i,"");

    var el=document.getElementById("playing-card");
    el.classList.toggle("red",suit.red);
    el.querySelector(".pc-suit-big").textContent=suit.glyph;
    var ranks=el.querySelectorAll(".pc-rank");
    ranks[0].textContent=card.r; ranks[1].textContent=card.r;
    el.style.animation="none"; void el.offsetWidth; el.style.animation="";

    var cap=document.getElementById("card-caption");
    if (cap) cap.textContent=cardName(card)+" of "+suitName(card.s);

    var n=drawnCount();
    var prog=document.getElementById("card-progress");
    if (prog) prog.textContent=n+" of "+STATIONS.length+" stations visited"+
      (n===STATIONS.length?" \u2014 ALL DONE! Tap VIEW MY HAND.":"");

    updateHandStrip();
  }

  function cardName(c){ return {J:"Jack",Q:"Queen",K:"King",A:"Ace"}[c.r]||c.r; }
  function suitName(s){ return {S:"Spades",H:"Hearts",D:"Diamonds",C:"Clubs"}[s]; }

  /* ================================================================
     HAND SCREEN
  ================================================================ */
  function renderHand() {
    var stage=document.getElementById("hand-stage");
    if (!stage||!state) return;
    stage.innerHTML="";
    var multi=state.players.length>1;
    var is7=STATIONS.length===7;

    state.players.forEach(function(p, idx) {
      var allCards=STATIONS.map(function(s){return p.hand[s]||null;});
      var filled=allCards.filter(Boolean);
      var bestResult=null, bestIndices=[];
      if (is7&&filled.length===7) { bestResult=bestFiveOf(filled); bestIndices=bestResult.indices; }

      var section=document.createElement("div");
      section.className="hand-player-section";

      if (multi) {
        var nameEl=document.createElement("p");
        nameEl.className="hand-rider";nameEl.textContent=p.name;
        section.appendChild(nameEl);
      }

      var cardsDiv=document.createElement("div");
      cardsDiv.className="hand-cards";
      allCards.forEach(function(card, ci) {
        var mc=document.createElement("div");
        var isInBest=!is7||filled.length<7||bestIndices.indexOf(ci)>=0;
        if (card) {
          var suit=SUIT_MAP[card.s];
          mc.className="mini-card"+(suit.red?" red":"")+(isInBest?"":" dim");
          mc.innerHTML="<span class='mini-rank'>"+card.r+"</span>"+
                       "<span class='mini-suit'>"+suit.glyph+"</span>"+
                       "<span class='mini-station'>"+STATIONS[ci]+"</span>";
        } else {
          mc.className="mini-card empty";
          mc.innerHTML="<span class='mini-rank'>?</span><span class='mini-station'>"+STATIONS[ci]+"</span>";
        }
        cardsDiv.appendChild(mc);
      });
      section.appendChild(cardsDiv);

      var evalCards=(is7&&filled.length===7)?bestResult.hand:filled;
      var res=evaluateHand(evalCards);
      var rankDiv=document.createElement("div");
      rankDiv.className="hand-rank";
      rankDiv.innerHTML="<div class='rank-name'>"+res.name+"</div><div class='rank-desc'>"+res.desc+"</div>";
      if (is7&&filled.length===7)
        rankDiv.innerHTML+="<div class='rank-note'>\u2605 Best 5 of 7 \u2014 highlighted cards above</div>";
      section.appendChild(rankDiv);

      if (filled.length===STATIONS.length) {
        var maxD=maxDiscards(res);
        if (maxD>0) {
          var dn=document.createElement("p"); dn.className="discard-note";
          dn.innerHTML="At the finish line you may discard up to <strong>"+maxD+
            "</strong> card"+(maxD!==1?"s":"")+".";
          section.appendChild(dn);
        }
        var qrSec=document.createElement("div");qrSec.className="hand-qr-section";
        var qrLbl=document.createElement("p");qrLbl.className="qr-label";
        qrLbl.textContent="\uD83D\uDCF1 Show this QR at the finish line";
        var qrDiv=document.createElement("div");qrDiv.className="hand-qr";
        qrSec.appendChild(qrLbl);qrSec.appendChild(qrDiv);
        section.appendChild(qrSec);
        renderHandQR(p,qrDiv);
      }

      stage.appendChild(section);
      if (multi&&idx<state.players.length-1){
        var hr=document.createElement("hr");hr.className="player-divider";stage.appendChild(hr);
      }
    });

    var n=getRestartInfo().count;
    var rs=document.createElement("p");
    rs.className="hand-restarts"+(n>0?" flag":"");
    rs.textContent=n===0?"Restarts today: 0":"⚠ Ride restarted "+n+(n===1?" time today":" times today");
    stage.appendChild(rs);
  }

  /* ================================================================
     QR CODE
  ================================================================ */
  function buildHandPayload(player) {
    var cards=STATIONS.map(function(sid){var c=player.hand[sid];return c?(c.r+c.s):"??";});
    return "PR1|"+player.name+"|"+cards.join(",");
  }

  function renderHandQR(player,container) {
    if (!container) return;
    container.innerHTML="";
    var payload=buildHandPayload(player);
    if (typeof QRCode!=="undefined") {
      try{new QRCode(container,{text:payload,width:200,height:200,
        colorDark:"#1c1c1c",colorLight:"#f6f1e3",correctLevel:QRCode.CorrectLevel.M});return;}catch(e){}
    }
    container.innerHTML="<p class='qr-fallback'>QR library not loaded.<br><strong>"+payload+"</strong></p>";
  }

  /* ================================================================
     STATION HANDLING
  ================================================================ */
  function handleStation(rawText) {
    var sid=parseStation(rawText);
    if (!sid){toast("That QR code is not a station code.");return;}
    if (STATIONS.indexOf(sid)===-1){toast("Unknown station: "+sid);return;}
    var p=curPlayer(), already=p&&!!p.hand[sid];
    var card=drawForStation(sid);
    if (!card){toast("Deck is empty.");return;}
    renderCard(sid,card);
    show("card");
    if (already) toast("Station "+sid+" already scanned \u2014 same card shown.");
    refreshManual();
  }

  function parseStation(text) {
    if (!text) return null;
    var m=String(text).trim().match(/S\s*([0-9]+)/i);
    return m?"S"+m[1]:null;
  }

  /* ================================================================
     CAMERA ENGINE
  ================================================================ */
  var video =document.getElementById("scan-video");
  var canvas=document.getElementById("scan-canvas");
  var ctx   =canvas?canvas.getContext("2d",{willReadFrequently:true}):null;
  var stream=null,rafId=null,scanning=false,detector=null;
  var engine="none",h5=null,h5running=false;

  function getH5Lib(){
    if(window.__Html5QrcodeLibrary__&&window.__Html5QrcodeLibrary__.Html5Qrcode)return window.__Html5QrcodeLibrary__.Html5Qrcode;
    if(typeof window.Html5Qrcode!=="undefined")return window.Html5Qrcode;
    return null;
  }
  function pickEngine(){
    if(getH5Lib())return "html5qrcode";
    if(typeof window.jsQR==="function")return "jsqr";
    if("BarcodeDetector"in window)return "barcode";
    return "none";
  }

  function startScanner(){
    var status=document.getElementById("scan-status");
    refreshManual();
    var done=drawnCount()===STATIONS.length;
    if (done){
      var p=curPlayer();
      if(status)status.textContent=(state&&state.players.length>1&&p)
        ?p.name+" has all "+STATIONS.length+" cards! Tap VIEW MY HAND."
        :"All "+STATIONS.length+" stations done! Tap VIEW MY HAND.";
      showCameraOverlay(false);setManualVisible(true);return;
    }
    engine=pickEngine();
    if (engine==="none"){
      if(status)status.textContent="Camera not available. Tap your station number below.";
      showCameraOverlay(false);setManualVisible(true);return;
    }
    showCameraOverlay(true);setManualVisible(false);
    if(status)status.textContent="Tap the button above to open your camera.";
  }

  function showCameraOverlay(visible){
    var ov=document.getElementById("camera-start-overlay");
    if(ov)ov.classList.toggle("hidden",!visible);
    var fr=document.querySelector(".scan-frame");
    if(fr)fr.classList.toggle("hidden",visible);
  }

  function startCameraFeed(){
    showCameraOverlay(false);
    var status=document.getElementById("scan-status");
    var retryBtn=document.getElementById("camera-retry-btn");
    if(retryBtn)retryBtn.classList.add("hidden");
    var done=drawnCount()===STATIONS.length;
    var frame=document.querySelector(".scan-frame");
    var reader=document.getElementById("qr-reader");

    function onFail(msg){
      if(status)status.innerHTML=msg;
      setManualVisible(true);
      if(retryBtn)retryBtn.classList.remove("hidden");
    }

    if (engine==="html5qrcode"){
      video.classList.add("hidden");
      if(frame)frame.classList.add("hidden");
      reader.classList.remove("hidden");
      setManualVisible(false);
      if(!done&&status)status.textContent="Starting camera\u2026";
      var Lib=getH5Lib();
      try{h5=new Lib("qr-reader",{verbose:false});}catch(e){h5=new Lib("qr-reader");}
      h5.start({facingMode:"environment"},
        {fps:10,qrbox:function(w,h){var m=Math.floor(Math.min(w,h)*0.7);return{width:m,height:m};},aspectRatio:1.0},
        function(text){onDetected(text);},function(){}
      ).then(function(){
        h5running=true;
        if(!done&&status)status.textContent="Point camera at the station QR code.";
      }).catch(function(){
        onFail("Camera blocked.<br><small>iPhone: Settings \u2192 Safari \u2192 Camera \u2192 Allow \u2014 then tap <strong>Try Camera Again</strong>.</small>");
        cleanupH5();
      });
      return;
    }

    video.classList.remove("hidden");
    if(frame)frame.classList.remove("hidden");
    reader.classList.add("hidden");
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      onFail("Camera not available. Tap your station number below.");return;
    }
    setManualVisible(false);
    if(!done&&status)status.textContent="Starting camera\u2026";
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false})
      .then(function(s){stream=s;video.srcObject=s;return video.play();})
      .then(function(){
        scanning=true;
        if(!done&&status)status.textContent="Point camera at the station QR code.";
        if(engine==="barcode"){
          try{detector=new window.BarcodeDetector({formats:["qr_code"]});}
          catch(e){detector=new window.BarcodeDetector();}
        }
        tick();
      }).catch(function(){
        onFail("Camera blocked. Allow access in Settings, then tap <strong>Try Camera Again</strong>.");
      });
  }

  function cleanupH5(){if(h5){try{h5.clear();}catch(e){}}h5=null;h5running=false;}

  function stopScanner(){
    scanning=false;
    if(rafId){cancelAnimationFrame(rafId);rafId=null;}
    if(stream){stream.getTracks().forEach(function(t){t.stop();});stream=null;}
    try{video.srcObject=null;}catch(e){}
    if(h5){
      var inst=h5;
      if(h5running)inst.stop().then(function(){try{inst.clear();}catch(e){}}).catch(function(){try{inst.clear();}catch(e){}});
      else try{inst.clear();}catch(e){}
      h5=null;h5running=false;
    }
  }

  function tick(){
    if(!scanning)return;
    if(video.readyState===video.HAVE_ENOUGH_DATA){
      if(engine==="jsqr"){
        var w=video.videoWidth,ht=video.videoHeight;
        if(w&&ht){
          canvas.width=w;canvas.height=ht;ctx.drawImage(video,0,0,w,ht);
          var img=ctx.getImageData(0,0,w,ht);
          var code=window.jsQR(img.data,w,ht,{inversionAttempts:"dontInvert"});
          if(code&&code.data){onDetected(code.data);return;}
        }
        rafId=requestAnimationFrame(tick);
      }else if(engine==="barcode"){
        detector.detect(video).then(function(codes){
          if(codes&&codes.length){onDetected(codes[0].rawValue);return;}
          rafId=requestAnimationFrame(tick);
        }).catch(function(){rafId=requestAnimationFrame(tick);});
      }
    }else{rafId=requestAnimationFrame(tick);}
  }

  var lastDetectAt=0;
  function onDetected(text){
    var now=Date.now();
    if(now-lastDetectAt<1200){if(engine==="jsqr"||engine==="barcode")rafId=requestAnimationFrame(tick);return;}
    lastDetectAt=now;
    if(navigator.vibrate)try{navigator.vibrate(40);}catch(e){}
    stopScanner();handleStation(text);
  }

  /* ================================================================
     MANUAL STATION BUTTONS
  ================================================================ */
  function buildManual(){
    var grid=document.getElementById("manual-stations");
    if(!grid)return;grid.innerHTML="";
    STATIONS.forEach(function(sid){
      var b=document.createElement("button");
      b.type="button";b.dataset.sid=sid;b.textContent=sid;
      b.addEventListener("click",function(){handleStation(sid);});
      grid.appendChild(b);
    });
  }

  function refreshManual(){
    if(!state)return;
    var p=curPlayer(),grid=document.getElementById("manual-stations");
    if(!grid||!p)return;
    Array.prototype.forEach.call(grid.children,function(b){
      b.classList.toggle("done",!!(p.hand[b.dataset.sid]));
    });
  }

  function setManualVisible(vis){
    var block=document.querySelector(".manual-block");
    if(block)block.classList.toggle("hidden",!vis);
  }

  /* ================================================================
     DYNAMIC START FORM
  ================================================================ */
  var nameInputCount=1;

  function buildStartForm(){
    nameInputCount=1;
    var c=document.getElementById("name-inputs-container");
    if(!c)return;c.innerHTML="";addNameRow(c,1);updateAddHandBtn();
  }

  function addNameRow(container,num){
    var row=document.createElement("div");row.className="name-row";
    var label=document.createElement("label");label.className="name-row-label";
    label.textContent=num===1?"Your name":"Hand "+num+" name";
    var wrap=document.createElement("div");wrap.className="name-row-wrap";
    var input=document.createElement("input");
    input.type="text";input.inputMode="text";input.maxLength=24;
    input.className="name-row-input";input.placeholder=num===1?"e.g. Joe":"e.g. Sam";
    if(num===1)input.required=true;
    wrap.appendChild(input);
    if(num>1){
      var rm=document.createElement("button");
      rm.type="button";rm.className="remove-name-btn";rm.textContent="\u2715";
      rm.addEventListener("click",function(){row.remove();renumberRows();updateAddHandBtn();});
      wrap.appendChild(rm);
    }
    row.appendChild(label);row.appendChild(wrap);container.appendChild(row);
  }

  function renumberRows(){
    var rows=document.querySelectorAll(".name-row");
    rows.forEach(function(row,i){
      var num=i+1;
      var lbl=row.querySelector(".name-row-label");
      if(lbl)lbl.textContent=num===1?"Your name":"Hand "+num+" name";
      var inp=row.querySelector(".name-row-input");
      if(inp){
        inp.placeholder=num===1?"e.g. Joe":"e.g. Sam";
        if(num===1)inp.required=true;else inp.removeAttribute("required");
      }
    });
    nameInputCount=rows.length;
  }

  function updateAddHandBtn(){
    var btn=document.getElementById("add-hand-btn");
    if(!btn)return;
    var atMax=document.querySelectorAll(".name-row").length>=MAX_HANDS;
    btn.disabled=atMax;btn.classList.toggle("hidden",atMax);
  }

  function getStartFormNames(){
    var names=[];
    document.querySelectorAll(".name-row-input").forEach(function(inp){
      var v=inp.value.trim();if(v)names.push(v);
    });
    return names;
  }

  /* ================================================================
     TOAST
  ================================================================ */
  var toastTimer=null;
  function toast(msg){
    var t=document.getElementById("toast");
    if(!t)return;
    t.textContent=msg;t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){t.classList.add("hidden");},3200);
  }

  /* ================================================================
     INIT & WIRING
  ================================================================ */
  function init(){
    loadSettings();
    STATIONS=makeStations();
    buildManual();
    buildStartForm();
    updateStartScreen();

    /* Gear icon opens settings */
    var gearBtn=document.getElementById("gear-btn");
    if(gearBtn)gearBtn.addEventListener("click",function(){show("settings");});

    /* Settings: game mode toggle */
    var m5=document.getElementById("mode-5"),m7=document.getElementById("mode-7");
    if(m5)m5.addEventListener("click",function(){
      settings.stations=5;m5.classList.add("active");if(m7)m7.classList.remove("active");
    });
    if(m7)m7.addEventListener("click",function(){
      settings.stations=7;m7.classList.add("active");if(m5)m5.classList.remove("active");
    });

    /* Save settings */
    var saveSetBtn=document.getElementById("save-settings-btn");
    if(saveSetBtn)saveSetBtn.addEventListener("click",saveSettingsFromForm);

    /* Add hand button */
    var addBtn=document.getElementById("add-hand-btn");
    if(addBtn)addBtn.addEventListener("click",function(){
      var c=document.getElementById("name-inputs-container");
      if(!c)return;
      if(c.querySelectorAll(".name-row").length>=MAX_HANDS)return;
      nameInputCount=c.querySelectorAll(".name-row").length+1;
      addNameRow(c,nameInputCount);updateAddHandBtn();
      var inputs=c.querySelectorAll(".name-row-input");
      if(inputs.length)inputs[inputs.length-1].focus();
    });

    /* Resume button */
    var resumeBtn=document.getElementById("resume-btn");
    if(resumeBtn)resumeBtn.addEventListener("click",function(){
      var saved=loadState();if(saved){state=saved;show("scan");}
    });

    /* Start form — warn if cards already in progress */
    var startForm=document.getElementById("start-form");
    if(startForm)startForm.addEventListener("submit",function(e){
      e.preventDefault();
      var saved=loadState();
      if(saved&&saved.players){
        var drawn=saved.players.reduce(function(acc,p){return acc+drawnCountFor(p);},0);
        if(drawn>0&&!confirm("You have "+drawn+" card(s) in progress.\n\nStarting a new ride will erase them.\n\nContinue?"))return;
      }
      var names=getStartFormNames();
      if(!names.length||!names[0]){toast("Please enter at least one rider name.");return;}
      state={players:names.map(function(n){return newPlayer(n);}),active:0,date:todayStr()};
      saveState();show("scan");
    });

    /* Restart button */
    var restartBtn=document.getElementById("restart-btn");
    if(restartBtn)restartBtn.addEventListener("click",function(){
      if(!confirm("Restart the ride?\n\nThis will clear all cards."))return;
      var info=bumpRestart();
      var names=state&&state.players?state.players.map(function(p){return p.name;}):["Rider"];
      state=null;show("start");
      buildStartForm();
      var c=document.getElementById("name-inputs-container");
      if(c){
        var fi=c.querySelector(".name-row-input");
        if(fi&&names[0])fi.value=names[0];
        for(var i=1;i<names.length;i++){
          addNameRow(c,i+1);
          var all=c.querySelectorAll(".name-row-input");
          if(all[i])all[i].value=names[i];
        }
        updateAddHandBtn();
      }
      toast("Ride reset (restart #"+info.count+" today).");
    });

    /* Camera overlay buttons */
    var camBtn=document.getElementById("camera-start-btn");
    var retryBtn=document.getElementById("camera-retry-btn");
    if(camBtn)  camBtn.addEventListener("click",  function(){startCameraFeed();});
    if(retryBtn)retryBtn.addEventListener("click",function(){startCameraFeed();});

    /* All data-nav buttons */
    document.querySelectorAll("[data-nav]").forEach(function(el){
      el.addEventListener("click",function(){
        var dest=el.getAttribute("data-nav");
        if(!state&&dest!=="start"&&dest!=="settings")return;
        show(dest);
      });
    });

    /* Pause camera when phone screen turns off */
    document.addEventListener("visibilitychange",function(){
      if(document.hidden&&current==="scan")stopScanner();
      else if(!document.hidden&&current==="scan")startScanner();
    });
  }

  document.addEventListener("DOMContentLoaded",init);

  /* Service worker registration */
  if("serviceWorker"in navigator){
    window.addEventListener("load",function(){
      navigator.serviceWorker.register("service-worker.js").catch(function(){});
    });
  }
})();
