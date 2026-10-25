"use client";

import { useEffect, useMemo, useState } from "react";
import { getPreviousDate, isCalendarDate, type BoxOfficeResult, type DataMode } from "@/lib/box-office";
import { aggregateInsights, datesEndingAt, formatLeaderSalesShare, formatScaled, type InsightDay } from "@/lib/insights";

const salesLabel = (value: bigint) => formatScaled(value, 100000000n, "억원");
const audienceLabel = (value: bigint) => formatScaled(value, 1000n, "천명");

function TrendChart({ trend, metric }: { trend: ReturnType<typeof aggregateInsights>["trend"]; metric: "sales" | "audience" }) {
  const label = metric === "sales" ? salesLabel : audienceLabel;
  const exactUnit = metric === "sales" ? "원" : "명";
  const max = trend.reduce<bigint>((current, point) => point[metric] !== null && point[metric] > current ? point[metric] : current, 0n);
  const width = Math.max(700, trend.length * 28);
  const x = (index: number) => 45 + index * (width - 75) / Math.max(1, trend.length - 1);
  const y = (value: bigint) => 175 - Number(value * 140n / (max || 1n));
  const segments: string[] = [];
  let segment: string[] = [];
  trend.forEach((point, index) => {
    if (point[metric] === null) {
      if (segment.length) segments.push(segment.join(" "));
      segment = [];
    } else segment.push(`${segment.length ? "L" : "M"} ${x(index)} ${y(point[metric])}`);
  });
  if (segment.length) segments.push(segment.join(" "));
  return <div className="chart-scroll" role="img" aria-label={`날짜별 관측 ${metric === "sales" ? "매출" : "관객"} 추이. 빈 날짜와 실패 날짜에서는 선이 끊깁니다.`}>
    <svg viewBox={`0 0 ${width} 225`} width={width} height="225" aria-hidden="true">
      <line x1="45" y1="175" x2={width - 30} y2="175" stroke="#aab5c4" />
      {segments.map((path, index) => <path key={index} d={path} fill="none" stroke="#2458a6" strokeWidth="3" />)}
      {trend.map((point, index) => point[metric] === null ? <g key={point.date}><line x1={x(index)} x2={x(index)} y1="30" y2="175" stroke="#d4d9e1" strokeDasharray="3 4" /><text x={x(index)} y="193" textAnchor="middle" fontSize="10">{point.date.slice(5)}</text></g> : <g key={point.date}><circle cx={x(index)} cy={y(point[metric])} r="4" fill="#2458a6" /><title>{point.date}: {label(point[metric])} ({point[metric].toLocaleString("ko-KR")}{exactUnit})</title><text x={x(index)} y="193" textAnchor="middle" fontSize="10">{point.date.slice(5)}</text></g>)}
    </svg>
  </div>;
}

