// ── 도시 부가정보 레이어 (GitHub Actions 버전) ──────────────────────────
// 실제 API 호출(REST Countries / Open-Meteo / Wikipedia / OECD)은 이 파일이 아니라
// GitHub Actions가 매일 실행하는 scripts/update-enrichment.mjs 에서 이루어지고,
// 그 결과가 data/enrichment.json 으로 리포에 커밋됩니다.
//
// 이 파일(Worker 런타임)은 그 JSON 파일을 raw.githubusercontent.com 에서 fetch만 합니다.
// Cloudflare KV를 쓰지 않고, Cloudflare의 기본 fetch 캐시(cf.cacheTtl)로 엣지에 캐싱합니다.
// → 대시보드에서 KV 네임스페이스를 만들거나 바인딩을 설정할 필요가 전혀 없습니다.

const DEFAULT_CACHE_TTL_SECONDS = 60 * 60; // 1시간. GitHub Actions가 하루에 한 번 갱신하므로
// 이보다 훨씬 짧게 잡아도 무방하지만, 매 요청마다 GitHub에 나가는 걸 막기 위한 최소한의 값.

// WMO Weather interpretation code -> 간단한 설명(en).
const WEATHER_CODE_LABELS = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
  80: "Rain showers", 81: "Rain showers", 82: "Violent rain showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
};

export function weatherCodeLabel(code) {
  return WEATHER_CODE_LABELS[code] || "—";
}

// env.ENRICHMENT_DATA_URL 을 wrangler.toml의 [vars]에 설정해두세요. 예:
//   [vars]
//   ENRICHMENT_DATA_URL = "https://raw.githubusercontent.com/<user>/<repo>/main/data/enrichment.json"
// (GitHub Pages를 쓰신다면 그 URL을 넣어도 됩니다 — raw.githubusercontent.com보다 캐시 헤더가
//  더 안정적이라 오히려 선호될 수 있습니다.)
let memoryCache = null; // 같은 Worker 인스턴스 내에서 재사용 (콜드스타트마다 초기화됨, 보조 캐시일 뿐)

async function fetchBundle(env) {
  const url = env.ENRICHMENT_DATA_URL;
  if (!url) return null;

  if (memoryCache && Date.now() - memoryCache.fetchedAt < 60 * 1000) {
    // 같은 인스턴스에서 1분 내 재요청이면 굳이 또 fetch하지 않음 (사소한 최적화)
    return memoryCache.data;
  }

  try {
    const res = await fetch(url, {
      cf: {
        cacheTtl: DEFAULT_CACHE_TTL_SECONDS,
        cacheEverything: true,
      },
    });
    if (!res.ok) return memoryCache ? memoryCache.data : null;
    const data = await res.json();
    memoryCache = { data, fetchedAt: Date.now() };
    return data;
  } catch (e) {
    // 네트워크 실패 시, 이전에 메모리에 있던 값이라도 반환 (완전히 없는 것보단 나음)
    return memoryCache ? memoryCache.data : null;
  }
}

// city 페이지 렌더링 쪽에서 쓰는 진입점.
// bundle.cities[slug] = { countryInfo, weather, oecd, wiki: { en: {...}, ko: {...}, ... } }
export async function getCityEnrichment(city, langCode, env) {
  const bundle = await fetchBundle(env);
  if (!bundle || !bundle.cities || !bundle.cities[city.slug]) return null;

  const entry = bundle.cities[city.slug];
  const wiki = (entry.wiki && (entry.wiki[langCode] || entry.wiki.en)) || null;

  return {
    countryInfo: entry.countryInfo || null,
    weather: entry.weather || null,
    oecd: entry.oecd || null,
    wiki,
    generatedAt: bundle.generatedAt || null,
  };
}