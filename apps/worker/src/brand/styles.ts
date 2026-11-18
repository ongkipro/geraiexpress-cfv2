// Brand marketing design system CSS (`docs/visual/09`, DEC-247 "Borderless White-Gallery").
// One white canvas top to bottom, one porcelain surface (#F4F6FA, zero border) for tiles, pedestals, the pricing panel,
// the comparison wash and the footer; white floating artifacts carry the float shadow; hairlines only for open rows,
// FAQ dividers and the footer top. 90% neutral ink + one brand signal (#0B4FE3) for CTAs, active and winning states.
// The 100svh 3D Studio Hero block below is unchanged from DEC-245.

export const BRAND_CSS = `:root{color-scheme:light;--hdr-h:64px;--navy:#012676;--ink:#0F172A;--body:#475569;--slate:#5B6A80;--muted:#94A3B8;--action:#0B4FE3;--action-h:#083CB3;--tint:#EFF6FF;--canvas:#FFFFFF;--tile:#F4F6FA;--hairline:1px solid rgba(15,23,42,.07);--shadow-float:0 20px 50px -12px rgba(15,23,42,.08),0 2px 6px -1px rgba(15,23,42,.04);--ease:cubic-bezier(.22,1,.36,1);--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media(min-width:768px){:root{--hdr-h:68px}}
*{box-sizing:border-box}html{font-size:16px;-webkit-text-size-adjust:100%;scroll-behavior:smooth}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition:none!important;animation:none!important}}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:var(--ink);background:var(--canvas);line-height:1.62;font-size:1.0625rem;overflow-x:clip}
body:not([data-home]){padding-top:var(--hdr-h)}
.hidden{display:none!important}
a{color:var(--action);text-underline-offset:3px}a:hover{color:var(--action-h)}
code{font-family:var(--mono);font-size:.92em}
.wrap{max-width:1160px;margin:0 auto;padding-left:16px;padding-right:16px}@media(min-width:768px){.wrap{padding-left:32px;padding-right:32px}}
.skip{position:absolute;left:-9999px;top:8px;z-index:70;background:var(--ink);color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600}.skip:focus{left:16px}
input:focus-visible,select:focus-visible,a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #60A5FA;outline-offset:2px}

/* One header on every page: frosted over the 3D hero, the same geometry on inner pages, no bottom rule */
.hdr{position:fixed;top:0;left:0;right:0;z-index:50;background:rgba(255,255,255,.78);backdrop-filter:blur(10px) saturate(180%);-webkit-backdrop-filter:blur(10px) saturate(180%)}
.hdr[data-menu-open]{background:#fff}
.top{display:flex;align-items:center;gap:8px;height:var(--hdr-h)}
.brand{display:inline-flex;align-items:center;gap:8px;font-weight:750;font-size:1.05rem;color:var(--navy);text-decoration:none;letter-spacing:-.015em;min-height:44px;flex-shrink:0;margin-right:auto}@media(min-width:480px){.brand{font-size:1.1875rem;gap:10px}}
.brand:hover{color:var(--navy)}
.brand img{height:22px;width:auto;display:block}@media(min-width:480px){.brand img{height:26px}}
.brand-txt{display:flex;flex-direction:column;line-height:1.05}
.brand-name{font-weight:750;letter-spacing:-.015em}
.brand-by{font-size:.75rem;font-weight:600;letter-spacing:.02em;color:var(--slate);margin-top:2px}
.dnav{display:none}
.dnav a{position:relative;color:var(--ink);text-decoration:none;font-size:.9375rem;font-weight:550;min-height:44px;padding:0 10px;display:inline-flex;align-items:center;white-space:nowrap;transition:color .18s}
.dnav a::after{content:"";position:absolute;left:10px;right:10px;bottom:9px;height:2px;border-radius:2px;background:currentColor;transform:scaleX(0);transform-origin:left center;transition:transform .25s var(--ease)}
.dnav a:hover{color:var(--action)}.dnav a:hover::after{transform:scaleX(1)}
.dnav a[aria-current=page]{color:var(--action)}.dnav a[aria-current=page]::after{transform:scaleX(1)}
.hact{display:flex;align-items:center;gap:8px;flex-shrink:0}
.login-lk{display:none;color:var(--ink);text-decoration:none;font-size:.9375rem;font-weight:600;min-height:44px;padding:0 12px;align-items:center;border-radius:999px}
.login-lk:hover{background:var(--tile);color:var(--ink)}
.hact .cta{display:none}
.hround{width:44px;height:44px;flex-shrink:0;padding:0;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#fff;border:1px solid rgba(15,23,42,.1);color:var(--ink);cursor:pointer;transition:border-color .2s var(--ease),color .2s var(--ease),background-color .2s var(--ease)}
.hround:hover{border-color:var(--action);color:var(--action);background:var(--tint)}
.hround svg{width:20px;height:20px;overflow:visible}
.burger .bar{transform-box:view-box;transform-origin:10px 10px;transition:transform .2s var(--ease)}
.burger[aria-expanded=true]{border-color:var(--action);color:var(--action);background:var(--tint)}
.burger[aria-expanded=true] .bar-t{transform:translateY(3px) rotate(45deg)}
.burger[aria-expanded=true] .bar-b{transform:translateY(-3px) rotate(-45deg)}
.nojs-menu{display:none}
html:not(.js) .burger{display:none}html:not(.js) .nojs-menu{display:inline-flex}
/* Phone menu: a screen-aligned frosted card under the header, dimmed page behind it */
.mnav-dim{position:fixed;left:0;right:0;bottom:0;top:var(--hdr-b,64px);z-index:48;background:rgba(15,23,42,.16);opacity:0;pointer-events:none;transition:opacity .2s ease-out}
.mnav-dim.open{opacity:1;pointer-events:auto}
.mnav{position:fixed;z-index:49;top:calc(var(--hdr-b,64px) + 8px);left:1rem;right:1rem;max-width:440px;margin:0 auto;max-height:calc(100dvh - var(--hdr-b,64px) - 1.5rem);overflow-y:auto;overscroll-behavior:contain;padding:.75rem .625rem .625rem;border-radius:20px;background:linear-gradient(var(--action),var(--action)) top/100% 2px no-repeat,rgba(255,255,255,.88);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);box-shadow:0 24px 56px -12px rgba(15,23,42,.18),0 2px 8px -2px rgba(15,23,42,.06);opacity:0;visibility:hidden;transform:translateY(-8px) scale(.985);transform-origin:top center;transition:opacity .2s var(--ease),transform .2s var(--ease),visibility 0s linear .2s}
.mnav.open{opacity:1;visibility:visible;transform:none;transition:opacity .2s var(--ease),transform .2s var(--ease),visibility 0s}
.mnav ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.mnav li a{display:flex;align-items:center;gap:12px;min-height:56px;padding:9px 12px;border-radius:14px;color:var(--ink);text-decoration:none}
.mnav li a:hover,.mnav li a:focus-visible{background:var(--tile)}
.r-t{flex:1;display:grid;gap:1px;min-width:0}
.r-l{font-weight:700;font-size:1rem;letter-spacing:-.01em}
.r-h{font-size:.8125rem;line-height:1.35;color:var(--body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r-m{flex-shrink:0;width:7px;height:7px;margin-right:4px;border-top:2px solid var(--muted);border-right:2px solid var(--muted);transform:rotate(45deg)}
.mnav li a[aria-current=page]{background:var(--tile)}.mnav li a[aria-current=page] .r-l{color:var(--action)}
.mnav li a[aria-current=page] .r-m{border:0;width:7px;height:7px;border-radius:2px;background:var(--action);transform:none}
.mnav-foot{display:grid;gap:8px;margin-top:8px;padding:12px 4px 4px;border-top:var(--hairline)}
.mnav-foot .cta{width:100%;border-radius:999px}
.mnav-sec{display:flex;align-items:center;justify-content:center;gap:4px;min-height:46px;padding:0 1rem;border-radius:999px;background:var(--tile);color:var(--ink);font-weight:600;font-size:.9375rem;text-decoration:none;text-align:center}
.mnav-sec b{color:var(--action)}.mnav-sec:hover{color:var(--ink);background:#EBEEF4}
@media(min-width:960px){
.top{display:grid;grid-template-columns:1fr auto 1fr;gap:12px}
.dnav{display:flex;justify-content:center}
.hact{justify-self:end}
.login-lk,.hact .cta{display:inline-flex}
.hround,.mnav,.mnav-dim{display:none!important}
}
.crumbs{padding-top:20px;font-size:.875rem;color:var(--slate)}
.crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.crumbs a{color:var(--slate);text-decoration:none}.crumbs a:hover{color:var(--action);text-decoration:underline}

/* Buttons: pill primary in the one brand signal, quiet secondary */
.cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 24px;border-radius:999px;background:var(--action);color:#fff;text-decoration:none;font-weight:650;border:0;font-size:1rem;cursor:pointer;white-space:nowrap;box-shadow:0 8px 20px -10px rgba(11,79,227,.55);transition:background-color .15s}
.cta:hover{background:var(--action-h);color:#fff}
.cta.sm{min-height:44px;padding:0 18px;font-size:.9375rem}
.cta.ghost{background:#fff;color:var(--ink);box-shadow:inset 0 0 0 1px rgba(15,23,42,.14)}.cta.ghost:hover{background:var(--tile);color:var(--ink)}
.cta.soft{background:var(--tile);color:var(--ink);box-shadow:none}.cta.soft:hover{background:#EBEEF4;color:var(--ink)}
.row{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}

/* Pure 100svh Full-Width Edge-to-Edge 3D Studio Hero (Zero Clutter, Zero Bottom Line) */
.hero-bleed{position:relative;width:100%}
#stageWrapper{position:relative;width:100%;height:100vh;height:100svh;min-height:540px;background:radial-gradient(circle at 50% 44%,#FFFFFF 0%,#F4F7FB 64%,#E9EFF8 100%);overflow:hidden;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:pan-y}
#stageWrapper:active{cursor:grabbing}
#webglCanvas{display:block;width:100%;height:100%;outline:none}
.glass-surface{background:rgba(255,255,255,.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(15,23,42,.07);box-shadow:0 12px 32px -8px rgba(15,23,42,.08),0 2px 6px -1px rgba(0,82,255,.04)}
#spatialCallout{position:absolute;top:calc(var(--hdr-h) + 12px);left:12px;z-index:14;pointer-events:none;will-change:transform,opacity;transition:transform .4s cubic-bezier(.22,1,.36,1),opacity .3s ease}
@media(min-width:640px){#spatialCallout{top:calc(var(--hdr-h) + 18px);left:max(24px,calc((100% - 1200px)/2 + 24px))}}
.callout-card{border-radius:16px;padding:11px 14px;width:min(284px,calc(100vw - 24px))}
@media(min-width:640px){.callout-card{padding:13px 16px;width:284px}}
.callout-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
.callout-badge{font-size:.75rem;font-weight:750;letter-spacing:.02em;text-transform:uppercase;color:#0052FF;background:#EFF6FF;padding:2px 8px;border-radius:6px;white-space:nowrap}
.callout-metric{font-size:.75rem;font-weight:700;color:#64748B;white-space:nowrap}
.callout-title{font-size:.875rem;font-weight:750;color:#0F172A;line-height:1.3}@media(min-width:640px){.callout-title{font-size:.9375rem}}
.callout-desc{font-size:.78rem;font-weight:500;color:#475569;line-height:1.45;margin-top:2px}@media(min-width:640px){.callout-desc{font-size:.8125rem}}
.stage-pill{position:absolute;top:calc(var(--hdr-h) + 18px);right:max(24px,calc((100% - 1200px)/2 + 24px));z-index:14;pointer-events:none;display:none;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;font-size:.78rem;font-weight:650;color:#334155}
@media(min-width:720px){.stage-pill{display:inline-flex}}
.stage-dot{width:8px;height:8px;border-radius:999px;background:#0052FF}
.stage-off{font-weight:800;color:#0052FF;background:#EFF6FF;padding:2px 8px;border-radius:999px}
#hudControls{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:16;display:flex;flex-direction:column;align-items:center;gap:6px;width:calc(100% - 24px);max-width:540px}
@media(min-width:640px){#hudControls{bottom:22px}}
.hud-bar{width:100%;border-radius:999px;padding:5px;display:flex;align-items:center;gap:4px;position:relative;overflow:hidden}
#togglePlayBtn{width:44px;height:44px;flex-shrink:0;border-radius:999px;border:0;background:#F1F5F9;color:#1E293B;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
#togglePlayBtn:hover{background:#E2E8F0}
.hud-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;flex:1}
.step-tab{min-height:44px;border:0;border-radius:999px;background:transparent;padding:0 6px;font-size:.75rem;font-weight:700;color:#475569;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .15s,color .15s}
.step-tab:hover{color:#0F172A;background:rgba(15,23,42,.04)}
.step-tab.active,.step-tab.active:hover{background:#0052FF;color:#FFFFFF;box-shadow:0 6px 14px -4px rgba(0,82,255,.45)}
.hud-prog{position:absolute;bottom:0;left:20px;right:20px;height:2px;background:rgba(148,163,184,.35);pointer-events:none}
#progressFill{height:100%;background:#0052FF;width:0%}

/* Sections: white canvas, generous air, tight architectural headings, one subtitle */
section.sec{padding:72px 0;scroll-margin-top:var(--hdr-h)}@media(min-width:900px){section.sec{padding:96px 0}}
section.sec.tight{padding-top:24px}
section.sec+section.sec{padding-top:0}
.shead{margin-bottom:40px}@media(min-width:900px){.shead{margin-bottom:48px}}
h2{font-size:clamp(1.6rem,1.2rem + 1.5vw,2.25rem);color:var(--ink);font-weight:750;line-height:1.12;letter-spacing:-.028em;margin:0 0 14px;max-width:24ch;text-wrap:balance}
h3{font-size:1.125rem;color:var(--ink);font-weight:700;line-height:1.3;letter-spacing:-.01em;margin:0 0 6px}
.sub{color:var(--body);margin:0;font-size:1.0625rem;max-width:54ch}
/* Inner-page head (adsbook PageHead parity): masked dot grid, mono eyebrow pill, centered title and lead */
.phead{position:relative;overflow:hidden;padding:28px 0 40px}@media(min-width:900px){.phead{padding:44px 0 64px}}
.phead .dots{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(rgb(15 23 42 / .09) 1px,transparent 1.4px);background-size:22px 22px;background-position:center top;-webkit-mask-image:radial-gradient(ellipse 55% 75% at 50% 30%,#000 0%,transparent 72%);mask-image:radial-gradient(ellipse 55% 75% at 50% 30%,#000 0%,transparent 72%)}
.phead .head{position:relative;display:grid;gap:16px;justify-items:center;text-align:center}
.phead .lead{max-width:58ch}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0;padding:5px 13px;border-radius:999px;background:rgba(255,255,255,.85);box-shadow:inset 0 0 0 1px #DBEAFE,0 1px 2px rgba(15,23,42,.04);font:600 .75rem/1.4 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--action)}
.esq{width:6px;height:6px;background:var(--action)}
.crumbs ol{justify-content:center}
.phead h1,.intro-title{color:var(--navy);font-weight:780;letter-spacing:-.028em;margin:0 0 14px;text-wrap:balance;line-height:1.12}
.phead h1{font-size:clamp(1.9rem,1.3rem + 2.2vw,2.75rem);max-width:22ch;margin:0}
.intro-title{font-size:clamp(1.95rem,1.3rem + 2.4vw,2.9rem);max-width:20ch}
.lead{font-size:1.125rem;color:var(--body);margin:0;max-width:58ch;line-height:1.62}
.note{color:var(--body);font-size:.9375rem;margin:12px 0 0}
.num{font-variant-numeric:tabular-nums;font-weight:650;color:var(--ink);white-space:nowrap;flex-shrink:0}
.chip{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;background:#F1F5F9;color:var(--body);font-size:.75rem;font-weight:650;white-space:nowrap;line-height:1.5}
.chip.on{background:var(--tint);color:var(--action)}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}

/* Porcelain tile (zero border) + one white floating artifact */
.tile,.card{background:var(--tile);border-radius:24px;padding:2rem;min-width:0;display:flex;flex-direction:column;gap:12px}
.tile h2,.card h2{font-size:clamp(1.3rem,1.1rem + .8vw,1.6rem);letter-spacing:-.02em;margin:0}
.tile p,.card p{margin:0;color:var(--body);font-size:.975rem;line-height:1.6}
@media(max-width:640px){.tile,.card{padding:1.4rem;border-radius:20px}}
.float{background:#fff;border-radius:16px;box-shadow:var(--shadow-float);padding:1.1rem 1.2rem;font-size:.875rem;color:var(--body);min-width:0}
.idx{font:600 .78rem/1 var(--mono);letter-spacing:.08em;color:var(--slate)}
.chk{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:10px;font-size:.975rem;color:var(--ink)}
.chk li{display:flex;gap:10px;align-items:flex-start}
.chk svg{color:var(--ink);flex-shrink:0;margin-top:4px}
.open-cols{display:grid;gap:28px}@media(min-width:860px){.open-cols{grid-template-columns:repeat(3,minmax(0,1fr));gap:40px}}
.open-cols>div{padding-top:20px;border-top:var(--hairline)}
@media(min-width:860px){.open-cols.two{grid-template-columns:repeat(2,minmax(0,1fr))}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.open-cols p{margin:0;color:var(--body);font-size:.975rem}

/* After-hero rate showcase: copy left, porcelain stage with ONE floating rate card right */
.intro-grid{display:grid;gap:40px;align-items:center}@media(min-width:960px){.intro-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px}}
.trust{margin:24px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:10px 22px;font-size:.9375rem;font-weight:500;color:var(--body)}
.trust li{display:inline-flex;align-items:center;gap:8px}
.trust svg{color:var(--ink);flex-shrink:0}
.stage{background:var(--tile);border-radius:24px;padding:2rem;min-width:0}@media(max-width:640px){.stage{padding:1rem;border-radius:20px}}
.stage>.float{padding:1.25rem}
.demo-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px}
.demo-title{font-size:1.0625rem;font-weight:750;color:var(--ink);margin:0;letter-spacing:-.01em;max-width:none}
.fld-lbl{display:block;font-weight:600;font-size:.875rem;color:var(--ink);margin:4px 0 6px}
.sel{position:relative}
.sel-btn{width:100%;min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 12px 7px 14px;border:1px solid #7B879C;border-radius:12px;background:#fff;color:var(--ink);font:inherit;text-align:left;cursor:pointer;transition:border-color .12s,box-shadow .12s}
.sel-btn:hover{border-color:#64748B}
.sel-btn[aria-expanded=true]{border-color:var(--action);box-shadow:0 0 0 3px rgba(11,79,227,.16)}
.sel-btn[aria-expanded=true] .sel-chev{transform:rotate(180deg)}
.sel-chev{color:#64748B;flex-shrink:0;transition:transform .15s}
.sel-val,.opt-text{display:flex;flex-direction:column;min-width:0;line-height:1.25}
.opt-main{font-size:.9375rem;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.opt-sub{font-size:.8125rem;color:var(--body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sel-list{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 6px);margin:0;padding:4px;list-style:none;background:#fff;border-radius:14px;box-shadow:0 16px 40px -12px rgba(15,23,42,.22),0 2px 6px rgba(15,23,42,.06);max-height:288px;overflow-y:auto;outline:none;animation:selIn .12s ease-out}
.sel-list[hidden]{display:none}
@keyframes selIn{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
.sel-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding:6px 10px;border-radius:9px;cursor:pointer}
.sel-opt.hl{background:var(--tile)}
.sel-opt .opt-check{color:var(--action);visibility:hidden;flex-shrink:0}
.sel-opt[aria-selected=true] .opt-check{visibility:visible}
.sel-opt[aria-selected=true] .opt-main{color:var(--action)}
.sel-list:focus-visible{box-shadow:0 0 0 3px rgba(96,165,250,.5),0 16px 40px -12px rgba(15,23,42,.22)}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:12px 0 14px;padding:4px;border-radius:999px;background:var(--tile)}
.seg button{min-height:44px;border:0;border-radius:999px;background:transparent;color:var(--body);font-weight:650;font-size:.9rem;cursor:pointer}
.seg button:hover{color:var(--ink)}
.seg button[aria-pressed=true]{background:#fff;color:var(--action);box-shadow:0 1px 2px rgba(15,23,42,.06),0 4px 10px -4px rgba(15,23,42,.12)}
ul.rates{list-style:none;margin:0;padding:0;display:grid}
ul.rates li{display:grid;grid-template-columns:76px minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px 0;border-bottom:var(--hairline);font-size:.95rem}
ul.rates li:last-child{border-bottom:0}
.clogo,.tlogo{display:flex;align-items:center;justify-content:center;width:76px;height:38px;padding:6px;border-radius:10px;background:var(--tile);flex-shrink:0}
.clogo img,.tlogo img{display:block;width:auto;height:auto;max-width:64px;max-height:24px}
.rate-main{display:flex;flex-direction:column;min-width:0;gap:3px}
.rate-name{font-size:.9375rem;font-weight:650;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rate-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:.8125rem;color:var(--body)}
.demo-foot{margin-top:12px;font-size:.875rem}
@media(max-width:420px){ul.rates li{grid-template-columns:60px minmax(0,1fr) auto;gap:10px}.clogo{width:60px;height:34px;padding:5px}.clogo img{max-width:50px;max-height:20px}.rate-name{white-space:normal;line-height:1.3}}

/* Partner couriers: borderless porcelain logo tiles */
.pgrid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media(min-width:640px){.pgrid{grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}}
@media(min-width:1024px){.pgrid{grid-template-columns:repeat(9,minmax(0,1fr))}}
.pgrid-gap{margin-bottom:56px}
/* DEC-249 home: infinite courier marquee (pauses on hover/focus, static wrap under reduced motion) */
.marquee{max-width:1476px;margin:0 auto;overflow:hidden;padding:6px 0 18px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.mq-track{display:flex;width:max-content;animation:gx-mq 42s linear infinite}
.marquee:hover .mq-track,.marquee:focus-within .mq-track,.marquee[data-paused] .mq-track{animation-play-state:paused}
.mq-ctl{display:flex;justify-content:flex-end;margin-top:-18px}
.mq-pause{display:inline-grid;place-items:center;width:44px;height:44px;border:0;border-radius:999px;background:var(--tile);color:var(--slate);cursor:pointer}
.mq-pause:hover{color:var(--ink);background:#EBEEF4}.mq-pause[aria-pressed=true]{color:var(--action);background:var(--tint)}
.mq-list{display:flex;gap:12px;margin:0;padding:0 12px 0 0;list-style:none}
.mq-list .pbadge{width:152px;flex-shrink:0}
@keyframes gx-mq{to{transform:translateX(-50%)}}
@media(prefers-reduced-motion:reduce){.mq-ctl{display:none}.marquee{-webkit-mask-image:none;mask-image:none;padding:0}.mq-track{animation:none;width:auto;display:block}.mq-list{flex-wrap:wrap;justify-content:center;padding:0 16px}.mq-list[aria-hidden]{display:none}}
/* DEC-249 home: Raka's 3D counter (render of the hero's own rig) on a porcelain stage + floating UI pills */
.raka-grid{display:grid;gap:32px;align-items:center}@media(min-width:900px){.raka-grid{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:56px}}
.raka-stage{position:relative;margin:0;background:radial-gradient(circle at 50% 30%,rgba(11,79,227,.06),transparent 70%),var(--tile);border-radius:28px;padding:20px 16px 14px;min-width:0}
.raka-stage img{display:block;width:100%;height:auto}
.raka-stage .note{margin:4px 0 0;text-align:center;font-size:.8125rem;color:var(--slate)}
.rk-pill{position:absolute;display:inline-flex;align-items:center;gap:4px;padding:7px 12px;border-radius:999px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.06),0 12px 28px -12px rgba(15,23,42,.24);font-size:.8125rem;color:var(--body);white-space:nowrap}
.rk-pill b{color:var(--ink);font-weight:700}
.rk-a{bottom:24%;right:3%}.rk-b{bottom:12%;left:4%}
.raka-stage.is-playing .rk-float{animation:gx-float 4.2s var(--ease) infinite}.raka-stage.is-playing .rk-late{animation-delay:-2.1s}
@keyframes gx-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@media(prefers-reduced-motion:reduce){.raka-stage .rk-float{animation:none!important}}
@media(max-width:420px){.rk-pill{font-size:.75rem;padding:6px 10px}}
.chips{list-style:none;margin:26px 0 0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.chips li{display:flex;align-items:center;gap:10px;min-height:44px;padding:8px 14px;border-radius:999px;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.05),0 8px 20px -12px rgba(15,23,42,.18);font-weight:600;font-size:.9375rem;color:var(--ink);line-height:1.25}
.chips li::before{content:"";width:8px;height:8px;border-radius:999px;background:var(--action);box-shadow:0 0 0 4px var(--tint);flex-shrink:0}
@media(max-width:400px){.chips{grid-template-columns:1fr}}
/* DEC-249: a slimmer home (<= 6,200px at 1440): tighter rhythm, one-line section titles, compact pricing and FAQ */
@media(min-width:900px){main:has(>.hero-bleed) section.sec{padding-bottom:56px}main:has(>.hero-bleed) .shead{margin-bottom:28px}main:has(>.hero-bleed) .shead .sub{max-width:76ch}main:has(>.hero-bleed) .shead h2{max-width:none}}
main:has(>.hero-bleed) .readout .incl{margin-top:14px;gap:6px;font-size:.9rem}
main:has(>.hero-bleed) .bento{gap:16px}main:has(>.hero-bleed) .bento .tile{padding:1.5rem}
main:has(>.hero-bleed) .closing{padding-bottom:64px}
@media(min-width:900px){main:has(>.hero-bleed) .closing .callout{padding:40px}}main:has(>.hero-bleed) .more{margin-top:12px}
@media(min-width:900px){main:has(>.hero-bleed) #ringkasan{padding-top:40px}main:has(>.hero-bleed) h2{font-size:clamp(1.6rem,1.2rem + 1.2vw,2rem)}main:has(>.hero-bleed) .raka-copy h2{max-width:26ch}}
main:has(>.hero-bleed) .shot-stage{max-height:340px}
main:has(>.hero-bleed) .bento>.tile{gap:18px}
main:has(>.hero-bleed) .faq summary{min-height:48px;padding:12px 0}
main:has(>.hero-bleed) .partners .shead{text-align:center;margin-left:auto;margin-right:auto}main:has(>.hero-bleed) .partners .shead h2,main:has(>.hero-bleed) .partners .shead .sub{margin-left:auto;margin-right:auto}
.pbadge{display:flex;align-items:center;justify-content:center;height:72px;padding:12px;background:var(--tile);border:0;border-radius:16px}
.pbadge img{display:block;width:auto;height:auto;max-width:100%;max-height:30px}
@media(max-width:420px){.pbadge{height:60px;padding:10px}.pbadge img{max-height:24px}}

/* Asymmetric 12-col borderless bento */
.bento{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:20px}
.bento>.tile{grid-column:span 12;justify-content:space-between;gap:28px}
@media(min-width:720px){.bento>.s6,.bento>.s4{grid-column:span 6}.bento>.b5{grid-column:span 12}}
@media(min-width:1024px){.bento>.s4,.bento>.b5{grid-column:span 4}}
@media(min-width:900px){.bento>.s12{flex-direction:row;align-items:center;gap:48px}.s12 .tile-body{flex:1;max-width:46ch}.s12 .float{flex:1.15}}
.tile-body{display:grid;gap:8px;align-content:end}
.tile-body h3{margin:0;font-size:1.1875rem}
.bento.is-playing .float{animation:floatIn .6s var(--ease) both}
@keyframes floatIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.w-rows{margin:0;padding:0;list-style:none;display:grid}
.w-rows>li,.w-rows>div{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:var(--hairline);min-width:0}
.w-rows>li:last-child,.w-rows>div:last-child{border-bottom:0}
.w-rows dt,.w-rows dd{margin:0}
.w-rows b,.w-rows dd{color:var(--ink);font-weight:650;text-align:right}
.w-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-weight:700;color:var(--ink)}
.w-split{display:grid;gap:16px}@media(min-width:520px){.w-split{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}}
.w-rcpt{font:500 .8125rem/1.65 var(--mono);color:var(--ink);font-variant-numeric:tabular-nums}
.w-rcpt div{display:flex;justify-content:space-between;gap:8px}
.w-rcpt .tot{margin-top:6px;padding-top:6px;border-top:1px dashed rgba(15,23,42,.2);font-weight:700}
.lock{display:inline-flex;align-items:center;gap:5px;color:var(--slate);font-weight:600}
.lock svg{flex-shrink:0}
.bars{height:34px;margin:10px 0 6px;background:repeating-linear-gradient(90deg,#0F172A 0 2px,#fff 2px 4px,#0F172A 4px 7px,#fff 7px 9px,#0F172A 9px 10px,#fff 10px 13px)}
.w-lbl{display:grid;grid-template-columns:minmax(0,1fr) 64px;gap:14px;align-items:end}
.w-lbl .qr{width:64px;height:64px;color:var(--ink)}
.w-url{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:999px;background:var(--tile);font:600 .875rem/1.2 var(--mono);color:var(--ink);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.w-url::before{content:"";width:8px;height:8px;border-radius:2px;background:var(--action);flex-shrink:0}
.w-site{display:grid;gap:14px}
.w-tabs{display:flex;flex-wrap:wrap;gap:6px}
.w-pay{display:grid;grid-template-columns:minmax(0,1fr) 72px;gap:14px;align-items:center;padding-top:12px;border-top:var(--hairline)}
.w-pay .qr{width:72px;height:72px;color:var(--ink)}
.w-awb{margin-bottom:2px;font-weight:700;color:var(--ink);letter-spacing:.04em}
.w-gap{margin-top:14px}
.psum{display:grid;gap:40px;align-items:center}@media(min-width:960px){.psum{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px}}
.psum .panel{gap:14px;justify-items:start}
.psum-rows{width:100%;font-size:1rem}
.psum-rows dt{color:var(--body)}
.contact{margin-top:8px;font-size:.975rem}.contact>div{flex-wrap:wrap}.contact dt{color:var(--body)}.contact dd{text-align:left;overflow-wrap:anywhere}
.w-big{font-size:1.5rem;font-weight:800;line-height:1.1;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums}
.w-pin{display:flex;gap:6px;margin-top:4px}
.w-pin span{display:inline-flex;align-items:center;justify-content:center;width:30px;height:36px;border-radius:8px;background:var(--tile);font:700 1rem/1 var(--mono);color:var(--ink)}

/* Soft-pedestal product screenshot (no bezel) with a bottom fade */
.shot{margin:0}
.shot-stage{border-radius:24px;background:radial-gradient(circle at 50% 20%,rgba(11,79,227,.05),transparent 70%),var(--tile);padding:2.5rem 2.5rem 0;max-height:600px;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,#000 78%,transparent 100%);mask-image:linear-gradient(180deg,#000 78%,transparent 100%)}
.shot-stage img{display:block;width:100%;height:auto;border:1px solid rgba(15,23,42,.08);border-radius:14px 14px 0 0;background:#fff;box-shadow:0 24px 48px -12px rgba(15,23,42,.12),0 4px 12px -2px rgba(15,23,42,.04)}
.shot figcaption{margin-top:14px;text-align:center;font-size:.8125rem;color:var(--slate)}
@media(max-width:760px){.shot-stage{padding:1.25rem 1.25rem 0;border-radius:20px;max-height:340px}.shot-stage img{border-radius:10px 10px 0 0}}

/* Asymmetric radio pricing: native radios + :has(), JS data-active fallback, forced-colors fallback */
.pricing{display:grid;gap:24px 40px;align-items:stretch}@media(min-width:900px){.pricing{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}}
.tiers{margin:0;padding:0;border:0;display:grid;gap:12px;align-content:start;min-width:0}
.tiers legend{padding:0;margin-bottom:8px;font-size:.8125rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--slate)}
.tier{position:relative;margin:0;font-weight:400;display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:start;padding:1.1rem 1.2rem;border-radius:18px;background:#fff;box-shadow:inset 0 0 0 1px rgba(15,23,42,.1);cursor:pointer;transition:box-shadow .15s ease-out,background-color .15s ease-out}
.tier:hover{box-shadow:inset 0 0 0 1px rgba(11,79,227,.45)}
.tier:has(input:checked){background:#FAFCFF;box-shadow:inset 0 0 0 2px var(--action)}
.tier:has(input:focus-visible){outline:3px solid #60A5FA;outline-offset:3px}
.tier input{appearance:none;-webkit-appearance:none;margin:3px 0 0;padding:0;border:0;width:20px;height:20px;min-height:0;flex-shrink:0;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--muted);background:#fff;cursor:pointer}
.tier input:checked{box-shadow:inset 0 0 0 6px var(--action)}
.tier input:focus-visible{outline:none}
.t-main{display:grid;gap:4px;min-width:0}
.t-top{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px}
.t-label{font-weight:700;color:var(--ink);font-size:1.0625rem;line-height:1.35}
.t-price{font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.t-note{font-size:.9rem;color:var(--body);line-height:1.5}
.panel{display:grid;gap:24px;align-content:start;padding:2.25rem;border-radius:24px;background:var(--tile);min-width:0}
@media(max-width:640px){.panel{padding:1.5rem;border-radius:20px}}
.readout{display:none;gap:10px;justify-items:start}
.pricing:has(input[value=standar]:checked) .readout[data-plan=standar],.pricing:has(input[value=pro]:checked) .readout[data-plan=pro]{display:grid}
@supports not selector(:has(*)){.readout[data-active]{display:grid}.tier[data-active]{background:#FAFCFF;box-shadow:inset 0 0 0 2px var(--action)}.tier input:focus-visible{outline:3px solid #60A5FA;outline-offset:2px}}
.r-label{margin:0;font-size:.8125rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--slate)}
.r-price{margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
.r-price strong{font-size:clamp(2.2rem,1.7rem + 2vw,3rem);line-height:1;font-weight:800;letter-spacing:-.03em;color:var(--ink);font-variant-numeric:tabular-nums}
.r-price small{font-size:1rem;color:var(--body)}
.r-price strong.r-ask{font-size:clamp(1.75rem,1.4rem + 1.4vw,2.25rem)}
.r-desc{margin:0;color:var(--body);max-width:52ch}
.incl{list-style:none;margin:8px 0 0;padding:20px 0 0;display:grid;gap:10px;border-top:1px solid rgba(15,23,42,.08);width:100%}
.incl li{position:relative;padding-left:28px;font-size:.975rem;color:var(--ink);line-height:1.5}
.incl li::before{content:"";position:absolute;left:0;top:3px;width:18px;height:18px;border-radius:6px;background:#fff}
.incl li::after{content:"";position:absolute;left:6.5px;top:6px;width:4px;height:9px;border:solid var(--action);border-width:0 2px 2px 0;transform:rotate(45deg)}
@media(forced-colors:active){.tier input{appearance:auto;-webkit-appearance:auto;box-shadow:none}.tier:has(input:checked){outline:2px solid CanvasText}.tier[data-active]{outline:2px solid CanvasText}}

/* Open editorial comparison: hairlines only, porcelain wash on the GeraiExpress column */
.cmp{width:100%;border-collapse:collapse;font-size:.9375rem;line-height:1.5;text-align:left}
.cmp th,.cmp td{padding:16px 18px;border-bottom:var(--hairline);vertical-align:top}
.cmp thead th{padding-top:20px;padding-bottom:14px;font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--slate)}
.cmp tbody tr:last-child>*{border-bottom:0}
.cmp th[scope=row]{padding-left:0;font-weight:700;color:var(--ink)}
.cmp thead th:first-child{padding-left:0}
.cmp td{color:var(--body)}
.cmp .ours{background:var(--tile);color:var(--ink);font-weight:650}
.cmp thead .ours{border-radius:16px 16px 0 0;color:var(--ink);font-size:.95rem;letter-spacing:-.01em;text-transform:none}
.cmp tbody tr:last-child .ours{border-radius:0 0 16px 16px}
.sq{display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:2px;background:var(--action);vertical-align:middle}
@media(max-width:860px){
.cmp thead{display:none}
.cmp,.cmp tbody,.cmp tr,.cmp th,.cmp td{display:block}
.cmp tr{padding:18px 0;border-bottom:var(--hairline)}
.cmp tbody tr:last-child{border-bottom:0}
.cmp th,.cmp td{padding:0;border:0}
.cmp th[scope=row]{font-size:1rem;margin-bottom:6px}
.cmp td{display:grid;grid-template-columns:132px minmax(0,1fr);gap:8px;padding:4px 0}
.cmp td::before{content:attr(data-col);font-size:.8125rem;font-weight:700;color:var(--slate)}
.cmp td.ours,.cmp tbody tr:last-child td.ours{margin-top:6px;padding:10px 12px;border-radius:12px}
.cmp td.ours::before{color:var(--action)}
}

/* Open hairline tables (no outer box, no tinted header) */
.tbl-wrap{overflow-x:auto}
table.tbl{width:100%;border-collapse:collapse;font-size:.9375rem;text-align:left}
.tbl th{color:var(--slate);font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:14px 16px 12px;white-space:nowrap;border-bottom:var(--hairline)}
.tbl td{padding:16px;vertical-align:top;color:var(--body);border-bottom:var(--hairline)}
.tbl th:first-child,.tbl td:first-child{padding-left:0}
.tbl tbody tr:last-child td{border-bottom:0}
.tbl td strong{color:var(--ink)}
.tcour{display:flex;align-items:center;gap:12px;white-space:nowrap}

/* Alternating 5fr/7fr rows (adsbook PillarRows / StepFlow parity): /fitur pillars and /cara-kerja steps */
.prows{display:grid;gap:56px}@media(min-width:900px){.prows{gap:88px}}
.prow{display:grid;gap:24px;align-items:center;scroll-margin-top:calc(var(--hdr-h) + 24px);min-width:0}
@media(min-width:900px){.prow{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:56px}.prow.flip .prow-text{order:2}}
.prow-text{display:grid;gap:14px;align-content:start;min-width:0}
.prow h2{font-size:clamp(1.45rem,1.2rem + .9vw,1.85rem);font-weight:800;letter-spacing:-.022em;margin:0}
.plabel{display:flex;align-items:center;gap:11px;margin:0;font-size:.9375rem;font-weight:600;color:var(--slate)}
.pno{font:600 .78rem/1 var(--mono);letter-spacing:.08em;color:var(--slate)}
.ptext{margin:0;color:var(--body)}
.sqlist{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:11px;color:var(--body)}
.sqlist li{display:grid;grid-template-columns:10px minmax(0,1fr);gap:14px}
.sqlist li::before{content:"";width:7px;height:7px;margin-top:.62em;background:var(--action)}
.pstage{display:grid;place-items:center;padding:2.5rem;min-height:260px}.pstage>.float{width:min(100%,420px);padding:1.25rem 1.35rem}
.pshot .shot-stage{padding:2rem 2rem 0;max-height:440px}
.spec{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px 40px;padding:2.5rem;border-radius:24px;background:var(--tile)}
.spec div{display:grid;gap:6px;align-content:start;min-width:0}
.spec dt{font-weight:800;font-size:clamp(1.6rem,1.2rem + 1.4vw,2.3rem);letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.1}
.spec dd{margin:0;color:var(--body);font-size:.9375rem}
@media(max-width:640px){.pstage{padding:1rem;min-height:0}.spec{padding:1.5rem;gap:22px;border-radius:20px}.pshot .shot-stage{padding:1rem 1rem 0}}
/* Everyday capabilities: a quiet three-column hairline list, no cards */
.caps{margin:0;display:grid;gap:0 48px}@media(min-width:600px){.caps{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:900px){.caps{grid-template-columns:repeat(3,minmax(0,1fr))}}
.caps div{display:grid;gap:5px;align-content:start;padding:22px 0;border-top:var(--hairline)}
.caps dt{font-weight:700;color:var(--ink)}.caps dd{margin:0;color:var(--body)}
/* /cara-kerja: porcelain jump strip, role rows, pipeline */
.jump{list-style:none;margin:0 0 56px;padding:8px;display:grid;gap:6px;border-radius:16px;background:var(--tile)}@media(min-width:900px){.jump{grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:80px}}
.jump a{display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 12px;border-radius:12px;color:var(--ink);text-decoration:none;font-weight:600;font-size:.9375rem;transition:background-color .15s,box-shadow .15s}
@media(min-width:900px){.jump a{justify-content:center;text-align:center}}
.jump a:hover{background:#fff;box-shadow:var(--shadow-float);color:var(--ink)}
.jn{padding:2px 7px;border-radius:6px;background:#fff;color:var(--action);font:600 .75rem/1.2 var(--mono)}
.who{margin:6px 0 0;padding-top:16px;border-top:var(--hairline);display:grid;gap:12px}
.who div{display:grid;gap:2px}@media(min-width:520px){.who div{grid-template-columns:9.5rem minmax(0,1fr);gap:14px}}
.who dt{font-weight:700;color:var(--ink);font-size:.9375rem}.who dd{margin:0;color:var(--body)}
.pipe{--cycle:6s;position:relative;list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px}
.pipe::before{content:"";position:absolute;top:21px;left:10%;right:10%;height:1px;background:#E2E8F0}
.stop{position:relative;display:grid;gap:14px;justify-items:center;text-align:center;min-width:0}
.node{position:relative;z-index:1;width:44px;height:44px;display:grid;place-items:center;border-radius:12px;background:var(--action);color:#fff;font:800 1rem/1 var(--mono);box-shadow:var(--shadow-float)}
.stop-t{margin:0 0 4px;font-weight:800;color:var(--ink)}.stop-d{margin:0;font-size:.875rem;line-height:1.5;color:var(--body)}
.pulse{position:absolute;z-index:2;top:16px;left:10%;width:12px;height:12px;margin-left:-6px;background:var(--action);box-shadow:0 0 0 4px rgba(11,79,227,.18),0 0 14px rgba(11,79,227,.6);opacity:0;pointer-events:none}
.pipeline.is-playing .node{background:var(--tile);color:var(--action);box-shadow:none;animation:node-lit var(--cycle) linear infinite;animation-delay:calc(var(--n) * var(--cycle) / 6)}
.pipeline.is-playing .pulse{opacity:1;animation:pulse-x var(--cycle) cubic-bezier(.45,0,.55,1) infinite}
@keyframes node-lit{0%,3%{background:var(--tile);color:var(--action);box-shadow:none}8%,70%{background:var(--action);color:#fff;box-shadow:0 0 0 4px rgba(11,79,227,.16)}85%,100%{background:var(--tile);color:var(--action);box-shadow:none}}
@keyframes pulse-x{0%{left:10%;opacity:0}6%{opacity:1}83%{left:90%;opacity:1}92%,100%{left:90%;opacity:0}}
@media(max-width:760px){
.pipe{grid-template-columns:1fr;grid-auto-rows:1fr;gap:20px}
.pipe::before{top:22px;bottom:calc((100% - 80px) / 5 - 22px);left:21px;right:auto;width:2px;height:auto}
.stop{grid-template-columns:44px minmax(0,1fr);justify-items:start;text-align:left;align-items:start;gap:16px}
.pulse{top:22px;left:16px;margin:-6px 0 0}
.pipeline.is-playing .pulse{animation-name:pulse-y}
@keyframes pulse-y{0%{top:22px;opacity:0}6%{opacity:1}83%{top:calc(100% - (100% - 80px) / 5 + 22px);opacity:1}92%,100%{top:calc(100% - (100% - 80px) / 5 + 22px);opacity:0}}}
@media(prefers-reduced-motion:reduce){.pipeline .node,.pipeline .pulse{animation:none!important;transition:none!important}.pipeline .pulse{display:none}.jump a{transition:none}}

/* FAQ: open hairline accordion rows on white */
.faq{max-width:80ch;border-top:var(--hairline)}
.faq details{border-bottom:var(--hairline)}
.faq summary{min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;font-weight:650;color:var(--ink);font-size:1.0625rem;list-style:none;padding:16px 0}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";flex-shrink:0;width:28px;height:28px;display:inline-grid;place-items:center;font-size:1.4rem;font-weight:400;line-height:1;color:var(--slate);transition:transform .2s var(--ease),color .2s var(--ease)}
.faq details[open] summary::after{transform:rotate(45deg);color:var(--action)}
.faq summary:hover{color:var(--action)}
.faq .ans{padding:0 0 20px;color:var(--body);font-size:1rem;margin:0;max-width:72ch}
/* /tanya-jawab: pill index in the head, 4fr/8fr groups with the title kept in view */
.faq-index{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:4px}
.faq-index a{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;background:var(--tile);color:var(--ink);font-size:.9375rem;font-weight:600;text-decoration:none}
.faq-index a:hover{background:var(--tint);color:var(--action)}
.fgroups{display:grid;gap:56px}@media(min-width:900px){.fgroups{gap:72px}}
.fgroup{display:grid;gap:16px;align-items:start;scroll-margin-top:calc(var(--hdr-h) + 24px)}
.fgroup h2{font-size:clamp(1.3rem,1.1rem + .8vw,1.6rem);margin:0;max-width:22ch}
@media(min-width:900px){.fgroup{grid-template-columns:minmax(0,4fr) minmax(0,8fr);gap:40px}.fgroup h2{position:sticky;top:calc(var(--hdr-h) + 24px)}}
/* /hubungi-kami: two borderless porcelain panels */
.contact2{display:grid;gap:24px;align-items:start}@media(min-width:860px){.contact2{grid-template-columns:repeat(2,minmax(0,1fr))}}
.cpanel{display:grid;gap:16px;align-content:start;padding:2.25rem;border-radius:24px;background:var(--tile);min-width:0}
.cpanel h2{font-size:1.4rem;margin:0}.cpanel p{margin:0;color:var(--body)}
.channels{margin:0;display:grid}
.channels div{display:grid;gap:2px;padding:12px 0;border-bottom:var(--hairline)}.channels div:last-child{border-bottom:0}
.channels dt{font-size:.8125rem;font-weight:700;color:var(--slate)}.channels dd{margin:0;color:var(--ink);overflow-wrap:anywhere}
.cp-note{font-size:.9375rem}
@media(max-width:640px){.cpanel{padding:1.5rem;border-radius:20px}}

/* Simulator */
label{display:block;font-weight:600;font-size:.92rem;color:var(--ink);margin:12px 0 6px}
label:first-child{margin-top:0}
input,select{width:100%;min-height:46px;font-size:1rem;padding:8px 12px;border:1px solid #7B879C;border-radius:10px;background:#fff;color:var(--ink)}
.sim{display:grid;gap:24px;align-items:start}@media(min-width:920px){.sim{grid-template-columns:1fr 1.05fr}.sim-sticky{position:sticky;top:88px}}
.sim h2{font-size:1.25rem;margin:0;letter-spacing:-.015em}
.sim-stage{background:var(--tile);border-radius:24px;padding:2rem;display:grid;gap:16px;align-content:start;min-width:0}
@media(max-width:640px){.sim-stage{padding:1.25rem;border-radius:20px}}
.sim-fields{display:grid;gap:16px}
.fld{display:grid;gap:6px;min-width:0}.fld label,.fld .fld-lbl{margin:0}
.fld-2{display:grid;gap:16px}@media(min-width:560px){.fld-2{grid-template-columns:repeat(2,minmax(0,1fr))}}
.fld .qw{margin-top:4px}
.sim-h{margin-top:8px!important}.sim-p{margin:0;color:var(--body)}
.sim-rates{padding:4px 14px}
@media(max-width:640px){.sim .opt-main{font-size:1rem}}
.lbl-top{display:flex;justify-content:space-between;gap:8px;font-weight:700;color:var(--ink)}
.lbl-dest{margin:0;color:var(--body);font-size:.875rem}
#rates li{grid-template-columns:76px minmax(0,1fr) auto}
ul.rates button{min-height:44px;padding:0 14px;border:0;border-radius:999px;background:var(--tint);color:var(--action);font-size:.9375rem;font-weight:700;cursor:pointer;font-variant-numeric:tabular-nums;white-space:nowrap}
ul.rates button:hover{background:var(--action);color:#fff}
@media(max-width:420px){#rates li{grid-template-columns:60px minmax(0,1fr) auto}}
.receipt{border-radius:16px;padding:18px;background:#fff;box-shadow:var(--shadow-float);font-family:var(--mono);font-size:.875rem;line-height:1.5;white-space:pre-wrap;color:var(--ink);overflow-x:auto}
.lbl-preview{border-radius:16px;padding:18px;background:#fff;box-shadow:var(--shadow-float);margin-top:6px;font-size:.875rem}
.lbl-bar{height:28px;background:repeating-linear-gradient(90deg,#0F172A 0 3px,#fff 3px 6px,#0F172A 6px 8px,#fff 8px 12px);border-radius:3px;margin:10px 0}
.qw{display:flex;flex-wrap:wrap;gap:6px}

/* Prose (legal) */
.prose{max-width:70ch}.prose h2{font-size:1.35rem;margin-top:32px;max-width:none}.prose p,.prose li{color:var(--ink)}

/* Closing callout: centered porcelain stage, flowing into the porcelain footer */
.closing{padding:24px 0 96px}
.closing .callout{background:var(--tile);border-radius:28px;padding:56px 24px;text-align:center;display:grid;justify-items:center;gap:6px}
@media(min-width:900px){.closing .callout{padding:72px 48px}}
.closing h2{margin:0 auto 8px}
.closing p{margin:0 auto;color:var(--body);max-width:54ch}
.closing .row{justify-content:center;margin-top:24px}
.more{margin:22px 0 0}.more a{color:var(--action);font-weight:650;text-decoration:none;display:inline-flex;align-items:center;min-height:44px}.more a:hover{text-decoration:underline}
.show-grid{display:grid;gap:40px;align-items:center}@media(min-width:960px){.show-grid{grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:56px}}
.layers{position:relative;margin:0;background:var(--tile);border-radius:24px;padding:24px 16px 18px;overflow:hidden;min-width:0}
@media(min-width:640px){.layers{padding:36px 32px 24px}}
.layer-back{background:#fff;border-radius:16px;padding:14px;opacity:.9;-webkit-mask-image:linear-gradient(180deg,#000 50%,transparent 100%);mask-image:linear-gradient(180deg,#000 50%,transparent 100%)}
.kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}@media(min-width:640px){.kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}
.kpis div{background:var(--tile);border-radius:12px;padding:10px 12px;display:grid;gap:2px;min-width:0}
.kpis span{font-size:.75rem;color:var(--slate);font-weight:600}
.kpis b{font-size:.95rem;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.spark{display:flex;align-items:flex-end;gap:6px;height:64px;margin-top:12px}
.spark i{flex:1;background:#CBD5E1;border-radius:4px 4px 0 0}.spark i:last-child{background:var(--action)}
.layer-front{position:relative;margin:-56px 0 0 auto;width:min(100%,540px);padding:1rem 1.1rem}
.lf-title{margin:0 0 6px;font-weight:700;color:var(--ink);font-size:.9375rem}
.lf-table{width:100%;border-collapse:collapse;font-size:.8125rem}
.lf-table th{font-size:.75rem;color:var(--slate);font-weight:600;text-align:left;padding:6px 6px 6px 0;border-bottom:var(--hairline)}
.lf-table td{padding:9px 6px 9px 0;border-bottom:var(--hairline);color:var(--ink);white-space:nowrap;font-variant-numeric:tabular-nums}
.lf-table tr:last-child td{border-bottom:0}
.lf-table td:first-child{display:flex;align-items:center;gap:8px;white-space:normal}.lf-table img{height:14px;width:auto;flex-shrink:0}
.st{display:inline-flex;padding:2px 9px;border-radius:999px;font-size:.75rem;font-weight:650;background:#F1F5F9;color:var(--body);white-space:nowrap}.st.ok{background:var(--tint);color:var(--action)}
.layers figcaption{margin-top:14px;font-size:.8125rem;color:var(--slate)}
@media(max-width:520px){.lf-table th:nth-child(3),.lf-table td:nth-child(3){display:none}}
.proof{display:grid;gap:20px}@media(min-width:900px){.proof{grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}}
.proof .float{margin-top:auto}
.rb{display:grid;gap:12px}
.rb-note{margin:2px 0 0;font-size:.75rem;color:var(--slate)}
.rb-row{display:grid;grid-template-columns:7.2rem minmax(0,1fr) auto;gap:10px;align-items:center;font-size:.8125rem;color:var(--ink)}
.rb-bar{height:10px;border-radius:999px;background:#EEF1F5;position:relative;overflow:hidden}
.rb-bar>i{position:absolute;inset:0 auto 0 0;border-radius:999px;background:#CBD5E1}.rb-bar.ok>i{background:var(--action)}
.roles{margin:0}
.roles>div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:var(--hairline);font-size:.8125rem}
.roles>div:last-child{border-bottom:0}
.roles dt{color:var(--ink);font-weight:650}.roles dd{margin:0;color:var(--body);text-align:right}
footer.ftr{background:var(--tile);border-top:var(--hairline);padding:56px 0 40px;color:var(--body);font-size:.9375rem}
.fgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 24px}.fbrand{grid-column:1/-1}.fbrand-p{margin:0;max-width:44ch}
@media(min-width:820px){.fgrid{grid-template-columns:1.4fr 1fr 1fr;gap:28px}.fbrand{grid-column:auto}}
.ftr .brand{margin:0 0 10px}
.fcol h3{font-size:.8125rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);margin:0 0 10px}
.fcol ul{list-style:none;margin:0;padding:0;display:grid;gap:6px;align-content:start}
.fcol a{color:var(--body);text-decoration:none;display:inline-flex;align-items:center;min-height:28px;line-height:1.45}.fcol a:hover{color:var(--action);text-decoration:underline}
.flegal{margin-top:40px;padding-top:20px;border-top:var(--hairline);display:grid;gap:6px;font-size:.875rem}
`
