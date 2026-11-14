# PHOTO SPOT KOREA · 개인용 웹사이트 v3

기존 사이트를 바탕으로 개인 사진 지도 + 여행 일기 + 사진 명소 탐색 탭으로 바꾼 버전입니다. 앱 설치 없이 GitHub Pages에서 일반 웹사이트로 사용할 수 있습니다.

## 이번 버전의 기능

- **가고 싶은 곳:** 개인 장소 저장, 태그/메모, 지도 표시, 방문 완료 처리
- **다녀온 곳:** 날짜별 여행 일기, 태그, 사진 업로드, 지도 표시
- **사진 명소:** 서울·수도권 중심의 시작 명소 목록, 지역/이름 검색, 태그 필터, 지도 표시
- **계정 동기화:** 같은 Supabase 계정으로 로그인하면 PC와 태블릿에서 같은 개인 기록을 확인
- **개인정보:** 개인 장소와 일기는 로그인한 본인만 읽고 수정할 수 있도록 RLS 적용
- **일기 사진:** `private-diary` 비공개 Storage bucket에 저장하고 로그인 사용자에게만 임시 URL 제공

## 중요: 기존 설정 파일 보존

이 ZIP에는 `config.js`를 넣지 않았습니다. 기존 GitHub 저장소의 실제 `config.js` 파일을 그대로 유지하세요. 이 파일을 실수로 덮어쓰지 않도록 주의하세요. 새로 만들어야 한다면 `config.example.js`를 복사해 `config.js`로 이름을 바꾼 뒤 기존 Supabase `SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY` 값을 입력하세요.

브라우저에 넣으면 안 되는 키: `service_role`, `sb_secret_...` 등 비밀 키. `sb_publishable_...` 또는 프로젝트의 `anon` 공개 키만 사용합니다.

## Supabase 마이그레이션

1. Supabase Dashboard → SQL Editor를 엽니다.
2. `supabase-migration.sql` 전체를 붙여넣고 Run을 누릅니다.
3. 실행 후 Table Editor에서 `my_places`, `diary_entries`, `photo_spots`가 생성됐는지 확인합니다.
4. Storage → Files에서 `private-diary` 버킷이 생성됐는지 확인합니다.

**기존 데이터 보존:** 이 SQL은 기존 `spots` 테이블이나 `spot-photos` 버킷을 삭제하지 않습니다. 기존 `spots`의 본인 소유 데이터는 `photo_spots`에 중복 없이 복사됩니다. 기존 31개 장소를 포함해 이름이 중복되지 않는 데이터가 들어갑니다. 기존 `spots`는 본인 계정만 읽도록 RLS를 바꿉니다.

기존 `spot-photos` 버킷은 이번 마이그레이션에서 비공개로 전환됩니다. 따라서 예전에 저장된 공개 사진 URL은 더 이상 바로 열리지 않을 수 있습니다. 기존 사진 파일 자체는 삭제하지 않으며, 본인 계정 폴더의 사진만 읽을 수 있도록 제한합니다. 새 일기 사진도 별도의 비공개 저장소에 저장됩니다.

## GitHub에 반영하기

1. 먼저 GitHub 저장소에서 현재 파일을 백업하거나 ZIP으로 내려받으세요.
2. 이 ZIP의 `index.html`, `app.js`, `styles.css`, `icon.svg`, `supabase-migration.sql`, `README.md`를 저장소 루트에 올려 기존 파일을 교체합니다.
3. `config.js`는 기존 프로젝트 URL/Publishable key가 들어 있는 파일을 유지하거나, 위에서 설명한 대로 값을 복사하세요.
4. Supabase에서 Authentication → Settings의 신규 회원가입 허용 설정을 끄면, 기존 계정 로그인만 가능한 개인용 사이트로 운영할 수 있습니다.
5. GitHub 저장소의 Settings → Pages에서 `main` 브랜치, `/(root)`가 선택되어 있는지 확인합니다.
6. 몇 분 후 GitHub Pages 주소를 새로고침합니다.

## 테스트 순서

1. 로그인합니다.
2. 가고 싶은 곳 → 장소 저장 → 지도에서 위치 선택 → 저장.
3. 다른 기기에서 같은 계정으로 로그인해 장소가 보이는지 확인.
4. 다녀온 곳 → 일기 쓰기 → 방문 날짜/사진/태그/기록 입력 → 지도에서 위치 선택 → 저장.
5. 사진 명소에서 지역과 태그로 검색하고, 가고 싶은 곳에 저장합니다.

## 사진 명소 데이터의 한계

처음 제공되는 명소는 서울·수도권 중심의 기본 목록입니다. 인스타그램·블로그의 모든 게시물을 실시간으로 자동 수집하는 기능은 아닙니다. 각 플랫폼의 접근 제한과 게시물 권리 문제 때문에 모든 게시물을 자동 복제할 수는 없습니다. 공개적으로 확인할 수 있는 장소를 관리자가 목록에 추가하는 방식으로 확장할 수 있습니다. 장소 좌표는 지도 표시용 근사값이므로 방문 전 운영 시간, 출입 가능 여부, 촬영 제한을 확인하세요.

## 기술

- HTML / CSS / JavaScript
- Leaflet + OpenStreetMap
- Supabase Auth / Database / Storage
- GitHub Pages
