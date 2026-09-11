// 도시 데이터. 이름은 언어와 무관하게 라틴 문자(영문) 표기로 통일한다.
// (실제 세계시계 서비스들의 관행 — 도시 고유명은 번역하지 않고, UI 문구만 번역)
//
// slug: URL에 쓰이는 식별자
// name: 화면에 표시할 도시명
// country: 국가명(영문)
// cc: ISO 3166-1 alpha-2 국가코드 (국기 이모지 생성에 사용)
// tz: IANA 타임존 식별자
// region: 홈페이지에서 묶어서 보여줄 지역 그룹 키 (i18n.js의 regions에서 번역)

export const CITIES = [
  // Americas
  { slug: "honolulu", name: "Honolulu", country: "United States", cc: "US", tz: "Pacific/Honolulu", lat: 21.3, lng: -157.8, region: "americas" },
  { slug: "anchorage", name: "Anchorage", country: "United States", cc: "US", tz: "America/Anchorage", lat: 61.2, lng: -149.9, region: "americas" },
  { slug: "vancouver", name: "Vancouver", country: "Canada", cc: "CA", tz: "America/Vancouver", lat: 49.28, lng: -123.12, region: "americas" },
  { slug: "san-francisco", name: "San Francisco", country: "United States", cc: "US", tz: "America/Los_Angeles", lat: 37.77, lng: -122.42, region: "americas" },
  { slug: "los-angeles", name: "Los Angeles", country: "United States", cc: "US", tz: "America/Los_Angeles", lat: 34.1, lng: -118.2, region: "americas" },
  { slug: "denver", name: "Denver", country: "United States", cc: "US", tz: "America/Denver", lat: 39.7, lng: -105.0, region: "americas" },
  { slug: "chicago", name: "Chicago", country: "United States", cc: "US", tz: "America/Chicago", lat: 41.9, lng: -87.6, region: "americas" },
  { slug: "new-york", name: "New York", country: "United States", cc: "US", tz: "America/New_York", lat: 40.7, lng: -74.0, region: "americas" },
  { slug: "toronto", name: "Toronto", country: "Canada", cc: "CA", tz: "America/Toronto", lat: 43.7, lng: -79.4, region: "americas" },
  { slug: "mexico-city", name: "Mexico City", country: "Mexico", cc: "MX", tz: "America/Mexico_City", lat: 19.4, lng: -99.1, region: "americas" },
  { slug: "bogota", name: "Bogotá", country: "Colombia", cc: "CO", tz: "America/Bogota", lat: 4.7, lng: -74.1, region: "americas" },
  { slug: "lima", name: "Lima", country: "Peru", cc: "PE", tz: "America/Lima", lat: -12.0, lng: -77.0, region: "americas" },
  { slug: "santiago", name: "Santiago", country: "Chile", cc: "CL", tz: "America/Santiago", lat: -33.4, lng: -70.7, region: "americas" },
  { slug: "sao-paulo", name: "São Paulo", country: "Brazil", cc: "BR", tz: "America/Sao_Paulo", lat: -23.6, lng: -46.6, region: "americas" },
  { slug: "buenos-aires", name: "Buenos Aires", country: "Argentina", cc: "AR", tz: "America/Argentina/Buenos_Aires", lat: -34.6, lng: -58.4, region: "americas" },

  // Europe
  { slug: "reykjavik", name: "Reykjavik", country: "Iceland", cc: "IS", tz: "Atlantic/Reykjavik", lat: 64.1, lng: -21.9, region: "europe" },
  { slug: "london", name: "London", country: "United Kingdom", cc: "GB", tz: "Europe/London", lat: 51.5, lng: -0.1, region: "europe" },
  { slug: "dublin", name: "Dublin", country: "Ireland", cc: "IE", tz: "Europe/Dublin", lat: 53.3, lng: -6.3, region: "europe" },
  { slug: "lisbon", name: "Lisbon", country: "Portugal", cc: "PT", tz: "Europe/Lisbon", lat: 38.7, lng: -9.1, region: "europe" },
  { slug: "paris", name: "Paris", country: "France", cc: "FR", tz: "Europe/Paris", lat: 48.9, lng: 2.4, region: "europe" },
  { slug: "madrid", name: "Madrid", country: "Spain", cc: "ES", tz: "Europe/Madrid", lat: 40.4, lng: -3.7, region: "europe" },
  { slug: "frankfurt", name: "Frankfurt", country: "Germany", cc: "DE", tz: "Europe/Berlin", lat: 50.11, lng: 8.68, region: "europe" },
  { slug: "berlin", name: "Berlin", country: "Germany", cc: "DE", tz: "Europe/Berlin", lat: 52.5, lng: 13.4, region: "europe" },
  { slug: "amsterdam", name: "Amsterdam", country: "Netherlands", cc: "NL", tz: "Europe/Amsterdam", lat: 52.4, lng: 4.9, region: "europe" },
  { slug: "rome", name: "Rome", country: "Italy", cc: "IT", tz: "Europe/Rome", lat: 41.9, lng: 12.5, region: "europe" },
  { slug: "zurich", name: "Zurich", country: "Switzerland", cc: "CH", tz: "Europe/Zurich", lat: 47.4, lng: 8.5, region: "europe" },
  { slug: "vienna", name: "Vienna", country: "Austria", cc: "AT", tz: "Europe/Vienna", lat: 48.2, lng: 16.4, region: "europe" },
  { slug: "warsaw", name: "Warsaw", country: "Poland", cc: "PL", tz: "Europe/Warsaw", lat: 52.2, lng: 21.0, region: "europe" },
  { slug: "prague", name: "Prague", country: "Czechia", cc: "CZ", tz: "Europe/Prague", lat: 50.1, lng: 14.4, region: "europe" },
  { slug: "kyiv", name: "Kyiv", country: "Ukraine", cc: "UA", tz: "Europe/Kyiv", lat: 50.45, lng: 30.52, region: "europe" },
  { slug: "athens", name: "Athens", country: "Greece", cc: "GR", tz: "Europe/Athens", lat: 38.0, lng: 23.7, region: "europe" },
  { slug: "istanbul", name: "Istanbul", country: "Turkey", cc: "TR", tz: "Europe/Istanbul", lat: 41.0, lng: 28.9, region: "europe" },
  { slug: "moscow", name: "Moscow", country: "Russia", cc: "RU", tz: "Europe/Moscow", lat: 55.8, lng: 37.6, region: "europe" },

  // Africa & Middle East
  { slug: "cairo", name: "Cairo", country: "Egypt", cc: "EG", tz: "Africa/Cairo", lat: 30.0, lng: 31.2, region: "africa_me" },
  { slug: "johannesburg", name: "Johannesburg", country: "South Africa", cc: "ZA", tz: "Africa/Johannesburg", lat: -26.2, lng: 28.0, region: "africa_me" },
  { slug: "nairobi", name: "Nairobi", country: "Kenya", cc: "KE", tz: "Africa/Nairobi", lat: -1.3, lng: 36.8, region: "africa_me" },
  { slug: "doha", name: "Doha", country: "Qatar", cc: "QA", tz: "Asia/Qatar", lat: 25.28, lng: 51.53, region: "africa_me" },
  { slug: "abu-dhabi", name: "Abu Dhabi", country: "United Arab Emirates", cc: "AE", tz: "Asia/Dubai", lat: 24.45, lng: 54.38, region: "africa_me" },
  { slug: "dubai", name: "Dubai", country: "United Arab Emirates", cc: "AE", tz: "Asia/Dubai", lat: 25.2, lng: 55.3, region: "africa_me" },
  { slug: "riyadh", name: "Riyadh", country: "Saudi Arabia", cc: "SA", tz: "Asia/Riyadh", lat: 24.7, lng: 46.7, region: "africa_me" },
  { slug: "tehran", name: "Tehran", country: "Iran", cc: "IR", tz: "Asia/Tehran", lat: 35.7, lng: 51.4, region: "africa_me" },

  // Asia
  { slug: "new-delhi", name: "New Delhi", country: "India", cc: "IN", tz: "Asia/Kolkata", lat: 28.61, lng: 77.21, region: "asia" },
  { slug: "mumbai", name: "Mumbai", country: "India", cc: "IN", tz: "Asia/Kolkata", lat: 19.1, lng: 72.9, region: "asia" },
  { slug: "karachi", name: "Karachi", country: "Pakistan", cc: "PK", tz: "Asia/Karachi", lat: 24.9, lng: 67.0, region: "asia" },
  { slug: "dhaka", name: "Dhaka", country: "Bangladesh", cc: "BD", tz: "Asia/Dhaka", lat: 23.8, lng: 90.4, region: "asia" },
  { slug: "bangkok", name: "Bangkok", country: "Thailand", cc: "TH", tz: "Asia/Bangkok", lat: 13.8, lng: 100.5, region: "asia" },
  { slug: "jakarta", name: "Jakarta", country: "Indonesia", cc: "ID", tz: "Asia/Jakarta", lat: -6.2, lng: 106.8, region: "asia" },
  { slug: "ho-chi-minh-city", name: "Ho Chi Minh City", country: "Vietnam", cc: "VN", tz: "Asia/Ho_Chi_Minh", lat: 10.82, lng: 106.63, region: "asia" },
  { slug: "hanoi", name: "Hanoi", country: "Vietnam", cc: "VN", tz: "Asia/Ho_Chi_Minh", lat: 21.0, lng: 105.8, region: "asia" },
  { slug: "singapore", name: "Singapore", country: "Singapore", cc: "SG", tz: "Asia/Singapore", lat: 1.35, lng: 103.8, region: "asia" },
  { slug: "kuala-lumpur", name: "Kuala Lumpur", country: "Malaysia", cc: "MY", tz: "Asia/Kuala_Lumpur", lat: 3.1, lng: 101.7, region: "asia" },
  { slug: "manila", name: "Manila", country: "Philippines", cc: "PH", tz: "Asia/Manila", lat: 14.6, lng: 121.0, region: "asia" },
  { slug: "hong-kong", name: "Hong Kong", country: "Hong Kong", cc: "HK", tz: "Asia/Hong_Kong", lat: 22.3, lng: 114.2, region: "asia" },
  { slug: "beijing", name: "Beijing", country: "China", cc: "CN", tz: "Asia/Shanghai", lat: 39.9, lng: 116.4, region: "asia" },
  { slug: "taipei", name: "Taipei", country: "Taiwan", cc: "TW", tz: "Asia/Taipei", lat: 25.0, lng: 121.6, region: "asia" },
  { slug: "seoul", name: "Seoul", country: "South Korea", cc: "KR", tz: "Asia/Seoul", lat: 37.6, lng: 127.0, region: "asia" },
  { slug: "tokyo", name: "Tokyo", country: "Japan", cc: "JP", tz: "Asia/Tokyo", lat: 35.7, lng: 139.7, region: "asia" },

  // Oceania
  { slug: "perth", name: "Perth", country: "Australia", cc: "AU", tz: "Australia/Perth", lat: -31.95, lng: 115.9, region: "oceania" },
  { slug: "adelaide", name: "Adelaide", country: "Australia", cc: "AU", tz: "Australia/Adelaide", lat: -34.9, lng: 138.6, region: "oceania" },
  { slug: "melbourne", name: "Melbourne", country: "Australia", cc: "AU", tz: "Australia/Melbourne", lat: -37.81, lng: 144.96, region: "oceania" },
  { slug: "brisbane", name: "Brisbane", country: "Australia", cc: "AU", tz: "Australia/Brisbane", lat: -27.5, lng: 153.0, region: "oceania" },
  { slug: "sydney", name: "Sydney", country: "Australia", cc: "AU", tz: "Australia/Sydney", lat: -33.9, lng: 151.2, region: "oceania" },
  { slug: "auckland", name: "Auckland", country: "New Zealand", cc: "NZ", tz: "Pacific/Auckland", lat: -36.85, lng: 174.75, region: "oceania" },
  { slug: "fiji", name: "Suva", country: "Fiji", cc: "FJ", tz: "Pacific/Fiji", lat: -18.1, lng: 178.4, region: "oceania" },
];

export function findCity(slug) {
  return CITIES.find((c) => c.slug === slug) || null;
}

// ISO 국가코드 두 글자 -> 국기 이모지 (Regional Indicator Symbol 변환)
export function countryFlag(cc) {
  if (!cc || cc.length !== 2) return "";
  const codePoints = [...cc.toUpperCase()].map(
    (c) => 127397 + c.charCodeAt(0)
  );
  return String.fromCodePoint(...codePoints);
}
