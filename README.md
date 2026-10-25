# 박스오피스 인사이트 개발 시작

Next.js App Router + TypeScript 박스오피스 대시보드입니다. 목록(`/`)은 `DATA_MODE=demo`에서 가상 데이터, `DATA_MODE=live`에서 Supabase 저장본을 먼저 읽고 필요할 때 KOBIS 일간·주간·주말 데이터를 조회합니다. DB SQL과 연동 코드는 준비됐으며 실제 Supabase 프로젝트 설정·통합 검증은 남았습니다. 인사이트(`/insights`)는 준비 화면입니다.

## 실행 환경과 로컬 실행

- Node.js 22.x (`.node-version`: 22.23.4)
- npm 10 이상

Node 버전 관리 도구로 `.node-version`에 맞춘 뒤 실행합니다. 이 파일 자체는 시스템 Node를 자동으로 전환하지 않습니다.

```powershell
node --version
npm ci
npm run dev
```

브라우저에서 http://localhost:3000 으로 접속합니다. 포트가 사용 중이면 개발 서버 로그에 표시된 주소를 사용합니다. 종료는 `Ctrl+C`입니다.

## 환경변수

데모와 모의 자동 테스트는 실제 키 없이 실행됩니다. live에서는 `.env.example`의 변수 이름을 참고해 `.env.local`에만 실제 값을 설정하고 [API 가이드](docs/API_GUIDE.md)의 순서대로 SQL을 적용합니다.

- `KOBIS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

실제 값을 소스·Git·브라우저·로그에 포함하지 않습니다. `.env.local`은 Git에서 제외하며 `.env.example`은 빈 값만 포함합니다. KOBIS 호출은 서버에서만 수행합니다. 요청·응답·검증 계약은 [API 가이드](docs/API_GUIDE.md), 데모 확인 입력은 [DEMO.md](DEMO.md)를 참고하세요.

## 검증 명령

| 명령 | 용도 |
| --- | --- |
| `npm run lint` | ESLint 검사, 경고도 실패 처리 |
| `npm run typecheck` | Next 라우트 타입 생성 후 TypeScript 검사 |
| `npm run test` | Vitest 단위 테스트 1회 실행 |
| `npm run test:watch` | Vitest 변경 감시 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 빌드된 앱 실행 |
| `npm run test:e2e` | Playwright 데스크톱·모바일 Chromium 테스트 |
| `npm run test:e2e:ui` | Playwright 테스트 UI |

화면 테스트 최초 실행 전 브라우저를 설치합니다.

```powershell
npx playwright install chromium
npm run test:e2e
```

Playwright는 프로덕션 빌드 후 전용 포트 3100에서 테스트 서버를 자동 시작·종료합니다. 기존 개발 서버와 같은 빌드 출력 폴더를 쓰므로 개발 서버를 종료한 뒤 화면 테스트를 실행합니다. 보고서는 `playwright-report/`, 실패 자료는 `test-results/`에 생성되며 Git에서 제외됩니다.

Vitest는 동기 화면 컴포넌트 테스트를 담당합니다. 향후 비동기 서버 컴포넌트와 실제 라우팅은 Playwright에서 검증합니다.

## 구조와 설계 문서

```text
src/app/               App Router 페이지와 내부 API
src/components/        공통 화면 컴포넌트
src/lib/server/        server-only 서버 모듈
tests/unit/            Vitest 테스트
tests/e2e/             Playwright 테스트
```

기존 설계 문서는 수정하지 않았습니다. AGENTS.md의 명령어 표는 작성 당시 ‘미정’ 상태의 기록이며 현재 실행 가능한 명령은 이 문서와 package.json을 기준으로 확인합니다. 저장 모델은 후속 ERD.md의 세 테이블을 적용할 예정입니다.

설정 근거: [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation), [Vitest 가이드](https://nextjs.org/docs/app/guides/testing/vitest), [Playwright 가이드](https://nextjs.org/docs/app/guides/testing/playwright).
