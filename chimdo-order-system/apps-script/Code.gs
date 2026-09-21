/**
 * 침도 주문/판매 관리 시스템 - 백엔드 (Google Apps Script)
 *
 * 이 파일은 Google Sheets에 연결된 Apps Script 프로젝트에 붙여넣어 사용합니다.
 * 자세한 설치 방법은 상위 폴더의 README.md 를 참고하세요.
 *
 * 시트 구성 (한 스프레드시트 안에 아래 5개의 탭이 필요합니다):
 *   Products     - 제품(재고) 정보
 *   Customers    - 거래처(회원/비회원) 정보
 *   Orders       - 주문 정보 (주문 1건 = 1행)
 *   OrderItems   - 주문에 포함된 제품별 상세 (주문 1건에 여러 제품 가능)
 *   Config       - 관리자 비밀번호 등 설정값
 *
 * 이 스크립트를 처음 사용할 때는 Apps Script 편집기에서
 * initializeSheets 함수를 한 번 실행해서 시트와 기본값을 자동으로 만드세요.
 */

// ---------- 공통 설정 ----------

var SHEET_NAMES = {
  PRODUCTS: 'Products',
  CUSTOMERS: 'Customers',
  ORDERS: 'Orders',
  ORDER_ITEMS: 'OrderItems',
  CONFIG: 'Config'
};

var PRODUCT_HEADERS = ['ProductID', 'ProductName', 'Spec', 'UnitPrice', 'StockBoxes', 'DonationPerBox', 'Active'];
var CUSTOMER_HEADERS = ['CustomerID', 'Type', 'Name', 'BusinessName', 'Phone', 'Email', 'Address', 'JoinDate', 'Note'];
var ORDER_HEADERS = ['OrderID', 'Timestamp', 'CustomerType', 'CustomerID', 'CustomerName', 'BusinessName', 'Phone', 'Email', 'Address', 'Status', 'TotalAmount', 'DonationAmount', 'Memo'];
var ORDER_ITEM_HEADERS = ['OrderID', 'ProductID', 'ProductName', 'BoxQty', 'UnitPrice', 'LineTotal', 'DonationPerBox', 'LineDonation'];

var ORDER_STATUSES = ['접수', '확인중', '배송중', '완료', '취소'];
var SESSION_HOURS = 8;

// ---------- 초기 설치용 함수 (Apps Script 편집기에서 한 번만 직접 실행) ----------

function initializeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheetWithHeaders_(ss, SHEET_NAMES.PRODUCTS, PRODUCT_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.CUSTOMERS, CUSTOMER_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDERS, ORDER_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDER_ITEMS, ORDER_ITEM_HEADERS);

  var configSheet = ensureSheetWithHeaders_(ss, SHEET_NAMES.CONFIG, ['Key', 'Value']);
  var configRows = sheetToObjects_(configSheet);
  var existingKeys = configRows.map(function (r) { return r.Key; });

  var defaults = [
    ['AdminPassword', 'changeme123'],
    ['AssociationName', '학회'],
    ['DefaultDonationPerBox', '1000']
  ];
  defaults.forEach(function (pair) {
    if (existingKeys.indexOf(pair[0]) === -1) {
      configSheet.appendRow(pair);
    }
  });

  var productSheet = ss.getSheetByName(SHEET_NAMES.PRODUCTS);
  if (productSheet.getLastRow() < 2) {
    productSheet.appendRow(['P001', '침도 (예시 제품)', '1box=10개입', 50000, 100, 1000, true]);
  }

  Logger.log('초기화 완료. Config 시트에서 AdminPassword를 꼭 변경하세요.');
}

function ensureSheetWithHeaders_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ---------- 진입점: 웹앱 배포 시 Google이 호출하는 함수 ----------

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (!action) {
      return jsonOutput_({ ok: true, message: '침도 주문관리 시스템 API가 정상 동작 중입니다.' });
    }
    var payload = e.parameter.payload ? JSON.parse(e.parameter.payload) : {};
    return jsonOutput_(routeAction_(action, payload));
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var action = body.action;
    var payload = body.payload || {};
    return jsonOutput_(routeAction_(action, payload));
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- 액션 라우팅 ----------

