/**
 * Google Apps Script 백엔드와 통신하는 공용 함수입니다.
 * order.js, admin.js 에서 공통으로 사용합니다.
 */
(function () {
  function callApi(action, payload) {
    var url = window.APP_CONFIG.API_URL;
    if (!url || url.indexOf('PASTE_YOUR_APPS_SCRIPT') !== -1) {
      return Promise.reject(new Error('config.js 의 API_URL이 아직 설정되지 않았습니다. README.md를 참고해 설정해주세요.'));
    }

    // Apps Script 웹 앱은 표준 CORS preflight(OPTIONS)를 지원하지 않으므로,
    // 브라우저가 preflight를 보내지 않도록 Content-Type을 text/plain으로 보냅니다.
    // 서버(Code.gs)에서는 내용을 그대로 JSON.parse 하여 처리합니다.
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload || {} })
    })
      .then(function (res) { return res.json(); })
      .catch(function () {
        throw new Error('서버와 통신할 수 없습니다. 인터넷 연결 또는 API_URL 설정을 확인해주세요.');
      });
  }

  window.chimdoApi = { call: callApi };
})();
