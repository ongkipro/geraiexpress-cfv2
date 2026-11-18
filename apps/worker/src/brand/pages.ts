// Multi-page SSR marketing content for `geraiexpress.com` (`docs/visual/09` §4, DEC-247 Borderless White-Gallery).
// Every claim reflects real v2 product mechanics (DEC-245 guards: nine couriers, no invented counters, testimonials or
// discount percentages); every UI artifact on the page is synthetic example data; the demos make no network call.
import { escapeHtml as e } from "../http/pages"
import type { Legal } from "./seo"

/** The nine active Mengantar partner couriers (Ninja discontinued 2026-09-01). Width is the SVG width at 20 px tall. */
export const COURIERS: Record<string, { name: string; w: number }> = {
  jne: { name: "JNE", w: 47 },
  jt: { name: "J&T Express", w: 93 },
  sicepat: { name: "SiCepat", w: 71 },
  sap: { name: "SAP Express", w: 29 },
  lion: { name: "Lion Parcel", w: 106 },
  anteraja: { name: "Anteraja", w: 67 },
  idexpress: { name: "iDexpress", w: 24 },
  pos: { name: "Pos Indonesia", w: 29 },
  spx: { name: "SPX Express", w: 49 },
}
/** Courier logo `<img>`; `alt` empty when the name is printed beside it. */
export const courierImg = (key: string, h = 26, decorative = false) => {
  const c = COURIERS[key]!
  return `<img src="/couriers/${key}.svg" alt="${decorative ? "" : e(c.name)}" width="${Math.round((c.w * h) / 20)}" height="${h}" decoding="async">`
}

/** The product screenshot on the home pedestal (served through `BRAND_ASSETS`). */
export const PRODUCT_SHOT = {
  src: "/produk-kasir-loket.webp",
  width: 1440,
  height: 900,
  alt: "Layar kasir GeraiExpress: cek ongkir multi-ekspedisi, pilihan kurir, dan ringkasan tagihan loket dengan data contoh",
}

const IC = {
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  chat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  qr: '<svg class="qr" viewBox="0 0 29 29" aria-hidden="true"><path fill="currentColor" d="M0 0h7v7H0zM22 0h7v7h-7zM0 22h7v7H0z"/><path fill="#fff" d="M1 1h5v5H1zM23 1h5v5h-5zM1 23h5v5H1z"/><path fill="currentColor" d="M2 2h3v3H2zM24 2h3v3h-3zM2 24h3v3H2zM9 1h2v2H9zM13 0h2v4h-2zM17 2h3v2h-3zM9 5h4v2H9zM15 6h2v3h-2zM1 9h3v2H1zM6 9h4v2H6zM12 10h3v3h-3zM18 9h4v2h-4zM24 9h4v3h-4zM2 13h2v4H2zM6 14h3v2H6zM10 15h2v4h-2zM16 14h4v2h-4zM22 13h2v3h-2zM26 14h3v2h-3zM14 18h3v3h-3zM19 18h2v4h-2zM23 18h4v2h-4zM9 21h3v2H9zM9 25h2v4H9zM13 23h4v2h-4zM18 24h2v3h-2zM22 22h3v3h-3zM26 22h3v2h-3zM13 27h3v2h-3zM22 26h2v3h-2zM25 26h4v3h-4z"/></svg>',
}

const lockTxt = (t: string) => `<span class="lock">${IC.lock}${t}</span>`

const CLOSING_STEPS = ["Daftar akun pemilik", "Verifikasi titik jemput &amp; akun Mengantar", "Buka kasir &amp; cetak resi pertama"]

/** Closing callout on every page: one centered porcelain stage with three numbered steps, flowing into the footer. */
const closing = (app: string, secondHref: string, secondLabel: string) => `<section class="closing" aria-labelledby="tutup-title"><div class="wrap"><div class="callout">
<h2 id="tutup-title">Siap membuka loket kirim paket di toko Anda?</h2>
<p>Gunakan perangkat yang sudah ada di meja kasir. Pengajuan titik jemput ditinjau tim kami dan akun Mengantar gerai terhubung otomatis.</p>
<ol class="cl-steps" aria-label="Tiga langkah memulai">${CLOSING_STEPS.map((t, i) => `<li><span class="cl-n">${i + 1}</span>${t}</li>`).join("")}</ol>
<div class="row"><a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai</a><a class="cta ghost" href="${secondHref}">${e(secondLabel)}</a></div>
</div></div></section>`

/** Inner-page opening (adsbook `PageHead` parity): masked dot grid, mono eyebrow pill, centered h1 and lead. */
const pageHead = (eyebrow: string, h1: string, lead: string, extra = "") => `<section class="phead" aria-labelledby="page-title"><div class="dots" aria-hidden="true"></div><div class="wrap head">
<p class="eyebrow"><span class="esq" aria-hidden="true"></span>${eyebrow}</p>
<h1 id="page-title">${h1}</h1>
<p class="lead">${lead}</p>${extra}
</div></section>`

export const HOME_SCRIPT = `<script defer src="/three.min.js"></script><script defer src="/hero-studio-3d.min.js"></script><script>
(function(){
  var L={jne:["JNE",47],jt:["J&T Express",93],sicepat:["SiCepat",71],sap:["SAP Express",29],lion:["Lion Parcel",106],anteraja:["Anteraja",67],idexpress:["iDexpress",24],pos:["Pos Indonesia",29],spx:["SPX Express",49]};
  var D=[
    {reg:[["lion","REGPACK","2–3 hari",10500],["jt","EZ","2–3 hari",11500],["sicepat","REG","1–2 hari",12000],["jne","REG","2–3 hari",12500]],cargo:[["sap","SAP Cargo","3–5 hari",42000],["jne","JNE Cargo","3–4 hari",46000],["sicepat","SiCepat Cargo","2–4 hari",48000]]},
    {reg:[["lion","REGPACK","2–3 hari",11000],["jne","REG","2–3 hari",12000],["sicepat","REG","1–2 hari",13000],["anteraja","Reguler","2–3 hari",13500]],cargo:[["sap","SAP Cargo","3–5 hari",45000],["idexpress","iDexpress Cargo","3–4 hari",49000],["jne","JNE Cargo","3–4 hari",51000]]},
    {reg:[["sap","REG","2–4 hari",14500],["jt","EZ","2–3 hari",15500],["jne","REG","1–2 hari",16000],["idexpress","STD","2–4 hari",16500]],cargo:[["sap","SAP Cargo","4–6 hari",58000],["sicepat","SiCepat Cargo","3–5 hari",62000],["jne","JNE Cargo","3–5 hari",64000]]},
    {reg:[["pos","Pos Reguler","2–4 hari",17000],["jt","EZ","2–3 hari",18000],["spx","Standard","2–4 hari",18500],["sicepat","REG","1–2 hari",19500]],cargo:[["sap","SAP Cargo","4–6 hari",71000],["jne","JNE Cargo","4–6 hari",74000],["sicepat","SiCepat Cargo","3–5 hari",77000]]},
    {reg:[["jne","REG","3–5 hari",27000],["jt","EZ","3–5 hari",28500],["lion","REGPACK","3–4 hari",29000],["pos","Pos Reguler","4–6 hari",30500]],cargo:[["jne","JNE Cargo","5–8 hari",132000],["idexpress","iDexpress Cargo","5–7 hari",139000],["sicepat","SiCepat Cargo","6–9 hari",146000]]}
  ];
  var mode="reg",city=0;
  var btn=document.getElementById("h-city"),box=document.getElementById("h-city-list"),val=document.getElementById("h-city-val");
  var bReg=document.getElementById("h-reg"),bCar=document.getElementById("h-car"),ul=document.getElementById("h-list");
  if(!btn||!box||!val||!ul)return;
  var opts=[].slice.call(box.querySelectorAll("[role=option]")),hl=0;
  function rp(n){return"Rp "+n.toLocaleString("id-ID")}
  function days(t){return parseInt(t,10)}
  function render(){
    var rows=(mode==="cargo"?D[city].cargo:D[city].reg).slice().sort(function(a,b){return a[3]-b[3]});
    var fast=rows.reduce(function(m,r,i){return days(r[2])<days(rows[m][2])?i:m},0);
    bReg.setAttribute("aria-pressed",mode==="reg"?"true":"false");
    bCar.setAttribute("aria-pressed",mode==="cargo"?"true":"false");
    ul.innerHTML="";
    rows.forEach(function(r,i){
      var c=L[r[0]],li=document.createElement("li");
      var tags=(i===0?'<span class="chip on">Termurah</span>':"")+(i===fast&&i!==0?'<span class="chip">Tercepat</span>':"");
      li.innerHTML='<span class="clogo"><img src="/couriers/'+r[0]+'.svg" alt="'+c[0]+'" width="'+Math.round(c[1]*1.3)+'" height="26" decoding="async"></span>'+
        '<span class="rate-main"><span class="rate-name">'+c[0]+' · '+r[1]+'</span><span class="rate-meta">Estimasi '+r[2]+tags+'</span></span>'+
        '<span class="num">'+rp(r[3])+'</span>';
      ul.appendChild(li);
    });
  }
  function setHl(i){hl=(i+opts.length)%opts.length;opts.forEach(function(o,k){o.classList.toggle("hl",k===hl)});box.setAttribute("aria-activedescendant",opts[hl].id);opts[hl].scrollIntoView({block:"nearest"})}
  function open(){box.hidden=false;btn.setAttribute("aria-expanded","true");setHl(city);box.focus()}
  function close(refocus){box.hidden=true;btn.setAttribute("aria-expanded","false");if(refocus)btn.focus()}
  function pick(i){city=i;opts.forEach(function(o,k){o.setAttribute("aria-selected",k===i?"true":"false")});val.innerHTML=opts[i].querySelector(".opt-text").innerHTML;close(true);render()}
  btn.addEventListener("click",function(){box.hidden?open():close(true)});
  btn.addEventListener("keydown",function(e){if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();open()}});
  box.addEventListener("keydown",function(e){
    if(e.key==="ArrowDown"){e.preventDefault();setHl(hl+1)}
    else if(e.key==="ArrowUp"){e.preventDefault();setHl(hl-1)}
    else if(e.key==="Home"){e.preventDefault();setHl(0)}
    else if(e.key==="End"){e.preventDefault();setHl(opts.length-1)}
    else if(e.key==="Enter"||e.key===" "){e.preventDefault();pick(hl)}
    else if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close(true)}
    else if(e.key==="Tab"){close(false)}
  });
  opts.forEach(function(o,i){o.addEventListener("mousemove",function(){if(hl!==i)setHl(i)});o.addEventListener("click",function(){pick(i)})});
  document.addEventListener("pointerdown",function(e){if(!box.hidden&&!e.target.closest(".sel"))close(false)});
  bReg.addEventListener("click",function(){mode="reg";render()});
  bCar.addEventListener("click",function(){mode="cargo";render()});
  render();
})();
(function(){
  // Bento artifacts float in only while the grid is on screen; static under reduced motion or without IntersectionObserver.
  var g=document.querySelector("[data-bento]");
  if(!g||!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  new IntersectionObserver(function(es){es.forEach(function(x){g.classList.toggle("is-playing",x.isIntersecting)})},{threshold:.15}).observe(g);
})();
</script>`