var PUBLIC_ACTIONS = ['getProducts', 'createOrder', 'login'];

function routeAction_(action, payload) {
  if (!action) return { ok: false, error: 'action이 필요합니다.' };

  if (PUBLIC_ACTIONS.indexOf(action) === -1) {
    var authError = requireAdmin_(payload.token);
    if (authError) return authError;
  }

  switch (action) {
    case 'getProducts': return getPublicProducts_();
    case 'createOrder': return createOrder_(payload);
    case 'login': return adminLogin_(payload);

    case 'listOrders': return listOrders_(payload);
    case 'updateOrderStatus': return updateOrderStatus_(payload);

    case 'listCustomers': return listCustomers_(payload);
    case 'upsertCustomer': return upsertCustomer_(payload);

    case 'listProducts': return listProductsAdmin_();
    case 'upsertProduct': return upsertProduct_(payload);
    case 'adjustStock': return adjustStock_(payload);

    case 'getStats': return getStats_(payload);
    case 'getConfig': return getConfigForAdmin_();
    case 'updateConfig': return updateConfig_(payload);

    default: return { ok: false, error: '알 수 없는 action: ' + action };
  }
}

// ---------- 인증 ----------

function adminLogin_(payload) {
  var config = getConfigMap_();
  var storedPassword = config.AdminPassword || '';
  if (!payload.password || payload.password !== storedPassword) {
    return { ok: false, error: '비밀번호가 올바르지 않습니다.' };
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('session_' + token, 'valid', SESSION_HOURS * 60 * 60);
  return { ok: true, token: token };
}

function requireAdmin_(token) {
  if (!token) return { ok: false, error: '로그인이 필요합니다.' };
  var cached = CacheService.getScriptCache().get('session_' + token);
  if (!cached) return { ok: false, error: '세션이 만료되었습니다. 다시 로그인해주세요.' };
  return null;
}

// ---------- 시트 유틸 ----------

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + name + ' (initializeSheets를 먼저 실행하세요)');
  return sheet;
}

function sheetToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join('') === '') continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    obj._row = i + 1; // 실제 시트 상의 행 번호 (1-based, 헤더 포함)
    rows.push(obj);
  }
  return rows;
}

function findRowIndexById_(sheet, idColumnName, idValue) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf(idColumnName);
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(idValue)) return i + 1;
  }
  return -1;
}

