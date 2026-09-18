import { CITIES, countryFlag, findCity } from "./cities.js";
import { LANGS, DEFAULT_LANG, pathPrefix, t, regionLabel } from "./i18n.js";
import { getSunTimes } from "./solar.js";
import { getHolidaysForCountry, mergeHolidays } from "./holidays.js";
import { getKoreaHolidays } from "./korea-holidays.js";
import { weatherCodeLabel } from "./enrichment.js";
import { WORLD_MAP_SVG, WORLD_MAP_VIEWBOX, WORLD_MAP_PROJECTION } from "./world-map-svg.js";

const HUB_SLUGS = ["new-york", "london", "tokyo", "dubai", "sydney"];

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cityUrl(origin, langCode, slug) {
  return `${origin}${pathPrefix(langCode)}/${slug}`;
}

function homeUrl(origin, langCode) {
  const prefix = pathPrefix(langCode);
  return `${origin}${prefix}/`;
}

function gaSnippet(gaId) {
  if (!gaId) return "";
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaId}');
  </script>`;
}

// og:locale / hreflang 매핑
const OG_LOCALE_MAP = {
  en: "en_US",
  ko: "ko_KR",
  ja: "ja_JP",
  "zh-cn": "zh_CN",
  "zh-tw": "zh_TW",
  es: "es_ES",
  fr: "fr_FR",
  de: "de_DE",
  pt: "pt_BR",
  ru: "ru_RU",
};

function ogLocale(langCode) {
  return OG_LOCALE_MAP[langCode] || "en_US";
}

// 소셜 공유 메타(OG + Twitter Card) 통합 생성.
// og-image.png는 실제 1200x630 이미지 파일을 별도로 준비해서 정적 호스팅해야 합니다
// (Cloudflare Workers 정적 자산 바인딩, R2, 또는 외부 CDN 등).
function socialMetaHtml({ langCode, title, description, url, origin, imagePath }) {
  const image = `${origin}${imagePath || "/og-image.png"}`;
  const alternateLocales = LANGS.filter((l) => l.code !== langCode)
    .map((l) => `  <meta property="og:locale:alternate" content="${ogLocale(l.code)}" />`)
    .join("\n");

  return `  <meta property="og:site_name" content="${escapeHtml(t(langCode, "siteName"))}" />
  <meta property="og:locale" content="${ogLocale(langCode)}" />