export function renderHome(app: string): string {
  return `<section class="hero-bleed" aria-label="Panggung Interaktif 3D Kemitraan GeraiExpress">
<div id="stageWrapper">
<canvas id="webglCanvas"></canvas>

<div id="spatialCallout"><div class="glass-surface callout-card">
<div class="callout-top"><span id="calloutBadge" class="callout-badge">01 • REGISTER</span><span id="calloutMetric" class="callout-metric">Instan</span></div>
<div id="calloutTitle" class="callout-title">Registrasi Mitra Mudah</div>
<div id="calloutDesc" class="callout-desc">Daftar akun Gerai Express secara online tanpa proses rumit.</div>
</div></div>

<div class="glass-surface stage-pill"><span class="stage-dot"></span><span>Diskon kirim mitra</span><span class="stage-off">sesuai akun gerai</span></div>

<div id="hudControls">
<div class="glass-surface hud-bar">
<button type="button" id="togglePlayBtn" aria-label="Jeda animasi 3D" aria-pressed="false" title="Jeda / Putar">
<svg id="iconPause" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx="1"/><rect x="7" y="1.5" width="3" height="9" rx="1"/></svg>
<svg id="iconPlay" class="hidden" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2.8 1.5L10.2 6L2.8 10.5V1.5Z"/></svg>
</button>
<div class="hud-tabs" role="group" aria-label="Tahapan alur kemitraan">
<button type="button" data-act="0" class="step-tab active">01 Daftar</button>
<button type="button" data-act="1" class="step-tab">02 Tinjau</button>
<button type="button" data-act="2" class="step-tab">03 Gerai</button>
<button type="button" data-act="3" class="step-tab">04 Untung</button>
</div>
<div class="hud-prog"><div id="progressFill"></div></div>
</div>
</div>
</div>
</section>

<section class="sec" id="ringkasan"><div class="wrap intro-grid">
<div>
<h1 class="intro-title">Aplikasi kasir agen kirim paket multi-ekspedisi</h1>
<p class="lead">Satu meja kasir untuk konter pulsa, fotokopi, toko kelontong, dan ruko jasa: bandingkan tarif sembilan ekspedisi mitra Mengantar untuk Reguler maupun Kargo, cetak resi thermal 100 mm, kelola kiriman COD, lalu cocokkan saldo Mengantar sampai rupiah terakhir.</p>
<div class="row">
<a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai</a>
<a class="cta ghost" href="/simulasi-kasir">Coba Simulasi Kasir</a>
</div>
<ul class="trust">
<li>${IC.check}<span>Tanpa sewa mesin khusus</span></li>
<li>${IC.check}<span>Halaman <strong>namatoko.geraimitra.com</strong> gratis</span></li>
<li>${IC.check}<span>Akun kasir &amp; pemilik terpisah</span></li>
</ul>
</div>
<div class="stage"><aside class="float" aria-labelledby="demo-title">
<div class="demo-top"><h2 id="demo-title" class="demo-title">Tinjau Tarif Loket</h2><span class="chip">Data contoh</span></div>
<span class="fld-lbl" id="h-city-lbl">Kecamatan tujuan</span>
<div class="sel">
<button type="button" id="h-city" class="sel-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="h-city-list" aria-labelledby="h-city-lbl h-city-val"><span id="h-city-val" class="sel-val"><span class="opt-main">Coblong</span><span class="opt-sub">Kota Bandung, Jawa Barat</span></span><svg class="sel-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
<ul id="h-city-list" class="sel-list" role="listbox" tabindex="-1" aria-labelledby="h-city-lbl" hidden>
<li role="option" id="h-city-opt-0" aria-selected="true" class="sel-opt"><span class="opt-text"><span class="opt-main">Coblong</span><span class="opt-sub">Kota Bandung, Jawa Barat</span></span><svg class="opt-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></li>
<li role="option" id="h-city-opt-1" aria-selected="false" class="sel-opt"><span class="opt-text"><span class="opt-main">Tebet</span><span class="opt-sub">Jakarta Selatan, DKI Jakarta</span></span><svg class="opt-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></li>
<li role="option" id="h-city-opt-2" aria-selected="false" class="sel-opt"><span class="opt-text"><span class="opt-main">Gubeng</span><span class="opt-sub">Kota Surabaya, Jawa Timur</span></span><svg class="opt-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></li>
<li role="option" id="h-city-opt-3" aria-selected="false" class="sel-opt"><span class="opt-text"><span class="opt-main">Medan Kota</span><span class="opt-sub">Kota Medan, Sumatera Utara</span></span><svg class="opt-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></li>
<li role="option" id="h-city-opt-4" aria-selected="false" class="sel-opt"><span class="opt-text"><span class="opt-main">Panakkukang</span><span class="opt-sub">Kota Makassar, Sulawesi Selatan</span></span><svg class="opt-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></li>
</ul>
</div>
<div class="seg" role="group" aria-label="Jenis kiriman contoh">
<button type="button" id="h-reg" aria-pressed="true">Reguler · 1 kg</button>
<button type="button" id="h-car" aria-pressed="false">Kargo · 12 kg</button>
</div>
<ul class="rates rates-logo" id="h-list" aria-live="polite"></ul>
<p class="note demo-foot">Tarif publik contoh, bukan harga resmi. <a href="/simulasi-kasir">Coba sampai cetak struk</a></p>
</aside></div>
</div></section>

<section class="sec tight partners" aria-labelledby="mitra-title"><div class="wrap">
<div class="shead"><h2 id="mitra-title">Sembilan ekspedisi mitra dalam satu loket</h2><p class="sub">Terhubung resmi lewat jaringan Mengantar: satu akun gerai untuk semua kurir, Reguler maupun Kargo.</p></div>
<ul class="pgrid" aria-label="Sembilan ekspedisi mitra Mengantar">${Object.keys(COURIERS).map((k) => `<li class="pbadge">${courierImg(k, 28)}</li>`).join("")}</ul>
</div></section>

<section class="sec" aria-labelledby="satu-layar-title"><div class="wrap show-grid">
<div>
<h2 id="satu-layar-title">Lihat jelas untung loket, saldo Mengantar, dan status tiap resi dalam satu layar</h2>
<p class="sub">Setiap resi tunai, QRIS, maupun COD tercatat otomatis antara laci kasir dan mutasi akun seller Mengantar. Anda tahu persis berapa Saldo Aman yang siap ditarik dan paket mana yang menunggu dijemput kurir.</p>
<ul class="chk">
<li>${IC.check}<span>Kasir melihat tarif publik; modal dan margin hanya di akun Pemilik</span></li>
<li>${IC.check}<span>Rekonsiliasi per resi antara kas loket dan mutasi Mengantar</span></li>
<li>${IC.check}<span>Cadangan ongkir retur dihitung otomatis dalam Saldo Aman sebelum saldo ditarik</span></li>
</ul>
</div>
<figure class="layers">
<div class="layer-back" aria-hidden="true">
<div class="kpis"><div><span>Resi hari ini</span><b>42</b></div><div><span>Kas loket</span><b>Rp 1.284.000</b></div><div><span>Rekonsiliasi</span><b>1:1</b></div><div><span>Saldo Aman</span><b>Rp 2.450.000</b></div></div>
<div class="spark">${[38, 52, 44, 61, 57, 70, 64, 78, 72, 88].map((h) => `<i style="height:${h}%"></i>`).join("")}</div>
</div>
<div class="layer-front float">
<p class="lf-title">Ringkasan Ekspedisi Loket</p>
<table class="lf-table"><caption class="sr">Contoh ringkasan ekspedisi loket hari ini (data contoh)</caption>
<thead><tr><th scope="col">Ekspedisi</th><th scope="col">Paket</th><th scope="col">Tagihan publik</th><th scope="col">Status</th></tr></thead>
<tbody>
<tr><td>${courierImg("jt", 14, true)}<span>J&amp;T Express · EZ</span></td><td>18</td><td>Rp 342.000</td><td><span class="st ok">Cocok 1:1</span></td></tr>
<tr><td>${courierImg("sicepat", 14, true)}<span>SiCepat · REG</span></td><td>12</td><td>Rp 228.000</td><td><span class="st">Siap Pickup</span></td></tr>
<tr><td>${courierImg("sap", 14, true)}<span>SAP Cargo</span></td><td>3</td><td>Rp 186.000</td><td><span class="st">Siap Pickup</span></td></tr>
</tbody></table>
</div>
<figcaption>Data contoh untuk ilustrasi, bukan angka gerai sungguhan.</figcaption>
</figure>
</div></section>

<section class="sec" aria-labelledby="enam-title"><div class="wrap">
<div class="shead"><h2 id="enam-title">Enam masalah meja loket yang langsung beres</h2><p class="sub">Dirancang dari alur kerja harian agen pengiriman, bukan sekadar formulir pembuatan resi.</p></div>
<div class="bento" data-bento>
<article class="tile s6"><div class="float w-split" aria-hidden="true">
<div class="w-rcpt"><div><span>INV 8K4M2P7</span><span>LUNAS</span></div><div><span>J&amp;T · EZ 1.000 g</span><span>12.500</span></div><div><span>Bubble wrap</span><span>3.000</span></div><div class="tot"><span>Tunai</span><span>Rp 15.500</span></div></div>
<div><div class="w-head"><span>Peran aktif</span><span class="chip on">Kasir</span></div><dl class="w-rows"><div><dt>Tarif publik</dt><dd>Tampil</dd></div><div><dt>Modal ongkir</dt><dd>${lockTxt("Terkunci")}</dd></div><div><dt>Diskon mitra</dt><dd>${lockTxt("Terkunci")}</dd></div></dl></div>
</div><div class="tile-body"><span class="idx">01</span><h3>Struk pelanggan jujur &amp; peran aman</h3><p>Struk selalu mencetak tarif publik. Kasir mencatat Tunai, QRIS gerai, atau Transfer tanpa pernah menerima angka modal dan diskon pemilik.</p></div></article>

<article class="tile s6"><div class="float" aria-hidden="true">
<div class="w-head"><span>J&amp;T Express · EZ</span><span class="chip">NON-COD</span></div>
<div class="w-lbl"><div><div class="bars"></div><div class="w-awb mono">JT 0012 3456 78</div><div>Penerima: R. Kartika · Tebet, Jakarta Selatan</div></div>${IC.qr}</div>
<div class="w-tabs w-gap"><span class="chip on">10×15 · Paket + Bukti</span><span class="chip">10×10 · Paket saja</span><span class="chip">Roll 58 mm</span></div>
</div><div class="tile-body"><span class="idx">02</span><h3>Cetak thermal 100 mm &amp; 58 mm</h3><p>Label resi 100×150 mm dengan potongan bukti kirim dari PC, atau struk 58 mm lewat printer Bluetooth di HP Android.</p></div></article>

<article class="tile s4"><div class="float" aria-hidden="true">
<div class="w-head"><span>Mode label</span><span class="chip on">Dropship Toko</span></div>
<dl class="w-rows"><div><dt>Nama di label</dt><dd>Toko Batik Ayu</dd></div><div><dt>Pengirim asli</dt><dd>Ibu S. Nisa</dd></div><div><dt>Retur ke</dt><dd>${lockTxt("Gerai Anda")}</dd></div></dl>
</div><div class="tile-body"><span class="idx">03</span><h3>Kirim atas nama toko online</h3><p>Reseller dan dropshipper mencetak nama tokonya di label, sementara paket retur tetap kembali ke alamat gerai Anda.</p></div></article>

<article class="tile s4"><div class="float" aria-hidden="true">
<div class="w-head"><span class="mono">Resi JT…5678</span><span class="chip on">1:1 Cocok</span></div>
<dl class="w-rows"><div><dt>Kas loket</dt><dd>INV 8K4M2P7</dd></div><div><dt>Mutasi Mengantar</dt><dd>Pembayaran resi</dd></div><div><dt>Selisih</dt><dd>Rp 0</dd></div></dl>
</div><div class="tile-body"><span class="idx">04</span><h3>Rekonsiliasi dua buku &amp; Saldo Aman</h3><p>Kas loket terpisah dari mutasi akun Mengantar. Tiap resi dicocokkan, dan COD dihitung saat dananya benar-benar cair.</p></div></article>

<article class="tile s4 b5"><div class="float" aria-hidden="true">
<div class="w-head"><span>Pickup J&amp;T Express</span><span class="chip">Surat Jalan</span></div>
<ul class="w-rows"><li><span class="mono">JT…5678</span><b>Terverifikasi</b></li><li><span class="mono">SPX…2201</span><span>Ditolak, kurir lain</span></li><li><span>PIN ambil retur</span><span class="w-pin"><span>4</span><span>8</span><span>2</span><span>7</span></span></li></ul>
</div><div class="tile-body"><span class="idx">05</span><h3>Pickup kurir &amp; Meja Retur</h3><p>Pindai paket per kurir sebelum Surat Jalan ditandatangani. Paket retur disimpan di Meja Retur dan diambil pengirim dengan PIN WhatsApp.</p></div></article>

<article class="tile s12"><div class="tile-body"><span class="idx">06</span><h3>Halaman publik gerai gratis &amp; Layar Pelanggan QRIS</h3><p>Setiap mitra mendapat <strong>namagerai.geraimitra.com</strong> untuk cek ongkir, kirim dari rumah dengan QR 48 jam, dan lacak paket. Di meja kasir, Layar Pelanggan menampilkan total tagihan dan QRIS gerai Anda.</p></div>
<div class="float w-site" aria-hidden="true">
<div class="w-url">berkahjaya.geraimitra.com</div>
<div class="w-tabs"><span class="chip on">Cek Ongkir</span><span class="chip">Kirim dari Rumah</span><span class="chip">Lacak Paket</span></div>
<div class="w-pay"><div><div>Layar Pelanggan · Total tagihan</div><div class="w-big">Rp 15.500</div><div>Bayar dengan QRIS gerai</div></div>${IC.qr}</div>
</div></article>
</div>
<p class="note">Ilustrasi fitur dengan data contoh, bukan transaksi gerai sungguhan.</p>
</div></section>

<section class="sec tight" aria-labelledby="layar-title"><div class="wrap">
<div class="shead"><h2 id="layar-title">Satu layar kasir dari cek ongkir sampai resi terbit</h2><p class="sub">Isi tujuan dan berat, pilih kurir, catat pembayaran, lalu cetak label tanpa berpindah halaman.</p></div>
<figure class="shot"><div class="shot-stage"><img src="${PRODUCT_SHOT.src}" alt="${e(PRODUCT_SHOT.alt)}" width="${PRODUCT_SHOT.width}" height="${PRODUCT_SHOT.height}" loading="lazy" decoding="async"></div><figcaption>Tangkapan layar ruang kerja kasir dengan data contoh.</figcaption></figure>
</div></section>

<section class="sec" aria-labelledby="bukti-title"><div class="wrap">
<div class="shead"><h2 id="bukti-title">Uang laci kasir dan saldo ekspedisi tidak lagi selisih di akhir minggu</h2><p class="sub">Dua kebiasaan loket yang paling sering memakan waktu kini dikerjakan sistem.</p></div>
<div class="proof">
<div class="tile"><span class="idx">01</span><h3>Dari catatan campur ke rekonsiliasi 1:1 per resi</h3><p>Catatan manual sering menyisakan selisih ongkir dan potongan COD yang belum cair. GeraiExpress mencocokkan kas loket dengan mutasi Mengantar untuk setiap nomor resi.</p>
<div class="float rb" aria-label="Contoh perbandingan catatan manual dan rekonsiliasi per resi (data contoh)">
<div class="rb-row"><span>Catatan manual</span><span class="rb-bar"><i style="width:62%"></i></span><span class="num">Selisih</span></div>
<div class="rb-row"><span>Potongan COD</span><span class="rb-bar"><i style="width:41%"></i></span><span class="num">Belum cair</span></div>
<div class="rb-row"><span>GeraiExpress</span><span class="rb-bar ok"><i style="width:100%"></i></span><span class="num">Cocok 1:1</span></div>
<p class="rb-note">Ilustrasi alur, bukan angka pengukuran.</p>
</div></div>
<div class="tile"><span class="idx">02</span><h3>Tiga lapis privasi pengirim, dropshipper, dan kasir</h3><p>Setiap pihak hanya melihat yang memang perlu dilihat, dari struk pelanggan sampai layar kasir.</p>
<div class="float"><dl class="roles">
<div><dt>Struk pelanggan</dt><dd>Tarif publik</dd></div>
<div><dt>Label paket dropship</dt><dd>Nama toko online, retur ke gerai</dd></div>
<div><dt>Layar kasir</dt><dd>Modal &amp; diskon terkunci</dd></div>
</dl></div></div>
</div>
</div></section>

<section class="sec tight" aria-labelledby="layanan-title"><div class="wrap">
<div class="shead"><h2 id="layanan-title">Reguler, Kargo, dan COD dari satu loket</h2><p class="sub">Lewat akun seller Mengantar milik gerai sendiri, pelanggan bebas memilih layanan tercepat atau paling hemat.</p></div>
<div class="open-cols">
<div><h3>Reguler &amp; Ekonomi</h3><p>J&amp;T Express (EZ, serta Eco di sebagian rute), JNE REG, SiCepat REG, SAP Express, Lion Parcel, iDexpress, Anteraja, Pos Indonesia, dan SPX.</p></div>
<div><h3>Kargo mulai 5 kg (Non-COD)</h3><p>JNE Cargo, SiCepat Cargo, SAP Cargo, dan iDexpress Cargo, lengkap dengan hitung berat volumetrik otomatis.</p></div>
<div><h3>COD &amp; Non-COD</h3><p>Batas nilai COD per kurir divalidasi otomatis, dan cadangan ongkir retur ikut dihitung dalam Saldo Aman.</p></div>
</div>
</div></section>

<section class="sec tight" aria-labelledby="alat-title"><div class="wrap">
<div>
<h2 id="alat-title">Cukup peralatan yang sudah ada di toko</h2>
<p class="sub">Tidak ada paket perangkat keras eksklusif atau sewa mesin bulanan. Tiga alat umum sudah cukup untuk melayani kiriman harian.</p>
<ul class="chk">
<li>${IC.check}<span><strong>Laptop, PC, atau HP Android</strong> untuk ruang kerja berbasis web yang ringan.</span></li>
<li>${IC.check}<span><strong>Timbangan digital meja</strong> dengan input berat dalam gram (bawaan 1.000 gram).</span></li>
<li>${IC.check}<span><strong>Printer thermal 100 mm atau 58 mm</strong> merek apa pun, USB, LAN, atau Bluetooth.</span></li>
</ul>
</div>
</div></section>

<section class="sec" aria-labelledby="paket-title"><div class="wrap">
<div class="shead"><h2 id="paket-title">Pilih cara bermitra</h2><p class="sub">Mulai tanpa biaya langganan aplikasi, lalu tambahkan domain toko sendiri hanya bila dibutuhkan.</p></div>
${pricingBlock(app)}
</div></section>

<section class="sec tight" aria-labelledby="banding-title"><div class="wrap">
<div class="shead"><h2 id="banding-title">Dibanding cara lain membuka loket</h2><p class="sub">Gambaran umum tanpa menyebut merek, dan hanya pada hal yang benar-benar dikerjakan GeraiExpress.</p></div>
${compareTable()}
</div></section>

<section class="sec tight" aria-labelledby="faq-title"><div class="wrap">
<div class="shead"><h2 id="faq-title">Pertanyaan umum calon mitra</h2><p class="sub">Lima hal yang paling sering ditanyakan pemilik toko sebelum membuka loket.</p></div>
${faqList(HOME_FAQ)}
<p class="more"><a href="/tanya-jawab">Semua pertanyaan →</a></p>
</div></section>
${closing(app, "/fitur", "Lihat Semua Fitur")}`
}

