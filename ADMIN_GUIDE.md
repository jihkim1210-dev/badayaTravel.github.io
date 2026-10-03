# Badaya Field 관리자 가이드

앱을 관리하는 사람(사무실·관리자)을 위한 문서입니다. 직원용 사용법은 [README.md](README.md)에 있습니다.

## 0. 현재 구성 요약

| 구성 | 사용하는 서비스 | 위치 |
|---|---|---|
| 앱 화면(웹사이트) | GitHub Pages (무료) | https://jihkim1210-dev.github.io/badayaTravel.github.io/ |
| 코드 저장소 | GitHub | https://github.com/jihkim1210-dev/badayaTravel.github.io (main 브랜치) |
| 데이터베이스·로그인·실시간 | Supabase (무료 플랜으로 시작) | 프로젝트 `mipjjuinhcinmswumtay` (https://supabase.com/dashboard) |

동작 방식: 직원 휴대폰의 앱이 GitHub Pages에서 화면 파일을 받고, 데이터는 Supabase와 직접 주고받습니다. GitHub Pages에는 데이터가 저장되지 않습니다. **고객 정보와 금액은 모두 Supabase에만 있습니다.**

---

## 1. 파일 구조

빌드 과정이 없는 순수 HTML/CSS/JavaScript입니다. 파일을 고쳐서 GitHub에 올리면 그대로 반영됩니다.

```
index.html               앱 화면 뼈대 (상단바, 하단 탭)
manifest.webmanifest     홈 화면 설치 정보 (앱 이름, 아이콘, 색)
sw.js                    오프라인용 캐시. 배포할 때마다 VERSION 올리기
.nojekyll                GitHub Pages가 파일을 가공하지 않게 하는 빈 파일 (지우지 말 것)
css/app.css              디자인 (색, 글꼴, 레이아웃). 맨 위 :root 에 색상값 모음
js/config.js             Supabase 주소와 공개 키. 비우면 체험 모드
js/app.js                화면과 버튼 동작 전체
js/calc.js               계산 규칙: 통화, 지역, 투어 코드, 권종, 주문 상태, 지출 항목, 정산 공식
js/store.js              데이터 저장과 실시간 동기화 (체험 모드 / Supabase, 오프라인 대기열)
js/seed.js               체험 모드용 기본 상품표와 예시 투어
js/excel.js              엑셀 내려받기 (CC, 정산서, 수금 내역, 지출 내역 시트)
icons/                   앱 아이콘 (svg, 192px, 512px png)
supabase/schema.sql      데이터베이스 테이블, 권한, 실시간 설정, 기본 상품표
tools/build-demo.py      claude.ai 체험판 페이지를 만드는 보조 스크립트 (운영과 무관)
README.md                직원용 사용 설명서
ADMIN_GUIDE.md           이 문서
```

### 자주 고치는 곳

| 바꾸고 싶은 것 | 파일 | 위치 |
|---|---|---|
| 투어 기간 코드 목록 | `js/calc.js` | `TOUR_CODES` |
| 지출 항목 목록 | `js/calc.js` | `EXPENSE_CATEGORIES` |
| 지출 장소 목록 | `js/calc.js` | `EXPENSE_PLACES` |
| 지폐 권종 | `js/calc.js` | `DENOMS` |
| 지역 추가 (예: 요르단) | `js/calc.js` | `REGIONS`에 `JORDAN: { label: '요르단', currency: 'USD' }` 추가 |
| 앱 색상 | `css/app.css` | 맨 위 `:root` (밝은 화면), 바로 아래 두 블록 (어두운 화면) |
| 상품·가격 | 코드 수정 불필요 | 앱의 **상품** 탭에서 관리자가 직접 수정 |

### 데이터베이스 테이블 (Supabase → Table Editor에서 볼 수 있음)

| 테이블 | 내용 |
|---|---|
| `profiles` | 앱 사용자 이름과 권한(`staff` / `admin`) |
| `products` | 상품: 지역, 이름, 가격, 통화, 결합상품 여부(`units`=2), 투어별 요금 선택지(`rates`), 표시 여부 |
| `tours` | 투어: BDY, 지역, 기간 코드, 출발일, 가이드, 상태, 투어별 요금(`prices`), 회사에서 받은 돈, 보유 현금 권종, 비고, 확인자 |
| `passengers` | 고객: 투어, 그룹, 한글·영문 이름, 호칭, 특이사항 |
| `orders` | 주문: 고객 × 상품, 상태(cash/prepaid/homeshop/comp), **주문 당시 가격과 통화** |
| `payments` | 수금: 고객(없으면 공통), 통화, 금액, 방법, 메모, 입력자, 시각 |
| `expenses` | 지출: 구분(expense/transfer), 장소, 항목, 통화, 금액, 메모, 입력자, 시각 |

---

## 2. 일상 운영

### 2-1. 직원 계정 추가

1. Supabase 대시보드 → **Authentication → Users → Add user → Create new user**
2. 이메일과 비밀번호를 입력하고 **Auto Confirm User**를 체크한 뒤 만들기
3. 직원에게 앱 주소, 이메일, 비밀번호를 전달 (README.md 1장을 같이 보내면 됩니다)

새 계정은 자동으로 **직원(staff)** 권한이 되고, 앱에 보이는 이름은 이메일 @ 앞부분입니다.

**이름 바꾸기** (SQL Editor에서 실행):
```sql
update public.profiles set name = '김가이드'
where id = (select id from auth.users where email = 'guide1@example.com');
```

**관리자로 지정·해제**:
```sql
-- 관리자로
update public.profiles set role = 'admin'
where id in (select id from auth.users where email in ('a@example.com', 'b@example.com'));
-- 다시 직원으로
update public.profiles set role = 'staff'
where id = (select id from auth.users where email = 'a@example.com');
```

현재 사용자와 권한 확인:
```sql
select u.email, p.name, p.role from auth.users u left join public.profiles p on p.id = u.id order by u.created_at;
```

### 2-2. 퇴사자·분실 휴대폰

- **Authentication → Users**에서 해당 사용자의 ⋯ 메뉴 → **Delete user**. 그 사람의 휴대폰에서는 다음 접속부터 데이터를 읽거나 쓸 수 없습니다.
- 그 사람이 입력한 수금·지출 기록은 지워지지 않습니다(입력자 이름이 글자로 남아 있습니다).
- 휴대폰을 잃어버렸다면 바로 계정을 삭제하고, 필요하면 같은 이메일로 새로 만드세요.

### 2-3. 비밀번호 재설정

앱에는 비밀번호 찾기 화면이 없습니다. 가장 간단한 방법은 **사용자를 삭제하고 같은 이메일로 새 비밀번호를 넣어 다시 만드는 것**입니다. 새로 만들면 권한이 직원으로 돌아가므로 이름과 권한을 2-1의 SQL로 다시 지정하세요. 기존 기록에는 영향이 없습니다.

### 2-4. 상품·가격 관리

앱 **상품** 탭에서 관리자 계정으로 합니다.

- **가격 변경**: 상품을 눌러 가격만 고치면 됩니다. 이미 입력된 주문은 입력 당시 가격이 유지되고, 새로 누르는 주문부터 새 가격이 적용됩니다.
- **투어마다 요금이 다른 상품**(예: Tour Expense €90 / €100): ‘투어별 요금 선택지’에 `90, 100`처럼 적으면, 투어를 만들 때 고르게 됩니다.
- **결합상품**: 옵션 수를 2개로 세는 상품(피라미드 + 박물관 등)에 체크합니다.
- **판매 중단**: 삭제 대신 ‘주문서에 표시’를 끄세요. 주문에 한 번이라도 쓰인 상품은 삭제할 수 없습니다.

### 2-5. 정산 확인 흐름

1. 가이드가 **정산 제출** → 투어 목록 ‘정산 제출’ 필터에 모입니다.
2. 사무실에서 투어를 열어 **정산** 탭 확인 → **재무팀 확인**, **대표 확인**
3. **정산 완료** → 투어가 잠깁니다(서버에서도 잠겨서 직원은 수정할 수 없음).
4. **요약 → 엑셀로 내려받기**로 보관용 파일을 받아 회사 드라이브에 저장하세요.

### 2-6. 데이터 백업

- **무료 플랜에는 자동 백업이 없습니다.** 정산 완료한 투어는 엑셀로 내려받아 보관하세요.
- 전체 데이터를 한 번에 받으려면 Supabase → **Table Editor**에서 테이블마다 **Export → CSV**를 누릅니다.
- 실제 운영을 시작하면 **Pro 플랜(월 $25)** 을 권장합니다. 매일 자동 백업(7일 보관)이 되고, 아래 일시정지도 없습니다.

### 2-7. 무료 플랜 일시정지

Supabase 무료 프로젝트는 **7일 동안 아무도 쓰지 않으면 일시정지**됩니다. 그러면 앱이 ‘서버에 연결하지 못했습니다’ 또는 ‘연결 중’에서 멈춥니다. 대시보드에서 프로젝트를 열고 **Restore project**를 누르면 몇 분 뒤 다시 동작합니다. 데이터는 지워지지 않습니다.

### 2-8. 사용량 한도 (무료 플랜)

데이터베이스 500MB, 동시 실시간 연결 200개 수준입니다(한도는 바뀔 수 있음). 투어 한 건(고객 40명, 옵션·수금·지출 포함)이 수십 KB 정도라 한 해 수천 투어도 여유 있습니다. 정확한 한도는 Supabase 요금 페이지에서 확인하세요.

---

## 3. 앱 수정·배포

### 3-1. 수정하는 방법

- **간단한 수정**: GitHub 저장소에서 파일을 열고 연필(✎) 아이콘 → 수정 → **Commit changes**
- **여러 파일 수정**: 저장소를 내려받아(Code → Download ZIP 또는 git clone) 고친 뒤, **Add file → Upload files**로 올리거나 git push
- Claude에게 수정을 요청해도 됩니다(이 프로젝트에 저장소가 연결되어 있습니다).

### 3-2. 배포할 때 꼭 할 것

1. **`sw.js` 맨 위 `VERSION`을 올리기** (예: `badaya-v3` → `badaya-v4`). 안 올리면 직원 휴대폰에 예전 화면이 남아 있을 수 있습니다.
2. 커밋하면 1~2분 뒤 GitHub Pages에 자동 반영됩니다. 진행 상황은 저장소의 **Actions** 탭 ‘pages build and deployment’에서 확인합니다(초록 체크 = 완료).
3. 직원들에게 앱을 완전히 닫았다가 다시 열라고 알려주세요.

### 3-3. 데이터베이스 구조를 바꿀 때

`supabase/schema.sql`은 **여러 번 실행해도 안전**하게 만들어져 있습니다(이미 있는 테이블·상품은 건드리지 않고 없는 것만 추가). 코드 변경과 함께 schema.sql이 바뀌었다면 SQL Editor에서 새 내용을 다시 실행하세요.

### 3-4. Supabase 연결 정보 (`js/config.js`)

- `SUPABASE_URL`: `https://프로젝트ID.supabase.co` (뒤에 `/rest/v1` 등 붙이지 않음)
- `SUPABASE_ANON_KEY`: Project Settings → API Keys의 **anon public** 키(또는 publishable 키)
- 이 두 값은 웹사이트에 공개되는 값이라 GitHub에 올라가도 괜찮습니다. 누가 이 값을 알아도 **로그인한 회사 계정이 아니면 데이터를 볼 수 없습니다**(schema.sql의 권한 규칙).
- **`service_role` / `secret` 키는 절대 이 파일이나 GitHub, 메신저에 넣지 마세요.** 그 키는 모든 권한 규칙을 무시합니다.

### 3-5. 보안 점검 목록

- [ ] Supabase → Authentication → Sign In / Providers → **Allow new users to sign up** 끄기 (아무나 가입하지 못하게)
- [ ] 관리자 계정은 꼭 필요한 사람만
- [ ] 퇴사자 계정 즉시 삭제
- [ ] Supabase 조직에 대표님을 Owner로 추가 (계정 접근이 한 사람에게만 묶이지 않도록)
- [ ] 저장소는 공개(public)입니다. 코드에는 고객 정보가 없지만, **고객 명단이나 엑셀 파일을 저장소에 올리지 마세요.**

---

## 4. 도메인

### 4-1. 지금은 필요 없음

현재 주소(`jihkim1210-dev.github.io/badayaTravel.github.io/`)로도 HTTPS, 홈 화면 설치, 오프라인 모두 동작합니다. 도메인은 주소를 짧고 회사답게 만드는 용도입니다.

**무료로 주소만 짧게**: GitHub 저장소 Settings → General → Repository name을 `badaya`로 바꾸면 주소가 `jihkim1210-dev.github.io/badaya/`가 됩니다. 이미 홈 화면에 추가한 직원은 새 주소로 다시 추가해야 하고, 로그인도 다시 해야 합니다.

### 4-2. 도메인을 살 때

1. 도메인 구입: Cloudflare Registrar, Namecheap, 가비아 등 (`.com` 연 1~2만 원대)
2. 앱 전용 하위 주소를 쓰는 것을 권장합니다. 예: `app.badayatravel.com`
   - 도메인 관리 화면(DNS)에서 레코드 추가: 종류 **CNAME**, 이름 `app`, 값 `jihkim1210-dev.github.io`
3. GitHub 저장소 Settings → Pages → **Custom domain**에 `app.badayatravel.com` 입력 → Save
4. 확인이 끝나면(수 분~수 시간) **Enforce HTTPS** 체크
5. 새 주소는 `https://app.badayatravel.com/`이 됩니다. 코드 수정은 필요 없습니다.
6. 직원들은 새 주소로 다시 홈 화면에 추가하고 로그인합니다(주소가 바뀌면 휴대폰에 저장된 로그인·대기 데이터가 따로 관리되므로, **바꾸기 전에 모든 직원의 ‘대기 N건’이 0인지 확인**하세요).

회사 홈페이지를 `badayatravel.com`에서 따로 운영할 계획이면, 앱은 위처럼 `app.` 하위 주소에 두는 것이 깔끔합니다.

---

## 5. 앱스토어·플레이스토어 배포

### 5-1. 선택지 비교

| 방법 | 비용 | 장점 | 단점 |
|---|---|---|---|
| **홈 화면 추가 (현재)** | 무료 | 바로 사용, 수정 즉시 반영, 심사 없음 | 스토어 검색 불가, 아이폰은 Safari로 추가해야 함 |
| **안드로이드 앱 (TWA)** | Google Play 등록비 $25 (1회) | 지금 웹앱을 그대로 감싸서 Play 스토어 배포. 수정은 웹에만 하면 됨 | **자체 도메인 필요**(github.io 하위 경로로는 연결 확인 파일을 둘 수 없음) |
| **안드로이드 APK 직접 배포** | 무료 | 스토어 없이 파일로 설치 | 직원이 ‘출처를 알 수 없는 앱’ 허용 필요, 업데이트 관리 번거로움 |
| **iOS 앱 (Capacitor)** | Apple Developer 연 $99 + Mac 필요 | 앱스토어 배포 | 심사, 업데이트마다 재심사. 단순 웹 포장 앱은 반려될 수 있음 |
| **iOS 사내 배포** | Apple Developer 연 $99 | TestFlight(빌드 90일마다 갱신) 또는 Apple Business Manager로 직원만 설치 | 설정 절차가 많음 |

**권장**: 직원 전용 도구이므로 당분간은 **홈 화면 추가**로 운영하고, 안드로이드 스토어 배포가 필요해지면 도메인을 산 뒤 TWA로 진행하는 순서가 가장 비용이 적습니다.

### 5-2. 안드로이드 앱 만들기 (도메인 구입 후)

1. https://www.pwabuilder.com 에 앱 주소 입력 → **Package for stores → Android**
2. 패키지 이름 예: `com.badayatravel.field` 로 생성 → `.aab`(스토어용), `.apk`(직접 설치용), `assetlinks.json` 파일을 받음
3. `assetlinks.json`을 저장소에 `.well-known/assetlinks.json` 경로로 올림 (자체 도메인 루트에서 열려야 함)
4. Google Play Console(개발자 등록 $25)에서 앱 만들기 → `.aab` 업로드 → 내부 테스트 또는 비공개 테스트 트랙으로 직원에게만 배포 가능
5. 이후 기능 수정은 웹 파일만 고치면 앱에도 자동 반영됩니다. 앱 아이콘·이름을 바꿀 때만 새 `.aab`를 올립니다.

### 5-3. iOS 앱 (필요할 때)

Capacitor(https://capacitorjs.com)로 이 폴더를 감싸 Xcode 프로젝트를 만들고 App Store Connect로 올립니다. Mac과 Apple Developer 계정이 필요하고, 심사 기준상 ‘웹사이트를 그대로 담은 앱’은 반려될 수 있어 오프라인 기능·푸시 알림 같은 앱 고유 기능을 함께 넣는 것이 일반적입니다. 직원 전용이라면 TestFlight나 Apple Business Manager의 사내 배포를 먼저 검토하세요.

---

## 6. 문제 해결

| 증상 | 원인과 조치 |
|---|---|
| 앱에 ‘체험 모드’가 표시됨 | `js/config.js`의 두 값이 비어 있음 → 3-4대로 채우고 배포 |
| ‘서버에 연결하지 못했습니다’ | Supabase 프로젝트 일시정지(2-7), 또는 `config.js` URL 오타 |
| 로그인이 안 됨 | 이메일·비밀번호 확인, 사용자 생성 시 Auto Confirm 체크 여부 확인 |
| 로그인은 되는데 목록이 비어 있고 저장도 안 됨 | schema.sql을 실행하지 않았거나 일부만 실행됨 → 전체를 다시 실행 |
| ‘저장 실패: … row-level security …’ | 권한 없는 작업(직원이 상품 수정, 정산 완료 투어 수정 등). 정상 동작 |
| 다른 직원 화면에 바로 안 바뀜 | 상단이 ‘실시간 연결’인지 확인. schema.sql 마지막의 실시간 설정 부분이 실행됐는지 확인(Database → Publications → supabase_realtime에 7개 테이블) |
| 수정한 내용이 휴대폰에 안 보임 | `sw.js` VERSION을 올렸는지 확인 → 앱 완전히 종료 후 재실행 |
| 직원 휴대폰에 ‘대기 N건’이 계속 남음 | 인터넷 연결 확인. 계속 남으면 그 휴대폰에서 설정 화면을 캡처해 Claude에게 전달 |

## 7. 현재 하지 않는 것 (향후 추가 후보)

- 기존 CCF·정산서 엑셀 파일 불러오기
- 앱 안에서 비밀번호 찾기·변경
- 통화 간 환율 환산 (지금은 통화별로 따로 정산)
- 투어별 담당자 지정 (지금은 로그인한 직원 누구나 모든 투어를 보고 입력)
- 기간별·가이드별 매출 통계
