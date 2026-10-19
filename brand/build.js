// Genera el logo de Hangar: node brand/build.js
// Concepto: un hangar (arco Quonset) cuyas costillas son swatches de color, con un prompt >_ estacionado
// adentro y una chispa de agente. Las costillas salen de la paleta del tema, así que el logo se re-tiñe solo.
const fs = require('fs');
const path = require('path');

const CX = 256, CY = 292, R = 150, SW = 52, FLOOR = 404, GAP = 12;
const LEG = FLOOR - CY, ARC = Math.PI * R, TOTAL = LEG * 2 + ARC;
const DEFAULT = ['#ff3ea5', '#ff8a3d', '#ffd166', '#3cf2c2', '#7c6cff'];
const ARCH_D = `M${CX - R} ${FLOOR}V${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}V${FLOOR}`;

const f = (n) => +n.toFixed(2);
function ribs(colors) {
  const b = [0, 1, 2, 3, 4, 5].map((k) => LEG + (k * ARC) / 5);
  b[0] = 0; b[5] = TOTAL;
  return colors.map((c, i) => {
    const s = i === 0 ? 0 : b[i] + GAP / 2, e = i === 4 ? TOTAL : b[i + 1] - GAP / 2;
    return `<path class="rib rib${i}" d="${ARCH_D}" style="stroke:${c}" stroke-dasharray="${f(e - s)} ${f(TOTAL * 2)}" stroke-dashoffset="${f(-s)}"/>`;
  }).join('');
}
const spark = (x, y, r) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;

// Marca sin fondo, en el espacio 512x512
function mark({ colors = DEFAULT, ink = '#ffffff', sparkColor = ink, small = false } = {}) {
  return `<g fill="none" stroke-width="${SW}">${ribs(colors)}</g>`
    + `<g fill="none" style="stroke:${ink}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">`
    + `<path class="chev" d="M198 264L250 305L198 346"/><path class="cursor" d="M276 346H328"/></g>`
    + `<path class="spark" style="fill:${sparkColor}" d="${spark(420, 104, 38)}"/>`
    + (small ? '' : `<circle class="spark2" cx="462" cy="160" r="10" style="fill:${sparkColor}" opacity=".7"/>`);
}

// Ícono de app: squircle oscuro + marca centrada
function icon({ bg = '#0d0f14', bg2 = '#1b1f2b', scale = .78, ...m } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">`
    + `<defs><radialGradient id="hg" cx=".5" cy=".18" r=".9"><stop offset="0" stop-color="${bg2}"/><stop offset="1" stop-color="${bg}"/></radialGradient></defs>`
    + `<rect width="512" height="512" rx="116" fill="url(#hg)"/>`
    + `<rect x="3" y="3" width="506" height="506" rx="113" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="6"/>`
    + `<g transform="translate(256 262) scale(${scale}) translate(-266 -241)">${mark(m)}</g></svg>`;
}

// Marca suelta (sin fondo), recortada a su caja
const bare = (m) => `<svg xmlns="http://www.w3.org/2000/svg" width="404" height="354" viewBox="70 60 404 354">${mark(m)}</svg>`;

// Lockup horizontal: marca + "hangar"
function lockup({ text = '#e3e6ee', ...m } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1480" height="420" viewBox="0 0 1480 420">`
    + `<g transform="translate(0 10)">${mark(m)}</g>`
    + `<text x="520" y="318" fill="${text}" font-family="'JetBrains Mono','Cascadia Code','SF Mono',Consolas,monospace" font-weight="700" font-size="220" letter-spacing="-8">hangar</text></svg>`;
}

const out = (n, s) => fs.writeFileSync(path.join(__dirname, n), s);
out('hangar-icon.svg', icon());
out('hangar-mark.svg', bare({}));
out('hangar-mark-light.svg', bare({ ink: '#16181d' }));
out('hangar-lockup.svg', lockup());
out('hangar-lockup-light.svg', lockup({ ink: '#16181d', text: '#16181d' }));
out('favicon.svg', icon({ scale: .9, small: true }));
module.exports = { mark, icon, bare, lockup, DEFAULT };

