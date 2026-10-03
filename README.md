# Badaya Field

BadayaTravel 두바이 법인 현장용 웹앱입니다. 가이드가 휴대폰으로 투어 고객의 옵션 주문서를 쓰고, 현금 수금과 지출을 기록하면 사무실과 다른 직원 화면에 바로 반영됩니다. 마지막에 기존 엑셀 양식(CC 시트, PROJECT SETTLEMENT)과 같은 방식으로 정산합니다.

## 화면 구성

| 화면 | 하는 일 | 기존 엑셀과의 관계 |
|---|---|---|
| 투어 목록 | 진행중 투어, 오늘 수금액, 미수금 합계, 최근 기록 | 새로 추가 |
| 주문서 | 고객별 옵션을 눌러서 선택. 현금 / 선결제 / 홈쇼핑 / 보상 구분. 카드 보기와 엑셀 같은 표 보기 | Cash Collection(CC) 시트 |
| 수금 | 고객별 받을 돈, 받은 돈, 미수금. 수금 기록(현금·카드·계좌이체) | 새로 추가 (실시간 수금 관리) |
| 지출 | 팁, 커미션, 보상, 가이드 대납, 크루즈팁, 계좌이체·환전 | TOUR EXPENSES (C) |
| 정산 | A 회사에서 받은 돈, B 판매, C 지출, D 카드·이체 수금, E 보유 현금(권종별로 세기), F = A+B−C−D, 편차 = E−F, 재무팀·대표 확인 | Settlement of Accounts |
| 요약 | 상품별 신청 인원, 현금 인원, 금액, 총 옵션 수(결합상품 2개), 엑셀 내려받기 | CC 시트 하단 합계 |
| 상품 | 지역별 상품과 가격 관리(관리자). 가격을 바꿔도 이미 입력된 주문 가격은 유지 | 관리자 페이지 |

## 두 가지 모드

- **체험 모드**(기본): `js/config.js`가 비어 있으면 데이터가 그 기기 브라우저에만 저장됩니다. 화면과 흐름을 시험해 보는 용도입니다.
- **운영 모드**: Supabase(무료 요금제로 시작 가능)를 연결하면 로그인한 모든 직원이 같은 데이터를 실시간으로 봅니다. 인터넷이 끊겨도 입력은 기기에 보관했다가 연결되면 자동으로 보냅니다.

## 운영 시작 방법

1. https://supabase.com 에서 회사 계정으로 가입하고 새 프로젝트를 만듭니다. 지역은 가까운 곳(예: Mumbai 또는 Frankfurt)을 고르세요.
2. 왼쪽 메뉴 **SQL Editor**에 `supabase/schema.sql` 내용을 붙여넣고 **Run**을 누릅니다.
3. **Authentication → Users → Add user**에서 직원 계정(이메일, 비밀번호)을 만듭니다. Authentication → Sign In / Providers 에서 'Allow new users to sign up'은 꺼 두세요(아무나 가입하지 못하게).
4. 대표님 계정을 관리자로 바꿉니다. `schema.sql` 맨 아래 주석의 `update ... role = 'admin'` 줄에서 이메일만 바꿔 SQL Editor에서 실행합니다.
5. **Project Settings → API**의 Project URL과 anon public key를 `js/config.js`에 넣습니다. (anon key는 앱에 들어가도 되는 공개용 키입니다. service_role 키는 절대 넣지 마세요.)
6. 이 폴더를 그대로 무료 호스팅에 올립니다. 아래 중 하나면 됩니다.
   - **Cloudflare Pages** 또는 **Netlify**: 폴더를 끌어다 놓으면 `badaya.pages.dev` / `badaya.netlify.app` 같은 주소가 생깁니다.
   - **GitHub Pages**: 저장소에 올리고 Settings → Pages 를 켭니다.
7. 직원들은 그 주소를 휴대폰으로 열고 **홈 화면에 추가**(아이폰 Safari: 공유 → 홈 화면에 추가 / 안드로이드 Chrome: ⋮ → 앱 설치)하면 앱처럼 씁니다.

파일을 고쳐서 다시 올릴 때는 `sw.js` 맨 위 `VERSION`을 올려야 직원 휴대폰에 새 버전이 바로 반영됩니다.

## 도메인과 앱 배포

- 도메인은 없어도 됩니다. 위 무료 주소로 HTTPS가 자동으로 붙고, 홈 화면 설치·오프라인 저장 모두 동작합니다.
- 나중에 `badayatravel.com` 같은 도메인을 사면(연 1~2만 원대) 호스팅 설정에서 연결만 하면 됩니다. 코드는 바꿀 필요가 없습니다.
- 앱스토어·플레이스토어 앱이 필요해지면 같은 코드를 Capacitor로 감싸 배포할 수 있습니다. 이때 Apple 개발자 계정(연 $99), Google Play 개발자 계정($25, 1회)과 심사가 필요합니다. 직원 전용 내부 도구라면 홈 화면 설치로 충분한 경우가 많습니다.

## 파일 구조

```
index.html             앱 화면 뼈대
css/app.css            디자인
js/app.js              화면과 동작
js/calc.js             엑셀과 같은 계산 규칙 (판매, 미수, 정산, 편차)
js/store.js            데이터 저장·실시간 동기화 (체험 모드 / Supabase)
js/seed.js             기본 상품표, 체험용 예시 데이터
js/excel.js            엑셀 내려받기
js/config.js           Supabase 연결 정보
supabase/schema.sql    서버 테이블·권한·실시간 설정
sw.js, manifest.webmanifest, icons/   휴대폰 설치(PWA)용
tools/build-demo.py    claude.ai 체험 페이지 생성
```

## 아직 확인이 필요한 것

- 이집트 Tour Expense 는 투어마다 €90 / €100 중에서 고릅니다(투어 만들기·수정 화면). 다른 상품도 상품 화면의 ‘투어별 요금 선택지’에 값을 넣으면 같은 방식으로 쓸 수 있습니다.
- Cruise Tips 처럼 통화가 다른 항목은 자기 통화로 따로 합산·정산되고, 엑셀 정산서에서도 그 통화 칸에만 들어갑니다.
- 두바이 상품 가격은 직원 HTML 시안의 값을 옮긴 것입니다. 실제 가격과 다르면 상품 화면에서 고치세요.
- 화폐는 EUR, USD, KRW, AED, EGP 를 지원하며 환율 환산은 하지 않고 통화별로 따로 정산합니다(기존 엑셀과 같음).
