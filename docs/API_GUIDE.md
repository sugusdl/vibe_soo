# KOBIS 박스오피스 API 연동 가이드

상태: B단계 코드·SQL 작성 완료. 2026-10-25 실제 Supabase 연결·캐시·대조·롤백 검증 완료.

기준: [PRD](../PRD.md) · [ARCHITECTURE](../ARCHITECTURE.md) · [ERD](../ERD.md) · [IMPLEMENTATION](./IMPLEMENTATION.md)

공식 서비스: [KOBIS 일별 박스오피스](https://www.kobis.or.kr/kobisopenapi/homepg/apiservice/searchServiceInfo.do?serviceId=searchDailyBoxOffice), [KOBIS 주간/주말 박스오피스](https://www.kobis.or.kr/kobisopenapi/homepg/apiservice/searchServiceInfo.do?serviceId=searchWeeklyBoxOffice), [KOBIS Open API 홈](https://www.kobis.or.kr/kobisopenapi/homepg/main/main.do). 아래 파라미터 매핑은 이 서비스의 REST JSON 계약에 맞춰 구현하고, 실제 응답의 기간과 구조를 런타임에서 재검증한다. 실제 키·키가 포함된 요청 URL·외부 오류 원문은 기록하지 않는다.

## 1. 외부 요청과 응답

서버에서만 HTTPS GET을 수행한다. 경로는 일간 `.../boxoffice/searchDailyBoxOfficeList.json`, 주간·주말 `.../boxoffice/searchWeeklyBoxOfficeList.json`이다. 브라우저는 내부 `GET /api/box-office?date=YYYY-MM-DD&type=daily|weekly|weekend`만 호출한다.

| 외부 파라미터 | 일간 | 주간 | 주말 | 의미 |
| --- | --- | --- | --- | --- |
| `key` | `KOBIS_API_KEY` | 동일 | 동일 | 서버의 `.env.local`에서만 읽는다. 값·전체 URL을 출력하지 않는다. |
| `targetDt` | `YYYYMMDD` | `YYYYMMDD` | `YYYYMMDD` | 내부 `date=YYYY-MM-DD`에서 하이픈을 제거한다. 미래·잘못된 날짜는 외부 호출 전 `400`. |
| `itemPerPage` | `10` | `10` | `10` | 조회 범위를 상위 10편으로 고정한다. |
| `weekGb` | 보내지 않음 | `0` | `1` | 주간·주말 구분. 실제 시작·종료일은 계산하지 않고 응답 `showRange`를 사용한다. |

KOBIS 정상 JSON의 최상위는 `boxOfficeResult`이며, 그 안에 `boxofficeType`, `showRange`, 일간의 `dailyBoxOfficeList` 또는 주간·주말의 `weeklyBoxOfficeList`가 온다. `showRange`는 `YYYYMMDD~YYYYMMDD` 형식으로 검사해 내부 `rangeStart`·`rangeEnd`로 바꾼다. 일간의 범위는 요청일과 같아야 한다. 주간·주말의 실제 기간을 기준일만으로 추정하지 않는다. 원본 목록이 빈 배열이면 정상 `empty`; 목록 필드 누락이나 외부 오류 객체는 `empty`가 아니라 오류다. 영화 행에서 쓰는 여덟 필드는 아래와 같다.

## 2. 응답 필드 → 내부 데이터·DB 컬럼

| KOBIS 필드 | 내부 API | ERD 테이블·컬럼 | 검증·변환 |
| --- | --- | --- | --- |
| `movieCd` | `movieCd` | `movies.movie_cd`, `box_office_results.movie_cd` FK | 공백 아닌 문자열 식별자. 같은 기간 중복 금지; 숫자로 변환하지 않음 |
| `movieNm` | `movieNm` | `movies.movie_nm` | 공백 아닌 문자열. 제목만으로 영화 병합 금지 |
| `openDt` | `openDt` | `movies.open_dt` | 유효한 `YYYY-MM-DD` 또는 빈 값→`null`; 잘못된 날짜는 오류 |
| `rank` | `rank` | `box_office_results.rank` | 양의 정수 문자열→안전 정수. DB `integer` 범위 확인 |
| `salesAmt` | `salesAmt` | `box_office_results.sales_amt` | 정수 문자열→서버 `bigint`, DB signed 64비트 범위 확인, JSON 십진 문자열 |
| `audiCnt` | `audiCnt` | `box_office_results.audi_cnt` | 위와 동일. 단위 명 |
| `salesAcc` | `salesAcc` | `box_office_results.sales_acc` | 위와 동일. 누적 매출이며 기간 합계에 사용하지 않음 |
| `audiAcc` | `audiAcc` | `box_office_results.audi_acc` | 위와 동일. 누적 관객이며 날짜별 합산 금지 |

요청의 `type`·`date`는 `box_office_periods.period_type`·`target_date`로, 응답 `showRange`는 `range_start`·`range_end`로 대응한다. B단계의 `fetchedAt`·`expiresAt`은 기간 행의 시각이다. `DATA_MODE=demo`의 출처는 `fixture`이며 실제 수집 시각은 없다.

## 3. 실패 분류와 내부 HTTP 코드

| 상황 | 내부 코드 | HTTP | 처리 |
| --- | --- | --- | --- |
| 내부 날짜·기간·데모 전용 파라미터 오류 | `INVALID_INPUT` | `400` | 외부 호출하지 않음 |
| `.env.local`에서 서버 키를 읽을 수 없음 | `KOBIS_CONFIG` | `503` | 설정 안내만 반환, 키 이름 외 값 비공개 |
| KOBIS 네트워크 오류·비정상 HTTP·리다이렉트 | `KOBIS_UPSTREAM` | `502` | 원문/URL을 반환하거나 로그에 남기지 않음 |
| 외부 호출 5초 초과 | `KOBIS_TIMEOUT` | `504` | 요청 중단, 수동 재시도 안내 |
| JSON 파싱 실패·오류 객체·필수 구조/값/기간 불일치 | `KOBIS_INVALID_RESPONSE` | `502` | 성공/빈 응답으로 위장하지 않음 |
| Supabase 설정 없음·읽기 실패·저장본 대조 실패 | `DB_CONFIG`·`DB_READ`·`DB_INVALID_RESPONSE` | `503` | KOBIS로 우회하거나 만료 캐시를 최신으로 표시하지 않음 |
| DB 저장 실패 | `CACHE_WRITE_FAILED` 경고 | `200` | **검증된** KOBIS 결과만 반환. `cachePersisted=false`, `expiresAt=null`; 화면에 다음 조회에서 재호출될 수 있음을 표시 |

실패 응답은 `{ "error": { "code": "...", "message": "안전한 안내" } }`이다. 정상 응답은 `{ "data": { "status": "data|empty", "items": [...] }, "meta": { "date", "type", "rangeStart", "rangeEnd", "source", "fetchedAt", "expiresAt", "cachePersisted", "generatedAt", "warning?" } }`이다. API 응답과 외부 fetch에 `no-store`를 적용한다. 캐시 적중이면 `source=cache`, 갱신 후 저장·대조에 성공하면 `source=kobis`다. SQL 적용과 운영 제한 검증 전에는 배포 준비 완료로 판단하지 않는다.

## 4. 저장 전 검증 순서

1. 내부 요청의 날짜가 실제 달력 날짜이고 한국 시간 기준 미래가 아닌지, `type`이 세 값 중 하나인지 검사한다.
2. KOBIS 응답이 객체이고 `boxOfficeResult`·`boxofficeType`·유형별 목록 배열·`showRange`가 있는지 검사한다. 외부 오류 객체와 정상 빈 목록을 구분한다.
3. `showRange` 양쪽 날짜의 형식·실재·순서를 검사한다. 일간은 요청 날짜와 일치해야 한다.
4. 모든 행의 영화 코드·제목·순위·개봉일·네 수치가 계약에 맞는지 확인한다. 같은 목록의 `movieCd` 중복을 거절한다.
5. 숫자는 문자열의 정수 형식부터 확인하고 `bigint`로 변환해 signed 64비트 DB 범위를 검사한다. 순위는 양의 안전 정수이며 DB `integer` 범위를 검사한다. 빈 문자열·소수·숫자 아닌 값·범위 초과를 0으로 대체하지 않는다. 부호 허용 정책은 공식 계약/실제 조정 사례 확인 전 임의로 좁히지 않는다.
6. 검증된 데이터만 순위순으로 정렬하고, B단계에서는 `save_box_office_period` 단일 호출로 저장한다. 다시 읽어 원본과 대조한 뒤 JSON에 십진 문자열로 보낸다.

## 5. 모드별 확인

| 조건 | 기대값 |
| --- | --- |
| `DATA_MODE=demo`, `2026-09-06` 일간 | fixture 원본 0편, `data.status=empty`, `meta.source=fixture` |
| `DATA_MODE=demo`, `2026-09-13` 일간 | 가상 영화 목록, `meta.source=fixture`, 외부 요청 없음 |
| `DATA_MODE=live`, `2026-09-06` 일간 | 실제 KOBIS 목록, `data.status=data`, `items.length>0`, `meta.source=kobis`인지 실제 호출로 확인 |
| `DATA_MODE=live`, 주간·주말 | `weekGb`별 실제 응답 및 `showRange` 표시 확인 |

### 2026-10-25 확인 결과

| 검사 | 상태 | 실제 관찰 |
| --- | --- | --- |
| live 일간 `2026-09-06` | 통과 | HTTP 200, `data`, 10편, `source=kobis`, 기간 `2026-09-06~2026-09-06` |
| live 주간 `2026-09-06` | 통과 | HTTP 200, `data`, 10편, 기간 `2026-08-31~2026-09-06` |
| live 주말 `2026-09-06` | 통과 | HTTP 200, `data`, 10편, 기간 `2026-09-04~2026-09-06` |
| live 브라우저 화면 | 통과 | 성공 상태, KOBIS 출처, 10편, 수집 시각 표시 |
| demo `2026-09-06` | 통과 | fixture 빈 결과. 데스크톱·모바일 화면 검사에서 정상 빈 안내 확인 |
| DB 저장·캐시 | 미실행 | 당시 A단계 결과. B단계 SQL·코드 작성 후 실제 Supabase 설정과 통합 검증 대기 |

키 값·키가 포함된 요청 URL·외부 응답 원문은 결과에 포함하지 않았다. fixture 검사 통과를 실제 외부 호출의 근거로 대신하지 않았으며, 실제 호출은 서버 내부 API를 통해 별도로 확인했다.

## 6. B단계 저장·캐시

[마이그레이션 SQL](../supabase/migrations/20261025_box_office_cache.sql)은 ERD의 **세 테이블과 지정된 컬럼만** 만든다. 원본 보관 컬럼·추가 데이터 테이블은 만들지 않는다.

| SQL 부분 | 쉬운 설명 |
| --- | --- |
| `movies` | 영화 코드 하나당 이름과 개봉일을 한 번 저장한다. 같은 제목이라도 코드가 다르면 다른 영화다. |
| `box_office_periods` | 일간/주간/주말과 기준일별로 실제 기간, 정상/빈 상태, 수집·만료 시각을 기억한다. |
| `box_office_results` | 기간과 영화의 조합별 순위·매출·관객·누적값을 담는다. PK/FK로 중복과 부모 없는 실적을 막는다. |
| RLS·권한 철회 | 브라우저의 익명·로그인 역할에 테이블·함수 접근을 주지 않는다. 서버의 비밀키 역할만 두 함수 실행권을 갖는다. |
| `save_box_office_period` | 한 DB 트랜잭션 안에서 영화 → 기간 → 실적 전체 교체와 커밋 전 대조를 수행한다. 중간 오류·대조 불일치면 전부 롤백한다. 같은 키 저장은 advisory transaction lock으로 직렬화하고, 먼저 시작한 느린 요청이 최신 저장본을 덮어쓰지 않도록 시각을 비교한다. |
| `read_box_office_period` | 기간 종류와 기준일로 영화·기간·실적을 묶어 읽는다. `empty` 기간은 실적 0행인 정상 결과로 읽는다. |

요청 흐름은 **입력 검사 → DB 함수 읽기 → 유효하면 즉시 응답 / 없거나 만료됐으면 KOBIS 호출·검증 → DB 함수 한 번 저장 → 다시 읽어 원본 대조 → 응답**이다. 데이터는 수집 완료 후 **24시간**, 정상 빈 결과는 **1시간** 유효하다. 읽기만으로 TTL을 연장하지 않는다. DB 읽기 실패는 `503`과 오류 안내, KOBIS 실패는 `502`/`504`와 재시도 안내이며 만료 데이터를 대신 반환하지 않는다. 저장 실패는 검증된 실제 데이터를 `200`으로 보여주되 `CACHE_WRITE_FAILED` 경고를 표시한다. 저장 성공 후 재조회·대조 실패는 `503`이며 검증되지 않은 저장본을 성공으로 표시하지 않는다.

같은 서버 프로세스의 중복 갱신은 하나로 합친다. 서버 인스턴스 간 동시 **저장**과 늦은 쓰기는 DB 잠금·시각 비교로 보호한다. 시각 비교는 서버와 DB의 시계가 동기화됐다는 전제다. 인스턴스 간 중복 **외부 호출**까지 막는 분산 임대와 요청 제한은 이 세 테이블 제약 아래 아직 구현되지 않았다. 운영 배포 전에 호출량·한도를 별도로 검토해야 한다.

## 7. `verify:data` — 읽기 전용 대조

```text
npm run verify:data -- --date=YYYY-MM-DD --period=daily
```

명령은 DB의 `read_box_office_period`만 호출한다. 저장 당시 KOBIS 응답 중 필요한 원본 필드를 로컬 `.verification-snapshots/`에 Git 제외 파일로 보관하고, 이를 다시 파싱한 값 및 KOBIS에 **한 번 새로** 요청한 값과 각각 저장본을 비교한다. 영화 코드·순위·실적·기간을 확인하며 기존 유효 개봉일이 유지된 경우는 허용한다. DB 저장·수정 함수는 호출하지 않는다.

| 종료 코드 | 의미 |
| --- | --- |
| `0` | 로컬 원본과 새 KOBIS 결과가 모두 저장본과 일치 |
| `1` | 불일치 또는 비교 불가(설정·DB·원본 파일·KOBIS 실패 포함) |
| `2` | DB 읽기는 성공했으나 그 기간의 저장 행이 아직 없음 |

로컬 원본 파일은 개발 환경에서만 생성한다. Vercel의 파일시스템은 이 검증 원본의 영속 저장소가 아니므로, 다른 컴퓨터·서버 인스턴스에서는 원본 파일이 없어 `1`이 나올 수 있다. 세 테이블에 원본 컬럼을 추가하지 않는 조건 아래 이 한계를 숨기지 않는다. KOBIS가 저장 뒤 수치를 수정했다면 두 번째 대조는 불일치로 표시한다.

## 8. Supabase 설정 및 확인 순서

1. **Supabase 프로젝트 준비:** 새 프로젝트의 URL과 서버 전용 secret key를 확인한다. 값을 대화·문서·로그에 붙여 넣지 않는다. [키 보안 안내](https://supabase.com/docs/guides/getting-started/api-keys).
2. **SQL 실행:** Supabase SQL Editor에서 [마이그레이션 파일](../supabase/migrations/20261025_box_office_cache.sql)을 실행한다. 세 테이블·RLS·두 함수·함수 실행권이 생겼는지 대시보드에서 확인한다. SQL은 운영 데이터가 없는 새 프로젝트에서 먼저 적용한다.
3. **로컬 설정:** Git 제외 대상 `.env.local`에 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `KOBIS_API_KEY`를 설정하고 `DATA_MODE=live`로 실행한다. 값 자체는 출력하지 않는다.
4. **연동 확인:** 저장된 적 없는 날짜·기간으로 내부 API를 두 번 조회한다. 첫 응답의 `meta.source=kobis`, 다음 응답의 `meta.source=cache`와 같은 `fetchedAt`·`expiresAt`을 확인한다. 이미 캐시가 있으면 첫 요청부터 `cache`일 수 있다. 그 뒤 위 검증 명령을 실행한다.
5. **데모 회귀 확인:** `DATA_MODE=demo`에서 `2026-09-06`은 정상 빈 응답이고 KOBIS·DB 호출이 없는지 확인한다.

### 2026-10-25 실제 연결 확인

| 검사 | 결과 | 근거 |
| --- | --- | --- |
| live 첫 조회와 재조회 | 통과 | `2026-09-06` 일간 첫 응답 `source=kobis`, 10건. 두 번째 응답 `source=cache`, 10건이며 수집·만료 시각 동일 |
| `verify:data` | 통과 | 같은 날짜에 저장 당시 원본과 KOBIS 새 조회 모두 일치, 종료 코드 `0` |
| 동시 갱신과 후속 캐시 | 통과 | 새 날짜 `2026-09-04`의 동시 두 요청에서 동일한 수집 시각, 후속 요청 `source=cache` |
| 오래된 저장 요청 | 통과 | 2000년 시작 시각의 저장 RPC가 거절되고 기존 기간 저장본이 그대로 유지됨 |
| 저장 중 오류의 롤백 | 통과 | 검증용 기간 `1900-01-01`에 정수 범위 밖 순위를 저장하자 오류가 났고 기간 저장본은 생성되지 않음 |
| demo 회귀 확인 | 통과 | `2026-09-06` 빈 목록 0건, `2026-09-07` 샘플 목록 5건, 둘 다 `source=fixture` |
| FK 제약 직접 위반 검사 | 미실행 | 운영 DB의 테이블 직접 쓰기 권한을 열지 않고 RPC 경로만 검사함. FK는 마이그레이션에서 선언되어 있음 |

위 확인에서 실제 비밀값은 출력하거나 기록하지 않았다. 로컬 원본 파일의 영속성 제한은 앞 절과 같다.
