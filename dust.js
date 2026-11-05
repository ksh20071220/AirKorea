// 에어코리아 시도별 실시간 측정정보 조회 주소
const API_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";

// 허용하는 시도 이름 목록 (이 외의 값은 막는다)
const SIDO_LIST = ["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

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

  // 인증키와 시도 이름을 주소에 맞게 인코딩해서 요청 주소를 만든다
  const url =
    `${API_URL}?serviceKey=${encodeURIComponent(serviceKey)}` +
    `&returnType=json&numOfRows=${numOfRows}&pageNo=1&ver=1.3` +
    `&sidoName=${encodeURIComponent(sido)}`;

  // 에어코리아 서버의 응답 글자를 담을 변수
  let text;
  // 네트워크 오류가 나도 함수가 죽지 않게 감싼다
  try {
    // 에어코리아 서버에 요청을 보낸다
    const response = await fetch(url);
    // 응답을 글자로 먼저 받는다 (XML 에러일 수도 있어서)
    text = await response.text();
  } catch (error) {
    // 서버 로그에 자세한 오류를 남긴다
    console.error(error);
    // 연결 실패를 알려준다
    return res.status(502).json({ error: "에어코리아 서버에 연결하지 못했습니다" });
  }

  // JSON으로 바꾼 결과를 담을 변수
  let data;
  // JSON 변환을 시도한다
  try {
    // 글자를 JSON 객체로 바꾼다
    data = JSON.parse(text);
  } catch {
    // JSON이 아니면(XML 에러 등) 서버 로그에 앞부분을 남긴다
    console.error("JSON이 아닌 응답:", text.slice(0, 300));
    // 한국어 안내 메시지를 돌려준다
    return res.status(502).json({ error: "인증키 또는 요청값을 확인해주세요" });
  }

  // 응답 머리 부분에서 결과 코드를 꺼낸다
  const header = data?.response?.header;

  // 결과 코드가 성공(00)이 아니면 실패로 알려준다
  if (!header || header.resultCode !== "00") {
    // 원인 메시지를 함께 붙여 돌려준다
    return res.status(502).json({ error: `요청에 실패했습니다: ${header?.resultMsg || "알 수 없는 오류"}` });
  }

  // 측정소 목록을 꺼낸다 (없으면 빈 배열)
  const items = data?.response?.body?.items ?? [];

  // 같은 요청은 5분 동안 Vercel이 저장해두고 재사용하게 한다
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  // 프론트엔드가 쓰기 쉬운 모양으로 돌려준다
  return res.status(200).json({ sido, items });
};
