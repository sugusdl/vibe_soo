"use client";

import { useEffect, useState } from "react";
import { filterMovies, formatInteger, isCalendarDate, periodLabels, type BoxOfficeResult, type DataMode, type DemoScenario, type PeriodType } from "@/lib/box-office";

type LoadState = { key: string; result: BoxOfficeResult } | { key: string; error: string };

export function BoxOfficeList({ mode, today }: { mode: DataMode | "invalid"; today: string }) {
  const [date, setDate] = useState("2026-09-13");
  const [type, setType] = useState<PeriodType>("daily");
  const [scenario, setScenario] = useState<DemoScenario>("normal");
  const [keyword, setKeyword] = useState("");
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const validDate = isCalendarDate(date) && date <= today;
  const key = `${date}:${type}:${scenario}:${retry}`;

  useEffect(() => {
    if (!validDate) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ date, type });
    if (mode === "demo") params.set("demoScenario", scenario);
    fetch(`/api/box-office?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("LOAD_FAILED");
        return await response.json() as BoxOfficeResult;
      })
      .then((result) => { if (!controller.signal.aborted) setLoaded({ key, result }); })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, error: "박스오피스 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." });
      });
    return () => controller.abort();
  }, [date, type, scenario, retry, key, mode, validDate]);

  const current = loaded?.key === key ? loaded : null;
  const result = current && "result" in current ? current.result : null;
  const items = result ? filterMovies(result.items, keyword) : [];
  const state = !validDate ? "invalid" : !current ? "loading" : "error" in current ? "error" :
    result?.status === "empty" ? "empty" : items.length === 0 ? "search-empty" : "success";

  return (
    <>
      {mode === "demo" ? (
        <aside className="demo-banner" aria-label="데모 모드 안내">
          <div><span className="badge">DEMO</span><strong> 가상의 영화 데이터로 체험 중입니다</strong></div>
          <p>샘플 기간: 2026-09-07 ~ 2026-09-13 · 실제 영화 실적이 아닙니다.</p>
          <label className="scenario-label">데모 응답
            <select value={scenario} onChange={(event) => setScenario(event.target.value as DemoScenario)}>
              <option value="normal">정상 응답</option>
              <option value="slow">느린 응답 (2.5초)</option>
              <option value="error">오류 응답</option>
            </select>
          </label>
        </aside>
      ) : (
        <div className="state-panel error-panel" role="alert">
          <h2>{mode === "live" ? "실제 API 연동 준비 중" : "데이터 모드 설정 오류"}</h2>
          <p>DATA_MODE=demo로 실행하면 가상 데이터를 확인할 수 있습니다. 외부 API는 호출하지 않습니다.</p>
        </div>
      )}
      <section className="filters" aria-label="박스오피스 조회 조건">
        <label>조회 날짜<input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} /></label>
        <fieldset>
          <legend>기간 유형</legend>
          <div className="period-buttons">
            {(Object.keys(periodLabels) as PeriodType[]).map((period) => (
              <button key={period} type="button" aria-pressed={type === period} onClick={() => setType(period)}>{periodLabels[period]}</button>
            ))}
          </div>
        </fieldset>
        <label className="search-label">영화명 검색
          <input type="search" value={keyword} placeholder="현재 조회 목록에서 영화명 검색" onChange={(event) => setKeyword(event.target.value)} />
        </label>
      </section>

      <div data-testid="list-state" data-state={state} aria-busy={state === "loading"}>
        {!validDate ? <div className="state-panel" role="alert"><h2>조회 날짜를 확인해 주세요</h2><p>오늘까지의 유효한 날짜를 선택해 주세요.</p></div> :
          state === "loading" ? <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" /><h2>박스오피스 정보를 불러오는 중입니다.</h2><p>선택한 날짜와 기간의 데이터를 준비하고 있습니다.</p></div> :
          state === "error" ? <div className="state-panel error-panel" role="alert"><h2>데이터를 불러오지 못했습니다</h2><p>{current && "error" in current ? current.error : ""}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button>{mode === "demo" && scenario === "error" && <p className="hint">‘오류 응답’에서는 재시도도 실패합니다. ‘정상 응답’으로 바꾸면 복구됩니다.</p>}</div> : (
            <>
              <div className="result-heading">
                <h2>{periodLabels[type]} 박스오피스</h2>
                <p>조회 기간: <strong>{result?.rangeStart} ~ {result?.rangeEnd}</strong></p>
                {state === "success" && <span>{items.length}편{keyword.trim() ? ` / 전체 ${result?.items.length}편` : ""}</span>}
              </div>
              {state === "empty" ? <div className="state-panel" role="status"><h2>선택한 기간의 박스오피스 데이터가 없습니다.</h2><p>다른 날짜나 기간을 선택해 주세요. 데모 데이터는 2026-09-07 ~ 2026-09-13에 제공됩니다.</p></div> :
                state === "search-empty" ? <div className="state-panel" role="status"><h2>현재 조회 목록에 일치하는 영화가 없습니다.</h2><p>검색어를 바꾸거나 초기화해 주세요.</p><button type="button" onClick={() => setKeyword("")}>검색 초기화</button></div> : (
                  <div className="table-scroll" role="region" aria-label="박스오피스 결과 표" tabIndex={0}>
                    <table>
                      <caption className="sr-only">{date} 기준 {periodLabels[type]} 박스오피스 가상 데이터</caption>
                      <thead><tr><th scope="col">순위</th><th scope="col">영화명</th><th scope="col">개봉일</th><th scope="col">매출(원)</th><th scope="col">관객수(명)</th><th scope="col">누적 관객수(명)</th></tr></thead>
                      <tbody>{items.map((item) => <tr key={item.movieCd}><td className="rank">{item.rank}</td><th scope="row">{item.movieNm}</th><td>{item.openDt ?? "—"}</td><td className="numeric">{formatInteger(item.salesAmt)}</td><td className="numeric">{formatInteger(item.audiCnt)}</td><td className="numeric">{formatInteger(item.audiAcc)}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
            </>
          )}
      </div>
      <p className="data-note">데모 주간: 09-07~09-13 · 데모 주말: 09-11~09-13. 샘플 기간 내 기준일에는 해당 고정 기간의 합계를 표시합니다.</p>
    </>
  );
}