type Pillar = { id: string; label: string; title: string; points: string[]; visual: string }

const spec = (label: string, items: Array<[string, string]>) =>
  `<dl class="spec" aria-label="${label}">${items.map(([v, l]) => `<div><dt>${v}</dt><dd>${l}</dd></div>`).join("")}</dl>`
const stage = (inner: string) => `<div class="stage pstage" aria-hidden="true">${inner}</div>`

/** `/fitur` pillars (adsbook `PillarRows` parity): a real screen, a synthetic UI artifact, or published numbers. */
const PILLARS: Pillar[] = [
  {
    id: "kasir",
    label: "Kasir loket",
    title: "Satu layar kasir dari timbang sampai resi terbit",
    points: [
      "Di komputer, layar terbagi 60/40: pengirim, penerima, berat gram, dimensi, dan packing di kiri; tagihan dan tombol terbitkan resi tetap di kanan.",
      "Tarif semua ekspedisi aktif tampil berdampingan sehingga kasir tinggal memilih.",
      "Berat volumetrik dan batas nilai COD dihitung sebelum resi terbit.",
    ],
    visual: `<figure class="shot pshot"><div class="shot-stage"><img src="${PRODUCT_SHOT.src}" alt="${e(PRODUCT_SHOT.alt)}" width="${PRODUCT_SHOT.width}" height="${PRODUCT_SHOT.height}" loading="lazy" decoding="async"></div></figure>`,
  },
  {
    id: "kirim-dari-rumah",
    label: "Kirim dari rumah",
    title: "Pelanggan mengisi alamat dari rumah, kasir cukup memindai QR",
    points: [
      "Pelanggan mengisi data paket di situs gerai Anda lalu membawa QR <code>INV</code> ke loket dalam 48 jam.",
      "Kasir memindai QR, menimbang ulang, menerima pembayaran, lalu mencetak label.",
      "Kode yang sama dipakai untuk struk dan lacak paket, jadi tidak ada antrean mengetik alamat.",
    ],
    visual: stage(`<div class="float"><div class="w-url">berkahjaya.geraimitra.com</div>
<div class="w-pay w-gap"><div><div>Draf kiriman dari rumah</div><div class="w-big mono">INV 8K4M2P7</div><div>Tunjukkan QR ini ke kasir dalam 48 jam</div></div>${IC.qr}</div></div>`),
  },
  {
    id: "paket-massal",
    label: "Paket massal CSV",
    title: "Puluhan paket toko online terbit dari satu berkas",
    points: [
      "Pelanggan toko online mengunggah berkas CSV hingga 200 baris sekaligus.",
      "Baris dengan alamat atau kecamatan yang kurang tepat ditandai untuk dibetulkan lebih dulu.",
      "Resi diterbitkan lalu dicetak massal ke label thermal 100 mm.",
    ],
    visual: spec("Angka paket massal dan cetak", [
      ["200 baris", "per unggahan berkas CSV"],
      ["100×150 mm", "label paket siap tempel"],
      ["58 mm", "struk pelanggan dari printer Bluetooth"],
      ["9 kurir", "mitra Mengantar dalam satu akun gerai"],
    ]),
  },
  {
    id: "pickup",
    label: "Pickup &amp; Surat Jalan",
    title: "Serah terima kurir tanpa paket tertukar",
    points: [
      "Saat kurir menjemput, kasir memilih ekspedisinya lalu memindai resi satu per satu.",
      "Resi milik ekspedisi lain langsung ditolak dengan bunyi peringatan.",
      "Paket yang lolos pindai masuk Surat Jalan sebelum ditandatangani kurir.",
    ],
    visual: stage(`<div class="float"><div class="w-head"><span>Pickup J&amp;T Express</span><span class="chip">Surat Jalan</span></div>
<ul class="w-rows"><li><span class="mono">JT…5678</span><b>Terverifikasi</b></li><li><span class="mono">JT…5679</span><b>Terverifikasi</b></li><li><span class="mono">SPX…2201</span><span>Ditolak, kurir lain</span></li></ul></div>`),
  },
  {
    id: "retur",
    label: "Meja Retur &amp; klaim",
    title: "Paket retur tersimpan rapi dan diambil dengan PIN",
    points: [
      "Paket gagal kirim yang kembali dipindai ke Meja Retur dan dicatat posisi raknya.",
      "Pengirim asli menerima Kode Ambil lewat WhatsApp untuk menjemput barangnya.",
      "Paket terlambat, rusak, atau hilang dipantau tenggat klaimnya.",
    ],
    visual: stage(`<div class="float"><div class="w-head"><span>Meja Retur · Rak B-03</span><span class="chip on">Menunggu diambil</span></div>
<ul class="w-rows"><li><span>Resi</span><b class="mono">SC…4410</b></li><li><span>Pengirim asli</span><b>Ibu S. Nisa</b></li><li><span>Kode Ambil</span><span class="w-pin"><span>4</span><span>8</span><span>2</span><span>7</span></span></li></ul></div>`),
  },
  {
    id: "keuangan",
    label: "Keuangan dua buku",
    title: "Kas loket dan saldo Mengantar dicocokkan per resi",
    points: [
      "Kas loket dicatat terpisah dari mutasi akun Mengantar, lalu dicocokkan per nomor resi.",
      "Saldo Aman menyisihkan cadangan ongkir retur untuk kiriman COD yang masih di perjalanan.",
      "Akun Kasir hanya menerima harga jual pelanggan; modal, diskon, dan laba khusus Pemilik.",
    ],
    visual: spec("Angka keuangan gerai", [
      ["1:1", "kas loket dan mutasi Mengantar per resi"],
      ["2 buku", "Kas Loket dan cermin akun Mengantar"],
      ["0", "angka modal dan diskon di layar Kasir"],
      ["2 peran", "Pemilik dan Kasir dengan akun terpisah"],
    ]),
  },
]

