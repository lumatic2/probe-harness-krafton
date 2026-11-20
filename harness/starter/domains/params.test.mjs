// 실행: node --test starter/domains/params.test.mjs
// 기준값(params) — domain.json 의 params 선언 · "$param:키" 참조 · 판정(judge) · 가정 바꿔 보기 whatIf · 설정 저장 기록을 손으로 쓴 기대값과 비교한다.
// 기대값은 샘플 데이터를 직접 세어(파이썬으로 따로 계산) 글자로 적었다. 코드와 같은 식으로 다시 계산하지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInputs, customParams, DEFAULT_STATE, diffParams, makeCtx, makeSettingsRecord, matchWhere, paramDefs, paramError, paramValues, resolveParams, settingsNote, validateParams, whatIf } from './core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (n, f) => JSON.parse(fs.readFileSync(path.join(here, n, f), 'utf8'));
const load = (n, saved) => makeCtx(read(n, 'domain.json'), read(n, 'sample.json'), saved);
const count = (ctx, key, v) => ctx.rows.filter((r) => r[key] === v).length;

test('params 를 가진 도메인(구매)은 params 2~4개, 모든 참조가 선언된 키를 가리키고 선언한 키는 모두 쓰인다', () => {
  const withParams = fs.readdirSync(here).filter((n) => fs.existsSync(path.join(here, n, 'domain.json')) && Array.isArray(read(n, 'domain.json').params));
  assert.ok(withParams.includes('purchase'));
  for (const n of withParams) {
    const text = fs.readFileSync(path.join(here, n, 'domain.json'), 'utf8');
    const d = JSON.parse(text);
    const defs = paramDefs(d);
    assert.ok(defs.length >= 2 && defs.length <= 4, `${n} params ${defs.length}개`);
    const keys = defs.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length);
    const refs = [...text.matchAll(/\$param:([A-Za-z0-9_]+)|\{param:([A-Za-z0-9_]+)\}/g)].map((m) => m[1] || m[2]);
    for (const r of refs) assert.ok(keys.includes(r), `${n}: 선언 없는 참조 ${r}`);
    for (const k of keys) assert.ok(refs.includes(k), `${n}: 안 쓰는 키 ${k}`);
    for (const p of defs) {
      assert.ok(['number', 'enum', 'bool'].includes(p.type));
      assert.ok(p.label && p.affects, `${n}.${p.key} label·affects`);
      assert.equal(paramError(p, p.default), '', `${n}.${p.key} 기본값이 자기 범위 안`);
    }
  }
});

test('resolveParams: 통째 참조는 값 그대로(숫자·불리언), 글 속 {param:키} 는 글자로, 없는 키는 그대로', () => {
  const out = resolveParams({ a: '$param:x', b: [1, '$param:y'], c: { t: '90일 내 {param:x}회', u: '$param:none' } }, { x: 4, y: true });
  assert.deepEqual(out, { a: 4, b: [1, true], c: { t: '90일 내 4회', u: '$param:none' } });
});

test('paramError · validateParams: 숫자 범위, 목록 값, 켬/끔', () => {
  const num = { key: 'k', label: 'k', type: 'number', unit: '시간', min: 1, max: 336, default: 48 };
  assert.equal(paramError(num, 48), '');
  assert.equal(paramError(num, 1), '');
  assert.equal(paramError(num, 0), '1~336시간 사이로 입력하세요.');
  assert.equal(paramError(num, 337), '1~336시간 사이로 입력하세요.');
  assert.equal(paramError(num, NaN), '숫자를 입력하세요.');
  assert.equal(paramError(num, '12'), '숫자를 입력하세요.');
  const en = { key: 'e', type: 'enum', options: [{ v: 'delay', label: '영업일' }, 'cal'], default: 'delay' };
  assert.equal(paramError(en, 'cal'), '');
  assert.equal(paramError(en, 'delay'), '');
  assert.equal(paramError(en, 'x'), '목록에 있는 값을 고르세요.');
  assert.equal(paramError({ key: 'b', type: 'bool', default: true }, false), '');
  assert.equal(paramError({ key: 'b', type: 'bool', default: true }, 'false'), '켬 또는 끔 중에서 고르세요.');
  const d = read('purchase', 'domain.json');
  assert.deepEqual(validateParams(d, { late_grace: 15 }), { late_grace: '0~14일 사이로 입력하세요.' });
  assert.deepEqual(validateParams(d, { repeat_min: 1, late_target: 101 }), { repeat_min: '2~10회 사이로 입력하세요.', late_target: '0~100% 사이로 입력하세요.' });
  assert.deepEqual(validateParams(d, {}), {});
});

test('paramValues: 기본값 위에 저장값을 덮고, 틀린 저장값은 기본값으로', () => {
  const d = read('purchase', 'domain.json');
  assert.deepEqual(paramValues(d, {}), { late_grace: 0, basis: 'delay', repeat_min: 4, late_target: 15 });
  assert.deepEqual(paramValues(d, { late_grace: 2, repeat_min: 99, late_target: 'x', basis: 'weekly' }), { late_grace: 2, basis: 'delay', repeat_min: 4, late_target: 15 });
  assert.deepEqual(paramValues({ name: 'x' }, { a: 1 }), {});
});

