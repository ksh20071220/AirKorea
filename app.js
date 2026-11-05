// 내 서버리스 함수 주소 (인증키는 서버에만 있고 여기에는 없다)
const API_URL = "/api/dust";

// 드롭다운에 넣을 시도 목록
const SIDO_LIST = ["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

// 등급별 색·이모지·글자·안내 문구를 모아둔 표 (색은 style.css와 똑같이 맞춤)
const GRADE_INFO = {
  "1": { className: "grade-1", emoji: "🔵", label: "좋음", color: "#2f80ed", message: "바깥 활동하기 좋은 날이에요" },
  "2": { className: "grade-2", emoji: "🟢", label: "보통", color: "#27ae60", message: "평소처럼 지내도 괜찮아요" },
  "3": { className: "grade-3", emoji: "🟠", label: "나쁨", color: "#f2994a", message: "외출 시 마스크를 챙기세요" },
  "4": { className: "grade-4", emoji: "🔴", label: "매우나쁨", color: "#eb5757", message: "외출 시 마스크를 챙기세요" },
};

// 등급 값이 비어 있을 때 쓰는 회색 정보
const NO_GRADE = { className: "grade-none", emoji: "⚪", label: "등급 없음", color: "#9e9e9e", message: "" };

// 화면에서 자주 쓰는 요소들을 미리 찾아둔다
const sidoSelect = document.getElementById("sido-select");
// 신호등 상자
const signalBox = document.getElementById("signal");
// 불러오는 중 표시
const loadingBox = document.getElementById("loading");
// 신호등 내용 묶음
const signalContent = document.getElementById("signal-content");
// 지역 이름 줄
const signalRegion = document.getElementById("signal-region");
// 큰 이모지
const signalEmoji = document.getElementById("signal-emoji");
// 큰 등급 글자
const signalLabel = document.getElementById("signal-label");
// 평균 숫자
const signalNumber = document.getElementById("signal-number");
// 한 줄 안내 문구
const signalMessage = document.getElementById("signal-message");
// 측정소 수와 시각 설명
const signalDetail = document.getElementById("signal-detail");
// 오류 안내 문구
const statusText = document.getElementById("status");
// 그래프 영역
const chartSection = document.getElementById("chart-section");
// 그래프 크기 상자
const chartBox = document.getElementById("chart-box");
// 그래프 캔버스
const chartCanvas = document.getElementById("pm10-chart");
// 그래프 값 없음 문구
const chartEmpty = document.getElementById("chart-empty");
// 카드 영역 제목
const cardTitle = document.getElementById("card-title");
// 카드가 들어갈 자리
const cardList = document.getElementById("card-list");

// 지금 그려져 있는 그래프 (지역을 바꿀 때 지우기 위해 저장)
let pm10Chart = null;

// 드롭다운에 시도 목록을 채운다
function fillSidoOptions() {
  // 목록을 하나씩 돌면서 option을 만든다
  SIDO_LIST.forEach((sido) => {
    // 새 선택 항목 만들기
    const option = document.createElement("option");
    // 실제 값은 시도 이름
    option.value = sido;
    // 화면에 보일 글자도 시도 이름
    option.textContent = sido;
    // 드롭다운에 붙이기
    sidoSelect.appendChild(option);
  });
}

// 측정값을 숫자로 바꾼다 — "-"나 빈 값이면 null(측정 안 됨)을 돌려준다
function toNumber(value) {
  // 값이 없거나 "-"이면 측정 안 된 것으로 본다
  if (value === null || value === undefined || value === "" || value === "-") return null;
  // 글자를 숫자로 바꿔본다
  const num = Number(value);
  // 제대로 된 숫자일 때만 돌려준다
  return Number.isFinite(num) ? num : null;
}

// 측정값을 화면용 글자로 바꾼다
function formatValue(value) {
  // 숫자로 바꿀 수 있는지 확인
  const num = toNumber(value);
  // 측정 안 된 값이면 안내 글자, 아니면 숫자 + 단위
  return num === null ? "측정 안 됨" : `${num} ㎍/㎥`;
}

// 등급 값에 맞는 정보를 돌려준다 (비어 있으면 회색)
function getGradeInfo(grade) {
  // 표에 있는 등급이면 그 정보를, 없으면 회색 정보를 돌려준다
  return GRADE_INFO[String(grade ?? "").trim()] || NO_GRADE;
}

// 평균 수치로 대표 등급을 정한다 (환경부 PM10 기준)
function gradeFromPm10(avg) {
  // 30 이하면 좋음
  if (avg <= 30) return "1";
  // 80 이하면 보통
  if (avg <= 80) return "2";
  // 150 이하면 나쁨
  if (avg <= 150) return "3";
  // 그보다 크면 매우나쁨
  return "4";
}

// "2026-10-28 16:00" 같은 글자를 Date로 바꾼다 (실패하면 null)
function parseDataTime(dataTime) {
  // 날짜와 시간 부분을 뽑아낸다
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(String(dataTime || "").trim());
  // 형식이 다르면 null
  if (!match) return null;
  // 뽑은 글자들을 숫자로 바꾼다
  const [, y, m, d, h, min] = match.map(Number);
  // Date는 24시를 자동으로 다음 날 0시로 바꿔준다
  return new Date(y, m - 1, d, h, min);
}

// 측정 시각을 "2026년 10월 28일 16시 기준"처럼 바꾼다
function formatKoreanTime(dataTime) {
  // 먼저 Date로 바꿔본다
  const date = parseDataTime(dataTime);
  // 바꿀 수 없으면 받은 값을 그대로 (그마저 없으면 안내 글자)
  if (!date) return dataTime || "측정 시각 정보 없음";
  // 분이 0이 아니면 분까지 붙인다
  const minute = date.getMinutes() ? ` ${date.getMinutes()}분` : "";
  // 한국어 형식으로 만든다
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getHours()}시${minute} 기준`;
}

// 측정소 표시 이름을 만든다 (전국일 때는 시도 이름을 앞에 붙여 '중구' 같은 중복을 구분)
function stationLabel(item, isNationwide) {
  // 측정소 이름 (없으면 안내 글자)
  const name = item.stationName || "이름 없음";
  // 전국이고 시도 이름이 있으면 앞에 붙인다
  return isNationwide && item.sidoName ? `${item.sidoName} ${name}` : name;
}

// 내 서버리스 함수(/api/dust)에서 선택한 시도의 측정 정보를 받아온다
async function fetchAirData(sidoName) {
  // 시도 이름을 주소에 맞게 인코딩해서 요청한다 (예: /api/dust?sido=서울)
  const response = await fetch(`${API_URL}?sido=${encodeURIComponent(sidoName)}`);
  // 응답 JSON을 담을 변수
  let data;
  // JSON 변환을 시도한다
  try {
    // 응답을 JSON으로 읽는다
    data = await response.json();
  } catch {
    // JSON이 아니면 서버리스 함수 자체가 동작하지 않는 것이다
    throw new Error("서버 응답을 읽을 수 없습니다. 배포 상태를 확인해 주세요.");
  }
  // 서버가 보낸 한국어 오류 메시지가 있으면 그대로 보여준다
  if (!response.ok || data.error) throw new Error(data.error || `서버 응답 오류가 발생했습니다 (${response.status})`);
  // 측정소 목록을 돌려준다 (없으면 빈 배열)
  return data.items ?? [];
}

// 신호등 상자의 등급 색을 바꾼다
function setSignalGrade(className) {
  // 기본 모양 + 등급 색 클래스를 붙인다
  signalBox.className = `signal ${className}`;
}

// 신호등을 '불러오는 중' 상태로 바꾸거나 되돌린다
function setLoading(isLoading) {
  // 불러오는 중 표시를 보이거나 숨긴다
  loadingBox.hidden = !isLoading;
  // 신호등 내용은 반대로 숨기거나 보인다
  signalContent.hidden = isLoading;
  // 불러오는 동안 드롭다운을 잠근다
  sidoSelect.disabled = isLoading;
}

// 신호등을 처음 상태(또는 안내 상태)로 되돌린다
function resetSignal(regionText, labelText = "대기 중") {
  // 회색으로
  setSignalGrade(NO_GRADE.className);
  // 지역 줄 문구
  signalRegion.textContent = regionText;
  // 이모지는 흰 동그라미
  signalEmoji.textContent = "⚪";
  // 등급 자리 글자
  signalLabel.textContent = labelText;
  // 숫자 자리 비우기
  signalNumber.textContent = "--";
  // 안내 문구 비우기
  signalMessage.textContent = "";
  // 설명 비우기
  signalDetail.textContent = "";
}

// 평균을 계산해서 공기 신호등을 그린다
function showSignal(sidoName, items) {
  // 숫자로 쓸 수 있는 미세먼지 값만 모은다 ("-"는 빠짐)
  const values = items.map((item) => toNumber(item.pm10Value)).filter((v) => v !== null);
  // 측정값이 하나도 없으면 회색 '측정 안 됨'으로 끝낸다
  if (values.length === 0) {
    // 회색 신호등으로 바꾼다
    resetSignal(`${sidoName} 공기 상태`, "측정 안 됨");
    // 아랫줄 안내
    signalDetail.textContent = "평균을 낼 수 있는 측정값이 없습니다";
    // 여기서 끝낸다
    return;
  }
  // 평균을 구하고 반올림한다
  const avg = Math.round(values.reduce((acc, v) => acc + v, 0) / values.length);
  // 평균에 맞는 대표 등급 정보를 가져온다
  const info = GRADE_INFO[gradeFromPm10(avg)];
  // 가장 최근 측정 시각을 찾는다
  const latest = items.map((item) => item.dataTime).filter((t) => parseDataTime(t)).sort((a, b) => parseDataTime(b) - parseDataTime(a))[0];
  // 신호등 색을 바꾼다
  setSignalGrade(info.className);
  // 지역 줄
  signalRegion.textContent = `${sidoName} 공기 상태`;
  // 큰 이모지
  signalEmoji.textContent = info.emoji;
  // 큰 등급 글자
  signalLabel.textContent = info.label;
  // 평균 숫자
  signalNumber.textContent = avg;
  // 한 줄 안내 문구
  signalMessage.textContent = info.message;
  // 측정소 수와 측정 시각
  signalDetail.textContent = `측정소 ${values.length}곳 평균 · ${latest ? formatKoreanTime(latest) : "측정 시각 정보 없음"}`;
}

// 그려져 있는 그래프를 지운다
function clearChart() {
  // 그래프가 있으면 없앤다 (안 지우면 겹쳐서 깨진다)
  if (pm10Chart) pm10Chart.destroy();
  // 저장해둔 그래프 비우기
  pm10Chart = null;
  // 그래프 영역 숨기기
  chartSection.hidden = true;
}

// 미세먼지 높은 측정소 TOP 10 가로 막대그래프를 그린다
function renderChart(items, isNationwide) {
  // 이전 그래프를 먼저 지운다
  clearChart();
  // 그래프 영역을 보이게 한다
  chartSection.hidden = false;
  // Chart.js를 못 불러왔으면 안내만 한다
  if (typeof Chart === "undefined") {
    // 그래프 상자 숨기기
    chartBox.hidden = true;
    // 안내 문구 보이기
    chartEmpty.hidden = false;
    // 문구 바꾸기
    chartEmpty.textContent = "그래프 도구를 불러오지 못했어요";
    // 여기서 끝낸다
    return;
  }
  // 숫자인 측정소만 골라 높은 순으로 정렬하고 상위 10개만 남긴다
  const top = items
    .map((item) => ({ item, value: toNumber(item.pm10Value) })) // 값과 원래 데이터를 묶는다
    .filter((row) => row.value !== null)                         // 측정 안 됨은 뺀다
    .sort((a, b) => b.value - a.value)                           // 높은 순으로 정렬
    .slice(0, 10);                                               // 상위 10개만
  // 그래프로 그릴 값이 없을 때
  if (top.length === 0) {
    // 그래프 상자 숨기기
    chartBox.hidden = true;
    // 안내 문구 보이기
    chartEmpty.hidden = false;
    // 문구 넣기
    chartEmpty.textContent = "그래프로 보여줄 측정값이 없어요";
    // 여기서 끝낸다
    return;
  }
  // 그래프 상자 보이기
  chartBox.hidden = false;
  // 안내 문구 숨기기
  chartEmpty.hidden = true;
  // 막대 개수에 맞춰 그래프 높이를 정한다
  chartBox.style.height = `${top.length * 38 + 60}px`;
  // 좁은 화면인지 확인한다
  const isNarrow = window.innerWidth < 600;
  // Chart.js 그래프를 만든다
  pm10Chart = new Chart(chartCanvas, {
    // 막대그래프
    type: "bar",
    // 그래프 데이터
    data: {
      // 측정소 이름들 (세로축)
      labels: top.map((row) => stationLabel(row.item, isNationwide)),
      // 막대 묶음 하나
      datasets: [{
        // 막대 이름
        label: "미세먼지",
        // 막대 길이 = 미세먼지 수치
        data: top.map((row) => row.value),
        // 막대 색 = 각 측정소 등급 색
        backgroundColor: top.map((row) => getGradeInfo(row.item.pm10Grade).color),
        // 막대 모서리를 둥글게
        borderRadius: 6,
        // 막대 두께 최대값
        maxBarThickness: 26,
      }],
    },
    // 그래프 설정
    options: {
      // 가로 막대로 그린다
      indexAxis: "y",
      // 화면 폭에 맞춰 크기를 바꾼다
      responsive: true,
      // 상자 높이를 그대로 쓴다
      maintainAspectRatio: false,
      // 부가 기능 설정
      plugins: {
        // 범례는 숨긴다
        legend: { display: false },
        // 마우스를 올리거나 터치했을 때 보이는 말풍선
        tooltip: {
          // 말풍선 글자 설정
          callbacks: {
            // 수치 줄을 "45 ㎍/㎥"처럼 보여준다
            label: (ctx) => `미세먼지 ${ctx.parsed.x} ㎍/㎥ (${getGradeInfo(top[ctx.dataIndex].item.pm10Grade).label})`,
          },
        },
      },
      // 축 설정
      scales: {
        // 가로축(수치)
        x: {
          // 0부터 시작
          beginAtZero: true,
          // 축 이름
          title: { display: true, text: "미세먼지 (㎍/㎥)" },
        },
        // 세로축(측정소 이름)
        y: {
          // 좁은 화면에서는 이름 글자를 작게
          ticks: { font: { size: isNarrow ? 11 : 13 } },
          // 세로 격자선은 숨긴다
          grid: { display: false },
        },
      },
    },
  });
}

// 측정소 하나로 카드 하나를 만든다
function createCard(item, isNationwide) {
  // 등급에 맞는 정보를 가져온다
  const info = getGradeInfo(item.pm10Grade);
  // 카드 상자를 만든다
  const card = document.createElement("article");
  // 기본 카드 모양 + 등급 색을 붙인다
  card.className = `card ${info.className}`;

  // 카드 윗줄(이름 + 등급)을 만든다
  const head = document.createElement("div");
  // 윗줄 모양 지정
  head.className = "card-head";
  // 측정소 이름 글자
  const name = document.createElement("span");
  // 이름 모양 지정
  name.className = "station-name";
  // 이름 넣기
  name.textContent = stationLabel(item, isNationwide);
  // 등급 뱃지
  const badge = document.createElement("span");
  // 뱃지 모양 지정
  badge.className = "grade-badge";
  // 이모지 + 등급 글자 넣기
  badge.textContent = `${info.emoji} ${info.label}`;
  // 윗줄에 이름과 뱃지를 붙인다
  head.append(name, badge);

  // 미세먼지 줄을 만든다
  const pm10Row = createRow("미세먼지", formatValue(item.pm10Value));
  // 초미세먼지 줄을 만든다
  const pm25Row = createRow("초미세먼지", formatValue(item.pm25Value));

  // 측정 시각 글자를 만든다
  const time = document.createElement("p");
  // 시각 모양 지정
  time.className = "card-time";
  // 한국어 형식의 시각 넣기
  time.textContent = formatKoreanTime(item.dataTime);

  // 카드에 모든 부분을 붙인다
  card.append(head, pm10Row, pm25Row, time);
  // 완성된 카드를 돌려준다
  return card;
}

// "이름: 값" 형태의 한 줄을 만든다
function createRow(label, valueText) {
  // 줄 상자 만들기
  const row = document.createElement("div");
  // 줄 모양 지정
  row.className = "card-row";
  // 왼쪽 이름 글자
  const left = document.createElement("span");
  // 이름 넣기
  left.textContent = label;
  // 오른쪽 값 글자
  const right = document.createElement("strong");
  // 값 넣기
  right.textContent = valueText;
  // 줄에 둘 다 붙이기
  row.append(left, right);
  // 완성된 줄을 돌려준다
  return row;
}

// 안내 문구를 바꾼다 (isError가 참이면 빨간 글자)
function setStatus(message, isError = false) {
  // 문구 넣기
  statusText.textContent = message;
  // 오류 여부에 따라 모양 바꾸기
  statusText.className = isError ? "status error" : "status";
}

// 카드 영역을 비운다
function clearCards() {
  // 카드 지우기
  cardList.innerHTML = "";
  // 카드 제목 숨기기
  cardTitle.hidden = true;
}

// 시도를 골랐을 때 전체 화면을 새로 그린다
async function loadSido(sidoName) {
  // 기존 카드를 지운다
  clearCards();
  // 기존 그래프를 지운다
  clearChart();
  // 안내 문구 비우기
  setStatus("");
  // 아무 것도 안 골랐으면 처음 상태로
  if (!sidoName) {
    // 신호등 초기화
    resetSignal("지역을 고르면 공기 상태가 표시됩니다");
    // 여기서 끝낸다
    return;
  }
  // 전국인지 확인한다
  const isNationwide = sidoName === "전국";
  // 불러오는 중으로 바꾼다
  setLoading(true);
  // 요청 중 오류가 나도 화면이 멈추지 않게 감싼다
  try {
    // 서버에서 데이터를 받아온다
    const items = await fetchAirData(sidoName);
    // 불러오는 중을 끝낸다 (그래프는 보이는 상태에서 그려야 크기가 맞는다)
    setLoading(false);
    // 데이터가 없으면 안내만 한다
    if (items.length === 0) {
      // 신호등 회색 처리
      resetSignal(`${sidoName} 공기 상태`, "정보 없음");
      // 안내 문구
      setStatus("표시할 측정소 정보가 없습니다.");
      // 여기서 끝낸다
      return;
    }
    // 공기 신호등을 그린다
    showSignal(sidoName, items);
    // 막대그래프를 그린다
    renderChart(items, isNationwide);
    // 카드 제목 보이기
    cardTitle.hidden = false;
    // 측정소마다 카드를 만들어 붙인다
    items.forEach((item) => cardList.appendChild(createCard(item, isNationwide)));
  } catch (error) {
    // 불러오는 중을 끝낸다
    setLoading(false);
    // 신호등 회색 처리
    resetSignal("정보를 불러오지 못했습니다", "오류");
    // 오류 내용을 빨간 글자로 보여준다
    setStatus(error.message || "알 수 없는 오류가 발생했습니다.", true);
    // 개발자 도구 콘솔에도 자세한 오류를 남긴다
    console.error(error);
  }
}

// 드롭다운 값이 바뀌면 그 지역을 불러온다
sidoSelect.addEventListener("change", (event) => loadSido(event.target.value));

// 페이지가 열리면 드롭다운 목록부터 채운다
fillSidoOptions();
