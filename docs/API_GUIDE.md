# KOBIS 박스오피스 API 연동 가이드

상태: A단계 — KOBIS 호출 → 검증 → 내부 API 응답. DB 저장·공유 캐시는 B단계.

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

## 2. 응답 필드 → 내부 데이터·향후 DB 컬럼

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

요청의 `type`·`date`는 향후 `box_office_periods.period_type`·`target_date`로, 응답 `showRange`는 `range_start`·`range_end`로 대응한다. A단계는 이를 **응답에만 담고 저장하지 않는다**. `fetchedAt`은 성공적으로 검증한 시각, `source`는 `kobis`, `cachePersisted`는 `false`, `expiresAt`은 `null`이다. `DATA_MODE=demo`의 출처는 `fixture`이며 실제 수집 시각은 없다.

## 3. 실패 분류와 내부 HTTP 코드

| 상황 | 내부 코드 | HTTP | 처리 |
| --- | --- | --- | --- |
| 내부 날짜·기간·데모 전용 파라미터 오류 | `INVALID_INPUT` | `400` | 외부 호출하지 않음 |
| `.env.local`에서 서버 키를 읽을 수 없음 | `KOBIS_CONFIG` | `503` | 설정 안내만 반환, 키 이름 외 값 비공개 |
| KOBIS 네트워크 오류·비정상 HTTP·리다이렉트 | `KOBIS_UPSTREAM` | `502` | 원문/URL을 반환하거나 로그에 남기지 않음 |
| 외부 호출 5초 초과 | `KOBIS_TIMEOUT` | `504` | 요청 중단, 수동 재시도 안내 |
| JSON 파싱 실패·오류 객체·필수 구조/값/기간 불일치 | `KOBIS_INVALID_RESPONSE` | `502` | 성공/빈 응답으로 위장하지 않음 |

실패 응답은 `{ "error": { "code": "...", "message": "안전한 안내" } }`이다. 정상 응답은 `{ "data": { "status": "data|empty", "items": [...] }, "meta": { "date", "type", "rangeStart", "rangeEnd", "source", "fetchedAt", "expiresAt", "cachePersisted", "generatedAt" } }`이다. API 응답과 외부 fetch에 `no-store`를 적용한다. 이번 단계에서는 DB 캐시·요청 제한·서버 간 중복 갱신 방지가 없으므로 배포 준비 완료로 판단하지 않는다.

## 4. 저장 전 검증 순서

1. 내부 요청의 날짜가 실제 달력 날짜이고 한국 시간 기준 미래가 아닌지, `type`이 세 값 중 하나인지 검사한다.
2. KOBIS 응답이 객체이고 `boxOfficeResult`·`boxofficeType`·유형별 목록 배열·`showRange`가 있는지 검사한다. 외부 오류 객체와 정상 빈 목록을 구분한다.
3. `showRange` 양쪽 날짜의 형식·실재·순서를 검사한다. 일간은 요청 날짜와 일치해야 한다.
4. 모든 행의 영화 코드·제목·순위·개봉일·네 수치가 계약에 맞는지 확인한다. 같은 목록의 `movieCd` 중복을 거절한다.
5. 숫자는 문자열의 정수 형식부터 확인하고 `bigint`로 변환해 signed 64비트 DB 범위를 검사한다. 순위는 양의 안전 정수이며 DB `integer` 범위를 검사한다. 빈 문자열·소수·숫자 아닌 값·범위 초과를 0으로 대체하지 않는다. 부호 허용 정책은 공식 계약/실제 조정 사례 확인 전 임의로 좁히지 않는다.
6. 검증된 데이터만 순위순으로 정렬해 JSON에 십진 문자열로 보낸다. B단계에서만 트랜잭션 저장과 저장본 대조를 추가한다.

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
| DB 저장·캐시 | 범위 밖 | B단계에서 구현·검증 |

키 값·키가 포함된 요청 URL·외부 응답 원문은 결과에 포함하지 않았다. fixture 검사 통과를 실제 외부 호출의 근거로 대신하지 않았으며, 실제 호출은 서버 내부 API를 통해 별도로 확인했다.
