// 공휴일 데이터. 정확도가 검증 가능한 것만 다룬다:
//   - 고정일(fixed): 매년 같은 월/일에 열리는 공휴일 (예: 신정 1/1)
//   - 계산 가능한 규칙(rule 함수): 부활절 기준, "n번째 요일" 기준 등 공식으로 도출되는 공휴일
// 설날/추석/이드/디왈리처럼 매년 날짜가 바뀌는 음력 공휴일은 정확한 날짜를 보장할 수 없어
// 의도적으로 제외했다 (틀린 날짜를 보여주는 것이 안 보여주는 것보다 나쁘다고 판단).

function easterSunday(year) {
  // Anonymous Gregorian algorithm (공개된 표준 계산법)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// 해당 연도의 month(0-indexed)에서 n번째 weekday(0=일~6=토)를 구함
function nthWeekdayOfMonth(year, monthIndex, weekday, n) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = first.getUTCDay();
  let day = 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
  return new Date(Date.UTC(year, monthIndex, day));
}

// 해당 연도의 month에서 마지막 weekday를 구함 (미국 Memorial Day 등에 사용)
function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, monthIndex, lastDay));
  const diff = (last.getUTCDay() - weekday + 7) % 7;
  return addDays(last, -diff);
}

// 국가코드(cc)별 공휴일 규칙. fixed: {month(1-12), day, name} / rule: (year) => Date
const HOLIDAY_RULES = {
  US: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 7, day: 4, name: "Independence Day" },
    { month: 12, day: 25, name: "Christmas Day" },
    { name: "Memorial Day", rule: (y) => lastWeekdayOfMonth(y, 4, 1) },
    { name: "Labor Day", rule: (y) => nthWeekdayOfMonth(y, 8, 1, 1) },
    { name: "Thanksgiving Day", rule: (y) => nthWeekdayOfMonth(y, 10, 4, 4) },
  ],
  CA: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 7, day: 1, name: "Canada Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  MX: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 9, day: 16, name: "Independence Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  CO: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 7, day: 20, name: "Independence Day" },
  ],
  PE: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 7, day: 28, name: "Independence Day" },
  ],
  CL: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 9, day: 18, name: "Independence Day" },
  ],
  BR: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 9, day: 7, name: "Independence Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  AR: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 5, day: 25, name: "May Revolution Day" },
    { month: 7, day: 9, name: "Independence Day" },
  ],
  IS: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 6, day: 17, name: "National Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  GB: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 12, day: 25, name: "Christmas Day" },
    { month: 12, day: 26, name: "Boxing Day" },
    { name: "Good Friday", rule: (y) => addDays(easterSunday(y), -2) },
  ],
  IE: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 3, day: 17, name: "Saint Patrick's Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  PT: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 6, day: 10, name: "Portugal Day" },
    { month: 10, day: 5, name: "Republic Day" },
    { month: 12, day: 1, name: "Restoration of Independence" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  FR: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 7, day: 14, name: "Bastille Day" },
    { month: 11, day: 11, name: "Armistice Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  ES: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 10, day: 12, name: "National Day" },
    { month: 12, day: 6, name: "Constitution Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  DE: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 10, day: 3, name: "German Unity Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  NL: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 4, day: 27, name: "King's Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  IT: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 4, day: 25, name: "Liberation Day" },
    { month: 6, day: 2, name: "Republic Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  CH: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 8, day: 1, name: "Swiss National Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  AT: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 10, day: 26, name: "National Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  PL: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 5, day: 3, name: "Constitution Day" },
    { month: 11, day: 11, name: "Independence Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  CZ: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 9, day: 28, name: "Statehood Day" },
    { month: 10, day: 28, name: "Independence Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  GR: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 3, day: 25, name: "Independence Day" },
    { month: 10, day: 28, name: "Ochi Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  TR: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 10, day: 29, name: "Republic Day" },
  ],
  RU: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 5, day: 9, name: "Victory Day" },
    { month: 6, day: 12, name: "Russia Day" },
  ],
  EG: [{ month: 7, day: 23, name: "Revolution Day" }],
  ZA: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 4, day: 27, name: "Freedom Day" },
    { month: 9, day: 24, name: "Heritage Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  KE: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 6, day: 1, name: "Madaraka Day" },
    { month: 12, day: 12, name: "Jamhuri Day" },
  ],
  AE: [{ month: 12, day: 2, name: "National Day" }],
  SA: [
    { month: 2, day: 22, name: "Founding Day" },
    { month: 9, day: 23, name: "National Day" },
  ],
  IN: [
    { month: 1, day: 26, name: "Republic Day" },
    { month: 8, day: 15, name: "Independence Day" },
    { month: 10, day: 2, name: "Gandhi Jayanti" },
  ],
  PK: [
    { month: 3, day: 23, name: "Pakistan Day" },
    { month: 8, day: 14, name: "Independence Day" },
  ],
  BD: [
    { month: 3, day: 26, name: "Independence Day" },
    { month: 12, day: 16, name: "Victory Day" },
  ],
  ID: [{ month: 8, day: 17, name: "Independence Day" }],
  VN: [{ month: 9, day: 2, name: "National Day" }],
  SG: [{ month: 8, day: 9, name: "National Day" }],
  MY: [
    { month: 8, day: 31, name: "Merdeka Day" },
    { month: 9, day: 16, name: "Malaysia Day" },
  ],
  PH: [
    { month: 6, day: 12, name: "Independence Day" },
    { month: 12, day: 30, name: "Rizal Day" },
  ],
  HK: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 7, day: 1, name: "HKSAR Establishment Day" },
    { month: 10, day: 1, name: "National Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  CN: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 5, day: 1, name: "Labour Day" },
    { month: 10, day: 1, name: "National Day" },
  ],
  TW: [{ month: 10, day: 10, name: "National Day" }],
  KR: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 3, day: 1, name: "Independence Movement Day" },
    { month: 8, day: 15, name: "Liberation Day" },
    { month: 10, day: 3, name: "National Foundation Day" },
    { month: 10, day: 9, name: "Hangeul Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  JP: [
    { month: 2, day: 11, name: "National Foundation Day" },
    { month: 2, day: 23, name: "Emperor's Birthday" },
    { month: 4, day: 29, name: "Showa Day" },
    { month: 5, day: 3, name: "Constitution Memorial Day" },
    { month: 5, day: 4, name: "Greenery Day" },
    { month: 5, day: 5, name: "Children's Day" },
    { month: 8, day: 11, name: "Mountain Day" },
    { month: 11, day: 3, name: "Culture Day" },
    { month: 11, day: 23, name: "Labor Thanksgiving Day" },
  ],
  AU: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 1, day: 26, name: "Australia Day" },
    { name: "Anzac Day", rule: () => new Date(Date.UTC(1, 3, 25)) }, // 4/25 고정
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  NZ: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 2, day: 6, name: "Waitangi Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
};

// Anzac Day 같은 고정 규칙은 위에서 rule 함수가 연도 무시하는 실수를 방지하기 위해 별도 처리
HOLIDAY_RULES.AU[2] = { month: 4, day: 25, name: "Anzac Day" };

export function getHolidaysForCountry(cc, year) {
  const rules = HOLIDAY_RULES[cc];
  if (!rules) return [];
  const items = rules.map((r) => {
    const date = r.rule ? r.rule(year) : new Date(Date.UTC(year, r.month - 1, r.day));
    return { date, name: r.name };
  });
  items.sort((a, b) => a.date.getTime() - b.date.getTime());
  return items;
}

// 계산된 목록(computed)과 외부 API 목록(external, 예: 한국 특일 정보)을 날짜 기준으로 병합.
// 같은 날짜가 겹치면 더 신뢰도 높은 외부 API 쪽 이름을 우선한다.
export function mergeHolidays(computed, external) {
  const map = new Map();
  for (const item of computed) {
    map.set(item.date.toISOString().slice(0, 10), item);
  }
  for (const item of external) {
    map.set(item.date.toISOString().slice(0, 10), item);
  }
  return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}
