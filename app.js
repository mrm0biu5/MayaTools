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
    armed: true, activeCard: BUILTIN_ID, mirrorOverlay: true, flip180: false, fingers: true, showDot: true,
    margin: 4, smooth: 30, hold: 6,
    bright: 140, maxSat: 30, minSize: 2, useBg: true, bgDiff: 25, debug: false,
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
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      video.srcObject = stream;
      await video.play();
      $('camError').hidden = true;
      resetBackground();
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
  let lum, mask, labels, queue, bx, by, sk, bg, skinData, lastPixels = null;

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
    centerModes();
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
  let bgFrames = 0;
  const BG_WARMUP = 15;
  function resetBackground() { bg = null; bgFrames = 0; }
  const bgReady = () => bg && bgFrames >= BG_WARMUP;
  function updateBackground() {
    if (!bg) { bg = Float32Array.from(lum); bgFrames = 1; return; }
    // learn fast during warm-up, then slowly, and never from pixels that look like the card
    const a = bgFrames < BG_WARMUP ? 0.3 : 0.02;
    for (let i = 0; i < N; i++) if (!mask[i]) bg[i] += (lum[i] - bg[i]) * a;
    bgFrames++;
  }

  // ---------------------------------------------------------------- detection
  let memory = null;   // last fully visible card size {s, l, t}

  function detect() {
    const data = dctx.getImageData(0, 0, DW, DH).data;
    lastPixels = data;
    const bright = S.bright, maxSat = S.maxSat / 100, useBg = S.useBg && bgReady(), diff = S.bgDiff;
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[i] = l;
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      let m = l >= bright && (mx - mn) <= maxSat * mx;
      if (m && useBg && Math.abs(l - bg[i]) < diff) m = false;
      mask[i] = m ? 1 : 0;
    }
    updateBackground();
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
      if (area < (touch ? minArea * 0.25 : minArea)) continue;
      const c = analyse(nb, area, touch);
      if (c && (!best || c.area > best.area)) { c.color = [sr / area, sg / area, sb / area]; best = c; }
    }
    if (best && !best.touch) memory = { s: best.s, l: best.l, t: performance.now() };
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
    const mem = memory && performance.now() - memory.t < 4000 ? memory : null;
    const setFull = (ax, full) => {
      if (full <= ax.len) return;
      const shift = (full - ax.len) / 2 * ax.sign;
      R.cx += ax.dx * shift; R.cy += ax.dy * shift;
      ax.len = full;
    };
    const one = (T, O) => {
      let isLong;
      if (T.len > (O.len / CARD_ASPECT) * 1.05) isLong = true;
      else if (mem) isLong = Math.abs(O.len - mem.s) < Math.abs(O.len - mem.l);
      else isLong = true;
      setFull(T, isLong ? O.len * CARD_ASPECT : O.len / CARD_ASPECT);
    };
    if (R.a.trunc && !R.b.trunc) one(R.a, R.b);
    else if (R.b.trunc && !R.a.trunc) one(R.b, R.a);
    else if (R.a.trunc && R.b.trunc && mem) {
      const [big, small] = R.a.len >= R.b.len ? [R.a, R.b] : [R.b, R.a];
      if (big.len <= mem.l && small.len <= mem.s) { setFull(big, mem.l); setFull(small, mem.s); }
      else { setFull(big, mem.s); setFull(small, mem.l); }
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
        if (useBg && Math.abs(Y - bg[i]) < S.bgDiff * 0.6) continue;
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
      const raw = detect();
      const t = updateTrack(raw);
      if (grab) handleGrab(raw);
      else if (t && S.armed && settingsEl.hidden) drawOverlay(t);
      if (S.debug || grab) drawDebug(raw, t);
    }
    requestAnimationFrame(loop);
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

  // ---------------------------------------------------------------- settings panel
  const settingsEl = $('settings');
  function bindSettings() {
    for (const el of settingsEl.querySelectorAll('[data-key]')) {
      const key = el.dataset.key;
      if (el.type === 'checkbox') el.checked = !!S[key];
      else el.value = S[key];
      el.oninput = el.onchange = () => {
        S[key] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
        saveSettings();
        refreshOutputs();
      };
    }
    refreshOutputs();
  }
  function refreshOutputs() {
    for (const el of settingsEl.querySelectorAll('[data-out]')) el.textContent = S[el.dataset.out];
    $('armDot').classList.toggle('show', S.showDot && S.armed);
  }
  function openSettings() { bindSettings(); renderCards(); settingsEl.hidden = false; }
  function closeSettings() { settingsEl.hidden = true; resetBackground(); track = null; }
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
  function centerModes() {
    const strip = $('modeStrip'), active = strip.querySelector('.active');
    const x = window.innerWidth / 2 - (active.offsetLeft + active.offsetWidth / 2);
    strip.style.left = x + 'px';
  }

  $('flashBtn').addEventListener('click', (e) => e.currentTarget.classList.toggle('on'));
  $('liveBtn').addEventListener('click', (e) => e.currentTarget.classList.toggle('off'));

  $('shutter').addEventListener('click', () => {
    const f = $('flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    const t = $('thumbCv'), g = t.getContext('2d');
    const side = Math.min(W, H);
    g.drawImage(screenCv, (W - side) / 2, (H - side) / 2, side, side, 0, 0, t.width, t.height);
  });

  $('flipBtn').addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('spin');
    facing = facing === 'user' ? 'environment' : 'user';
    $('wideBtn').style.display = facing === 'user' ? '' : 'none';
    track = null;
    startCamera();
  });

  // long-press thumbnail -> settings
  let pressTimer = 0;
  const thumb = $('thumb');
  thumb.addEventListener('touchstart', () => { pressTimer = setTimeout(openSettings, 700); }, { passive: true });
  thumb.addEventListener('touchend', () => clearTimeout(pressTimer));
  thumb.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
  thumb.addEventListener('contextmenu', (e) => { e.preventDefault(); openSettings(); }); // desktop: right-click

  // taps on the picture: 1 finger = focus square, 2 = arm/disarm, 3 = next card
  let gesture = null;
  viewport.addEventListener('touchstart', (e) => {
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
    else if (g.max === 2) toggleArmed();
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
    if (S.armed) { resetBackground(); track = null; }
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
    if (e.key === 'd') { S.debug = !S.debug; saveSettings(); }
  });

  // ---------------------------------------------------------------- boot
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resetBackground(); });
  resize();
  refreshOutputs();
  renderCards();
  startCamera();
  requestAnimationFrame(loop);

  window.__trick = { S, get track() { return track; }, cards };   // handy for debugging
})();
