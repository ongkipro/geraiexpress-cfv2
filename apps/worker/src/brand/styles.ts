// Brand marketing design system CSS (`docs/visual/09-BRAND-MARKETING-DESIGN-SYSTEM-AND-SEO.md`).
// Pure frosted glass header, 100svh edge-to-edge 3D Studio Hero, zero horizontal rules/borders between sections,
// background shifts (#FFFFFF / #F5F8FC / #061B52 / #EEF3FA) for clean spatial rhythm.

export const BRAND_CSS = `:root{color-scheme:light;--hdr-h:64px;--navy:#012676;--deep:#061B52;--ink:#162844;--muted:#4A5B75;--action:#0B4FE3;--action-h:#083CB3;--electric:#0060FE;--swoosh:#00A6FE;--canvas:#FFFFFF;--band:#F5F8FC;--ftr-bg:#EEF3FA;--tint:#EBF2FF;--line:#DCE4F0;--safe:#0F6E43;--safe-bg:#ECFDF5}
@media(min-width:768px){:root{--hdr-h:68px}}
*{box-sizing:border-box}html{font-size:16px;-webkit-text-size-adjust:100%;scroll-behavior:smooth}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition:none!important}}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink);background:var(--canvas);line-height:1.62;font-size:1.0625rem;overflow-x:clip}
body:not([data-home]){padding-top:var(--hdr-h)}
.hidden{display:none!important}
a{color:var(--action);text-underline-offset:3px}a:hover{color:var(--action-h)}
.wrap{max-width:1160px;margin:0 auto;padding-left:16px;padding-right:16px}@media(min-width:768px){.wrap{padding-left:32px;padding-right:32px}}
.skip{position:absolute;left:-9999px;top:8px;z-index:70;background:var(--navy);color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600}.skip:focus{left:16px}

/* Pure Frosted Glass Header — floats seamlessly over the 100svh 3D Hero with zero hard border line */
.hdr{position:fixed;top:0;left:0;right:0;z-index:50;background:rgba(255,255,255,.72);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);box-shadow:0 8px 32px -12px rgba(15,23,42,.08)}
.top{display:flex;align-items:center;justify-content:space-between;gap:8px;height:var(--hdr-h)}@media(min-width:768px){.top{gap:12px}}
.brand{display:inline-flex;align-items:center;gap:8px;font-weight:750;font-size:1.05rem;color:var(--navy);text-decoration:none;letter-spacing:-.015em;min-height:44px;flex-shrink:0}@media(min-width:480px){.brand{font-size:1.1875rem;gap:10px}}
.brand img{height:22px;width:auto;display:block}@media(min-width:480px){.brand img{height:26px}}
.dnav{display:none;align-items:center;gap:4px}@media(min-width:980px){.dnav{display:flex}}
.dnav a{position:relative;color:var(--ink);text-decoration:none;font-size:.9375rem;font-weight:500;min-height:44px;padding:0 12px;display:inline-flex;align-items:center;white-space:nowrap;transition:color .18s}
.dnav a::after{content:"";position:absolute;left:12px;right:12px;bottom:9px;height:2px;border-radius:2px;background:currentColor;transform:scaleX(0);transform-origin:left center;transition:transform .25s cubic-bezier(.22,1,.36,1)}
.dnav a:hover{color:var(--navy)}.dnav a:hover::after{transform:scaleX(1)}
.dnav a[aria-current=page]{color:var(--action)}.dnav a[aria-current=page]::after{transform:scaleX(1)}
@media(prefers-reduced-motion:reduce){.dnav a::after{transition:none}}
.hact{display:flex;align-items:center;gap:6px;flex-shrink:0}@media(min-width:640px){.hact{gap:8px}}
.login-lk{display:none;color:var(--ink);text-decoration:none;font-size:.9375rem;font-weight:600;min-height:44px;padding:0 12px;align-items:center;border-radius:8px}@media(min-width:680px){.login-lk{display:inline-flex}}
.login-lk:hover{background:rgba(1,38,118,.05);color:var(--navy)}
.cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 22px;border-radius:10px;background:var(--action);color:#fff;text-decoration:none;font-weight:650;border:1px solid transparent;font-size:1rem;cursor:pointer;white-space:nowrap;transition:background .12s,transform .12s}
.cta:hover{background:var(--action-h);color:#fff}
.cta.sm{min-height:44px;padding:0 12px;font-size:.875rem;border-radius:9px}@media(min-width:480px){.cta.sm{padding:0 16px;font-size:.9375rem}}
.cta.ghost{background:#fff;color:var(--navy);border-color:var(--line)}.cta.ghost:hover{background:var(--band);border-color:#B8C7DD;color:var(--navy)}
.cta.inv{background:#fff;color:var(--navy)}.cta.inv:hover{background:var(--tint);color:var(--navy)}
.cta.inv-ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.35)}.cta.inv-ghost:hover{background:rgba(255,255,255,.1);color:#fff}
.mnav{position:relative}@media(min-width:980px){.mnav{display:none}}
.mnav:not([open]) .mnav-panel{display:none}
.mnav summary{list-style:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 11px;border:1px solid rgba(15,23,42,.12);border-radius:9px;font-size:.875rem;font-weight:600;color:var(--navy);cursor:pointer;background:rgba(255,255,255,.85);user-select:none}
.mnav summary::-webkit-details-marker{display:none}
.mnav-panel{position:absolute;right:0;top:calc(100% + 8px);width:min(280px,calc(100vw - 32px));background:rgba(255,255,255,.96);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(15,23,42,.08);border-radius:14px;box-shadow:0 18px 36px rgba(1,38,118,.14);padding:8px;display:grid;gap:2px}
.mnav-panel a{display:flex;align-items:center;min-height:44px;padding:0 12px;border-radius:8px;text-decoration:none;color:var(--ink);font-size:.9375rem;font-weight:500}
.mnav-panel a[aria-current=page]{background:var(--tint);color:var(--action)}
.mnav-panel a:hover{background:var(--band)}
.crumbs{padding:20px 0 0;font-size:.875rem;color:var(--muted)}
.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.crumbs a{color:var(--muted);text-decoration:none}.crumbs a:hover{color:var(--action);text-decoration:underline}

/* Pure 100svh Full-Width Edge-to-Edge 3D Studio Hero (Zero Clutter, Zero Bottom Line) */
.hero-bleed{position:relative;width:100%}
#stageWrapper{position:relative;width:100%;height:100vh;height:100svh;min-height:540px;background:radial-gradient(circle at 50% 44%,#FFFFFF 0%,#F4F7FB 64%,#E9EFF8 100%);overflow:hidden;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:pan-y}
#stageWrapper:active{cursor:grabbing}
#webglCanvas{display:block;width:100%;height:100%;outline:none}
.glass-surface{background:rgba(255,255,255,.84);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(15,23,42,.07);box-shadow:0 12px 32px -8px rgba(15,23,42,.08),0 2px 6px -1px rgba(0,82,255,.04)}

/* Studio HUD Callout (Top-Left below floating glass header) */
#spatialCallout{position:absolute;top:calc(var(--hdr-h) + 12px);left:12px;z-index:14;pointer-events:none;will-change:transform,opacity;transition:transform .4s cubic-bezier(.22,1,.36,1),opacity .3s ease}
@media(min-width:640px){#spatialCallout{top:calc(var(--hdr-h) + 18px);left:max(24px,calc((100% - 1200px)/2 + 24px))}}
.callout-card{border-radius:16px;padding:11px 14px;width:min(284px,calc(100vw - 24px))}
@media(min-width:640px){.callout-card{padding:13px 16px;width:284px}}
.callout-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
.callout-badge{font-size:.75rem;font-weight:750;letter-spacing:.02em;text-transform:uppercase;color:#0052FF;background:#EFF6FF;padding:2px 8px;border-radius:6px;white-space:nowrap}
.callout-metric{font-size:.75rem;font-weight:700;color:#64748B;white-space:nowrap}
.callout-title{font-size:.875rem;font-weight:750;color:#0F172A;line-height:1.3}@media(min-width:640px){.callout-title{font-size:.9375rem}}
.callout-desc{font-size:.78rem;font-weight:500;color:#475569;line-height:1.45;margin-top:2px}@media(min-width:640px){.callout-desc{font-size:.8125rem}}

/* Studio Top-Right Value Pill */
.stage-pill{position:absolute;top:calc(var(--hdr-h) + 18px);right:max(24px,calc((100% - 1200px)/2 + 24px));z-index:14;pointer-events:none;display:none;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;font-size:.78rem;font-weight:650;color:#334155}
@media(min-width:720px){.stage-pill{display:inline-flex}}
.stage-dot{width:8px;height:8px;border-radius:999px;background:#0052FF}
.stage-off{font-weight:800;color:#0052FF;background:#EFF6FF;padding:2px 8px;border-radius:999px}

/* Bottom Timeline Scrubber */
#hudControls{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:16;display:flex;flex-direction:column;align-items:center;gap:6px;width:calc(100% - 24px);max-width:540px}
@media(min-width:640px){#hudControls{bottom:22px}}
.hud-bar{width:100%;border-radius:999px;padding:5px;display:flex;align-items:center;gap:4px;position:relative;overflow:hidden}
#togglePlayBtn{width:40px;height:40px;flex-shrink:0;border-radius:999px;border:0;background:#F1F5F9;color:#1E293B;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
#togglePlayBtn:hover{background:#E2E8F0}
.hud-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;flex:1}
.step-tab{min-height:40px;border:0;border-radius:999px;background:transparent;padding:0 6px;font-size:.75rem;font-weight:700;color:#475569;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .15s,color .15s}
.step-tab:hover{color:#0F172A;background:rgba(15,23,42,.04)}
.step-tab.active,.step-tab.active:hover{background:#0052FF;color:#FFFFFF;box-shadow:0 6px 14px -4px rgba(0,82,255,.45)}
.hud-prog{position:absolute;bottom:0;left:20px;right:20px;height:2px;background:rgba(148,163,184,.35);pointer-events:none}
#progressFill{height:100%;background:#0052FF;width:0%}

/* Perfected After-Hero Value Proposition & Live Rate Simulator */
.intro-grid{display:grid;gap:32px;align-items:center}@media(min-width:940px){.intro-grid{grid-template-columns:1.12fr .88fr;gap:48px}}
.intro-title{color:var(--navy);font-weight:800;letter-spacing:-.022em;font-size:clamp(1.85rem,1.3rem + 2.2vw,2.75rem);line-height:1.13;margin:0 0 16px;text-wrap:balance;max-width:21ch}
.trust-pills{margin:20px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:10px 20px;font-size:.9375rem;font-weight:500;color:var(--ink)}
.trust-pills li{display:inline-flex;align-items:center;gap:8px}
.trust-pills svg{color:var(--safe);flex-shrink:0}

.phead{padding:28px 0 40px}@media(min-width:900px){.phead{padding:36px 0 48px}}
.phead h1{color:var(--navy);font-weight:780;letter-spacing:-.02em;margin:0 0 12px;text-wrap:balance;font-size:clamp(1.8rem,1.3rem + 2vw,2.5rem);line-height:1.15;max-width:24ch}
.lead{font-size:1.08rem;color:var(--muted);margin:0;max-width:58ch;line-height:1.62}
.row{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}

/* Sections separated purely by whitespace and surface tone shifts — ZERO border lines between sections */
section.sec{padding:60px 0;scroll-margin-top:var(--hdr-h)}@media(min-width:900px){section.sec{padding:80px 0}}
section.band{background:var(--band)}
section.deep{background:var(--deep);color:#fff;padding:60px 0}@media(min-width:900px){section.deep{padding:76px 0}}
section.deep h2{color:#fff;margin:0 0 10px}section.deep p{color:rgba(255,255,255,.84);margin:0;max-width:58ch}
.shead{max-width:64ch;margin-bottom:32px}
h2{font-size:clamp(1.45rem,1.15rem + 1.2vw,1.95rem);color:var(--navy);font-weight:730;line-height:1.22;letter-spacing:-.015em;margin:0 0 10px;text-wrap:balance}
h3{font-size:1.125rem;color:var(--navy);font-weight:660;line-height:1.35;margin:0 0 8px}
.sub{color:var(--muted);margin:0;font-size:1.02rem}
.grid2,.grid3{display:grid;gap:22px}
@media(min-width:720px){.grid2{grid-template-columns:repeat(2,1fr)}}
@media(min-width:860px){.grid3{grid-template-columns:repeat(3,1fr)}}
.card{background:var(--canvas);border-radius:16px;padding:26px;display:flex;flex-direction:column;gap:8px;min-width:0;box-shadow:0 8px 28px -12px rgba(15,23,42,.07)}
section:not(.band) .card{background:var(--band);box-shadow:none}
.card p{margin:0;color:var(--muted);font-size:.975rem;line-height:1.58}
.ic{width:40px;height:40px;border-radius:11px;background:var(--tint);color:var(--action);display:inline-flex;align-items:center;justify-content:center;margin-bottom:4px;flex-shrink:0}
.demo-box{background:var(--band);border-radius:18px;padding:24px;min-width:0}
section.band .demo-box{background:#fff;box-shadow:0 10px 30px -12px rgba(15,23,42,.07)}
.demo-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px;font-size:.875rem;font-weight:650;color:var(--navy)}
.pill-ok{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;background:var(--safe-bg);color:var(--safe);font-size:.78rem;font-weight:650;white-space:nowrap}
.pill-bl{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;background:var(--tint);color:var(--action);font-size:.78rem;font-weight:650;white-space:nowrap}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 14px}
.seg button{min-height:44px;border:0;border-radius:9px;background:#fff;color:var(--ink);font-weight:600;font-size:.9rem;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,42,.06)}
.seg button[aria-pressed=true]{background:var(--action);color:#fff}
label{display:block;font-weight:600;font-size:.92rem;color:var(--navy);margin:12px 0 6px}
label:first-child{margin-top:0}
input,select{width:100%;min-height:46px;font-size:1rem;padding:8px 12px;border:1px solid #CBD5E1;border-radius:9px;background:#fff;color:var(--ink)}
ul.rates{list-style:none;margin:0;padding:0;background:#fff;border-radius:12px;overflow:hidden;display:grid;gap:2px}
ul.rates li{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;background:#fff;font-size:.95rem}
ul.rates li:nth-child(even){background:#FAFCFF}
ul.rates button{min-height:44px;padding:0 14px;border:1px solid var(--action);border-radius:8px;background:#fff;color:var(--action);font-size:.9375rem;font-weight:650;cursor:pointer;font-variant-numeric:tabular-nums;white-space:nowrap}
ul.rates button:hover{background:var(--action);color:#fff}
.num{font-variant-numeric:tabular-nums;font-weight:650;color:var(--navy);white-space:nowrap;flex-shrink:0}
.note{color:var(--muted);font-size:.9375rem;margin:8px 0 0}
.sim{display:grid;gap:24px;align-items:start}@media(min-width:920px){.sim{grid-template-columns:1fr 1.05fr}.sim-sticky{position:sticky;top:88px}}
.receipt{border:1px dashed #94A3B8;border-radius:12px;padding:16px;background:#fff;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.875rem;line-height:1.5;white-space:pre-wrap;color:var(--ink);overflow-x:auto}
.lbl-preview{border-radius:12px;padding:16px;background:var(--band);margin-top:14px;font-size:.875rem}
.lbl-bar{height:28px;background:repeating-linear-gradient(90deg,#0F172A 0 3px,#fff 3px 6px,#0F172A 6px 8px,#fff 8px 12px);border-radius:3px;margin:10px 0}
.tbl-wrap{overflow-x:auto;border-radius:14px;background:#fff;box-shadow:0 8px 24px -12px rgba(15,23,42,.07)}
table.tbl{width:100%;border-collapse:collapse;font-size:.9375rem;text-align:left}
.tbl th{background:#EEF4FB;color:var(--navy);font-weight:650;padding:14px 16px;white-space:nowrap}
.tbl td{padding:14px 16px;vertical-align:top;color:var(--ink)}
.tbl tbody tr:nth-child(even) td{background:#FAFCFF}
.steps{list-style:none;margin:0;padding:0;display:grid;gap:16px}
.steps li{display:grid;grid-template-columns:36px 1fr;gap:14px;align-items:start;background:#fff;border-radius:14px;padding:20px 22px;box-shadow:0 8px 24px -12px rgba(15,23,42,.06)}
.step-no{width:36px;height:36px;border-radius:999px;background:var(--navy);color:#fff;font-weight:700;font-size:.95rem;display:inline-flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
.faq{display:grid;gap:12px;max-width:78ch}
.faq details{background:#fff;border-radius:12px;padding:4px 18px;box-shadow:0 4px 16px -8px rgba(15,23,42,.06)}
.faq summary{min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;font-weight:650;color:var(--navy);font-size:1rem;list-style:none;padding:10px 0}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font-size:1.25rem;color:var(--action);font-weight:600;flex-shrink:0}
.faq details[open] summary::after{content:"−"}
.faq .ans{padding:0 0 16px;color:var(--muted);font-size:.975rem;margin:0}
.prose{max-width:70ch}.prose h2{font-size:1.35rem;margin-top:28px}.prose p,.prose li{color:var(--ink)}
.chk{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:8px;font-size:.95rem}
.chk li{display:flex;gap:10px;align-items:flex-start}
.chk svg{color:var(--safe);flex-shrink:0;margin-top:3px}
.next-links{display:flex;flex-wrap:wrap;gap:10px 20px;margin-top:24px;font-size:.95rem;font-weight:600}
input:focus-visible,select:focus-visible,a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #60A5FA;outline-offset:2px}
footer.ftr{background:var(--ftr-bg);padding:52px 0 40px;color:var(--muted);font-size:.92rem}
.fgrid{display:grid;gap:28px}@media(min-width:820px){.fgrid{grid-template-columns:1.4fr 1fr 1fr}}
.fcol h3{font-size:.875rem;text-transform:uppercase;letter-spacing:.04em;color:var(--navy);margin:0 0 10px}
.fcol ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.fcol a{color:var(--muted);text-decoration:none;display:inline-flex;align-items:center;min-height:44px}.fcol a:hover{color:var(--navy);text-decoration:underline}
.flegal{margin-top:32px;display:grid;gap:6px;font-size:.875rem}
/* Pratinjau cek tarif: shadcn/ui Select pattern (trigger + popover listbox) + courier-logo rate rows */
.demo-title{font-size:1rem;font-weight:700;color:var(--navy);margin:0;letter-spacing:-.005em}
.fld-lbl{display:block;font-weight:600;font-size:.875rem;color:var(--navy);margin:4px 0 6px}
.sel{position:relative}
.sel-btn{width:100%;min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px 7px 14px;border:1px solid #CBD5E1;border-radius:10px;background:#fff;color:var(--ink);font:inherit;text-align:left;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.04);transition:border-color .12s,box-shadow .12s}
.sel-btn:hover{border-color:#94A3B8}
.sel-btn[aria-expanded=true]{border-color:var(--action);box-shadow:0 0 0 3px rgba(11,79,227,.16)}
.sel-btn[aria-expanded=true] .sel-chev{transform:rotate(180deg)}
.sel-chev{color:#64748B;flex-shrink:0;transition:transform .15s}
.sel-val,.opt-text{display:flex;flex-direction:column;min-width:0;line-height:1.25}
.opt-main{font-size:.9375rem;font-weight:600;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.opt-sub{font-size:.8125rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sel-list{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 6px);margin:0;padding:4px;list-style:none;background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:12px;box-shadow:0 16px 40px -12px rgba(15,23,42,.22),0 2px 6px rgba(15,23,42,.06);max-height:288px;overflow-y:auto;outline:none;animation:selIn .12s ease-out}
.sel-list[hidden]{display:none}
@keyframes selIn{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
.sel-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding:6px 10px;border-radius:8px;cursor:pointer}
.sel-opt.hl{background:#F1F5F9}
.sel-opt .opt-check{color:var(--action);visibility:hidden;flex-shrink:0}
.sel-opt[aria-selected=true] .opt-check{visibility:visible}
.sel-opt[aria-selected=true] .opt-main{color:var(--action)}
.sel-list:focus-visible{box-shadow:0 0 0 3px rgba(96,165,250,.5),0 16px 40px -12px rgba(15,23,42,.22)}
ul.rates-logo li{display:grid;grid-template-columns:84px minmax(0,1fr) auto;align-items:center;gap:14px;padding:12px 14px}
.clogo{display:flex;align-items:center;justify-content:center;width:84px;height:40px;padding:6px;border-radius:9px;background:#fff;border:1px solid #E6ECF4}
.clogo img{display:block;width:auto;height:auto;max-width:72px;max-height:26px}
.rate-main{display:flex;flex-direction:column;min-width:0;gap:3px}
.rate-name{font-size:.9375rem;font-weight:650;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rate-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:.8125rem;color:var(--muted)}
.demo-foot{margin-top:14px;font-size:.875rem}
@media(max-width:420px){ul.rates-logo li{grid-template-columns:64px minmax(0,1fr) auto;gap:10px;padding:11px 12px}.clogo{width:64px;height:34px;padding:5px}.clogo img{max-width:54px;max-height:22px}.rate-name{white-space:normal;line-height:1.3}}

/* Brand lockup: GeraiExpress + small "by Mengantar" */
.brand-txt{display:flex;flex-direction:column;line-height:1.05}
.brand-name{font-weight:750;letter-spacing:-.015em}
.brand-by{font-size:.6875rem;font-weight:600;letter-spacing:.02em;color:var(--muted);margin-top:2px}
@media(min-width:480px){.brand-by{font-size:.72rem}}
/* Partner courier badges */
.partners{padding:8px 0 56px}@media(min-width:900px){.partners{padding:8px 0 72px}}
.partners-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 24px;margin-bottom:20px}
.partners-title{font-size:1.125rem;margin:0;color:var(--navy)}
.partners-sub{margin:0;font-size:.9375rem;color:var(--muted)}
.pgrid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media(min-width:640px){.pgrid{grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}}
@media(min-width:1024px){.pgrid{grid-template-columns:repeat(9,minmax(0,1fr))}}
.pbadge{display:flex;align-items:center;justify-content:center;height:64px;padding:10px 12px;background:#fff;border:1px solid #E6ECF4;border-radius:12px;transition:border-color .15s,box-shadow .15s,transform .15s}
.pbadge:hover{border-color:#C7D4E6;box-shadow:0 8px 20px -12px rgba(15,23,42,.18);transform:translateY(-1px)}
.pbadge img{display:block;width:auto;height:auto;max-width:100%;max-height:30px}
@media(max-width:420px){.pbadge{height:56px;padding:8px}.pbadge img{max-height:24px}}

/* Courier logo in tables & simulator rows */
.tcour{display:flex;align-items:center;gap:12px;white-space:nowrap}
.tlogo{display:flex;align-items:center;justify-content:center;width:76px;height:36px;padding:5px;background:#fff;border:1px solid #E6ECF4;border-radius:8px;flex-shrink:0}
.tlogo img{display:block;width:auto;height:auto;max-width:64px;max-height:22px}
ul.rates li.sim-row{display:grid;grid-template-columns:84px minmax(0,1fr) auto;align-items:center;gap:12px}
@media(max-width:420px){ul.rates li.sim-row{grid-template-columns:64px minmax(0,1fr) auto;gap:10px}}
`
