// 일출/일몰 근사 계산. 표준 태양 계산 공식(NOAA/Sunrise equation 계열)을 그대로 구현.
// 외부 API 없이 순수 계산이라 서버 사이드(Workers)에서도 요청마다 즉시 계산 가능.

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

// dateUTC: 계산 기준일(UTC), lat/lng: 도시 좌표
// 반환값: { sunriseUtcHour, sunsetUtcHour } (해당 UTC 날짜 기준 소수 시간) 또는
//         극지방처럼 뜨거나 지지 않는 날은 null
function calcSunUtcHour(dateUTC, lat, lng, isSunrise) {
  const start = Date.UTC(dateUTC.getUTCFullYear(), 0, 1);
  const dayOfYear =
    Math.floor((dateUTC.getTime() - start) / 86400000) + 1;

  const zenith = 90.833; // 대기 굴절 보정을 포함한 공식 일출/일몰 기준각
  const lngHour = lng / 15;

  const t = isSunrise
    ? dayOfYear + (6 - lngHour) / 24
    : dayOfYear + (18 - lngHour) / 24;

  const M = 0.9856 * t - 3.289;
  let L =
    M +
    1.916 * Math.sin(toRad(M)) +
    0.02 * Math.sin(2 * toRad(M)) +
    282.634;
  L = ((L % 360) + 360) % 360;

  let RA = toDeg(Math.atan(0.91764 * Math.tan(toRad(L))));
  RA = ((RA % 360) + 360) % 360;
  const Lquadrant = Math.floor(L / 90) * 90;
  const RAquadrant = Math.floor(RA / 90) * 90;
  RA = (RA + (Lquadrant - RAquadrant)) / 15;

  const sinDec = 0.39782 * Math.sin(toRad(L));
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosH =
    (Math.cos(toRad(zenith)) - sinDec * Math.sin(toRad(lat))) /
    (cosDec * Math.cos(toRad(lat)));

  if (cosH > 1 || cosH < -1) return null; // 뜨지 않거나 지지 않는 날 (극지방)

  let H = isSunrise ? 360 - toDeg(Math.acos(cosH)) : toDeg(Math.acos(cosH));
  H = H / 15;

  const Tt = H + RA - 0.06571 * t - 6.622;
  let UT = Tt - lngHour;
  UT = ((UT % 24) + 24) % 24;
  return UT;
}

function utcHourToDate(baseDateUTC, hourFrac) {
  if (hourFrac == null) return null;
  const h = Math.floor(hourFrac);
  const m = Math.round((hourFrac - h) * 60);
  return new Date(
    Date.UTC(
      baseDateUTC.getUTCFullYear(),
      baseDateUTC.getUTCMonth(),
      baseDateUTC.getUTCDate(),
      h,
      m
    )
  );
}

// city: {lat, lng}, date: 계산 기준 Date(보통 현재 시각)
// 반환: { sunrise: Date|null, sunset: Date|null }
export function getSunTimes(city, date = new Date()) {
  const sunriseHour = calcSunUtcHour(date, city.lat, city.lng, true);
  const sunsetHour = calcSunUtcHour(date, city.lat, city.lng, false);
  return {
    sunrise: utcHourToDate(date, sunriseHour),
    sunset: utcHourToDate(date, sunsetHour),
  };
}
