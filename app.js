'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const video = $('video');
  const viewport = $('viewport');
  const screenCv = $('screen');
  const sctx = screenCv.getContext('2d');
  const layer = document.createElement('canvas');          // overlay compositing layer
  const lctx = layer.getContext('2d');
  const det = document.createElement('canvas');            // low-res detection frame
  const dctx = det.getContext('2d', { willReadFrequently: true });
  const skinCv = document.createElement('canvas');         // finger mask
  const skctx = skinCv.getContext('2d');

  const CARD_W = 500, CARD_H = 700;
  const CARD_ASPECT = CARD_H / CARD_W;                     // long / short (poker card 88.9 x 63.5mm)
  const BUILTIN_ID = 'builtin-3c';

  // ---------------------------------------------------------------- storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const DEFAULTS = {
    armed: true, activeCard: BUILTIN_ID, mode: 'video', grid: true, level: true,
    // timed trick: a fake card animates over the live picture while the bottom is masked
    trick: 'timed', path: 'swipe-rl', trigger: 'both', dur: 1.6, pause: 0.3, delay: 0,
    cardW: 62, cardY: 62, tilt: 0, shade: 18, wobble: true,
    mask: 'always', maskH: 40, maskFeather: 10, maskAfter: 1.5, mirrorOverlay: true, flip180: false, fingers: true, showDot: true,
    margin: 4, smooth: 10, hold: 4, cardS: 50,
    bright: 70, maxSat: 30, minSize: 2, useBg: true, bgDiff: 20, debug: false,
  };
  const S = Object.assign({}, DEFAULTS, store.get('ct.settings', {}));
  const saveSettings = () => store.set('ct.settings', S);

  let cards = store.get('ct.cards', []);                  // [{id, name, src, match, builtin}]
  if (!cards.some((c) => c.id === BUILTIN_ID)) cards.unshift({ id: BUILTIN_ID, name: '3♣', builtin: true, match: true });
  const saveCards = () => store.set('ct.cards', cards);
  const images = new Map();                                // id -> drawable

  function cardImage(card) {
    if (images.has(card.id)) return images.get(card.id);
    let img;
    if (card.builtin) img = makeThreeOfClubs();
    else { img = new Image(); img.src = card.src; }
    images.set(card.id, img);
    return img;
  }
  const activeCard = () => cards.find((c) => c.id === S.activeCard) || cards[0];
  const ready = (img) => img instanceof HTMLCanvasElement || (img.complete && img.naturalWidth > 0);

  // ---------------------------------------------------------------- built-in 3 of clubs
  function drawClub(ctx, x, y, size) {
    const r = size * 0.255;
    ctx.beginPath();
    ctx.arc(x, y - size * 0.24, r, 0, Math.PI * 2);
    ctx.arc(x - size * 0.255, y + size * 0.07, r, 0, Math.PI * 2);
    ctx.moveTo(x + size * 0.255 + r, y + size * 0.07);
    ctx.arc(x + size * 0.255, y + size * 0.07, r, 0, Math.PI * 2);
    ctx.moveTo(x, y - size * 0.05);
    ctx.arc(x, y - size * 0.02, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.03, y);
    ctx.quadraticCurveTo(x - size * 0.03, y + size * 0.36, x - size * 0.2, y + size * 0.5);
    ctx.lineTo(x + size * 0.2, y + size * 0.5);
    ctx.quadraticCurveTo(x + size * 0.03, y + size * 0.36, x + size * 0.03, y);
    ctx.closePath();
    ctx.fill();
  }
  function makeThreeOfClubs() {
    const c = document.createElement('canvas');
    c.width = CARD_W; c.height = CARD_H;
    const g = c.getContext('2d');
    g.fillStyle = '#fdfdfb';
    g.beginPath();
    g.roundRect ? g.roundRect(0, 0, CARD_W, CARD_H, 28) : g.rect(0, 0, CARD_W, CARD_H);
    g.fill();
    g.fillStyle = '#111';
    const corner = () => {
      g.font = 'bold 74px Georgia, "Times New Roman", serif';
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillText('3', 50, 92);
      drawClub(g, 50, 128, 46);
    };
    corner();
    g.save(); g.translate(CARD_W, CARD_H); g.rotate(Math.PI); corner(); g.restore();
    drawClub(g, CARD_W / 2, 150, 118);
    drawClub(g, CARD_W / 2, 340, 118);
    g.save(); g.translate(CARD_W / 2, 550); g.rotate(Math.PI); drawClub(g, 0, 0, 118); g.restore();
    return c;
  }

  // ---------------------------------------------------------------- camera
  let facing = 'user';
  let stream = null;
  const mirrored = () => facing === 'user';

  async function startCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: mode === 'video' ? 1080 : 1440 } },
      });
      video.srcObject = stream;
      await video.play();
      $('camError').hidden = true;
      resetBackground();
      invalidatePlate();
    } catch (e) {
      $('camErrorMsg').textContent = location.protocol !== 'https:' && location.hostname !== 'localhost'
        ? 'The camera only works when this page is opened over https://'
        : 'Camera access is needed. (' + (e && e.name || 'error') + ')';
      $('camError').hidden = false;
    }
  }
  $('camRetry').addEventListener('click', startCamera);

  // ---------------------------------------------------------------- sizing
  let W = 0, H = 0, DW = 150, DH = 200, N = 0;
  let lum, mask, labels, queue, bx, by, sk, skinData, lastPixels = null;
  let bgR = null, bgG = null, bgB = null, gain = 1;

  function resize() {
    const r = viewport.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    screenCv.width = layer.width = W;
    screenCv.height = layer.height = H;
    DW = 150; DH = Math.round(DW * H / W);
    det.width = skinCv.width = DW;
    det.height = skinCv.height = DH;
    N = DW * DH;
    lum = new Float32Array(N); mask = new Uint8Array(N); labels = new Int32Array(N);
    queue = new Int32Array(N); bx = new Float32Array(N); by = new Float32Array(N); sk = new Uint8Array(N);
    skinData = skctx.createImageData(DW, DH);
    resetBackground();
    invalidatePlate();
    track = null;
  }

  function drawCover(ctx, w, h, mirror) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(w / vw, h / vh);
    const sw = w / scale, sh = h / scale;
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h);
    ctx.restore();
  }

  // ---------------------------------------------------------------- background model
  // Per-pixel colour of the empty scene. The card is found as "white-ish and different from
  // what's normally there", so it works whether the card is lighter or darker than the background.
  let bgFrames = 0;
  const BG_WARMUP = 15;
  function resetBackground() { bgR = bgG = bgB = null; bgFrames = 0; gain = 1; }
  const bgReady = () => bgR && bgFrames >= BG_WARMUP;
  function updateBackground(data) {
    if (!bgR) {
      bgR = new Float32Array(N); bgG = new Float32Array(N); bgB = new Float32Array(N);
      for (let i = 0, p = 0; i < N; i++, p += 4) { bgR[i] = data[p]; bgG[i] = data[p + 1]; bgB[i] = data[p + 2]; }
      bgFrames = 1;
      return;
    }
    // learn fast during warm-up, then slowly. Pixels that look like the card are learnt ~10x slower:
    // a card held still survives for several seconds, while a "ghost" (something that was in view
    // when the background was learnt) still fades away on its own.
    const warm = bgFrames < BG_WARMUP;
    const aBg = warm ? 0.3 : 0.02, aCard = warm ? 0.3 : 0.002;
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      const a = mask[i] ? aCard : aBg;
      bgR[i] += (data[p] - bgR[i]) * a; bgG[i] += (data[p + 1] - bgG[i]) * a; bgB[i] += (data[p + 2] - bgB[i]) * a;
    }
    bgFrames++;
  }
  // The iPhone re-exposes when a card covers the lens; estimate that global brightness change
  // from the pixels that were background last frame so the whole scene doesn't light up as "card".
  function estimateGain(data) {
    let sc = 0, sb = 0;
    for (let i = 0, p = 0; i < N; i += 3, p += 12) {
      if (mask[i]) continue;
      sc += data[p] + data[p + 1] + data[p + 2];
      sb += bgR[i] + bgG[i] + bgB[i];
    }
    const g = sb > 0 ? sc / sb : 1;
    return Math.min(2, Math.max(0.5, g));
  }

  // ---------------------------------------------------------------- detection
  // Card size on screen (short side, % of width), learnt whenever the whole card is visible and
  // used to rebuild the card while it is still cut off by the screen edge.
  let lastSizeSave = 0;
  function learnCardSize(c) {
    const pct = (c.s / DW) * 100;
    S.cardS = Math.round((S.cardS + (pct - S.cardS) * 0.3) * 10) / 10;
    const now = performance.now();
    if (now - lastSizeSave > 2000) { lastSizeSave = now; saveSettings(); }
  }

  function detect() {
    const data = dctx.getImageData(0, 0, DW, DH).data;
    lastPixels = data;
    const bright = S.bright, maxSat = S.maxSat / 100, useBg = S.useBg && bgReady(), diff = S.bgDiff;
    gain = useBg ? estimateGain(data) : 1;
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[i] = l;
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      let m = l >= bright && (mx - mn) <= maxSat * mx;
      if (m && useBg) {
        const d = Math.max(Math.abs(r - bgR[i] * gain), Math.abs(g - bgG[i] * gain), Math.abs(b - bgB[i] * gain));
        if (d < diff) m = false;
      }
      mask[i] = m ? 1 : 0;
    }
    updateBackground(data);
    if (!bgReady() && S.useBg) return null;

    labels.fill(0);
    const minArea = (S.minSize / 100) * N;
    let best = null, label = 0;
    for (let i = 0; i < N; i++) {
      if (!mask[i] || labels[i]) continue;
      label++;
      let qh = 0, qt = 0, area = 0, nb = 0, sr = 0, sg = 0, sb = 0, touch = false;
      queue[qt++] = i; labels[i] = label;
      while (qh < qt) {
        const j = queue[qh++];
        const x = j % DW, y = (j / DW) | 0;
        area++;
        const p = j * 4; sr += data[p]; sg += data[p + 1]; sb += data[p + 2];
        let edge = false;
        if (x === 0 || y === 0 || x === DW - 1 || y === DH - 1) { touch = true; edge = true; }
        if (x > 0) { const k = j - 1; if (mask[k]) { if (!labels[k]) { labels[k] = label; queue[qt++] = k; } } else edge = true; }
        if (x < DW - 1) { const k = j + 1; if (mask[k]) { if (!labels[k]) { labels[k] = label; queue[qt++] = k; } } else edge = true; }
        if (y > 0) { const k = j - DW; if (mask[k]) { if (!labels[k]) { labels[k] = label; queue[qt++] = k; } } else edge = true; }
        if (y < DH - 1) { const k = j + DW; if (mask[k]) { if (!labels[k]) { labels[k] = label; queue[qt++] = k; } } else edge = true; }
        if (edge) { bx[nb] = x; by[nb] = y; nb++; }
      }
      // a card sliding in from the edge is allowed to be smaller
      if (area < (touch ? minArea * 0.25 : minArea) || area > N * 0.85) continue;
      const c = analyse(nb, area, touch);
      if (c && (!best || c.area > best.area)) { c.color = [sr / area, sg / area, sb / area]; best = c; }
    }
    if (best && !best.touch) learnCardSize(best);
    return best;
  }

  function convexHull(nb) {
    const idx = new Array(nb);
    for (let i = 0; i < nb; i++) idx[i] = i;
    idx.sort((a, b) => bx[a] - bx[b] || by[a] - by[b]);
    const pts = idx.map((i) => [bx[i], by[i]]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  function polyArea(h) {
    let a = 0;
    for (let i = 0; i < h.length; i++) { const p = h[i], q = h[(i + 1) % h.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(a) / 2;
  }

  function minAreaRect(h) {
    let best = null;
    for (let i = 0; i < h.length; i++) {
      const a = h[i], b = h[(i + 1) % h.length];
      let ux = b[0] - a[0], uy = b[1] - a[1];
      const len = Math.hypot(ux, uy);
      if (!len) continue;
      ux /= len; uy /= len;
      const vx = -uy, vy = ux;
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      for (const p of h) {
        const u = p[0] * ux + p[1] * uy, v = p[0] * vx + p[1] * vy;
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
      const area = (maxU - minU) * (maxV - minV);
      if (!best || area < best.area) best = { area, ux, uy, vx, vy, minU, maxU, minV, maxV };
    }
    if (!best) return null;
    const cu = (best.minU + best.maxU) / 2, cv = (best.minV + best.maxV) / 2;
    return {
      area: best.area,
      cx: cu * best.ux + cv * best.vx + 0.5, cy: cu * best.uy + cv * best.vy + 0.5,
      a: { dx: best.ux, dy: best.uy, len: best.maxU - best.minU + 1 },
      b: { dx: best.vx, dy: best.vy, len: best.maxV - best.minV + 1 },
    };
  }

  function analyse(nb, area, touch) {
    if (nb < 3) return null;
    const h = convexHull(nb);
    if (h.length < 3) return null;
    const R = minAreaRect(h);
    if (!R || R.area <= 0) return null;
    const hullArea = polyArea(h);
    if (hullArea / R.area < (touch ? 0.72 : 0.84)) return null;   // must be rectangular
    if (area / (hullArea + 1) < 0.45) return null;                // and mostly bright inside
    if (!touch) {
      const ar = Math.min(R.a.len, R.b.len) / Math.max(R.a.len, R.b.len);
      if (ar < 0.55 || ar > 0.88) return null;
    } else {
      extendTruncated(R);
    }
    const [L, Sh] = R.a.len >= R.b.len ? [R.a, R.b] : [R.b, R.a];
    return { cx: R.cx, cy: R.cy, l: L.len, s: Sh.len, theta: normAngle(Math.atan2(-L.dx, L.dy)), area, touch };
  }

  // A card coming onto the screen is cut off by the frame edge: rebuild its full size
  // and push the hidden part off-screen so the visible part of the overlay lines up.
  function extendTruncated(R) {
    const border = (x, y) => Math.min(x, y, DW - x, DH - y);
    for (const ax of [R.a, R.b]) {
      const e1 = border(R.cx + ax.dx * ax.len / 2, R.cy + ax.dy * ax.len / 2);
      const e2 = border(R.cx - ax.dx * ax.len / 2, R.cy - ax.dy * ax.len / 2);
      ax.trunc = Math.min(e1, e2) <= 2.5;
      ax.sign = e1 < e2 ? 1 : -1;
    }
    const ms = (S.cardS / 100) * DW, ml = ms * CARD_ASPECT;
    const setFull = (ax, full) => {
      if (full <= ax.len) return;
      const shift = (full - ax.len) / 2 * ax.sign;
      R.cx += ax.dx * shift; R.cy += ax.dy * shift;
      ax.len = full;
    };
    const one = (T, O) => {
      let isLong;
      if (T.len > (O.len / CARD_ASPECT) * 1.05) isLong = true;
      else isLong = Math.abs(O.len - ms) < Math.abs(O.len - ml);
      setFull(T, isLong ? O.len * CARD_ASPECT : O.len / CARD_ASPECT);
    };
    if (R.a.trunc && !R.b.trunc) one(R.a, R.b);
    else if (R.b.trunc && !R.a.trunc) one(R.b, R.a);
    else if (R.a.trunc && R.b.trunc) {
      // cut off on two sides (coming in at a corner): assume a portrait card of the learnt size,
      // scaled up if what we can already see is bigger than that
      const [vert, horiz] = Math.abs(R.a.dy) >= Math.abs(R.b.dy) ? [R.a, R.b] : [R.b, R.a];
      let [fv, fh] = [ml, ms];
      if (vert.len > fv * 1.1 && horiz.len <= fv) [fv, fh] = [ms, ml];
      const k = Math.max(1, vert.len / fv, horiz.len / fh);
      setFull(vert, fv * k); setFull(horiz, fh * k);
    }
  }

  function normAngle(t) {
    while (t > Math.PI / 2) t -= Math.PI;
    while (t <= -Math.PI / 2) t += Math.PI;
    return t;
  }

  // ---------------------------------------------------------------- tracking
  let track = null, lost = 0;
  function updateTrack(c) {
    if (!c) {
      lost++;
      if (lost > S.hold) track = null;
      return track;
    }
    lost = 0;
    if (!track || Math.hypot(c.cx - track.cx, c.cy - track.cy) > 0.35 * c.l) {
      track = Object.assign({}, c, { color: c.color.slice() });
      return track;
    }
    const a = 1 - (S.smooth / 100) * 0.85;
    track.cx += (c.cx - track.cx) * a;
    track.cy += (c.cy - track.cy) * a;
    track.l += (c.l - track.l) * a;
    track.s += (c.s - track.s) * a;
    track.theta = normAngle(track.theta + normAngle(c.theta - track.theta) * a);
    for (let k = 0; k < 3; k++) track.color[k] += (c.color[k] - track.color[k]) * 0.2;
    track.touch = c.touch;
    return track;
  }

  // ---------------------------------------------------------------- fingers (skin over card)
  function buildSkinMask(t) {
    const d = skinData.data;
    d.fill(0);
    sk.fill(0);
    const data = lastPixels;
    const cos = Math.cos(t.theta), sin = Math.sin(t.theta);
    const k = 1 + S.margin / 100 + 0.12;
    const hs = t.s / 2, hl = t.l / 2;
    const ext = Math.hypot(hs, hl) * k;
    const x0 = Math.max(0, Math.floor(t.cx - ext)), x1 = Math.min(DW - 1, Math.ceil(t.cx + ext));
    const y0 = Math.max(0, Math.floor(t.cy - ext)), y1 = Math.min(DH - 1, Math.ceil(t.cy + ext));
    const useBg = S.useBg && bgReady();
    let qt = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - t.cx, dy = y + 0.5 - t.cy;
        const pu = Math.abs(dx * cos + dy * sin), pv = Math.abs(-dx * sin + dy * cos);
        if (pu > hs * k || pv > hl * k) continue;
        const i = y * DW + x;
        if (mask[i]) continue;
        const p = i * 4, r = data[p], g = data[p + 1], b = data[p + 2];
        const Y = 0.299 * r + 0.587 * g + 0.114 * b;
        const Cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
        const Cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
        if (!(Y > 45 && Cr >= 135 && Cr <= 180 && Cb >= 77 && Cb <= 135)) continue;
        if (useBg && Math.abs(Y - (0.299 * bgR[i] + 0.587 * bgG[i] + 0.114 * bgB[i]) * gain) < S.bgDiff * 0.6) continue;
        const ring = pu > hs * 0.9 || pv > hl * 0.9;
        sk[i] = ring ? 2 : 1;
        if (ring) queue[qt++] = i;
      }
    }
    // keep only skin connected to the outside of the card (fingers), not card artwork
    let qh = 0, count = 0;
    while (qh < qt) {
      const j = queue[qh++];
      d[j * 4 + 3] = 255; count++;
      const x = j % DW;
      const nbrs = [x > 0 ? j - 1 : -1, x < DW - 1 ? j + 1 : -1, j - DW, j + DW];
      for (const n of nbrs) {
        if (n >= 0 && n < N && sk[n] === 1) { sk[n] = 2; queue[qt++] = n; }
      }
    }
    if (!count) return false;
    skctx.putImageData(skinData, 0, 0);
    return true;
  }

  // ---------------------------------------------------------------- rendering
  function drawOverlay(t) {
    const card = activeCard();
    const img = cardImage(card);
    if (!ready(img)) return;
    const k = W / DW;
    const m = 1 + S.margin / 100;
    const s = t.s * k * m, l = t.l * k * m;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.save();
    lctx.translate(t.cx * k, t.cy * k);
    lctx.rotate(t.theta + (S.flip180 ? Math.PI : 0));
    if (S.mirrorOverlay && mirrored()) lctx.scale(-1, 1);
    lctx.drawImage(img, -s / 2, -l / 2, s, l);
    if (card.match) {
      // tint the card to the brightness/colour of the real card's white under this light
      const c = t.color.map((v) => Math.round(Math.min(255, v * 1.02)));
      lctx.globalCompositeOperation = 'multiply';
      lctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      lctx.fillRect(-s / 2, -l / 2, s, l);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(img, -s / 2, -l / 2, s, l);
    }
    lctx.restore();
    if (S.fingers && buildSkinMask(t)) {
      lctx.globalCompositeOperation = 'destination-out';
      lctx.imageSmoothingEnabled = true;
      lctx.drawImage(skinCv, 0, 0, W, H);
      lctx.globalCompositeOperation = 'source-over';
    }
    sctx.drawImage(layer, 0, 0);
  }

  function drawDebug(raw, t) {
    const img = dctx.createImageData(DW, DH);
    for (let i = 0; i < N; i++) {
      const p = i * 4;
      img.data[p] = mask[i] ? 40 : lum[i] * 0.4;
      img.data[p + 1] = mask[i] ? 255 : lum[i] * 0.4;
      img.data[p + 2] = mask[i] ? 80 : lum[i] * 0.4;
      img.data[p + 3] = 255;
    }
    dctx.putImageData(img, 0, 0);
    const k = W / DW;
    const dw = W * 0.3, dh = dw * DH / DW;
    sctx.drawImage(det, 8, 8, dw, dh);
    const box = (r, color) => {
      sctx.save();
      sctx.translate(r.cx * k, r.cy * k); sctx.rotate(r.theta);
      sctx.strokeStyle = color; sctx.lineWidth = 3;
      sctx.strokeRect(-r.s * k / 2, -r.l * k / 2, r.s * k, r.l * k);
      sctx.restore();
    };
    if (raw) box(raw, '#ff3b30');
    if (t) box(t, '#ffd60a');
    sctx.fillStyle = '#fff';
    sctx.font = `${Math.round(13 * k / 4)}px -apple-system, sans-serif`;
    sctx.fillText(`${fps.toFixed(0)} fps  bg:${bgReady() ? 'ok' : 'learning'}  ${raw ? (raw.touch ? 'EDGE' : 'CARD') : '-'}`, 12, dh + 30);
  }

  let fps = 0, lastT = performance.now();
  let grab = null;  // {stable}
  function loop() {
    const now = performance.now();
    fps = fps * 0.9 + (1000 / Math.max(1, now - lastT)) * 0.1;
    lastT = now;
    if (video.readyState >= 2 && video.videoWidth && W) {
      drawCover(sctx, W, H, mirrored());
      drawCover(dctx, DW, DH, mirrored());
      liveFrames++;
      if (S.trick === 'timed' && !grab) {
        runTimed(now);
      } else {
        const raw = detect();
        const t = updateTrack(raw);
        if (grab) handleGrab(raw);
        else if (t && S.armed && settingsEl.hidden) drawOverlay(t);
        if (S.debug || grab) drawDebug(raw, t);
      }
    }
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- timed trick
  // The bottom of the picture is replaced by a still frame of the empty scene ("clean plate"),
  // so the real card moving there is never seen, and a fake card plays a pre-set path on top.
  const plateCv = document.createElement('canvas');
  const pctx = plateCv.getContext('2d');
  let plateReady = false, plateMean = 1, liveFrames = 0, seq = null, maskUntil = 0;
  const scene = { mean: 1, band: 1, rgb: [255, 255, 255] };
  let plateBand = 1;

  const maskTop = () => H * (1 - S.maskH / 100);

  // brightness/colour of the live picture above the mask, from the low-res detection frame
  function measureScene() {
    const data = dctx.getImageData(0, 0, DW, DH).data;
    const yEnd = Math.max(1, Math.floor(DH * (1 - S.maskH / 100) - DH * S.maskFeather / 200));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < yEnd; y += 2) {
      for (let x = 0, p = y * DW * 4; x < DW; x += 2, p += 8) { r += data[p]; g += data[p + 1]; b += data[p + 2]; n++; }
    }
    n = Math.max(1, n);
    scene.rgb = [r / n, g / n, b / n];
    scene.mean = Math.max(1, (0.299 * r + 0.587 * g + 0.114 * b) / n);
    // the strip just above the mask is what the frozen part has to blend into
    const bandStart = Math.max(0, yEnd - Math.round(DH * 0.12));
    let l = 0, m = 0;
    for (let y = bandStart; y < yEnd; y++) {
      for (let x = 0, p = y * DW * 4; x < DW; x++, p += 4) { l += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]; m++; }
    }
    scene.band = Math.max(1, l / Math.max(1, m));
  }

  function capturePlate() {
    if (!W || video.readyState < 2) return;
    plateCv.width = W; plateCv.height = H;
    pctx.globalCompositeOperation = 'source-over';
    pctx.clearRect(0, 0, W, H);
    drawCover(pctx, W, H, mirrored());
    plateMean = scene.mean;
    plateBand = scene.band;
    plateReady = true;
  }
  function invalidatePlate() { plateReady = false; liveFrames = 0; }

  function drawPlate() {
    // follow the iPhone's auto-exposure so the frozen part doesn't drift from the live part
    const gain = scene.band / plateBand;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.drawImage(plateCv, 0, 0);
    if (gain < 0.98) {            // darker: plate x gain
      lctx.globalCompositeOperation = 'source-atop';
      lctx.fillStyle = `rgba(0,0,0,${Math.min(0.8, 1 - gain)})`;
      lctx.fillRect(0, 0, W, H);
    } else if (gain > 1.02) {     // brighter: plate + plate x (gain - 1)
      lctx.globalCompositeOperation = 'lighter';
      lctx.globalAlpha = Math.min(1, gain - 1);
      lctx.drawImage(plateCv, 0, 0);
      lctx.globalAlpha = 1;
    }
    // then keep only the bottom part, with a soft top edge (after the gain, so the edge blends)
    const top = maskTop(), f = Math.max(1, H * S.maskFeather / 100);
    const grad = lctx.createLinearGradient(0, top - f / 2, 0, top + f / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    lctx.globalCompositeOperation = 'destination-in';
    lctx.fillStyle = grad;
    lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'source-over';
    sctx.drawImage(layer, 0, 0);
  }

  function triggerSequence() {
    if (S.trick !== 'timed' || !S.armed) return;
    if (S.mask === 'during' || !plateReady) capturePlate();
    seq = { start: performance.now() + S.delay * 1000 };
  }

  const smooth = (x) => x * x * (3 - 2 * x);
  const lerp = (a, b, u) => a + (b - a) * u;

  // where the fake card is at time t; null = not on screen yet, 'done' = finished
  function cardPose(now) {
    const t = (now - seq.start) / 1000;
    if (t < 0) return null;
    const half = S.dur / 2, total = S.dur + S.pause;
    if (t > total) return 'done';
    let u;   // 0 = start of path, 0.5 = resting point, 1 = end
    if (S.pause <= 0.01) u = lerp(t / S.dur, smooth(t / S.dur), 0.5);
    else if (t < half) u = 0.5 * (1 - (1 - t / half) ** 2);                    // ease out into the middle
    else if (t < half + S.pause) u = 0.5;
    else u = 0.5 + 0.5 * ((t - half - S.pause) / half) ** 2;                    // ease in on the way out
    const s = W * S.cardW / 100, l = s * CARD_ASPECT;
    const cy = H * S.cardY / 100, cx = W / 2;
    const offX = W / 2 + s * 0.75, offBottom = H + l * 0.6 - cy, offTop = cy + l * 0.6;
    const seg = (a, mid, b) => (u < 0.5 ? lerp(a, mid, u * 2) : lerp(mid, b, u * 2 - 1));
    let x = cx, y = cy;
    switch (S.path) {
      case 'swipe-lr': x = seg(cx - offX, cx, cx + offX); break;
      case 'rise': y = seg(cy + offBottom, cy, cy + offBottom); break;
      case 'rise-exit': y = seg(cy + offBottom, cy, cy - offTop); break;
      case 'drop': y = seg(cy - offTop, cy, cy - offTop); break;
      default: x = seg(cx + offX, cx, cx - offX);                              // swipe-rl
    }
    let theta = S.tilt * Math.PI / 180;
    if (S.wobble) {   // a hand never holds a card perfectly still
      theta += Math.sin(t * 2.3) * 0.025 + Math.sin(t * 5.1 + 1) * 0.01;
      x += Math.sin(t * 3.1 + 2) * W * 0.004;
      y += Math.sin(t * 2.7) * W * 0.004;
    }
    return { x, y, s, l, theta };
  }

  function drawFakeCard(p) {
    const card = activeCard();
    const img = cardImage(card);
    if (!ready(img)) return;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.save();
    lctx.translate(p.x, p.y);
    lctx.rotate(p.theta + (S.flip180 ? Math.PI : 0));
    if (S.mirrorOverlay && mirrored()) lctx.scale(-1, 1);
    lctx.drawImage(img, -p.s / 2, -p.l / 2, p.s, p.l);
    // a card this close to the lens is in its own shadow and picks up the room's colour
    const mx = Math.max(...scene.rgb, 1);
    const base = 255 * (1 - S.shade / 100);
    const c = scene.rgb.map((v) => Math.round(base * (0.75 + 0.25 * v / mx)));
    if (S.shade > 0 || c.some((v) => v < 254)) {
      lctx.globalCompositeOperation = 'multiply';
      lctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      lctx.fillRect(-p.s / 2, -p.l / 2, p.s, p.l);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(img, -p.s / 2, -p.l / 2, p.s, p.l);
    }
    lctx.restore();
    sctx.drawImage(layer, 0, 0);
  }

  function runTimed(now) {
    measureScene();
    if (!S.armed || !settingsEl.hidden) return;
    if (S.mask === 'always' && !plateReady && liveFrames > 30) capturePlate();
    let pose = null;
    if (seq) {
      pose = cardPose(now);
      if (pose === 'done') { seq = null; pose = null; maskUntil = now + S.maskAfter * 1000; }
    }
    const masking = plateReady && (S.mask === 'always' || (S.mask === 'during' && (seq || now < maskUntil)));
    if (masking) drawPlate();
    if (pose) drawFakeCard(pose);
    if (S.debug) {
      sctx.strokeStyle = '#ff3b30'; sctx.lineWidth = 2; sctx.setLineDash([10, 8]);
      sctx.beginPath(); sctx.moveTo(0, maskTop()); sctx.lineTo(W, maskTop()); sctx.stroke();
      sctx.setLineDash([]);
    }
  }

  // ---------------------------------------------------------------- grab card from camera
  function startGrab() {
    closeSettings();
    grab = { stable: 0, last: null };
    toast('Hold the card flat over the camera…', 0);
  }
  function handleGrab(r) {
    if (!r || r.touch) { grab.stable = 0; grab.last = null; return; }
    if (grab.last && Math.hypot(r.cx - grab.last.cx, r.cy - grab.last.cy) < 1.5 && Math.abs(r.l - grab.last.l) < 2) grab.stable++;
    else grab.stable = 0;
    grab.last = r;
    if (grab.stable < 12) return;
    const k = W / DW;
    // shrink a touch so rounded corners / background don't creep into the crop
    const s = r.s * k * 0.97, l = r.l * k * 0.97;
    const out = document.createElement('canvas');
    out.width = CARD_W; out.height = CARD_H;
    const o = out.getContext('2d');
    o.translate(CARD_W / 2, CARD_H / 2);
    o.scale(CARD_W / s, CARD_H / l);
    if (mirrored()) o.scale(-1, 1);       // store the card the right way round
    o.rotate(-r.theta);
    o.translate(-r.cx * k, -r.cy * k);
    o.drawImage(screenCv, 0, 0);
    grab = null;
    addCard(out.toDataURL('image/jpeg', 0.9), 'Grabbed', false);
    toast('Card captured ✓', 1500);
    setTimeout(openSettings, 900);
  }

  // ---------------------------------------------------------------- card list
  function addCard(src, name, match) {
    const id = 'c' + Date.now().toString(36);
    cards.push({ id, name, src, match });
    S.activeCard = id;
    if (!saveCards()) toast('Storage full – delete some cards', 2500);
    saveSettings();
    renderCards();
  }

  function loadPhoto(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const rotate = w > h;
      if (rotate) [w, h] = [h, w];
      // centre-crop to card proportions
      let cw = w, ch = w * CARD_ASPECT;
      if (ch > h) { ch = h; cw = h / CARD_ASPECT; }
      const out = document.createElement('canvas');
      out.width = CARD_W; out.height = CARD_H;
      const o = out.getContext('2d');
      o.scale(CARD_W / cw, CARD_H / ch);
      o.translate(-(w - cw) / 2, -(h - ch) / 2);
      if (rotate) { o.translate(w, 0); o.rotate(Math.PI / 2); }
      o.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      addCard(out.toDataURL('image/jpeg', 0.88), file.name.replace(/\.[^.]+$/, '').slice(0, 14) || 'Photo', false);
    };
    img.src = url;
  }

  function renderCards() {
    const grid = $('cardGrid');
    grid.textContent = '';
    for (const card of cards) {
      const item = document.createElement('div');
      item.className = 'card-item' + (card.id === activeCard().id ? ' active' : '');
      let thumb;
      if (card.builtin) {
        thumb = document.createElement('canvas');
        thumb.width = 100; thumb.height = 140;
        thumb.getContext('2d').drawImage(cardImage(card), 0, 0, 100, 140);
      } else {
        thumb = document.createElement('img');
        thumb.src = card.src;
      }
      item.appendChild(thumb);
      const label = document.createElement('span');
      label.textContent = card.name;
      item.appendChild(label);
      item.addEventListener('click', () => { S.activeCard = card.id; saveSettings(); renderCards(); });
      if (!card.builtin) {
        const del = document.createElement('button');
        del.className = 'del'; del.textContent = '×';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!confirm('Delete this card?')) return;
          cards = cards.filter((c) => c.id !== card.id);
          images.delete(card.id);
          if (S.activeCard === card.id) S.activeCard = BUILTIN_ID;
          saveCards(); saveSettings(); renderCards();
        });
        item.appendChild(del);
      }
      grid.appendChild(item);
    }
    $('matchToggle').checked = !!activeCard().match;
  }
  $('matchToggle').addEventListener('change', (e) => { activeCard().match = e.target.checked; saveCards(); });
  $('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadPhoto(f); e.target.value = ''; });
  $('grabBtn').addEventListener('click', startGrab);
  $('previewBtn').addEventListener('click', () => { closeSettings(); setTimeout(triggerSequence, 400); });
  $('replateBtn').addEventListener('click', () => { invalidatePlate(); toast('Mask will re-capture – keep the bottom clear', 1800); });

  // ---------------------------------------------------------------- settings panel
  const settingsEl = $('settings');
  function bindSettings() {
    for (const el of settingsEl.querySelectorAll('[data-key]')) {
      const key = el.dataset.key;
      if (el.type === 'checkbox') el.checked = !!S[key];
      else el.value = S[key];
      el.oninput = el.onchange = () => {
        S[key] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
        if (/^mask/.test(key)) invalidatePlate();
        saveSettings();
        refreshOutputs();
      };
    }
    refreshOutputs();
  }
  function refreshOutputs() {
    for (const el of settingsEl.querySelectorAll('[data-out]')) el.textContent = S[el.dataset.out];
    $('armDot').classList.toggle('show', S.showDot && S.armed);
    $('grid').classList.toggle('show', !!S.grid);
    updateLevel();
  }
  function openSettings() { bindSettings(); renderCards(); settingsEl.hidden = false; }
  function closeSettings() {
    settingsEl.hidden = true; resetBackground(); track = null; seq = null;
    if (S.level) enableMotion();   // iOS only allows the motion permission prompt from a tap
  }
  $('closeSettings').addEventListener('click', closeSettings);
  $('resetBgBtn').addEventListener('click', () => { resetBackground(); toast('Background reset', 1000); });
  $('resetAllBtn').addEventListener('click', () => {
    if (!confirm('Reset all settings (cards are kept)?')) return;
    Object.assign(S, DEFAULTS); saveSettings(); bindSettings(); renderCards();
  });

  // ---------------------------------------------------------------- toast
  let toastTimer = 0;
  function toast(msg, ms) {
    const el = $('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ---------------------------------------------------------------- camera UI behaviour
  const app = $('app');
  let mode = S.mode === 'photo' ? 'photo' : 'video';

  function setMode(m, restart) {
    mode = m; S.mode = m; saveSettings();
    app.classList.toggle('mode-video', m === 'video');
    app.classList.toggle('mode-photo', m === 'photo');
    for (const el of $('modeStrip').children) el.classList.toggle('active', el.dataset.mode === m);
    requestAnimationFrame(() => { centerMode(); resize(); });
    if (restart) { track = null; startCamera(); }
  }
  function centerMode() {
    const strip = $('modeStrip'), active = strip.querySelector('.active');
    const x = $('modePill').clientWidth / 2 - (active.offsetLeft + active.offsetWidth / 2);
    strip.style.transform = `translateX(${x}px)`;
  }
  $('modeStrip').addEventListener('click', (e) => {
    const m = e.target.dataset && e.target.dataset.mode;
    if (m && m !== mode && !isRecording()) setMode(m, true);
  });

  // photo-mode top pills
  const flashStates = ['flash-auto', 'flash-on', 'flash-off'];
  let flashState = 0;
  $('flashBtn').addEventListener('click', (e) => {
    e.currentTarget.classList.remove(flashStates[flashState]);
    flashState = (flashState + 1) % flashStates.length;
    e.currentTarget.classList.add(flashStates[flashState]);
  });
  $('liveBtn').addEventListener('click', (e) => e.currentTarget.classList.toggle('off'));
  $('frameBtn').addEventListener('click', (e) => e.currentTarget.classList.toggle('on'));

  // video-mode format badges
  $('resBtn').addEventListener('click', (e) => { e.target.textContent = e.target.textContent === '4K' ? 'HD' : '4K'; });
  const rates = ['30', '60', '24'];
  $('fpsBtn').addEventListener('click', (e) => { e.target.textContent = rates[(rates.indexOf(e.target.textContent) + 1) % rates.length]; });

  // ---- level: iOS draws a white and a yellow cross when the phone lies flat; they meet when level
  const levelEl = $('level');
  let motion = null;   // {beta, gamma} once the sensor is running
  function updateLevel() {
    let show = !!S.level, dx = 9, dy = 0;     // no sensor yet: look like the screenshot (nearly level)
    if (motion) {
      show = show && Math.abs(motion.beta) < 25 && Math.abs(motion.gamma) < 25;
      dx = motion.gamma * 3; dy = motion.beta * 3;
    }
    const flat = Math.hypot(dx, dy) < 2.5;
    if (flat) dx = dy = 0;
    levelEl.classList.toggle('show', show);
    levelEl.classList.toggle('flat', flat);
    levelEl.style.setProperty('--lx', dx.toFixed(1) + 'px');
    levelEl.style.setProperty('--ly', dy.toFixed(1) + 'px');
  }
  function onOrientation(e) {
    if (e.beta == null) return;
    const m = motion || { beta: e.beta, gamma: e.gamma };
    m.beta += (e.beta - m.beta) * 0.3; m.gamma += (e.gamma - m.gamma) * 0.3;
    motion = m;
    updateLevel();
  }
  let motionOn = false;
  function enableMotion() {
    if (motionOn) return;
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return;
    const listen = () => { motionOn = true; window.addEventListener('deviceorientation', onOrientation); };
    if (typeof DOE.requestPermission === 'function') DOE.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {});
    else listen();
  }

  // ---- thumbnail: the real app shows your last photo; use a frame from the camera shortly after launch
  function setThumb() {
    const t = $('thumbCv'), g = t.getContext('2d');
    const side = Math.min(W, H);
    g.drawImage(screenCv, (W - side) / 2, (H - side) / 2, side, side, 0, 0, t.width, t.height);
  }
  let thumbSet = false;
  video.addEventListener('playing', () => setTimeout(() => { if (!thumbSet) { thumbSet = true; setThumb(); } }, 1200));

  $('shutter').addEventListener('click', () => {
    const f = $('flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    thumbSet = true;
    setThumb();
  });

  // ---- recording: records the screen canvas, so the overlay is in the clip
  let recorder = null, recChunks = [], recStart = 0, recTick = 0, lastClip = null;
  const isRecording = () => app.classList.contains('recording');
  function updateRecTime() {
    const s = Math.floor((performance.now() - recStart) / 1000);
    $('recTime').textContent = [s / 3600, (s % 3600) / 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, '0')).join(':');
  }
  function startRecording() {
    app.classList.add('recording');
    if (S.trigger !== 'tap') triggerSequence();
    recStart = performance.now(); updateRecTime();
    recTick = setInterval(updateRecTime, 250);
    recChunks = [];
    try {
      const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
      const type = window.MediaRecorder && types.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(screenCv.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 8e6 } : undefined);
      rec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
      rec.onstop = () => { lastClip = new Blob(recChunks, { type: rec.mimeType || type || 'video/mp4' }); };
      rec.start(1000);
      recorder = rec;
    } catch { recorder = null; }
  }
  function stopRecording() {
    app.classList.remove('recording');
    clearInterval(recTick);
    if (recorder) { recorder.stop(); recorder = null; }
    thumbSet = true;
    setThumb();
  }
  $('recBtn').addEventListener('click', () => (isRecording() ? stopRecording() : startRecording()));

  const viewer = $('viewer'), playback = $('playback');
  function openViewer() {
    if (!lastClip) return;
    playback.src = URL.createObjectURL(lastClip);
    viewer.hidden = false;
    playback.play().catch(() => {});
  }
  $('viewerClose').addEventListener('click', () => { playback.pause(); URL.revokeObjectURL(playback.src); viewer.hidden = true; });
  $('viewerShare').addEventListener('click', async () => {
    if (!lastClip) return;
    const ext = lastClip.type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([lastClip], `IMG_${String(Date.now()).slice(-4)}.${ext}`, { type: lastClip.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch {}
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file); a.download = file.name; a.click();
    }
  });

  $('flipBtn').addEventListener('click', (e) => {
    if (isRecording()) return;
    e.currentTarget.classList.toggle('spin');
    facing = facing === 'user' ? 'environment' : 'user';
    track = null;
    startCamera();
  });

  // long-press thumbnail -> settings
  // (a short tap plays back the last recording)
  let pressTimer = 0;
  const thumb = $('thumb');
  thumb.addEventListener('touchstart', () => {
    pressTimer = setTimeout(() => { pressTimer = 0; openSettings(); }, 700);
  }, { passive: true });
  thumb.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; openViewer(); }
  });
  thumb.addEventListener('touchmove', () => { clearTimeout(pressTimer); pressTimer = 0; }, { passive: true });
  thumb.addEventListener('click', openViewer);
  thumb.addEventListener('contextmenu', (e) => { e.preventDefault(); openSettings(); }); // desktop: right-click

  // taps on the picture: 1 finger = focus square, 2 = arm/disarm, 3 = next card
  let gesture = null;
  viewport.addEventListener('touchstart', (e) => {
    if (e.target.closest('button')) return;      // record / 4K / more buttons sit on the picture
    if (!gesture) gesture = { start: performance.now(), max: 0, moved: false, x: 0, y: 0 };
    gesture.max = Math.max(gesture.max, e.touches.length);
    const t = e.touches[0];
    gesture.x = t.clientX; gesture.y = t.clientY;
    e.preventDefault();
  }, { passive: false });
  viewport.addEventListener('touchmove', (e) => {
    if (!gesture) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - gesture.x, t.clientY - gesture.y) > 25) gesture.moved = true;
  }, { passive: true });
  viewport.addEventListener('touchend', (e) => {
    if (!gesture || e.touches.length) return;
    const g = gesture; gesture = null;
    if (g.moved || performance.now() - g.start > 600) return;
    if (g.max === 1) showFocus(g.x, g.y);
    else if (g.max === 2) (S.trick === 'timed' && S.trigger !== 'record' ? triggerSequence() : toggleArmed());
    else if (g.max >= 3) nextCard();
  });
  viewport.addEventListener('click', (e) => { if (e.pointerType !== 'touch') showFocus(e.clientX, e.clientY); });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  function showFocus(x, y) {
    const r = viewport.getBoundingClientRect();
    const f = $('focus');
    f.style.left = (x - r.left) + 'px'; f.style.top = (y - r.top) + 'px';
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
  function toggleArmed() {
    S.armed = !S.armed; saveSettings(); refreshOutputs();
    if (S.armed) { resetBackground(); track = null; invalidatePlate(); }
  }
  function nextCard() {
    const i = cards.findIndex((c) => c.id === activeCard().id);
    S.activeCard = cards[(i + 1) % cards.length].id;
    saveSettings();
  }

  // keyboard shortcuts for testing on a laptop
  document.addEventListener('keydown', (e) => {
    if (!settingsEl.hidden) return;
    if (e.key === 's') openSettings();
    if (e.key === 'a') toggleArmed();
    if (e.key === 'n') nextCard();
    if (e.key === 't') triggerSequence();
    if (e.key === 'd') { S.debug = !S.debug; saveSettings(); }
  });

  // ---------------------------------------------------------------- boot
  window.addEventListener('resize', () => { resize(); centerMode(); });
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { resetBackground(); invalidatePlate(); } });
  setMode(mode, false);
  resize();
  if (!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) enableMotion();
  refreshOutputs();
  renderCards();
  startCamera();
  requestAnimationFrame(loop);

  window.__trick = { S, get track() { return track; }, get fps() { return fps; }, cards };   // handy for debugging
})();