export function InsightsDashboard({ mode, today, initialDate }: { mode: DataMode | "invalid"; today: string; initialDate?: string }) {
  const [endDate, setEndDate] = useState(initialDate && isCalendarDate(initialDate) && initialDate <= today ? initialDate : mode === "demo" ? "2026-09-13" : getPreviousDate(today));
  const [span, setSpan] = useState<7 | 14 | 30>(7);
  const [topCount, setTopCount] = useState<5 | 10>(5);
  const [trendMetric, setTrendMetric] = useState<"sales" | "audience">("sales");
  const [results, setResults] = useState<{ key: string; values: Record<string, InsightDay> }>({ key: "", values: {} });
  const [retry, setRetry] = useState<Record<string, number>>({});
  const dates = useMemo(() => isCalendarDate(endDate) && endDate <= today ? datesEndingAt(endDate, span) : [], [endDate, span, today]);
  const queryKey = `${mode}:${endDate}:${span}`;

  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get("date");
    if (date && isCalendarDate(date) && date <= today) queueMicrotask(() => setEndDate(date));
  }, [today]);

  useEffect(() => {
    if (!dates.length || mode === "invalid") return;
    const controller = new AbortController();
    const next: Record<string, InsightDay> = {};
    dates.forEach((date) => { next[date] = { date, state: "loading" }; });
    queueMicrotask(() => { if (!controller.signal.aborted) setResults({ key: queryKey, values: next }); });
    let cursor = 0;
    const worker = async () => {
      while (cursor < dates.length && !controller.signal.aborted) {
        const date = dates[cursor++];
        try {
          const response = await fetch(`/api/box-office?${new URLSearchParams({ date, type: "daily" })}`, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error("LOAD_FAILED");
          const result = await response.json() as BoxOfficeResult;
          if (!Array.isArray(result?.data?.items) || !["data", "empty"].includes(result.data.status)) throw new Error("INVALID_RESPONSE");
          if (!controller.signal.aborted) setResults((current) => current.key === queryKey ? { ...current, values: { ...current.values, [date]: { date, state: result.data.status, result } } } : current);
        } catch {
          if (!controller.signal.aborted) setResults((current) => current.key === queryKey ? { ...current, values: { ...current.values, [date]: { date, state: "error" } } } : current);
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, dates.length) }, worker));
    return () => controller.abort();
  }, [dates, mode, queryKey]);

  const retryDay = async (date: string) => {
    setResults((current) => current.key === queryKey ? { ...current, values: { ...current.values, [date]: { date, state: "loading" } } } : current);
    setRetry((current) => ({ ...current, [date]: (current[date] ?? 0) + 1 }));
    try {
      const response = await fetch(`/api/box-office?${new URLSearchParams({ date, type: "daily" })}`, { cache: "no-store" });
      if (!response.ok) throw new Error("LOAD_FAILED");
      const result = await response.json() as BoxOfficeResult;
      if (!Array.isArray(result?.data?.items) || !["data", "empty"].includes(result.data.status)) throw new Error("INVALID_RESPONSE");
      setResults((current) => current.key === queryKey ? { ...current, values: { ...current.values, [date]: { date, state: result.data.status, result } } } : current);
    } catch { setResults((current) => current.key === queryKey ? { ...current, values: { ...current.values, [date]: { date, state: "error" } } } : current); }
  };

  const days = dates.map((date) => results.key === queryKey ? results.values[date] ?? { date, state: "loading" as const } : { date, state: "loading" as const });
  const insight = aggregateInsights(days, topCount);
  const finished = insight.counts.data + insight.counts.empty + insight.counts.error;
  const maxTop = insight.top.reduce<bigint>((max, movie) => movie.sales > max ? movie.sales : max, 0n);
  return <>
    {mode === "demo" && <aside className="demo-banner"><strong>DEMO</strong> 가상 데이터는 2026-09-07 ~ 2026-09-13에만 있습니다.</aside>}
    {mode === "invalid" && <p role="alert">DATA_MODE 설정을 확인해 주세요.</p>}
    <section className="filters" aria-label="인사이트 조회 조건">
      <label>종료일 <input type="date" value={endDate} max={today} onChange={(event) => setEndDate(event.target.value)} /></label>
      <label>분석 기간 <select value={span} onChange={(event) => setSpan(Number(event.target.value) as 7 | 14 | 30)}><option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option></select></label>
      <label>영화 순위 <select value={topCount} onChange={(event) => setTopCount(Number(event.target.value) as 5 | 10)}><option value="5">Top 5</option><option value="10">Top 10</option></select></label>
    </section>
    {!dates.length ? <p role="alert">오늘까지의 유효한 종료일을 선택해 주세요.</p> : <>
      <p className="data-note">{dates[0]} ~ {dates.at(-1)} · {mode === "live" ? "통합전산망 오픈 API(KOBIS)" : "가상 demo"} 일별 Top 10 관측 데이터 기준입니다. 전체 시장 통계가 아니며, 순위 밖 영화의 매출을 0으로 추정하지 않습니다.</p>
      <section className="insight-progress" aria-label="날짜별 조회 진행률" aria-live="polite">
        <progress value={finished} max={dates.length} /> <strong>{finished}/{dates.length}일 완료</strong>
        <p>정상 {insight.counts.data}일 · 빈 날짜 {insight.counts.empty}일 · 실패 {insight.counts.error}일 · 조회 중 {insight.counts.loading}일</p>
      </section>
      {insight.counts.error > 0 && <p className="cache-warning" role="alert">실패한 날짜가 있어 기간 합계와 순위를 확정할 수 없습니다. 아래에서 해당 날짜만 다시 시도해 주세요.</p>}
      {insight.counts.empty > 0 && <p className="data-note">정상 빈 날짜 {insight.counts.empty}일은 차트에서 공백으로 표시합니다. 유효한 데이터 날짜 {insight.counts.data}일.</p>}
      <section className="insight-grid">
        <article className="feature-card"><h2>일별 Top 10 관측 매출·관객 추이</h2><p>조회 목록의 하루 매출과 관객 흐름을 전환해 확인합니다. 빈 날짜와 실패 날짜는 연결하지 않습니다.</p>
          <div className="period-buttons" role="group" aria-label="추이 지표"><button type="button" aria-pressed={trendMetric === "sales"} onClick={() => setTrendMetric("sales")}>매출 추이</button><button type="button" aria-pressed={trendMetric === "audience"} onClick={() => setTrendMetric("audience")}>관객 추이</button></div>
          <p aria-label="기간 총매출">기간 총매출 <strong>{insight.totalSales === null ? "—" : salesLabel(insight.totalSales)}</strong>{insight.totalSales !== null && <span> ({insight.totalSales.toLocaleString("ko-KR")}원)</span>}</p>
          <TrendChart trend={insight.trend} metric={trendMetric} /></article>
        <article className="feature-card"><h2>일별 Top 10 관측 데이터 기준 영화별 매출 Top {topCount}</h2><p>같은 영화 코드의 관측 매출을 묶어 기여도가 큰 영화를 보여줍니다.</p>
          {insight.complete && insight.hasData ? <ol className="top-bars">{insight.top.map((movie) => <li key={movie.movieCd}><div><strong>{movie.movieNm}</strong> <span>{salesLabel(movie.sales)} · {audienceLabel(movie.audience)}</span></div><div className="bar-track"><span style={{ width: `${maxTop ? Number(movie.sales * 100n / maxTop) : 0}%` }} /></div></li>)}</ol> : <p>{insight.complete ? "선택한 기간의 데이터가 없습니다." : "모든 날짜의 조회가 끝나야 순위를 표시합니다."}</p>}</article>
      </section>
      <section className="insight-metrics" aria-label="보조 수치">
        <article className="feature-card"><h2>관측 관객 합계</h2><strong>{insight.totalAudience === null ? "—" : audienceLabel(insight.totalAudience)}</strong><p>조회된 일간 목록의 관객 규모를 보여줍니다.</p></article>
        <article className="feature-card"><h2>1위 매출 점유율</h2><strong>{formatLeaderSalesShare(insight.top[0]?.sales ?? null, insight.totalSales)}</strong><p>1위 영화의 기간 관측 매출 ÷ 기간 총매출 × 100입니다. 총매출이 0이면 —로 표시합니다.</p></article>
      </section>
      {insight.complete && !insight.hasData && <p className="state-panel">선택한 분석 기간의 데이터가 없습니다.</p>}
      <section className="feature-card"><h2>날짜별 상태</h2><ul className="day-status">{days.map((day) => <li key={day.date}><span>{day.date}</span><span>{day.state === "data" ? "정상" : day.state === "empty" ? "빈 날짜" : day.state === "error" ? "실패" : "조회 중"}</span>{day.state === "error" && <button type="button" onClick={() => void retryDay(day.date)}>이 날짜 다시 시도</button>}{retry[day.date] ? <span className="sr-only">재시도 {retry[day.date]}회</span> : null}</li>)}</ul></section>
    </>}
  </>;
}
