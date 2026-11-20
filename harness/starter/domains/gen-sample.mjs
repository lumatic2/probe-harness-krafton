// gen-sample.mjs — 가상 데이터 생성기 (고정 시드: 다시 돌려도 같은 결과, 의존성 0)
// 실행: node starter/domains/gen-sample.mjs [education|documents|interview]  → 각 폴더의 sample.json · decisions.json 을 다시 쓴다(이름을 안 주면 셋 다).
// 실제 회사·사람 정보 없음. 도메인마다 200~400행. 새 도메인은 이 파일이 아니라 CSV 로 만든다(starter/DOMAIN.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const pad = (n, w = 2) => String(n).padStart(w, '0');
const makePick = (rnd) => (weights) => {
  const total = weights.reduce((s, w) => s + w, 0);
  let x = rnd() * total;
  for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x < 0) return i; }
  return weights.length - 1;
};

// ====================== 교육: 사내 교육 이수 ======================
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권'];
const GIVEN = ['민준', '서연', '지후', '하윤', '도윤', '서윤', '예준', '지우', '시우', '수아', '주원', '아린', '현우', '다은', '건우', '채원', '유준', '소율', '태윤', '나은'];
const JOBS = ['기획', '영업', '개발', '고객지원', '인사·총무', '구매'];
const COURSES = [
  ['정보보안 교육', 365], ['개인정보보호 교육', 365], ['안전보건 교육', 365], ['직장 내 괴롭힘 예방 교육', 365], ['성희롱 예방 교육', 365], ['준법·윤리 교육', 365],
];

export function generateEducation() {
  const TODAY = '2026-10-28', START = '2026-10-15';
  const rnd = mulberry32(20261101);
  const pickW = makePick(rnd);
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  // 사원 90명. 입사 90일 이내(2026-07-30 이후)는 교육 대상에서 제외한다 — 이 규칙은 데이터 생성에만 있고 화면 코드에는 없다.
  const cutoff = addDays(TODAY, -90);
  const people = Array.from({ length: 90 }, (_, i) => ({
    emp: `E${2000 + i * 7 + rint(0, 5)}`,
    name: `${SURNAMES[Math.floor(rnd() * SURNAMES.length)]}${GIVEN[Math.floor(rnd() * GIVEN.length)]}`,
    job: JOBS[pickW([5, 4, 3, 3, 2, 1])],
    hired: addDays('2016-03-01', rint(0, 3700)),
  }));
  const eligible = people.filter((p) => p.hired < cutoff);
  const dates = Array.from({ length: 14 }, (_, i) => addDays(START, i));
  const used = new Set();
  const rows = [];
  const perDay = dates.map((d) => { const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); return Math.round(23 * (dow === 0 || dow === 6 ? 0.45 : 1) * (0.85 + 0.3 * rnd())); });
  dates.forEach((d, di) => {
    for (let k = 0; k < perDay[di]; k++) {
      let p, c, key, guard = 0;
      do { p = eligible[Math.floor(rnd() * eligible.length)]; c = COURSES[Math.floor(rnd() * COURSES.length)]; key = `${p.emp}|${c[0]}`; guard++; } while (used.has(key) && guard < 50);
      used.add(key);
      const age = dates.length - 1 - di;
      const r = rnd();
      const doneP = Math.min(0.92, 0.5 + 0.035 * age), expiredP = 0.15;
      let status, completed = '', valid;
      if (r < expiredP) { // 갱신 배정: 지난 이수의 유효기간이 이미 지났다
        status = '만료';
        completed = addDays(TODAY, -(366 + rint(5, 150)));
        valid = addDays(completed, c[1]);
      } else if (r < expiredP + (1 - expiredP) * doneP) {
        status = '이수';
        completed = addDays(d, rint(0, Math.max(0, Math.min(age, 6))));
        valid = addDays(completed, c[1]);
      } else {
        status = '미이수';
        valid = addDays(d, rint(6, 16)); // 이수 기한
      }
      rows.push({ emp_id: p.emp, name: p.name, job: p.job, course: c[0], assigned: d, completed, valid_until: valid, status, hired: p.hired });
    }
  });
  rows.sort((a, b) => (a.assigned < b.assigned ? -1 : a.assigned > b.assigned ? 1 : a.emp_id < b.emp_id ? -1 : 1));
  rows.forEach((r, i) => { Object.assign(r, { rec_id: `EDU-${pad(i + 1, 4)}` }); });
  const ordered = rows.map(({ rec_id, ...rest }) => ({ rec_id, ...rest }));
  const miss = ordered.filter((r) => r.status === '미이수').slice(-3).reverse();
  const decisions = miss.map((r, i) => ({
    id: `D-000${i + 1}`, ref: r.rec_id, completed: [TODAY, TODAY, addDays(TODAY, -1)][i], decision: i === 1 ? '반려' : '이수 확인',
    reason: ['수료증 확인', '수강 기록 없음, 재수강 필요', '온라인 과정 수료 확인'][i], who: '교육 담당', ts: `${TODAY}T08:${40 - i * 3}:00`,
  }));
  return { sample: { rows: ordered }, decisions };
}

