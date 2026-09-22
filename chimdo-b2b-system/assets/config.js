/**
 * B2B(도매) 시스템 설정 파일입니다.
 *
 * 중요: 이 시스템은 B2C(한의원 대상) 시스템과 재고를 공유하기 때문에,
 * 아래 API_URL은 B2C 시스템(chimdo-order-system)의 config.js에 있는 것과
 * "완전히 동일한 주소"를 사용해야 합니다 (Apps Script를 새로 만들지 않습니다).
 */
window.APP_CONFIG = {
  // B2C 시스템(chimdo-order-system)의 assets/config.js에 있는 API_URL과 동일한 값입니다.
  API_URL: 'https://script.google.com/macros/s/AKfycbxYj9Fzz8wWIF-6RdYdr5zFAwdXxS_InT4a-D0NxQDHSg0_w_Kn0hpu7AdmDdvflr8l/exec',

  // 화면 상단에 표시할 이름
  SITE_NAME: '한국침도교육원 B2B'
};
