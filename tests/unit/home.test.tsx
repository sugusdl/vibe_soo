import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import InsightsPage from "@/app/insights/page";
import { BoxOfficeList } from "@/components/box-office-list";
import type { BoxOfficeResult } from "@/lib/box-office";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const response: BoxOfficeResult = {
  status: "data", mode: "demo", date: "2026-09-13", type: "daily",
  rangeStart: "2026-09-13", rangeEnd: "2026-09-13",
  items: [{ movieCd: "A", movieNm: "바다의 편지", rank: 2, openDt: "2026-09-02", salesAmt: "9007199254740993", audiCnt: "25000", salesAcc: "9007199254740993", audiAcc: "171000" }],
};

describe("F1 데모 화면", () => {
  it("최초 요청 중에는 로딩을 표시한다", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    vi.stubEnv("DATA_MODE", "demo");
    render(<Home />);
    expect(screen.getByRole("heading", { name: "박스오피스 목록", level: 1 })).toBeVisible();
    expect(screen.getByText("박스오피스 정보를 불러오는 중입니다.")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("선택한 기간의 박스오피스 데이터가 없습니다.")).not.toBeInTheDocument();
  });

  it("목록에서 인사이트로 이동할 수 있는 링크를 제공한다", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<Home />);
    expect(screen.getByRole("link", { name: /인사이트 화면 보기/ })).toHaveAttribute("href", "/insights");
  });

  it("인사이트에서 준비 상태를 안내하고 목록으로 돌아갈 수 있다", () => {
    render(<InsightsPage />);
    expect(screen.getByRole("heading", { name: "박스오피스 인사이트", level: 1 })).toBeVisible();
    expect(screen.getByRole("link", { name: /박스오피스 목록으로 돌아가기/ })).toHaveAttribute("href", "/");
  });

  it("큰 정수를 정확히 표시하고 검색 후에도 원래 순위를 유지한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => response }));
    render(<BoxOfficeList mode="demo" today="2026-10-24" />);
    expect(await screen.findByText("9,007,199,254,740,993")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: " 바다 " } });
    expect(screen.getByRole("row", { name: /바다의 편지/ })).toHaveTextContent("2");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "없는제목" } });
    expect(screen.getByText("현재 조회 목록에 일치하는 영화가 없습니다.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "검색 초기화" }));
    expect(screen.getByRole("table")).toBeVisible();
  });

  it("늦게 도착한 이전 요청이 새 조건의 결과를 덮어쓰지 않는다", async () => {
    let resolveFirst!: (value: unknown) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...response, status: "empty", date: "2026-09-06", items: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<BoxOfficeList mode="demo" today="2026-10-24" />);
    fireEvent.change(screen.getByLabelText("조회 날짜"), { target: { value: "2026-09-06" } });
    expect(await screen.findByText("선택한 기간의 박스오피스 데이터가 없습니다.")).toBeVisible();
    resolveFirst({ ok: true, json: async () => response });
    await waitFor(() => expect(screen.queryByRole("table")).not.toBeInTheDocument());
    expect(screen.getByTestId("list-state")).toHaveAttribute("data-state", "empty");
  });
});