// --- Íconos de la app (public/) ---
const PUB = path.join(__dirname, '../public');
fs.writeFileSync(path.join(PUB, 'icon.svg'), icon({ scale: .9, small: true }));
// Logo del panel de pestañas: inline, con la paleta del tema activo (se re-tiñe en vivo al cambiar de tema)
const THEMED = ['var(--ansi-13)', 'var(--ansi-1)', 'var(--ansi-11)', 'var(--ansi-10)', 'var(--accent)'];
const brandSvg = `<svg class="brand-mark" viewBox="70 60 404 354" aria-hidden="true">${mark({ colors: THEMED, ink: 'var(--fg)', small: true })}</svg>`;
const idx = path.join(PUB, 'index.html'), html = fs.readFileSync(idx, 'utf8');
const html2 = html.replace(/(<div class="brand">)[\s\S]*?(<span>Hangar<\/span>)/, `$1${brandSvg}$2`);
if (html2 === html && !html.includes('brand-mark')) console.warn('index.html: no encontré <div class="brand">');
fs.writeFileSync(idx, html2);
// PNG para notificaciones de Windows (no aceptan SVG), renderizados con Edge headless
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (EDGE) {
  const os = require('os'), { execFileSync } = require('child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-icon-'));
  for (const sz of [192, 512]) {
    const page = path.join(tmp, `i${sz}.html`);
    fs.writeFileSync(page, `<style>html,body{margin:0;background:transparent}svg{display:block;width:${sz}px;height:${sz}px}</style>${icon(sz < 256 ? { scale: .9, small: true } : {})}`);
    try {
      execFileSync(EDGE, ['--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
        `--window-size=${sz},${sz}`, `--screenshot=${path.join(PUB, `icon-${sz}.png`)}`, 'file:///' + page.replace(/\\/g, '/')], { stdio: 'ignore', timeout: 30000 });
    } catch (e) { console.warn('png', sz, e.message); }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
} else console.warn('Edge no encontrado: no se generaron icon-*.png');

// preview.html: el logo en cada tema de Hangar (las costillas toman la paleta ANSI del tema)
const vm = require('vm');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/settings.js'), 'utf8'), ctx);
const THEMES = ctx.window.HANGAR.THEMES;
const themed = (t) => [t.ansi[13], t.ansi[1], t.ansi[11], t.ansi[10], t.accent];
const cards = Object.entries(THEMES).map(([name, t]) => {
  const dark = parseInt(t.background.slice(1), 16) < 0x808080;
  return `<figure style="background:${t.background};color:${t.foreground};border-color:${t.border}">`
    + `<svg viewBox="70 60 404 354">${mark({ colors: themed(t), ink: t.foreground })}</svg>`
    + `<figcaption>${name}</figcaption></figure>`;
}).join('');
const sizes = [16, 24, 32, 48, 64, 128].map((s) => `<div class="sz"><img src="${s < 48 ? 'favicon' : 'hangar-icon'}.svg" width="${s}" height="${s}"><span>${s}</span></div>`).join('');
out('preview.html', `<!doctype html><meta charset="utf-8"><title>Hangar — logo</title>
<style>
body{margin:0;background:#0a0b0f;color:#e3e6ee;font:15px/1.5 system-ui,sans-serif;padding:48px}
h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#8a93a6;margin:48px 0 16px;font-weight:600}
.hero{display:flex;gap:40px;align-items:center}
.hero .ic{width:260px;height:260px;filter:drop-shadow(0 24px 48px #7c6cff40)}
.lock{display:flex;gap:24px;flex-wrap:wrap}.lock div{padding:28px 36px;border-radius:18px}
.lock img{height:110px;display:block}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
figure{margin:0;border:1px solid;border-radius:16px;padding:28px 20px 14px;text-align:center}
figure svg{width:120px;height:105px}figcaption{font-size:12px;opacity:.7;margin-top:8px}
.sizes{display:flex;gap:28px;align-items:flex-end}.sz{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:#8a93a6}
.live svg{width:200px}.live .cursor{animation:b 1.06s steps(1) infinite}@keyframes b{50%{opacity:0}}
.live .rib{transition:stroke .5s}.live .spark{transform-origin:420px 104px;animation:s 3s ease-in-out infinite}
@keyframes s{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(.8) rotate(45deg)}}
</style>
<div class="hero"><img class="ic" src="hangar-icon.svg"><div class="lock">
<div style="background:#0d0f14"><img src="hangar-lockup.svg"></div>
<div style="background:#f7f6f3"><img src="hangar-lockup-light.svg"></div></div></div>
<h2>Se re-tiñe con tu tema — las costillas del hangar son tu paleta</h2><div class="grid">${cards}</div>
<h2>Tamaños</h2><div class="sizes">${sizes}</div>
<h2>Vivo (cursor parpadea, la paleta rota)</h2><div class="live"><svg viewBox="70 60 404 354">${mark({})}</svg></div>
<script>const P=${JSON.stringify(Object.values(THEMES).map(themed))};let i=0;setInterval(()=>{i=(i+1)%P.length;document.querySelectorAll('.live .rib').forEach((r,k)=>r.setAttribute('stroke',P[i][k]))},1400)</script>`);
