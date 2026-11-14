# PHOTO SPOT KOREA – Supabase 연결 버전

이 버전은 앱 설치 없이 브라우저 주소로 접속하는 반응형 일반 웹사이트입니다. PC와 스마트폰 브라우저에서 모두 사용할 수 있습니다. 모바일 파일 미리보기에서도 디자인이 유지되도록 핵심 CSS를 HTML 안에 포함했습니다.
- Leaflet + OpenStreetMap 지도
- 현재 지도 화면 안의 공개 OSM 장소 검색(Overpass API)
- 카테고리 필터와 장소명 검색
- Supabase 이메일 회원가입/로그인
- Supabase Database에 장소 등록 및 모든 사용자와 공유
- Supabase Storage에 사진 업로드
- 브라우저 즐겨찾기, 현재 위치, Google 지도 길찾기

## 1. Supabase 프로젝트 만들기
1. https://supabase.com 에서 계정을 만들고 새 프로젝트를 생성합니다.
2. 데이터베이스 비밀번호는 다른 곳에 쓰지 않는 새 비밀번호로 설정하고 안전하게 보관합니다.
3. 프로젝트가 준비되면 Dashboard의 SQL Editor를 엽니다.
4. 이 폴더의 `supabase-schema.sql` 전체 내용을 붙여넣고 Run을 누릅니다.
5. 왼쪽 Authentication > URL Configuration에서 앱 주소를 설정합니다. 로컬 테스트는 `http://localhost:5500` 등을 추가하고, 실제 배포 후에는 배포한 HTTPS 주소를 추가합니다.
6. Authentication > Providers에서 Email이 켜져 있는지 확인합니다. 이메일 확인 설정이 켜져 있으면 가입 후 받은 메일에서 확인해야 로그인할 수 있습니다.

## 2. 앱에 Supabase 주소/키 넣기
1. Dashboard의 Project Settings > API Keys를 엽니다.
2. Project URL과 Publishable key(`sb_publishable_...`)를 복사합니다. 구형 프로젝트라면 `anon` 키를 사용할 수 있습니다.
3. `config.js` 파일을 메모장 또는 VS Code로 엽니다.
4. `YOUR_PROJECT_ID`와 `sb_publishable_REPLACE_ME`를 실제 값으로 바꿉니다.
5. 저장합니다.

**절대 넣으면 안 되는 키:** `service_role`, `sb_secret_...` 등 secret key는 브라우저 파일에 넣지 마세요. 이 프로젝트는 브라우저에서 publishable key만 사용하고, 데이터 접근은 SQL의 RLS 정책으로 제한합니다. 공개 키도 웹사이트에서 보일 수 있으므로 RLS 정책을 삭제하거나 끄지 마세요.

## 3. PC에서 실행하기
1. ZIP 압축을 풉니다.
2. VS Code에서 폴더를 엽니다.
3. Live Server 확장 프로그램을 설치하고 `index.html`에서 우클릭 > Open with Live Server를 선택합니다.
4. 또는 Python이 설치되어 있다면 터미널에서 폴더로 이동한 뒤 `python -m http.server 5500` 실행, 브라우저에서 `http://localhost:5500`을 엽니다.

파일을 더블클릭(`file://`)해서 열지 마세요. 브라우저 보안 기능과 Supabase 인증을 위해 Live Server 또는 HTTPS 웹사이트 주소로 접속해야 합니다.

## 4. 테스트 순서
1. 앱 상단 `로그인 / 가입`에서 이메일로 가입합니다.
2. 이메일 확인이 필요한 경우 받은 메일에서 확인합니다.
3. 로그인합니다.
4. 지도에서 원하는 위치를 눌러 좌표를 선택합니다.
5. 장소명, 종류, 설명을 입력하고 선택적으로 JPG/PNG/WEBP 사진(5MB 이하)을 첨부합니다.
6. 장소 공유하기를 누릅니다.
7. 다른 브라우저나 기기에서 같은 앱을 열면 공개 장소가 나타나는지 확인합니다. 다른 기기 테스트는 HTTPS 배포가 필요할 수 있습니다.

## 5. 무료 플랜의 현실적인 한계
Supabase Free는 현재 안내 기준으로 데이터베이스 500MB, 파일 저장 공간 1GB, 월간 활성 사용자 50,000명 등 무료 할당량이 있습니다. 무료 프로젝트는 일정 기간 활동이 적으면 일시 중지될 수 있고, 자동 백업/고급 지원 등은 유료 플랜과 차이가 있습니다. 한도는 바뀔 수 있으므로 Dashboard의 Usage와 공식 가격 페이지를 확인하세요.
- 사진은 5MB 이하로 제한했지만, 많은 사진을 올리면 1GB를 금방 사용할 수 있습니다.
- 사진은 공개 버킷으로 저장됩니다. 업로드한 사진은 누구나 볼 수 있으므로 공개해도 되는 사진만 올리세요.
- OSM/Overpass 검색은 인터넷 연결이 필요하고, 공개 서버의 속도/요청 제한에 영향을 받습니다.
- OSM 결과는 사진 명소로 검증된 목록이 아닙니다. 이름이 없거나 잘못 분류된 장소가 있을 수 있습니다.
- 즐겨찾기는 현재 기기의 브라우저에만 저장됩니다.
- 회원가입 이메일 발송은 기본 이메일 설정/제한에 영향을 받을 수 있습니다. 대규모 서비스라면 SMTP 설정 등 추가 운영 작업이 필요합니다.

## 6. 아직 추가해야 할 운영 기능
- 장소 신고/관리자 검수 및 중복 장소 병합
- 계정 간 즐겨찾기 동기화
- 사진 EXIF 위치정보 제거 및 이미지 압축
- 사용자 프로필/비밀번호 재설정 화면
- 개인정보 처리방침, 이용약관, 신고/삭제 요청 처리
- 실제 배포 도메인 및 웹사이트 파비콘/브랜딩 정리
- 사진 업로드 전 권리/초상권 확인 안내 강화

## 공식 문서
- Supabase 가격: https://supabase.com/pricing
- Supabase API 키: https://supabase.com/docs/guides/getting-started/api-keys
- Supabase JavaScript Auth: https://supabase.com/docs/reference/javascript/auth
- Supabase Storage: https://supabase.com/docs/guides/storage


## 모바일에서 디자인이 기본 글꼴/버튼처럼 보일 때
이 버전은 CSS를 `index.html` 안에 포함해 상대 경로 문제를 줄였습니다. 다만 Android 파일 미리보기(`content://`)는 JavaScript 모듈/외부 지도 라이브러리 요청을 제한할 수 있습니다. 지도와 로그인까지 정상 사용하려면 GitHub Pages 또는 Cloudflare Pages에 배포한 HTTPS 주소로 접속하세요.
