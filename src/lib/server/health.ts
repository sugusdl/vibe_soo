import "server-only";

// 외부 API나 DB 연결 상태를 의미하지 않는 애플리케이션 생존 확인이다.
export function getHealth() {
  return { status: "ok", service: "box-office" } as const;
}
