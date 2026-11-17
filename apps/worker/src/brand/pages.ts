// Multi-page SSR marketing content for `geraiexpress.com` (`docs/visual/09` §4).
// Every claim reflects real v2 product mechanics; zero invented counters, zero decorative Sparkles,
// inline Lucide functional icons only, and zero API/network calls in interactive demos.
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

const IC = {
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  receipt: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
  printer: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>',
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  wallet: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>',
  truck: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>',
  globe: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
  box: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  qr: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></svg>',
  chat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
}

const closingBand = (app: string, secondHref: string, secondLabel: string) => `<section class="deep"><div class="wrap" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px">
<div><h2>Siap membuka loket kirim paket di toko Anda?</h2><p>Gunakan perangkat yang sudah ada di meja kasir. Pengajuan titik jemput ditinjau langsung dan akun ekspedisi terhubung otomatis.</p></div>
<div class="row" style="margin-top:0"><a class="cta inv" href="${e(app)}/daftar-akun">Daftar Gerai</a><a class="cta inv-ghost" href="${secondHref}">${e(secondLabel)}</a></div>
</div></section>`

export const HOME_SCRIPT = `<script defer src="/three.min.js"></script><script defer src="/hero-studio-3d.min.js"></script><script>
(function(){
  var L={jne:["JNE",47],jt:["J&T Express",93],sicepat:["SiCepat",71],sap:["SAP Express",29],lion:["Lion Parcel",106],anteraja:["Anteraja",67],idexpress:["iDexpress",24],pos:["Pos Indonesia",29],spx:["SPX Express",49]};
  var D=[
    {reg:[["lion","REGPACK","2–3 hari",10500],["jt","EZ","2–3 hari",11500],["sicepat","REG","1–2 hari",12000],["jne","REG","2–3 hari",12500]],cargo:[["jt","J&T Cargo","3–5 hari",42000],["jne","JTR Kargo","3–4 hari",46000],["sicepat","GOKIL","2–4 hari",48000]]},
    {reg:[["lion","REGPACK","2–3 hari",11000],["jne","REG","2–3 hari",12000],["sicepat","REG","1–2 hari",13000],["anteraja","Reguler","2–3 hari",13500]],cargo:[["jt","J&T Cargo","3–5 hari",45000],["lion","BIGPACK","3–4 hari",49000],["jne","JTR Kargo","3–4 hari",51000]]},
    {reg:[["sap","REG","2–4 hari",14500],["jt","EZ","2–3 hari",15500],["jne","REG","1–2 hari",16000],["idexpress","STD","2–4 hari",16500]],cargo:[["jt","J&T Cargo","4–6 hari",58000],["sicepat","GOKIL","3–5 hari",62000],["jne","JTR Kargo","3–5 hari",64000]]},
    {reg:[["pos","Pos Reguler","2–4 hari",17000],["jt","EZ","2–3 hari",18000],["spx","Standard","2–4 hari",18500],["sicepat","REG","1–2 hari",19500]],cargo:[["jt","J&T Cargo","4–6 hari",71000],["jne","JTR Kargo","4–6 hari",74000],["sicepat","GOKIL","3–5 hari",77000]]},
    {reg:[["jne","REG","3–5 hari",27000],["jt","EZ","3–5 hari",28500],["lion","REGPACK","3–4 hari",29000],["pos","Pos Reguler","4–6 hari",30500]],cargo:[["jne","JTR Kargo","5–8 hari",132000],["lion","BIGPACK","5–7 hari",139000],["pos","Pos Kargo","6–9 hari",146000]]}
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
      var tags=(i===0?'<span class="pill-ok">Termurah</span>':"")+(i===fast&&i!==0?'<span class="pill-bl">Tercepat</span>':"");
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
    else if(e.key==="Escape"){e.preventDefault();close(true)}
    else if(e.key==="Tab"){close(false)}
  });
  opts.forEach(function(o,i){o.addEventListener("mousemove",function(){if(hl!==i)setHl(i)});o.addEventListener("click",function(){pick(i)})});
  document.addEventListener("pointerdown",function(e){if(!box.hidden&&!e.target.closest(".sel"))close(false)});
  bReg.addEventListener("click",function(){mode="reg";render()});
  bCar.addEventListener("click",function(){mode="cargo";render()});
  render();
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

<div class="glass-surface stage-pill"><span class="stage-dot"></span><span>Diskon Kirim Mitra s/d</span><span class="stage-off">25% OFF</span></div>

<div id="hudControls">
<div class="glass-surface hud-bar">
<button type="button" id="togglePlayBtn" aria-label="Jeda atau putar animasi 3D" title="Jeda / Putar">
<svg id="iconPause" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2" y="1.5" width="3" height="9" rx="1"/><rect x="7" y="1.5" width="3" height="9" rx="1"/></svg>
<svg id="iconPlay" class="hidden" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2.8 1.5L10.2 6L2.8 10.5V1.5Z"/></svg>
</button>
<div class="hud-tabs" role="group" aria-label="Tahapan alur kemitraan">
<button type="button" data-act="0" class="step-tab active">01 Daftar</button>
<button type="button" data-act="1" class="step-tab">02 KYC</button>
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
<p class="lead">Satu meja kasir untuk konter pulsa, fotokopi, toko kelontong, dan ruko jasa: bandingkan tarif 9 ekspedisi mitra Mengantar, Reguler maupun Kargo, cetak resi thermal 100 mm, kelola kiriman COD, dan cocokkan saldo Mengantar otomatis sampai rupiah terakhir.</p>
<div class="row">
<a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai</a>
<a class="cta ghost" href="/simulasi-kasir">Coba Simulasi Kasir</a>
</div>
<ul class="trust-pills">
<li>${IC.check}<span>Tanpa sewa mesin khusus</span></li>
<li>${IC.check}<span>Situs publik <strong>namatoko.geraimitra.com</strong> gratis</span></li>
<li>${IC.check}<span>Akun kasir &amp; pemilik terpisah aman</span></li>
</ul>
</div>
<aside class="demo-box" aria-labelledby="demo-title">
<div class="demo-top"><h2 id="demo-title" class="demo-title">Pratinjau cek tarif loket</h2><span class="pill-bl">Data contoh</span></div>
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
</aside>
</div></section>

<section class="partners" aria-labelledby="partners-title"><div class="wrap">
<div class="partners-head"><h2 id="partners-title" class="partners-title">Ekspedisi partner kami</h2><p class="partners-sub">Terhubung resmi lewat jaringan Mengantar. Satu akun gerai, sembilan ekspedisi.</p></div>
<ul class="pgrid">
<li class="pbadge">${courierImg("jne", 28)}</li>
<li class="pbadge">${courierImg("jt", 28)}</li>
<li class="pbadge">${courierImg("sicepat", 28)}</li>
<li class="pbadge">${courierImg("sap", 28)}</li>
<li class="pbadge">${courierImg("lion", 28)}</li>
<li class="pbadge">${courierImg("anteraja", 28)}</li>
<li class="pbadge">${courierImg("idexpress", 28)}</li>
<li class="pbadge">${courierImg("pos", 28)}</li>
<li class="pbadge">${courierImg("spx", 28)}</li>
</ul>
</div></section>

<section class="sec band"><div class="wrap">
<div class="shead"><h2>Enam masalah meja loket yang langsung beres</h2><p class="sub">Dirancang dari alur kerja nyata agen pengiriman harian—bukan sekadar formulir pembuatan resi.</p></div>
<div class="grid3">
<article class="card"><span class="ic">${IC.receipt}</span><h3>Struk pelanggan jujur</h3><p>Harga di layar kasir dan struk selalu tarif publik resmi. Kasir mencatat pembayaran Tunai, QRIS gerai, atau Transfer tanpa melihat diskon modal pemilik.</p></article>
<article class="card"><span class="ic">${IC.printer}</span><h3>Cetak thermal 100 mm &amp; 58 mm</h3><p>Cetak label resi 100×150 mm lengkap dengan potongan struk dari laptop/PC lewat printer thermal standar, atau struk 58 mm Bluetooth dari HP Android.</p></article>
<article class="card"><span class="ic">${IC.shield}</span><h3>Kirim atas nama toko online</h3><p>Reseller dan dropshipper mencetak nama tokonya sendiri di label penerima, sementara alamat pengembalian paket retur tetap aman mengarah ke gerai Anda.</p></article>
<article class="card"><span class="ic">${IC.wallet}</span><h3>Rekonsiliasi keuangan dua buku</h3><p>Uang kas loket terpisah rapi dari mutasi tagihan akun Mengantar. COD cair dicocokkan per nomor resi dan laba kas dihitung saat dana benar-benar masuk.</p></article>
<article class="card"><span class="ic">${IC.truck}</span><h3>Pickup kurir &amp; Meja Retur</h3><p>Pindai barcode paket per ekspedisi sebelum kurir tanda tangan Surat Jalan. Paket retur yang kembali disimpan tertib dan diambil pengirim memakai PIN WhatsApp.</p></article>
<article class="card"><span class="ic">${IC.globe}</span><h3>Halaman publik gerai gratis</h3><p>Setiap mitra mendapat situs <strong>namagerai.geraimitra.com</strong> untuk cek ongkir mandiri, isi alamat dari rumah dengan QR 48 jam, dan lacak paket aman privasi.</p></article>
</div>
<p class="next-links"><a href="/fitur">Pelajari seluruh fitur kasir &amp; keuangan →</a><a href="/ekspedisi">Lihat daftar ekspedisi yang didukung →</a></p>
</div></section>

<section class="sec"><div class="wrap grid2" style="gap:28px;align-items:start">
<div class="card">
<h2>Dukungan multi-ekspedisi Reguler, Ekonomi, Kargo &amp; COD</h2>
<p>Melalui integrasi resmi akun seller Mengantar milik masing-masing gerai, pelanggan Anda bebas memilih layanan tercepat atau paling hemat dari satu loket:</p>
<ul class="chk">
<li>${IC.check}<span><strong>Reguler &amp; Ekonomi:</strong> J&amp;T Express (EZ &amp; Eco), JNE REG, SiCepat REG, SAP Express &amp; SAP Lite, Lion Parcel, iDexpress, Anteraja, Pos Indonesia, dan SPX.</span></li>
<li>${IC.check}<span><strong>Kargo mulai 5 kg:</strong> J&amp;T Cargo, JNE JTR, SiCepat GOKIL, Lion BIGPACK, dan iDtruck lengkap dengan hitung dimensi volumetrik otomatis.</span></li>
<li>${IC.check}<span><strong>Kiriman COD &amp; Non-COD:</strong> validasi otomatis batas nilai COD per kurir dan perlindungan cadangan ongkir retur pada perhitungan Saldo Aman.</span></li>
</ul>
<p class="next-links"><a href="/ekspedisi">Tabel lengkap ekspedisi &amp; aturan layanan →</a></p>
</div>
<div class="card">
<h2>Cukup gunakan peralatan toko yang sudah ada</h2>
<p>Tidak ada paksaan membeli paket perangkat keras eksklusif atau sewa mesin bulanan. Anda bisa langsung mulai melayani kiriman harian dengan tiga alat umum:</p>
<ul class="chk">
<li>${IC.check}<span><strong>Laptop, PC, atau HP Android:</strong> ruang kerja berbasis web ringan yang nyaman di layar komputer meja kasir maupun ponsel.</span></li>
<li>${IC.check}<span><strong>Timbangan digital meja (30–50 kg):</strong> input berat presisi dalam satuan gram (bawaan 1.000 gram) dan sentimeter dimensi volumetrik paket.</span></li>
<li>${IC.check}<span><strong>Printer thermal 100 mm atau 58 mm:</strong> mendukung semua merek printer label USB/LAN di Windows &amp; macOS serta printer struk Bluetooth.</span></li>
</ul>
<p class="next-links"><a href="/cara-kerja">Panduan cara daftar &amp; spesifikasi alat →</a><a href="/tanya-jawab">Baca tanya jawab calon mitra →</a></p>
</div>
</div></section>
${closingBand(app, "/biaya-dan-paket", "Lihat Biaya & Skema Mitra")}`
}