const CAPABILITIES: Array<[string, string]> = [
  ["Format cetak 10×15 &amp; 58 mm", "Paket + Bukti 10×15, Paket saja 10×10 atau 10×15, dan roll thermal 58 mm dari printer Bluetooth."],
  ["Audit cetak ulang beralasan", "Cetak pertama tercatat otomatis; cetak ulang meminta alasan singkat dan masuk riwayat audit loket."],
  ["Layar Pelanggan dengan QRIS", "Layar kedua di meja kasir menampilkan total tagihan dan QRIS gerai kepada pelanggan."],
  ["Buku alamat pelanggan langganan", "Kontak pengirim dan penerima tersimpan, sehingga data pelanggan langganan terisi dari pencarian nama atau nomor HP."],
  ["Mode dropshipper aman retur", "Label mencetak nama toko online pengirim, sementara alamat retur tetap terkunci ke gerai Anda."],
  ["API toko <code>/api/v1</code> &amp; konektor MCP", "Kunci API berbatas kuota harian dan titik akses MCP untuk cek tarif dan draf kiriman otomatis."],
]

export function renderFitur(app: string): string {
  return `${pageHead("Fitur loket", "Fitur kasir loket, cetak resi &amp; keuangan agen", "Enam modul terpadu yang memisahkan tugas cepat kasir di depan pelanggan dari pengawasan margin, saldo, dan rekonsiliasi milik pemilik gerai.")}

<section class="sec tight" aria-label="Enam modul GeraiExpress"><div class="wrap"><div class="prows">
${PILLARS.map((p, i) => `<article class="prow${i % 2 ? " flip" : ""}" id="${p.id}" aria-labelledby="${p.id}-title">
<div class="prow-text"><p class="plabel"><span class="pno" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>${p.label}</p>
<h2 id="${p.id}-title">${p.title}</h2>
<ul class="sqlist">${p.points.map((t) => `<li><span>${t}</span></li>`).join("")}</ul></div>
${p.visual}
</article>`).join("\n")}
</div>
<p class="note">Layar pertama adalah layar kasir sungguhan; kartu lainnya ilustrasi dengan data contoh.</p>
</div></section>

<section class="sec tight" aria-labelledby="harian-title"><div class="wrap">
<div class="shead"><h2 id="harian-title">Dan yang Anda perlukan setiap hari</h2></div>
<dl class="caps">${CAPABILITIES.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")}</dl>
</div></section>
${closing(app, "/ekspedisi", "Lihat Daftar Ekspedisi")}`
}

export function renderEkspedisi(app: string): string {
  const rows: Array<[string, string, string, string]> = [
    ["jt", "EZ (Reguler), J&T Eco (sebagian rute)", "—", "Reguler: Non-COD & COD"],
    ["jne", "REG (Reguler)", "JNE Cargo (≥ 5 kg, Non-COD)", "Reguler: Non-COD & COD"],
    ["sicepat", "REG (Reguler)", "SiCepat Cargo (≥ 5 kg, Non-COD)", "Reguler: Non-COD, COD & barang berbahaya tertentu"],
    ["sap", "REG (Reguler)", "SAP Cargo (≥ 5 kg, Non-COD)", "Reguler: Non-COD & COD"],
    ["lion", "REGPACK (Reguler)", "—", "Non-COD & COD"],
    ["idexpress", "STD (Reguler)", "iDexpress Cargo (≥ 5 kg, Non-COD)", "Reguler: Non-COD, COD & barang berbahaya tertentu"],
    ["anteraja", "Reguler (selalu dijemput kurir)", "—", "Non-COD & COD (wajib nilai barang)"],
    ["pos", "Pos Reguler", "—", "Non-COD & COD (syarat tingkat terkirim)"],
    ["spx", "Standard", "—", "Non-COD & COD (wajib nilai barang)"],
  ]
  return `${pageHead("Jaringan kurir", "Daftar ekspedisi reguler, kargo &amp; layanan COD", "Layani kiriman warga sekitar dan penjual online dari satu akun gerai, mulai dokumen 1 kg hingga karung kargo puluhan kilogram.")}

<section class="sec tight" aria-labelledby="jaringan-title"><div class="wrap">
<ul class="pgrid pgrid-gap" aria-label="Sembilan ekspedisi mitra Mengantar">${Object.keys(COURIERS).map((k) => `<li class="pbadge">${courierImg(k, 28)}</li>`).join("")}</ul>
<div class="shead"><h2 id="jaringan-title">Jaringan kurir dalam satu layar perbandingan</h2><p class="sub">Pemilik gerai bebas mengaktifkan atau menonaktifkan ekspedisi sesuai jadwal kurir penjemput di kecamatannya.</p></div>
<div class="tbl-wrap"><table class="tbl">
<thead><tr><th scope="col">Ekspedisi</th><th scope="col">Reguler &amp; Ekonomi</th><th scope="col">Kargo</th><th scope="col">Pembayaran &amp; catatan</th></tr></thead>
<tbody>${rows.map(([k, reg, car, cod]) => `<tr><td><span class="tcour"><span class="tlogo">${courierImg(k!, 24, true)}</span><strong>${e(COURIERS[k!]!.name)}</strong></span></td><td>${e(reg)}</td><td>${e(car)}</td><td>${e(cod)}</td></tr>`).join("")}</tbody>
</table></div>
<p class="note">Ketersediaan rute dan jadwal penjemputan mengikuti cakupan aktif jaringan Mengantar pada titik jemput gerai Anda.</p>
</div></section>

<section class="sec tight" aria-labelledby="aturan-title"><div class="wrap">
<div class="shead"><h2 id="aturan-title">Aturan lapangan yang dihitung otomatis</h2><p class="sub">Meja kasir menyaring layanan sebelum resi terbit, sehingga gerai tidak merugi karena selisih berat atau batas COD.</p></div>
<div class="open-cols">
<div><h3>Berat aktual &amp; volumetrik</h3><p>Sistem memakai yang lebih besar antara berat timbangan dan berat volumetrik kotak (pembagi mengikuti layanan: <code>4.000</code> untuk JNE Reguler dan iDexpress Cargo, <code>6.000</code> untuk layanan lain).</p></div>
<div><h3>Batas nilai COD</h3><p>Setiap ekspedisi punya batas tagihan COD dan ketentuan nilai barang, misalnya syarat tingkat terkirim untuk COD Pos Indonesia. Kasir hanya melihat layanan yang memenuhi syarat.</p></div>
<div><h3>Barang berbahaya (DG)</h3><p>Kiriman berisi baterai, cairan, parfum, atau aerosol dapat ditandai di kasir sehingga hanya layanan reguler SiCepat dan iDexpress yang menerimanya yang tampil.</p></div>
</div>
</div></section>
${closing(app, "/simulasi-kasir", "Coba Cek Tarif Contoh")}`
}

type Step = { label: string; title: string; text: string; who: string; mitra: string; sistem: string; card: string }

