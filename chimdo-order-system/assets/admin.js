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

    loadOrders();
    loadProducts();
    loadCustomers();
    loadConfig();

    document.getElementById('btn-refresh-orders').addEventListener('click', loadOrders);
    document.getElementById('order-filter-status').addEventListener('change', loadOrders);
    document.getElementById('order-filter-type').addEventListener('change', loadOrders);

    document.getElementById('btn-save-product').addEventListener('click', saveProduct);
    document.getElementById('btn-cancel-edit-product').addEventListener('click', resetProductForm);

    document.getElementById('btn-save-customer').addEventListener('click', saveCustomer);
    document.getElementById('btn-cancel-edit-customer').addEventListener('click', resetCustomerForm);
    document.getElementById('btn-refresh-customers').addEventListener('click', loadCustomers);
    document.getElementById('customer-filter-type').addEventListener('change', loadCustomers);

    document.getElementById('btn-load-stats').addEventListener('click', loadStats);
    document.getElementById('btn-save-config').addEventListener('click', saveConfig);

    // 이번 달 1일 ~ 오늘로 통계 기본 기간 설정
    var today = new Date();
    var firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('stats-from').value = firstOfMonth.toISOString().slice(0, 10);
    document.getElementById('stats-to').value = today.toISOString().slice(0, 10);
    loadStats();
  }

  // ================= 주문 관리 =================
  var ORDER_STATUSES = ['접수', '확인중', '배송중', '완료', '취소'];

  function loadOrders() {
    var wrap = document.getElementById('orders-table-wrap');
    wrap.innerHTML = '<div class="empty-state">불러오는 중...</div>';
    var payload = {
      status: document.getElementById('order-filter-status').value,
      customerType: document.getElementById('order-filter-type').value
    };
    callAdmin('listOrders', payload).then(function (res) {
      if (!res.ok) { wrap.innerHTML = '<div class="msg error">' + escapeHtml(res.error) + '</div>'; return; }
      if (!res.orders.length) { wrap.innerHTML = '<div class="empty-state">해당 조건의 주문이 없습니다.</div>'; return; }

      var rows = res.orders.map(function (o) {
        var itemsText = (o.items || []).map(function (it) {
          return escapeHtml(it.ProductName) + ' ' + it.BoxQty + '박스';
        }).join('<br>');

        var statusOptions = ORDER_STATUSES.map(function (s) {
          return '<option value="' + s + '"' + (s === o.Status ? ' selected' : '') + '>' + s + '</option>';
        }).join('');

        return (
          '<tr>' +
            '<td>' + formatDate(o.Timestamp) + '<br><span class="text-muted">' + escapeHtml(o.OrderID) + '</span></td>' +
            '<td><span class="badge type-' + o.CustomerType + '">' + o.CustomerType + '</span><br>' + escapeHtml(o.CustomerName) + (o.BusinessName ? '<br><span class="text-muted">' + escapeHtml(o.BusinessName) + '</span>' : '') + '<br><span class="text-muted">' + escapeHtml(o.Phone) + '</span></td>' +
            '<td>' + itemsText + '</td>' +
            '<td class="text-right">' + formatWon(o.TotalAmount) + '<br><span class="text-muted">기부금 ' + formatWon(o.DonationAmount) + '</span></td>' +
            '<td><select class="order-status-select" data-order-id="' + o.OrderID + '">' + statusOptions + '</select></td>' +
          '</tr>'
        );
      }).join('');

      wrap.innerHTML = '<table><thead><tr><th>주문일시</th><th>주문자</th><th>제품</th><th>금액</th><th>상태</th></tr></thead><tbody>' + rows + '</tbody></table>';

      Array.prototype.forEach.call(wrap.querySelectorAll('.order-status-select'), function (sel) {
        sel.addEventListener('change', function () {
          var orderId = sel.dataset.orderId;
          var newStatus = sel.value;
          if (newStatus === '취소' && !confirm('주문을 취소 처리하시겠습니까? 재고가 자동으로 복원됩니다.')) {
            loadOrders();
            return;
          }
          callAdmin('updateOrderStatus', { orderId: orderId, status: newStatus }).then(function (r) {
            if (!r.ok) { showGlobalMsg(r.error, 'error'); loadOrders(); return; }
            showGlobalMsg('주문 상태가 변경되었습니다.', 'success');
            loadProducts();
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
      if (!res.products.length) { wrap.innerHTML = '<div class="empty-state">등록된 제품이 없습니다.</div>'; return; }

      var rows = res.products.map(function (p) {
        var lowStock = Number(p.StockBoxes) <= 5;
        return (
          '<tr>' +
            '<td>' + escapeHtml(p.ProductName) + '<br><span class="text-muted">' + escapeHtml(p.Spec || '') + '</span></td>' +
            '<td class="text-right">' + formatWon(p.UnitPrice) + '</td>' +
            '<td class="text-right">' + (lowStock ? '<span class="badge status-취소">' + p.StockBoxes + '박스 (부족)</span>' : p.StockBoxes + '박스') + '</td>' +
            '<td class="text-right">' + formatWon(p.DonationPerBox) + '/박스</td>' +
            '<td>' +
              '<button type="button" class="btn secondary small stock-adjust" data-id="' + p.ProductID + '" data-delta="10">+10</button> ' +
              '<button type="button" class="btn secondary small stock-adjust" data-id="' + p.ProductID + '" data-delta="-10">-10</button> ' +
              '<button type="button" class="btn secondary small product-edit" data-id="' + p.ProductID + '">수정</button>' +
            '</td>' +
          '</tr>'
        );
      }).join('');

      wrap.innerHTML = '<table><thead><tr><th>제품</th><th>박스가격</th><th>재고</th><th>기부금</th><th>관리</th></tr></thead><tbody>' + rows + '</tbody></table>';

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
    document.getElementById('product-price').value = p.UnitPrice;
    document.getElementById('product-stock').value = p.StockBoxes;
    document.getElementById('product-donation').value = p.DonationPerBox;
    document.getElementById('btn-cancel-edit-product').classList.remove('hidden');
  }

  function resetProductForm() {
    document.getElementById('product-id').value = '';
    document.getElementById('product-name').value = '';
    document.getElementById('product-spec').value = '';
    document.getElementById('product-price').value = '';
    document.getElementById('product-stock').value = '';
    document.getElementById('product-donation').value = '';
    document.getElementById('btn-cancel-edit-product').classList.add('hidden');
  }

  function saveProduct() {
    var name = document.getElementById('product-name').value.trim();
    var price = document.getElementById('product-price').value;
    if (!name || price === '') { showGlobalMsg('제품명과 가격은 필수입니다.', 'error'); return; }

    var product = {
      ProductName: name,
      Spec: document.getElementById('product-spec').value.trim(),
      UnitPrice: Number(price),
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

  // ================= 거래처 관리 =================
  function loadCustomers() {
    var wrap = document.getElementById('customers-table-wrap');
    wrap.innerHTML = '<div class="empty-state">불러오는 중...</div>';
    callAdmin('listCustomers', { type: document.getElementById('customer-filter-type').value }).then(function (res) {
      if (!res.ok) { wrap.innerHTML = '<div class="msg error">' + escapeHtml(res.error) + '</div>'; return; }
      if (!res.customers.length) { wrap.innerHTML = '<div class="empty-state">등록된 거래처가 없습니다.</div>'; return; }

      var rows = res.customers.map(function (c) {
        return (
          '<tr>' +
            '<td><span class="badge type-' + c.Type + '">' + c.Type + '</span></td>' +
            '<td>' + escapeHtml(c.Name) + (c.BusinessName ? '<br><span class="text-muted">' + escapeHtml(c.BusinessName) + '</span>' : '') + '</td>' +
            '<td>' + escapeHtml(c.Phone || '') + '<br><span class="text-muted">' + escapeHtml(c.Email || '') + '</span></td>' +
            '<td>' + escapeHtml(c.Address || '') + '</td>' +
            '<td><button type="button" class="btn secondary small customer-edit" data-id="' + c.CustomerID + '">수정</button></td>' +
          '</tr>'
        );
      }).join('');

      wrap.innerHTML = '<table><thead><tr><th>구분</th><th>이름/업체</th><th>연락처</th><th>주소</th><th>관리</th></tr></thead><tbody>' + rows + '</tbody></table>';

      Array.prototype.forEach.call(wrap.querySelectorAll('.customer-edit'), function (btn) {
        btn.addEventListener('click', function () {
          var c = res.customers.filter(function (x) { return x.CustomerID === btn.dataset.id; })[0];
          fillCustomerForm(c);
        });
      });
    });
  }

  function fillCustomerForm(c) {
    document.getElementById('customer-id').value = c.CustomerID;
    document.getElementById('customer-type').value = c.Type;
    document.getElementById('customer-name').value = c.Name;
    document.getElementById('customer-business').value = c.BusinessName || '';
    document.getElementById('customer-phone').value = c.Phone || '';
    document.getElementById('customer-email').value = c.Email || '';
    document.getElementById('customer-address').value = c.Address || '';
    document.getElementById('customer-note').value = c.Note || '';
    document.getElementById('btn-cancel-edit-customer').classList.remove('hidden');
  }

  function resetCustomerForm() {
    document.getElementById('customer-id').value = '';
    document.getElementById('customer-type').value = '회원';
    ['customer-name', 'customer-business', 'customer-phone', 'customer-email', 'customer-address', 'customer-note'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    document.getElementById('btn-cancel-edit-customer').classList.add('hidden');
  }

  function saveCustomer() {
    var name = document.getElementById('customer-name').value.trim();
    if (!name) { showGlobalMsg('이름은 필수입니다.', 'error'); return; }

    var customer = {
      Type: document.getElementById('customer-type').value,
      Name: name,
      BusinessName: document.getElementById('customer-business').value.trim(),
      Phone: document.getElementById('customer-phone').value.trim(),
      Email: document.getElementById('customer-email').value.trim(),
      Address: document.getElementById('customer-address').value.trim(),
      Note: document.getElementById('customer-note').value.trim()
    };
    var id = document.getElementById('customer-id').value;
    if (id) customer.CustomerID = id;

    callAdmin('upsertCustomer', { customer: customer }).then(function (r) {
      if (!r.ok) { showGlobalMsg(r.error, 'error'); return; }
      showGlobalMsg('거래처가 저장되었습니다.', 'success');
      resetCustomerForm();
      loadCustomers();
    });
  }

  // ================= 매출 / 통계 / 기부금 =================
  function loadStats() {
    var payload = {
      from: document.getElementById('stats-from').value,
      to: document.getElementById('stats-to').value
    };
    callAdmin('getStats', payload).then(function (res) {
      if (!res.ok) { showGlobalMsg(res.error, 'error'); return; }
      var s = res.stats;

      document.getElementById('stat-orders').textContent = s.totalOrders;
      document.getElementById('stat-boxes').textContent = s.totalBoxes + '박스';
      document.getElementById('stat-sales').textContent = formatWon(s.totalSales);
      document.getElementById('stat-donation').textContent = formatWon(s.totalDonation);
      document.getElementById('stat-donation-label').textContent = s.associationName + ' 기부금';

      var typeRows = Object.keys(s.byCustomerType).map(function (type) {
        var t = s.byCustomerType[type];
        return '<tr><td><span class="badge type-' + type + '">' + type + '</span></td><td class="text-right">' + t.orders + '건</td><td class="text-right">' + formatWon(t.sales) + '</td></tr>';
      }).join('');
      document.getElementById('stats-by-type-wrap').innerHTML =
        '<table><thead><tr><th>구분</th><th>주문 건수</th><th>매출</th></tr></thead><tbody>' + typeRows + '</tbody></table>';

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

  function loadConfig() {
    callAdmin('getConfig', {}).then(function (res) {
      if (!res.ok) return;
      document.getElementById('config-association-name').value = res.config.AssociationName || '';
    });
  }

  function saveConfig() {
    var name = document.getElementById('config-association-name').value.trim();
    callAdmin('updateConfig', { config: { AssociationName: name } }).then(function (r) {
      if (!r.ok) { showGlobalMsg(r.error, 'error'); return; }
      showGlobalMsg('설정이 저장되었습니다.', 'success');
      loadStats();
    });
  }
})();