export function renderFitur(app: string): string {
  return `<div class="wrap phead">
<h1>Fitur kasir loket, cetak resi &amp; keuangan agen</h1>
<p class="lead">Enam modul terpadu yang memisahkan tugas cepat kasir di depan pelanggan dari pengawasan margin, saldo, dan rekonsiliasi milik pemilik gerai.</p>
</div>

<section class="sec band"><div class="wrap">
<div class="shead"><h2>Operasional meja depan hingga pembukuan belakang</h2><p class="sub">Setiap layar dirancang agar transaksi satu paket selesai dalam hitungan detik tanpa salah ketik alamat maupun salah serah kurir.</p></div>
<div class="grid3">
<article class="card"><span class="ic">${IC.box}</span><h3>1. Kasir Satu Layar &amp; Cek Cepat</h3><p>Layar kasir terbagi 60/40 di komputer: isi pengirim, penerima, berat gram, dimensi volumetrik, dan packing tambahan di kiri; ringkasan tagihan serta tombol terbitkan resi terkunci rapi di kanan.</p></article>
<article class="card"><span class="ic">${IC.qr}</span><h3>2. Kirim dari Rumah (QR INV)</h3><p>Pelanggan mengisi alamat dari rumah lewat situs gerai Anda dan membawa kode QR <code>INV</code> ke loket. Kasir cukup memindai QR, menimbang ulang paket, menerima pembayaran, lalu mencetak label.</p></article>
<article class="card"><span class="ic">${IC.printer}</span><h3>3. Paket Massal CSV (200 Baris)</h3><p>Pelanggan toko online yang mengirim puluhan paket sekaligus dapat mengunggah berkas CSV, memperbaiki baris alamat yang kurang tepat di layar pratinjau, lalu menerbitkan dan mencetak resi massal.</p></article>
<article class="card"><span class="ic">${IC.truck}</span><h3>4. Pickup &amp; Surat Jalan Kurir</h3><p>Saat kurir datang menjemput sore hari, kasir memindai resi per ekspedisi. Paket milik kurir lain langsung ditolak bunyi peringatan agar tidak pernah tertukar truk penjemput.</p></article>
<article class="card"><span class="ic">${IC.shield}</span><h3>5. Meja Retur &amp; Klaim Kendala</h3><p>Paket gagal kirim yang kembali ke gerai dicatat ke Meja Retur dan menghasilkan Kode Ambil bagi pengirim asli. Paket terlambat, rusak, atau hilang dipantau tenggat klaimnya.</p></article>
<article class="card"><span class="ic">${IC.wallet}</span><h3>6. Keuangan Dua Buku &amp; Peran Aman</h3><p>Akun Kasir hanya menampilkan harga jual pelanggan. Akun Pemilik menampilkan Saldo Aman (setelah cadangan ongkir retur), mutasi Mengantar, laba per kiriman, dan selisih sinkronisasi.</p></article>
</div>
</div></section>

<section class="sec"><div class="wrap grid2" style="gap:28px;align-items:start">
<div class="card">
<h2>Format cetak loket fleksibel</h2>
<p>Pilih satu dari empat format cetak sesuai printer yang tersedia di meja kasir Anda:</p>
<ul class="chk">
<li>${IC.check}<span><strong>Label 100×150 mm + Struk Sobek:</strong> bagian atas ditempel ke paket (barcode AWB + QR lacak), bagian bawah disobek untuk bukti bayar pelanggan.</span></li>
<li>${IC.check}<span><strong>Label 100×100 mm atau 100×150 mm Penuh:</strong> standar stiker thermal pengiriman marketplace dan kargo.</span></li>
<li>${IC.check}<span><strong>Roll Thermal 58 mm:</strong> cetak label tempel dan struk pelanggan berurutan dengan garis potong jelas dari printer saku Bluetooth.</span></li>
</ul>
<p class="note">Cetak pertama tercatat otomatis; cetak ulang resi memerlukan alasan singkat agar riwayat audit loket tetap terjaga.</p>
</div>
<div class="card">
<h2>API Toko &amp; Konektor MCP</h2>
<p>Bagi gerai yang juga melayani gudang grosir atau sistem kasir internal toko sendiri, pemilik gerai dapat menerbitkan kunci API berbatas kuota harian (<code>/api/v1</code>) maupun titik akses MCP untuk otomasi cek tarif dan pembuatan draf kiriman.</p>
<p class="next-links"><a href="/simulasi-kasir">Coba langsung simulasi meja kasir →</a><a href="/ekspedisi">Periksa dukungan ekspedisi →</a></p>
</div>
</div></section>
${closingBand(app, "/simulasi-kasir", "Coba Simulasi Kasir")}`
}

