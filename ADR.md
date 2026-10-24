# Architecture Decision Records

## ADR-001: 애플리케이션 기술스택 선택

- 상태: 채택 — 사용자 지정 기술스택을 MVP 설계에 반영
- 결정일: 2026-10-24
- 관련 문서: [PRD.md](./PRD.md), [ARCHITECTURE.md](./ARCHITECTURE.md)

### 배경

박스오피스 목록과 인사이트 두 화면을 제공하며 KOBIS 일간·주간·주말 API를 서버에서 조회해야 한다. 숫자 문자열의 검증·정수 집계가 필요하고, 최대 30일 일간 데이터의 반복 호출을 공유 캐시로 줄여야 한다. API 키와 DB 비밀키는 서버에서만 사용한다. 로그인·예측·대규모 배치 분석은 MVP 범위에 없다.

### 대안

| 대안 | 검토 결과 |
| --- | --- |
| Next.js(App Router) + TypeScript 단일 프로젝트 | 화면과 Route Handlers를 함께 관리하고 서버 데이터 처리 코드를 공유할 수 있다. 현재 규모에 적합하다. |
| React + Express + TypeScript | API의 독립 배포·확장에 유리하나 두 애플리케이션 운영과 API 계약 관리가 늘어난다. |
| React + FastAPI | Python 분석 생태계와 타입 기반 검증·API 문서화에 유리하나 현재 요구에는 두 언어와 별도 백엔드 운영 부담이 크다. |

기능 근거: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Express 라우팅](https://expressjs.com/en/starter/basic-routing/), [FastAPI 기능](https://fastapi.tiangolo.com/features/). 적합성 평가는 본 프로젝트 범위를 기준으로 한 판단이다.

### 결정

**Next.js(App Router) + TypeScript + Supabase(Postgres) + Vercel**을 채택한다.

Next.js는 화면과 내부 조회 API를 제공한다. TypeScript는 계약과 서버 집계 코드를 관리한다. Supabase Postgres는 조회 조건별 정상 스냅샷과 정상 빈 결과를 저장하는 공유 캐시로 사용한다. Vercel은 화면과 Node.js 런타임 내부 API의 배포 대상으로 사용한다.

### 선택 이유

1. **MVP 구현·운영 단위 축소:** 목록과 인사이트에 필요한 서버 처리를 Route Handlers와 공통 서비스로 구성해 별도 백엔드 배포를 줄인다.
2. **계약 일관성:** 입력 스키마와 공개 응답 타입을 화면·서버에서 공유한다. KOBIS 응답은 별도 런타임 검증 후 정규화해 타입 선언만으로 외부 값을 신뢰하지 않는다.
3. **비밀키의 서버 경계:** 브라우저는 내부 API만 호출하고 KOBIS 키·DB 비밀키는 서버 전용 모듈과 환경변수에서 사용한다.
4. **공유 캐시의 지속성:** 프로세스 메모리에 의존하지 않고 DB의 `fetched_at`·`expires_at`으로 여러 서버 인스턴스가 같은 캐시와 만료 정책을 사용한다.
5. **현재 분석 규모에 적합:** 최대 30일 일간 목록의 정수 합산과 Top 계산은 TypeScript 서버 서비스로 구현할 수 있다. 별도 분석 서버는 현 단계에서 필요하지 않다.
6. **배포 구성의 단순성:** Next.js 애플리케이션을 Vercel에 배포하고 관리형 Postgres를 이용하는 구조로 애플리케이션과 데이터 책임을 나눈다.

### 트레이드오프

| 얻는 점 | 부담·제약 | 대응 |
| --- | --- | --- |
| 단일 프로젝트와 공통 타입 | 화면·API의 배포 주기가 결합되고 Next.js에 의존 | Route Handler는 얇게 유지하고 외부 연동·캐시·집계를 서버 서비스로 분리 |
| 서버리스 배포 | 냉시작과 실행 시간 제한, 30일 캐시 미스의 지연 | 공유 캐시·제한된 동시 요청·전체 시간 예산 적용. 필요 시 별도 수집 작업 도입을 재검토 |
| DB 기반 공유 캐시 | 캐시 조회도 DB 네트워크 지연과 용량을 사용하며 DB 장애에 영향받음 | 키 인덱스·TTL·보존 정책·사용량 관측. DB 조회 장애 시 무제한 외부 우회를 막고 오류 반환 |
| 정밀한 정수 처리 | `bigint`의 JSON 직렬화와 차트 숫자 변환에 추가 처리 필요 | 서버 계산은 `bigint`, API·JSONB에는 십진 문자열, 차트 변환에는 안전 범위 검사 |
| 데이터 최신성의 명확한 정책 | 외부 갱신 실패 시 만료 캐시로 계속 서비스하지 않아 가용성이 낮아질 수 있음 | 최신 수치로 오인하는 것을 방지하고 갱신 시각·오류·수동 재시도를 제공. 과거값 제공은 별도 요구로 재검토 |
| 무료 요금제에서 시작할 가능성 | 용량·전송·실행 제한 및 사용 목적 조건을 충족해야 함 | 배포 전 공식 조건과 예상량 확인. 부적합하면 요금제 또는 배포 결정을 재검토 |

Vercel Hobby의 개인·비상업적 사용 조건은 실제 서비스 운영 목적과 대조해야 한다. Supabase Free도 사용량과 프로젝트 운영 정책을 배포 전에 확인한다. 스택 채택은 무료 운영 보장을 의미하지 않는다. [Vercel 이용약관](https://vercel.com/legal/terms), [Supabase 요금·할당량](https://supabase.com/docs/guides/platform/billing-on-supabase)

### 결정의 적용 범위와 재검토 조건

- 캐시·정상 빈 응답·외부 실패 처리의 구체 정책은 ARCHITECTURE.md를 따른다. 특히 외부 오류를 정상 빈 결과로 저장하지 않고 일간·주간·주말 캐시를 분리한다.
- 캐시 테이블은 브라우저 직접 접근을 차단한다. Supabase secret key는 elevated 권한이 있으므로 서버에만 둔다. [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys)
- 독립 API 소비자가 늘거나 장시간 수집·Python 분석·현재 배포 한도를 넘는 부하가 필요하면 백엔드/워커 분리와 요금제를 새 ADR로 검토한다.
- 본 문서는 기술 결정 기록이다. 구현·성능 측정·배포 적합성 검증이 완료됐다는 의미는 아니다.
