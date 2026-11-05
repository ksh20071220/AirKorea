// 에어코리아 시도별 실시간 측정정보 조회 주소
const API_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";

// 에어코리아 측정소정보(측정소 목록) 조회 주소 — 좌표를 여기서 가져온다
const STATION_URL = "https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList";

// 허용하는 시도 이름 목록 (이 외의 값은 막는다)
const SIDO_LIST = ["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

// 주소에 긴 이름으로 적힌 시도를 짧은 이름으로 바꾸는 표
const LONG_SIDO = {
  "충청북도": "충북", "충청남도": "충남",          // 충청
  "전라북도": "전북", "전북특별자치도": "전북",    // 전북
  "전라남도": "전남",                              // 전남
  "경상북도": "경북", "경상남도": "경남",          // 경상
  "강원도": "강원", "강원특별자치도": "강원",      // 강원
  "제주특별자치도": "제주", "제주도": "제주",      // 제주
  "세종특별자치시": "세종",                        // 세종
};

// 주소 맨 앞 단어를 짧은 시도 이름으로 바꾼다 (예: "서울특별시 중구..." → "서울")
function sidoFromAddr(addr) {
  // 주소 첫 단어를 꺼낸다
  const first = String(addr || "").trim().split(/\s+/)[0] || "";
  // 표에 있으면 짧은 이름으로
  if (LONG_SIDO[first]) return LONG_SIDO[first];
  // 아니면 목록 중 앞글자가 같은 시도를 찾는다 (서울특별시 → 서울, 경기도 → 경기)
  return SIDO_LIST.find((s) => s !== "전국" && first.startsWith(s)) || "";
}

// dmX, dmY 값을 범위로 판별해 위도·경도로 바꾼다 (한국 위도 33~39, 경도 124~132)
function toLatLng(dmX, dmY) {
  // 두 값을 숫자로 바꾼다
  const a = Number(dmX);
  // 두 번째 값도 숫자로
  const b = Number(dmY);
  // 위도 범위인지 확인하는 함수
  const isLat = (v) => v >= 32 && v <= 39.5;
  // 경도 범위인지 확인하는 함수
  const isLng = (v) => v >= 124 && v <= 132;
  // dmX가 위도, dmY가 경도인 경우
  if (isLat(a) && isLng(b)) return { lat: a, lng: b };
  // 반대로 들어온 경우
  if (isLat(b) && isLng(a)) return { lat: b, lng: a };
  // 둘 다 아니면 좌표 없음
  return null;
}

// 요청을 보내고 JSON을 돌려준다 (JSON이 아니거나 결과 코드가 실패면 오류를 던진다)
async function fetchJson(url) {
  // 서버에 요청을 보낸다
  const response = await fetch(url);
  // 응답을 글자로 먼저 받는다 (XML 에러일 수도 있어서)
  const text = await response.text();
  // JSON으로 바꾼 결과
  let data;
  // JSON 변환을 시도한다
  try {
    // 글자를 JSON 객체로 바꾼다
    data = JSON.parse(text);
  } catch {
    // 서버 로그에 앞부분을 남긴다
    console.error("JSON이 아닌 응답:", text.slice(0, 300));
    // 한국어 안내 메시지로 오류를 던진다
    throw new Error("인증키 또는 요청값을 확인해주세요");
  }
  // 응답 머리 부분을 꺼낸다
  const header = data?.response?.header;
  // 결과 코드가 성공(00)이 아니면 오류를 던진다
  if (!header || header.resultCode !== "00") throw new Error(`요청에 실패했습니다: ${header?.resultMsg || "알 수 없는 오류"}`);
  // 정상 데이터를 돌려준다
  return data;
}

// 측정소 목록(좌표)을 가져온다 — 실패해도 함수 전체가 멈추지 않게 null을 돌려준다
async function fetchStations(serviceKey, sido) {
  // 요청 주소를 만든다 (전국이면 주소 조건 없이 전체)
  const url =
    `${STATION_URL}?serviceKey=${encodeURIComponent(serviceKey)}` +
    `&returnType=json&numOfRows=1000&pageNo=1` +
    (sido === "전국" ? "" : `&addr=${encodeURIComponent(sido)}`);
  // 실패해도 괜찮도록 감싼다
  try {
    // 측정소 목록을 받아온다
    const data = await fetchJson(url);
    // 목록만 돌려준다
    return data?.response?.body?.items ?? [];
  } catch (error) {
    // 서버 로그에 남긴다 (활용신청 전이면 여기로 온다)
    console.error("측정소정보 조회 실패:", error.message);
    // 좌표 없이 진행하도록 null
    return null;
  }
}

// Vercel 서버리스 함수: /api/dust?sido=서울 로 호출된다
module.exports = async function handler(req, res) {
  // 쿼리에서 시도 이름을 읽고, 없으면 '서울'을 기본값으로 쓴다
  const sido = (req.query.sido || "서울").trim();

  // 목록에 없는 시도면 요청을 막는다
  if (!SIDO_LIST.includes(sido)) {
    // 잘못된 요청이라고 알려준다
    return res.status(400).json({ error: "지원하지 않는 지역입니다" });
  }

  // 환경변수에서 인증키(Decoding 키)를 읽는다 — 코드에는 키를 적지 않는다
  const serviceKey = process.env.AIRKOREA_KEY;

  // 환경변수가 설정되지 않았으면 멈춘다
  if (!serviceKey) {
    // 서버 설정 문제라고 알려준다
    return res.status(500).json({ error: "서버에 인증키가 설정되지 않았습니다" });
  }

  // 전국은 측정소가 600곳이 넘어서 1000개, 나머지는 100개를 받는다
  const numOfRows = sido === "전국" ? 1000 : 100;

  // 측정값 요청 주소를 만든다
  const url =
    `${API_URL}?serviceKey=${encodeURIComponent(serviceKey)}` +
    `&returnType=json&numOfRows=${numOfRows}&pageNo=1&ver=1.3` +
    `&sidoName=${encodeURIComponent(sido)}`;

  // 측정값과 측정소 목록을 동시에 요청한다
  const [measureResult, stations] = await Promise.all([
    // 측정값 (실패하면 오류 객체로 받는다)
    fetchJson(url).catch((error) => ({ __error: error })),
    // 측정소 좌표 (실패하면 null)
    fetchStations(serviceKey, sido),
  ]);

  // 측정값 요청이 실패했으면 그 메시지를 돌려준다
  if (measureResult.__error) {
    // 네트워크 오류인지 확인한다
    const isNetwork = measureResult.__error.name === "TypeError";
    // 한국어 메시지로 응답한다
    return res.status(502).json({ error: isNetwork ? "에어코리아 서버에 연결하지 못했습니다" : measureResult.__error.message });
  }

  // 측정소 목록을 꺼낸다 (없으면 빈 배열)
  const items = measureResult?.response?.body?.items ?? [];

  // 측정소 이름 → 좌표 표 (시도까지 붙인 열쇠와 이름만 쓴 열쇠 두 가지)
  const byFullKey = new Map();
  // 이름만으로 찾는 표 (이름이 여러 곳이면 null로 표시해 헷갈림을 막는다)
  const byName = new Map();
  // 측정소 목록을 하나씩 표에 넣는다
  (stations || []).forEach((st) => {
    // 좌표를 위도·경도로 바꾼다
    const pos = toLatLng(st.dmX, st.dmY);
    // 좌표가 없으면 건너뛴다
    if (!pos) return;
    // "시도|측정소" 열쇠로 저장
    byFullKey.set(`${sidoFromAddr(st.addr)}|${st.stationName}`, pos);
    // 이름이 처음이면 저장, 겹치면 null
    byName.set(st.stationName, byName.has(st.stationName) ? null : pos);
  });

  // 측정값마다 좌표를 붙인다
  const merged = items.map((item) => {
    // 측정값의 시도 이름 (없으면 요청한 시도)
    const itemSido = item.sidoName || sido;
    // 시도+이름으로 먼저 찾고, 없으면 이름만으로 찾는다
    const pos = byFullKey.get(`${itemSido}|${item.stationName}`) || byName.get(item.stationName) || null;
    // 원래 데이터에 lat, lng를 더한다
    return { ...item, lat: pos ? pos.lat : null, lng: pos ? pos.lng : null };
  });

  // 같은 요청은 5분 동안 Vercel이 저장해두고 재사용하게 한다
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  // 측정소정보를 받아왔는지도 함께 알려준다
  return res.status(200).json({ sido, stationsOk: stations !== null, items: merged });
};