export function renderEkspedisi(app: string): string {
  const rows: Array<[string, string, string, string]> = [
    ["jt", "EZ (Reguler), J&T Eco", "J&T Cargo (≥ 5 kg)", "Non-COD & COD"],
    ["jne", "REG (Reguler)", "JTR Kargo (≥ 5 kg)", "Non-COD & COD"],
    ["sicepat", "REG (Reguler)", "GOKIL Kargo (≥ 5 kg)", "Non-COD, COD & DG tertentu"],
    ["sap", "REG, SAP Lite (Ekonomi)", "Kargo Darat", "Non-COD & COD"],
    ["lion", "REGPACK", "BIGPACK Kargo", "Non-COD & COD"],
    ["idexpress", "STD (Reguler)", "iDtruck Kargo", "Non-COD, COD & DG tertentu"],
    ["anteraja", "Reguler", "Kargo", "Non-COD & COD (wajib nilai barang)"],
    ["pos", "Pos Reguler", "Pos Kargo", "Non-COD & COD (batas rasio COD)"],
    ["spx", "Standard", "—", "Non-COD & COD (wajib nilai barang)"],
  ]
  return `<div class="wrap phead">
<h1>Daftar ekspedisi reguler, kargo &amp; layanan COD</h1>
<p class="lead">Layani berbagai kebutuhan kirim paket warga sekitar dan penjual online dari satu akun gerai—mulai dokumen ringan 1 kg hingga karung kargo puluhan kilogram.</p>
</div>

<section class="sec band"><div class="wrap">
<ul class="pgrid" style="margin-bottom:28px" aria-label="Sembilan ekspedisi mitra Mengantar">${Object.keys(COURIERS).map((k) => `<li class="pbadge">${courierImg(k, 28)}</li>`).join("")}</ul>
<div class="shead"><h2>Jaringan kurir dalam satu layar perbandingan</h2><p class="sub">Pemilik gerai bebas mengaktifkan atau menonaktifkan ekspedisi sesuai jadwal kurir penjemput terbaik di kecamatan masing-masing.</p></div>
<div class="tbl-wrap"><table class="tbl">
<thead><tr><th scope="col">Ekspedisi</th><th scope="col">Layanan Reguler &amp; Ekonomi</th><th scope="col">Layanan Kargo</th><th scope="col">Dukungan Pembayaran &amp; Catatan</th></tr></thead>
<tbody>${rows.map(([k, reg, car, cod]) => `<tr><td><span class="tcour"><span class="tlogo">${courierImg(k!, 24, true)}</span><strong>${e(COURIERS[k!]!.name)}</strong></span></td><td>${e(reg)}</td><td>${e(car)}</td><td>${e(cod)}</td></tr>`).join("")}</tbody>
</table></div>
<p class="note">Ketersediaan rute kecamatan asal ke tujuan dan jadwal penjemputan mengikuti cakupan aktif jaringan Mengantar pada titik jemput gerai Anda.</p>
</div></section>

<section class="sec"><div class="wrap grid3">
<article class="card"><h3>Aturan berat &amp; volumetrik</h3><p>Sistem menghitung otomatis mana yang lebih besar antara berat timbangan aktual dan berat volumetrik dimensi kotak (pembagi <code>6.000</code> untuk reguler dan <code>4.000</code> untuk kargo) agar gerai tidak merugi akibat selisih berat tagihan kurir.</p></article>
<article class="card"><h3>Validasi batas COD otomatis</h3><p>Setiap ekspedisi memiliki batas maksimum nilai tagihan COD dan ketentuan nilai barang (misalnya batas rasio ongkir terhadap nilai COD pada Pos Indonesia). Meja kasir memfilter otomatis sebelum resi diterbitkan.</p></article>
<article class="card"><h3>Penanda barang berbahaya (DG)</h3><p>Kiriman yang mengandung baterai, cairan, parfum, atau aerosol dapat ditandai di kasir sehingga sistem hanya menampilkan ekspedisi yang mengizinkan jalur pengiriman tersebut.</p></article>
</div>
<p class="wrap next-links"><a href="/cara-kerja">Lihat cara menghubungkan titik jemput gerai →</a><a href="/biaya-dan-paket">Pelajari skema diskon ongkir per kurir →</a></p>
</section>
${closingBand(app, "/simulasi-kasir", "Coba Cek Tarif Contoh")}`
}