/** `/cara-kerja` steps (adsbook `StepFlow` parity): what the partner does vs what the system does, with a synthetic card. */
const STEPS: Step[] = [
  {
    label: "Daftar &amp; Titik Jemput",
    title: "Daftar akun &amp; ajukan titik jemput",
    text: "Buat akun pemilik di GeraiExpress, pilih nama alamat gerai (misalnya <code>berkahjaya.geraimitra.com</code>), lalu isi alamat lengkap toko beserta kontak penanggung jawab penjemputan kurir.",
    who: "Calon mitra",
    mitra: "Mengisi data pemilik, alamat toko, dan kontak penjemputan kurir.",
    sistem: "Mengirim kode verifikasi email dan mencatat pengajuan titik jemput untuk ditinjau.",
    card: `<div class="float"><div class="w-url">berkahjaya.geraimitra.com</div>
<ul class="w-rows w-gap"><li><span>Nama gerai</span><b>Gerai Berkah Jaya</b></li><li><span>Kecamatan</span><b>Coblong, Kota Bandung</b></li><li><span>Kontak jemput</span><b class="mono">08xx-xxxx-4821</b></li></ul></div>`,
  },
  {
    label: "Tinjauan &amp; Akun",
    title: "Tinjauan lokasi &amp; pembukaan akun Mengantar",
    text: "Tim kami memeriksa kelengkapan titik jemput. Begitu disetujui, akun seller Mengantar untuk gerai Anda dibuat dan dihubungkan secara otomatis.",
    who: "Calon mitra",
    mitra: "Memantau status pengajuan lewat email dan dasbor.",
    sistem: "Meninjau alamat jemput, lalu membuat dan menghubungkan akun seller Mengantar atas nama usaha Anda.",
    card: `<div class="float"><div class="w-head"><span>Status pengajuan</span><span class="chip on">Disetujui</span></div>
<ul class="w-rows"><li><span>Tinjauan titik jemput</span><b>Selesai</b></li><li><span>Akun seller Mengantar</span><b>Terhubung</b></li><li><span>Diskon mitra per ekspedisi</span><b>Dikonfirmasi</b></li></ul></div>`,
  },
  {
    label: "Webhook &amp; Printer",
    title: "Tempel URL webhook &amp; atur printer",
    text: "Ikuti panduan tiga langkah di menu Pengaturan untuk menyalin Webhook Secret agar status paket diperbarui otomatis, lalu pilih ukuran kertas printer loket.",
    who: "Pemilik gerai",
    mitra: "Menyalin Webhook Secret dan memilih format label 100 mm atau struk 58 mm.",
    sistem: "Menerima pembaruan status paket dari Mengantar secara otomatis.",
    card: `<div class="float"><div class="w-head"><span>Pengaturan loket</span><span class="chip">3 langkah</span></div>
<ul class="w-rows"><li><span>Webhook Secret</span><b>Tersalin</b></li><li><span>Status paket otomatis</span><b>Aktif</b></li><li><span>Format cetak</span><b>Label 100×150 mm</b></li></ul></div>`,
  },
  {
    label: "Saldo &amp; Pelanggan",
    title: "Isi saldo kiriman &amp; terima pelanggan",
    text: "Top-up saldo akun Mengantar untuk kiriman Non-COD. Pelanggan datang membawa paket (atau QR dari rumah), kasir menimbang, menerima tunai atau QRIS, lalu menempel label resi.",
    who: "Kasir",
    mitra: "Menimbang paket, menerima tunai atau QRIS, lalu menempel label resi.",
    sistem: "Menghitung berat volumetrik dan batas COD, menerbitkan resi, dan memotong saldo sebesar ongkir bersih mitra.",
    card: `<div class="float"><div class="w-rcpt"><div><span>INV 8K4M2P7</span><span>LUNAS</span></div><div><span>J&amp;T · EZ 1.000 g</span><span>12.500</span></div><div><span>Bubble wrap</span><span>3.000</span></div><div class="tot"><span>Tunai</span><span>Rp 15.500</span></div></div></div>`,
  },
  {
    label: "Pickup &amp; Rekonsiliasi",
    title: "Serah terima pickup &amp; rekonsiliasi",
    text: "Pindai paket per kurir di menu Pickup &amp; Surat Jalan saat kurir tiba, lalu pantau pencairan COD dan laba harian di menu Keuangan pemilik.",
    who: "Kasir &amp; pemilik",
    mitra: "Memindai paket per kurir sebelum Surat Jalan ditandatangani.",
    sistem: "Mencocokkan kas loket dengan mutasi Mengantar per resi dan mencatat COD saat dananya cair.",
    card: `<div class="float"><div class="w-head"><span>Pickup J&amp;T Express</span><span class="chip">Surat Jalan</span></div>
<ul class="w-rows"><li><span class="mono">JT…5678</span><b>Terverifikasi</b></li><li><span class="mono">JT…5679</span><b>Terverifikasi</b></li><li><span>Rekonsiliasi</span><b>1:1 Cocok</b></li></ul></div>`,
  },
]

const PIPE: Array<[string, string]> = [
  ["Timbang &amp; Cek Tarif", "Berat aktual atau volumetrik, mana yang lebih besar, menentukan tarif tiap ekspedisi."],
  ["Terima Tunai / QRIS", "Pelanggan membayar tarif publik di loket dan kasnya tercatat di buku kas loket."],
  ["Cetak Resi Thermal", "Resi terbit lewat akun Mengantar gerai, lalu label 100 mm atau struk 58 mm tercetak."],
  ["Pindai Surat Jalan Kurir", "Paket dipindai per kurir saat pickup; resi ekspedisi lain ditolak."],
  ["Rekonsiliasi 1:1 &amp; COD Cair", "Kas loket dicocokkan dengan mutasi Mengantar per resi; COD dihitung saat dana cair."],
]

/** The pipeline pulse runs only while on screen; reduced motion (or no IntersectionObserver) keeps the finished state. */
export const CARA_SCRIPT = `<script>
(function(){
  var p=document.querySelector("[data-pipeline]");
  if(!p||!("IntersectionObserver" in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  new IntersectionObserver(function(es){es.forEach(function(x){p.classList.toggle("is-playing",x.isIntersecting)})},{threshold:.3}).observe(p);
})();
</script>`

export function renderCaraKerja(app: string): string {
  const n = (i: number) => String(i + 1).padStart(2, "0")
  return `${pageHead("Alur kemitraan", "Cara daftar &amp; peralatan buka loket kirim paket", "Pendaftaran tanpa biaya waralaba puluhan juta: dari pengajuan lokasi sampai siap menerima paket pelanggan dalam lima tahap yang jelas.")}

<section class="sec tight" aria-label="Lima langkah menjadi gerai aktif"><div class="wrap">
<ol class="jump" aria-label="Lompat ke langkah">${STEPS.map((s, i) => `<li><a href="#langkah-${i + 1}"><span class="jn" aria-hidden="true">${n(i)}</span>${s.label}</a></li>`).join("")}</ol>
<div class="prows srows">
${STEPS.map((s, i) => `<article class="prow${i % 2 ? " flip" : ""}" id="langkah-${i + 1}" aria-labelledby="langkah-${i + 1}-title">
<div class="prow-text"><p class="plabel"><span class="pno">${n(i)}</span>${s.label}</p>
<h2 id="langkah-${i + 1}-title">${s.title}</h2>
<p class="ptext">${s.text}</p>
<dl class="who"><div><dt>${s.who}</dt><dd>${s.mitra}</dd></div><div><dt>Sistem GeraiExpress &amp; Mengantar</dt><dd>${s.sistem}</dd></div></dl></div>
<div class="stage pstage" aria-hidden="true">${s.card}</div>
</article>`).join("\n")}
</div>
<p class="note">Kartu tiap langkah adalah ilustrasi dengan data contoh.</p>
</div></section>

<section class="sec tight pipeline" aria-labelledby="alur-title" data-pipeline><div class="wrap">
<div class="shead"><h2 id="alur-title">Alur satu paket dari meja loket sampai saldo cair</h2><p class="sub">Lima titik yang dilewati setiap kiriman, dicatat otomatis tanpa pembukuan manual.</p></div>
<ol class="pipe">${PIPE.map(([t, d], i) => `<li class="stop" style="--n:${i}"><span class="node" aria-hidden="true">${i + 1}</span><div><p class="stop-t">${t}</p><p class="stop-d">${d}</p></div></li>`).join("")}<li class="pulse" aria-hidden="true"></li></ol>
</div></section>

<section class="sec tight" aria-labelledby="alat-title"><div class="wrap">
<div class="shead"><h2 id="alat-title">Spesifikasi peralatan meja loket</h2><p class="sub">Gunakan merek apa pun yang mudah dibeli di kota Anda; tidak ada penguncian merek perangkat keras.</p></div>
<div class="tbl-wrap"><table class="tbl">
<thead><tr><th scope="col">Perangkat</th><th scope="col">Spesifikasi minimum</th><th scope="col">Rekomendasi meja kasir harian</th></tr></thead>
<tbody>
<tr><td><strong>Perangkat kasir</strong></td><td>HP Android (Chrome terbaru) dengan internet stabil</td><td>Laptop atau PC layar ≥ 13 inci agar tampilan kasir 60/40 dan tabel kiriman leluasa</td></tr>
<tr><td><strong>Timbangan paket</strong></td><td>Timbangan digital meja kapasitas 10–30 kg</td><td>Timbangan duduk digital 30–50 kg (ketelitian 5–10 gram) dan meteran gulung untuk paket besar</td></tr>
<tr><td><strong>Printer resi</strong></td><td>Printer struk thermal Bluetooth 58 mm (kertas roll biasa)</td><td>Printer label <em>direct thermal</em> lebar 100 mm (stiker 100×150 mm, USB atau LAN)</td></tr>
<tr><td><strong>Pemindai kode</strong></td><td>Kamera HP atau webcam bawaan browser</td><td>Pemindai barcode/QR 2D USB untuk mempercepat pindai QR draf dan manifest pickup</td></tr>
</tbody>
</table></div>
</div></section>
${closing(app, "/biaya-dan-paket", "Lihat Biaya & Paket")}`
}

const STANDARD_INCLUDES = [
  "Kasir kiriman satuan, paket massal CSV, cek ongkir &amp; cek resi",
  "Cetak label thermal 100 mm &amp; struk Bluetooth 58 mm",
  "Akun pemilik dan akun kasir terpisah (angka margin tidak bocor)",
  "Halaman publik <strong>namagerai.geraimitra.com</strong> dengan QR kirim dari rumah",
  "Sinkronisasi mutasi saldo, pelacak COD cair, dan Meja Retur",
  "Kunci API toko &amp; konektor MCP berbatas kuota harian",
]
const PRO_INCLUDES = [
  "Seluruh fasilitas Mitra Gerai Standar",
  "Domain milik toko sendiri, misalnya <code>kirim.tokoberkah.com</code> atau <code>tokoberkah.id</code>",
  "Sertifikat SSL/HTTPS diterbitkan dan diperpanjang otomatis lewat Cloudflare",
  "Domain utama dan <code>www</code> dihitung satu; <code>www</code> dialihkan ke domain utama",
  "Status verifikasi domain tampil di menu Pengaturan gerai",
]
const COMPARE: Array<[string, string, string, string]> = [
  ["Bandingkan tarif kurir", "Cek aplikasi tiap ekspedisi satu per satu", "Terbatas pada kurir yang bekerja sama dengan jaringan agen", "Sembilan ekspedisi mitra Mengantar dalam satu layar"],
  ["Perangkat di meja kasir", "Tanpa sistem kasir, dicatat manual", "Perlu mesin atau aplikasi khusus dari jaringan", "Laptop, PC, atau HP Android yang sudah ada"],
  ["Struk untuk pelanggan", "Nota tulis tangan", "Mengikuti format perangkat agen", "Struk tarif publik 100 mm atau 58 mm"],
  ["Kas loket & saldo kurir", "Dicocokkan manual dari tiap akun", "Bergantung pada laporan jaringan agen", "Kas loket dan mutasi Mengantar dicocokkan per resi"],
  ["Akses karyawan kasir", "Kasir melihat semua catatan", "Bergantung pada pengaturan sistem", "Peran Kasir tidak menerima angka modal dan margin"],
  ["Paket retur", "Disimpan seadanya", "Bergantung pada prosedur jaringan", "Meja Retur dengan PIN ambil lewat WhatsApp"],
  ["Halaman toko sendiri", "Tidak ada", "Tidak selalu tersedia", "namagerai.geraimitra.com gratis"],
]
const CMP_COLS = ["Manual ekspedisi satu-satu", "Sistem keagenan kunci perangkat", "GeraiExpress"]