test('기본 기준값이면 판정이 데이터의 원래 상태 열과 같다(구매)', () => {
  const u = load('purchase');
  assert.deepEqual(['정시', '입고 대기', '지연', '납기 초과'].map((s) => count(u, 'status', s)), [298, 112, 68, 7]);
  assert.equal(u.rows.filter((r) => r._judge !== r.status).length, 0); // 판정 규칙(_judge)이 데이터의 상태 열을 그대로 재현
});

test('저장된 기준값이 계산에 들어간다: 목표·판정·건수', () => {
  assert.equal(load('purchase').d.metrics.find((m) => m.key === 'lateRate').target, 15);
  assert.equal(load('purchase', { late_target: 20 }).d.metrics.find((m) => m.key === 'lateRate').target, 20);
  const u = load('purchase', { late_grace: 2, basis: 'cal_delay' });
  assert.equal(count(u, 'status', '지연'), 54);
  assert.equal(count(load('purchase', { late_grace: 2 }), 'status', '지연'), 50);
  const rep = load('purchase', { repeat_min: 3 });
  assert.equal(rep.rows.filter((r) => matchWhere(rep, r, rep.d.metrics.find((m) => m.key === 'repeatLate').where)).length, 49);
  assert.equal(rep.d.metrics.find((m) => m.key === 'repeatLate').label, '반복 지연(90일 내 3회 이상)');
  assert.equal(load('purchase').d.metrics.find((m) => m.key === 'repeatLate').label, '반복 지연(90일 내 4회 이상)');
});

test('기본값일 때 대시보드 입력이 그대로(기준 4배열)', () => {
  const w = buildInputs(load('purchase'), DEFAULT_STATE);
  assert.equal(w.w6.rows.find((r) => r.label === '지연율').target, 15);
  assert.equal(buildInputs(load('purchase', { late_target: 20 }), DEFAULT_STATE).w6.rows.find((r) => r.label === '지연율').target, 20);
});

test('diffParams · customParams · settingsNote', () => {
  const d = read('purchase', 'domain.json');
  const base = paramValues(d, {});
  assert.deepEqual(diffParams(d, base, paramValues(d, { late_grace: 2, repeat_min: 3 })), [
    { key: 'late_grace', label: '지연 허용 일수', unit: '일', from: '0일', to: '2일' },
    { key: 'repeat_min', label: '반복 지연 기준', unit: '회', from: '4회', to: '3회' },
  ]);
  assert.deepEqual(customParams(load('purchase')), []);
  assert.equal(customParams(load('purchase', { late_grace: 2 })).length, 1);
  assert.equal(settingsNote(load('purchase')), '');
  assert.equal(settingsNote(load('purchase', { late_grace: 2 })), '기준값 사용자 설정 적용(지연 허용 일수 2일)');
  assert.equal(settingsNote(load('purchase', { late_grace: 2, repeat_min: 3, late_target: 20 })), '기준값 사용자 설정 적용(지연 허용 일수 2일 외 2개)');
  assert.equal(diffParams(d, base, paramValues(d, { basis: 'cal_delay' }))[0].to, '달력일');
  const flag = { params: [{ key: 'on', label: '켜기', type: 'bool', default: true, affects: 'x' }] }; // 켬/끔(bool) 은 견본 도메인에 없어 설정만 만들어 본다
  assert.deepEqual(diffParams(flag, paramValues(flag, {}), paramValues(flag, { on: false })), [{ key: 'on', label: '켜기', unit: '', from: '켬', to: '끔' }]);
});

test('whatIf 구매: 지연으로 보는 초과 영업일과 영업일/달력일 기준(기간 14일 안 발주 119건)', () => {
  const r = whatIf(load('purchase'), { late_grace: 2, basis: 'cal_delay' });
  assert.deepEqual(r.changed.map((c) => [c.key, c.from, c.to]), [['late_grace', '0일', '2일'], ['basis', '영업일', '달력일']]);
  assert.deepEqual(r.flips.moves, [{ from: '지연', to: '정시', n: 4 }]); // 입고된 발주만 기준 열을 따르고 납기 초과는 항상 영업일
  assert.equal(r.flips.count, 4);
  assert.equal(r.flips.has, true);
  const late = r.metrics.find((m) => m.key === 'late');
  assert.deepEqual([late.label, late.before, late.after, late.diff], ['지연 발주', 20, 16, -4]);
  const rate = r.metrics.find((m) => m.key === 'lateRate');
  assert.deepEqual([Math.round(rate.before * 10) / 10, Math.round(rate.after * 10) / 10], [16.8, 13.4]); // 20/119 · 16/119
  assert.deepEqual([rate.targetBefore, rate.targetAfter, rate.metBefore, rate.metAfter], [15, 15, false, true]);
  const overdue = r.metrics.find((m) => m.key === 'overdue');
  assert.deepEqual([overdue.before, overdue.after, overdue.diff], [7, 7, 0]);
  assert.deepEqual(r.flips.rows.map((x) => [x.id, x.before, x.after]), [['PO-0345', '지연', '정시'], ['PO-0273', '지연', '정시'], ['PO-0282', '지연', '정시'], ['PO-0259', '지연', '정시']]);
  assert.deepEqual(Object.keys(r.flips.rows[0]).sort(), ['after', 'before', 'id', 'title']);
  assert.equal(r.metrics.length, 5); // 지표 4 + 관리도 한계 밖 점
  assert.equal(r.metrics.at(-1).key, '_control');
});