function generateId_(prefix) {
  var now = new Date();
  var stamp = Utilities.formatDate(now, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyMMddHHmmss');
  var rand = Math.floor(Math.random() * 900 + 100);
  return prefix + stamp + rand;
}

function getConfigMap_() {
  var rows = sheetToObjects_(getSheet_(SHEET_NAMES.CONFIG));
  var map = {};
  rows.forEach(function (r) { map[r.Key] = r.Value; });
  return map;
}

function getConfigForAdmin_() {
  return { ok: true, config: getConfigMap_() };
}

function updateConfig_(payload) {
  var sheet = getSheet_(SHEET_NAMES.CONFIG);
  var rows = sheetToObjects_(sheet);
  var updates = payload.config || {};
  Object.keys(updates).forEach(function (key) {
    var existing = rows.filter(function (r) { return r.Key === key; })[0];
    if (existing) {
      sheet.getRange(existing._row, 2).setValue(updates[key]);
    } else {
      sheet.appendRow([key, updates[key]]);
    }
  });
  return { ok: true };
}

// ---------- 제품 / 재고 ----------

function getPublicProducts_() {
  var rows = sheetToObjects_(getSheet_(SHEET_NAMES.PRODUCTS));
  var products = rows
    .filter(function (r) { return r.Active === true || r.Active === 'TRUE' || r.Active === 'true'; })
    .map(function (r) {
      return {
        productId: r.ProductID,
        productName: r.ProductName,
        spec: r.Spec,
        unitPrice: Number(r.UnitPrice) || 0,
        stockBoxes: Number(r.StockBoxes) || 0
      };
    });
  return { ok: true, products: products };
}

function listProductsAdmin_() {
  var rows = sheetToObjects_(getSheet_(SHEET_NAMES.PRODUCTS));
  return { ok: true, products: rows };
}

function upsertProduct_(payload) {
  var p = payload.product || {};
  var sheet = getSheet_(SHEET_NAMES.PRODUCTS);

  if (p.ProductID) {
    var rowIndex = findRowIndexById_(sheet, 'ProductID', p.ProductID);
    if (rowIndex === -1) return { ok: false, error: '제품을 찾을 수 없습니다.' };
    var rowValues = PRODUCT_HEADERS.map(function (h) {
      return h in p ? p[h] : sheet.getRange(rowIndex, PRODUCT_HEADERS.indexOf(h) + 1).getValue();
    });
    sheet.getRange(rowIndex, 1, 1, PRODUCT_HEADERS.length).setValues([rowValues]);
    return { ok: true, productId: p.ProductID };
  } else {
    var newId = generateId_('P');
    sheet.appendRow([
      newId,
      p.ProductName || '',
      p.Spec || '',
      Number(p.UnitPrice) || 0,
      Number(p.StockBoxes) || 0,
      Number(p.DonationPerBox) || 0,
      p.Active === false ? false : true
    ]);
    return { ok: true, productId: newId };
  }
}

function adjustStock_(payload) {
  var sheet = getSheet_(SHEET_NAMES.PRODUCTS);
  var rowIndex = findRowIndexById_(sheet, 'ProductID', payload.productId);
  if (rowIndex === -1) return { ok: false, error: '제품을 찾을 수 없습니다.' };
  var col = PRODUCT_HEADERS.indexOf('StockBoxes') + 1;
  var current = Number(sheet.getRange(rowIndex, col).getValue()) || 0;
  var updated = current + Number(payload.delta || 0);
  if (updated < 0) return { ok: false, error: '재고는 0 미만이 될 수 없습니다.' };
  sheet.getRange(rowIndex, col).setValue(updated);
  return { ok: true, stockBoxes: updated };
}

// ---------- 거래처(고객) ----------

function listCustomers_(payload) {
  var rows = sheetToObjects_(getSheet_(SHEET_NAMES.CUSTOMERS));
  if (payload && payload.type) {
    rows = rows.filter(function (r) { return r.Type === payload.type; });
  }
  return { ok: true, customers: rows };
}

function upsertCustomer_(payload) {
  var c = payload.customer || {};
  var sheet = getSheet_(SHEET_NAMES.CUSTOMERS);

  if (c.CustomerID) {
    var rowIndex = findRowIndexById_(sheet, 'CustomerID', c.CustomerID);
    if (rowIndex === -1) return { ok: false, error: '거래처를 찾을 수 없습니다.' };
    var rowValues = CUSTOMER_HEADERS.map(function (h) {
      return h in c ? c[h] : sheet.getRange(rowIndex, CUSTOMER_HEADERS.indexOf(h) + 1).getValue();
    });
    sheet.getRange(rowIndex, 1, 1, CUSTOMER_HEADERS.length).setValues([rowValues]);
    return { ok: true, customerId: c.CustomerID };
  } else {
    var newId = generateId_('C');
    sheet.appendRow([
      newId,
      c.Type === '비회원' ? '비회원' : '회원',
      c.Name || '',
      c.BusinessName || '',
      c.Phone || '',
      c.Email || '',
      c.Address || '',
      Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd'),
      c.Note || ''
    ]);
    return { ok: true, customerId: newId };
  }
}

function findOrCreateGuestCustomer_(guestInfo) {
  // 비회원 주문 시, 이력 추적을 위해 Customers 시트에 '비회원' 타입으로 자동 기록합니다.
  var sheet = getSheet_(SHEET_NAMES.CUSTOMERS);
  var newId = generateId_('G');
  sheet.appendRow([
    newId,
    '비회원',
    guestInfo.name || '',
    guestInfo.businessName || '',
    guestInfo.phone || '',
    guestInfo.email || '',
    guestInfo.address || '',
    Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd'),
    '주문 시 자동 등록된 비회원'
  ]);
  return newId;
}

// ---------- 주문 ----------

function createOrder_(payload) {
  var items = payload.items || [];
  if (!items.length) return { ok: false, error: '주문할 제품을 1개 이상 선택해주세요.' };

  var customerType = payload.customerType === '비회원' ? '비회원' : '회원';
  var customerId = '';
  var customerName = '';
  var businessName = '';
  var phone = '';
  var email = '';
  var address = '';

  if (customerType === '회원') {
    if (!payload.customerId) return { ok: false, error: '회원 주문은 거래처(회원) 선택이 필요합니다.' };
    var customers = sheetToObjects_(getSheet_(SHEET_NAMES.CUSTOMERS));
    var found = customers.filter(function (c) { return String(c.CustomerID) === String(payload.customerId); })[0];
    if (!found) return { ok: false, error: '선택한 회원 거래처를 찾을 수 없습니다.' };
    customerId = found.CustomerID;
    customerName = found.Name;
    businessName = found.BusinessName;
    phone = found.Phone;
    email = found.Email;
    address = found.Address;
  } else {
    var guest = payload.guestInfo || {};
    if (!guest.name || !guest.phone) return { ok: false, error: '비회원 주문은 이름과 연락처가 필요합니다.' };
    customerId = findOrCreateGuestCustomer_(guest);
    customerName = guest.name;
    businessName = guest.businessName || '';
    phone = guest.phone;
    email = guest.email || '';
    address = guest.address || '';
  }

  var productSheet = getSheet_(SHEET_NAMES.PRODUCTS);
  var products = sheetToObjects_(productSheet);
  var productMap = {};
  products.forEach(function (p) { productMap[p.ProductID] = p; });

  // 재고 확인 (하나라도 부족하면 전체 주문을 생성하지 않음)
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var product = productMap[it.productId];
    if (!product) return { ok: false, error: '존재하지 않는 제품입니다: ' + it.productId };
    var qty = Number(it.boxQty) || 0;
    if (qty <= 0) return { ok: false, error: '수량은 1박스 이상이어야 합니다.' };
    if (Number(product.StockBoxes) < qty) {
      return { ok: false, error: product.ProductName + '의 재고가 부족합니다. (현재 재고: ' + product.StockBoxes + '박스)' };
    }
  }

  var orderId = generateId_('O');
  var totalAmount = 0;
  var totalDonation = 0;
  var orderItemRows = [];

  items.forEach(function (it) {
    var product = productMap[it.productId];
    var qty = Number(it.boxQty);
    var unitPrice = Number(product.UnitPrice) || 0;
    var donationPerBox = Number(product.DonationPerBox) || 0;
    var lineTotal = qty * unitPrice;
    var lineDonation = qty * donationPerBox;

    totalAmount += lineTotal;
    totalDonation += lineDonation;

    orderItemRows.push([orderId, product.ProductID, product.ProductName, qty, unitPrice, lineTotal, donationPerBox, lineDonation]);

    // 재고 차감
    var rowIndex = findRowIndexById_(productSheet, 'ProductID', product.ProductID);
    var stockCol = PRODUCT_HEADERS.indexOf('StockBoxes') + 1;
    var currentStock = Number(productSheet.getRange(rowIndex, stockCol).getValue());
    productSheet.getRange(rowIndex, stockCol).setValue(currentStock - qty);
  });

  getSheet_(SHEET_NAMES.ORDERS).appendRow([
    orderId,
    new Date(),
    customerType,
    customerId,
    customerName,
    businessName,
    phone,
    email,
    address,
    '접수',
    totalAmount,
    totalDonation,
    payload.memo || ''
  ]);

  var itemSheet = getSheet_(SHEET_NAMES.ORDER_ITEMS);
  orderItemRows.forEach(function (row) { itemSheet.appendRow(row); });

  return { ok: true, orderId: orderId, totalAmount: totalAmount, donationAmount: totalDonation };
}

