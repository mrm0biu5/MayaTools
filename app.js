'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const video = $('video');
  const viewport = $('viewport');
  const screenCv = $('screen');
  const sctx = screenCv.getContext('2d');
  // debug drawings go on their own layer so they can never end up in a recording
  const debugCv = $('debugLayer');
  const gctx = debugCv.getContext('2d');
  const layer = document.createElement('canvas');          // overlay compositing layer
  const lctx = layer.getContext('2d');
  const det = document.createElement('canvas');            // low-res detection frame
  const dctx = det.getContext('2d', { willReadFrequently: true });
  const skinCv = document.createElement('canvas');         // finger mask
  const skctx = skinCv.getContext('2d');

  // keep in step with version.json and the ?v= in index.html
  const APP_VERSION = '19';
  const CARD_W = 500, CARD_H = 700;
  const CARD_ASPECT = CARD_H / CARD_W;                     // long / short (poker card 88.9 x 63.5mm)
  const BUILTIN_ID = 'builtin-3c';

  // ---------------------------------------------------------------- storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  const DEFAULTS = {
    armed: true, activeCard: BUILTIN_ID, mode: 'video', grid: true, level: true, showVersion: true, realRecord: false, recordAudio: false,
    // timed trick: a fake card animates over the live picture while the bottom is masked
    trick: 'timed', realCard: '', lead: 40, path: 'swipe-rl', trigger: 'tap', dur: 3.2, pause: 0.6, delay: 5, cueLead: 1,
    cardW: 78, cardY: 95, restX: 58, tilt: -4, cardBright: 100, grain: 30, blur: 20, wobble: true,
    mask: 'off', maskH: 40, maskFeather: 10, maskAfter: 1.5, mirrorOverlay: true, flip180: false, fingers: true, showDot: true,
    margin: 4, smooth: 10, hold: 4, cardS: 50,
    bright: 70, maxSat: 30, minSize: 2, useBg: true, bgDiff: 20, edges: true, edgeT: 7, debug: false,
  };
  // bump when the default card movement changes, so phones that already saved settings pick it up
  const MOVEMENT_VERSION = 5;
  const MOVEMENT_KEYS = ['path', 'dur', 'pause', 'delay', 'cardW', 'cardY', 'restX', 'tilt', 'blur', 'mask', 'trigger', 'recordAudio'];
  const saved = store.get('ct.settings', {});
  if (saved.movementVersion !== MOVEMENT_VERSION) MOVEMENT_KEYS.forEach((k) => delete saved[k]);
  const S = Object.assign({}, DEFAULTS, saved, { movementVersion: MOVEMENT_VERSION });
  const saveSettings = () => store.set('ct.settings', S);

  let cards = store.get('ct.cards', []);                  // [{id, name, src, match, builtin}]
  if (!cards.some((c) => c.id === BUILTIN_ID)) cards.unshift({ id: BUILTIN_ID, name: '3♣', builtin: true, match: true });
  const saveCards = () => store.set('ct.cards', cards);
  const images = new Map();                                // id -> drawable

  function cardImage(card) {
    if (images.has(card.id)) return images.get(card.id);
    let img;
    if (card.builtin) img = makeThreeOfClubs();
    else {
      // photos are stored as JPEG (no transparency), so round the corners when loading
      img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = CARD_W; c.height = CARD_H;
        const g = c.getContext('2d');
        g.beginPath();
        g.roundRect ? g.roundRect(0, 0, CARD_W, CARD_H, 26) : g.rect(0, 0, CARD_W, CARD_H);
        g.clip();
        g.drawImage(img, 0, 0, CARD_W, CARD_H);
        images.set(card.id, c);
      };
      img.src = card.src;
    }
    images.set(card.id, img);
    return img;
  }
  const activeCard = () => cards.find((c) => c.id === S.activeCard) || cards[0];
  const ready = (img) => img instanceof HTMLCanvasElement;   // photos become a canvas once loaded

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
      const videoC = { facingMode: facing, width: { ideal: 1920 }, height: { ideal: mode === 'video' ? 1080 : 1440 } };
      // ask for the microphone together with the camera (like the real app) so recordings have sound;
      // if it's refused, carry on with video only
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: S.realRecord && S.recordAudio, video: videoC });
      } catch (e) {
        if (!(S.realRecord && S.recordAudio)) throw e;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoC });
      }
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
  let white, bgLum, edgeTmp;
  let lum, mask, labels, queue, bx, by, sk, skinData, lastPixels = null;
  let bgR = null, bgG = null, bgB = null, gain = 1;

  // Launched from the home screen, iOS draws the app under the status bar but keeps the bottom
  // (home-bar) strip for itself. In that case don't add our own bottom safe-area padding on top.
  function fitAppHeight() {
    const root = document.documentElement.style;
    const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    const reserved = standalone ? screen.height - window.innerHeight : 0;
    root.setProperty('--app-h', window.innerHeight + 'px');
    if (reserved > 20) root.setProperty('--bottom', '0px');
    else root.removeProperty('--bottom');
  }

  function resize() {
    fitAppHeight();
    const r = viewport.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr));
    H = Math.max(1, Math.round(r.height * dpr));
    screenCv.width = layer.width = debugCv.width = W;
    screenCv.height = layer.height = debugCv.height = H;
    DW = 150; DH = Math.round(DW * H / W);
    det.width = skinCv.width = DW;
    det.height = skinCv.height = DH;
    N = DW * DH;
    lum = new Float32Array(N); mask = new Uint8Array(N); labels = new Int32Array(N);
    white = new Uint8Array(N); bgLum = new Float32Array(N); edgeTmp = new Uint8Array(N);
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
    // median brightness ratio (now / learnt) over pixels that are clearly background: not card-like last
    // frame and away from where the card was. A median ignores whatever the card is covering.
    const hist = new Uint32Array(151);   // ratio 0.5 .. 2.0 in steps of 0.01
    let count = 0;
    const t = S.trick === 'guided' ? guideRect() : track, k = t ? 1.4 : 0;
    const cos = t ? Math.cos(t.theta) : 0, sin = t ? Math.sin(t.theta) : 0;
    for (let y = 1; y < DH; y += 3) {
      for (let x = 1; x < DW; x += 3) {
        const i = y * DW + x;
        if (mask[i]) continue;
        if (t) {
          const dx = x - t.cx, dy = y - t.cy;
          if (Math.abs(dx * cos + dy * sin) < t.s / 2 * k && Math.abs(-dx * sin + dy * cos) < t.l / 2 * k) continue;
        }
        const p = i * 4;
        const now = data[p] + data[p + 1] + data[p + 2], was = bgR[i] + bgG[i] + bgB[i];
        if (was < 30) continue;
        const r = Math.round((now / was - 0.5) * 100);
        hist[Math.max(0, Math.min(150, r))]++; count++;
      }
    }
    if (count < 50) return 1;
    let acc = 0;
    for (let b = 0; b <= 150; b++) { acc += hist[b]; if (acc >= count / 2) return 0.5 + b / 100; }
    return 1;
  }

  // A card close to the lens is often about as bright as the ceiling behind it, but its outline and pips
  // are sharp new lines that weren't in the empty scene. Mark edges that are stronger now than in the
  // learnt background (allowing for exposure), thicken them, and add them to the card mask.
  function addNewEdges(data) {
    for (let i = 0; i < N; i++) bgLum[i] = (0.299 * bgR[i] + 0.587 * bgG[i] + 0.114 * bgB[i]) * gain;
    const sob = (a, i) => {
      const gx = a[i - DW + 1] + 2 * a[i + 1] + a[i + DW + 1] - a[i - DW - 1] - 2 * a[i - 1] - a[i + DW - 1];
      const gy = a[i + DW - 1] + 2 * a[i + DW] + a[i + DW + 1] - a[i - DW - 1] - 2 * a[i - DW] - a[i - DW + 1];
      return Math.abs(gx) + Math.abs(gy);
    };
    edgeTmp.fill(0);
    const thr = S.edgeT * 4;
    for (let y = 1; y < DH - 1; y++) {
      for (let x = 1; x < DW - 1; x++) {
        const i = y * DW + x;
        if (sob(lum, i) - sob(bgLum, i) < thr) continue;
        const p = i * 4, r = data[p], g = data[p + 1], b = data[p + 2];
        const Cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b, Cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
        if (Cr >= 138 && Cr <= 180 && Cb >= 77 && Cb <= 130) continue;      // finger, not card
        edgeTmp[i] = 1;
      }
    }
    // thicken by 2px so the outline and pips join up into one blob. Skip lone pixels: real edges are
    // lines (each pixel has edge neighbours), camera noise is isolated specks.
    for (let y = 1; y < DH - 1; y++) {
      for (let x = 1; x < DW - 1; x++) {
        const i = y * DW + x;
        if (!edgeTmp[i]) continue;
        const nbrs = edgeTmp[i - 1] + edgeTmp[i + 1] + edgeTmp[i - DW] + edgeTmp[i + DW] +
          edgeTmp[i - DW - 1] + edgeTmp[i - DW + 1] + edgeTmp[i + DW - 1] + edgeTmp[i + DW + 1];
        if (nbrs < 2) continue;
        for (let yy = Math.max(0, y - 2); yy <= Math.min(DH - 1, y + 2); yy++) {
          for (let xx = Math.max(0, x - 2); xx <= Math.min(DW - 1, x + 2); xx++) mask[yy * DW + xx] = 1;
        }
      }
    }
  }

  // erode then dilate the card mask twice: removes specks and cuts thin bridges that would join the card
  // to a patch of background into one blob that isn't card-shaped
  let maskTmp = null;
  function openMask() {
    if (!maskTmp || maskTmp.length !== N) maskTmp = new Uint8Array(N);
    const step = (src, dst, erode) => {
      for (let y = 0; y < DH; y++) {
        for (let x = 0; x < DW; x++) {
          const i = y * DW + x;
          const l = x > 0 ? src[i - 1] : src[i], r = x < DW - 1 ? src[i + 1] : src[i];
          const u = y > 0 ? src[i - DW] : src[i], d = y < DH - 1 ? src[i + DW] : src[i];
          dst[i] = erode ? (src[i] & l & r & u & d) : (src[i] | l | r | u | d);
        }
      }
    };
    step(mask, maskTmp, true); step(maskTmp, mask, true);
    step(mask, maskTmp, false); step(maskTmp, mask, false);
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

  // per-pixel evidence of "card here": white-ish and changed from the learnt scene, plus new edges.
  // Returns the frame's pixels, or null while the background is still being learnt.
  function buildEvidence() {
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
      white[i] = m ? 1 : 0;
      if (m && useBg) {
        const d = Math.max(Math.abs(r - bgR[i] * gain), Math.abs(g - bgG[i] * gain), Math.abs(b - bgB[i] * gain));
        if (d < diff) m = false;
      }
      mask[i] = m ? 1 : 0;
    }
    if (bgReady() || !S.useBg) {
      openMask();
      if (useBg && S.edges) addNewEdges(data);
    }
    updateBackground(data);
    if (!bgReady() && S.useBg) return null;
    return data;
  }

  function detect() {
    const data = buildEvidence();
    if (!data) return null;
    labels.fill(0);
    const minArea = (S.minSize / 100) * N;
    let best = null, label = 0;
    why.length = 0;
    for (let i = 0; i < N; i++) {
      if (!mask[i] || labels[i]) continue;
      label++;
      let qh = 0, qt = 0, area = 0, nb = 0, sr = 0, sg = 0, sb = 0, wn = 0, touch = false;
      queue[qt++] = i; labels[i] = label;
      while (qh < qt) {
        const j = queue[qh++];
        const x = j % DW, y = (j / DW) | 0;
        area++;
        if (white[j]) { const p = j * 4; sr += data[p]; sg += data[p + 1]; sb += data[p + 2]; wn++; }
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
      if (c && (!best || c.area > best.area)) { c.color = wn > 20 ? [sr / wn, sg / wn, sb / wn] : scene.rgb.slice(); best = c; }
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

  const why = [];   // debug: why each blob was rejected
  function analyse(nb, area, touch) {
    const r = analyse2(nb, area, touch);
    if (S.debug) why.push(r && r.reason ? r.reason : (r ? 'ok' : 'tiny') + ' a=' + area + (touch ? ' edge' : ''));
    return r && r.reason ? null : r;
  }
  // fraction of the rectangle's outline (the parts inside the picture) that lies on mask pixels
  function outlineSupport(R) {
    let on = 0, all = 0;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => [
      R.cx - 0.5 + su * R.a.dx * (R.a.len / 2 - 1.5) + sv * R.b.dx * (R.b.len / 2 - 1.5),
      R.cy - 0.5 + su * R.a.dy * (R.a.len / 2 - 1.5) + sv * R.b.dy * (R.b.len / 2 - 1.5)]);
    for (let c = 0; c < 4; c++) {
      const [x0, y0] = corners[c], [x1, y1] = corners[(c + 1) % 4];
      const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + (x1 - x0) * s / steps), y = Math.round(y0 + (y1 - y0) * s / steps);
        if (x < 1 || y < 1 || x >= DW - 1 || y >= DH - 1) continue;     // off-screen part of the card
        all++;
        const i = y * DW + x;
        if (mask[i] | mask[i - 1] | mask[i + 1] | mask[i - DW] | mask[i + DW]) on++;
      }
    }
    return all ? on / all : 0;
  }

  function analyse2(nb, area, touch) {
    if (nb < 3) return null;
    const h = convexHull(nb);
    if (h.length < 3) return null;
    const R = minAreaRect(h);
    if (!R || R.area <= 0) return null;
    const hullArea = polyArea(h);
    if (hullArea / R.area < (touch ? 0.72 : 0.84)) return { reason: 'notRect ' + (hullArea / R.area).toFixed(2) + ' a=' + area };
    // filled in (seen by colour) or outlined (seen by edges): most of the rectangle's sides must be there
    if (area / (hullArea + 1) < 0.25) {
      const sup = outlineSupport(R);
      if (sup < 0.6) return { reason: 'sparse ' + (area / hullArea).toFixed(2) + ' outline ' + sup.toFixed(2) + ' a=' + area };
    }
    if (!touch) {
      const ar = Math.min(R.a.len, R.b.len) / Math.max(R.a.len, R.b.len);
      if (ar < 0.55 || ar > 0.88) return { reason: 'aspect ' + ar.toFixed(2) + ' a=' + area };
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

  // ---------------------------------------------------------------- guided tracking
  // You move the real card along an agreed path (e.g. right -> left across the lower part of the
  // screen). Size, tilt and lane are known, so per frame the app only has to measure how far along the
  // path the card is: it sums the evidence across the card's lane for every position along the path,
  // finds the card's span (rebuilding the off-screen part from the known size), and, if you've told it
  // which real card you hold, slides that card's printed pattern along to pin the position exactly.
  let guide = null, guideLost = 0;
  const isHorizontalPath = () => S.path === 'swipe-rl' || S.path === 'swipe-lr';
  function guideGeom() {
    const s = DW * S.cardW / 100, l = s * CARD_ASPECT, horiz = isHorizontalPath();
    return {
      s, l, horiz,
      along: horiz ? s : l, across: horiz ? l : s,
      lane: horiz ? DH * S.cardY / 100 : DW * S.restX / 100,
      len: horiz ? DW : DH, span: horiz ? DH : DW,
    };
  }
  // the card's rectangle in detection pixels, for the exposure estimate and the finger mask
  function guideRect() {
    if (!guide) return null;
    const g = guideGeom();
    return { cx: g.horiz ? guide.c : g.lane, cy: g.horiz ? g.lane : guide.c, s: g.s, l: g.l, theta: S.tilt * Math.PI / 180 };
  }

  const isSkinPx = (d, p) => {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    const Cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b, Cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
    return Cr >= 138 && Cr <= 180 && Cb >= 77 && Cb <= 130;
  };

  // printed pattern of the real card you hold: how much ink each slice across the path contains,
  // counting only the part of the card that is on screen
  const tplCache = new Map();
  function realTemplate(g) {
    const card = cards.find((c) => c.id === S.realCard);
    if (!card) return null;
    const img = cardImage(card);
    if (!ready(img)) return null;
    const sw = Math.max(4, Math.round(g.s)), sh = Math.max(4, Math.round(g.l));
    const key = [card.id, sw, sh, Math.round(g.lane), g.horiz, mirrored()].join(':');
    if (tplCache.has(key)) return tplCache.get(key);
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const cx = c.getContext('2d');
    if (mirrored()) { cx.translate(sw, 0); cx.scale(-1, 1); }   // the real card is seen mirrored, like a selfie
    cx.drawImage(img, 0, 0, sw, sh);
    const d = cx.getImageData(0, 0, sw, sh).data;
    const n = g.horiz ? sw : sh, out = new Float32Array(n);
    // visible part across the lane
    const off = g.lane - (g.horiz ? sh : sw) / 2;
    for (let k = 0; k < n; k++) {
      let ink = 0, cnt = 0;
      const m = g.horiz ? sh : sw;
      for (let j = 0; j < m; j++) {
        const pos = off + j;
        if (pos < 0 || pos >= g.span) continue;
        const p = ((g.horiz ? j * sw + k : k * sw + j)) * 4;
        const lum = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        if (lum < 140) ink++;
        cnt++;
      }
      out[k] = cnt ? ink / cnt : 0;
    }
    if (tplCache.size > 20) tplCache.clear();
    tplCache.set(key, out);
    return out;
  }

  const gProf = new Float32Array(4096), gInk = new Float32Array(4096);
  let guideDebug = null;
  function guidedMeasure(data) {
    const g = guideGeom();
    const a0 = Math.max(0, Math.round(g.lane - g.across / 2)), a1 = Math.min(g.span - 1, Math.round(g.lane + g.across / 2));
    if (a1 - a0 < 3) return null;
    const rows = a1 - a0 + 1;
    let peak = 0;
    for (let u = 0; u < g.len; u++) {
      let m = 0, k = 0;
      for (let v = a0; v <= a1; v++) {
        const i = g.horiz ? v * DW + u : u * DW + v;
        m += mask[i];
        // ink: much darker than the scene normally is here, and not a finger
        const bl = (0.299 * bgR[i] + 0.587 * bgG[i] + 0.114 * bgB[i]) * gain;
        if (lum[i] < bl - 35 && !isSkinPx(data, i * 4)) k++;
      }
      gProf[u] = m / rows; gInk[u] = k / rows;
      peak = Math.max(peak, gProf[u] + gInk[u]);
    }
    guideDebug = { g, a0, a1, peak };
    if (peak < 0.05) return null;
    // the longest stretch of evidence along the path (small gaps allowed)
    const thr = Math.max(0.03, peak * 0.25), gapMax = Math.max(2, g.along * 0.12);
    let best = null, cur = null, gap = 0;
    for (let u = 0; u < g.len; u++) {
      const e = gProf[u] + gInk[u];
      if (e > thr) { if (!cur) cur = { a: u, b: u, sum: 0 }; cur.b = u; cur.sum += e; gap = 0; }
      else if (cur && ++gap > gapMax) { if (!best || cur.sum > best.sum) best = cur; cur = null; gap = 0; }
    }
    if (cur && (!best || cur.sum > best.sum)) best = cur;
    if (!best || best.b - best.a < 2) return null;
    const runLen = best.b - best.a + 1, lo = best.a <= 1, hi = best.b >= g.len - 2;
    let c;
    if (runLen >= g.along * 0.9 || lo === hi) c = (best.a + best.b + 1) / 2;
    else if (lo) c = best.b + 1 - g.along / 2;       // hangs off the start of the screen
    else c = best.a + g.along / 2;                    // hangs off the end of the screen
    // known card: slide its printed pattern along and take the best match nearby
    const tpl = realTemplate(g);
    guideDebug.run = best; guideDebug.c0 = c;
    if (tpl) {
      const n = tpl.length;
      let tm = 0; for (let k = 0; k < n; k++) tm += tpl[k]; tm /= n;
      let bestScore = 0.45, bestC = c;
      for (let cc = c - g.along * 0.35; cc <= c + g.along * 0.35; cc += 0.5) {
        const start = cc - g.along / 2;
        let sxy = 0, sxx = 0, syy = 0, sy = 0, cnt = 0;
        const ys = [];
        for (let k = 0; k < n; k++) {
          const u = Math.round(start + k);
          if (u < 0 || u >= g.len) continue;
          sy += gInk[u]; cnt++;
        }
        if (cnt < n * 0.3) continue;
        const ym = sy / cnt;
        for (let k = 0; k < n; k++) {
          const u = Math.round(start + k);
          if (u < 0 || u >= g.len) continue;
          const x = tpl[k] - tm, y = gInk[u] - ym;
          sxy += x * y; sxx += x * x; syy += y * y;
        }
        const score = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
        if (score > bestScore) { bestScore = score; bestC = cc; }
      }
      guideDebug.match = bestScore;
      c = bestC;
    }
    return c;
  }

  // smooth the position along the path and remember its speed, so the card can be drawn slightly
  // ahead (the camera picture is always a frame or two old by the time it's on screen)
  function guidedTrack(meas, now) {
    const g = guideGeom();
    if (meas == null) {
      if (guide && ++guideLost > S.hold) guide = null;
      return guide;
    }
    guideLost = 0;
    if (!guide) { guide = { c: meas, v: 0, t: now }; return guide; }
    const dt = Math.max(1, now - guide.t);
    const pred = guide.c + guide.v * dt;
    if (Math.abs(meas - pred) > g.along * 0.6) { guide = { c: meas, v: 0, t: now }; return guide; }
    const a = 1 - (S.smooth / 100) * 0.8, b = 0.4 * a * a;
    const r = meas - pred;
    guide.c = pred + a * r;
    guide.v = Math.max(-2, Math.min(2, guide.v + b * r / dt));
    guide.t = now;
    return guide;
  }

  function runGuided(now) {
    const data = buildEvidence();
    measureScene();
    if (!data) { guide = null; return; }
    const gd = guidedTrack(guidedMeasure(data), now);
    if (S.debug) drawGuideDebug();
    if (!gd || !S.armed || !settingsEl.hidden) return;
    const g = guideGeom(), k = W / DW, m = 1 + S.margin / 100;
    const c = (gd.c + gd.v * S.lead) * k;
    const s = W * S.cardW / 100;
    const p = {
      x: g.horiz ? c : W * S.restX / 100, y: g.horiz ? H * S.cardY / 100 : c,
      s: s * m, l: s * CARD_ASPECT * m, theta: S.tilt * Math.PI / 180,
    };
    const t = guideRect();
    renderCard(sctx, layer, p, {
      post: (gx) => {
        if (!(S.fingers && t && buildSkinMask(t))) return;
        gx.globalCompositeOperation = 'destination-out';
        gx.drawImage(skinCv, 0, 0, W, H);
        gx.globalCompositeOperation = 'source-over';
      },
    });
  }

  function drawGuideDebug() {
    const dg = guideDebug;
    if (!dg) return;
    const k = W / DW, g = dg.g;
    gctx.save();
    gctx.fillStyle = 'rgba(255,214,10,.15)';
    if (g.horiz) gctx.fillRect(0, dg.a0 * k, W, (dg.a1 - dg.a0) * k); else gctx.fillRect(dg.a0 * k, 0, (dg.a1 - dg.a0) * k, H);
    for (let u = 0; u < g.len; u++) {
      const e = Math.min(1, (gProf[u] + gInk[u]) * 2);
      gctx.fillStyle = gInk[u] > gProf[u] ? '#ff3b30' : '#30d158';
      if (g.horiz) gctx.fillRect(u * k, H - e * 120, k, e * 120); else gctx.fillRect(W - e * 120, u * k, e * 120, k);
    }
    if (guide) {
      gctx.strokeStyle = '#0a84ff'; gctx.lineWidth = 3;
      gctx.beginPath();
      if (g.horiz) { gctx.moveTo(guide.c * k, 0); gctx.lineTo(guide.c * k, H); } else { gctx.moveTo(0, guide.c * k); gctx.lineTo(W, guide.c * k); }
      gctx.stroke();
    }
    gctx.fillStyle = '#fff'; gctx.font = '24px -apple-system, sans-serif';
    gctx.fillText(`peak ${dg.peak.toFixed(2)}${dg.match != null ? ' match ' + dg.match.toFixed(2) : ''}${guide ? '' : '  (no card)'}`, 12, 60);
    gctx.restore();
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
  // tracking mode: the replacement card sits exactly on the real one, lit by the real card's own white
  // (measured live), with the same blur / grain as the timed card, and fingers kept in front of it
  function drawOverlay(t) {
    const k = W / DW, m = 1 + S.margin / 100;
    renderCard(sctx, layer, { x: t.cx * k, y: t.cy * k, s: t.s * k * m, l: t.l * k * m, theta: t.theta }, {
      tint: t.color.map((v) => v * 1.02),
      post: (g) => {
        if (!(S.fingers && buildSkinMask(t))) return;
        g.globalCompositeOperation = 'destination-out';
        g.imageSmoothingEnabled = true;
        g.drawImage(skinCv, 0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
      },
    });
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
    gctx.drawImage(det, 8, 8, dw, dh);
    const box = (r, color) => {
      gctx.save();
      gctx.translate(r.cx * k, r.cy * k); gctx.rotate(r.theta);
      gctx.strokeStyle = color; gctx.lineWidth = 3;
      gctx.strokeRect(-r.s * k / 2, -r.l * k / 2, r.s * k, r.l * k);
      gctx.restore();
    };
    if (raw) box(raw, '#ff3b30');
    if (t) box(t, '#ffd60a');
    gctx.fillStyle = '#fff';
    gctx.font = `${Math.round(13 * k / 4)}px -apple-system, sans-serif`;
    gctx.fillText(`${fps.toFixed(0)} fps  bg:${bgReady() ? 'ok' : 'learning'}  ${raw ? (raw.touch ? 'EDGE' : 'CARD') : '-'}`, 12, dh + 30);
  }

  let fps = 0, lastT = performance.now();
  function loop() {
    const now = performance.now();
    fps = fps * 0.9 + (1000 / Math.max(1, now - lastT)) * 0.1;
    lastT = now;
    if (video.readyState >= 2 && video.videoWidth && W) {
      gctx.clearRect(0, 0, W, H);
      drawCover(sctx, W, H, mirrored());
      drawCover(dctx, DW, DH, mirrored());
      liveFrames++;
      if (S.trick === 'timed') {
        runTimed(now);
        drawRecFrame();
      } else if (S.trick === 'guided') {
        runGuided(now);
        drawRecFrame();
      } else {
        const raw = detect();
        const t = updateTrack(raw);
        if (t && S.armed && settingsEl.hidden) drawOverlay(t);
        drawRecFrame();
        if (S.debug) drawDebug(raw, t);
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
    const cy = H * S.cardY / 100, cx = W * S.restX / 100;
    const offBottom = H + l * 0.6 - cy, offTop = cy + l * 0.6;
    const offRight = W + s * 0.75, offLeft = -s * 0.75;
    const seg = (a, mid, b) => (u < 0.5 ? lerp(a, mid, u * 2) : lerp(mid, b, u * 2 - 1));
    let x = cx, y = cy;
    switch (S.path) {
      case 'swipe-lr': x = seg(offLeft, cx, offRight); break;
      case 'rise': y = seg(cy + offBottom, cy, cy + offBottom); break;
      case 'rise-exit': y = seg(cy + offBottom, cy, cy - offTop); break;
      case 'drop': y = seg(cy - offTop, cy, cy - offTop); break;
      default: x = seg(offRight, cx, offLeft);                                 // swipe-rl
    }
    let theta = S.tilt * Math.PI / 180;
    if (S.wobble) {   // a hand never holds a card perfectly still
      theta += Math.sin(t * 2.3) * 0.025 + Math.sin(t * 5.1 + 1) * 0.01;
      x += Math.sin(t * 3.1 + 2) * W * 0.004;
      y += Math.sin(t * 2.7) * W * 0.004;
    }
    return { x, y, s, l, theta };
  }

  // A card this close to the lens is out of focus. Blur it properly (premultiplied box blur x3, which is
  // close to a lens blur) on a canvas with a transparent margin, so the edges soften outwards as well.
  // Returns { img, pad } where pad is the margin in card pixels on each side.
  const softCache = new Map();
  function softCard(card, img) {
    const r = Math.round(S.blur / 100 * 30);     // blur radius in card pixels (card is 500 wide)
    if (r < 1) return { img, pad: 0 };
    const key = card.id + ':' + r;
    if (softCache.has(key)) return softCache.get(key);
    const pad = r * 3, w = CARD_W + pad * 2, h = CARD_H + pad * 2;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, pad, pad, CARD_W, CARD_H);
    const id = g.getImageData(0, 0, w, h), d = id.data, n = w * h;
    const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const a = d[p + 3] / 255;
      ch[0][i] = d[p] * a; ch[1][i] = d[p + 1] * a; ch[2][i] = d[p + 2] * a; ch[3][i] = d[p + 3];
    }
    const tmp = new Float32Array(Math.max(w, h));
    const blur1d = (arr, len, count, stride, step) => {   // running-sum box blur along rows or columns
      const k = 1 / (2 * r + 1);
      for (let line = 0; line < count; line++) {
        const base = line * stride;
        for (let i = 0; i < len; i++) tmp[i] = arr[base + i * step];
        let acc = 0;
        for (let i = -r; i <= r; i++) acc += tmp[Math.min(len - 1, Math.max(0, i))];
        for (let i = 0; i < len; i++) {
          arr[base + i * step] = acc * k;
          acc += tmp[Math.min(len - 1, i + r + 1)] - tmp[Math.max(0, i - r)];
        }
      }
    };
    for (const arr of ch) {
      for (let pass = 0; pass < 3; pass++) {
        blur1d(arr, w, h, w, 1);     // horizontal
        blur1d(arr, h, w, 1, w);     // vertical
      }
    }
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const a = ch[3][i], inv = a > 0.5 ? 255 / a : 0;
      d[p] = ch[0][i] * inv; d[p + 1] = ch[1][i] * inv; d[p + 2] = ch[2][i] * inv; d[p + 3] = a;
    }
    g.putImageData(id, 0, 0);
    const out = { img: c, pad };
    if (softCache.size > 12) softCache.clear();
    softCache.set(key, out);
    return out;
  }

  let grainPat = null;
  function grainPattern() {
    if (grainPat) return grainPat;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), d = g.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 70;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    grainPat = lctx.createPattern(c, 'repeat');
    return grainPat;
  }

  // draw the fake card at p = {x, y, s, l, theta} onto ctx, using scratch (same size as ctx's canvas).
  // opts.tint: light colour to use instead of the room's; opts.post(g): last step on the scratch layer
  function renderCard(ctx, scratch, p, opts = {}) {
    const card = activeCard();
    const raw = cardImage(card);
    if (!ready(raw)) return;
    const { img, pad } = softCard(card, raw);
    // the blurred image has a margin around the card: grow the drawn rectangle to match
    const ex = p.s * pad / CARD_W, ey = p.l * pad / CARD_H;
    const x0 = -p.s / 2 - ex, y0 = -p.l / 2 - ey, dw = p.s + ex * 2, dh = p.l + ey * 2;
    const g = scratch.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, scratch.width, scratch.height);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.theta + (S.flip180 ? Math.PI : 0));
    if (S.mirrorOverlay && mirrored()) g.scale(-1, 1);
    g.drawImage(img, x0, y0, dw, dh);
    // re-light: library cards are stored evenly lit (white paper), so tint them with the room's
    // current colour and brightness, as the camera sees it right now
    if (card.match !== false) {
      const c = (opts.tint || scene.rgb).map((v) => Math.round(Math.min(255, v * S.cardBright / 100)));
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      g.fillRect(x0, y0, dw, dh);
    }
    // sensor noise, so the card isn't cleaner than the live picture around it
    if (S.grain > 0) {
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = S.grain / 100 * 0.6;
      g.fillStyle = grainPattern();
      g.save();
      g.translate(Math.random() * 64, Math.random() * 64);
      g.fillRect(x0 - 64, y0 - 64, dw + 128, dh + 128);
      g.restore();
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, x0, y0, dw, dh);
    g.restore();
    if (opts.post) opts.post(g);
    ctx.drawImage(scratch, 0, 0);
  }
  const drawFakeCard = (p) => renderCard(sctx, layer, p);

  // live preview of the card's look inside settings, over the current camera picture
  const lookCv = $('lookPreview'), lookScratch = document.createElement('canvas');
  function drawLookPreview() {
    if (settingsEl.hidden || !W) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.round(lookCv.clientWidth * dpr), chh = Math.round(lookCv.clientHeight * dpr);
    if (!cw || !chh) return;
    if (lookCv.width !== cw || lookCv.height !== chh) { lookCv.width = lookScratch.width = cw; lookCv.height = lookScratch.height = chh; }
    const g = lookCv.getContext('2d');
    // background: the middle of the live picture
    const k = W / cw * 0.75;
    g.drawImage(screenCv, (W - cw * k) / 2, (H - chh * k) / 2, cw * k, chh * k, 0, 0, cw, chh);
    // whole card, at the blur it will have on screen (blur scales with the card's size)
    const s = cw * 0.62;
    renderCard(g, lookScratch, { x: cw / 2, y: chh / 2, s, l: s * CARD_ASPECT, theta: S.tilt * Math.PI / 180 });
  }

  let cueShown = false;
  function setCue(on) {
    if (on === cueShown) return;
    cueShown = on;
    $('fpsBtn').classList.toggle('cue', on);
  }

  function runTimed(now) {
    measureScene();
    // secret cue: from cueLead seconds before the card starts until it starts
    setCue(!!seq && now >= seq.start - S.cueLead * 1000 && now < seq.start);
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
      gctx.strokeStyle = '#ff3b30'; gctx.lineWidth = 2; gctx.setLineDash([10, 8]);
      gctx.beginPath(); gctx.moveTo(0, maskTop()); gctx.lineTo(W, maskTop()); gctx.stroke();
      gctx.setLineDash([]);
    }
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

  // ---------------------------------------------------------------- card library: import + corner editor
  // A photo of a card (any angle, any light) is straightened using its 4 corners, then its lighting is
  // flattened to a clean, evenly lit card so it can be re-lit live to match the room.
  const MAX_SRC = 1600;
  const editor = $('editor'), edCv = $('edCanvas'), edCtx = edCv.getContext('2d');
  const edPrev = $('edPreview'), edPrevCtx = edPrev.getContext('2d');
  let ed = null;   // { src: canvas, data: ImageData, quad: [[x,y] x4] (TL,TR,BR,BL in src px), view }

  function imageToCanvas(img, w, h) {
    const k = Math.min(1, MAX_SRC / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function loadPhoto(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { openEditor(imageToCanvas(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
    img.onerror = () => { toast('Could not read that photo', 1800); URL.revokeObjectURL(url); };
    img.src = url;
  }

  // front camera: count down, then take the raw (un-mirrored) frame
  function startGrab() {
    closeSettings();
    let n = 3;
    const tick = () => {
      if (n > 0) { toast(`Hold the card over the camera… ${n}`, 0); n--; setTimeout(tick, 1000); return; }
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      toast('Got it', 700);
      setTimeout(() => { openSettings(); openEditor(imageToCanvas(c, c.width, c.height)); }, 300);
    };
    tick();
  }

  // ---- find the card: biggest bright, low-colour, roughly rectangular blob
  function detectQuad(src) {
    const sw = 240, sh = Math.round(240 * src.height / src.width);
    const t = document.createElement('canvas'); t.width = sw; t.height = sh;
    const tc = t.getContext('2d'); tc.drawImage(src, 0, 0, sw, sh);
    const d = tc.getImageData(0, 0, sw, sh).data, n = sw * sh;
    const L = new Float32Array(n), sat = new Float32Array(n);
    const hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      L[i] = 0.299 * r + 0.587 * g + 0.114 * b; sat[i] = mx ? (mx - mn) / mx : 0;
      hist[L[i] | 0]++;
    }
    // Otsu threshold on brightness
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, thr = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sB += i * hist[i];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
      if (v > best) { best = v; thr = i; }
    }
    const m = new Uint8Array(n);
    for (let i = 0; i < n; i++) m[i] = L[i] > thr && sat[i] < 0.35 ? 1 : 0;
    // largest component, preferring ones near the middle
    const lab = new Int32Array(n), q = new Int32Array(n);
    let bestPts = null, bestScore = 0, id = 0;
    for (let i = 0; i < n; i++) {
      if (!m[i] || lab[i]) continue;
      id++; let qh = 0, qt = 0; q[qt++] = i; lab[i] = id;
      const pts = []; let area = 0, cx = 0, cy = 0;
      while (qh < qt) {
        const j = q[qh++], x = j % sw, y = (j / sw) | 0; area++; cx += x; cy += y;
        let edge = false;
        for (const k of [x > 0 ? j - 1 : -1, x < sw - 1 ? j + 1 : -1, y > 0 ? j - sw : -1, y < sh - 1 ? j + sw : -1]) {
          if (k < 0) { edge = true; continue; }
          if (m[k]) { if (!lab[k]) { lab[k] = id; q[qt++] = k; } } else edge = true;
        }
        if (edge) pts.push([x, y]);
      }
      const dc = Math.hypot(cx / area / sw - 0.5, cy / area / sh - 0.5);
      const score = area * (1.2 - dc);
      if (area > n * 0.02 && score > bestScore) { bestScore = score; bestPts = pts; }
    }
    const s = src.width / sw;
    const fallback = () => {
      // centred card-shaped box
      let w = src.width * 0.7, h = w * CARD_ASPECT;
      if (h > src.height * 0.9) { h = src.height * 0.9; w = h / CARD_ASPECT; }
      const x0 = (src.width - w) / 2, y0 = (src.height - h) / 2;
      return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
    };
    if (!bestPts) return fallback();
    for (let i = 0; i < bestPts.length; i++) { bx[i] = bestPts[i][0]; by[i] = bestPts[i][1]; }
    const hull = convexHull(bestPts.length);
    const R = hull.length >= 3 ? minAreaRect(hull) : null;
    if (!R) return fallback();
    // corners = hull points furthest along the rect's diagonals (handles perspective too)
    const u = [R.a.dx, R.a.dy], v = [R.b.dx, R.b.dy];
    const pick = (su, sv) => {
      let bp = hull[0], bv = -Infinity;
      for (const p of hull) { const val = su * (p[0] * u[0] + p[1] * u[1]) + sv * (p[0] * v[0] + p[1] * v[1]); if (val > bv) { bv = val; bp = p; } }
      return [(bp[0] + 0.5) * s, (bp[1] + 0.5) * s];
    };
    let quad = [pick(-1, -1), pick(1, -1), pick(1, 1), pick(-1, 1)];
    quad = orderQuad(quad);
    return quad;
  }

  // TL, TR, BR, BL on screen, with the long side vertical (portrait card)
  function orderQuad(qd) {
    const c = qd.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
    qd = qd.slice().sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]));
    // sorted clockwise starting near angle -pi (left); rotate so the first is top-left-most
    let start = 0, bestv = Infinity;
    qd.forEach((p, i) => { const v = p[0] + p[1]; if (v < bestv) { bestv = v; start = i; } });
    qd = qd.slice(start).concat(qd.slice(0, start));
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (dist(qd[0], qd[1]) + dist(qd[2], qd[3]) > dist(qd[1], qd[2]) + dist(qd[3], qd[0])) qd = qd.slice(1).concat(qd.slice(0, 1));
    return qd;
  }

  // ---- perspective warp: solve the homography that maps the output rectangle onto the 4 corners
  function homography(dst, srcQ) {
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = dst[i], [X, Y] = srcQ[i];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); B.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); B.push(Y);
    }
    for (let c = 0; c < 8; c++) {           // Gaussian elimination
      let piv = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [B[c], B[piv]] = [B[piv], B[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        B[r] -= f * B[c];
      }
    }
    return B.map((b, i) => b / A[i][i]).concat(1);
  }
  function warp(data, sw, sh, quad, dw, dh) {
    const h = homography([[0, 0], [dw, 0], [dw, dh], [0, dh]], quad);
    const out = new ImageData(dw, dh), o = out.data, s = data.data;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w = h[6] * px + h[7] * py + 1;
        let X = (h[0] * px + h[1] * py + h[2]) / w - 0.5, Y = (h[3] * px + h[4] * py + h[5]) / w - 0.5;
        X = Math.max(0, Math.min(sw - 1.001, X)); Y = Math.max(0, Math.min(sh - 1.001, Y));
        const x0 = X | 0, y0 = Y | 0, fx = X - x0, fy = Y - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        const p = (y * dw + x) * 4;
        for (let k = 0; k < 3; k++) {
          o[p + k] = (s[i00 + k] * (1 - fx) + s[i10 + k] * fx) * (1 - fy) + (s[i01 + k] * (1 - fx) + s[i11 + k] * fx) * fy;
        }
        o[p + 3] = 255;
      }
    }
    return out;
  }

  // ---- lighting flatten: fit a smooth light gradient to the paper and divide it out
  function flattenLighting(img) {
    const { width: w, height: h, data: d } = img;
    const samples = [];
    let maxL = 0;
    for (let y = 4; y < h - 4; y += 6) for (let x = 4; x < w - 4; x += 6) {
      const p = (y * w + x) * 4; maxL = Math.max(maxL, 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]);
    }
    for (let y = 8; y < h - 8; y += 6) for (let x = 8; x < w - 8; x += 6) {
      const p = (y * w + x) * 4, r = d[p], g = d[p + 1], b = d[p + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (mx && (mx - mn) / mx < 0.22 && l > maxL * 0.55) samples.push([x / w, y / h, r, g, b]);
    }
    if (samples.length < 40) return img;
    // least squares per channel: c(x, y) = a + b x + c y + d x y
    const fit = (k) => {
      const M = Array.from({ length: 4 }, () => new Array(5).fill(0));
      for (const s of samples) {
        const f = [1, s[0], s[1], s[0] * s[1]];
        for (let i = 0; i < 4; i++) { for (let j = 0; j < 4; j++) M[i][j] += f[i] * f[j]; M[i][4] += f[i] * s[k]; }
      }
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let j = c; j < 5; j++) M[r][j] -= f * M[c][j]; }
      }
      return M.map((row, i) => row[4] / row[i]);
    };
    const coef = [fit(2), fit(3), fit(4)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h, p = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const c = coef[k], paper = Math.max(20, c[0] + c[1] * u + c[2] * v + c[3] * u * v);
        d[p + k] = Math.min(255, d[p + k] * 248 / paper);
      }
    }
    return img;
  }

  // ---- editor UI
  function openEditor(src) {
    const data = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    ed = { src, data, quad: detectQuad(src), drag: -1 };
    $('edMatch').checked = true;
    editor.hidden = false;
    requestAnimationFrame(() => { layoutEditor(); drawEditor(); updatePreview(true); });
  }
  function layoutEditor() {
    const stage = $('edStage').getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const k = Math.min(stage.width / ed.src.width, stage.height / ed.src.height);
    edCv.style.width = ed.src.width * k + 'px'; edCv.style.height = ed.src.height * k + 'px';
    edCv.width = Math.round(ed.src.width * k * dpr); edCv.height = Math.round(ed.src.height * k * dpr);
    ed.view = edCv.width / ed.src.width;     // src px -> canvas px
  }
  function drawEditor() {
    const v = ed.view;
    edCtx.drawImage(ed.src, 0, 0, edCv.width, edCv.height);
    edCtx.lineWidth = 2 * (devicePixelRatio || 1);
    edCtx.strokeStyle = '#ffd60a';
    edCtx.beginPath();
    ed.quad.forEach((p, i) => (i ? edCtx.lineTo(p[0] * v, p[1] * v) : edCtx.moveTo(p[0] * v, p[1] * v)));
    edCtx.closePath(); edCtx.stroke();
    ed.quad.forEach((p, i) => {
      edCtx.beginPath();
      edCtx.arc(p[0] * v, p[1] * v, 11 * (devicePixelRatio || 1), 0, Math.PI * 2);
      edCtx.fillStyle = i === 0 ? '#ffd60a' : 'rgba(255,255,255,.9)';
      edCtx.fill();
      edCtx.strokeStyle = '#000'; edCtx.lineWidth = 1.5; edCtx.stroke();
    });
  }
  function warpedCard(full) {
    const w = full ? CARD_W : 125, h = full ? CARD_H : 175;
    const img = warp(ed.data, ed.src.width, ed.src.height, ed.quad, w, h);
    if ($('edMatch').checked) flattenLighting(img);
    return img;
  }
  function updatePreview() {
    edPrev.width = 125; edPrev.height = 175;
    edPrevCtx.putImageData(warpedCard(false), 0, 0);
  }
  const edPoint = (e) => {
    const r = edCv.getBoundingClientRect(), t = e.touches ? e.touches[0] : e;
    return [(t.clientX - r.left) * (edCv.width / r.width) / ed.view, (t.clientY - r.top) * (edCv.height / r.height) / ed.view];
  };
  const edDown = (e) => {
    if (!ed) return;
    const p = edPoint(e);
    let bi = -1, bd = Infinity;
    ed.quad.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; bi = i; } });
    if (bd * ed.view < 60 * (devicePixelRatio || 1)) { ed.drag = bi; e.preventDefault(); }
  };
  const edMove = (e) => {
    if (!ed || ed.drag < 0) return;
    e.preventDefault();
    const p = edPoint(e);
    ed.quad[ed.drag] = [Math.max(0, Math.min(ed.src.width, p[0])), Math.max(0, Math.min(ed.src.height, p[1]))];
    drawEditor();
  };
  const edUp = () => { if (ed && ed.drag >= 0) { ed.drag = -1; updatePreview(); } };
  edCv.addEventListener('touchstart', edDown, { passive: false });
  edCv.addEventListener('touchmove', edMove, { passive: false });
  edCv.addEventListener('touchend', edUp);
  edCv.addEventListener('mousedown', edDown);
  window.addEventListener('mousemove', edMove);
  window.addEventListener('mouseup', edUp);
  $('edRotate').addEventListener('click', () => { ed.quad = ed.quad.slice(1).concat(ed.quad.slice(0, 1)); drawEditor(); updatePreview(); });
  $('edAuto').addEventListener('click', () => { ed.quad = detectQuad(ed.src); drawEditor(); updatePreview(); });
  $('edMatch').addEventListener('change', updatePreview);
  $('edCancel').addEventListener('click', () => { editor.hidden = true; ed = null; });
  $('edSave').addEventListener('click', () => {
    const c = document.createElement('canvas'); c.width = CARD_W; c.height = CARD_H;
    c.getContext('2d').putImageData(warpedCard(true), 0, 0);
    const match = $('edMatch').checked;
    const num = cards.filter((x) => !x.builtin).length + 1;
    editor.hidden = true; ed = null;
    addCard(c.toDataURL('image/jpeg', 0.9), 'Card ' + num, match);
    toast('Added to library ✓', 1200);
  });
  window.addEventListener('resize', () => { if (ed && !editor.hidden) { layoutEditor(); drawEditor(); } });

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
      item.addEventListener('click', () => { S.activeCard = card.id; saveSettings(); renderCards(); drawLookPreview(); });
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
    const rc = $('realCardSelect');
    rc.textContent = '';
    rc.appendChild(new Option('Any card', ''));
    for (const c of cards) rc.appendChild(new Option(c.name, c.id));
    rc.value = cards.some((c) => c.id === S.realCard) ? S.realCard : '';
  }
  $('matchToggle').addEventListener('change', (e) => { activeCard().match = e.target.checked; saveCards(); });
  for (const id of ['fileInput', 'cameraInput']) {
    $(id).addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadPhoto(f); e.target.value = ''; });
  }
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
        if (key === 'recordAudio' || key === 'realRecord') startCamera();
        drawLookPreview();
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
    $('versionTag').classList.toggle('show', !!S.showVersion);
    updateLevel();
  }
  let lookTimer = 0;
  function openSettings() {
    bindSettings(); renderCards(); settingsEl.hidden = false;
    clearInterval(lookTimer);
    lookTimer = setInterval(() => (settingsEl.hidden ? clearInterval(lookTimer) : drawLookPreview()), 250);
    requestAnimationFrame(drawLookPreview);
  }
  function closeSettings() {
    settingsEl.hidden = true; resetBackground(); track = null; seq = null; setCue(false);
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
  // the iPhone draws its zeros with a slash; the slash disappearing is the performer's cue
  const rates = ['30', '60', '24'];
  let rate = '30';
  function renderFps() {
    $('fpsBtn').innerHTML = rate.replace(/0/g, '<span class="zero">0</span>');
  }
  $('fpsBtn').addEventListener('click', () => { rate = rates[(rates.indexOf(rate) + 1) % rates.length]; renderFps(); });
  renderFps();

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
  // clips are made from the camera picture + fake card only, at the size of a real iPhone video
  const recCv = document.createElement('canvas');
  const rctx = recCv.getContext('2d');
  function drawRecFrame() { if (recorder) rctx.drawImage(screenCv, 0, 0, recCv.width, recCv.height); }
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
    if (!S.realRecord) return;      // just the recording look; real recording is an optional extra
    try {
      const types = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
      const type = window.MediaRecorder && types.find((t) => MediaRecorder.isTypeSupported(t));
      recCv.width = 1080; recCv.height = Math.round(1080 * H / W / 2) * 2;
      drawRecFrame();
      const out = recCv.captureStream(30);
      const mic = stream && stream.getAudioTracks()[0];
      if (mic) out.addTrack(mic);
      const rec = new MediaRecorder(out, type ? { mimeType: type, videoBitsPerSecond: 8e6 } : undefined);
      rec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recChunks, { type: rec.mimeType || type || 'video/mp4' });
        if (blob.size > 1000) lastClip = blob;
        else toast('Recording failed on this phone', 2500);
      };
      rec.start(1000);
      recorder = rec;
      drawRecFrame();
    } catch (e) {
      recorder = null;
      toast('This phone can\'t record here (' + (e && e.name || 'error') + ')', 3000);
    }
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

  // long-press -> settings, on the thumbnail or the ⋯ / grid button (a short tap does what the real
  // button would). Small finger wobble is allowed; iPhones report it even when you hold still.
  function longPress(el, onLong, onTap) {
    let timer = 0, x = 0, y = 0, fired = false;
    const cancel = () => { clearTimeout(timer); timer = 0; };
    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; x = t.clientX; y = t.clientY; fired = false;
      cancel();
      timer = setTimeout(() => { timer = 0; fired = true; onLong(); }, 600);
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - x, t.clientY - y) > 14) cancel();
    }, { passive: true });
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('touchend', (e) => {
      e.preventDefault();               // no synthetic click after a touch
      const wasTap = !!timer && !fired;
      cancel();
      if (wasTap && onTap) onTap();
    });
    el.addEventListener('click', () => { if (onTap) onTap(); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); onLong(); });   // desktop: right-click
  }
  // double-tap the current mode's label (VIDEO / PHOTO) -> settings. Tapping the mode you're already
  // in does nothing in the real app, so this is invisible to a spectator.
  let lastModeTap = 0;
  $('modePill').addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const hit = document.elementFromPoint(t.clientX, t.clientY);
    const active = $('modeStrip').querySelector('.active');
    if (!hit || !active || !(hit === active || hit === $('modePill'))) { lastModeTap = 0; return; }
    const now = performance.now();
    if (now - lastModeTap < 450) { lastModeTap = 0; e.preventDefault(); openSettings(); }
    else lastModeTap = now;
  });
  $('modePill').addEventListener('dblclick', (e) => { e.preventDefault(); openSettings(); });   // desktop
  longPress($('thumb'), openSettings, openViewer);     // tap plays back the last recording (if any)
  longPress($('moreBtn'), openSettings, null);
  longPress($('gridBtn'), openSettings, null);

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

  // ---------------------------------------------------------------- updates
  // The iPhone (and GitHub) cache the app; if a newer version is online, reload into it.
  function checkForUpdate() {
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!j.version || j.version === APP_VERSION) return;
        const u = new URL(location.href);
        if (u.searchParams.get('v') === j.version) return;   // already tried; don't loop
        u.searchParams.set('v', j.version);
        location.replace(u.toString());
      })
      .catch(() => {});
  }

  // ---------------------------------------------------------------- boot
  window.addEventListener('resize', () => { resize(); centerMode(); });
  window.addEventListener('orientationchange', () => setTimeout(resize, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { resetBackground(); invalidatePlate(); } });
  setMode(mode, false);
  resize();
  if (!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) enableMotion();
  refreshOutputs();
  renderCards();
  checkForUpdate();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
  startCamera();
  requestAnimationFrame(loop);

  window.__trick = { why, S, get track() { return track; }, get fps() { return fps; }, cards };   // handy for debugging
})();