// ====================== 문서: 특허·기술 문서 분류 ======================
export const DOC_TAGS = ['데이터 저장', '사용자 인터페이스', '업무 자동화', '시스템 모니터링', '품질 검사', '결제·정산', '네트워크 통신', 'AI·알고리즘'];
const DOC_APPLICANTS = ['한빛전자', '에이원테크', '다온솔루션', '미래시스템', '세진시스템'];
const DOC_VOCAB = {
  '데이터 저장': { n: ['저장 장치 구조', '색인 구조', '캐시 계층', '백업 체계'], e: ['접근 지연을 줄이고', '저장 용량을 절약하고', '복구 시간을 단축하고'] },
  '사용자 인터페이스': { n: ['화면 배치', '입력 양식', '알림 표시', '접근성 지원'], e: ['조작 단계를 줄이고', '오입력을 줄이고', '학습 시간을 단축하고'] },
  '업무 자동화': { n: ['결재 흐름 설정', '일정 자동 배정', '문서 자동 생성', '반복 작업 처리'], e: ['처리 편차를 줄이고', '처리 시간을 단축하고', '재작업 비율을 낮추고'] },
  '시스템 모니터링': { n: ['서버 상태', '응답 시간 이력', '배치 작업 동작', '네트워크 트래픽'], e: ['이상 징후를 조기에 알리고', '중단 시간을 줄이고', '점검 주기를 최적화하고'] },
  '품질 검사': { n: ['입력 오류 검출', '문서 형식 검증', '응답 정확도 측정', '중복 데이터 검사'], e: ['검사 속도를 높이고', '미검출률을 낮추고', '측정 반복성을 높이고'] },
  '결제·정산': { n: ['정산 규칙 조합', '환불 처리 순서', '수수료 계산 방식', '청구서 대조'], e: ['정산 오차를 줄이고', '처리 시간을 단축하고', '대조 누락을 줄이고'] },
  '네트워크 통신': { n: ['세션 연결 관리', '패킷 재전송', '암호화 채널', '부하 분산 장치'], e: ['지연 시간을 줄이고', '동작 속도를 높이고', '연결 안정성을 높이고'] },
  'AI·알고리즘': { n: ['수요 예측 모델', '이상 탐지 기법', '콘텐츠 추천 방법', '이미지 분류 네트워크'], e: ['예측 정확도를 높이고', '학습 데이터 요구량을 줄이고', '판정 근거를 제시하고'] },
};