${alternateLocales}
  <meta property="og:image" content="${image}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${escapeHtml(title)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${image}" />
  <meta name="theme-color" content="#111111" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />`;
}

// GA를 쓰는 페이지에서 DNS/TLS 핸드셰이크를 미리 시작해 체감 로딩을 살짝 앞당긴다.
// gaId가 없으면 아예 안 쓰는 스크립트라 preconnect도 필요 없음.
function preconnectHtml(gaId) {
  if (!gaId) return "";
  return `  <link rel="preconnect" href="https://www.googletagmanager.com" />`;
}

function websiteJsonLd(langCode, origin) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: t(langCode, "siteName"),
    url: origin,
  };
}

function breadcrumbJsonLd(langCode, origin, city) {
  const homeLabel = t(langCode, "siteName");
  const regionKey = city.region;
  const regionText = regionLabel(langCode, regionKey);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: homeLabel, item: homeUrl(origin, langCode) },
      { "@type": "ListItem", position: 2, name: regionText },
      { "@type": "ListItem", position: 3, name: city.name, item: cityUrl(origin, langCode, city.slug) },
    ],
  };
}

// ── 서버 사이드 시간 계산 헬퍼 ──────────────────────────────
// 초기 페이지에 실제 값을 박아넣어(검색엔진이 JS 없이도 읽도록) SEO에 유리하게 하고,
// 이후 클라이언트 스크립트가 매초 갱신을 이어받는다.

function offsetMinutesAt(tz, date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const o = {};
  parts.forEach((p) => (o[p.type] = p.value));
  const asUTC = Date.UTC(
    Number(o.year),
    Number(o.month) - 1,
    Number(o.day),
    o.hour === "24" ? 0 : Number(o.hour),
    Number(o.minute),
    Number(o.second)
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

function formatOffsetLabel(tz, date) {
  const mins = offsetMinutesAt(tz, date);
  const sign = mins >= 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

function observesDST(tz) {
  const now = new Date();
  const jan = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const jul = new Date(Date.UTC(now.getUTCFullYear(), 6, 1));
  return offsetMinutesAt(tz, jan) !== offsetMinutesAt(tz, jul);
}

function formatTimeNow(tz, locale) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function formatDateNow(tz, locale) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function diffLabel(langCode, tz, requesterOffsetMinutes) {
  const cityOffset = offsetMinutesAt(tz, new Date());
  const diffH = Math.round((cityOffset - requesterOffsetMinutes) / 60);
  if (diffH === 0) return t(langCode, "sameTime");
  return diffH > 0
    ? t(langCode, "hoursAhead", { n: diffH })
    : t(langCode, "hoursBehind", { n: Math.abs(diffH) });
}

function baseStyles() {
  return `
    :root{ --ink:#111; --sub:#666; --line:#eee; --accent:#2b6cff; --bg:#fafafa; --page-bg:#fff; --card-bg:transparent; }
    [data-theme="dark"]{ --ink:#f2f2f2; --sub:#9a9a9a; --line:#2a2a2a; --accent:#5b9dff; --bg:#1c1c1e; --page-bg:#0f0f10; --card-bg:#17171a; }
    [data-theme="sepia"]{ --ink:#3b2f22; --sub:#8a7660; --line:#e4d8c3; --accent:#a6672c; --bg:#f4ecdd; --page-bg:#fbf6ec; --card-bg:#fff9ef; }
    [data-theme="ocean"]{ --ink:#0b2942; --sub:#5b7c93; --line:#d7e6ee; --accent:#0077b6; --bg:#eef7fb; --page-bg:#ffffff; --card-bg:#f7fbfd; }
    *{box-sizing:border-box;}
    html{ background:var(--page-bg); }
    body{ max-width:880px; margin:0 auto; padding:24px 16px 60px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:var(--page-bg); transition:background .15s ease, color .15s ease; }
    a{ color:inherit; }
    header.site{ display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; margin-bottom:28px; padding-bottom:16px; border-bottom:1px solid var(--line); }
    header.site .brand{ font-size:19px; font-weight:700; text-decoration:none; }
    .header-controls{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
    .theme-switch{ display:flex; align-items:center; gap:6px; }
    .theme-dot{ width:18px; height:18px; border-radius:50%; background:var(--dot); border:2px solid transparent; cursor:pointer; padding:0; }
    .theme-dot[aria-pressed="true"]{ border-color:var(--ink); }
    .lang-switch{ display:flex; flex-wrap:wrap; gap:6px; font-size:12.5px; }
    .lang-switch a{ padding:4px 9px; border-radius:12px; background:var(--bg); text-decoration:none; color:var(--sub); }
    .lang-switch a.active{ background:var(--ink); color:#fff; }
    h1{ font-size:22px; margin:0 0 6px; }
    p.tagline{ color:var(--sub); font-size:14.5px; margin:0 0 28px; }
    .region-block{ margin-bottom:28px; }
    .region-title{ font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--sub); margin:0 0 10px; }
    .city-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; }
    .city-card{ display:block; padding:12px 14px; border:1px solid var(--line); border-radius:10px; text-decoration:none; background:var(--card-bg); transition:border-color .15s ease, background .15s ease; }
    .city-card:hover{ border-color:var(--accent); }
    .city-card .flag{ font-size:18px; margin-right:6px; }
    .city-card .cname{ font-weight:600; font-size:14.5px; }
    .city-card .ccountry{ color:var(--sub); font-size:12px; margin-top:2px; }
    .city-card .ctime{ font-family:'SFMono-Regular',Consolas,monospace; font-size:15px; margin-top:6px; color:var(--accent); }

    .clock-hero{ position:relative; text-align:center; padding:36px 16px; border:1px solid var(--line); border-radius:16px; margin:8px 0 24px; background:var(--bg); }
    .clock-hero .flag-big{ font-size:34px; }
    .clock-hero h1{ font-size:22px; margin:6px 0 2px; }
    .clock-hero .country{ color:var(--sub); font-size:14px; margin-bottom:18px; }
    .clock-hero .clock{ font-family:'SFMono-Regular',Consolas,monospace; font-size:56px; font-weight:600; letter-spacing:0.02em; line-height:1; transition:font-size .15s ease; }
    .clock-hero.size-sm .clock{ font-size:38px; }
    .clock-hero.size-lg .clock{ font-size:80px; }
    .clock-hero .date{ font-size:15px; color:var(--sub); margin-top:10px; }
    .clock-hero:fullscreen{ display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; border-radius:0; margin:0; }
    .clock-hero:fullscreen .clock{ font-size:min(20vw,160px); }

    .clock-toolbar{ position:absolute; top:10px; right:10px; display:flex; gap:6px; }
    .clock-toolbar button{ width:30px; height:30px; border-radius:8px; border:1px solid var(--line); background:var(--page-bg); color:var(--ink); cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; padding:0; }
    .clock-toolbar button:hover{ border-color:var(--accent); }
    .your-location-label{ font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--sub); margin:0 0 10px; text-align:left; }
    .holiday-row{ display:flex; justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--line); font-size:14px; }
    .holiday-row .hname{ font-weight:500; }
    .holiday-row .hdate{ color:var(--sub); font-family:'SFMono-Regular',Consolas,monospace; font-size:13px; }
    .fact-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin:20px 0 32px; }
    .fact{ border:1px solid var(--line); border-radius:10px; padding:14px 16px; background:var(--card-bg); }
    .fact .flabel{ font-size:12px; color:var(--sub); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px; }
    .fact .fvalue{ font-size:16px; font-weight:600; }
    .section-title{ font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--sub); margin:36px 0 12px; }
    .section-title:first-of-type{ margin-top:0; }
    .back-link{ display:inline-block; margin-bottom:18px; font-size:14px; color:var(--sub); text-decoration:none; }
    .back-link:hover{ text-decoration:underline; }
    .faq{ border-top:1px solid var(--line); padding:16px 0; }
    .faq:first-of-type{ border-top:none; }
    .faq h3{ font-size:15px; margin:0 0 6px; }
    .faq p{ font-size:14px; color:var(--ink-soft,#333); margin:0; line-height:1.6; }
    footer.foot{ margin-top:48px; padding-top:16px; border-top:1px solid var(--line); font-size:12.5px; color:var(--sub); text-align:center; }
    [dir="rtl"] .clock-hero .flag-big{ direction:ltr; }

    .tools-nav{ display:flex; gap:16px; font-size:13px; margin:0 0 22px; }
    .tools-nav a{ color:var(--accent); text-decoration:none; }
    .tools-nav a:hover{ text-decoration:underline; }

    .city-card-wrap{ position:relative; }
    .city-card-wrap .city-card{ display:block; }
    .fav-star{ position:absolute; top:6px; right:6px; background:none; border:none; font-size:16px; line-height:1; cursor:pointer; color:var(--sub); padding:4px; }
    .fav-star.active{ color:#e0a500; }

    .tool-form{ border:1px solid var(--line); border-radius:12px; padding:22px; background:var(--card-bg); margin-bottom:28px; }
    .tool-row{ display:flex; flex-wrap:wrap; gap:14px; margin-bottom:14px; align-items:flex-end; }
    .tool-field{ display:flex; flex-direction:column; gap:5px; flex:1; min-width:160px; }
    .tool-field label{ font-size:12.5px; color:var(--sub); }
    .tool-field select, .tool-field input{ padding:9px 10px; border:1px solid var(--line); border-radius:8px; font-size:14.5px; background:var(--page-bg); color:var(--ink); }
    .convert-result{ font-size:18px; font-weight:600; padding:16px; border-radius:10px; background:var(--bg); text-align:center; margin-top:6px; }
    .convert-result .arrow{ color:var(--sub); font-weight:400; margin:0 8px; }

    .meeting-table{ width:100%; border-collapse:collapse; font-size:13.5px; }
    .meeting-table th, .meeting-table td{ padding:8px 6px; text-align:center; border-bottom:1px solid var(--line); white-space:nowrap; }
    .meeting-table th.city-col, .meeting-table td.city-col{ text-align:left; white-space:normal; }
    .meeting-table td.business{ background:color-mix(in srgb, var(--accent) 16%, transparent); }
    .meeting-remove{ background:none; border:none; color:var(--sub); cursor:pointer; font-size:13px; margin-left:6px; }
    .meeting-scroll{ overflow-x:auto; }
    .meeting-add-row{ display:flex; gap:10px; margin-bottom:18px; flex-wrap:wrap; align-items:flex-end; }

    .embed-box{ border:1px solid var(--line); border-radius:10px; padding:16px; background:var(--card-bg); margin:24px 0; }
    .embed-box textarea{ width:100%; min-height:70px; font-family:'SFMono-Regular',Consolas,monospace; font-size:12.5px; padding:10px; border:1px solid var(--line); border-radius:8px; background:var(--page-bg); color:var(--ink); resize:vertical; }
    .embed-copy-btn{ margin-top:10px; padding:8px 16px; border-radius:8px; border:1px solid var(--line); background:var(--bg); color:var(--ink); cursor:pointer; font-size:13.5px; }
    .embed-copy-btn:hover{ border-color:var(--accent); }

    /* ── 모바일 반응형 ── */
    @media (max-width: 600px){
      body{ padding:16px 12px 48px; }
      header.site{ flex-direction:column; align-items:flex-start; gap:10px; }
      .header-controls{ width:100%; justify-content:space-between; }
      .clock-hero .clock{ font-size:38px; }
      .clock-hero{ padding:26px 12px; }
      .fact-grid{ grid-template-columns:repeat(2,1fr); }
      .city-grid{ grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); }
      .tools-nav{ flex-wrap:wrap; gap:10px 16px; }
      .tool-row{ flex-direction:column; align-items:stretch; }
      .tool-field{ min-width:0; }
      .meeting-add-row{ flex-direction:column; align-items:stretch; }
      .sw-display, .timer-display{ font-size:42px !important; }
    }
    @media (max-width: 380px){
      .clock-hero .clock{ font-size:32px; }
      .fact-grid{ grid-template-columns:1fr 1fr; }
    }

    /* ── 세계지도 + 아날로그 시계 보드 (즐겨찾기 도시) ── */
    .wc-board{ margin:0 0 20px; }
    .wc-map{
      position:relative; width:100%; aspect-ratio:2/1; border-radius:16px; overflow:hidden;
      margin-bottom:16px; border:1px solid var(--line);
      background:
        radial-gradient(ellipse at 28% 22%, rgba(255,255,255,.07), transparent 55%),
        repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px calc(100%/8)),
        repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 1px, transparent 1px calc(100%/12)),
        linear-gradient(160deg,#0c1830,#050a16);
    }
    .wc-map-pins{ position:absolute; inset:0; }
    .wc-night-overlay{ position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
    .wc-world-svg{ position:absolute; inset:0; width:100%; height:100%; opacity:.9; }
    .wc-world-svg path{ fill:#1c3a5e; stroke:#0a1830; stroke-width:.6; }
    .wc-map-credit{ position:absolute; right:8px; bottom:6px; font-size:9.5px; color:rgba(255,255,255,.35); text-decoration:none; }
    .wc-map-credit:hover{ color:rgba(255,255,255,.6); }
    .wc-pin{ position:absolute; transform:translate(-50%,-100%); display:flex; flex-direction:column; align-items:center; }
    .wc-pin-city{ font-size:9px; color:#8fb6da; font-weight:600; text-transform:uppercase; letter-spacing:.04em; margin-bottom:3px; white-space:nowrap; }
    .wc-pin-bubble{ background:rgba(8,16,32,.92); color:#eaf4ff; font-size:11px; font-weight:600; padding:3px 8px; border-radius:8px; white-space:nowrap; border:1px solid rgba(255,255,255,.14); font-family:'SFMono-Regular',Consolas,monospace; margin-bottom:3px; }
    .wc-pin-dot{ width:8px; height:8px; border-radius:50%; background:#5ec8ff; position:relative; box-shadow:0 0 0 3px rgba(94,200,255,.22); }
    .wc-pin-dot::after{ content:''; position:absolute; inset:-6px; border-radius:50%; border:1px solid rgba(94,200,255,.45); animation:wcPulse 2.6s ease-out infinite; }
    .wc-pin.wc-pin-night .wc-pin-dot{ background:#ffb454; box-shadow:0 0 0 3px rgba(255,180,84,.22); }
    .wc-pin.wc-pin-night .wc-pin-dot::after{ border-color:rgba(255,180,84,.45); }
    @keyframes wcPulse{ 0%{ transform:scale(.5); opacity:.9; } 100%{ transform:scale(2.1); opacity:0; } }

    .wc-analog-row{ display:flex; flex-wrap:wrap; gap:14px; }
    .wc-analog-card{ display:flex; flex-direction:column; align-items:center; width:92px; text-align:center; }
    .wc-analog-face{ width:70px; height:70px; margin-bottom:8px; }
    .wc-face-bg{ fill:var(--card-bg); stroke:var(--line); stroke-width:2.5; }
    .wc-tick-major{ stroke:var(--sub); stroke-width:2.2; stroke-linecap:round; }
    .wc-tick-minor{ stroke:var(--line); stroke-width:1.2; stroke-linecap:round; }
    .wc-hand{ stroke-linecap:round; }
    .wc-hand-hour{ stroke:var(--ink); stroke-width:4.5; }
    .wc-hand-min{ stroke:var(--ink); stroke-width:3; }
    .wc-hand-sec{ stroke:var(--accent); stroke-width:1.4; }
    .wc-hand-pivot{ fill:var(--accent); }
    .wc-analog-city{ font-size:12.5px; font-weight:600; }
    .wc-analog-time{ font-family:'SFMono-Regular',Consolas,monospace; font-size:12px; color:var(--sub); margin-top:1px; }
    .wc-analog-diff{ font-size:10.5px; color:var(--accent); margin-top:1px; }
    @media (max-width:600px){
      .wc-analog-card{ width:76px; }
      .wc-analog-face{ width:58px; height:58px; }
    }
  `;
}

function formatNumber(n, locale) {
  if (typeof n !== "number") return "—";
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch (e) {
    return String(n);
  }
}

function enrichmentSectionHtml(langCode, lang, enrichment) {
  if (!enrichment) return "";
  const { countryInfo, weather, wiki, oecd } = enrichment;
  const parts = [];

  if (countryInfo) {
    const rows = [];
    if (countryInfo.capital) rows.push(`<div class="fact"><div class="flabel">${escapeHtml(t(langCode, "capitalLabel"))}</div><div class="fvalue">${escapeHtml(countryInfo.capital)}</div></div>`);
    if (countryInfo.population) rows.push(`<div class="fact"><div class="flabel">${escapeHtml(t(langCode, "populationLabel"))}</div><div class="fvalue">${formatNumber(countryInfo.population, lang.locale)}</div></div>`);
    if (countryInfo.languages && countryInfo.languages.length) rows.push(`<div class="fact"><div class="flabel">${escapeHtml(t(langCode, "languagesLabel"))}</div><div class="fvalue">${escapeHtml(countryInfo.languages.slice(0, 3).join(", "))}</div></div>`);
    if (countryInfo.currencies && countryInfo.currencies.length) rows.push(`<div class="fact"><div class="flabel">${escapeHtml(t(langCode, "currencyLabel"))}</div><div class="fvalue">${escapeHtml(countryInfo.currencies.slice(0, 2).join(", "))}</div></div>`);
    if (oecd && oecd.gdpPerCapitaPpp) rows.push(`<div class="fact"><div class="flabel">${escapeHtml(t(langCode, "gdpPerCapitaLabel"))}</div><div class="fvalue">$${formatNumber(oecd.gdpPerCapitaPpp, lang.locale)} <span style="font-size:11px;color:var(--sub);">(${oecd.year}, OECD)</span></div></div>`);
    if (rows.length) {
      parts.push(`
  <div class="section-title">${escapeHtml(t(langCode, "countryInfoTitle"))}</div>
  <div class="fact-grid">${rows.join("")}</div>`);
    }
  }

  if (weather && typeof weather.temperatureC === "number") {
    parts.push(`
  <div class="section-title">${escapeHtml(t(langCode, "weatherTitle"))}</div>
  <div class="fact-grid">
    <div class="fact"><div class="flabel">${escapeHtml(t(langCode, "temperatureLabel"))}</div><div class="fvalue">${Math.round(weather.temperatureC)}°C — ${escapeHtml(weatherCodeLabel(weather.weatherCode))}</div></div>
    <div class="fact"><div class="flabel">${escapeHtml(t(langCode, "humidityLabel"))}</div><div class="fvalue">${weather.humidity}%</div></div>
    <div class="fact"><div class="flabel">${escapeHtml(t(langCode, "windLabel"))}</div><div class="fvalue">${Math.round(weather.windSpeedKmh)} km/h</div></div>
  </div>
  <p style="font-size:11.5px; color:var(--sub); margin-top:-4px;">${escapeHtml(t(langCode, "weatherSourceNote"))}</p>`);
  }

  if (wiki && wiki.extract) {
    parts.push(`
  <div class="section-title">${escapeHtml(t(langCode, "aboutTitle"))}</div>
  <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start;">
    ${wiki.thumbnailUrl ? `<img src="${escapeHtml(wiki.thumbnailUrl)}" alt="" loading="lazy" style="width:160px; height:auto; border-radius:10px; flex-shrink:0;" />` : ""}
    <div style="flex:1; min-width:220px;">
      <p style="font-size:14.5px; line-height:1.7; margin:0 0 8px;">${escapeHtml(wiki.extract)}</p>
      ${wiki.pageUrl ? `<a href="${escapeHtml(wiki.pageUrl)}" target="_blank" rel="noopener noreferrer nofollow" style="font-size:13px; color:var(--accent);">${escapeHtml(t(langCode, "readOnWikipediaLabel"))} →</a>` : ""}
    </div>
  </div>`);
  }

  return parts.join("\n");
}

function langSwitcherHtml(currentLangCode, buildHref) {
  const items = LANGS.map((l) => {
    const active = l.code === currentLangCode ? ' class="active"' : "";
    return `<a href="${buildHref(l.code)}"${active} hreflang="${l.code === "zh-cn" ? "zh-CN" : l.code === "zh-tw" ? "zh-TW" : l.code}">${l.code.toUpperCase()}</a>`;
  }).join("");
  return `<div class="lang-switch">${items}</div>`;
}

function clockToolbarHtml(langCode, shareUrl, shareTitle) {
  return `<div class="clock-toolbar" data-share-url="${escapeHtml(shareUrl)}" data-share-title="${escapeHtml(shareTitle)}" data-copied-text="${escapeHtml(t(langCode, "shareCopiedText"))}">
    <button type="button" class="ct-share" aria-label="${escapeHtml(t(langCode, "shareLabel"))}" title="${escapeHtml(t(langCode, "shareLabel"))}">⤴</button>
    <button type="button" class="ct-fontsize" aria-label="${escapeHtml(t(langCode, "fontSizeLabel"))}" title="${escapeHtml(t(langCode, "fontSizeLabel"))}">A</button>
    <button type="button" class="ct-fullscreen" aria-label="${escapeHtml(t(langCode, "fullscreenLabel"))}" title="${escapeHtml(t(langCode, "fullscreenLabel"))}">⛶</button>
  </div>`;
}

function clockToolbarScript() {
  return `<script>
(function(){
  var SIZE_KEY = 'wc-fontsize';
  var SIZES = ['sm', 'md', 'lg'];

  function applySize(size){
    document.querySelectorAll('.clock-hero').forEach(function(hero){
      hero.classList.remove('size-sm', 'size-lg');
      if (size === 'sm') hero.classList.add('size-sm');
      if (size === 'lg') hero.classList.add('size-lg');
    });
  }

  var savedSize = 'md';
  try { savedSize = localStorage.getItem(SIZE_KEY) || 'md'; } catch(e) {}
  applySize(savedSize);

  document.addEventListener('click', function(e){
    var shareBtn = e.target.closest('.ct-share');
    if (shareBtn) {
      var toolbar = shareBtn.closest('.clock-toolbar');
      var url = toolbar.getAttribute('data-share-url');
      var title = toolbar.getAttribute('data-share-title');
      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function(){});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function(){
          var original = shareBtn.textContent;
          shareBtn.textContent = '✓';
          setTimeout(function(){ shareBtn.textContent = original; }, 1200);
        });
      }
      return;
    }

    var sizeBtn = e.target.closest('.ct-fontsize');
    if (sizeBtn) {
      var idx = SIZES.indexOf(savedSize);
      savedSize = SIZES[(idx + 1) % SIZES.length];
      try { localStorage.setItem(SIZE_KEY, savedSize); } catch(e) {}
      applySize(savedSize);
      return;
    }

    var fsBtn = e.target.closest('.ct-fullscreen');
    if (fsBtn) {
      var hero = fsBtn.closest('.clock-hero');
      if (!hero) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else if (hero.requestFullscreen) {
        hero.requestFullscreen();
      }
      return;
    }
  });
})();
</script>`;
}

function themeSwitcherHtml(langCode) {
  const items = [
    { value: "light", dot: "#2b6cff", labelKey: "themeLight" },
    { value: "dark", dot: "#5b9dff", labelKey: "themeDark" },
    { value: "sepia", dot: "#a6672c", labelKey: "themeSepia" },
    { value: "ocean", dot: "#0077b6", labelKey: "themeOcean" },
  ]
    .map(
      (opt) =>
        `<button type="button" class="theme-dot" data-theme-value="${opt.value}" style="--dot:${opt.dot}" aria-label="${escapeHtml(t(langCode, opt.labelKey))}" aria-pressed="false"></button>`
    )
    .join("");
  return `<div class="theme-switch" role="group" aria-label="${escapeHtml(t(langCode, "themeLabel"))}">${items}</div>`;
}

// 최초 방문 시 브라우저 언어(navigator.language)를 감지해 맞는 언어 경로로 자동 리디렉션.
// 사용자가 언어 전환 버튼을 한 번이라도 직접 누르면 그 선택을 존중해 이후로는 자동 전환하지 않는다.
// (웹사이트는 OS 언어를 직접 읽을 수 없고, 브라우저가 알려주는 navigator.language만 알 수 있다 —
//  보통은 OS 언어와 같지만, 크롬 자체 설정에서 따로 바꿨다면 그 값을 따른다.)
function langInitScript(langCode) {
  return `<script>(function(){
  try {
    document.addEventListener('click', function(e){
      var a = e.target.closest('.lang-switch a');
      if (a) {
        try { localStorage.setItem('wc-lang-set', '1'); } catch(err) {}
        try { document.cookie = 'wc-lang-set=1; path=/; max-age=31536000; SameSite=Lax'; } catch(err) {}
      }
    });

    var alreadySet = false;
    try { alreadySet = localStorage.getItem('wc-lang-set') === '1'; } catch(e) {}
    if (alreadySet) return;

    var alreadyRedirected = false;
    try { alreadyRedirected = sessionStorage.getItem('wc-lang-redirected') === '1'; } catch(e) {}
    if (alreadyRedirected) return;

    var SUPPORTED = ${JSON.stringify(LANGS.map((l) => l.code))};

    function normalize(tag){
      if (!tag) return null;
      tag = tag.toLowerCase();
      if (tag.indexOf('zh') === 0) {
        if (tag.indexOf('tw') !== -1 || tag.indexOf('hant') !== -1 || tag.indexOf('hk') !== -1 || tag.indexOf('mo') !== -1) return 'zh-tw';
        return 'zh-cn';
      }
      var base = tag.split('-')[0];
      return SUPPORTED.indexOf(base) !== -1 ? base : null;
    }

    var langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
    var detected = null;
    for (var i = 0; i < langs.length; i++) {
      var n = normalize(langs[i]);
      if (n) { detected = n; break; }
    }
    if (!detected || detected === ${JSON.stringify(langCode)}) return;

    var segments = location.pathname.split('/').filter(Boolean);
    var rest = segments;
    if (segments.length && SUPPORTED.indexOf(segments[0].toLowerCase()) !== -1 && segments[0].toLowerCase() !== 'en') {
      rest = segments.slice(1);
    }
    var prefix = detected === 'en' ? '' : '/' + detected;
    var newPath = prefix + '/' + rest.join('/') + location.search;

    try { sessionStorage.setItem('wc-lang-redirected', '1'); } catch(e) {}
    location.replace(newPath);
  } catch(e) {}
})();</script>`;
}

// <head> 최상단에서 실행되어, 저장된 테마를 CSS 적용 전에 즉시 세팅 (깜빡임 방지)
function themeInitScript() {
  return `<script>(function(){try{var t=localStorage.getItem('wc-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;
}

function themeSwitchScript() {
  return `<script>
(function(){
  var KEY = 'wc-theme';
  var root = document.documentElement;
  function apply(theme){
    root.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-dot').forEach(function(b){
      b.setAttribute('aria-pressed', b.getAttribute('data-theme-value') === theme ? 'true' : 'false');
    });
  }
  var saved = 'light';
  try { saved = localStorage.getItem(KEY) || 'light'; } catch(e) {}
  apply(saved);
  document.querySelectorAll('.theme-dot').forEach(function(b){
    b.addEventListener('click', function(){
      var val = b.getAttribute('data-theme-value');
      try { localStorage.setItem(KEY, val); } catch(e) {}
      apply(val);
    });
  });
})();
</script>`;
}

function alternateLinksHtml(buildHref) {
  const tags = LANGS.map((l) => {
    const hreflang = l.code === "zh-cn" ? "zh-CN" : l.code === "zh-tw" ? "zh-TW" : l.code;
    return `  <link rel="alternate" hreflang="${hreflang}" href="${buildHref(l.code)}" />`;
  }).join("\n");
  const xDefault = `  <link rel="alternate" hreflang="x-default" href="${buildHref(DEFAULT_LANG)}" />`;
  return `${tags}\n${xDefault}`;
}

function cityCardHtml(origin, langCode, lang, c) {
  return `
        <div class="city-card-wrap" data-slug="${c.slug}">
          <a class="city-card" href="${cityUrl(origin, langCode, c.slug)}">
            <div><span class="flag">${countryFlag(c.cc)}</span><span class="cname">${escapeHtml(c.name)}</span></div>
            <div class="ccountry">${escapeHtml(c.country)}</div>
            <div class="ctime" data-tz="${c.tz}" data-locale="${lang.locale}">${escapeHtml(formatTimeNow(c.tz, lang.locale))}</div>
          </a>
          <button type="button" class="fav-star" data-slug="${c.slug}" aria-label="${escapeHtml(t(langCode, "addFavoriteLabel"))}">☆</button>
        </div>`;
}

function toolsNavHtml(langCode, origin) {
  const prefix = pathPrefix(langCode);
  return `<nav class="tools-nav">
    <a href="${origin}${prefix}/convert">${escapeHtml(t(langCode, "navConverter"))}</a>
    <a href="${origin}${prefix}/meeting-planner">${escapeHtml(t(langCode, "navMeetingPlanner"))}</a>
    <a href="${origin}${prefix}/stopwatch">${escapeHtml(t(langCode, "navStopwatch"))}</a>
    <a href="${origin}${prefix}/timer">${escapeHtml(t(langCode, "navTimer"))}</a>
    <a href="${origin}${prefix}/alarm">${escapeHtml(t(langCode, "navAlarm"))}</a>
  </nav>`;
}

function clockScript(city) {
  return `<script>
(function(){
  var tz = ${JSON.stringify(city.tz)};
  var locale = document.documentElement.getAttribute('data-locale') || 'en-US';
  var clockEl = document.getElementById('clock');
  var dateEl = document.getElementById('clock-date');
  var offsetEl = document.getElementById('utc-offset-value');
  var deviceEl = document.getElementById('device-time-value');
  var diffEl = document.getElementById('diff-value');

  var timeFmt = new Intl.DateTimeFormat(locale, { timeZone: tz, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  var dateFmt = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday:'long', year:'numeric', month:'long', day:'numeric' });
  var offsetFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName:'longOffset', hour:'2-digit' });
  var deviceFmt = new Intl.DateTimeFormat(locale, { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });

  function offsetMinutes(timeZone, date){
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: timeZone, hourCycle:'h23',
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }).formatToParts(date);
    var o = {};
    parts.forEach(function(p){ o[p.type] = p.value; });
    var asUTC = Date.UTC(o.year, o.month - 1, o.day, o.hour === '24' ? 0 : o.hour, o.minute, o.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

  function tick(){
    var now = new Date();
    if (clockEl) clockEl.textContent = timeFmt.format(now);
    if (dateEl) dateEl.textContent = dateFmt.format(now);
    if (offsetEl) {
      var parts = offsetFmt.formatToParts(now);
      var tzName = parts.find(function(p){ return p.type === 'timeZoneName'; });
      offsetEl.textContent = tzName ? tzName.value.replace('GMT','UTC') : offsetEl.textContent;
    }
    if (deviceEl) deviceEl.textContent = deviceFmt.format(now);
    if (diffEl) {
      var cityOffset = offsetMinutes(tz, now);
      var localOffset = -now.getTimezoneOffset();
      var diffH = Math.round((cityOffset - localOffset) / 60);
      diffEl.textContent = diffH === 0
        ? diffEl.getAttribute('data-same')
        : (diffH > 0
            ? diffEl.getAttribute('data-ahead').replace('{n}', diffH)
            : diffEl.getAttribute('data-behind').replace('{n}', Math.abs(diffH)));
    }
  }
  tick();
  setInterval(tick, 1000);
})();
</script>`;
}

function miniClockScript() {
  return `<script>
(function(){
  function tick(){
    var now = new Date();
    document.querySelectorAll('[data-tz]').forEach(function(el){
      var tz = el.getAttribute('data-tz');
      var locale = el.getAttribute('data-locale') || 'en-US';
      try {
        el.textContent = new Intl.DateTimeFormat(locale, { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:false }).format(now);
      } catch(e) {}
    });
  }
  tick();
  setInterval(tick, 1000 * 10);
})();
</script>`;
}

// 즐겨찾기: localStorage에 슬러그 배열로 저장. 홈페이지 상단에 즐겨찾기 카드를 복제해서 보여줌.
function favoritesScript() {
  return `<script>
(function(){
  var KEY = 'wc-favorites';
  function getFavs(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; } }
  function setFavs(arr){ try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch(e){} }
  function toggle(slug){
    var favs = getFavs();
    var idx = favs.indexOf(slug);
    if (idx === -1) favs.push(slug); else favs.splice(idx, 1);
    setFavs(favs);
  }
  function renderStars(){
    var favs = getFavs();
    document.querySelectorAll('.fav-star').forEach(function(btn){
      var slug = btn.getAttribute('data-slug');
      var active = favs.indexOf(slug) !== -1;
      btn.textContent = active ? '★' : '☆';
      btn.classList.toggle('active', active);
    });
  }
  function renderFavoritesSection(){
    var body = document.getElementById('favorites-body');
    var empty = document.getElementById('favorites-empty');
    if (!body) return;
    var favs = getFavs();
    if (!favs.length) {
      body.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    var frag = document.createDocumentFragment();
    favs.forEach(function(slug){
      var original = document.querySelector('.region-block .city-card-wrap[data-slug="' + slug + '"]');
      if (original) frag.appendChild(original.cloneNode(true));
    });
    body.innerHTML = '';
    body.appendChild(frag);
  }
  document.addEventListener('click', function(e){
    var btn = e.target.closest('.fav-star');
    if (!btn) return;
    e.preventDefault();
    toggle(btn.getAttribute('data-slug'));
    renderStars();
    renderFavoritesSection();
  });
  renderStars();
  renderFavoritesSection();
})();
</script>`;
}

// 즐겨찾기 도시들을 세계지도 핀 + 아날로그 시계 카드로 그려주는 보드.
// favoritesScript()가 관리하는 localStorage 'wc-favorites' 값을 그대로 읽어서 쓴다.
// 실제 위성지도 이미지는 쓰지 않고(외부 의존성/깨짐 리스크 회피) CSS 그리드 배경 +
// 위경도 기반 퍼센트 좌표(equirectangular)로 핀을 배치한다.
function worldBoardScript(langCode) {
  const labelAhead = t(langCode, "hoursAhead");
  const labelBehind = t(langCode, "hoursBehind");
  const labelSame = t(langCode, "sameTime");
  const citiesJson = JSON.stringify(
    CITIES.map((c) => ({ slug: c.slug, name: c.name, tz: c.tz, lat: c.lat, lng: c.lng }))
  );

  return `<script>
(function(){
  var KEY = 'wc-favorites';
  var MAX_SHOW = 10;
  var CITIES = ${citiesJson};
  var PROJ = ${JSON.stringify(WORLD_MAP_PROJECTION)};
  var VB = ${JSON.stringify(WORLD_MAP_VIEWBOX)};
  var boardEl = document.getElementById('wc-board');
  var pinsEl = document.getElementById('wc-map-pins');
  var rowEl = document.getElementById('wc-analog-row');
  if (!boardEl || !pinsEl || !rowEl) return;

  var locale = document.documentElement.getAttribute('data-locale') || 'en-US';
  var labelAhead = ${JSON.stringify(labelAhead)};
  var labelBehind = ${JSON.stringify(labelBehind)};
  var labelSame = ${JSON.stringify(labelSame)};

  function getFavs(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; } }

  // 위경도 → 지도 패널 위 퍼센트 좌표. 가장자리(피지 등 날짜변경선 부근)가
  // 패널 밖으로 튀어나가지 않도록 살짝 여백을 두고 clamp 한다.
  function project(lng, lat){
    var svgX = PROJ.a * lng + PROJ.b;
    var svgY = PROJ.c * lat + PROJ.d;
    var left = ((svgX - VB.x) / VB.width) * 100;
    var top = ((svgY - VB.y) / VB.height) * 100;
    left = Math.max(1.5, Math.min(98.5, left));
    top = Math.max(2, Math.min(98, top));
    return { left: left, top: top };
  }

  // ---- 밤/낮 터미네이터 ----
  // 태양이 지금 어느 경도 위에(직하점) 떠 있는지, 적위(declination)가 몇 도인지
  // 근사식으로 구해서, 경도별 명암 경계 위도를 계산해 야간 영역 폴리곤을 그린다.
  // (정밀한 항해력 수준은 아니고, 시각적으로 자연스러운 정도의 근사치)
  function subsolarPoint(date){
    var start = Date.UTC(date.getUTCFullYear(), 0, 1);
    var dayOfYear = Math.floor((date.getTime() - start) / 86400000) + 1;
    var decl = -23.44 * Math.cos((2 * Math.PI / 365.25) * (dayOfYear + 10));
    var utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    var lngSun = -(utcHours - 12) * 15;
    lngSun = ((lngSun + 540) % 360) - 180;
    return { decl: decl, lngSun: lngSun };
  }

  function terminatorLat(lng, declRad, lngSun){
    var H = (lng - lngSun) * Math.PI / 180;
    var tanDecl = Math.tan(declRad);
    if (Math.abs(tanDecl) < 1e-6) return Math.cos(H) >= 0 ? -89.9 : 89.9;
    var lat = Math.atan(-Math.cos(H) / tanDecl) * 180 / Math.PI;
    return lat;
  }

  function updateNightOverlay(now){
    var pathEl = document.getElementById('wc-night-path');
    if (!pathEl) return;
    var sp = subsolarPoint(now);
    var declRad = sp.decl * Math.PI / 180;
    var nightIsNorth = sp.decl < 0; // 태양 적위가 남쪽이면(겨울철) 북반구 쪽이 밤
    var poleLat = nightIsNorth ? 90 : -90;

    var pts = [];
    var step = 4;
    for (var lng = -180; lng <= 180; lng += step) {
      var lat = terminatorLat(lng, declRad, sp.lngSun);
      var pr = project(lng, lat);
      pts.push(pr.left.toFixed(2) + ',' + pr.top.toFixed(2));
    }
    var poleY = nightIsNorth ? 0 : 100;
    var d = 'M ' + pts.join(' L ');
    d += ' L 100,' + poleY + ' L 0,' + poleY + ' Z';
    pathEl.setAttribute('d', d);
  }

  function offsetMinutes(tz, date){
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle:'h23',
      year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }).formatToParts(date);
    var o = {}; parts.forEach(function(p){ o[p.type] = p.value; });
    var asUTC = Date.UTC(o.year, o.month - 1, o.day, o.hour === '24' ? 0 : o.hour, o.minute, o.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

  var currentCities = [];
  var built = false;

  function findCity(slug){
    for (var i = 0; i < CITIES.length; i++) { if (CITIES[i].slug === slug) return CITIES[i]; }
    return null;
  }

  function build(){
    var favs = getFavs().slice(0, MAX_SHOW);
    var list = favs.map(findCity).filter(Boolean);

    if (!list.length) {
      boardEl.style.display = 'none';
      currentCities = [];
      built = false;
      return;
    }
    boardEl.style.display = '';
    currentCities = list;

    // ---- 지도 핀 ----
    pinsEl.innerHTML = '';
    list.forEach(function(c){
      var pr = project(c.lng, c.lat);
      var left = pr.left, top = pr.top;
      var pin = document.createElement('div');
      pin.className = 'wc-pin';
      pin.style.left = left + '%';
      pin.style.top = top + '%';
      pin.setAttribute('data-slug', c.slug);

      var cityLbl = document.createElement('div');
      cityLbl.className = 'wc-pin-city';
      cityLbl.textContent = c.name;

      var bubble = document.createElement('div');
      bubble.className = 'wc-pin-bubble';
      bubble.textContent = '--:--';

      var dot = document.createElement('div');
      dot.className = 'wc-pin-dot';

      pin.appendChild(cityLbl);
      pin.appendChild(bubble);
      pin.appendChild(dot);
      pinsEl.appendChild(pin);
    });

    // ---- 아날로그 시계 카드 ----
    rowEl.innerHTML = '';
    list.forEach(function(c){
      var card = document.createElement('div');
      card.className = 'wc-analog-card';
      card.setAttribute('data-slug', c.slug);

      var ticks = '';
      for (var i = 0; i < 12; i++) {
        var major = (i % 3 === 0);
        ticks += '<line x1="50" y1="6" x2="50" y2="' + (major ? 13 : 10) + '" class="' +
          (major ? 'wc-tick-major' : 'wc-tick-minor') + '" transform="rotate(' + (i * 30) + ' 50 50)"/>';
      }
      card.innerHTML =
        '<svg viewBox="0 0 100 100" class="wc-analog-face">' +
          '<circle cx="50" cy="50" r="47" class="wc-face-bg"/>' +
          ticks +
          '<line x1="50" y1="50" x2="50" y2="30" class="wc-hand wc-hand-hour"/>' +
          '<line x1="50" y1="50" x2="50" y2="18" class="wc-hand wc-hand-min"/>' +
          '<line x1="50" y1="55" x2="50" y2="14" class="wc-hand wc-hand-sec"/>' +
          '<circle cx="50" cy="50" r="2.8" class="wc-hand-pivot"/>' +
        '</svg>' +
        '<div class="wc-analog-city"></div>' +
        '<div class="wc-analog-time">--:--</div>' +
        '<div class="wc-analog-diff">—</div>';
      card.querySelector('.wc-analog-city').textContent = c.name;
      rowEl.appendChild(card);
    });
    built = true;
  }

  function tick(){
    if (!built) return;
    var now = new Date();
    var localOffset = -now.getTimezoneOffset();
    updateNightOverlay(now);

    Array.prototype.forEach.call(pinsEl.querySelectorAll('.wc-pin'), function(pin){
      var city = findCity(pin.getAttribute('data-slug'));
      if (!city) return;
      var hourNum = Number(new Intl.DateTimeFormat('en-US', { timeZone: city.tz, hour:'2-digit', hour12:false }).format(now));
      var isNight = hourNum < 6 || hourNum >= 19;
      pin.classList.toggle('wc-pin-night', isNight);
      var bubble = pin.querySelector('.wc-pin-bubble');
      if (bubble) bubble.textContent = new Intl.DateTimeFormat(locale, { timeZone: city.tz, hour:'2-digit', minute:'2-digit', hour12:false }).format(now);
    });

    Array.prototype.forEach.call(rowEl.querySelectorAll('.wc-analog-card'), function(card){
      var city = findCity(card.getAttribute('data-slug'));
      if (!city) return;
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: city.tz, hourCycle:'h23', hour:'2-digit', minute:'2-digit', second:'2-digit' }).formatToParts(now);
      var o = {}; parts.forEach(function(p){ o[p.type] = p.value; });
      var h = Number(o.hour) % 24, m = Number(o.minute), s = Number(o.second);
      var hourDeg = (h % 12) * 30 + m * 0.5;
      var minDeg = m * 6 + s * 0.1;
      var secDeg = s * 6;

      var hourHand = card.querySelector('.wc-hand-hour');
      var minHand = card.querySelector('.wc-hand-min');
      var secHand = card.querySelector('.wc-hand-sec');
      if (hourHand) hourHand.setAttribute('transform', 'rotate(' + hourDeg + ' 50 50)');
      if (minHand) minHand.setAttribute('transform', 'rotate(' + minDeg + ' 50 50)');
      if (secHand) secHand.setAttribute('transform', 'rotate(' + secDeg + ' 50 50)');

      var timeEl = card.querySelector('.wc-analog-time');
      if (timeEl) timeEl.textContent = new Intl.DateTimeFormat(locale, { timeZone: city.tz, hour:'2-digit', minute:'2-digit', hour12:false }).format(now);

      var diffEl = card.querySelector('.wc-analog-diff');
      if (diffEl) {
        var cityOffset = offsetMinutes(city.tz, now);
        var diffH = Math.round((cityOffset - localOffset) / 60);
        diffEl.textContent = diffH === 0 ? labelSame
          : (diffH > 0 ? labelAhead.replace('{n}', diffH) : labelBehind.replace('{n}', Math.abs(diffH)));
      }
    });
  }

  // 즐겨찾기 별 클릭 시 favoritesScript()가 localStorage를 먼저 갱신한 뒤
  // (이 스크립트가 뒤에 로드되므로 같은 클릭 이벤트 내에서 순서 보장됨) 재빌드.
  document.addEventListener('click', function(e){
    if (e.target.closest('.fav-star')) { build(); tick(); }
  });

  build();
  tick();
  setInterval(tick, 1000);
})();
</script>`;
}

// ---- 홈 페이지 ----
export function renderHomePage(langCode, origin, gaId, visitorTz) {
  const lang = LANGS.find((l) => l.code === langCode) || LANGS[0];
  const url = homeUrl(origin, langCode);
  const visitorTzAttr = visitorTz ? escapeHtml(visitorTz) : "";
  const title = t(langCode, "siteName");
  const description = t(langCode, "homeDescription");

  const regionsOrder = ["americas", "europe", "africa_me", "asia", "oceania"];
  const blocks = regionsOrder
    .map((regionKey) => {
      const cities = CITIES.filter((c) => c.region === regionKey);
      const cards = cities.map((c) => cityCardHtml(origin, langCode, lang, c)).join("");
      return `
      <div class="region-block">
        <div class="region-title">${escapeHtml(regionLabel(langCode, regionKey))}</div>
        <div class="city-grid">${cards}</div>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="${lang.code === "zh-cn" ? "zh-CN" : lang.code === "zh-tw" ? "zh-TW" : lang.code}" dir="${lang.dir}" data-locale="${lang.locale}">
<head>
  <meta charset="UTF-8" />
  ${preconnectHtml(gaId)}
  ${langInitScript(langCode)}
  ${themeInitScript()}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — ${escapeHtml(t(langCode, "tagline"))}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${url}" />
${alternateLinksHtml((code) => homeUrl(origin, code))}
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${url}" />
${socialMetaHtml({ langCode, title, description, url, origin, imagePath: "/og/home.png" })}
  <script type="application/ld+json">${JSON.stringify(websiteJsonLd(langCode, origin))}</script>
  <style>${baseStyles()}</style>
  ${gaSnippet(gaId)}
</head>
<body>
  <header class="site">
    <a class="brand" href="${homeUrl(origin, langCode)}">🕒 ${escapeHtml(t(langCode, "siteName"))}</a>
    <div class="header-controls">
      ${themeSwitcherHtml(langCode)}
      ${langSwitcherHtml(langCode, (code) => homeUrl(origin, code))}
    </div>
  </header>
  ${toolsNavHtml(langCode, origin)}
  <h1>${escapeHtml(t(langCode, "siteName"))}</h1>
  <p class="tagline">${escapeHtml(t(langCode, "tagline"))}</p>

  <div id="your-location-wrap" data-visitor-tz="${visitorTzAttr}"></div>

  <div class="section-title" style="margin-top:0;">${escapeHtml(t(langCode, "favoritesTitle"))}</div>
  <p id="favorites-empty" style="color:var(--sub); font-size:13.5px; margin:0 0 12px;">${escapeHtml(t(langCode, "noFavorites"))}</p>
  <div class="wc-board" id="wc-board" style="display:none;">
    <div class="wc-map" id="wc-map">
      ${WORLD_MAP_SVG}
      <svg class="wc-night-overlay" id="wc-night-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs><filter id="wcNightBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>
        <path id="wc-night-path" d="" fill="rgba(2,6,16,.5)" filter="url(#wcNightBlur)"/>
      </svg>
      <div class="wc-map-pins" id="wc-map-pins"></div>
      <a class="wc-map-credit" href="https://github.com/flekschas/simple-world-map" target="_blank" rel="noopener noreferrer nofollow">Map: A. MacDonald / F. Lekschas, CC BY-SA 3.0</a>
    </div>
    <div class="wc-analog-row" id="wc-analog-row"></div>
  </div>
  <div class="city-grid" id="favorites-body" style="margin-bottom:8px;"></div>

  ${blocks}
  <footer class="foot">${escapeHtml(t(langCode, "footerText"))}</footer>
  ${miniClockScript()}
  ${favoritesScript()}
  ${worldBoardScript(langCode)}
  ${themeSwitchScript()}
  ${clockToolbarScript()}
  <script>
  (function(){
    var wrap = document.getElementById('your-location-wrap');
    if (!wrap) return;

    var CITIES = ${JSON.stringify(CITIES.map((c) => ({ slug: c.slug, name: c.name, tz: c.tz, cc: c.cc })))};
    var locale = document.documentElement.getAttribute('data-locale') || 'en-US';
    var pathPrefixStr = ${JSON.stringify(pathPrefix(langCode))};

    var tz = wrap.getAttribute('data-visitor-tz');
    if (!tz && window.Intl) {
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e) { tz = null; }
    }
    if (!tz) return; // 위치를 전혀 알 수 없으면 섹션을 그냥 표시하지 않는다

    var match = null;
    for (var i = 0; i < CITIES.length; i++) {
      if (CITIES[i].tz === tz) { match = CITIES[i]; break; }
    }
    var displayName = match ? match.name : (tz.split('/').pop() || tz).replace(/_/g, ' ');

    function flagFromCC(cc){
      if (!cc || cc.length !== 2) return '🌐';
      var cps = cc.toUpperCase().split('').map(function(c){ return 127397 + c.charCodeAt(0); });
      return String.fromCodePoint.apply(null, cps);
    }
    function makeBtn(cls, label, icon){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.setAttribute('aria-label', label);
      b.title = label;
      b.textContent = icon;
      return b;
    }

    var label = document.createElement('div');
    label.className = 'your-location-label';
    label.textContent = ${JSON.stringify(t(langCode, "yourLocationTitle"))};

    var hero = document.createElement('div');
    hero.className = 'clock-hero';
    

    var toolbar = document.createElement('div');
    toolbar.className = 'clock-toolbar';
    var shareUrl = match ? (location.origin + pathPrefixStr + '/' + match.slug) : location.href;
    toolbar.setAttribute('data-share-url', shareUrl);
    toolbar.setAttribute('data-share-title', displayName);
    toolbar.appendChild(makeBtn('ct-share', ${JSON.stringify(t(langCode, "shareLabel"))}, '⤴'));
    toolbar.appendChild(makeBtn('ct-fontsize', ${JSON.stringify(t(langCode, "fontSizeLabel"))}, 'A'));
    toolbar.appendChild(makeBtn('ct-fullscreen', ${JSON.stringify(t(langCode, "fullscreenLabel"))}, '⛶'));
    hero.appendChild(toolbar);

    var flagEl = document.createElement('div');
    flagEl.className = 'flag-big';
    flagEl.textContent = match ? flagFromCC(match.cc) : '🌐';
    hero.appendChild(flagEl);

    var nameEl;
    if (match) {
      var a = document.createElement('a');
      a.href = pathPrefixStr + '/' + match.slug;
      a.style.textDecoration = 'none';
      a.style.color = 'inherit';
      var h1a = document.createElement('h1');
      h1a.textContent = displayName;
      a.appendChild(h1a);
      nameEl = a;
    } else {
      nameEl = document.createElement('h1');
      nameEl.textContent = displayName;
    }
    hero.appendChild(nameEl);

    var clockEl = document.createElement('div');
    clockEl.className = 'clock';
    clockEl.id = 'your-clock';
    clockEl.textContent = '--:--:--';
    hero.appendChild(clockEl);

    var dateEl = document.createElement('div');
    dateEl.className = 'date';
    dateEl.id = 'your-clock-date';
    hero.appendChild(dateEl);

    wrap.appendChild(label);
    wrap.appendChild(hero);

    function tick(){
      var now = new Date();
      try {
        clockEl.textContent = new Intl.DateTimeFormat(locale, { timeZone: tz, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(now);
        dateEl.textContent = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday:'long', year:'numeric', month:'long', day:'numeric' }).format(now);
      } catch(e) {}
    }
    tick();
    setInterval(tick, 1000);
  })();
  </script>
</body>
</html>`;
}

// ---- 도시 페이지 ----
export async function renderCityPage(city, langCode, origin, gaId, kasiApiKey, enrichment) {
  const lang = LANGS.find((l) => l.code === langCode) || LANGS[0];
  const url = cityUrl(origin, langCode, city.slug);
  const now = new Date();

  let holidayItems = getHolidaysForCountry(city.cc, now.getUTCFullYear());
  if (city.cc === "KR" && kasiApiKey) {
    try {
      const kasiItems = await getKoreaHolidays(kasiApiKey, now.getUTCFullYear());
      if (kasiItems.length) holidayItems = mergeHolidays(holidayItems, kasiItems);
    } catch (e) {
      // API 실패 시 계산 가능한 목록만으로 조용히 폴백
    }
  }
  const holidayRowsHtml = holidayItems
    .map((h) => {
      const dateText = new Intl.DateTimeFormat(lang.locale, {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      }).format(h.date);
      return `<div class="holiday-row"><span class="hname">${escapeHtml(h.name)}</span><span class="hdate">${escapeHtml(dateText)}</span></div>`;
    })
    .join("");

  const otherCities = CITIES.filter(
    (c) => c.region === city.region && c.slug !== city.slug
  ).slice(0, 8);
  const otherCards = otherCities.map((c) => cityCardHtml(origin, langCode, lang, c)).join("");

  const hubCities = CITIES.filter(
    (c) => HUB_SLUGS.includes(c.slug) && c.slug !== city.slug
  );
  const hubCards = hubCities.map((c) => cityCardHtml(origin, langCode, lang, c)).join("");

  const sameTzCities = CITIES.filter(
    (c) => c.tz === city.tz && c.slug !== city.slug
  );
  const sameTzCards = sameTzCities.map((c) => cityCardHtml(origin, langCode, lang, c)).join("");

  const title = `${escapeHtml(t(langCode, "currentTimeIn", { city: city.name }))} — ${escapeHtml(t(langCode, "siteName"))}`;
  const description = t(langCode, "cityMetaDescription", {
    city: city.name,
    country: city.country,
  });

  const offsetLabel = formatOffsetLabel(city.tz, now);
  const hasDST = observesDST(city.tz);
  const initialTime = formatTimeNow(city.tz, lang.locale);
  const initialDate = formatDateNow(city.tz, lang.locale);

  const sunTimes = getSunTimes(city, now);
  const timeOnlyFmt = { hour: "2-digit", minute: "2-digit", hour12: false };
  const sunriseLabelValue = sunTimes.sunrise
    ? new Intl.DateTimeFormat(lang.locale, { ...timeOnlyFmt, timeZone: city.tz }).format(sunTimes.sunrise)
    : "—";
  const sunsetLabelValue = sunTimes.sunset
    ? new Intl.DateTimeFormat(lang.locale, { ...timeOnlyFmt, timeZone: city.tz }).format(sunTimes.sunset)
    : "—";

  const embedSnippet = `<iframe src="${origin}/embed/${city.slug}" width="280" height="140" style="border:0;border-radius:12px;" loading="lazy" title="${escapeHtml(city.name)}"></iframe>`;

  const faqItems = [
    {
      q: t(langCode, "faqDstQ", { city: city.name }),
      a: t(langCode, hasDST ? "faqDstYesA" : "faqDstNoA", { city: city.name }),
    },
    {
      q: t(langCode, "faqOffsetQ", { city: city.name }),
      a: t(langCode, "faqOffsetA", { city: city.name, offset: offsetLabel }),
    },
    {
      q: t(langCode, "faqTzQ", { city: city.name }),
      a: t(langCode, "faqTzA", { city: city.name, tz: city.tz }),
    },
  ];
  const faqHtml = faqItems
    .map((f) => `<div class="faq"><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></div>`)
    .join("");

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url,
  };

  const hubSection = hubCards
    ? `<div class="section-title">${escapeHtml(t(langCode, "hubCitiesTitle"))}</div>
  <div class="city-grid">${hubCards}</div>`
    : "";

  const sameTzSection = sameTzCards
    ? `<div class="section-title">${escapeHtml(t(langCode, "sameTimezoneTitle"))}</div>
  <div class="city-grid">${sameTzCards}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="${lang.code === "zh-cn" ? "zh-CN" : lang.code === "zh-tw" ? "zh-TW" : lang.code}" dir="${lang.dir}" data-locale="${lang.locale}">
<head>
  <meta charset="UTF-8" />
  ${preconnectHtml(gaId)}
  ${langInitScript(langCode)}
  ${themeInitScript()}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${url}" />
${alternateLinksHtml((code) => cityUrl(origin, code, city.slug))}
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${url}" />
${socialMetaHtml({ langCode, title, description, url, origin, imagePath: `/og/${city.slug}.png` })}
  <script type="application/ld+json">${JSON.stringify(webPageJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd(langCode, origin, city))}</script>
  <style>${baseStyles()}</style>
  ${gaSnippet(gaId)}
</head>
<body>
  <header class="site">
    <a class="brand" href="${homeUrl(origin, langCode)}">🕒 ${escapeHtml(t(langCode, "siteName"))}</a>
    <div class="header-controls">
      ${themeSwitcherHtml(langCode)}
      ${langSwitcherHtml(langCode, (code) => cityUrl(origin, code, city.slug))}
    </div>
  </header>
  ${toolsNavHtml(langCode, origin)}
  <a class="back-link" href="${homeUrl(origin, langCode)}">${escapeHtml(t(langCode, "backToHome"))}</a>

  <div class="clock-hero">
    ${clockToolbarHtml(langCode, url, city.name)}
    <div class="flag-big">${countryFlag(city.cc)}</div>
    <h1>${escapeHtml(t(langCode, "currentTimeIn", { city: city.name }))}</h1>
    <div class="country">${escapeHtml(city.country)}</div>
    <div class="clock" id="clock">${escapeHtml(initialTime)}</div>
    <div class="date" id="clock-date">${escapeHtml(initialDate)}</div>
  </div>

  <div class="fact-grid">
    <div class="fact">
      <div class="flabel">${escapeHtml(t(langCode, "utcOffset"))}</div>
      <div class="fvalue" id="utc-offset-value">${escapeHtml(offsetLabel)}</div>
    </div>
    <div class="fact">
      <div class="flabel">${escapeHtml(t(langCode, "timezoneLabel"))}</div>
      <div class="fvalue">${escapeHtml(city.tz)}</div>
    </div>
    <div class="fact">
      <div class="flabel">${escapeHtml(t(langCode, "yourDeviceTime"))}</div>
      <div class="fvalue" id="device-time-value">—</div>
    </div>
    <div class="fact">
      <div class="flabel">${escapeHtml(t(langCode, "diffFromYou"))}</div>
      <div class="fvalue" id="diff-value"
        data-same="${escapeHtml(t(langCode, "sameTime"))}"
        data-ahead="${escapeHtml(t(langCode, "hoursAhead"))}"
        data-behind="${escapeHtml(t(langCode, "hoursBehind"))}">—</div>
    </div>
    <div class="fact">
      <div class="flabel">${escapeHtml(t(langCode, "sunriseLabel"))}</div>
      <div class="fvalue">${escapeHtml(sunriseLabelValue)}</div>
    </div>
    <div class="fact">
      <div class="flabel">${escapeHtml(t(langCode, "sunsetLabel"))}</div>
      <div class="fvalue">${escapeHtml(sunsetLabelValue)}</div>
    </div>
  </div>

  <div class="section-title">${escapeHtml(t(langCode, "otherCitiesTitle"))}</div>
  <div class="city-grid">${otherCards}</div>

  ${hubSection}
  ${sameTzSection}

  ${enrichmentSectionHtml(langCode, lang, enrichment)}

  <div class="section-title">${escapeHtml(t(langCode, "holidaysTitle"))}</div>
  ${holidayRowsHtml || `<p style="color:var(--sub); font-size:13.5px;">${escapeHtml(t(langCode, "noHolidaysText"))}</p>`}

  <div class="section-title">${escapeHtml(t(langCode, "faqTitle"))}</div>
  ${faqHtml}

  <div class="section-title">${escapeHtml(t(langCode, "embedTitle"))}</div>
  <div class="embed-box">
    <p style="font-size:13.5px; color:var(--sub); margin:0 0 10px;">${escapeHtml(t(langCode, "embedInstructions"))}</p>
    <textarea id="embed-code" readonly onclick="this.select()">${escapeHtml(embedSnippet)}</textarea>
    <button type="button" class="embed-copy-btn" id="embed-copy-btn" data-copied="${escapeHtml(t(langCode, "embedCopiedText"))}" data-default="${escapeHtml(t(langCode, "embedCopyButton"))}">${escapeHtml(t(langCode, "embedCopyButton"))}</button>
  </div>

  <footer class="foot">${escapeHtml(t(langCode, "footerText"))}</footer>
  ${clockScript(city)}
  ${miniClockScript()}
  ${favoritesScript()}
  ${themeSwitchScript()}
  ${clockToolbarScript()}
  <script>
  (function(){
    var btn = document.getElementById('embed-copy-btn');
    var ta = document.getElementById('embed-code');
    if (!btn || !ta) return;
    btn.addEventListener('click', function(){
      ta.select();
      navigator.clipboard && navigator.clipboard.writeText(ta.value).then(function(){
        btn.textContent = btn.getAttribute('data-copied');
        setTimeout(function(){ btn.textContent = btn.getAttribute('data-default'); }, 1500);
      });
    });
  })();
  </script>
</body>
</html>`;
}

export function renderNotFoundPage(langCode, origin, gaId) {
  const lang = LANGS.find((l) => l.code === langCode) || LANGS[0];
  return `<!DOCTYPE html>
<html lang="${lang.code}" dir="${lang.dir}">
<head>
  <meta charset="UTF-8" />
  ${langInitScript(langCode)}
  ${themeInitScript()}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <title>404 — ${escapeHtml(t(langCode, "siteName"))}</title>
  <meta name="robots" content="noindex" />
  <style>${baseStyles()}</style>
  ${gaSnippet(gaId)}
</head>
<body>
  <a class="back-link" href="${homeUrl(origin, langCode)}">${escapeHtml(t(langCode, "backToHome"))}</a>
  <p>404</p>
</body>
</html>`;
}

function cityOptionsHtml(selectedSlug) {
  return CITIES.map(
    (c) =>
      `<option value="${c.slug}"${c.slug === selectedSlug ? " selected" : ""}>${escapeHtml(c.name)} — ${escapeHtml(c.country)}</option>`
  ).join("");
}

function toolPageShellOpen(langCode, origin, gaId, pathSuffix, title, description) {
  const lang = LANGS.find((l) => l.code === langCode) || LANGS[0];
  const url = `${origin}${pathPrefix(langCode)}/${pathSuffix}`;
  return `<!DOCTYPE html>
<html lang="${lang.code === "zh-cn" ? "zh-CN" : lang.code === "zh-tw" ? "zh-TW" : lang.code}" dir="${lang.dir}" data-locale="${lang.locale}">
<head>
  <meta charset="UTF-8" />
  ${preconnectHtml(gaId)}
  ${langInitScript(langCode)}
  ${themeInitScript()}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — ${escapeHtml(t(langCode, "siteName"))}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${url}" />
${alternateLinksHtml((code) => `${origin}${pathPrefix(code)}/${pathSuffix}`)}
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${url}" />
${socialMetaHtml({ langCode, title, description, url, origin })}
  <style>${baseStyles()}</style>
  ${gaSnippet(gaId)}
</head>
<body>
  <header class="site">
    <a class="brand" href="${homeUrl(origin, langCode)}">🕒 ${escapeHtml(t(langCode, "siteName"))}</a>
    <div class="header-controls">
      ${themeSwitcherHtml(langCode)}
      ${langSwitcherHtml(langCode, (code) => `${origin}${pathPrefix(code)}/${pathSuffix}`)}
    </div>
  </header>
  ${toolsNavHtml(langCode, origin)}`;
}

function toolPageShellClose() {
  return `
  <footer class="foot">${""}</footer>
  ${themeSwitchScript()}
</body>
</html>`;
}

// ---- 시차 변환기 ----
export function renderConverterPage(langCode, origin, gaId) {
  const title = t(langCode, "converterPageTitle");
  const description = t(langCode, "converterDescription");
  const defaultFrom = CITIES.find((c) => c.slug === "seoul") || CITIES[0];
  const defaultTo = CITIES.find((c) => c.slug === "new-york") || CITIES[1];

  return `${toolPageShellOpen(langCode, origin, gaId, "convert", title, description)}
  <h1>${escapeHtml(title)}</h1>
  <p class="tagline">${escapeHtml(t(langCode, "converterTagline"))}</p>

  <div class="tool-form">
    <div class="tool-row">
      <div class="tool-field">
        <label for="conv-from">${escapeHtml(t(langCode, "fromLabel"))}</label>
        <select id="conv-from">${cityOptionsHtml(defaultFrom.slug)}</select>
      </div>
      <div class="tool-field">
        <label for="conv-datetime">&nbsp;</label>
        <input type="datetime-local" id="conv-datetime" />
      </div>
      <div class="tool-field">
        <label for="conv-to">${escapeHtml(t(langCode, "toLabel"))}</label>
        <select id="conv-to">${cityOptionsHtml(defaultTo.slug)}</select>
      </div>
    </div>
    <div class="convert-result" id="conv-result">—</div>
  </div>
  ${toolPageShellClose()}
  <script>
  (function(){
    var CITIES = ${JSON.stringify(CITIES.map((c) => ({ slug: c.slug, name: c.name, tz: c.tz })))};
    var locale = document.documentElement.getAttribute('data-locale') || 'en-US';
    var fromSel = document.getElementById('conv-from');
    var toSel = document.getElementById('conv-to');
    var dtInput = document.getElementById('conv-datetime');
    var resultEl = document.getElementById('conv-result');

    function findCity(slug){ return CITIES.filter(function(c){ return c.slug === slug; })[0]; }

    function offsetMinutes(tz, date){
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle:'h23',
        year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }).formatToParts(date);
      var o = {};
      parts.forEach(function(p){ o[p.type] = p.value; });
      var asUTC = Date.UTC(o.year, o.month - 1, o.day, o.hour === '24' ? 0 : o.hour, o.minute, o.second);
      return Math.round((asUTC - date.getTime()) / 60000);
    }

    function pad(n){ return n.toString().padStart(2,'0'); }

    function setDefaultDatetime(){
      var now = new Date();
      dtInput.value = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    }

    function compute(){
      var fromCity = findCity(fromSel.value);
      var toCity = findCity(toSel.value);
      if (!fromCity || !toCity || !dtInput.value) return;
      var naive = new Date(dtInput.value + ':00Z');
      var fromOffset = offsetMinutes(fromCity.tz, naive);
      var actualUTC = new Date(naive.getTime() - fromOffset * 60000);

      var fmt = new Intl.DateTimeFormat(locale, { weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false });
      var fromText = fmt.format(new Intl.DateTimeFormat('en-US',{timeZone:fromCity.tz}).format ? actualUTC : actualUTC);
      var fromFmt = new Intl.DateTimeFormat(locale, { timeZone: fromCity.tz, weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false });
      var toFmt = new Intl.DateTimeFormat(locale, { timeZone: toCity.tz, weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false });

      resultEl.innerHTML = fromCity.name + ' ' + fromFmt.format(actualUTC) +
        '<span class="arrow">→</span>' + toCity.name + ' ' + toFmt.format(actualUTC);
    }

    setDefaultDatetime();
    compute();
    [fromSel, toSel, dtInput].forEach(function(el){ el.addEventListener('input', compute); el.addEventListener('change', compute); });
  })();
  </script>
</body>
</html>`;
}

// ---- 미팅 시간 플래너 ----
export function renderMeetingPlannerPage(langCode, origin, gaId) {
  const title = t(langCode, "meetingPageTitle");
  const description = t(langCode, "meetingDescription");
  const defaultSlugs = ["seoul", "new-york", "london"].filter((s) =>
    CITIES.some((c) => c.slug === s)
  );

  return `${toolPageShellOpen(langCode, origin, gaId, "meeting-planner", title, description)}
  <h1>${escapeHtml(title)}</h1>
  <p class="tagline">${escapeHtml(t(langCode, "meetingTagline"))}</p>
  <p style="font-size:13.5px; color:var(--sub); margin:-14px 0 20px;">${escapeHtml(t(langCode, "meetingDescription"))}</p>

  <div class="meeting-add-row">
    <div class="tool-field" style="max-width:280px;">
      <label for="meeting-add-select">${escapeHtml(t(langCode, "selectCitiesLabel"))}</label>
      <select id="meeting-add-select">${cityOptionsHtml(null)}</select>
    </div>
    <div class="tool-field" style="max-width:200px;">
      <label for="meeting-datetime">&nbsp;</label>
      <input type="datetime-local" id="meeting-datetime" />
    </div>
  </div>

  <p style="font-size:12.5px; color:var(--sub); margin:0 0 10px;">${escapeHtml(t(langCode, "businessHoursNote"))}</p>
  <div class="meeting-scroll">
    <table class="meeting-table" id="meeting-table"></table>
  </div>

  ${toolPageShellClose()}
  <script>
  (function(){
    var CITIES = ${JSON.stringify(CITIES.map((c) => ({ slug: c.slug, name: c.name, tz: c.tz })))};
    var locale = document.documentElement.getAttribute('data-locale') || 'en-US';
    var defaultSlugs = ${JSON.stringify(defaultSlugs)};
    var selected = defaultSlugs.slice();
    var addSelect = document.getElementById('meeting-add-select');
    var dtInput = document.getElementById('meeting-datetime');
    var table = document.getElementById('meeting-table');

    function findCity(slug){ return CITIES.filter(function(c){ return c.slug === slug; })[0]; }
    function pad(n){ return n.toString().padStart(2,'0'); }

    function offsetMinutes(tz, date){
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle:'h23',
        year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }).formatToParts(date);
      var o = {};
      parts.forEach(function(p){ o[p.type] = p.value; });
      var asUTC = Date.UTC(o.year, o.month - 1, o.day, o.hour === '24' ? 0 : o.hour, o.minute, o.second);
      return Math.round((asUTC - date.getTime()) / 60000);
    }

    function localHour(tz, date){
      var fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle:'h23', hour:'2-digit' });
      return parseInt(fmt.format(date), 10);
    }

    function setDefaultDatetime(){
      var now = new Date();
      dtInput.value = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    }

    function render(){
      if (!dtInput.value) { table.innerHTML = ''; return; }
      var naive = new Date(dtInput.value + ':00Z');
      // 로컬 입력값을 방문자 기기 기준 UTC로 정확히 변환
      var localAsIfUTC = naive;
      var deviceOffset = -new Date().getTimezoneOffset();
      var baseUTC = new Date(localAsIfUTC.getTime() - deviceOffset * 60000);

      var offsets = [0,1,2,3,4,5,6];
      var thead = '<tr><th class="city-col">' + '</th>' + offsets.map(function(h){ return '<th>+' + h + 'h</th>'; }).join('') + '</tr>';
      var rows = selected.map(function(slug){
        var city = findCity(slug);
        if (!city) return '';
        var cells = offsets.map(function(h){
          var t = new Date(baseUTC.getTime() + h * 3600000);
          var fmt = new Intl.DateTimeFormat(locale, { timeZone: city.tz, hour:'2-digit', minute:'2-digit', hour12:false });
          var hr = localHour(city.tz, t);
          var isBiz = hr >= 9 && hr < 18;
          return '<td class="' + (isBiz ? 'business' : '') + '">' + fmt.format(t) + '</td>';
        }).join('');
        return '<tr><td class="city-col">' + escapeHtmlJs(city.name) +
          ' <button type="button" class="meeting-remove" data-slug="' + city.slug + '">✕</button></td>' + cells + '</tr>';
      }).join('');
      table.innerHTML = thead + rows;

      table.querySelectorAll('.meeting-remove').forEach(function(btn){
        btn.addEventListener('click', function(){
          selected = selected.filter(function(s){ return s !== btn.getAttribute('data-slug'); });
          render();
        });
      });
    }

    function escapeHtmlJs(s){
      return s.replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; });
    }

    addSelect.addEventListener('change', function(){
      var slug = addSelect.value;
      if (selected.length >= 5 || selected.indexOf(slug) !== -1) return;
      selected.push(slug);
      render();
    });
    dtInput.addEventListener('input', render);

    setDefaultDatetime();
    render();
  })();
  </script>
</body>
</html>`;
}

// ---- 임베드용 미니 페이지 (iframe 전용, 언어/헤더 없이 최소 구성) ----
export function renderEmbedPage(city, origin, gaId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(city.name)}</title>
<style>
  html,body{ margin:0; padding:0; background:transparent; }
  body{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; color:#111; }
  .name{ font-size:14px; font-weight:600; margin-bottom:4px; }
  .clock{ font-family:'SFMono-Regular',Consolas,monospace; font-size:30px; font-weight:700; }
  .date{ font-size:11px; color:#777; margin-top:2px; }
  a{ font-size:10px; color:#999; text-decoration:none; margin-top:6px; }
</style>
${gaSnippet(gaId)}
</head>
<body>
  <div class="name">${countryFlag(city.cc)} ${escapeHtml(city.name)}</div>
  <div class="clock" id="clock">--:--:--</div>
  <div class="date" id="date"></div>
  <a href="${origin}" target="_top">${escapeHtml(t(DEFAULT_LANG, "siteName"))}</a>
  <script>
  (function(){
    var tz = ${JSON.stringify(city.tz)};
    var locale = (navigator.language || 'en-US');
    var timeFmt = new Intl.DateTimeFormat(locale, { timeZone: tz, hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
    var dateFmt = new Intl.DateTimeFormat(locale, { timeZone: tz, month:'short', day:'numeric' });
    function tick(){
      var now = new Date();
      document.getElementById('clock').textContent = timeFmt.format(now);
      document.getElementById('date').textContent = dateFmt.format(now);
    }
    tick();
    setInterval(tick, 1000);
  })();
  </script>
</body>
</html>`;
}

// ---- 스톱워치 ----
export function renderStopwatchPage(langCode, origin, gaId) {
  const title = t(langCode, "stopwatchPageTitle");
  const description = t(langCode, "stopwatchTagline");

  return `${toolPageShellOpen(langCode, origin, gaId, "stopwatch", title, description)}
  <h1>${escapeHtml(title)}</h1>
  <p class="tagline">${escapeHtml(description)}</p>

  <div class="tool-form" style="text-align:center;">
    <div class="sw-display" id="sw-display" style="font-family:'SFMono-Regular',Consolas,monospace; font-size:56px; font-weight:600;">00:00.00</div>
    <div style="display:flex; gap:10px; justify-content:center; margin-top:18px; flex-wrap:wrap;">
      <button type="button" class="embed-copy-btn" id="sw-toggle">${escapeHtml(t(langCode, "startLabel"))}</button>
      <button type="button" class="embed-copy-btn" id="sw-lap">${escapeHtml(t(langCode, "lapLabel"))}</button>
      <button type="button" class="embed-copy-btn" id="sw-reset">${escapeHtml(t(langCode, "resetLabel"))}</button>
    </div>
  </div>

  <div class="section-title">${escapeHtml(t(langCode, "lapsTitle"))}</div>
  <ol id="sw-laps" style="padding-left:20px; font-size:14.5px; font-family:'SFMono-Regular',Consolas,monospace;"></ol>

  ${toolPageShellClose()}
  <script>
  (function(){
    var display = document.getElementById('sw-display');
    var toggleBtn = document.getElementById('sw-toggle');
    var lapBtn = document.getElementById('sw-lap');
    var resetBtn = document.getElementById('sw-reset');
    var lapsEl = document.getElementById('sw-laps');
    var startLabel = ${JSON.stringify(t(langCode, "startLabel"))};
    var pauseLabel = ${JSON.stringify(t(langCode, "pauseLabel"))};

    var running = false;
    var startTime = 0;
    var elapsed = 0;
    var laps = [];
    var rafId = null;

    function fmt(ms){
      var m = Math.floor(ms / 60000);
      var s = Math.floor((ms % 60000) / 1000);
      var cs = Math.floor((ms % 1000) / 10);
      return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + '.' + String(cs).padStart(2,'0');
    }

    function tick(){
      if (!running) return;
      display.textContent = fmt(elapsed + (Date.now() - startTime));
      rafId = requestAnimationFrame(tick);
    }

    toggleBtn.addEventListener('click', function(){
      if (running) {
        running = false;
        elapsed += Date.now() - startTime;
        toggleBtn.textContent = startLabel;
        if (rafId) cancelAnimationFrame(rafId);
      } else {
        running = true;
        startTime = Date.now();
        toggleBtn.textContent = pauseLabel;
        tick();
      }
    });

    lapBtn.addEventListener('click', function(){
      var current = elapsed + (running ? Date.now() - startTime : 0);
      laps.unshift(current);
      lapsEl.innerHTML = laps.map(function(l){ return '<li>' + fmt(l) + '</li>'; }).join('');
    });

    resetBtn.addEventListener('click', function(){
      running = false;
      elapsed = 0;
      laps = [];
      if (rafId) cancelAnimationFrame(rafId);
      display.textContent = fmt(0);
      lapsEl.innerHTML = '';
      toggleBtn.textContent = startLabel;
    });
  })();
  </script>
</body>
</html>`;
}

// ---- 타이머 ----
export function renderTimerPage(langCode, origin, gaId) {
  const title = t(langCode, "timerPageTitle");
  const description = t(langCode, "timerTagline");

  return `${toolPageShellOpen(langCode, origin, gaId, "timer", title, description)}
  <h1>${escapeHtml(title)}</h1>
  <p class="tagline">${escapeHtml(description)}</p>

  <div class="tool-form">
    <div class="tool-row" id="timer-inputs">
      <div class="tool-field">
        <label>${escapeHtml(t(langCode, "hoursLabel"))}</label>
        <input type="number" id="timer-h" min="0" max="23" value="0" />
      </div>
      <div class="tool-field">
        <label>${escapeHtml(t(langCode, "minutesLabel"))}</label>
        <input type="number" id="timer-m" min="0" max="59" value="5" />
      </div>
      <div class="tool-field">
        <label>${escapeHtml(t(langCode, "secondsLabel"))}</label>
        <input type="number" id="timer-s" min="0" max="59" value="0" />
      </div>
    </div>
    <div class="sw-display timer-display" id="timer-display" style="font-family:'SFMono-Regular',Consolas,monospace; font-size:56px; font-weight:600; text-align:center;">00:05:00</div>
    <div style="display:flex; gap:10px; justify-content:center; margin-top:18px; flex-wrap:wrap;">
      <button type="button" class="embed-copy-btn" id="timer-toggle">${escapeHtml(t(langCode, "startLabel"))}</button>
      <button type="button" class="embed-copy-btn" id="timer-reset">${escapeHtml(t(langCode, "resetLabel"))}</button>
    </div>
    <div id="timer-done" style="display:none; text-align:center; margin-top:14px; font-size:16px; font-weight:600; color:var(--accent);">${escapeHtml(t(langCode, "timerDoneText"))}</div>
  </div>

  ${toolPageShellClose()}
  <script>
  (function(){
    var hInput = document.getElementById('timer-h');
    var mInput = document.getElementById('timer-m');
    var sInput = document.getElementById('timer-s');
    var display = document.getElementById('timer-display');
    var toggleBtn = document.getElementById('timer-toggle');
    var resetBtn = document.getElementById('timer-reset');
    var doneEl = document.getElementById('timer-done');
    var startLabel = ${JSON.stringify(t(langCode, "startLabel"))};
    var pauseLabel = ${JSON.stringify(t(langCode, "pauseLabel"))};

    var running = false;
    var remainingMs = 0;
    var targetTime = 0;
    var intervalId = null;
    var audioCtx = null;

    function fmt(ms){
      var total = Math.max(0, Math.ceil(ms / 1000));
      var h = Math.floor(total / 3600);
      var m = Math.floor((total % 3600) / 60);
      var s = total % 60;
      return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }

    function totalInputMs(){
      var h = parseInt(hInput.value, 10) || 0;
      var m = parseInt(mInput.value, 10) || 0;
      var s = parseInt(sInput.value, 10) || 0;
      return ((h * 3600) + (m * 60) + s) * 1000;
    }

    function beep(){
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.15;
        o.connect(g); g.connect(audioCtx.destination);
        o.start();
        setTimeout(function(){ o.stop(); }, 350);
      } catch(e){}
    }

    function updateDisplay(){
      display.textContent = fmt(remainingMs);
    }

    function tick(){
      remainingMs = targetTime - Date.now();
      if (remainingMs <= 0) {
        remainingMs = 0;
        updateDisplay();
        running = false;
        clearInterval(intervalId);
        toggleBtn.textContent = startLabel;
        doneEl.style.display = '';
        beep();
        setTimeout(beep, 500);
        setTimeout(beep, 1000);
        if (window.Notification && Notification.permission === 'granted') {
          new Notification(${JSON.stringify(t(langCode, "timerDoneText"))});
        }
        return;
      }
      updateDisplay();
    }

    toggleBtn.addEventListener('click', function(){
      if (running) {
        running = false;
        clearInterval(intervalId);
        toggleBtn.textContent = startLabel;
      } else {
        if (remainingMs <= 0) remainingMs = totalInputMs();
        if (remainingMs <= 0) return;
        if (window.Notification && Notification.permission === 'default') {
          Notification.requestPermission();
        }
        targetTime = Date.now() + remainingMs;
        running = true;
        toggleBtn.textContent = pauseLabel;
        doneEl.style.display = 'none';
        intervalId = setInterval(tick, 250);
      }
    });

    resetBtn.addEventListener('click', function(){
      running = false;
      clearInterval(intervalId);
      remainingMs = totalInputMs();
      updateDisplay();
      toggleBtn.textContent = startLabel;
      doneEl.style.display = 'none';
    });

    [hInput, mInput, sInput].forEach(function(el){
      el.addEventListener('input', function(){
        if (!running) { remainingMs = totalInputMs(); updateDisplay(); }
      });
    });

    remainingMs = totalInputMs();
    updateDisplay();
  })();
  </script>
</body>
</html>`;
}

// ---- 자명종 ----
export function renderAlarmPage(langCode, origin, gaId) {
  const title = t(langCode, "alarmPageTitle");
  const description = t(langCode, "alarmTagline");

  return `${toolPageShellOpen(langCode, origin, gaId, "alarm", title, description)}
  <h1>${escapeHtml(title)}</h1>
  <p class="tagline">${escapeHtml(description)}</p>

  <div class="tool-form">
    <div class="tool-row">
      <div class="tool-field" style="max-width:160px;">
        <label for="alarm-time">&nbsp;</label>
        <input type="time" id="alarm-time" />
      </div>
      <div class="tool-field" style="max-width:160px;">
        <label>&nbsp;</label>
        <button type="button" class="embed-copy-btn" id="alarm-add">${escapeHtml(t(langCode, "addAlarmLabel"))}</button>
      </div>
    </div>
  </div>

  <ul id="alarm-list" style="list-style:none; padding:0; font-size:15px;"></ul>
  <p id="alarm-empty" style="color:var(--sub); font-size:13.5px;">${escapeHtml(t(langCode, "noAlarmsText"))}</p>

  <div id="alarm-ringing" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:999; align-items:center; justify-content:center; flex-direction:column; color:#fff;">
    <div style="font-size:40px; font-weight:700; margin-bottom:20px;">⏰ ${escapeHtml(t(langCode, "alarmRingingText"))}</div>
    <button type="button" id="alarm-dismiss" style="padding:12px 28px; font-size:16px; border-radius:10px; border:none; background:#fff; color:#111; cursor:pointer;">${escapeHtml(t(langCode, "dismissLabel"))}</button>
  </div>

  ${toolPageShellClose()}
  <script>
  (function(){
    var KEY = 'wc-alarms';
    var timeInput = document.getElementById('alarm-time');
    var addBtn = document.getElementById('alarm-add');
    var listEl = document.getElementById('alarm-list');
    var emptyEl = document.getElementById('alarm-empty');
    var ringingEl = document.getElementById('alarm-ringing');
    var dismissBtn = document.getElementById('alarm-dismiss');
    var deleteLabel = ${JSON.stringify(t(langCode, "deleteLabel"))};

    var audioCtx = null;
    var beepInterval = null;
    var ringingAlarmId = null;
    var lastFiredMinute = {};

    function getAlarms(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; } }
    function setAlarms(arr){ try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch(e){} }

    function render(){
      var alarms = getAlarms();
      emptyEl.style.display = alarms.length ? 'none' : '';
      listEl.innerHTML = alarms.map(function(a){
        return '<li style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--line);">' +
          '<span style="font-family:\\'SFMono-Regular\\',Consolas,monospace; font-size:20px;">' + a.time + '</span>' +
          '<button type="button" class="meeting-remove" data-id="' + a.id + '">' + deleteLabel + '</button>' +
          '</li>';
      }).join('');
      listEl.querySelectorAll('.meeting-remove').forEach(function(btn){
        btn.addEventListener('click', function(){
          setAlarms(getAlarms().filter(function(a){ return String(a.id) !== btn.getAttribute('data-id'); }));
          render();
        });
      });
    }

    addBtn.addEventListener('click', function(){
      if (!timeInput.value) return;
      var alarms = getAlarms();
      alarms.push({ id: Date.now(), time: timeInput.value });
      setAlarms(alarms);
      render();
    });

    function beepOnce(){
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.value = 660;
        g.gain.value = 0.12;
        o.connect(g); g.connect(audioCtx.destination);
        o.start();
        setTimeout(function(){ o.stop(); }, 300);
      } catch(e){}
    }

    function startRinging(alarm){
      ringingAlarmId = alarm.id;
      ringingEl.style.display = 'flex';
      beepOnce();
      beepInterval = setInterval(beepOnce, 1200);
    }

    dismissBtn.addEventListener('click', function(){
      ringingEl.style.display = 'none';
      if (beepInterval) clearInterval(beepInterval);
      ringingAlarmId = null;
    });

    function checkAlarms(){
      var now = new Date();
      var hh = String(now.getHours()).padStart(2,'0');
      var mm = String(now.getMinutes()).padStart(2,'0');
      var current = hh + ':' + mm;
      var minuteKey = now.toDateString() + ' ' + current;
      getAlarms().forEach(function(a){
        if (a.time === current && lastFiredMinute[a.id] !== minuteKey) {
          lastFiredMinute[a.id] = minuteKey;
          startRinging(a);
        }
      });
    }

    render();
    setInterval(checkAlarms, 1000);
  })();
  </script>
</body>
</html>`;
}

// ---- sitemap.xml ----
const TOOL_PAGE_SLUGS = ["convert", "meeting-planner", "stopwatch", "timer", "alarm"];

export function renderSitemap(origin) {
  const lastmod = new Date().toISOString().split("T")[0];
  const urls = [];
  for (const lang of LANGS) {
    urls.push(`  <url><loc>${homeUrl(origin, lang.code)}</loc><lastmod>${lastmod}</lastmod></url>`);
    for (const city of CITIES) {
      // 도시 페이지는 도시별 동적 OG 이미지(/og/{slug}.png)를 이미지 사이트맵으로도 노출해
      // 구글 이미지 검색 유입도 노려본다. 언어가 달라도 같은 이미지를 가리키므로 한 번만 넣는다.
      urls.push(
        `  <url><loc>${cityUrl(origin, lang.code, city.slug)}</loc><lastmod>${lastmod}</lastmod><image:image><image:loc>${origin}/og/${city.slug}.png</image:loc></image:image></url>`
      );
    }
    for (const slug of TOOL_PAGE_SLUGS) {
      urls.push(
        `  <url><loc>${origin}${pathPrefix(lang.code)}/${slug}</loc><lastmod>${lastmod}</lastmod></url>`
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>`;
}

export function renderRobotsTxt(origin) {
  return `User-agent: *
Allow: /
Disallow: /embed/

Sitemap: ${origin}/sitemap.xml`;
}