# 영화 박스오피스 인사이트 대시보드

KOBIS 일간·주간·주말 박스오피스 목록(`/`)과 일간 Top 10 관측 데이터 기반 7/14/30일 인사이트(`/insights`)를 보여주는 Next.js App Router 프로젝트입니다. `demo`는 고정 가상 데이터만 사용합니다. `live`는 서버가 Supabase 저장본을 읽고 필요할 때 KOBIS를 호출합니다.

**배포 상태:** AC 7·9의 화면 기능은 구현·검증했습니다. 사용자는 KOBIS의 DB 저장·집계 공개에 대한 별도 서면 허가와 개인·비상업적 운영 목적을 확인했습니다. 허가서 원문·유효기간·호출 한도와 실제 배포 환경은 아직 별도로 검증되지 않았습니다. [인수 기준 점검](docs/ACCEPTANCE.md)과 [배포 가이드](docs/DEPLOYMENT.md)를 확인한 뒤 배포합니다.

## 필요한 환경

| 항목 | 버전·용도 |
| --- | --- |
| Node.js | **22.x**. 로컬 기준 `.node-version`은 22.23.4 |
| npm | **10 이상**. `package.json`은 npm 10.9.9 기준 |
| Git | 저장소 복제 |
| 브라우저 | 로컬 화면 확인. 자동 화면 테스트는 Playwright Chromium 사용 |

`.node-version` 파일만으로 Node가 자동 전환되지는 않습니다. 버전 관리 도구 또는 설치한 Node 22로 `node --version`을 확인하세요.

## 키 없이 먼저 실행하기

새 복제본에서 `.env.local`을 만들지 않으면 기본값이 `demo`입니다. 외부 KOBIS·Supabase 요청은 발생하지 않습니다.

```powershell
git clone https://github.com/sugusdl/vibe_soo.git
cd vibe_soo
node --version
npm --version
npm ci
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다. `/insights`도 확인할 수 있습니다. demo 샘플 날짜는 **2026-09-07~13**이고 2026-09-06은 정상 빈 결과입니다. F2 종료일을 2026-09-13으로 두고 14일/30일을 선택하면 각각 빈 날짜 7일/23일을 확인할 수 있습니다. 기존 PC의 `.env.local`에 `DATA_MODE=live`가 있으면 그 설정이 적용되므로 demo 확인 전 모드를 바꾸고 서버를 다시 시작하세요.

## 환경변수 이름과 보관 위치

| 이름 | 용도 | demo 필수 | live 필수 |
| --- | --- | --- | --- |
| `DATA_MODE` | `demo` 또는 `live`. 생략하면 demo | 아니요 | 예 |
| `KOBIS_API_KEY` | 서버의 KOBIS 인증 | 아니요 | 예 |
| `SUPABASE_URL` | 서버의 Supabase 프로젝트 주소 | 아니요 | 예 |
| `SUPABASE_SECRET_KEY` | 서버 전용 DB 접근 | 아니요 | 예 |

`.env.example`에는 demo 모드 예시와 비밀키의 빈 자리만 있습니다. 로컬 비밀값은 Git에서 제외되는 `.env.local`에만 보관합니다. 값을 README, 소스, Git, 브라우저 코드, 로그, 이슈에 적지 마세요. `NEXT_PUBLIC_` 접두사를 비밀값에 붙이지 마세요. Vercel에서는 로컬 파일을 올리지 않고 프로젝트의 **Secret 환경변수**에 직접 등록합니다. Supabase secret key는 서버 전용이라는 [공식 안내](https://supabase.com/docs/guides/getting-started/api-keys)를 따릅니다.

live 배포 전에는 사용자에게 별도 허가의 유효기간·호출 한도와 운영 목적을 확인하고 Supabase에 [마이그레이션](supabase/migrations/20261025_box_office_cache.sql)이 적용됐는지 점검하세요. [API 가이드](docs/API_GUIDE.md)에 따라 설정하되 기존 프로젝트에 SQL을 무작정 재실행하지 마세요.

## 설치 후 검사·실행 명령

아래 명령은 모두 현재 `package.json`에 실제로 정의되어 있습니다.

| 명령 | 내용 |
| --- | --- |
| `npm run dev` | 개발 서버 시작 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 빌드된 앱 실행 |
| `npm run lint` | ESLint, 경고도 실패 처리 |
| `npm run typecheck` | Next 라우트 타입 생성 후 TypeScript 검사 |
| `npm run test` | Vitest 단위 검사 |
| `npm run test:e2e` | Playwright 데스크톱·모바일 화면 검사. 내부적으로 demo 빌드·테스트 서버 실행 |
| `npm run verify:data -- --date=YYYY-MM-DD --period=daily` | 저장본·로컬 원본·새 KOBIS 응답 대조. live 설정과 이용 조건 확인 후 실행 |

첫 Playwright 실행 전 필요한 브라우저를 설치합니다.

```powershell
npx playwright install chromium
npm run test:e2e
```

Playwright는 포트 3100의 별도 서버를 사용합니다. 같은 폴더에서 `npm run dev`가 실행 중이면 빌드 출력 충돌을 피하기 위해 종료한 뒤 화면 검사를 실행하세요. AC 7·9 재현 테스트는 `fixme`로 남아 있어 화면 검사에서 건너뜁니다. 건너뜀은 통과가 아닙니다.

## 문서와 폴더

- [PRD와 AC](PRD.md), [구현 계획](docs/IMPLEMENTATION.md), [인수 기준 결과](docs/ACCEPTANCE.md), [배포 절차](docs/DEPLOYMENT.md)
- [아키텍처](ARCHITECTURE.md), [ERD](ERD.md), [API 가이드](docs/API_GUIDE.md), [demo 입력](DEMO.md)
- `src/app/`: 페이지·내부 API, `src/lib/server/`: 서버 전용 KOBIS/DB, `tests/unit/`·`tests/e2e/`: 자동 검사