export function generateDocuments() {
  const TODAY = '2026-10-28', START = '2026-10-15';
  const rnd = mulberry32(20261105);
  const pickW = makePick(rnd);
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const dates = Array.from({ length: 14 }, (_, i) => addDays(START, i));
  const rows = [];
  for (let i = 0; i < 300; i++) {
    const received = dates[pickW(dates.map((d) => (new Date(`${d}T00:00:00Z`).getUTCDay() % 6 === 0 ? 1 : 3)))];
    const ntag = pickW([6, 3, 1]) + 1;
    const tags = [];
    while (tags.length < ntag) { const t = DOC_TAGS[Math.floor(rnd() * DOC_TAGS.length)]; if (!tags.includes(t)) tags.push(t); }
    const main = DOC_VOCAB[tags[0]];
    const noun = pick(main.n), eff = pick(main.e);
    const second = tags[1] ? `${pick(DOC_VOCAB[tags[1]].n)}와 연계해 ${pick(DOC_VOCAB[tags[1]].e)} ` : '';
    const title = `${noun}${rnd() < 0.5 ? '을 이용한 ' : '의 '}${pick(['제어 방법', '개선 구조', '처리 방법', '판단 장치', '보정 방법'])}`;
    const abstract = `본 문서는 ${noun}에 관한 것으로, ${eff} ${second}${pick(['처리 효율을 개선하는', '운영 안정성을 확보하는', '품질 편차를 줄이는'])} 방법을 제안한다. 실시예에서는 ${rint(3, 9)}개의 조건으로 ${pick(['시험', '모의 실험', '비교 평가'])}를 수행하였으며, 기존 방식 대비 ${rint(8, 35)}% 개선된 결과를 얻었다. 청구항은 ${noun}의 구성과 ${rint(2, 5)}단계 처리 순서를 포함한다.`;
    const conf = Math.max(30, Math.min(98, 94 - 12 * (ntag - 1) - Math.round(rnd() ** 2 * 45)));
    const recent = received >= addDays(TODAY, -4);
    const st = pickW(recent ? [15, 20, 65] : [60, 15, 25]);
    rows.push({
      doc_id: '', title, abstract, filed: addDays('2024-03-01', rint(0, 940)), applicant: DOC_APPLICANTS[pickW([3, 2, 2, 2, 1])], tags, confidence: conf,
      status: ['확정', '검토 중', '미검토'][st], received, due: addDays(received, rint(3, 7)),
    });
  }
  rows.sort((a, b) => (a.received < b.received ? -1 : a.received > b.received ? 1 : 0));
  rows.forEach((r, i) => { r.doc_id = `DOC-${pad(i + 1, 4)}`; });
  const open = rows.filter((r) => r.status !== '확정').slice(-3).reverse();
  const decisions = open.map((r, i) => ({
    id: `D-000${i + 1}`, ref: r.doc_id, decision: i === 1 ? '재검토' : '분류 확정',
    reason: ['요약과 청구항이 일치해 분류 유지', '두 분야에 걸쳐 있어 담당자 확인 필요', '자체 분류와 같아 확정'][i], who: '지식재산 담당', ts: `${TODAY}T08:${42 - i * 4}:00`,
  }));
  return { sample: { rows }, decisions };
}

// ====================== 인터뷰: 선수·지원자 인터뷰 연습 ======================
const IV_TOPICS = {
  '지원 동기': { q: ['이 직무에 지원한 이유를 말씀해 주세요.', '왜 우리 회사를 선택했나요?', '입사 후 3년 안에 이루고 싶은 목표는 무엇인가요?', '이 직무에서 본인의 강점이 드러나는 경험은 무엇인가요?', '다른 회사 지원 현황과 비교해 우리 회사의 우선순위는 어떤가요?', '이 분야에 관심을 갖게 된 계기는 무엇인가요?'], t: ['연봉', '복지', '안정', '워라밸', '다른 곳', '떨어져서'] },
  '협업·갈등': { q: ['팀 안에서 의견이 충돌했던 경험과 해결 방법을 말씀해 주세요.', '동료와 업무 방식이 달라 힘들었던 적이 있나요?', '상사와 생각이 달랐을 때 어떻게 했나요?', '팀원이 맡은 일을 끝내지 못했을 때 어떻게 대응했나요?', '협업에서 본인의 역할은 주로 무엇인가요?', '피드백을 받아들이기 어려웠던 경험이 있나요?'], t: ['무능', '답답', '탓', '싫어', '혼자 다', '무시'] },
  '성과·실패': { q: ['가장 자랑스러운 성과를 말씀해 주세요.', '크게 실패했던 경험과 배운 점은 무엇인가요?', '목표를 달성하지 못했을 때 어떻게 대응했나요?', '짧은 기한에 일을 끝내야 했던 경험이 있나요?', '성과를 숫자로 보여 줄 수 있는 사례가 있나요?', '같은 실수를 반복하지 않으려고 하는 방법은 무엇인가요?'], t: ['운이', '어쩔 수 없', '내 잘못 아니', '대충', '포기', '핑계'] },
  '윤리·가치관': { q: ['규정과 현실이 충돌할 때 어떻게 판단하나요?', '동료의 잘못을 알게 된다면 어떻게 하겠습니까?', '이익과 원칙 중 하나를 골라야 했던 경험이 있나요?', '정보 보안이 중요한 업무에서 지켜야 할 것은 무엇이라고 생각하나요?', '불공정하다고 느낀 상황에서 어떻게 행동했나요?', '일과 개인 생활의 균형에 대한 생각을 말씀해 주세요.'], t: ['걸리지 않으면', '다들 그렇게', '규정은 무시', '눈감', '비밀로', '몰래'] },
  '직무 이해': { q: ['이 직무가 하는 일을 본인 말로 설명해 주세요.', '이 직무에서 가장 중요한 요소는 무엇이라고 생각하나요?', '최근 관심 있게 본 기술 동향이 있나요?', '업무에 필요한 역량 중 부족하다고 느끼는 것은 무엇인가요?', '데이터를 보고 문제를 찾아낸 경험이 있나요?', '입사 후 처음 3개월 동안 무엇을 배우고 싶나요?'], t: ['잘 모르', '검색해', '대충 알', '들어본', '아마', '찍어'] },
};

