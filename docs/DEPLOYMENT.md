# 배포 절차와 확인 기록

확인일: **2026-10-25**. 대상 스택: Vercel의 Next.js 앱 + Supabase Postgres. **현재 공개 배포를 실행하지 않았다.** [PRD 인수 기준 점검](ACCEPTANCE.md)에서 AC 7·9·17이 미충족이며, KOBIS 결과 저장 제한과 현재 DB 캐시가 충돌한다. 아래 절차는 이 문제를 해결하고 배포 승인을 받은 뒤 수행한다. 로컬 빌드 성공을 배포 URL 확인 성공으로 표시하지 않는다.

## 1. 무료 조건과 배포 판단

| 서비스 | 2026-10-25 공식 문서 확인 내용 | 이 프로젝트 판단 |
| --- | --- | --- |
| Vercel Hobby | [Hobby 공식 요금제](https://vercel.com/docs/plans/hobby): **개인·비상업적 사용**에 한정. 월 함수 호출 포함량 100만 회, Fast Data Transfer 100GB, Active CPU 4시간 등. [전체 제한](https://vercel.com/docs/limits)은 배포 전 다시 확인 | 서비스의 실제 운영 목적이 개인·비상업적인지 아직 확정되지 않았다. 업계 관계자가 방문한다는 사실만으로 적합·부적합을 단정하지 않는다. 사용 목적을 확정하고 필요하면 유료 플랜을 선택 |
| Supabase Free | [공식 요금·할당량](https://supabase.com/docs/guides/platform/billing-on-supabase): DB 500MB/프로젝트, egress 5GB 등. [프로젝트 일시 중지](https://supabase.com/docs/guides/platform/free-project-pausing): 최근 7일의 활동이 부족하면 중지 가능 | 현재 사용량·예상 전송량의 실측이 없으므로 적합성 미확정. 중지·복구 운영 절차 필요 |
| KOBIS Open API | [이용약관](https://www.kobis.or.kr/kobisopenapi/homepg/board/findProvisionInfo.do): 키 공개 금지, 출처 표시, 결과의 복제·저장 제한. 이용 횟수를 별도로 제한할 수 있음. [서비스 안내](https://www.kobis.or.kr/kobisopenapi/homepg/board/findServiceGuideList.do): 회원·발급키 필요 | **현재 Supabase 기간별 실적 저장과 충돌**. 공개 문서에서 이 키의 고정 호출 한도는 확인하지 못했다. KOBIS에 저장 허용 범위·집계 표시·호출 한도를 확인하고 설계를 조정하기 전 live 배포 보류 |

용량 가정: 방문자 **100명/일**, 각자 30일 인사이트를 한 번 열면 내부 일간 요청은 최대 **3,000회/일**, 약 **90,000회/30일**이다. 페이지·목록 요청, 재시도, 서버 인스턴스 간 중복 호출과 실제 응답 크기는 추가된다. 캐시 적중률을 측정하지 않았으므로 이 추정만으로 Vercel·Supabase·KOBIS 한도 적합성을 판정하지 않는다.

### 배포 전 해결 기준

1. [AC 7·9](ACCEPTANCE.md)의 관객 추이·총매출·1위 점유율을 구현하고 재현 테스트를 통과시킨다.
2. KOBIS 이용 조건상 현재 저장·집계 방식의 허용 범위를 확인해 문서화한다. 허용되지 않으면 DB 캐시·원본 파일 저장을 제거하거나 허용된 데이터 경로로 바꾼다. 이 변경에 맞춰 DB와 앱을 검증한다.
3. 서비스 목적이 Vercel Hobby의 개인·비상업적 범위에 맞는지 확정하고 예상 사용량을 계측한다. 맞지 않으면 요금제나 호스팅을 결정한다.
4. 전체 `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`와 AC 1~17을 다시 확인한다. 실제 배포 직전 사용자 승인을 받는다.

## 2. 실제 배포 순서

다음은 **배포 전 해결 기준 충족 후**의 순서다. `[직접]`은 계정 소유자가 브라우저에서 해야 하는 단계다. Vercel에서 Git 저장소를 가져오면 최초 배포가 시작될 수 있으므로, 승인 전 Import/Deploy를 누르지 않는다. [Vercel Git 배포 안내](https://vercel.com/docs/git).

| 순서 | 수행자 | 단계와 확인할 결과 |
| --- | --- | --- |
| 1. 계정 인증 | **[직접]** | GitHub, Vercel, Supabase에 로그인하고 배포할 조직·프로젝트의 권한을 확인한다. KOBIS 회원·발급키의 이용 조건 해결 기록을 확보한다. |
| 2. 배포 대상 | **[직접]** | Vercel에서 GitHub 저장소 `sugusdl/vibe_soo`를 연결한다. 프로덕션 브랜치는 `main`, Root Directory는 저장소 루트로 지정한다. 실제 운영 목적에 맞는 플랜을 선택한다. |
| 3. DB 준비 | **[직접]** | 허용된 저장 설계가 확정된 경우에만 Supabase 프로젝트와 SQL Editor에서 적용할 [마이그레이션](../supabase/migrations/20261025_box_office_cache.sql)의 상태를 검토한다. 기존 DB에 이미 적용됐다면 중복 적용하지 않는다. RLS·RPC 실행권을 확인한다. |
| 4. 빌드 설정 | **[직접]** | Framework Preset `Next.js`, Install Command `npm ci`, Build Command `npm run build`, Output Directory는 Next.js 기본값으로 둔다. Vercel Node.js Version을 **22.x**로 맞추고 `package.json`의 `engines.node`도 확인한다. Vercel은 Node의 마이너/패치 버전을 자동 선택한다. [Node 버전 안내](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). |
| 5. 환경변수 | **[직접]** | Vercel Project Settings → Environment Variables에서 대상 환경을 **Production**으로 선택한다. live에 필요한 아래 네 이름을 등록한다. 비밀값은 Vercel의 **Secret** 타입으로 넣고 값을 문서·채팅·CLI 출력에 붙여 넣지 않는다. Preview는 필요할 때 별도 범위로 설정한다. [Vercel 환경변수 안내](https://vercel.com/docs/environment-variables). |
| 6. 배포 | **[직접]** | 위 차단 사항 해결과 승인 후 `main` 대상 배포를 실행한다. 빌드 성공, 배포 ID, 배포 시각, 연결된 커밋을 기록한다. 배포 과정에 `.env.local` 파일을 업로드하지 않는다. |
| 7. 배포 주소 확인 | 공동 | Vercel이 발급한 실제 URL에서 아래 표를 수행한다. 콘솔·Network·서버 로그에는 값이 아닌 결과 상태만 기록한다. 실패하면 배포 완료로 보고하지 않는다. |

### 환경변수 위치

| 이름 | 로컬 | Vercel Production | 브라우저 |
| --- | --- | --- | --- |
| `DATA_MODE` | Git 제외 `.env.local`; demo는 생략 가능 | live 승인 후 `live` | 값 자체는 민감하지 않지만 동작 판정에만 사용 |
| `KOBIS_API_KEY` | Git 제외 `.env.local` | 서버 전용 **Secret** | **넣지 않음** |
| `SUPABASE_URL` | Git 제외 `.env.local` | 서버 설정 | 브라우저 직접 DB 접근에 사용하지 않음 |
| `SUPABASE_SECRET_KEY` | Git 제외 `.env.local` | 서버 전용 **Secret** | **넣지 않음** |

실제 키를 `NEXT_PUBLIC_` 변수, Git 추적 파일, `.env.example`, PR 설명, 빌드 로그, 브라우저 요청 URL, 오류 응답, 스크린샷에 넣지 않는다. Supabase의 [secret key 지침](https://supabase.com/docs/guides/getting-started/api-keys)에 따라 서버 전용으로 유지한다.

## 3. 배포 URL 확인표

**배포 URL: 없음.** 아래는 2026-10-25 기준 **미실행** 기록이다. 로컬 demo·실제 DB 검사 결과는 [ACCEPTANCE.md](ACCEPTANCE.md)와 [API_GUIDE.md](API_GUIDE.md)에 별도로 있으며 이 표의 배포 확인을 대신하지 않는다.

| 확인 항목 | 기준 | 상태 | 이유 |
| --- | --- | --- | --- |
| 배포 페이지 `/`·`/insights` | HTTP 200, 화면 렌더링, 모바일 표시 | **미실행** | Vercel 배포 URL 없음 |
| live 목록의 일간·주간·주말 | 실제 기간·여섯 열·검색·정상 빈·오류 구분 | **미실행** | live 공개 배포 보류 |
| F2 7/14/30일 | 날짜별 진행률, 매출·관객 추이, Top 5/10, 필수 보조 지표 | **미실행** | URL 없음. AC 7·9도 미충족 |
| 캐시 출처·갱신 | 첫 요청/재조회 출처, 수집 시각, 만료 후 오류 안내 | **미실행** | URL 없음. KOBIS 저장 조건 충돌 |
| 비밀값 경계 | 브라우저 Network·HTML·번들·응답·운영 로그에 값 없음 | **미실행** | 배포 산출물·운영 로그 없음 |
| 실패 복구·재시도 | 오류 날짜만 재시도, 502/503/504에서 비밀값 없는 안내 | **미실행** | 배포 URL 없음 |
| 무료 사용량·운영 | Vercel·Supabase 실제 사용량, KOBIS 허용 범위 | **미실행** | 운영 트래픽·조건 확인 기록 없음 |

각 검사는 배포 ID·검사 시각·URL(키 없는 페이지 주소)·입력 조건·결과를 추가해 **통과/실패/미실행**으로 갱신한다. 비밀값, 키가 담긴 외부 요청 URL, 원문 오류는 남기지 않는다.

## 4. 변경·복구·노출 대응

- **환경변수 변경:** [직접] Vercel의 올바른 Production/Preview 범위에서 값을 바꾸고 새 배포를 만든다. 기존 배포에는 변경이 소급되지 않는다. 새 배포에서 API·비밀값 경계 확인 후 이전 자격증명을 폐기한다. [환경변수 적용 설명](https://vercel.com/docs/environment-variables), [회전 안내](https://vercel.com/docs/environment-variables/rotating-secrets).
- **배포 되돌리기:** [직접] Vercel Deployments에서 직전 정상 프로덕션 배포로 Instant Rollback한다. Hobby는 **직전 배포**로만 즉시 되돌릴 수 있다. 롤백은 예전 빌드의 환경 설정도 복원하므로 키·DB 스키마 호환성을 확인한다. DB 마이그레이션은 자동으로 되돌아가지 않는다. 수정 배포를 다시 프로덕션으로 올린 뒤 자동 도메인 할당 상태를 확인한다. [공식 롤백 안내](https://vercel.com/docs/instant-rollback).
- **키 노출:** 우선 노출 경로를 차단하고 [직접] KOBIS·Supabase에서 해당 자격증명을 폐기·재발급한다. Vercel Secret을 새 값으로 교체해 재배포하고 이전 배포 URL·로그·Git 이력·공유 문서의 노출 범위를 조사한다. 로그와 보고서에는 값 대신 키 이름·사건 시각·조치 결과만 기록한다. 이전 빌드를 다시 활성화하면 옛 키가 남을 수 있으므로 재배포된 버전만 사용한다.
- **Supabase 중지:** [직접] 프로젝트 상태와 알림을 확인하고 대시보드에서 복구한다. 복구 후 읽기 RPC, 목록, 갱신을 확인한다. DB 장애를 정상 빈 결과로 처리하지 않는다.

## 5. 새 컴퓨터 재현 절차와 실제 확인 범위

다른 컴퓨터에서는 Node 22.x·npm 10 이상·Git을 설치하고 [README](../README.md)의 `git clone` → `npm ci` → `npm run test`/`lint`/`typecheck`/`build` → `npm run dev` 순서로 실행한다. 키 없이 demo 목록 2026-09-07(5편), 2026-09-06(정상 빈 결과), `/insights`의 14/30일 빈 날짜를 확인한다. Playwright는 `npx playwright install chromium` 후 `npm run test:e2e`를 실행한다. live는 각 컴퓨터에서 Git 제외 `.env.local`에 직접 설정한 뒤 이용 조건을 해결한 경우에만 확인한다.

| 항목 | 2026-10-25 실제 결과 | 범위 |
| --- | --- | --- |
| GitHub 원격의 `main`을 별도 임시 폴더에 새로 복제 | **통과**. `.env.local`·`node_modules` 없이 시작 | **같은 PC의 별도 폴더**, 다른 컴퓨터 아님 |
| Node 22.23.4·npm 10.9.9에서 `npm ci` | **통과**, 436개 패키지 설치 | 같은 PC·네트워크·npm 레지스트리 |
| 새 복제본 `npm run test`, `lint`, `typecheck`, `build` | **통과**: 단위 52개 및 나머지 명령 종료 코드 0 | 비밀키 없는 demo 환경 |
| 새 복제본 `npm run start -- --hostname 127.0.0.1 --port 3200` | **통과**: 09-06 빈 0건, 09-07 샘플 5건, `/insights` HTTP 200 | 같은 PC의 별도 실행 서버 |
| 실제 다른 컴퓨터·OS에서 설치·실행 | **미실행** | 다른 기기 접근 없음. OS·권한·방화벽·브라우저 차이는 확인하지 못함 |
| 새 복제본의 live 키·DB·Vercel 배포 | **미실행** | 키를 복제하지 않았고 공개 배포 보류 |

처음에는 로컬 저장소 경로를 직접 복제하려다 Windows Git 소유권 검사로 실패했다. 이후 **GitHub 원격에서 새로 복제**하는 절차로 다시 실행해 위 결과를 얻었다. 임시 복제본의 성공을 다른 컴퓨터의 성공으로 보고하지 않는다.
