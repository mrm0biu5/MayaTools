# Camera (card overlay trick)

A web app that looks like the iOS 26 iPhone Camera app (front camera; opens in VIDEO mode, PHOTO mode available). When a playing card
held flat over the phone comes into view, the app finds it live and draws your chosen card over
it. The overlay follows position, size and rotation, matches the room's lighting, and keeps your
fingers in front of it.

## Two trick types (Settings → Trick → Type)
- **Timed fake card** (default): a still frame of the empty scene covers the bottom of the picture, so
  your real card moving there is never seen. A fake card (your chosen force card) plays a pre-set path
  over the live video, and you time your hand to match it. Start it with a two-finger tap or the
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
| Two-finger tap on picture | Arm / disarm overlay |
| Three-finger tap on picture | Next card |
| One-finger tap | Yellow focus square (like the real app) |
| Tap VIDEO / PHOTO in the mode pill | Switch mode |
| Record button | Really records the screen (overlay included); tap the thumbnail to play back / share |

## Cards
- Built in: 3♣.
- **Grab From Camera** (in settings): hold the real card over the phone and it's captured under the
  same lighting. This gives the most convincing result.
- **Add Photo**: a photo cropped tightly to the card.
- "Match room lighting" tints the overlay to the brightness and colour of the real card's white.
  Turn it off for grabbed or lit-in-room photos.

## Tuning
Turn on **Show debug view** in settings. Green = pixels seen as card, red box = raw detection,
yellow box = tracked overlay. Adjust brightness threshold / background difference until only the
card turns green.