function listOrders_(payload) {
  var orders = sheetToObjects_(getSheet_(SHEET_NAMES.ORDERS));
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.ORDER_ITEMS));

  if (payload && payload.status) {
    orders = orders.filter(function (o) { return o.Status === payload.status; });
  }
  if (payload && payload.customerType) {
    orders = orders.filter(function (o) { return o.CustomerType === payload.customerType; });
  }

  orders.sort(function (a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });

  orders.forEach(function (o) {
    o.items = items.filter(function (it) { return it.OrderID === o.OrderID; });
  });

  return { ok: true, orders: orders };
}

function updateOrderStatus_(payload) {
  var sheet = getSheet_(SHEET_NAMES.ORDERS);
  var rowIndex = findRowIndexById_(sheet, 'OrderID', payload.orderId);
  if (rowIndex === -1) return { ok: false, error: '주문을 찾을 수 없습니다.' };
  if (ORDER_STATUSES.indexOf(payload.status) === -1) return { ok: false, error: '올바르지 않은 상태값입니다.' };

  var statusCol = ORDER_HEADERS.indexOf('Status') + 1;
  var currentStatus = sheet.getRange(rowIndex, statusCol).getValue();

  // 취소로 변경할 때만 재고를 복원 (중복 복원 방지)
  if (payload.status === '취소' && currentStatus !== '취소') {
    restoreStockForOrder_(payload.orderId);
  }

  sheet.getRange(rowIndex, statusCol).setValue(payload.status);
  return { ok: true };
}