export function generateInterview() {
  const TODAY = '2026-10-28', START = '2026-10-15';
  const rnd = mulberry32(20261106);
  const pickW = makePick(rnd);
  const dates = Array.from({ length: 14 }, (_, i) => addDays(START, i));
  const rows = [];
  Object.entries(IV_TOPICS).forEach(([topic, v]) => {
    v.q.forEach((q, qi) => {
      for (const level of ['기본', '심화']) {
        const i = rows.length;
        const asked = dates[13 - Math.floor(rnd() ** 1.6 * 14)]; // 최근 날짜에 더 몰리게 — 기간을 줄여도 주제마다 질문이 남는다
        rows.push({
          q_id: '', question: level === '심화' ? `${q} 구체적인 사례와 숫자를 들어 설명해 주세요.` : q, topic, level,
          risk_terms: v.t.slice(qi % 3, (qi % 3) + 4), limit_sec: [60, 90, 120, 180][pickW([2, 4, 3, 1])],
          status: asked < addDays(TODAY, -6) ? ['완료', '연습 중', '미연습'][pickW([6, 2, 2])] : ['완료', '연습 중', '미연습'][pickW([2, 3, 5])], asked, due: addDays(asked, 3 + (i % 5)),
        });
      }
    });
  });
  rows.sort((a, b) => (a.asked < b.asked ? -1 : a.asked > b.asked ? 1 : 0));
  rows.forEach((r, i) => { r.q_id = `Q-${pad(i + 1, 3)}`; });
  const open = rows.filter((r) => r.status !== '완료').slice(-3).reverse();
  const decisions = open.map((r, i) => ({
    id: `D-000${i + 1}`, ref: r.q_id, decision: i === 1 ? '재연습' : '연습 완료',
    reason: ['답변 구조가 분명함', '위험 표현이 있어 다시 연습', '근거 사례가 더 필요함'][i], who: '연습 담당', ts: `${TODAY}T08:${42 - i * 4}:00`,
  }));
  return { sample: { rows }, decisions };
}

export const GENERATORS = { education: generateEducation, documents: generateDocuments, interview: generateInterview };

function pretty(obj) {
  const rows = Object.entries(obj).map(([k, v]) => {
    if (Array.isArray(v)) return `${JSON.stringify(k)}: [\n${v.map((x) => JSON.stringify(x)).join(',\n')}\n]`;
    return `${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `{\n${rows.join(',\n')}\n}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const want = process.argv[2] ? [process.argv[2]] : Object.keys(GENERATORS);
  for (const name of want) {
    if (!GENERATORS[name]) { console.error(`알 수 없는 도메인: ${name} (education|documents|interview)`); process.exit(2); }
    const { sample, decisions } = GENERATORS[name]();
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'sample.json'), pretty(sample));
    fs.writeFileSync(path.join(dir, name, 'decisions.json'), `[\n${decisions.map((d) => JSON.stringify(d)).join(',\n')}\n]\n`);
    console.log(`${name}: 행 ${sample.rows.length}`);
  }
}
