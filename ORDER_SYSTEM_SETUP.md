# 제품 주문 시스템 - 구글 스프레드시트 연동 설정 방법

`products.html` 페이지에서 고객이 주문하기 버튼을 누르면, 주문 내용이 자동으로
구글 스프레드시트에 한 줄씩 기록되도록 연결하는 방법입니다.

전문 개발 지식이 없어도 아래 순서대로 따라 하시면 됩니다. (약 10분 소요)

---

## 1단계. 구글 스프레드시트 만들기

1. [sheets.google.com](https://sheets.google.com) 에 접속해서 새 스프레드시트를 만듭니다.
2. 시트 이름을 예를 들어 **"제품주문내역"** 으로 바꿔줍니다.
3. 이 스프레드시트에 주문이 들어올 때마다 자동으로 줄이 추가됩니다. (열 제목은 자동으로 만들어지므로 미리 입력하지 않아도 됩니다.)

## 2단계. Apps Script 코드 붙여넣기

1. 스프레드시트 상단 메뉴에서 **확장 프로그램 → Apps Script** 를 클릭합니다.
2. 기존에 있던 코드(`function myFunction() {}` 등)를 모두 지우고, 아래 코드를 붙여넣습니다.

```javascript
// 주문이 들어왔을 때 알림 메일을 받을 주소입니다. 원하는 이메일로 바꿔주세요.
var ADMIN_EMAIL = '3638ryu@naver.com';

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // 첫 주문이 들어올 때 제목 줄을 자동으로 추가합니다.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['주문일시', '이름', '연락처', '수령방법', '주소', '주문상품', '총금액', '요청사항']);
  }

  var p = e.parameter;
  var orderTime = new Date();

  sheet.appendRow([
    orderTime,
    p.name || '',
    p.phone || '',
    p.deliveryMethod || '',
    p.address || '',
    p.items || '',
    p.total || '',
    p.memo || ''
  ]);

  // 주문이 접수될 때마다 관리자 이메일로 알림을 보냅니다.
  var total = Number(p.total || 0);
  var subject = '[대명한의원] 새 주문이 접수되었습니다 - ' + (p.name || '주문자');
  var body =
    '새로운 제품 주문이 접수되었습니다.\n\n' +
    '주문일시: ' + orderTime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + '\n' +
    '이름: ' + (p.name || '') + '\n' +
    '연락처: ' + (p.phone || '') + '\n' +
    '수령방법: ' + (p.deliveryMethod || '') + '\n' +
    '주소: ' + (p.address || '-') + '\n' +
    '주문상품: ' + (p.items || '') + '\n' +
    '총 정산 금액: ' + total.toLocaleString('ko-KR') + '원\n' +
    '요청사항: ' + (p.memo || '-') + '\n\n' +
    '전체 주문 내역은 구글 스프레드시트에서 확인하세요.';

  MailApp.sendEmail(ADMIN_EMAIL, subject, body);

  return ContentService.createTextOutput(JSON.stringify({ result: 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. 코드 맨 위의 `ADMIN_EMAIL` 값을 주문 알림을 받고 싶은 실제 이메일 주소로 바꿔주세요.
4. 상단의 **저장** (디스크 모양 아이콘)을 눌러 저장합니다.

## 3단계. 웹 앱으로 배포하기

1. 화면 오른쪽 위의 **배포 → 새 배포** 버튼을 클릭합니다.
2. 배포 유형 옆의 톱니바퀴 아이콘을 눌러 **웹 앱**을 선택합니다.
3. 아래와 같이 설정합니다.
   - **실행 계정**: 나 (본인 구글 계정)
   - **액세스 권한이 있는 사용자**: 전체 (익명 사용자 포함)
4. **배포** 버튼을 누르면 구글 계정 권한 승인 창이 뜹니다. 안내에 따라 승인해주세요.
   (Google이 "확인되지 않은 앱"이라는 경고를 띄울 수 있는데, 본인이 만든 스크립트이므로
   "고급" → "이동(안전하지 않음)" 을 눌러 진행하면 됩니다.)
5. 배포가 완료되면 **웹 앱 URL** 이 나타납니다. 이 주소를 복사해두세요.
   (예: `https://script.google.com/macros/s/AKfycb.../exec`)

## 4단계. 웹사이트에 주소 연결하기

1. 저장소의 `products.html` 파일을 엽니다.
2. `<script>` 태그 안에서 아래 줄을 찾습니다.

```javascript
const GOOGLE_SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL';
```

3. `'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL'` 부분을 3단계에서 복사한 웹 앱 주소로 바꿔줍니다.

```javascript
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

4. 파일을 저장하고 웹사이트를 다시 배포(업로드)하면 연동이 완료됩니다.

## 5단계. 테스트해보기

1. `products.html` 페이지에서 아무 제품이나 담고, 이름/연락처를 입력한 뒤 "주문하기"를 눌러봅니다.
2. "주문이 접수되었습니다" 안내창과 함께 담은 제품 목록·총 정산 금액이 표시되면 정상 작동한 것입니다.
3. 1단계에서 만든 구글 스프레드시트를 열어 새 줄이 추가되었는지 확인합니다.
4. `ADMIN_EMAIL`로 설정한 메일함을 확인해서 "새 주문이 접수되었습니다" 알림 메일이 왔는지 확인합니다.
   (메일이 곧바로 오지 않으면 스팸함도 확인해주세요.)

---

## 참고 사항

- 이 방식은 **결제(카드 결제 등)는 처리하지 않고, 주문 내용만 접수/기록**합니다.
  실제 결제나 배송 안내는 스프레드시트를 확인한 후 전화 등으로 직접 진행해주세요.
- 주문이 접수되면 화면에 **담은 제품과 총 결제 예정 금액이 자동으로 계산되어 주문자에게 즉시 안내**됩니다.
  (실제 결제는 이 금액을 기준으로 전화 등으로 안내해주시면 됩니다.)
- 주문이 들어올 때마다 `ADMIN_EMAIL`로 설정한 주소로 주문 내용이 담긴 알림 메일이 자동으로 발송됩니다.
- 페이지 상단의 **"🔗 주문 페이지 링크 복사"** 버튼을 누르면 현재 페이지 주소가 복사됩니다.
  이 링크를 카카오톡, 문자 등으로 고객에게 보내면 고객이 바로 접속해서 주문할 수 있습니다.
- Apps Script 코드를 수정한 뒤에는 **배포 → 배포 관리 → 수정(연필 아이콘) → 새 버전으로 배포**를 해야
  변경사항이 실제 웹 앱에 반영됩니다.
- 판매하는 제품 목록(이름/가격/설명)은 `products.html` 파일 안의 `PRODUCTS` 배열에서 직접 수정할 수 있습니다.
