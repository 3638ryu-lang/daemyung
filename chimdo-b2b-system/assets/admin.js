(function () {
  document.getElementById('site-title').textContent = window.APP_CONFIG.SITE_NAME;
  document.getElementById('login-title').textContent = window.APP_CONFIG.SITE_NAME + ' 관리자 로그인';

  var TOKEN_KEY = 'chimdo_admin_token';

  function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
  function setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
  }
  function formatWon(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }
  function formatDate(d) {
    var date = new Date(d);
    if (isNaN(date.getTime())) return String(d);
    return date.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function callAdmin(action, payload) {
    payload = payload || {};
    payload.token = getToken();
    return window.chimdoApi.call(action, payload).then(function (res) {
      if (!res.ok && res.error === '세션이 만료되었습니다. 다시 로그인해주세요.') {
        clearToken();
        showLogin();
      }
      return res;
    });
  }

  function showGlobalMsg(text, type) {
    document.getElementById('global-msg').innerHTML = '<div class="msg ' + type + '">' + escapeHtml(text) + '</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- 로그인 ----------
  var loginScreen = document.getElementById('login-screen');
  var adminApp = document.getElementById('admin-app');

  function showLogin() {
    loginScreen.classList.remove('hidden');
    adminApp.classList.add('hidden');
  }
  function showApp() {
    loginScreen.classList.add('hidden');
    adminApp.classList.remove('hidden');
    initApp();
  }

  document.getElementById('btn-login').addEventListener('click', function () {
    var password = document.getElementById('login-password').value;
    var msg = document.getElementById('login-msg');
    msg.innerHTML = '';
    window.chimdoApi.call('login', { password: password }).then(function (res) {
      if (!res.ok) {
        msg.innerHTML = '<div class="msg error">' + escapeHtml(res.error) + '</div>';
        return;
      }
      setToken(res.token);
      showApp();
    }).catch(function (err) {
      msg.innerHTML = '<div class="msg error">' + escapeHtml(err.message) + '</div>';
    });
  });
  document.getElementById('login-password').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });

  document.getElementById('btn-logout').addEventListener('click', function (e) {
    e.preventDefault();
    clearToken();
    showLogin();
  });

  if (getToken()) { showApp(); } else { showLogin(); }

  // ---------- 탭 전환 ----------
  var state = { products: [], orderItems: [{ productId: '', boxQty: 1 }] };
  var appInitialized = false;

  function initApp() {
    if (appInitialized) return;
    appInitialized = true;

    Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (b) { b.classList.remove('active'); });
        Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (p) { p.classList.add('hidden'); });
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
      });
    });

    loadResoldToOptions();
    loadDistributors();
    loadProducts();
    loadOrders();

    document.getElementById('btn-add-item').addEventListener('click', function () {
      state.orderItems.push({ productId: '', boxQty: 1 });
      renderOrderItems();
    });
    document.getElementById('btn-submit-order').addEventListener('click', submitOrder);

    document.getElementById('btn-refresh-orders').addEventListener('click', loadOrders);
    document.getElementById('order-filter-status').addEventListener('change', loadOrders);

    document.getElementById('btn-save-product').addEventListener('click', saveProduct);
    document.getElementById('btn-cancel-edit-product').addEventListener('click', resetProductForm);

    document.getElementById('btn-save-distributor').addEventListener('click', saveDistributor);
    document.getElementById('btn-cancel-edit-distributor').addEventListener('click', resetDistributorForm);

    document.getElementById('btn-open-statement').addEventListener('click', openStatement);
    document.getElementById('btn-load-stats').addEventListener('click', loadStats);

    var today = new Date();
    var firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('stats-from').value = firstOfMonth.toISOString().slice(0, 10);
    document.getElementById('stats-to').value = today.toISOString().slice(0, 10);
    document.getElementById('statement-from').value = firstOfMonth.toISOString().slice(0, 10);
    document.getElementById('statement-to').value = today.toISOString().slice(0, 10);
    loadStats();
  }

  // ================= 새 주문 입력 =================
  function loadResoldToOptions() {
    callAdmin('getResoldToOptions', {}).then(function (res) {
      if (!res.ok) return;
      var sel = document.getElementById('order-resold-to');
      sel.innerHTML = res.options.map(function (o) { return '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>'; }).join('');
    });
  }

  function productOptionsHtml(selectedId) {
    return '<option value="">제품 선택</option>' + state.products.map(function (p) {
      var sel = p.ProductID === selectedId ? ' selected' : '';
      return '<option value="' + p.ProductID + '"' + sel + '>' + escapeHtml(p.ProductName) + ' - ' + formatWon(p.WholesalePrice) + '/박스 (재고 ' + p.StockBoxes + ')</option>';
    }).join('');
  }

  function renderOrderItems() {
    var container = document.getElementById('order-items-container');
    container.innerHTML = state.orderItems.map(function (item, idx) {
      return (
        '<div class="item-row" data-idx="' + idx + '">' +
          '<select class="oi-product">' + productOptionsHtml(item.productId) + '</select>' +
          '<input type="number" class="oi-qty" min="1" value="' + item.boxQty + '" placeholder="박스 수량">' +
          '<span class="text-muted oi-subtotal"></span>' +
          '<button type="button" class="btn secondary small oi-remove">삭제</button>' +
        '</div>'
      );
    }).join('');

    Array.prototype.forEach.call(container.querySelectorAll('.oi-product'), function (sel, idx) {
      sel.addEventListener('change', function () { state.orderItems[idx].productId = sel.value; updateOrderTotal(); });
    });
    Array.prototype.forEach.call(container.querySelectorAll('.oi-qty'), function (input, idx) {
      input.addEventListener('input', function () {
        state.orderItems[idx].boxQty = Number(input.value) || 0;
        updateOrderTotal();
      });
    });
    Array.prototype.forEach.call(container.querySelectorAll('.oi-remove'), function (btn, idx) {
      btn.addEventListener('click', function () {
        if (state.orderItems.length === 1) return;
        state.orderItems.splice(idx, 1);
        renderOrderItems();
      });
    });

    updateOrderTotal();
  }

  function updateOrderTotal() {
    var total = 0;
    var container = document.getElementById('order-items-container');
    var subtotalEls = container.querySelectorAll('.oi-subtotal');
    state.orderItems.forEach(function (item, idx) {
      var product = state.products.filter(function (p) { return p.ProductID === item.productId; })[0];
      var subtotal = product ? Number(product.WholesalePrice) * (item.boxQty || 0) : 0;
      total += subtotal;
      if (subtotalEls[idx]) subtotalEls[idx].textContent = product ? formatWon(subtotal) : '';
    });
    document.getElementById('order-total-amount').textContent = formatWon(total);
  }

  function submitOrder() {
    var distributorId = document.getElementById('order-distributor').value;
    if (!distributorId) { showGlobalMsg('거래처를 선택해주세요.', 'error'); return; }

    var validItems = state.orderItems.filter(function (i) { return i.productId && i.boxQty > 0; });
    if (!validItems.length) { showGlobalMsg('제품과 수량을 1개 이상 올바르게 선택해주세요.', 'error'); return; }

    var payload = {
      distributorId: distributorId,
      resoldTo: document.getElementById('order-resold-to').value,
      items: validItems.map(function (i) { return { productId: i.productId, boxQty: i.boxQty }; }),
      memo: document.getElementById('order-memo').value
    };

    var btn = document.getElementById('btn-submit-order');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    callAdmin('createB2BOrder', payload).then(function (res) {
      if (!res.ok) { showGlobalMsg(res.error, 'error'); return; }
      showGlobalMsg('주문이 등록되었습니다. (주문번호: ' + res.orderId + ', 금액: ' + formatWon(res.totalAmount) + ')', 'success');
      state.orderItems = [{ productId: '', boxQty: 1 }];
      renderOrderItems();
      document.getElementById('order-memo').value = '';
      loadOrders();
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = '주문 등록';
    });
  }

  // ================= 주문 목록 관리 =================
  var ORDER_STATUSES = ['접수', '확인중', '배송중', '완료', '취소'];

  function loadOrders() {
    var wrap = document.getElementById('orders-table-wrap');
    wrap.innerHTML = '<div class="empty-state">불러오는 중...</div>';
    var payload = { status: document.getElementById('order-filter-status').value };
    callAdmin('listB2BOrders', payload).then(function (res) {
      if (!res.ok) { wrap.innerHTML = '<div class="msg error">' + escapeHtml(res.error) + '</div>'; return; }
      if (!res.orders.length) { wrap.innerHTML = '<div class="empty-state">해당 조건의 주문이 없습니다.</div>'; return; }

      var rows = res.orders.map(function (o) {
        var itemsText = (o.items || []).map(function (it) {
          return escapeHtml(it.ProductName) + ' ' + it.BoxQty + '박스';
        }).join('<br>');

        var statusOptions = ORDER_STATUSES.map(function (s) {
          return '<option value="' + s + '"' + (s === o.Status ? ' selected' : '') + '>' + s + '</option>';
        }).join('');

        var deducted = o.StockDeducted === true;

        return (
          '<tr>' +
            '<td>' + formatDate(o.Timestamp) + '<br><span class="text-muted">' + escapeHtml(o.OrderID) + '</span></td>' +
            '<td>' + escapeHtml(o.DistributorName) + (o.ResoldTo ? '<br><span class="text-muted">→ ' + escapeHtml(o.ResoldTo) + '</span>' : '') + '</td>' +
            '<td>' + itemsText + '</td>' +
            '<td class="text-right">' + formatWon(o.TotalAmount) + '<br><span class="text-muted">기부금 ' + formatWon(o.DonationAmount) + '</span></td>' +
            '<td>' +
              '<select class="order-status-select" data-order-id="' + o.OrderID + '" data-deducted="' + deducted + '">' + statusOptions + '</select>' +
              (deducted
                ? '<div class="text-muted" style="margin-top:4px;">✔ 출고완료 (재고 차감됨)</div>'
                : '<div class="text-muted" style="margin-top:4px;">출고 전 (재고 미차감)</div>') +
            '</td>' +
          '</tr>'
        );
      }).join('');

      wrap.innerHTML = '<table><thead><tr><th>주문일시</th><th>거래처</th><th>제품</th><th>금액</th><th>상태</th></tr></thead><tbody>' + rows + '</tbody></table>';

      Array.prototype.forEach.call(wrap.querySelectorAll('.order-status-select'), function (sel) {
        sel.addEventListener('change', function () {
          var orderId = sel.dataset.orderId;
          var newStatus = sel.value;
          var wasDeducted = sel.dataset.deducted === 'true';
          var isShippedStatus = newStatus === '배송중' || newStatus === '완료';

          if (newStatus === '취소' && !confirm('주문을 취소 처리하시겠습니까? 이미 출고된 주문이라면 재고가 자동으로 복원됩니다.')) {
            loadOrders();
            return;
          }
          if (isShippedStatus && !wasDeducted && !confirm('"' + newStatus + '"(으)로 변경하면 이 시점에 (B2C와 공유하는) 재고가 차감됩니다. 계속할까요?')) {
            loadOrders();
            return;
          }
          callAdmin('updateB2BOrderStatus', { orderId: orderId, status: newStatus }).then(function (r) {
            if (!r.ok) { showGlobalMsg(r.error, 'error'); loadOrders(); return; }
            showGlobalMsg('주문 상태가 변경되었습니다.', 'success');
            loadOrders();
            loadProducts();
            loadStats();
          });
        });
      });
    });
  }

  // ================= 재고 관리 =================
  function loadProducts() {
    var wrap = document.getElementById('products-table-wrap');
    wrap.innerHTML = '<div class="empty-state">불러오는 중...</div>';
    callAdmin('listProducts', {}).then(function (res) {
      if (!res.ok) { wrap.innerHTML = '<div class="msg error">' + escapeHtml(res.error) + '</div>'; return; }
      state.products = res.products || [];

      renderOrderItems(); // 제품 목록이 바뀌면 주문 입력 폼의 드롭다운도 갱신

      if (!res.products.length) { wrap.innerHTML = '<div class="empty-state">등록된 제품이 없습니다. B2C 관리자 페이지에서 먼저 등록해주세요.</div>'; return; }

      var rows = res.products.map(function (p) {
        var lowStock = Number(p.StockBoxes) <= 5;
        return (
          '<tr>' +
            '<td>' + escapeHtml(p.ProductName) + '<br><span class="text-muted">' + escapeHtml(p.Spec || '') + '</span></td>' +
            '<td class="text-right">도매 ' + formatWon(p.WholesalePrice) + '<br><span class="text-muted">회원 ' + formatWon(p.MemberPrice) + ' / 비회원 ' + formatWon(p.GuestPrice) + '</span></td>' +
            '<td class="text-right">' + (lowStock ? '<span class="badge status-취소">' + p.StockBoxes + '박스 (부족)</span>' : p.StockBoxes + '박스') + '</td>' +
            '<td class="text-right">' + formatWon(p.DonationPerBox) + '/박스</td>' +
            '<td>' +
              '<button type="button" class="btn secondary small stock-adjust" data-id="' + p.ProductID + '" data-delta="1">+1</button> ' +
              '<button type="button" class="btn secondary small stock-adjust" data-id="' + p.ProductID + '" data-delta="-1">-1</button> ' +
              '<button type="button" class="btn secondary small product-edit" data-id="' + p.ProductID + '">수정</button>' +
            '</td>' +
          '</tr>'
        );
      }).join('');

      wrap.innerHTML = '<table><thead><tr><th>제품</th><th>가격(도매/회원/비회원)</th><th>재고(B2C 공유)</th><th>기부금</th><th>관리</th></tr></thead><tbody>' + rows + '</tbody></table>';

      Array.prototype.forEach.call(wrap.querySelectorAll('.stock-adjust'), function (btn) {
        btn.addEventListener('click', function () {
          callAdmin('adjustStock', { productId: btn.dataset.id, delta: Number(btn.dataset.delta) }).then(function (r) {
            if (!r.ok) { showGlobalMsg(r.error, 'error'); return; }
            loadProducts();
          });
        });
      });
      Array.prototype.forEach.call(wrap.querySelectorAll('.product-edit'), function (btn) {
        btn.addEventListener('click', function () {
          var product = res.products.filter(function (p) { return p.ProductID === btn.dataset.id; })[0];
          fillProductForm(product);
        });
      });
    });
  }

  function fillProductForm(p) {
    document.getElementById('product-id').value = p.ProductID;
    document.getElementById('product-name').value = p.ProductName;
    document.getElementById('product-spec').value = p.Spec || '';
    document.getElementById('product-wholesale-price').value = p.WholesalePrice;
    document.getElementById('product-stock').value = p.StockBoxes;
    document.getElementById('product-donation').value = p.DonationPerBox;
    document.getElementById('btn-cancel-edit-product').classList.remove('hidden');
  }

  function resetProductForm() {
    document.getElementById('product-id').value = '';
    document.getElementById('product-name').value = '';
    document.getElementById('product-spec').value = '';
    document.getElementById('product-wholesale-price').value = '';
    document.getElementById('product-stock').value = '';
    document.getElementById('product-donation').value = '';
    document.getElementById('btn-cancel-edit-product').classList.add('hidden');
  }

  function saveProduct() {
    var name = document.getElementById('product-name').value.trim();
    var wholesalePrice = document.getElementById('product-wholesale-price').value;
    if (!name || wholesalePrice === '') { showGlobalMsg('제품명과 도매가는 필수입니다.', 'error'); return; }

    var product = {
      ProductName: name,
      Spec: document.getElementById('product-spec').value.trim(),
      WholesalePrice: Number(wholesalePrice),
      StockBoxes: Number(document.getElementById('product-stock').value || 0),
      DonationPerBox: Number(document.getElementById('product-donation').value || 0),
      Active: true
    };
    var id = document.getElementById('product-id').value;
    if (id) product.ProductID = id;

    callAdmin('upsertProduct', { product: product }).then(function (r) {
      if (!r.ok) { showGlobalMsg(r.error, 'error'); return; }
      showGlobalMsg('제품이 저장되었습니다.', 'success');
      resetProductForm();
      loadProducts();
    });
  }

  // ================= 거래처(도매상) 관리 =================
  function loadDistributors() {
    var wrap = document.getElementById('distributors-table-wrap');
    wrap.innerHTML = '<div class="empty-state">불러오는 중...</div>';
    callAdmin('listDistributors', {}).then(function (res) {
      if (!res.ok) { wrap.innerHTML = '<div class="msg error">' + escapeHtml(res.error) + '</div>'; return; }

      populateDistributorSelects(res.distributors || []);

      if (!res.distributors.length) { wrap.innerHTML = '<div class="empty-state">등록된 거래처가 없습니다.</div>'; return; }

      var rows = res.distributors.map(function (d) {
        return (
          '<tr>' +
            '<td>' + escapeHtml(d.Name) + '</td>' +
            '<td>' + escapeHtml(d.ContactName || '') + '<br><span class="text-muted">' + escapeHtml(d.Phone || '') + '</span></td>' +
            '<td>' + escapeHtml(d.Address || '') + '</td>' +
            '<td class="text-muted">' + escapeHtml(d.Note || '') + '</td>' +
            '<td><button type="button" class="btn secondary small distributor-edit" data-id="' + d.DistributorID + '">수정</button></td>' +
          '</tr>'
        );
      }).join('');

      wrap.innerHTML = '<table><thead><tr><th>거래처명</th><th>담당자/연락처</th><th>주소</th><th>메모</th><th>관리</th></tr></thead><tbody>' + rows + '</tbody></table>';

      Array.prototype.forEach.call(wrap.querySelectorAll('.distributor-edit'), function (btn) {
        btn.addEventListener('click', function () {
          var d = res.distributors.filter(function (x) { return x.DistributorID === btn.dataset.id; })[0];
          fillDistributorForm(d);
        });
      });
    });
  }

  function populateDistributorSelects(distributors) {
    var optionsHtml = distributors.map(function (d) {
      return '<option value="' + d.DistributorID + '">' + escapeHtml(d.Name) + '</option>';
    }).join('');

    var orderSel = document.getElementById('order-distributor');
    var prevOrderVal = orderSel.value;
    orderSel.innerHTML = optionsHtml || '<option value="">등록된 거래처가 없습니다</option>';
    if (prevOrderVal) orderSel.value = prevOrderVal;

    var stmtSel = document.getElementById('statement-distributor');
    var prevStmtVal = stmtSel.value;
    stmtSel.innerHTML = optionsHtml || '<option value="">등록된 거래처가 없습니다</option>';
    if (prevStmtVal) stmtSel.value = prevStmtVal;
  }

  function fillDistributorForm(d) {
    document.getElementById('distributor-id').value = d.DistributorID;
    document.getElementById('distributor-name').value = d.Name;
    document.getElementById('distributor-contact').value = d.ContactName || '';
    document.getElementById('distributor-phone').value = d.Phone || '';
    document.getElementById('distributor-email').value = d.Email || '';
    document.getElementById('distributor-address').value = d.Address || '';
    document.getElementById('distributor-note').value = d.Note || '';
    document.getElementById('btn-cancel-edit-distributor').classList.remove('hidden');
  }

  function resetDistributorForm() {
    document.getElementById('distributor-id').value = '';
    ['distributor-name', 'distributor-contact', 'distributor-phone', 'distributor-email', 'distributor-address', 'distributor-note'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('btn-cancel-edit-distributor').classList.add('hidden');
  }

  function saveDistributor() {
    var name = document.getElementById('distributor-name').value.trim();
    if (!name) { showGlobalMsg('거래처명은 필수입니다.', 'error'); return; }

    var distributor = {
      Name: name,
      ContactName: document.getElementById('distributor-contact').value.trim(),
      Phone: document.getElementById('distributor-phone').value.trim(),
      Email: document.getElementById('distributor-email').value.trim(),
      Address: document.getElementById('distributor-address').value.trim(),
      Note: document.getElementById('distributor-note').value.trim()
    };
    var id = document.getElementById('distributor-id').value;
    if (id) distributor.DistributorID = id;

    callAdmin('upsertDistributor', { distributor: distributor }).then(function (r) {
      if (!r.ok) { showGlobalMsg(r.error, 'error'); return; }
      showGlobalMsg('거래처가 저장되었습니다.', 'success');
      resetDistributorForm();
      loadDistributors();
    });
  }

  // ================= 거래처별 정산서 =================
  function openStatement() {
    var distributorId = document.getElementById('statement-distributor').value;
    var from = document.getElementById('statement-from').value;
    var to = document.getElementById('statement-to').value;

    if (!distributorId) { showGlobalMsg('정산서를 발급할 거래처를 선택해주세요.', 'error'); return; }
    if (!from || !to) { showGlobalMsg('정산 기간(시작일/종료일)을 선택해주세요.', 'error'); return; }

    var url = 'statement.html?distributorId=' + encodeURIComponent(distributorId) + '&from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to);
    window.open(url, '_blank');
  }

  // ================= 매출 / 통계 / 기부금 =================
  function loadStats() {
    var payload = {
      from: document.getElementById('stats-from').value,
      to: document.getElementById('stats-to').value
    };
    callAdmin('getB2BStats', payload).then(function (res) {
      if (!res.ok) { showGlobalMsg(res.error, 'error'); return; }
      var s = res.stats;

      document.getElementById('stat-orders').textContent = s.totalOrders;
      document.getElementById('stat-boxes').textContent = s.totalBoxes + '박스';
      document.getElementById('stat-sales').textContent = formatWon(s.totalSales);
      document.getElementById('stat-donation').textContent = formatWon(s.totalDonation);
      document.getElementById('stat-donation-label').textContent = s.associationName + ' 기부금';

      var resoldRows = Object.keys(s.byResoldTo).map(function (key) {
        var t = s.byResoldTo[key];
        return '<tr><td>' + escapeHtml(key) + '</td><td class="text-right">' + t.orders + '건</td><td class="text-right">' + formatWon(t.sales) + '</td></tr>';
      }).join('');
      document.getElementById('stats-by-resold-wrap').innerHTML = resoldRows
        ? '<table><thead><tr><th>최종 재판매처</th><th>주문 건수</th><th>매출</th></tr></thead><tbody>' + resoldRows + '</tbody></table>'
        : '<div class="empty-state">해당 기간에 출고된 주문이 없습니다.</div>';

      if (!s.byProduct.length) {
        document.getElementById('stats-by-product-wrap').innerHTML = '<div class="empty-state">해당 기간에 판매된 제품이 없습니다.</div>';
      } else {
        var productRows = s.byProduct.map(function (p) {
          return (
            '<tr><td>' + escapeHtml(p.productName) + '</td><td class="text-right">' + p.boxes + '박스</td>' +
            '<td class="text-right">' + formatWon(p.sales) + '</td><td class="text-right">' + formatWon(p.donation) + '</td></tr>'
          );
        }).join('');
        document.getElementById('stats-by-product-wrap').innerHTML =
          '<table><thead><tr><th>제품</th><th>판매 박스</th><th>매출</th><th>기부금</th></tr></thead><tbody>' + productRows + '</tbody></table>';
      }
    });
  }
})();