/** `/biaya-dan-paket` readout sync: the JS fallback for browsers without `:has()` (CSS decides where it exists). */
export const BIAYA_SCRIPT = `<script>
(function(){
  var r=document.querySelector("[data-pricing]");if(!r)return;
  function sync(){
    var c=r.querySelector("input[name=paket]:checked"),v=c?c.value:"";
    [].forEach.call(r.querySelectorAll(".readout"),function(x){if(x.getAttribute("data-plan")===v)x.setAttribute("data-active","");else x.removeAttribute("data-active")});
    [].forEach.call(r.querySelectorAll(".tier"),function(t){if(t.querySelector("input").checked)t.setAttribute("data-active","");else t.removeAttribute("data-active")});
  }
  r.addEventListener("change",sync);sync();
})();
</script>`

const incl = (items: string[], label: string) => `<ul class="incl" aria-label="${label}">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`

/** Asymmetric radio pricing (shared by `/` and `/biaya-dan-paket`; one per page, synced by `BIAYA_SCRIPT`). */
function pricingBlock(app: string): string {
  return `<div class="pricing" data-pricing>
<fieldset class="tiers"><legend>Pilih jenis kemitraan</legend>
<label class="tier"><input type="radio" name="paket" value="standar" checked><span class="t-main"><span class="t-top"><span class="t-label">Mitra Gerai Standar</span><span class="t-price">Rp 0</span></span><span class="t-note">Biaya pendaftaran &amp; pemakaian aplikasi kasir · Halaman namagerai.geraimitra.com gratis</span></span></label>
<label class="tier"><input type="radio" name="paket" value="pro"><span class="t-main"><span class="t-top"><span class="t-label">Mitra Gerai + Domain Sendiri (Pro)</span><span class="t-price">Hubungi kami</span></span><span class="t-note">Pakai domain .com / .id milik toko sendiri dengan SSL Cloudflare otomatis</span></span></label>
</fieldset>
<div class="panel">
<div class="readout" data-plan="standar" data-active>
<p class="r-label">Mitra Gerai Standar</p>
<p class="r-price"><strong>Rp 0</strong><small>biaya pendaftaran &amp; aplikasi kasir</small></p>
<p class="r-desc">Keuntungan gerai datang dari selisih diskon ongkir mitra pada setiap resi, sementara pelanggan tetap membayar tarif publik.</p>
<a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai</a>
${incl(STANDARD_INCLUDES, "Termasuk di Mitra Gerai Standar")}
</div>
<div class="readout" data-plan="pro">
<p class="r-label">Mitra Gerai + Domain Sendiri (Pro)</p>
<p class="r-price"><strong class="r-ask">Hubungi kami</strong></p>
<p class="r-desc">Biaya opsi domain Pro disampaikan tim kemitraan sebelum aktivasi. Seluruh fasilitas Mitra Gerai Standar tetap berlaku.</p>
<a class="cta" href="/hubungi-kami">Hubungi Kemitraan</a>
${incl(PRO_INCLUDES, "Termasuk di Mitra Gerai + Domain Sendiri (Pro)")}
</div>
</div>
</div>`
}

/** Open hairline comparison (shared by `/` and `/biaya-dan-paket`). */
function compareTable(): string {
  return `<table class="cmp"><caption class="sr">Perbandingan cara membuka loket kirim paket</caption>
<thead><tr><th scope="col">Kebutuhan loket</th><th scope="col">${CMP_COLS[0]}</th><th scope="col">${CMP_COLS[1]}</th><th scope="col" class="ours"><span class="sq" aria-hidden="true"></span>${CMP_COLS[2]}</th></tr></thead>
<tbody>${COMPARE.map(([f, a, b, c]) => `<tr><th scope="row">${e(f)}</th><td data-col="${CMP_COLS[0]}">${e(a)}</td><td data-col="${CMP_COLS[1]}">${e(b)}</td><td class="ours" data-col="${CMP_COLS[2]}">${e(c)}</td></tr>`).join("")}</tbody>
</table>`
}

export function renderBiaya(app: string): string {
  return `${pageHead("Skema kemitraan", "Biaya pendaftaran &amp; skema komisi mitra loket", "Biaya dan pembagian margin kami buka sejak awal agar pemilik toko dapat menghitung perputaran modal loket secara realistis.")}

<section class="sec tight" aria-labelledby="paket-title"><div class="wrap">
<div class="shead"><h2 id="paket-title">Pilih cara bermitra</h2><p class="sub">Mulai tanpa biaya langganan aplikasi, lalu tambahkan domain toko sendiri hanya bila dibutuhkan.</p></div>
${pricingBlock(app)}
</div></section>

<section class="sec tight" aria-labelledby="banding-title"><div class="wrap">
<div class="shead"><h2 id="banding-title">Dibanding cara lain membuka loket</h2><p class="sub">Gambaran umum tanpa menyebut merek, dan hanya pada hal yang benar-benar dikerjakan GeraiExpress.</p></div>
${compareTable()}
</div></section>

<section class="sec tight" aria-labelledby="untung-title"><div class="wrap">
<div class="shead"><h2 id="untung-title">Dari mana keuntungan gerai datang</h2><p class="sub">Pelanggan membayar tarif publik resmi; saldo gerai terpotong lebih rendah setelah diskon mitra diterapkan pada akunnya.</p></div>
<div class="open-cols two">
<div><h3>Margin diskon ongkir ekspedisi</h3><p>Pelanggan di loket membayar tarif publik resmi (misalnya Rp 20.000). GeraiExpress menetapkan diskon mitra untuk akun Mengantar gerai Anda, nilainya per ekspedisi dan dikonfirmasi saat pendaftaran disetujui, lalu tim Mengantar menerapkannya. Saldo yang terpotong jadi lebih rendah dari uang di laci kasir, sementara pelanggan tetap membayar tarif publik.</p></div>
<div><h3>Packing &amp; biaya layanan loket</h3><p>Gerai bebas menetapkan harga bubble wrap, kardus, lakban, atau biaya jasa loket, dan semuanya tercantum rapi di struk pelanggan.</p></div>
<div><h3>Kiriman Non-COD</h3><p>Butuh saldo Mengantar aktif sebesar ongkir bersih mitra saat resi terbit. Uang tunai penuh dari pelanggan Anda terima di meja kasir saat itu juga. GeraiExpress tidak menahan deposit Anda.</p></div>
<div><h3>Kiriman COD</h3><p>Ongkos kirim dipotong saat dana COD cair dari kurir. Jaga Saldo Aman untuk cadangan ongkir bila ada paket retur yang ditolak penerima.</p></div>
</div>
</div></section>
${closing(app, "/cara-kerja", "Pelajari Cara Daftar")}`
}

const SIM_RATES = [
  { id: "jt", name: "J&T Express · EZ", eta: "2–3 hari", base: 12500, cargoBase: 4200, w: 93 },
  { id: "sicepat", name: "SiCepat · REG", eta: "1–2 hari", base: 13000, cargoBase: 4500, w: 71 },
  { id: "jne", name: "JNE · REG", eta: "2–3 hari", base: 12000, cargoBase: 4400, w: 47 },
  { id: "lion", name: "Lion Parcel · REGPACK", eta: "2–3 hari", base: 11200, cargoBase: 4000, w: 106 },
]
const SIM_CITIES: Array<[string, number]> = [
  ["Tebet, Jakarta Selatan", 1],
  ["Coblong, Kota Bandung", 0.9],
  ["Gubeng, Kota Surabaya", 1.25],
  ["Medan Kota, Kota Medan", 1.6],
]

export const SIM_SCRIPT = `<script>
(function(){
  var R=${JSON.stringify(SIM_RATES)},C=${JSON.stringify(SIM_CITIES)},chosen=null;
  var rp=function(n){return"Rp "+n.toLocaleString("id-ID")};
  var el=function(id){return document.getElementById(id)};
  function calc(r){
    var g=Math.max(1,parseInt((el("berat").value||"").replace(/\\D/g,""),10)||1000);
    var kg=Math.max(1,Math.ceil(g/1000)),mul=C[+el("kota").value][1];
    if(kg>=10){return Math.round((r.cargoBase*10+r.cargoBase*0.85*(kg-10))*mul/500)*500}
    return Math.round(r.base*mul*kg/500)*500;
  }
  function receipt(r){
    chosen=r;
    var p=calc(r),pack=+el("pack").value||0,cod=+el("cod").value||0;
    var tot=p+pack,inv="INV DEMO"+String(Math.floor(Date.now()/1000)%1000).padStart(3,"0");
    var awb="JX"+String(88291000+(p%8999));
    var lines=[
      "GERAI CONTOH NUSANTARA",
      "Jl. Merdeka No. 45",
      "--------------------------------",
      "No Nota   : "+inv,
      "Ekspedisi : "+r.name,
      "Tujuan    : "+C[+el("kota").value][0],
      "Berat     : "+(el("berat").value||"1000")+" g",
      "--------------------------------",
      "Ongkir            "+rp(p)
    ];
    if(pack>0)lines.push("Packing Tambahan  "+rp(pack));
    if(cod>0)lines.push("Tagihan CODBrg    "+rp(cod));
    lines.push("Total Dibayar     "+rp(tot));
    lines.push("Cara Bayar: "+el("bayar").value);
    lines.push("--------------------------------");
    lines.push("Lacak: namagerai.geraimitra.com/lacak");
    lines.push("(simulasi — bukan resi sungguhan)");
    el("struk").textContent=lines.join("\\n");
    el("lbl-meta").textContent=r.name+" · "+awb+" · "+(cod>0?"COD "+rp(cod+p):"NON-COD");
    el("lbl-dest").textContent="Penerima: Pelanggan Contoh — "+C[+el("kota").value][0]+" ("+(el("berat").value||"1000")+" g)";
  }
  var lastKey="";
  function draw(){
    var ul=el("rates");
    var list=R.map(function(r){return{id:r.id,name:r.name,eta:r.eta,base:r.base,cargoBase:r.cargoBase,w:r.w,p:calc(r)}}).sort(function(a,b){return a.p-b.p});
    // Rebuild only when prices change: a blur-triggered redraw must never replace the button being clicked.
    var key=list.map(function(r){return r.id+":"+r.p}).join("|");
    if(key===lastKey){if(chosen){var c0=R.filter(function(x){return x.id===chosen.id})[0];if(c0)receipt(c0)}return}
    lastKey=key;ul.innerHTML="";
    for(var i=0;i<list.length;i++){
      (function(r,idx){
        var li=document.createElement("li");
        var tag=idx===0?' <span class="chip on">Termurah</span>':(r.eta==="1–2 hari"?' <span class="chip">Tercepat</span>':"");
        li.className="sim-row";li.innerHTML='<span class="clogo"><img src="/couriers/'+r.id+'.svg" alt="" width="'+Math.round(r.w*1.3)+'" height="26" decoding="async"></span><span class="rate-main"><span class="rate-name">'+r.name+'</span><span class="rate-meta">Estimasi '+r.eta+tag+'</span></span>';
        var b=document.createElement("button");
        b.type="button";b.textContent=rp(r.p);
        b.setAttribute("aria-label","Pilih "+r.name+" "+rp(r.p));
        b.onclick=function(){receipt(r)};
        li.appendChild(b);ul.appendChild(li);
      })(list[i],i);
    }
    if(chosen){var m=R.filter(function(x){return x.id===chosen.id})[0];if(m)receipt(m)}
  }
  var qBtns=document.querySelectorAll("[data-w]");
  for(var j=0;j<qBtns.length;j++){
    qBtns[j].addEventListener("click",function(){el("berat").value=this.getAttribute("data-w");draw()});
  }
  el("berat").addEventListener("input",draw);
  ["kota","bayar","pack"].forEach(function(id){el(id).addEventListener("change",draw)});
  el("cod").addEventListener("change",draw);
  draw();
})();
</script>`

