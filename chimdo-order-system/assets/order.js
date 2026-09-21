(function () {
  document.getElementById('site-title').textContent = window.APP_CONFIG.SITE_NAME;

  var state = {
    customerType: '회원',
    customers: [],
    products: [],
    items: [{ productId: '', boxQty: 1 }]
  };

  var msgArea = document.getElementById('msg-area');
  var itemsContainer = document.getElementById('items-container');
  var totalAmountEl = document.getElementById('total-amount');

  function showMessage(text, type) {
    msgArea.innerHTML = '<div class="msg ' + type + '">' + escapeHtml(text) + '</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearMessage() { msgArea.innerHTML = ''; }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
  }

  function formatWon(n) {
    return Number(n || 0).toLocaleString('ko-KR') + '원';
  }

  // ---- 회원/비회원 토글 ----
  var btnMember = document.getElementById('btn-member');
  var btnGuest = document.getElementById('btn-guest');
  var memberArea = document.getElementById('member-area');
  var guestArea = document.getElementById('guest-area');

  btnMember.addEventListener('click', function () {
    state.customerType = '회원';
    btnMember.classList.add('active');
    btnGuest.classList.remove('active');
    memberArea.classList.remove('hidden');
    guestArea.classList.add('hidden');
  });
  btnGuest.addEventListener('click', function () {
    state.customerType = '비회원';
    btnGuest.classList.add('active');
    btnMember.classList.remove('active');
    guestArea.classList.remove('hidden');
    memberArea.classList.add('hidden');
  });

  // ---- 거래처(회원) 목록 로드 ----
  var memberSelect = document.getElementById('member-select');
  var memberSelectHint = document.getElementById('member-select-hint');

  window.chimdoApi.call('listCustomers', { type: '회원' })
    .then(function (res) {
      if (!res.ok) throw new Error(res.error);
      state.customers = res.customers || [];
      if (!state.customers.length) {
        memberSelectHint.textContent = '등록된 회원 거래처가 없습니다. 관리자에게 거래처 등록을 요청해주세요.';
        return;
      }
      memberSelect.innerHTML = state.customers.map(function (c) {
        return '<option value="' + c.CustomerID + '">' + escapeHtml(c.Name) + (c.BusinessName ? ' (' + escapeHtml(c.BusinessName) + ')' : '') + '</option>';
      }).join('');
      memberSelectHint.textContent = '';
    })
    .catch(function (err) {
      memberSelectHint.textContent = err.message;
    });

  // ---- 제품 목록 로드 ----
  window.chimdoApi.call('getProducts', {})
    .then(function (res) {
      if (!res.ok) throw new Error(res.error);
      state.products = res.products || [];
      renderItems();
    })
    .catch(function (err) {
      showMessage(err.message, 'error');
    });

  // ---- 주문 항목(제품 줄) 렌더링 ----
  function productOptionsHtml(selectedId) {
    return '<option value="">제품 선택</option>' + state.products.map(function (p) {
      var sel = p.productId === selectedId ? ' selected' : '';
      return '<option value="' + p.productId + '"' + sel + '>' + escapeHtml(p.productName) + ' - ' + formatWon(p.unitPrice) + '/박스 (재고 ' + p.stockBoxes + ')</option>';
    }).join('');
  }

  function renderItems() {
    itemsContainer.innerHTML = state.items.map(function (item, idx) {
      return (
        '<div class="item-row" data-idx="' + idx + '">' +
          '<select class="item-product">' + productOptionsHtml(item.productId) + '</select>' +
          '<input type="number" class="item-qty" min="1" value="' + item.boxQty + '" placeholder="박스 수량">' +
          '<span class="text-muted item-subtotal"></span>' +
          '<button type="button" class="btn secondary small item-remove">삭제</button>' +
        '</div>'
      );
    }).join('');

    Array.prototype.forEach.call(itemsContainer.querySelectorAll('.item-product'), function (sel, idx) {
      sel.addEventListener('change', function () { state.items[idx].productId = sel.value; updateTotal(); });
    });
    Array.prototype.forEach.call(itemsContainer.querySelectorAll('.item-qty'), function (input, idx) {
      input.addEventListener('input', function () {
        state.items[idx].boxQty = Number(input.value) || 0;
        updateTotal();
      });
    });
    Array.prototype.forEach.call(itemsContainer.querySelectorAll('.item-remove'), function (btn, idx) {
      btn.addEventListener('click', function () {
        if (state.items.length === 1) return;
        state.items.splice(idx, 1);
        renderItems();
      });
    });

    updateTotal();
  }

  function updateTotal() {
    var total = 0;
    var subtotalEls = itemsContainer.querySelectorAll('.item-subtotal');
    state.items.forEach(function (item, idx) {
      var product = state.products.filter(function (p) { return p.productId === item.productId; })[0];
      var subtotal = product ? product.unitPrice * (item.boxQty || 0) : 0;
      total += subtotal;
      if (subtotalEls[idx]) subtotalEls[idx].textContent = product ? formatWon(subtotal) : '';
    });
    totalAmountEl.textContent = formatWon(total);
  }

  document.getElementById('btn-add-item').addEventListener('click', function () {
    state.items.push({ productId: '', boxQty: 1 });
    renderItems();
  });

  // ---- 주문 제출 ----
  document.getElementById('btn-submit').addEventListener('click', function () {
    clearMessage();

    var validItems = state.items.filter(function (i) { return i.productId && i.boxQty > 0; });
    if (!validItems.length) {
      showMessage('제품과 수량을 1개 이상 올바르게 선택해주세요.', 'error');
      return;
    }

    var payload = {
      customerType: state.customerType,
      items: validItems.map(function (i) { return { productId: i.productId, boxQty: i.boxQty }; }),
      memo: document.getElementById('memo').value
    };

    if (state.customerType === '회원') {
      if (!memberSelect.value) {
        showMessage('거래처를 선택해주세요.', 'error');
        return;
      }
      payload.customerId = memberSelect.value;
    } else {
      var name = document.getElementById('guest-name').value.trim();
      var phone = document.getElementById('guest-phone').value.trim();
      if (!name || !phone) {
        showMessage('이름과 연락처는 필수입니다.', 'error');
        return;
      }
      payload.guestInfo = {
        name: name,
        phone: phone,
        businessName: document.getElementById('guest-business').value.trim(),
        email: document.getElementById('guest-email').value.trim(),
        address: document.getElementById('guest-address').value.trim()
      };
    }

    var submitBtn = document.getElementById('btn-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = '주문 처리 중...';

    window.chimdoApi.call('createOrder', payload)
      .then(function (res) {
        if (!res.ok) throw new Error(res.error);
        showMessage('주문이 정상적으로 접수되었습니다. (주문번호: ' + res.orderId + ', 결제 예상 금액: ' + formatWon(res.totalAmount) + ')', 'success');
        state.items = [{ productId: '', boxQty: 1 }];
        renderItems();
        document.getElementById('memo').value = '';
      })
      .catch(function (err) {
        showMessage(err.message, 'error');
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = '주문 접수하기';
      });
  });
})();
