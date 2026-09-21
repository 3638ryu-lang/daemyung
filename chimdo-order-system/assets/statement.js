(function () {
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
  }
  function formatWon(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }
  function formatDateOnly(d) {
    var date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  var root = document.getElementById('statement-root');
  var params = new URLSearchParams(window.location.search);
  var customerId = params.get('customerId');
  var from = params.get('from');
  var to = params.get('to');
  var token = sessionStorage.getItem('chimdo_admin_token');

  if (!customerId || !from || !to) {
    root.innerHTML = '<div class="empty-state">거래처와 기간 정보가 없습니다. 관리자 페이지의 "거래처별 정산서 발급"에서 다시 열어주세요.</div>';
    return;
  }
  if (!token) {
    root.innerHTML = '<div class="empty-state">관리자 로그인이 필요합니다. admin.html에서 로그인한 뒤 다시 시도해주세요.</div>';
    return;
  }

  window.chimdoApi.call('getCustomerStatement', { token: token, customerId: customerId, from: from, to: to })
    .then(function (res) {
      if (!res.ok) { root.innerHTML = '<div class="empty-state">' + escapeHtml(res.error) + '</div>'; return; }
      render(res.statement);
    })
    .catch(function (err) {
      root.innerHTML = '<div class="empty-state">' + escapeHtml(err.message) + '</div>';
    });

  function render(s) {
    var c = s.customer;
    var rows = [];

    s.orders.forEach(function (o) {
      var lineCount = (o.items || []).length || 1;
      (o.items || []).forEach(function (it, idx) {
        rows.push(
          '<tr>' +
            (idx === 0
              ? '<td rowspan="' + lineCount + '">' + formatDateOnly(o.Timestamp) +
                '<br><span style="color:#6b7280;font-size:0.76rem;">' + escapeHtml(o.OrderID) + '</span></td>'
              : '') +
            '<td>' + escapeHtml(it.ProductName) + '</td>' +
            '<td class="num">' + it.BoxQty + '박스</td>' +
            '<td class="num">' + formatWon(it.UnitPrice) + '</td>' +
            '<td class="num">' + formatWon(it.LineTotal) + '</td>' +
          '</tr>'
        );
      });
    });

    var body = rows.length
      ? rows.join('')
      : '<tr><td colspan="5" style="text-align:center;color:#6b7280;">해당 기간에 출고된 주문이 없습니다.</td></tr>';

    root.innerHTML =
      '<div class="statement-header">' +
        '<h1>정 산 서</h1>' +
        '<div class="period">' + escapeHtml(s.from) + ' ~ ' + escapeHtml(s.to) + '</div>' +
      '</div>' +
      '<div class="statement-meta">' +
        '<div>' +
          '<div class="label">거래처</div>' +
          escapeHtml(c.Name) + (c.BusinessName ? ' (' + escapeHtml(c.BusinessName) + ')' : '') + '<br>' +
          escapeHtml(c.Phone || '') + '<br>' +
          escapeHtml(c.Address || '') +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div class="label">발행 주체</div>' +
          escapeHtml(window.APP_CONFIG.SITE_NAME) + '<br>' +
          '발행일: ' + formatDateOnly(new Date()) +
        '</div>' +
      '</div>' +
      '<table class="statement-table">' +
        '<thead><tr><th>출고일 / 주문번호</th><th>제품</th><th class="num">수량</th><th class="num">단가</th><th class="num">금액</th></tr></thead>' +
        '<tbody>' +
          body +
          '<tr class="statement-total-row"><td colspan="2">합계</td><td class="num">' + s.totalBoxes + '박스</td><td></td><td class="num">' + formatWon(s.grandTotal) + '</td></tr>' +
        '</tbody>' +
      '</table>' +
      '<div class="statement-footer">위와 같이 정산 내역을 청구합니다.</div>';
  }
})();
