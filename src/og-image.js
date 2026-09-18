import { ImageResponse } from "workers-og";

function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 도시 페이지용 1200x630 OG 이미지. satori-html이 실제 HTML 문자열을 파싱해서
// SVG로 렌더링한 뒤 PNG로 인코딩합니다. 브라우저 CSS와 100% 동일하진 않으니
// flex/기본 속성 위주로 단순하게 구성하는 게 안전합니다.
export function renderCityOgImage({ city, timeText, dateText, offsetLabel }) {
  const html = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:1200px; height:630px; background:#14141f; color:#ffffff; font-family:sans-serif;">
      <div style="display:flex; align-items:center; font-size:56px; margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:center; width:76px; height:56px; margin-right:20px; background:#2a2a3d; border-radius:10px; font-size:26px; font-weight:700; color:#ffffff;">${esc(city.cc)}</div>
        <div style="display:flex; font-weight:700;">${esc(city.name)}</div>
      </div>
      <div style="display:flex; font-size:36px; color:#9a9a9a; margin-bottom:36px;">${esc(city.country)}</div>
      <div style="display:flex; font-size:140px; font-weight:700; color:#ffffff;">${esc(timeText)}</div>
      <div style="display:flex; font-size:30px; color:#9a9a9a; margin-top:20px;">${esc(dateText)} - ${esc(offsetLabel)}</div>
      <div style="display:flex; font-size:26px; color:#5b9dff; font-weight:600; margin-top:36px;">World Time Now</div>
    </div>
  `;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
  });
}

// 홈페이지용 기본 OG 이미지 (도시 특정 없이 브랜드만).
export function renderHomeOgImage(siteName, tagline) {
  const html = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:1200px; height:630px; background:#14141f; color:#ffffff; font-family:sans-serif;">
      <div style="display:flex; font-size:80px; font-weight:700; margin-bottom:20px;">${esc(siteName)}</div>
      <div style="display:flex; font-size:34px; color:#9a9a9a;">${esc(tagline)}</div>
    </div>
  `;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
  });
}