const CHEV = '<svg class="sel-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
const CHECK = '<svg class="opt-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'

type SelOpt = [value: string, main: string, sub?: string]
const optText = ([, main, sub]: SelOpt) => `<span class="opt-main">${e(main)}</span>${sub ? `<span class="opt-sub">${e(sub)}</span>` : ""}`

/**
 * Custom listbox dropdown (same pattern and CSS as the home `Kecamatan tujuan`): the chosen value lives in a hidden
 * input `#id`, which fires `change` on pick, so page scripts read it like a native control. Behaviour: `SEL_SCRIPT`.
 */
function selBox(id: string, label: string, opts: SelOpt[], sel = 0): string {
  return `<div class="fld"><span class="fld-lbl" id="${id}-lbl">${label}</span>
<div class="sel" data-sel><input type="hidden" id="${id}" value="${e(opts[sel]![0])}">
<button type="button" id="${id}-btn" class="sel-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list" aria-labelledby="${id}-lbl ${id}-val"><span id="${id}-val" class="sel-val">${optText(opts[sel]!)}</span>${CHEV}</button>
<ul id="${id}-list" class="sel-list" role="listbox" tabindex="-1" aria-labelledby="${id}-lbl" hidden>${opts.map((o, i) => `<li role="option" id="${id}-opt-${i}" data-value="${e(o[0])}" aria-selected="${i === sel}" class="sel-opt"><span class="opt-text">${optText(o)}</span>${CHECK}</li>`).join("")}</ul>
</div></div>`
}

/** Every `[data-sel]` listbox: click/keyboard (ArrowUp/Down, Home/End, Enter/Space, Escape, Tab), outside tap closes, one open at a time. */
export const SEL_SCRIPT = `<script>
(function(){
  var list=[];
  [].forEach.call(document.querySelectorAll("[data-sel]"),function(root){
    var inp=root.querySelector("input"),btn=root.querySelector(".sel-btn"),box=root.querySelector(".sel-list"),val=root.querySelector(".sel-val");
    var opts=[].slice.call(box.querySelectorAll("[role=option]")),hl=0,me={root:root};
    function cur(){for(var i=0;i<opts.length;i++)if(opts[i].getAttribute("aria-selected")==="true")return i;return 0}
    function setHl(i){hl=(i+opts.length)%opts.length;opts.forEach(function(o,k){o.classList.toggle("hl",k===hl)});box.setAttribute("aria-activedescendant",opts[hl].id);opts[hl].scrollIntoView({block:"nearest"})}
    function open(){list.forEach(function(o){if(o!==me)o.close(false)});box.hidden=false;btn.setAttribute("aria-expanded","true");setHl(cur());box.focus()}
    me.close=function(refocus){if(box.hidden)return;box.hidden=true;btn.setAttribute("aria-expanded","false");if(refocus)btn.focus()};
    function pick(i){opts.forEach(function(o,k){o.setAttribute("aria-selected",k===i?"true":"false")});val.innerHTML=opts[i].querySelector(".opt-text").innerHTML;inp.value=opts[i].getAttribute("data-value");me.close(true);inp.dispatchEvent(new Event("change"))}
    btn.addEventListener("click",function(){box.hidden?open():me.close(true)});
    btn.addEventListener("keydown",function(ev){if(ev.key==="ArrowDown"||ev.key==="ArrowUp"){ev.preventDefault();open()}});
    box.addEventListener("keydown",function(ev){
      if(ev.key==="ArrowDown"){ev.preventDefault();setHl(hl+1)}
      else if(ev.key==="ArrowUp"){ev.preventDefault();setHl(hl-1)}
      else if(ev.key==="Home"){ev.preventDefault();setHl(0)}
      else if(ev.key==="End"){ev.preventDefault();setHl(opts.length-1)}
      else if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();pick(hl)}
      else if(ev.key==="Escape"){ev.preventDefault();ev.stopPropagation();me.close(true)}
      else if(ev.key==="Tab"){me.close(false)}
    });
    opts.forEach(function(o,i){o.addEventListener("mousemove",function(){if(hl!==i)setHl(i)});o.addEventListener("click",function(){pick(i)})});
    list.push(me);
  });
  document.addEventListener("pointerdown",function(ev){list.forEach(function(o){if(!o.root.contains(ev.target))o.close(false)})});
})();
</script>`

export function renderSimulasi(app: string): string {
  return `${pageHead("Simulasi meja kasir", "Simulasi meja kasir &amp; struk agen kirim paket", "Coba alur kasir GeraiExpress dengan data sintetis, tanpa mendaftar akun dan tanpa membuat tagihan ekspedisi sungguhan.")}
<section class="sec tight"><div class="wrap sim">
<form class="sim-stage" id="sim" onsubmit="return false" aria-labelledby="sim-1">
<h2 id="sim-1">1. Rincian paket pelanggan</h2>
<div class="sim-fields">
${selBox("kota", "Kota tujuan", SIM_CITIES.map(([c], i): SelOpt => { const [main, sub] = c.split(", "); return [String(i), main!, sub] }))}
<div class="fld"><label for="berat">Berat (gram)</label><input id="berat" inputmode="numeric" value="1000">
<div class="qw">
<button type="button" class="cta sm ghost" data-w="1000">1.000 g (1 kg)</button>
<button type="button" class="cta sm ghost" data-w="2500">2.500 g (3 kg)</button>
<button type="button" class="cta sm ghost" data-w="12000">12.000 g (Kargo)</button>
</div></div>
<div class="fld-2">
${selBox("cod", "Jenis layanan", [["0", "Non-COD", "Bayar di loket"], ["150000", "COD", "Nilai barang Rp 150.000"]])}
${selBox("pack", "Packing tambahan", [["0", "Tanpa packing"], ["3000", "Bubble wrap", "+Rp 3.000"], ["7000", "Kardus baru", "+Rp 7.000"]])}
</div>
${selBox("bayar", "Cara bayar di loket", [["Tunai", "Tunai"], ["QRIS gerai", "QRIS gerai"], ["Transfer", "Transfer"]])}
</div>
<h2 class="sim-h">2. Pilih ekspedisi</h2>
<div class="float sim-rates"><ul class="rates" id="rates"></ul></div>
</form>
<div class="sim-sticky">
<div class="sim-stage">
<h2>3. Hasil cetak di meja kasir</h2>
<p class="sim-p">Klik salah satu harga ekspedisi untuk menerbitkan contoh struk pelanggan dan label tempel 100 mm.</p>
<div class="receipt" id="struk" aria-live="polite">Pilih ekspedisi untuk melihat struk.</div>
<div class="lbl-preview" aria-label="Contoh label tempel paket">
<div class="lbl-top"><span id="lbl-meta">Label Thermal 100×150 mm</span><span class="chip">Contoh AWB</span></div>
<div class="lbl-bar" aria-hidden="true"></div>
<p id="lbl-dest" class="lbl-dest">Barcode resi kurir dan QR lacak tercetak siap tempel ke paket.</p>
</div>
<div class="row"><a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai Sekarang</a><a class="cta ghost" href="/fitur">Lihat Semua Fitur</a></div>
</div>
</div>
</div></section>
${closing(app, "/fitur", "Lihat Semua Fitur")}`
}

const FAQ_GROUPS: Array<[string, string, Array<[string, string]>]> = [
  [
    "pendaftaran-lokasi",
    "Pendaftaran &amp; Lokasi",
    [
      ["Apakah harus menyewa ruko besar di jalan raya untuk mendaftar?", "Tidak wajib ruko besar. Konter pulsa, fotokopi, toko kelontong, koperasi, maupun usaha rumahan yang memiliki akses masuk motor/mobil kurir penjemput dan jam buka jelas dapat mengajukan pendaftaran titik jemput."],
      ["Berapa lama pengajuan gerai ditinjau sampai bisa beroperasi?", "Setelah formulir titik jemput dikirim dan email terverifikasi, tim kami meninjau kelayakan alamat penjemputan. Begitu disetujui, akun pengiriman Mengantar dibuat otomatis dan Anda langsung dapat masuk ke ruang kerja kasir."],
      ["Apa fungsi halaman namagerai.geraimitra.com yang didapat setiap mitra?", "Halaman tersebut adalah situs resmi toko Anda sendiri (tanpa bercampur nama gerai lain) yang bisa dibagikan ke grup WhatsApp lingkungan agar pelanggan dapat cek ongkir, mengisi data paket dari rumah menjadi kode QR, dan melacak resi."],
    ],
  ],
  [
    "perangkat-cetak",
    "Perangkat &amp; Cetak Resi",
    [
      ["Apakah saya harus membeli printer atau timbangan khusus dari GeraiExpress?", "Tidak. Anda bebas memakai laptop/HP Android, timbangan digital, dan printer thermal 100 mm atau 58 mm merek apa saja yang sudah Anda miliki atau beli sendiri di toko komputer terdekat."],
      ["Format label dan struk apa saja yang bisa dicetak?", "Ada tiga pilihan: 10×15 Paket + Bukti (bagian atas ditempel ke paket, bagian bawah disobek sebagai bukti kirim pelanggan), 10×10 atau 10×15 Paket saja, dan roll thermal 58 mm dari printer Bluetooth untuk label tempel dan struk pelanggan."],
      ["Bagaimana jika resi perlu dicetak ulang?", "Cetak pertama tercatat otomatis. Cetak ulang tetap bisa dilakukan, tetapi kasir perlu menuliskan alasan singkat agar riwayat audit loket tetap terjaga."],
    ],
  ],
  [
    "saldo-cod-keuangan",
    "Saldo, Komisi Ongkir &amp; Pencairan COD",
    [
      ["Dari mana keuntungan pemilik gerai berasal?", "Pelanggan di loket membayar tarif pengiriman publik resmi sesuai struk, sedangkan saldo pengiriman gerai hanya dipotong tarif bersih setelah diskon mitra ekspedisi. Selisih diskon tersebut—ditambah jasa packing bila ada—menjadi laba kotor loket Anda."],
      ["Bagaimana alur uang untuk paket COD (Bayar di Tempat)?", "Penerima membayar harga barang plus biaya layanan COD kepada kurir pengantar saat paket tiba. Setelah status paket Terkirim dan dana cair ke mutasi akun Mengantar gerai, sistem mencocokkan nilai pencairan per nomor resi secara otomatis."],
      ["Apa yang dimaksud dengan indikator Saldo Aman di menu Keuangan?", "Saldo Aman adalah saldo akun Mengantar dikurangi estimasi cadangan biaya ongkir pergi-pulang untuk kiriman COD yang masih dalam perjalanan, sehingga pemilik gerai tahu berapa dana yang benar-benar bebas ditarik tanpa mengganggu operasional."],
      ["Apakah karyawan kasir saya bisa melihat besaran diskon modal dan saldo pemilik?", "Tidak bisa. Akun dengan peran Kasir disaring di tingkat server sehingga hanya menerima tarif publik pelanggan dan ringkasan pembayaran loket; angka modal, persentase diskon kurir, mutasi Mengantar, dan laba bersih khusus untuk akun Pemilik."],
    ],
  ],
  [
    "operasional-retur",
    "Operasional Harian, Dropship &amp; Retur",
    [
      ["Bisakah pelanggan online shop mengirim paket atas nama tokonya sendiri?", "Bisa. Fitur penyamaran pengirim tiga pihak memungkinkan label paket mencantumkan nama dan kontak toko reseller/dropshipper untuk penerima, namun alamat fisik pengembalian retur di sistem kurir tetap terkunci kembali ke gerai Anda."],
      ["Bagaimana jika penerima menolak paket dan kiriman dikembalikan (retur)?", "Saat paket retur tiba kembali di gerai, kasir memindainya ke Meja Retur. Sistem mencatat posisi rak dan membuat Kode Ambil unik untuk dikirim ke pengirim asli agar penyerahan barang retur tercatat sah."],
      ["Bagaimana cara mencegah paket salah diserahkan ke kurir ekspedisi lain?", "Gunakan menu Pickup & Surat Jalan sebelum menyerahkan tumpukan paket sore hari. Ketika kasir memilih kurir (misalnya J&T), pemindaian barcode resi milik ekspedisi lain akan langsung ditolak di layar."],
      ["Apakah data nomor HP penerima aman pada halaman lacak publik?", "Sangat aman. Halaman lacak publik hanya menampilkan inisial nama serta kota/kecamatan sesuai prinsip pelindungan data pribadi (UU PDP). Rincian lengkap hanya terbuka apabila pelacak memasukkan 4 digit terakhir nomor HP penerima yang tepat."],
    ],
  ],
]