export function renderCaraKerja(app: string): string {
  return `<div class="wrap phead">
<h1>Cara daftar &amp; peralatan buka loket kirim paket</h1>
<p class="lead">Proses pendaftaran dirancang lugas tanpa biaya waralaba puluhan juta. Dari pengajuan lokasi sampai siap menerima paket pelanggan dalam lima tahap jelas.</p>
</div>

<section class="sec band"><div class="wrap">
<div class="shead"><h2>Lima langkah menjadi gerai aktif</h2><p class="sub">Setiap gerai memiliki akun pengiriman resmi atas nama usahanya sendiri sehingga mutasi saldo dan pencairan COD transparan.</p></div>
<ol class="steps">
<li><span class="step-no">1</span><div><h3>Daftar akun &amp; ajukan titik jemput</h3><p style="margin:0;color:var(--muted)">Buat akun pemilik di GeraiExpress, pilih nama alamat gerai (misalnya <code>berkahjaya.geraimitra.com</code>), lalu isi alamat lengkap toko beserta kontak penanggung jawab penjemputan kurir.</p></div></li>
<li><span class="step-no">2</span><div><h3>Tinjauan lokasi &amp; pembukaan akun Mengantar</h3><p style="margin:0;color:var(--muted)">Tim kami memeriksa kelengkapan titik jemput. Begitu disetujui, akun seller Mengantar untuk gerai Anda dibuat dan dihubungkan secara otomatis.</p></div></li>
<li><span class="step-no">3</span><div><h3>Tempel URL webhook &amp; atur printer</h3><p style="margin:0;color:var(--muted)">Ikuti panduan tiga langkah di menu Pengaturan untuk menyalin Webhook Secret agar status perjalanan paket diperbarui otomatis, lalu pilih ukuran kertas printer loket Anda.</p></div></li>
<li><span class="step-no">4</span><div><h3>Isi saldo kiriman &amp; terima pelanggan</h3><p style="margin:0;color:var(--muted)">Top-up saldo di akun Mengantar untuk melayani kiriman Non-COD. Pelanggan datang membawa paket (atau QR dari rumah), kasir menimbang, menerima uang tunai/QRIS, dan menempel label resi.</p></div></li>
<li><span class="step-no">5</span><div><h3>Serah terima pickup sore &amp; rekonsiliasi</h3><p style="margin:0;color:var(--muted)">Pindai paket per kurir pada menu Pickup &amp; Surat Jalan saat kurir tiba. Pantau pencairan COD dan laba bersih harian pada menu Keuangan pemilik.</p></div></li>
</ol>
</div></section>

<section class="sec"><div class="wrap">
<div class="shead"><h2>Spesifikasi peralatan meja loket yang disarankan</h2><p class="sub">Gunakan merek apa pun yang mudah dibeli di kota Anda—tidak ada penguncian merek perangkat keras.</p></div>
<div class="tbl-wrap"><table class="tbl">
<thead><tr><th scope="col">Perangkat</th><th scope="col">Spesifikasi Minimum</th><th scope="col">Rekomendasi Meja Kasir Harian</th></tr></thead>
<tbody>
<tr><td><strong>Perangkat Kasir</strong></td><td>HP Android (Chrome terbaru) + koneksi internet stabil</td><td>Laptop atau PC meja kasir layar ≥ 13 inci agar tampilan kasir 60/40 dan tabel kiriman leluasa</td></tr>
<tr><td><strong>Timbangan Paket</strong></td><td>Timbangan digital dapur/meja kapasitas 10–30 kg</td><td>Timbangan duduk digital 30–50 kg (ketelitian 5–10 gram) + meteran gulung untuk ukur paket besar</td></tr>
<tr><td><strong>Printer Resi</strong></td><td>Printer struk thermal Bluetooth 58 mm (kertas roll biasa)</td><td>Printer barcode thermal langsung (<em>direct thermal</em>) lebar 100 mm (stiker A6 100×150 mm USB/LAN)</td></tr>
<tr><td><strong>Pemindai Kode</strong></td><td>Kamera HP/webcam bawaan browser</td><td>Barcode/QR scanner 2D USB murah untuk mempercepat pindai QR draf dan manifest pickup sore</td></tr>
</tbody>
</table></div>
<p class="next-links"><a href="/biaya-dan-paket">Lihat rincian biaya pendaftaran &amp; komisi →</a><a href="/tanya-jawab">Pertanyaan umum seputar syarat lokasi →</a></p>
</div></section>
${closingBand(app, "/tanya-jawab", "Baca Tanya Jawab Mitra")}`
}