function restoreStockForOrder_(orderId) {
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.ORDER_ITEMS)).filter(function (it) { return it.OrderID === orderId; });
  var productSheet = getSheet_(SHEET_NAMES.PRODUCTS);
  var stockCol = PRODUCT_HEADERS.indexOf('StockBoxes') + 1;

  items.forEach(function (it) {
    var rowIndex = findRowIndexById_(productSheet, 'ProductID', it.ProductID);
    if (rowIndex === -1) return;
    var currentStock = Number(productSheet.getRange(rowIndex, stockCol).getValue());
    productSheet.getRange(rowIndex, stockCol).setValue(currentStock + Number(it.BoxQty));
  });
}

// ---------- 매출 / 통계 / 학회 기부금 ----------

function getStats_(payload) {
  var orders = sheetToObjects_(getSheet_(SHEET_NAMES.ORDERS));
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.ORDER_ITEMS));

  var from = payload.from ? new Date(payload.from) : null;
  var to = payload.to ? new Date(payload.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  // 취소된 주문은 매출/기부금 집계에서 제외
  orders = orders.filter(function (o) {
    if (o.Status === '취소') return false;
    var ts = new Date(o.Timestamp);
    if (from && ts < from) return false;
    if (to && ts > to) return false;
    return true;
  });

  var orderIds = {};
  orders.forEach(function (o) { orderIds[o.OrderID] = o; });
  var relevantItems = items.filter(function (it) { return orderIds[it.OrderID]; });

  var totalSales = 0, totalDonation = 0, totalBoxes = 0;
  var byProduct = {};
  var byCustomerType = { '회원': { orders: 0, sales: 0 }, '비회원': { orders: 0, sales: 0 } };

  orders.forEach(function (o) {
    totalSales += Number(o.TotalAmount) || 0;
    totalDonation += Number(o.DonationAmount) || 0;
    var typeStat = byCustomerType[o.CustomerType] || (byCustomerType[o.CustomerType] = { orders: 0, sales: 0 });
    typeStat.orders += 1;
    typeStat.sales += Number(o.TotalAmount) || 0;
  });

  relevantItems.forEach(function (it) {
    totalBoxes += Number(it.BoxQty) || 0;
    var key = it.ProductID;
    if (!byProduct[key]) {
      byProduct[key] = { productId: it.ProductID, productName: it.ProductName, boxes: 0, sales: 0, donation: 0 };
    }
    byProduct[key].boxes += Number(it.BoxQty) || 0;
    byProduct[key].sales += Number(it.LineTotal) || 0;
    byProduct[key].donation += Number(it.LineDonation) || 0;
  });

  var config = getConfigMap_();

  return {
    ok: true,
    stats: {
      totalOrders: orders.length,
      totalBoxes: totalBoxes,
      totalSales: totalSales,
      totalDonation: totalDonation,
      associationName: config.AssociationName || '학회',
      byProduct: Object.keys(byProduct).map(function (k) { return byProduct[k]; }),
      byCustomerType: byCustomerType
    }
  };
}
