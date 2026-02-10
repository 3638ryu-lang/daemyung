# 대명한의원 웹사이트 - 카카오맵 설정 안내

## 📍 카카오맵 API 키 설정 방법

현재 웹사이트의 "찾아오시는 길" 지도가 카카오맵으로 설정되어 있습니다.
지도를 정상적으로 표시하려면 카카오 개발자 계정에서 API 키를 발급받아야 합니다.

### 1단계: 카카오 개발자 계정 만들기

1. https://developers.kakao.com 접속
2. 카카오 계정으로 로그인
3. 우측 상단 "내 애플리케이션" 클릭
4. "애플리케이션 추가하기" 클릭
5. 앱 이름 입력 (예: "대명한의원 홈페이지")
6. 저장

### 2단계: JavaScript 키 복사하기

1. 생성한 앱 클릭
2. 좌측 메뉴에서 "앱 키" 선택
3. **JavaScript 키** 복사 (예: 1234567890abcdef1234567890abcdef)

### 3단계: 웹사이트에 키 적용하기

`index.html` 파일을 열어서 다음 부분을 찾습니다:

```html
<script type="text/javascript" src="//dapi.kakao.com/v2/maps/sdk.js?appkey=YOUR_KAKAO_APP_KEY"></script>
```

**YOUR_KAKAO_APP_KEY** 부분을 복사한 JavaScript 키로 교체합니다:

```html
<script type="text/javascript" src="//dapi.kakao.com/v2/maps/sdk.js?appkey=1234567890abcdef1234567890abcdef"></script>
```

### 4단계: 플랫폼 등록하기

1. 카카오 개발자 페이지의 앱 설정에서 "플랫폼" 클릭
2. "Web 플랫폼 등록" 클릭
3. 사이트 도메인 입력
   - 로컬 테스트: `http://localhost`
   - 실제 도메인: `https://www.daemyungclinic.com` (예시)
4. 저장

### 5단계: 확인하기

웹사이트를 열어서 "찾아오시는 길" 섹션의 지도가 정상적으로 표시되는지 확인합니다.

---

## 🗺️ 지도 정보

- **주소**: 서울특별시 영등포구 양평로 105, 원우빌딩 3층
- **좌표**: 위도 37.5244, 경도 126.8957
- **가까운 지하철**: 9호선 양평역 5번 출구 도보 3분
- **주차**: 주차장 없음, 양평2동 주민센터 공영주차장 이용

---

## ❓ 문제 해결

### 지도가 표시되지 않을 때

1. **API 키가 올바른지 확인**
   - 복사한 키에 공백이 없는지 확인
   - JavaScript 키를 사용했는지 확인 (REST API 키 아님)

2. **플랫폼이 등록되었는지 확인**
   - 현재 접속 중인 도메인이 등록되어 있는지 확인

3. **개발자 도구에서 오류 확인**
   - 브라우저에서 F12 키 누르기
   - Console 탭에서 오류 메시지 확인

### 좌표가 정확하지 않을 때

`index.html` 파일에서 다음 부분의 좌표를 수정하세요:

```javascript
var options = {
    center: new kakao.maps.LatLng(37.5244, 126.8957),  // 여기를 수정
    level: 3
};

var markerPosition = new kakao.maps.LatLng(37.5244, 126.8957);  // 여기도 수정
```

정확한 좌표는 카카오맵(map.kakao.com)에서 주소를 검색한 후 확인할 수 있습니다.

---

## 📞 문의

웹사이트 관련 문의: 02-2671-7191