export function renderBiaya(app: string): string {
  return `<div class="wrap phead">
<h1>Biaya pendaftaran &amp; skema komisi mitra loket</h1>
<p class="lead">Informasi biaya dan pembagian margin kami buka sejak awal agar pemilik toko dapat menghitung perputaran modal loket secara realistis.</p>
</div>

<section class="sec band"><div class="wrap">
<div class="shead"><h2>Pilihan paket ruang kerja gerai</h2><p class="sub">Mulai tanpa biaya langganan bulanan perangkat lunak; tingkatkan ke domain toko sendiri hanya bila dibutuhkan.</p></div>
<div class="grid2">
<article class="card">
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><h3>Mitra Gerai Standar</h3><span class="num" style="font-size:1.35rem">Rp 0 <span style="font-size:.85rem;font-weight:500;color:var(--muted)">pendaftaran software</span></span></div>
<p>Seluruh fitur operasional kasir, multi-ekspedisi, dan keuangan untuk loket baru maupun konter yang sudah berjalan.</p>
<ul class="chk">
<li>${IC.check}<span>Kasir kiriman satuan, paket massal CSV, cek ongkir &amp; cek resi tanpa batas menu</span></li>
<li>${IC.check}<span>Cetak PDF thermal 100 mm &amp; struk Bluetooth 58 mm</span></li>
<li>${IC.check}<span>Akun pemilik + undangan akun kasir terpisah (tanpa bocor angka margin)</span></li>
<li>${IC.check}<span>Halaman publik gratis <strong>namagerai.geraimitra.com</strong> dengan QR kirim dari rumah</span></li>
<li>${IC.check}<span>Sinkronisasi mutasi saldo, pelacak COD cair, dan Meja Retur</span></li>
</ul>
<div class="row"><a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai Standar</a></div>
</article>
<article class="card" style="border-color:#93C5FD">
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px"><h3>Opsi Domain Sendiri (Pro)</h3><span class="pill-bl">Tambahan Opsional</span></div>
<p>Untuk gerai mapan yang ingin memakai nama domain komersial milik sendiri pada situs publik dan tautan lacak struk pelanggan.</p>
<ul class="chk">
<li>${IC.check}<span>Mencakup seluruh fasilitas Mitra Gerai Standar</span></li>
<li>${IC.check}<span>Hubungkan domain milik sendiri (misalnya <code>kirim.tokoberkah.com</code> atau <code>tokoberkah.id</code>)</span></li>
<li>${IC.check}<span>Sertifikat keamanan SSL/HTTPS diterbitkan dan diperpanjang otomatis di tepi jaringan Cloudflare</span></li>
<li>${IC.check}<span>Pengalihan otomatis <code>www</code> ke domain utama dan pemantauan kesehatan DNS berkala</span></li>
<li>${IC.check}<span>Akses kunci API toko &amp; konektor MCP berbatas kuota harian</span></li>
</ul>
<div class="row"><a class="cta ghost" href="/hubungi-kami">Tanyakan Aktivasi Domain Pro</a></div>
</article>
</div>
</div></section>

<section class="sec"><div class="wrap grid2" style="gap:28px;align-items:start">
<div class="card">
<h2>Bagaimana gerai mendapatkan keuntungan?</h2>
<p>Pendapatan utama gerai berasal dari <strong>selisih diskon ongkos kirim mitra</strong> pada setiap resi yang diberangkatkan, ditambah layanan tambahan milik toko sendiri:</p>
<ol class="chk" style="margin-top:10px">
<li>${IC.check}<span><strong>1. Margin diskon ongkir ekspedisi:</strong> Pelanggan di loket membayar tarif publik resmi (misalnya Rp 20.000). Akun gerai memperoleh potongan diskon mitra per kurir (umumnya berkisar 20%–30% mengikuti kebijakan masing-masing ekspedisi di Mengantar), sehingga saldo yang terpotong lebih rendah dari uang tunai yang diterima di laci kasir.</span></li>
<li>${IC.check}<span><strong>2. Penjualan packing &amp; biaya layanan loket:</strong> Gerai bebas menetapkan daftar harga bubble wrap, kardus, lakban, atau biaya jasa loket resmi yang langsung tercantum rapi di struk pelanggan.</span></li>
</ol>
</div>
<div class="card">
<h2>Modal saldo kerja yang perlu disiapkan</h2>
<p>GeraiExpress tidak menahan uang deposit Anda. Saldo pengiriman diisi langsung oleh pemilik gerai pada akun seller Mengantar masing-masing:</p>
<ul class="chk">
<li>${IC.check}<span><strong>Kiriman Non-COD:</strong> membutuhkan saldo Mengantar aktif sebesar ongkir bersih mitra saat resi diterbitkan; Anda menerima uang tunai penuh dari pelanggan di meja kasir saat itu juga.</span></li>
<li>${IC.check}<span><strong>Kiriman COD:</strong> ongkos kirim dipotong otomatis saat dana COD cair dari kurir, namun kami menyarankan menjaga Saldo Aman untuk mengantisipasi cadangan ongkir bila ada paket retur ditolak penerima.</span></li>
</ul>
<p class="next-links"><a href="/simulasi-kasir">Uji hitungan struk di Simulasi Kasir →</a><a href="/tanya-jawab">Baca FAQ pencairan COD →</a></p>
</div>
</div></section>
${closingBand(app, "/cara-kerja", "Pelajari Cara Daftar")}`
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
        var tag=idx===0?' <span class="pill-ok">Termurah</span>':(r.eta==="1–2 hari"?' <span class="pill-bl">Tercepat</span>':"");
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

export function renderSimulasi(app: string): string {
  return `<div class="wrap phead" style="padding-bottom:24px">
<h1>Simulasi meja kasir &amp; struk agen kirim paket</h1>
<p class="lead">Uji kecepatan alur kasir GeraiExpress dengan data sintetis. Tanpa perlu mendaftar akun dan tanpa membuat tagihan ekspedisi sungguhan.</p>
</div>
<section class="sec band" style="padding-top:32px"><div class="wrap sim">
<form class="card" id="sim" onsubmit="return false">
<h2 style="font-size:1.25rem;margin:0">1. Rincian paket pelanggan</h2>
<label for="kota">Kota tujuan</label>
<select id="kota">${SIM_CITIES.map(([c], i) => `<option value="${i}">${e(c)}</option>`).join("")}</select>
<label for="berat">Berat (gram)</label>
<input id="berat" inputmode="numeric" value="1000">
<div style="display:flex;flex-wrap:wrap;gap:6px">
<button type="button" class="cta sm ghost" data-w="1000">1.000 g (1 kg)</button>
<button type="button" class="cta sm ghost" data-w="2500">2.500 g (3 kg)</button>
<button type="button" class="cta sm ghost" data-w="12000">12.000 g (Kargo)</button>
</div>
<div class="grid2" style="gap:12px">
<div><label for="cod">Jenis layanan</label><select id="cod"><option value="0">Non-COD (Bayar di loket)</option><option value="150000">COD Barang Rp 150.000</option></select></div>
<div><label for="pack">Packing tambahan</label><select id="pack"><option value="0">Tanpa packing</option><option value="3000">Bubble wrap (+Rp 3.000)</option><option value="7000">Kardus baru (+Rp 7.000)</option></select></div>
</div>
<label for="bayar">Cara bayar di loket</label>
<select id="bayar"><option>Tunai</option><option>QRIS gerai</option><option>Transfer</option></select>
<h2 style="font-size:1.2rem;margin:14px 0 4px">2. Pilih ekspedisi</h2>
<ul class="rates" id="rates"></ul>
</form>
<div class="sim-sticky">
<div class="card">
<h2 style="font-size:1.25rem;margin:0">3. Hasil cetak di meja kasir</h2>
<p style="margin:0;font-size:.9rem;color:var(--muted)">Klik salah satu harga ekspedisi untuk menerbitkan contoh struk pelanggan dan pratinjau label tempel 100 mm.</p>
<div class="receipt" id="struk" aria-live="polite">Pilih ekspedisi untuk melihat struk.</div>
<div class="lbl-preview" aria-label="Pratinjau label tempel paket">
<div style="display:flex;justify-content:space-between;gap:8px;font-weight:700;color:var(--navy)"><span id="lbl-meta">Label Thermal 100×150 mm</span><span class="pill-bl">Contoh AWB</span></div>
<div class="lbl-bar" aria-hidden="true"></div>
<p id="lbl-dest" style="margin:0;color:var(--muted);font-size:.85rem">Barcode resi kurir dan QR lacak tercetak siap tempel ke paket.</p>
</div>
<div class="row" style="margin-top:12px"><a class="cta" href="${e(app)}/daftar-akun">Daftar Gerai Sekarang</a><a class="cta ghost" href="/fitur">Lihat Semua Fitur</a></div>
</div>
</div>
</div></section>`
}

export function renderTanyaJawab(app: string): string {
  const groups: Array<[string, Array<[string, string]>]> = [
    [
      "Pendaftaran, Lokasi & Peralatan",
      [
        ["Apakah harus menyewa ruko besar di jalan raya untuk mendaftar?", "Tidak wajib ruko besar. Konter pulsa, fotokopi, toko kelontong, koperasi, maupun usaha rumahan yang memiliki akses masuk motor/mobil kurir penjemput dan jam buka jelas dapat mengajukan pendaftaran titik jemput."],
        ["Apakah saya harus membeli printer atau timbangan khusus dari GeraiExpress?", "Tidak. Anda bebas memakai laptop/HP Android, timbangan digital, dan printer thermal 100 mm atau 58 mm merek apa saja yang sudah Anda miliki atau beli sendiri di toko komputer terdekat."],
        ["Berapa lama pengajuan gerai ditinjau sampai bisa beroperasi?", "Setelah formulir titik jemput dikirim dan email terverifikasi, tim kami meninjau kelayakan alamat penjemputan. Begitu disetujui, akun pengiriman Mengantar dibuat otomatis dan Anda langsung dapat masuk ke ruang kerja kasir."],
        ["Apa fungsi halaman namagerai.geraimitra.com yang didapat setiap mitra?", "Halaman tersebut adalah situs resmi toko Anda sendiri (tanpa bercampur nama gerai lain) yang bisa dibagikan ke grup WhatsApp lingkungan agar pelanggan dapat cek ongkir, mengisi data paket dari rumah menjadi kode QR, dan melacak resi."],
      ],
    ],
    [
      "Saldo, Komisi Ongkir & Pencairan COD",
      [
        ["Dari mana keuntungan pemilik gerai berasal?", "Pelanggan di loket membayar tarif pengiriman publik resmi sesuai struk, sedangkan saldo pengiriman gerai hanya dipotong tarif bersih setelah diskon mitra ekspedisi. Selisih diskon tersebut—ditambah jasa packing bila ada—menjadi laba kotor loket Anda."],
        ["Bagaimana alur uang untuk paket COD (Bayar di Tempat)?", "Penerima membayar harga barang plus biaya layanan COD kepada kurir pengantar saat paket tiba. Setelah status paket Terkirim dan dana cair ke mutasi akun Mengantar gerai, sistem mencocokkan nilai pencairan per nomor resi secara otomatis."],
        ["Apa yang dimaksud dengan indikator Saldo Aman di menu Keuangan?", "Saldo Aman adalah saldo akun Mengantar dikurangi estimasi cadangan biaya ongkir pergi-pulang untuk kiriman COD yang masih dalam perjalanan, sehingga pemilik gerai tahu berapa dana yang benar-benar bebas ditarik tanpa mengganggu operasional."],
        ["Apakah karyawan kasir saya bisa melihat besaran diskon modal dan saldo pemilik?", "Tidak bisa. Akun dengan peran Kasir disaring di tingkat server sehingga hanya menerima tarif publik pelanggan dan ringkasan pembayaran loket; angka modal, persentase diskon kurir, mutasi Mengantar, dan laba bersih khusus untuk akun Pemilik."],
      ],
    ],
    [
      "Operasional Harian, Dropship & Penanganan Retur",
      [
        ["Bisakah pelanggan online shop mengirim paket atas nama tokonya sendiri?", "Bisa. Fitur penyamaran pengirim tiga pihak memungkinkan label paket mencantumkan nama dan kontak toko reseller/dropshipper untuk penerima, namun alamat fisik pengembalian retur di sistem kurir tetap terkunci kembali ke gerai Anda."],
        ["Bagaimana jika penerima menolak paket dan kiriman dikembalikan (retur)?", "Saat paket retur tiba kembali di gerai, kasir memindainya ke Meja Retur. Sistem mencatat posisi rak dan membuat Kode Ambil unik untuk dikirim ke pengirim asli agar penyerahan barang retur tercatat sah."],
        ["Bagaimana cara mencegah paket salah diserahkan ke kurir ekspedisi lain?", "Gunakan menu Pickup & Surat Jalan sebelum menyerahkan tumpukan paket sore hari. Ketika kasir memilih kurir (misalnya J&T), pemindaian barcode resi milik ekspedisi lain akan langsung ditolak di layar."],
        ["Apakah data nomor HP penerima aman pada halaman lacak publik?", "Sangat aman. Halaman lacak publik hanya menampilkan inisial nama serta kota/kecamatan sesuai prinsip pelindungan data pribadi (UU PDP). Rincian lengkap hanya terbuka apabila pelacak memasukkan 4 digit terakhir nomor HP penerima yang tepat."],
      ],
    ],
  ]
  return `<div class="wrap phead">
<h1>Tanya jawab syarat &amp; operasional agen paket</h1>
<p class="lead">Jawaban lugas atas pertanyaan yang paling sering diajukan pemilik konter dan toko sebelum membuka loket pengiriman multi-ekspedisi.</p>
</div>
<section class="sec band"><div class="wrap" style="display:grid;gap:36px">
${groups
  .map(
    ([title, items]) => `<div><h2 style="font-size:1.35rem;margin-bottom:14px">${e(title)}</h2><div class="faq">${items
      .map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${e(q)}</summary><p class="ans">${e(a)}</p></details>`)
      .join("")}</div></div>`,
  )
  .join("")}
<p class="next-links" style="margin-top:0"><a href="/hubungi-kami">Masih ada pertanyaan khusus? Hubungi tim kami →</a><a href="/simulasi-kasir">Coba simulasi meja kasir →</a></p>
</div></section>
${closingBand(app, "/biaya-dan-paket", "Lihat Skema Komisi")}`
}

export function renderHubungi(l: Legal | null, app: string): string {
  const email = l?.support_email || "bantuan@geraiexpress.com"
  const waDigits = l?.support_whatsapp ? l.support_whatsapp.replace(/\D/g, "").replace(/^(62|0)/, "") : ""
  return `<div class="wrap phead">
<h1>Hubungi tim kemitraan &amp; bantuan agen paket</h1>
<p class="lead">Konsultasikan kesiapan titik jemput toko Anda, aktivasi domain kustom Pro, atau kendala operasional gerai bersama tim kami.</p>
</div>
<section class="sec band"><div class="wrap grid2" style="align-items:start">
<div class="card">
<h2>Saluran komunikasi resmi</h2>
<p>Tim kemitraan dan bantuan teknis melayani pada hari kerja (Senin–Sabtu, pukul 08.30–17.30 WIB).</p>
<dl style="margin:12px 0 0;display:grid;gap:12px;font-size:.975rem">
<div><dt style="font-weight:650;color:var(--navy)">Email Kemitraan &amp; Bantuan</dt><dd style="margin:2px 0 0"><a href="mailto:${e(email)}">${e(email)}</a></dd></div>
${l?.privacy_contact_email ? `<div><dt style="font-weight:650;color:var(--navy)">Kontak Pelindungan Data Pribadi</dt><dd style="margin:2px 0 0"><a href="mailto:${e(l.privacy_contact_email)}">${e(l.privacy_contact_email)}</a></dd></div>` : ""}
${l?.legal_name ? `<div><dt style="font-weight:650;color:var(--navy)">Penyelenggara</dt><dd style="margin:2px 0 0">${e(l.legal_name)}</dd></div>` : ""}
${l?.registered_address ? `<div><dt style="font-weight:650;color:var(--navy)">Alamat Terdaftar</dt><dd style="margin:2px 0 0">${e(l.registered_address)}</dd></div>` : ""}
</dl>
${waDigits ? `<div class="row"><a class="cta ghost" href="https://wa.me/62${e(waDigits)}" rel="noopener">${IC.chat} Chat WhatsApp Resmi</a></div>` : ""}
</div>
<div class="card">
<h2>Ingin langsung mengajukan lokasi gerai?</h2>
<p>Jika Anda sudah memiliki alamat toko/konter yang jelas beserta nomor WhatsApp penanggung jawab penjemputan kurir, Anda dapat langsung mengisi formulir pendaftaran daring tanpa perlu menunggu antrean chat.</p>
<ul class="chk">
<li>${IC.check}<span>Pencarian kecamatan titik jemput langsung di formulir</span></li>
<li>${IC.check}<span>Status pengajuan dipantau transparan lewat email &amp; dasbor</span></li>
<li>${IC.check}<span>Baca <a href="/tanya-jawab">Tanya Jawab Calon Mitra</a> untuk persiapan alat</span></li>
</ul>
<div class="row"><a class="cta" href="${e(app)}/daftar-akun">Ajukan Pendaftaran Gerai</a></div>
</div>
</div></section>`
}

export function renderKetentuan(l: Legal | null): string {
  const brand = l?.brand_name || "GeraiExpress"
  return `<div class="wrap phead"><h1>Ketentuan layanan perangkat lunak gerai mitra</h1><p class="lead">Mengatur hak dan tanggung jawab operasional antara penyelenggara platform dan pemilik gerai mitra.</p></div>
<section class="sec" style="padding-top:8px"><div class="wrap prose">
<p>Ketentuan ini mengatur penggunaan layanan ${e(brand)}${l?.legal_name ? `, dioperasikan oleh ${e(l.legal_name)}` : ""}, oleh gerai mitra terdaftar.</p>
<h2>1. Peran perangkat lunak</h2>
<p>${e(brand)} menyediakan perangkat lunak meja kasir, pencetakan label/struk, halaman publik gerai, serta alat bantu rekonsiliasi data kiriman. Pengangkutan fisik paket dilakukan oleh perusahaan ekspedisi melalui akun seller Mengantar milik masing-masing gerai. Pembayaran ongkos kirim dari pelanggan loket diterima langsung oleh gerai; ${e(brand)} hanya menyediakan sistem pencatatannya.</p>
<h2>2. Kewajiban operasional gerai</h2>
<p>Pemilik gerai dan petugas kasir wajib memastikan fisik paket ditimbang dan diukur secara benar, isi kiriman bukan barang terlarang menurut hukum maupun aturan ekspedisi, identitas pengirim dan penerima dicatat akurat, serta tanda terima serah kurir disimpan secara tertib.</p>
<h2>3. Keamanan akun dan akses kasir</h2>
<p>Pemilik gerai bertanggung jawab menjaga kerahasiaan kata sandi, kunci API toko, dan Webhook Secret, serta segera mencabut akses anggota kasir yang sudah tidak bertugas di gerai.</p>
<h2>4. Pembaruan ketentuan</h2>
<p>Ketentuan layanan dapat disesuaikan mengikuti perkembangan regulasi pos, pelindungan data, dan fitur sistem. Versi yang berlaku selalu dipublikasikan secara terbuka pada halaman ini.</p>
</div></section>`
}

export function renderPrivasi(l: Legal | null): string {
  const contact = l?.privacy_contact_email || l?.support_email || "bantuan@geraiexpress.com"
  return `<div class="wrap phead"><h1>Kebijakan privasi &amp; pelindungan data kiriman</h1><p class="lead">Komitmen pengelolaan dan penyamaran data pribadi sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).</p></div>
