import { CITIES, findCity } from "./cities.js";
import { LANGS, DEFAULT_LANG, findLang, langForCountry, t } from "./i18n.js";
import {
  renderHomePage,
  renderCityPage,
  renderNotFoundPage,
  renderSitemap,
  renderRobotsTxt,
  renderConverterPage,
  renderMeetingPlannerPage,
  renderEmbedPage,
  renderStopwatchPage,
  renderTimerPage,
  renderAlarmPage,
} from "./render.js";
import { renderCityOgImage, renderHomeOgImage } from "./og-image.js";
import { getCityEnrichment } from "./enrichment.js";

// 서버 사이드 시간 포맷 헬퍼 (og-image 라우트 전용, render.js와 중복이지만
// render.js 내부 함수를 export 하지 않은 상태라 여기서 최소 버전만 따로 둔다)
function ogOffsetLabel(tz, date) {
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
  const mins = Math.round((asUTC - date.getTime()) / 60000);
  const sign = mins >= 0 ? "+" : "-";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

// 도시 슬러그와 겹치지 않는 예약어. 도구 페이지들의 URL로 쓰인다.
const RESERVED_SLUGS = {
  convert: renderConverterPage,
  "meeting-planner": renderMeetingPlannerPage,
  stopwatch: renderStopwatchPage,
  timer: renderTimerPage,
  alarm: renderAlarmPage,
};

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#111111"/>
  <circle cx="16" cy="16" r="12.2" fill="none" stroke="#ffffff" stroke-width="1.4"/>
  <line x1="16" y1="16" x2="16" y2="8" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
  <line x1="16" y1="16" x2="21" y2="18.4" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
  <circle cx="16" cy="16" r="1.6" fill="#ffffff"/>
</svg>`;

const LANG_CODES = new Set(LANGS.map((l) => l.code));

// HTML 응답 전용 헤더. cache-control: no-store로 엣지/브라우저/중간 프록시의
// 임의 캐싱을 막아, 배포 버전이 뒤섞여 보이는 문제를 방지한다.
const HTML_HEADERS = {
  "content-type": "text/html; charset=UTF-8",
  "cache-control": "no-store",
};

// "/", "/tokyo" -> { lang: 'en', rest: '' | 'tokyo' }
// "/ko/", "/ko/tokyo" -> { lang: 'ko', rest: '' | 'tokyo' }
function parsePath(pathname) {
  const segments = pathname.split("/").filter(Boolean); // 빈 문자열 제거
  if (segments.length === 0) {
    return { lang: DEFAULT_LANG, rest: [] };
  }
  const first = segments[0].toLowerCase();
  if (LANG_CODES.has(first) && first !== DEFAULT_LANG) {
    return { lang: first, rest: segments.slice(1) };
  }
  return { lang: DEFAULT_LANG, rest: segments };
}

// 요청 헤더에서 쿠키 값 하나를 꺼내는 헬퍼.
// 사용자가 언어 스위처를 직접 클릭하면 langInitScript가 이 쿠키를 심어두고,
// 그 뒤로는 서버의 국가 기반 자동 리다이렉트를 건너뛰게 하는 데 쓰인다.
function getCookie(request, name) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = url.origin;
    const gaId = env.GA_MEASUREMENT_ID;
    const pathname = url.pathname;

    if (pathname === "/favicon.svg") {
      return new Response(FAVICON_SVG, {
        headers: { "content-type": "image/svg+xml; charset=UTF-8" },
      });
    }

    // 임시 디버그: workers-og 렌더링 엔진 자체가 이 환경에서 동작하는지 확인용.
    // 정상 동작 확인되면 이 블록은 삭제해도 됩니다.
    if (pathname === "/og/debug.png") {
      const { ImageResponse } = await import("workers-og");
      return new ImageResponse(
        `<div style="display:flex; width:600px; height:300px; background:#ff0000; color:#ffffff; font-size:40px; align-items:center; justify-content:center;">HELLO</div>`,
        { width: 600, height: 300 }
      );
    }

    // 동적 OG 이미지: /og/home.png, /og/{slug}.png
    // 카카오톡/트위터/슬랙 등에서 링크 미리보기로 요청하는 경로.
    if (pathname.startsWith("/og/") && pathname.endsWith(".png")) {
      const key = decodeURIComponent(pathname.slice("/og/".length, -".png".length));
      try {
        if (key === "home") {
          // ImageResponse는 Response의 서브클래스라 그대로 반환하면 된다.
          return renderHomeOgImage(t(DEFAULT_LANG, "siteName"), t(DEFAULT_LANG, "tagline"));
        }
        const city = findCity(key);
        if (!city) {
          return new Response("Not found", { status: 404 });
        }
        const now = new Date();
        const timeText = new Intl.DateTimeFormat("en-US", {
          timeZone: city.tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(now);
        const dateText = new Intl.DateTimeFormat("en-US", {
          timeZone: city.tz,
          weekday: "short",
          month: "short",
          day: "numeric",
        }).format(now);
        const offsetLabel = ogOffsetLabel(city.tz, now);
        // ImageResponse는 Response의 서브클래스이므로 그대로 반환.
        // 시각이 계속 바뀌므로 캐시는 짧게 잡는다(카톡/슬랙 등은 보통 자체적으로
        // 최초 스크랩 시점 이미지를 한동안 재사용한다).
        return renderCityOgImage({ city, timeText, dateText, offsetLabel });
      } catch (e) {
        // OG 이미지 생성 실패 시, 존재하지 않는 정적 파일로 리다이렉트하면
        // 카카오톡/트위터 등 스크래퍼가 HTML(404) 응답을 받아 미리보기가
        // 완전히 깨진다. 대신 항상 유효한 PNG를 반환하는 홈 OG 이미지로 폴백한다.
        console.error("OG image render failed:", key, e);
        return renderHomeOgImage(t(DEFAULT_LANG, "siteName"), t(DEFAULT_LANG, "tagline"));
      }
    }

    if (pathname === "/manifest.json") {
      const manifest = {
        name: t(DEFAULT_LANG, "siteName"),
        short_name: t(DEFAULT_LANG, "siteName"),
        start_url: "/",
        display: "standalone",
        background_color: "#fafafa",
        theme_color: "#111111",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      };
      return new Response(JSON.stringify(manifest), {
        headers: { "content-type": "application/manifest+json; charset=UTF-8" },
      });
    }

    // 임베드용 미니 페이지: 언어 프리픽스 체계 밖에서 별도로 처리
    if (pathname.startsWith("/embed/")) {
      const slug = decodeURIComponent(pathname.slice("/embed/".length));
      const city = findCity(slug);
      if (!city) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(renderEmbedPage(city, origin, gaId), {
        headers: HTML_HEADERS,
      });
    }

    if (pathname === "/robots.txt") {
      return new Response(renderRobotsTxt(origin), {
        headers: { "content-type": "text/plain; charset=UTF-8" },
      });
    }

    if (pathname === "/sitemap.xml") {
      return new Response(renderSitemap(origin), {
        headers: { "content-type": "application/xml; charset=UTF-8" },
      });
    }

    if (pathname === "/googlecc2413bfb4327c21.html") {
      return new Response(
        "google-site-verification: googlecc2413bfb4327c21.html",
        { headers: { "content-type": "text/html; charset=UTF-8" } }
      );
    }

    // 검색엔진 소유확인 파일들은 필요할 때 여기 추가
    // if (pathname === "/googleXXXXXXXX.html") { ... }

    const { lang: langCode, rest } = parsePath(pathname);
    const lang = findLang(langCode);
    if (!lang) {
      return new Response(renderNotFoundPage(DEFAULT_LANG, origin, gaId), {
        status: 404,
        headers: HTML_HEADERS,
      });
    }

    // 홈: "/" 또는 "/ko/"
    if (rest.length === 0) {
      // 프리픽스 없는 순수 루트("/")로 들어온 요청만 지역 기반으로 리다이렉트.
      // 사용자가 이미 /ko/ 처럼 언어를 명시했거나, 언어 스위처를 눌러
      // wc-lang-set 쿠키가 심어져 있다면 그 선택을 존중해서 건드리지 않는다.
      if (langCode === DEFAULT_LANG && pathname === "/") {
        const userHasChosenLang = getCookie(request, "wc-lang-set") === "1";
        if (!userHasChosenLang) {
          const country = request.cf && request.cf.country ? request.cf.country : null;
          const detectedLang = langForCountry(country);
          if (detectedLang !== DEFAULT_LANG) {
            return Response.redirect(`${origin}/${detectedLang}/`, 302);
          }
        }
      }

      // Cloudflare가 요청 IP를 기반으로 추정한 방문자 타임존. 로컬 개발 환경 등에선 없을 수 있음.
      const visitorTz = request.cf && request.cf.timezone ? request.cf.timezone : null;
      return new Response(renderHomePage(langCode, origin, gaId, visitorTz), {
        headers: HTML_HEADERS,
      });
    }

    // 도구 페이지: "/convert", "/ko/meeting-planner" 등
    if (rest.length === 1 && RESERVED_SLUGS[rest[0]]) {
      const renderFn = RESERVED_SLUGS[rest[0]];
      return new Response(renderFn(langCode, origin, gaId), {
        headers: HTML_HEADERS,
      });
    }

    // 도시 페이지: "/tokyo" 또는 "/ko/tokyo"
    if (rest.length === 1) {
      const city = findCity(rest[0]);
      if (!city) {
        return new Response(renderNotFoundPage(langCode, origin, gaId), {
          status: 404,
          headers: HTML_HEADERS,
        });
      }
      const enrichment = await getCityEnrichment(city, langCode, env).catch(() => null);
      const html = await renderCityPage(
        city,
        langCode,
        origin,
        gaId,
        env.KASI_API_KEY,
        enrichment
      );
      return new Response(html, {
        headers: HTML_HEADERS,
      });
    }

    return new Response(renderNotFoundPage(langCode, origin, gaId), {
      status: 404,
      headers: HTML_HEADERS,
    });
  },
};