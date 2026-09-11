// 공공데이터포털 "한국천문연구원_특일 정보" API 연동.
// 발급: https://www.data.go.kr → "특일 정보" 검색 → 활용신청 (무료, 즉시 승인)
// 서비스: SpcdeInfoService / getRestDeInfo (연중 공휴일 목록 — 설날/추석 등 음력 공휴일 포함)
//
// 이 API는 월 단위 조회만 지원해서, 1년치를 얻으려면 12번 호출해야 한다.
// 매년 같은 데이터가 반복 조회되는 걸 막기 위해 Workers Cache API로 캐싱한다.

const BASE_URL =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

async function fetchMonth(apiKey, year, month) {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    solYear: String(year),
    solMonth: String(month).padStart(2, "0"),
    numOfRows: "20",
    _type: "json",
  });
  const res = await fetch(`${BASE_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`KASI API ${res.status}`);
  }
  const data = await res.json();

  // 공공데이터포털 API는 결과가 0/1건일 때 item이 배열이 아니라 단일 객체로 오는 경우가 있어 정규화한다.
  const body = data?.response?.body;
  if (!body || body.totalCount === 0 || !body.items) return [];
  const rawItems = body.items.item;
  if (!rawItems) return [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items
    .filter((it) => it.isHoliday === "Y")
    .map((it) => {
      const s = String(it.locdate); // YYYYMMDD
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(4, 6));
      const d = Number(s.slice(6, 8));
      return {
        date: new Date(Date.UTC(y, m - 1, d)),
        name: it.dateName,
      };
    });
}

async function fetchYearUncached(apiKey, year) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const results = await Promise.allSettled(
    months.map((m) => fetchMonth(apiKey, year, m))
  );
  const items = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);
  items.sort((a, b) => a.date.getTime() - b.date.getTime());
  return items;
}

// Workers Cache API로 연 단위 캐싱 (30일 TTL — 그해가 바뀌기 전까진 값이 고정이므로 충분히 길게 잡아도 됨)
export async function getKoreaHolidays(apiKey, year) {
  if (!apiKey) return [];

  const cache = caches.default;
  const cacheKey = new Request(
    `https://internal-cache.worldclock/kasi-holidays-${year}`
  );

  const cached = await cache.match(cacheKey);
  if (cached) {
    const json = await cached.json();
    return json.map((it) => ({ date: new Date(it.date), name: it.name }));
  }

  const items = await fetchYearUncached(apiKey, year);

  const toStore = items.map((it) => ({ date: it.date.toISOString(), name: it.name }));
  const response = new Response(JSON.stringify(toStore), {
    headers: {
      "content-type": "application/json",
      "cache-control": "max-age=2592000", // 30일
    },
  });
  // 캐시 저장 실패해도(예: 로컬 개발 환경) 기능 자체는 계속 동작해야 하므로 무시
  try {
    await cache.put(cacheKey, response.clone());
  } catch (e) {
    // no-op
  }

  return items;
}