<section class="sec" style="padding-top:8px"><div class="wrap prose">
<p>Kami mengolah data pribadi pengirim, penerima paket, pemilik gerai, dan staf kasir semata-mata untuk menyelenggarakan pengiriman paket, penagihan COD, pengembalian barang retur, keamanan sistem, dan pemenuhan kewajiban hukum di Indonesia.</p>
<h2>1. Jenis data yang diolah</h2>
<p>Data meliputi nama dan kredensial akun mitra, alamat titik jemput gerai, nama serta nomor telepon pengirim dan penerima paket, alamat kecamatan tujuan, deskripsi barang, nilai COD, serta catatan pembayaran loket.</p>
<h2>2. Pelacakan publik yang aman privasi</h2>
<p>Halaman lacak resi publik pada domain gerai mitra dirancang tidak pernah membocorkan alamat jalan lengkap, nomor telepon utuh, maupun nilai uang COD kepada publik. Hanya inisial nama dan kota/kecamatan yang ditampilkan secara umum; rincian penerima hanya dapat dibuka dengan verifikasi 4 angka terakhir nomor telepon penerima.</p>
<h2>3. Penyimpanan dan pengamanan</h2>
<p>Data operasional tiap gerai diisolasi dalam basis data terpisah per gerai, rahasia kunci API dienkripsi dengan standar kriptografi terautentikasi (AEAD), dan sesi ruang kerja dilindungi cookie khusus host.</p>
<h2>4. Hak subjek data</h2>
<p>Untuk permintaan akses, koreksi data yang tidak akurat, atau pertanyaan terkait pemrosesan data pribadi, silakan hubungi petugas kami melalui <a href="mailto:${e(contact)}">${e(contact)}</a>.</p>
</div></section>`
}