/** Open hairline FAQ rows (`+` turns into `×` when open). */
const faqList = (items: Array<[string, string]>) =>
  `<div class="faq">${items.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${e(q)}</summary><p class="ans">${e(a)}</p></details>`).join("")}</div>`

/** The five homepage questions, picked from the `/tanya-jawab` groups (same wording on both pages). */
const faqAt = (g: number, q: number) => FAQ_GROUPS[g]![2][q]!
const HOME_FAQ: Array<[string, string]> = [faqAt(0, 0), faqAt(1, 0), faqAt(2, 0), faqAt(2, 2), faqAt(3, 0)]

export function renderTanyaJawab(app: string): string {
  const index = `<nav class="faq-index" aria-label="Kelompok pertanyaan">${FAQ_GROUPS.map(([id, title]) => `<a href="#${id}">${title}</a>`).join("")}</nav>`
  return `${pageHead("Pusat jawaban", "Tanya jawab syarat &amp; operasional agen paket", "Jawaban lugas atas pertanyaan yang paling sering diajukan pemilik konter dan toko sebelum membuka loket pengiriman multi-ekspedisi.", index)}
<section class="sec tight"><div class="wrap fgroups">
${FAQ_GROUPS.map(([id, title, items]) => `<section class="fgroup" id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${title}</h2>${faqList(items)}</section>`).join("\n")}
</div></section>
${closing(app, "/hubungi-kami", "Hubungi Tim Kami")}`
}

export function renderHubungi(l: Legal | null, app: string): string {
  const email = l?.support_email || "bantuan@geraiexpress.com"
  const waDigits = l?.support_whatsapp ? l.support_whatsapp.replace(/\D/g, "").replace(/^(62|0)/, "") : ""
  return `${pageHead("Hubungi kami", "Hubungi tim kemitraan &amp; bantuan agen paket", "Konsultasikan kesiapan titik jemput toko Anda, aktivasi domain Pro, atau kendala operasional gerai bersama tim kami.")}
<section class="sec tight"><div class="wrap contact2">
<section class="cpanel" aria-labelledby="mitra-title">
<h2 id="mitra-title">Calon Mitra &amp; Pemilik Gerai</h2>
<p>Tim kemitraan dan bantuan teknis menjawab pertanyaan pendaftaran, domain Pro, dan operasional gerai melalui saluran resmi berikut.</p>
<dl class="channels">
<div><dt>Email kemitraan &amp; bantuan</dt><dd><a href="mailto:${e(email)}">${e(email)}</a></dd></div>
${l?.privacy_contact_email ? `<div><dt>Kontak pelindungan data pribadi</dt><dd><a href="mailto:${e(l.privacy_contact_email)}">${e(l.privacy_contact_email)}</a></dd></div>` : ""}
${l?.legal_name ? `<div><dt>Penyelenggara</dt><dd>${e(l.legal_name)}</dd></div>` : ""}
${l?.registered_address ? `<div><dt>Alamat terdaftar</dt><dd>${e(l.registered_address)}</dd></div>` : ""}
</dl>
<div class="row">${waDigits ? `<a class="cta ghost" href="https://wa.me/62${e(waDigits)}" rel="noopener">${IC.chat} Chat WhatsApp Resmi</a>` : ""}<a class="cta" href="${e(app)}/daftar-akun">Ajukan Pendaftaran Gerai</a></div>
<p class="cp-note">Sudah punya gerai? <a href="${e(app)}/masuk">Masuk ke ruang kerja gerai</a>.</p>
</section>
<section class="cpanel" aria-labelledby="pengirim-title">
<h2 id="pengirim-title">Pengirim / Penerima Paket di Salah Satu Gerai</h2>
<p>Setiap gerai mitra melayani dan mengelola data kiriman pelanggannya sendiri. Untuk pertanyaan tentang paket Anda, hubungi gerai tempat Anda mengirim lewat kontak di situs gerai tersebut.</p>
<ul class="sqlist">
<li><span>Cek status paket di menu <strong>Lacak Paket</strong> pada situs gerai (<code>namagerai.geraimitra.com</code>) dengan nomor resi.</span></li>
<li><span>Rincian penerima hanya terbuka setelah verifikasi 4 angka terakhir nomor HP penerima.</span></li>
<li><span>Permintaan terkait data pribadi (UU PDP) yang sampai ke kami akan kami teruskan ke gerai terkait.</span></li>
</ul>
</section>
</div></section>
${closing(app, "/tanya-jawab", "Baca Tanya Jawab")}`
}

export function renderKetentuan(l: Legal | null, app: string): string {
  const brand = l?.brand_name || "GeraiExpress"
  return `${pageHead("Ketentuan layanan", "Ketentuan layanan perangkat lunak gerai mitra", "Mengatur hak dan tanggung jawab operasional antara penyelenggara platform dan pemilik gerai mitra.")}
<section class="sec tight"><div class="wrap prose">
<p>Ketentuan ini mengatur penggunaan layanan ${e(brand)}${l?.legal_name ? `, dioperasikan oleh ${e(l.legal_name)}` : ""}, oleh gerai mitra terdaftar.</p>
<h2>1. Peran perangkat lunak</h2>
<p>${e(brand)} menyediakan perangkat lunak meja kasir, pencetakan label/struk, halaman publik gerai, serta alat bantu rekonsiliasi data kiriman. Pengangkutan fisik paket dilakukan oleh perusahaan ekspedisi melalui akun seller Mengantar milik masing-masing gerai. Pembayaran ongkos kirim dari pelanggan loket diterima langsung oleh gerai; ${e(brand)} hanya menyediakan sistem pencatatannya.</p>
<h2>2. Kewajiban operasional gerai</h2>
<p>Pemilik gerai dan petugas kasir wajib memastikan fisik paket ditimbang dan diukur secara benar, isi kiriman bukan barang terlarang menurut hukum maupun aturan ekspedisi, identitas pengirim dan penerima dicatat akurat, serta tanda terima serah kurir disimpan secara tertib.</p>
<h2>3. Keamanan akun dan akses kasir</h2>
<p>Pemilik gerai bertanggung jawab menjaga kerahasiaan kata sandi, kunci API toko, dan Webhook Secret, serta segera mencabut akses anggota kasir yang sudah tidak bertugas di gerai.</p>
<h2>4. Pembaruan ketentuan</h2>
<p>Ketentuan layanan dapat disesuaikan mengikuti perkembangan regulasi pos, pelindungan data, dan fitur sistem. Versi yang berlaku selalu dipublikasikan secara terbuka pada halaman ini.</p>
</div></section>
${closing(app, "/hubungi-kami", "Hubungi Tim Kami")}`
}

export function renderPrivasi(l: Legal | null, app: string): string {
  const contact = l?.privacy_contact_email || l?.support_email || "bantuan@geraiexpress.com"
  return `${pageHead("Kebijakan privasi", "Kebijakan privasi &amp; pelindungan data kiriman", "Komitmen pengelolaan dan penyamaran data pribadi sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).")}
<section class="sec tight"><div class="wrap prose">
<p>Kami mengolah data pribadi pengirim, penerima paket, pemilik gerai, dan staf kasir semata-mata untuk menyelenggarakan pengiriman paket, penagihan COD, pengembalian barang retur, keamanan sistem, dan pemenuhan kewajiban hukum di Indonesia.</p>
<h2>1. Jenis data yang diolah</h2>
<p>Data meliputi nama dan kredensial akun mitra, alamat titik jemput gerai, nama serta nomor telepon pengirim dan penerima paket, alamat kecamatan tujuan, deskripsi barang, nilai COD, serta catatan pembayaran loket.</p>
<h2>2. Pelacakan publik yang aman privasi</h2>
<p>Halaman lacak resi publik pada domain gerai mitra dirancang tidak pernah membocorkan alamat jalan lengkap, nomor telepon utuh, maupun nilai uang COD kepada publik. Hanya inisial nama dan kota/kecamatan yang ditampilkan secara umum; rincian penerima hanya dapat dibuka dengan verifikasi 4 angka terakhir nomor telepon penerima.</p>
<h2>3. Penyimpanan dan pengamanan</h2>
<p>Data operasional tiap gerai diisolasi dalam basis data terpisah per gerai, rahasia kunci API dienkripsi dengan standar kriptografi terautentikasi (AEAD), dan sesi ruang kerja dilindungi cookie khusus host.</p>
<h2>4. Hak subjek data</h2>
<p>Untuk permintaan akses, koreksi data yang tidak akurat, atau pertanyaan terkait pemrosesan data pribadi, silakan hubungi petugas kami melalui <a href="mailto:${e(contact)}">${e(contact)}</a>.</p>
</div></section>
${closing(app, "/hubungi-kami", "Hubungi Tim Kami")}`
}