test('whatIf 구매: 바뀐 건이 많아도 표시 행은 10개까지, 건수는 전부', () => {
  const r = whatIf(load('purchase'), { late_grace: 14 });
  assert.deepEqual(r.flips.moves, [{ from: '지연', to: '정시', n: 13 }]);
  assert.equal(r.flips.count, 13);
  assert.equal(r.flips.rows.length, 10);
});

test('whatIf: 바꾼 게 없으면 차이 0 · 틀린 값은 지금 값으로 · 목표만 바꾸면 값은 그대로 목표가 바뀜', () => {
  const ctx = load('purchase');
  const same = whatIf(ctx, {});
  assert.equal(same.changed.length, 0);
  assert.equal(same.flips.count, 0);
  assert.ok(same.metrics.every((m) => m.diff === 0 || m.diff === null));
  const bad = whatIf(ctx, { late_grace: 15 });
  assert.equal(bad.changed.length, 0);
  assert.equal(bad.flips.count, 0);
  const t = whatIf(ctx, { late_target: 20 });
  const lr = t.metrics.find((m) => m.key === 'lateRate');
  assert.equal(lr.diff, 0);
  assert.deepEqual([lr.targetBefore, lr.targetAfter], [15, 20]);
  assert.equal(t.flips.count, 0);
  // 지금 기준이 이미 저장값이면 그것이 "지금"
  const saved = whatIf(load('purchase', { late_grace: 2 }), { late_grace: 0 });
  assert.deepEqual(saved.changed.map((c) => [c.from, c.to]), [['2일', '0일']]);
  assert.deepEqual(saved.flips.moves, [{ from: '정시', to: '지연', n: 6 }]);
  const late = saved.metrics.find((m) => m.key === 'late');
  assert.deepEqual([late.before, late.after, late.diff], [14, 20, 6]);
});

test('판정 없는 도메인은 flips.has=false (기준값만 비교)', () => {
  const d = read('purchase', 'domain.json');
  delete d.judge;
  const r = whatIf(makeCtx(d, read('purchase', 'sample.json')), { late_target: 20 });
  assert.equal(r.flips.has, false);
  assert.equal(r.flips.count, 0);
});

test('makeSettingsRecord: 사유 필수 · 바뀐 항목마다 한 줄 · 이전→이후', () => {
  const d = read('purchase', 'domain.json');
  const none = makeSettingsRecord(d, { values: {}, history: [] }, { late_grace: 2 }, '  ', '2026-10-29 09:00');
  assert.deepEqual(none.errors, { _reason: '사유를 한 줄 적으세요.' });
  const same = makeSettingsRecord(d, { values: {}, history: [] }, { late_grace: 0 }, '그대로', '2026-10-29 09:00');
  assert.deepEqual(same.errors, { _: '바꾼 값이 없습니다.' });
  const bad = makeSettingsRecord(d, { values: {}, history: [] }, { late_grace: 15 }, '사유', '2026-10-29 09:00');
  assert.deepEqual(bad.errors, { late_grace: '0~14일 사이로 입력하세요.' });
  const ok = makeSettingsRecord(d, { values: {}, history: [{ ts: '2026-10-28 10:00', key: 'late_target', label: '지연율 목표', unit: '%', from: '15%', to: '20%', reason: '이전' }] }, { late_grace: 2, repeat_min: 3 }, ' 발주 기준 변경 ', '2026-10-29 09:00');
  assert.equal(ok.errors, undefined);
  assert.deepEqual(ok.saved.values, { late_grace: 2, basis: 'delay', repeat_min: 3, late_target: 15 });
  assert.equal(ok.saved.history.length, 3);
  assert.deepEqual(ok.saved.history.at(-1), { ts: '2026-10-29 09:00', key: 'repeat_min', label: '반복 지연 기준', unit: '회', from: '4회', to: '3회', reason: '발주 기준 변경' });
});

test('domain.json 에 params 가 없으면 아무 일도 없다', () => {
  const ctx = load('education');
  assert.deepEqual(paramDefs(ctx.d), []);
  assert.deepEqual(ctx.settings, {});
  assert.equal(settingsNote(ctx), '');
  assert.equal(whatIf(ctx, { a: 1 }).metrics.length > 0, true);
});
