# Poker Ride — Update: Finish-Line QR System

## What's new

This update adds two things:
1. **Rider phone app**: After visiting all 5 stations, the "My Hand" screen
   now shows a QR code that the finish-line scanner can read.
2. **Finish-line laptop app** (`finish-line.html`): A new standalone webpage
   for the laptop at the finish gate. Scan each rider's QR code and the
   leaderboard updates automatically, ranking hands from best to worst.

---

## Files changed (drop these into your poker-ride/ folder)

| File | What changed |
|------|-------------|
| `app.js` | Added QR-code generation functions |
| `index.html` | Added QR display section + qrcode library script tag |
| `style.css` | Added styles for the QR section |
| `service-worker.js` | Cache version bumped; qrcode.min.js added to optional cache |

## New file

| File | Purpose |
|------|---------|
| `finish-line.html` | Laptop app — scans QR codes, shows live leaderboard, exports CSV |

---

## One-time setup step: download the QR generator library

The rider app uses a small library to *draw* the QR code on screen.
You need to download one file and put it in the `lib/` folder:

1. Open this URL in your browser:
   https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
2. Save the file as `lib/qrcode.min.js` inside your poker-ride/ folder.
3. Upload that file to GitHub Pages along with the other updated files.

> If the library is missing the app still works — it just shows the
> hand data as plain text instead of a QR code.

---

## How the finish-line works — fully offline

The finish-line app now caches itself on first visit, exactly like the rider
app. Once cached it works forever with no WiFi — perfect for remote campsites.

**One-time setup (do this at home before the trip):**
1. Open Chrome on the laptop and go to:
   `https://wphorseccamp.github.io/poker-ride/finish-line.html`
2. Allow camera access when the browser asks.
3. Wait for the green message: **"✅ Saved for offline use — works without WiFi"**
4. That's it. The app is now stored on the laptop permanently.

**At the campsite (no WiFi needed):**
1. Open Chrome and go to the same URL — it loads instantly from the cache.
2. Allow camera access.
3. Scan each rider's QR code as they finish.
4. Export to CSV when all riders are in.

---

## QR code data format (for reference)

Each rider's QR code contains plain text in this format:

    PR1|{name}|{card1},{card2},{card3},{card4},{card5}

Example:

    PR1|Linda|AS,KH,QD,JC,10S

Cards are written as rank + suit letter (S H D C).
The finish-line app reads and validates this format automatically.
