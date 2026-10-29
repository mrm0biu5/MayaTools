# Camera (card overlay trick)

A web app that looks like the iOS 26 iPhone Camera app (front camera; opens in VIDEO mode, PHOTO mode available). When a playing card
held flat over the phone comes into view, the app finds it live and draws your chosen card over
it. The overlay follows position, size and rotation, matches the room's lighting, and keeps your
fingers in front of it.

## Two trick types (Settings → Trick → Type)
- **Timed fake card** (default): a fake card (your chosen force card) plays a pre-set path over the
  live video, and you time your hand to match it, keeping the real card out of the camera's view.
  Optionally a still frame of the empty scene can mask the bottom of the picture, so a real card
  passing through there is never seen (Settings → bottom mask). Start it with a two-finger tap or the
  Record button. Path, timing, pause, size, height, tilt, shadow and mask height are all adjustable,
  and Preview Animation lets you rehearse.
- **Replace real card (tracking)**: finds the real card live and draws the force card over it.

## Install on iPhone
1. Host the folder over **https**: GitHub Pages (Settings → Pages → deploy from this branch, root),
   or drag the folder onto https://app.netlify.com/drop.
2. Open the URL in Safari → Share → **Add to Home Screen**. Launch it from the home screen icon
   ("Camera") so it runs full screen, then allow camera access.

## Performing
- Phone face up on the table, front camera looking at the ceiling. Keep it still.
- Let it see the empty ceiling for about 1 second first; it learns the background.
- Bring the card in flat, face toward the lens. It can slide in from any edge, and it can be lighter or
  darker than the background; it just needs to look different from what's normally there.
- The app learns how big the card looks each time it sees the whole card, and uses that to place the
  overlay while the card is still partly off screen.

## Secret controls
| Gesture | Action |
|---|---|
| Long-press photo thumbnail (bottom left) | Settings |
| Two-finger tap on picture | Start the fake card (after the start delay, 5 s by default) |
| Three-finger tap on picture | Next card |
| One-finger tap | Yellow focus square (like the real app) |
| Tap VIDEO / PHOTO in the mode pill | Switch mode |
| Record button | Shows the recording look only (real recording is an optional bonus in settings) |

## Timing cue
The 0 in the "30" under "4K" is drawn with a slash, as on a real iPhone. The slash disappears
(0 becomes O) one second before the fake card starts, so you know when to move. Both the start
delay and the cue lead time are adjustable in settings.

## Card library (Settings → Cards)
- **Take Photo / Choose Photo / Use Front Camera** to add a card. Any angle and light is fine.
- The corner editor finds the card's 4 corners; drag to adjust (yellow = top-left, **Rotate** if it's
  the wrong way up). The card is straightened, and **Fix lighting** removes the photo's light and
  shadow so the card is stored evenly lit.
- When it plays, the card is re-lit live to the room's current colour and brightness
  ("Card brightness vs room"), with camera grain and focus blur, so every card in the library matches.
- Tap a card to select it; three-finger tap on the picture cycles cards during a performance.

## Versions
The version (e.g. `v7`) shows faintly at the top-left and in the settings title; switch it off in
Settings → Camera look before performing. On launch the app checks `version.json` and reloads itself
if a newer version is online. When releasing, bump `APP_VERSION` in `app.js`, `version.json`, and the
`?v=` on `app.js`/`style.css` in `index.html`.

## Tuning
Turn on **Show debug view** in settings. Green = pixels seen as card, red box = raw detection,
yellow box = tracked overlay. Adjust brightness threshold / background difference until only the
card turns green.
