/**
 * 한국침도교육원 침도 주문/판매 관리 시스템 - 백엔드 (Google Apps Script)
 *
 * 이 파일은 Google Sheets에 연결된 Apps Script 프로젝트에 붙여넣어 사용합니다.
 * 자세한 설치 방법은 상위 폴더의 README.md 를 참고하세요.
 *
 * 이 백엔드 하나가 B2C(한의원 대상 소매)와 B2B(도매상 대상 도매) 두 프로그램을
 * 함께 지원합니다. 두 프로그램은 화면(웹페이지)은 완전히 분리되어 있지만,
 * **재고(Products 시트의 StockBoxes)는 하나로 공유**합니다 — B2C 소매 판매와
 * B2B(워니리스트) 공급이 같은 실물 재고에서 함께 차감되어야 하기 때문입니다.
 *
 * 시트 구성 (한 스프레드시트 안에 아래 8개의 탭이 필요합니다):
 *   Products      - 제품(재고) 정보 (B2C/B2B 공용, 회원가/비회원가/도매가를 함께 관리)
 *   Customers     - B2C 거래처(회원/비회원) 정보
 *   Orders        - B2C 주문 정보 (주문 1건 = 1행)
 *   OrderItems    - B2C 주문에 포함된 제품별 상세
 *   Distributors  - B2B 거래처(도매상, 예: 워니리스트) 정보
 *   B2BOrders     - B2B 주문 정보 (주문 1건 = 1행)
 *   B2BOrderItems - B2B 주문에 포함된 제품별 상세
 *   Config        - 관리자 비밀번호 등 설정값
 *
 * 이 스크립트를 처음 사용할 때는 Apps Script 편집기에서
 * initializeSheets 함수를 한 번 실행해서 시트와 기본값을 자동으로 만드세요.
 * (이미 B2C만 쓰고 있었다면, 이 함수를 다시 실행해도 안전합니다 — 기존 B2C 시트는
 * 그대로 두고 B2B에 필요한 시트만 새로 추가합니다.)
 *
 * [재고 차감 시점] 재고는 "주문 접수 시점"이 아니라 "출고 시점"(주문 상태를
 * 배송중 또는 완료로 변경하는 시점)에 차감됩니다. B2C의 Orders 시트와 B2B의
 * B2BOrders 시트 모두 StockDeducted 열로 이미 출고(차감) 처리되었는지를 추적하며,
 * 어느 쪽에서 차감하든 동일한 Products.StockBoxes 값이 줄어듭니다.
 */

// ---------- 공통 설정 ----------

var SHEET_NAMES = {
  PRODUCTS: 'Products',
  CUSTOMERS: 'Customers',
  ORDERS: 'Orders',
  ORDER_ITEMS: 'OrderItems',
  DISTRIBUTORS: 'Distributors',
  B2B_ORDERS: 'B2BOrders',
  B2B_ORDER_ITEMS: 'B2BOrderItems',
  CONFIG: 'Config'
};

// ProductID/ProductName/Spec은 B2C/B2B 공용이며, StockBoxes(재고)도 하나로 공유됩니다.
// MemberPrice/GuestPrice는 B2C 전용, WholesalePrice는 B2B(도매) 전용 가격입니다.
var PRODUCT_HEADERS = ['ProductID', 'ProductName', 'Spec', 'MemberPrice', 'GuestPrice', 'StockBoxes', 'DonationPerBox', 'Active', 'WholesalePrice'];
var CUSTOMER_HEADERS = ['CustomerID', 'Type', 'Name', 'BusinessName', 'Phone', 'Email', 'Address', 'JoinDate', 'Note'];
var ORDER_HEADERS = ['OrderID', 'Timestamp', 'CustomerType', 'CustomerID', 'CustomerName', 'BusinessName', 'Phone', 'Email', 'Address', 'Status', 'TotalAmount', 'DonationAmount', 'Memo', 'StockDeducted'];
var ORDER_ITEM_HEADERS = ['OrderID', 'ProductID', 'ProductName', 'BoxQty', 'UnitPrice', 'LineTotal', 'DonationPerBox', 'LineDonation'];

var DISTRIBUTOR_HEADERS = ['DistributorID', 'Name', 'ContactName', 'Phone', 'Email', 'Address', 'JoinDate', 'Note'];
var B2B_ORDER_HEADERS = ['OrderID', 'Timestamp', 'DistributorID', 'DistributorName', 'ResoldTo', 'Status', 'TotalAmount', 'DonationAmount', 'Memo', 'StockDeducted'];
var B2B_ORDER_ITEM_HEADERS = ['OrderID', 'ProductID', 'ProductName', 'BoxQty', 'UnitPrice', 'LineTotal', 'DonationPerBox', 'LineDonation'];
// 워니리스트가 공급받은 제품을 최종적으로 넘기는 재판매처 (참고 기록용 — 청구 대상이 바뀌지는 않습니다)
var RESOLD_TO_OPTIONS = ['워니리스트 자체', '안진메디팜', '이메디샾', '인티그레이션', '기타'];

var ORDER_STATUSES = ['접수', '확인중', '배송중', '완료', '취소'];
// 이 상태가 되는 순간 실제로 "출고"된 것으로 간주하고, 그 시점에 재고를 차감합니다.
var SHIPPED_STATUSES = ['배송중', '완료'];
var SESSION_HOURS = 8;

// ---------- 초기 설치용 함수 (Apps Script 편집기에서 한 번만 직접 실행) ----------

function initializeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureSheetWithHeaders_(ss, SHEET_NAMES.PRODUCTS, PRODUCT_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.CUSTOMERS, CUSTOMER_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDERS, ORDER_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.ORDER_ITEMS, ORDER_ITEM_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.DISTRIBUTORS, DISTRIBUTOR_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.B2B_ORDERS, B2B_ORDER_HEADERS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.B2B_ORDER_ITEMS, B2B_ORDER_ITEM_HEADERS);

  var configSheet = ensureSheetWithHeaders_(ss, SHEET_NAMES.CONFIG, ['Key', 'Value']);
  var configRows = sheetToObjects_(configSheet);
  var existingKeys = configRows.map(function (r) { return r.Key; });

  var defaults = [
    ['AdminPassword', 'changeme123'],
    ['AssociationName', '대한침도의학회'],
    ['DefaultDonationPerBox', '1000']
  ];
  defaults.forEach(function (pair) {
    if (existingKeys.indexOf(pair[0]) === -1) {
      configSheet.appendRow(pair);
    }
  });

  var productSheet = ss.getSheetByName(SHEET_NAMES.PRODUCTS);
  if (productSheet.getLastRow() < 2) {
    // ProductID, ProductName, Spec, MemberPrice(회원가), GuestPrice(비회원가), StockBoxes, DonationPerBox, Active, WholesalePrice(도매가)
    productSheet.appendRow(['P001', '침도 (예시 제품)', '1box=10개입', 45000, 50000, 100, 1000, true, 40000]);
  }

  var distributorSheet = ss.getSheetByName(SHEET_NAMES.DISTRIBUTORS);
  if (distributorSheet.getLastRow() < 2) {
    distributorSheet.appendRow([
      'D001',
      '워니리스트',
      '',
      '',
      '',
      '',
      Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd'),
      '하위 재판매처: 안진메디팜, 이메디샾, 인티그레이션 (직접 청구 대상 아님, 참고용)'
    ]);
  }

  Logger.log('초기화 완료. Config 시트에서 AdminPassword를 꼭 변경하세요. Products 시트에 WholesalePrice(도매가) 열도 확인해주세요.');
}

/**
 * [1회성 실행용] 실제 판매 제품 8종으로 Products 시트를 새로 채웁니다.
 * Apps Script 편집기에서 함수 선택 드롭다운에 이 함수를 선택하고
 * 실행(▶) 버튼을 눌러 딱 한 번만 실행하세요.
 *
 * ⚠️ 기존 Products 시트 내용을 전부 지우고 아래 8개 제품으로 새로 채웁니다.
 * 이미 등록해둔 다른 제품이 있다면 이 함수를 실행하기 전에 먼저 백업해두세요.
 *
 * 재고 수량(StockBoxes)은 우선 0으로 채워집니다. 실제 현재 재고 수량은
 * 이 함수 실행 후 관리자 페이지의 "재고 관리" 탭에서 직접 입력해주세요.
 * 학회 기부금(DonationPerBox)도 일단 기존 기본값(1,000원/박스)으로 채워지니,
 * 제품마다 다르게 설정하고 싶으시면 관리자 페이지에서 수정해주세요.
 */
function setupRealProducts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.PRODUCTS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.PRODUCTS);

  sheet.clear();
  sheet.appendRow(PRODUCT_HEADERS);
  sheet.setFrozenRows(1);

  // ProductID, ProductName, Spec, MemberPrice(회원가), GuestPrice(비회원가), StockBoxes, DonationPerBox, Active, WholesalePrice(도매가)
  var codes = ['3540', '4030', '4040', '5060', '6050', '6075', '5040', '8080'];
  codes.forEach(function (code) {
    sheet.appendRow([code, code, '1box=50개입', 21000, 23000, 0, 1000, true, 0]);
  });

  Logger.log('실제 판매 제품 8종(' + codes.join(', ') + ')으로 Products 시트를 새로 설정했습니다. 재고 수량은 관리자 페이지에서 실제 값으로 수정해주세요.');
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
      return jsonOutput_({ ok: true, message: '한국침도교육원 침도 주문관리 시스템 API가 정상 동작 중입니다.' });
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
    case 'getCustomerStatement': return getCustomerStatement_(payload);
    case 'getConfig': return getConfigForAdmin_();
    case 'updateConfig': return updateConfig_(payload);

    // ---- B2B(도매) 전용 action — B2C와 같은 백엔드/재고를 공유하지만 화면은 별도입니다 ----
    case 'listDistributors': return listDistributors_();
    case 'upsertDistributor': return upsertDistributor_(payload);

    case 'createB2BOrder': return createB2BOrder_(payload);
    case 'listB2BOrders': return listB2BOrders_(payload);
    case 'updateB2BOrderStatus': return updateB2BOrderStatus_(payload);

    case 'getB2BStats': return getB2BStats_(payload);
    case 'getDistributorStatement': return getDistributorStatement_(payload);
    case 'getResoldToOptions': return { ok: true, options: RESOLD_TO_OPTIONS };

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
        memberPrice: Number(r.MemberPrice) || 0,
        guestPrice: Number(r.GuestPrice) || 0,
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
      Number(p.MemberPrice) || 0,
      Number(p.GuestPrice) || 0,
      Number(p.StockBoxes) || 0,
      Number(p.DonationPerBox) || 0,
      p.Active === false ? false : true,
      Number(p.WholesalePrice) || 0
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
  // 같은 연락처로 재주문하면 새로 만들지 않고 기존 비회원 거래처를 그대로 재사용합니다.
  // (거래처별 정산서를 뽑을 때 같은 사람의 주문이 하나로 모이도록 하기 위함)
  var sheet = getSheet_(SHEET_NAMES.CUSTOMERS);

  if (guestInfo.phone) {
    var rows = sheetToObjects_(sheet);
    var existing = rows.filter(function (c) {
      return c.Type === '비회원' && c.Phone && String(c.Phone) === String(guestInfo.phone);
    })[0];
    if (existing) return existing.CustomerID;
  }

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

  // 이 시점에는 재고를 차감하지 않습니다 (재고 차감은 "출고" 처리 시점에 일어납니다).
  // 다만 존재하지 않는 제품이나 잘못된 수량은 미리 걸러냅니다.
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var product = productMap[it.productId];
    if (!product) return { ok: false, error: '존재하지 않는 제품입니다: ' + it.productId };
    var qty = Number(it.boxQty) || 0;
    if (qty <= 0) return { ok: false, error: '수량은 1박스 이상이어야 합니다.' };
  }

  var orderId = generateId_('O');
  var totalAmount = 0;
  var totalDonation = 0;
  var orderItemRows = [];

  items.forEach(function (it) {
    var product = productMap[it.productId];
    var qty = Number(it.boxQty);
    // 회원/비회원 여부에 따라 다른 박스 단가를 적용합니다.
    var unitPrice = customerType === '회원' ? (Number(product.MemberPrice) || 0) : (Number(product.GuestPrice) || 0);
    var donationPerBox = Number(product.DonationPerBox) || 0;
    var lineTotal = qty * unitPrice;
    var lineDonation = qty * donationPerBox;

    totalAmount += lineTotal;
    totalDonation += lineDonation;

    orderItemRows.push([orderId, product.ProductID, product.ProductName, qty, unitPrice, lineTotal, donationPerBox, lineDonation]);
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
    payload.memo || '',
    false
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
  var deductedCol = ORDER_HEADERS.indexOf('StockDeducted') + 1;
  var wasDeducted = sheet.getRange(rowIndex, deductedCol).getValue() === true;
  var newStatus = payload.status;

  if (newStatus === '취소') {
    // 이미 출고(재고 차감)된 주문을 취소하는 경우에만 재고를 복원합니다.
    if (wasDeducted) {
      restoreStockForOrder_(payload.orderId);
      sheet.getRange(rowIndex, deductedCol).setValue(false);
    }
  } else if (SHIPPED_STATUSES.indexOf(newStatus) !== -1 && !wasDeducted) {
    // 배송중/완료로 처음 바뀌는 시점 = 출고 시점: 이때 실제로 재고를 차감합니다.
    var deductResult = deductStockForOrder_(payload.orderId);
    if (!deductResult.ok) return deductResult;
    sheet.getRange(rowIndex, deductedCol).setValue(true);
  } else if (SHIPPED_STATUSES.indexOf(newStatus) === -1 && wasDeducted) {
    // 이미 출고 처리된 주문을 출고 이전 상태(접수/확인중)로 되돌리는 경우 재고를 복원합니다.
    restoreStockForOrder_(payload.orderId);
    sheet.getRange(rowIndex, deductedCol).setValue(false);
  }

  sheet.getRange(rowIndex, statusCol).setValue(newStatus);
  return { ok: true };
}

// 아래 두 함수는 B2C(OrderItems)와 B2B(B2BOrderItems) 양쪽에서 공용으로 사용합니다.
// 항상 같은 Products.StockBoxes 값을 차감/복원하므로, 판매 경로와 무관하게 재고가 하나로 유지됩니다.
function deductStockForItems_(items) {
  var productSheet = getSheet_(SHEET_NAMES.PRODUCTS);
  var stockCol = PRODUCT_HEADERS.indexOf('StockBoxes') + 1;

  // 하나라도 재고가 부족하면 전체 출고 처리를 하지 않습니다 (부분 출고 방지).
  for (var i = 0; i < items.length; i++) {
    var rowIndex = findRowIndexById_(productSheet, 'ProductID', items[i].ProductID);
    if (rowIndex === -1) continue;
    var currentStock = Number(productSheet.getRange(rowIndex, stockCol).getValue());
    if (currentStock < Number(items[i].BoxQty)) {
      return {
        ok: false,
        error: items[i].ProductName + '의 재고가 부족하여 출고 처리할 수 없습니다. (현재 재고: ' + currentStock + '박스, 필요 수량: ' + items[i].BoxQty + '박스)'
      };
    }
  }

  items.forEach(function (it) {
    var rowIndex = findRowIndexById_(productSheet, 'ProductID', it.ProductID);
    if (rowIndex === -1) return;
    var currentStock = Number(productSheet.getRange(rowIndex, stockCol).getValue());
    productSheet.getRange(rowIndex, stockCol).setValue(currentStock - Number(it.BoxQty));
  });

  return { ok: true };
}

function restoreStockForItems_(items) {
  var productSheet = getSheet_(SHEET_NAMES.PRODUCTS);
  var stockCol = PRODUCT_HEADERS.indexOf('StockBoxes') + 1;

  items.forEach(function (it) {
    var rowIndex = findRowIndexById_(productSheet, 'ProductID', it.ProductID);
    if (rowIndex === -1) return;
    var currentStock = Number(productSheet.getRange(rowIndex, stockCol).getValue());
    productSheet.getRange(rowIndex, stockCol).setValue(currentStock + Number(it.BoxQty));
  });
}

function deductStockForOrder_(orderId) {
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.ORDER_ITEMS)).filter(function (it) { return it.OrderID === orderId; });
  return deductStockForItems_(items);
}

function restoreStockForOrder_(orderId) {
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.ORDER_ITEMS)).filter(function (it) { return it.OrderID === orderId; });
  restoreStockForItems_(items);
}

function deductStockForB2BOrder_(orderId) {
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.B2B_ORDER_ITEMS)).filter(function (it) { return it.OrderID === orderId; });
  return deductStockForItems_(items);
}

function restoreStockForB2BOrder_(orderId) {
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.B2B_ORDER_ITEMS)).filter(function (it) { return it.OrderID === orderId; });
  restoreStockForItems_(items);
}

// ---------- 매출 / 통계 / 학회 기부금 ----------

function getStats_(payload) {
  var orders = sheetToObjects_(getSheet_(SHEET_NAMES.ORDERS));
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.ORDER_ITEMS));

  var from = payload.from ? new Date(payload.from) : null;
  var to = payload.to ? new Date(payload.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  // 실제로 출고(재고 차감)된 주문만 매출/기부금으로 집계합니다.
  // (접수/확인중 상태는 아직 출고 전이라 매출로 잡지 않고, 취소된 주문은 출고 여부와
  //  무관하게 취소 처리 시 StockDeducted가 false로 복구되므로 자동으로 제외됩니다.)
  orders = orders.filter(function (o) {
    if (o.StockDeducted !== true) return false;
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
      associationName: config.AssociationName || '대한침도의학회',
      byProduct: Object.keys(byProduct).map(function (k) { return byProduct[k]; }),
      byCustomerType: byCustomerType
    }
  };
}

// ---------- 거래처별 정산서 ----------

function getCustomerStatement_(payload) {
  var customers = sheetToObjects_(getSheet_(SHEET_NAMES.CUSTOMERS));
  var customer = customers.filter(function (c) { return String(c.CustomerID) === String(payload.customerId); })[0];
  if (!customer) return { ok: false, error: '거래처를 찾을 수 없습니다.' };

  var from = payload.from ? new Date(payload.from) : null;
  var to = payload.to ? new Date(payload.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  var items = sheetToObjects_(getSheet_(SHEET_NAMES.ORDER_ITEMS));

  // 정산서는 실제로 출고된(=재고가 차감된) 주문만 대상으로 합니다.
  var orders = sheetToObjects_(getSheet_(SHEET_NAMES.ORDERS)).filter(function (o) {
    if (String(o.CustomerID) !== String(payload.customerId)) return false;
    if (o.StockDeducted !== true) return false;
    var ts = new Date(o.Timestamp);
    if (from && ts < from) return false;
    if (to && ts > to) return false;
    return true;
  });

  orders.sort(function (a, b) { return new Date(a.Timestamp) - new Date(b.Timestamp); });

  var grandTotal = 0;
  var totalBoxes = 0;
  orders.forEach(function (o) {
    o.items = items.filter(function (it) { return it.OrderID === o.OrderID; });
    grandTotal += Number(o.TotalAmount) || 0;
    o.items.forEach(function (it) { totalBoxes += Number(it.BoxQty) || 0; });
  });

  return {
    ok: true,
    statement: {
      customer: customer,
      from: payload.from || '',
      to: payload.to || '',
      orders: orders,
      grandTotal: grandTotal,
      totalBoxes: totalBoxes
    }
  };
}

// ================================================================
// ==================== B2B(도매) 전용 함수 ====================
// ================================================================
// 화면(admin.html)은 B2C와 완전히 분리되어 있지만, 아래 함수들은
// 위의 B2C 함수들과 같은 SHEET_NAMES.PRODUCTS(재고)를 공유해서 읽고 씁니다.
// 이 시스템은 완전 내부용(관리자 전용)이라, 아래 action들도 전부 관리자
// 로그인(token)을 필요로 합니다 — routeAction_의 PUBLIC_ACTIONS에 없기 때문입니다.

// ---------- B2B 거래처(도매상) ----------

function listDistributors_() {
  var rows = sheetToObjects_(getSheet_(SHEET_NAMES.DISTRIBUTORS));
  return { ok: true, distributors: rows };
}

function upsertDistributor_(payload) {
  var d = payload.distributor || {};
  var sheet = getSheet_(SHEET_NAMES.DISTRIBUTORS);

  if (d.DistributorID) {
    var rowIndex = findRowIndexById_(sheet, 'DistributorID', d.DistributorID);
    if (rowIndex === -1) return { ok: false, error: '거래처를 찾을 수 없습니다.' };
    var rowValues = DISTRIBUTOR_HEADERS.map(function (h) {
      return h in d ? d[h] : sheet.getRange(rowIndex, DISTRIBUTOR_HEADERS.indexOf(h) + 1).getValue();
    });
    sheet.getRange(rowIndex, 1, 1, DISTRIBUTOR_HEADERS.length).setValues([rowValues]);
    return { ok: true, distributorId: d.DistributorID };
  } else {
    var newId = generateId_('D');
    sheet.appendRow([
      newId,
      d.Name || '',
      d.ContactName || '',
      d.Phone || '',
      d.Email || '',
      d.Address || '',
      Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd'),
      d.Note || ''
    ]);
    return { ok: true, distributorId: newId };
  }
}

// ---------- B2B 주문 (관리자가 전화/메일로 받은 주문을 직접 입력) ----------

function createB2BOrder_(payload) {
  var items = payload.items || [];
  if (!items.length) return { ok: false, error: '주문할 제품을 1개 이상 선택해주세요.' };
  if (!payload.distributorId) return { ok: false, error: '거래처를 선택해주세요.' };

  var distributors = sheetToObjects_(getSheet_(SHEET_NAMES.DISTRIBUTORS));
  var distributor = distributors.filter(function (d) { return String(d.DistributorID) === String(payload.distributorId); })[0];
  if (!distributor) return { ok: false, error: '선택한 거래처를 찾을 수 없습니다.' };

  var products = sheetToObjects_(getSheet_(SHEET_NAMES.PRODUCTS));
  var productMap = {};
  products.forEach(function (p) { productMap[p.ProductID] = p; });

  // 이 시점에는 재고를 차감하지 않습니다 (재고 차감은 "출고" 처리 시점에 일어나며,
  // B2C와 같은 Products.StockBoxes를 함께 사용합니다).
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var product = productMap[it.productId];
    if (!product) return { ok: false, error: '존재하지 않는 제품입니다: ' + it.productId };
    var qty = Number(it.boxQty) || 0;
    if (qty <= 0) return { ok: false, error: '수량은 1박스 이상이어야 합니다.' };
  }

  var orderId = generateId_('BO');
  var totalAmount = 0;
  var orderItemRows = [];

  // B2B(도매)는 학회 기부금 집계 대상이 아니므로 기부금은 계산하지 않고 0으로 둡니다.
  // (Products 시트의 DonationPerBox 열 자체는 B2C가 계속 사용하므로 그대로 둡니다.)
  items.forEach(function (it) {
    var product = productMap[it.productId];
    var qty = Number(it.boxQty);
    var unitPrice = Number(product.WholesalePrice) || 0;
    var lineTotal = qty * unitPrice;

    totalAmount += lineTotal;

    orderItemRows.push([orderId, product.ProductID, product.ProductName, qty, unitPrice, lineTotal, 0, 0]);
  });

  getSheet_(SHEET_NAMES.B2B_ORDERS).appendRow([
    orderId,
    new Date(),
    distributor.DistributorID,
    distributor.Name,
    payload.resoldTo || '',
    '접수',
    totalAmount,
    0,
    payload.memo || '',
    false
  ]);

  var itemSheet = getSheet_(SHEET_NAMES.B2B_ORDER_ITEMS);
  orderItemRows.forEach(function (row) { itemSheet.appendRow(row); });

  return { ok: true, orderId: orderId, totalAmount: totalAmount };
}

function listB2BOrders_(payload) {
  var orders = sheetToObjects_(getSheet_(SHEET_NAMES.B2B_ORDERS));
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.B2B_ORDER_ITEMS));

  if (payload && payload.status) {
    orders = orders.filter(function (o) { return o.Status === payload.status; });
  }
  if (payload && payload.distributorId) {
    orders = orders.filter(function (o) { return String(o.DistributorID) === String(payload.distributorId); });
  }

  orders.sort(function (a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });

  orders.forEach(function (o) {
    o.items = items.filter(function (it) { return it.OrderID === o.OrderID; });
  });

  return { ok: true, orders: orders };
}

function updateB2BOrderStatus_(payload) {
  var sheet = getSheet_(SHEET_NAMES.B2B_ORDERS);
  var rowIndex = findRowIndexById_(sheet, 'OrderID', payload.orderId);
  if (rowIndex === -1) return { ok: false, error: '주문을 찾을 수 없습니다.' };
  if (ORDER_STATUSES.indexOf(payload.status) === -1) return { ok: false, error: '올바르지 않은 상태값입니다.' };

  var statusCol = B2B_ORDER_HEADERS.indexOf('Status') + 1;
  var deductedCol = B2B_ORDER_HEADERS.indexOf('StockDeducted') + 1;
  var wasDeducted = sheet.getRange(rowIndex, deductedCol).getValue() === true;
  var newStatus = payload.status;

  if (newStatus === '취소') {
    if (wasDeducted) {
      restoreStockForB2BOrder_(payload.orderId);
      sheet.getRange(rowIndex, deductedCol).setValue(false);
    }
  } else if (SHIPPED_STATUSES.indexOf(newStatus) !== -1 && !wasDeducted) {
    var deductResult = deductStockForB2BOrder_(payload.orderId);
    if (!deductResult.ok) return deductResult;
    sheet.getRange(rowIndex, deductedCol).setValue(true);
  } else if (SHIPPED_STATUSES.indexOf(newStatus) === -1 && wasDeducted) {
    restoreStockForB2BOrder_(payload.orderId);
    sheet.getRange(rowIndex, deductedCol).setValue(false);
  }

  sheet.getRange(rowIndex, statusCol).setValue(newStatus);
  return { ok: true };
}

// ---------- B2B 매출 / 통계 / 학회 기부금 ----------

function getB2BStats_(payload) {
  var orders = sheetToObjects_(getSheet_(SHEET_NAMES.B2B_ORDERS));
  var items = sheetToObjects_(getSheet_(SHEET_NAMES.B2B_ORDER_ITEMS));

  var from = payload.from ? new Date(payload.from) : null;
  var to = payload.to ? new Date(payload.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  orders = orders.filter(function (o) {
    if (o.StockDeducted !== true) return false;
    var ts = new Date(o.Timestamp);
    if (from && ts < from) return false;
    if (to && ts > to) return false;
    return true;
  });

  var orderIds = {};
  orders.forEach(function (o) { orderIds[o.OrderID] = o; });
  var relevantItems = items.filter(function (it) { return orderIds[it.OrderID]; });

  // B2B는 학회 기부금을 집계하지 않습니다.
  var totalSales = 0, totalBoxes = 0;
  var byProduct = {};
  var byResoldTo = {};

  orders.forEach(function (o) {
    totalSales += Number(o.TotalAmount) || 0;
    var key = o.ResoldTo || '미지정';
    var stat = byResoldTo[key] || (byResoldTo[key] = { orders: 0, sales: 0 });
    stat.orders += 1;
    stat.sales += Number(o.TotalAmount) || 0;
  });

  relevantItems.forEach(function (it) {
    totalBoxes += Number(it.BoxQty) || 0;
    var key = it.ProductID;
    if (!byProduct[key]) {
      byProduct[key] = { productId: it.ProductID, productName: it.ProductName, boxes: 0, sales: 0 };
    }
    byProduct[key].boxes += Number(it.BoxQty) || 0;
    byProduct[key].sales += Number(it.LineTotal) || 0;
  });

  return {
    ok: true,
    stats: {
      totalOrders: orders.length,
      totalBoxes: totalBoxes,
      totalSales: totalSales,
      byProduct: Object.keys(byProduct).map(function (k) { return byProduct[k]; }),
      byResoldTo: byResoldTo
    }
  };
}

// ---------- B2B 거래처별 정산서 ----------

function getDistributorStatement_(payload) {
  var distributors = sheetToObjects_(getSheet_(SHEET_NAMES.DISTRIBUTORS));
  var distributor = distributors.filter(function (d) { return String(d.DistributorID) === String(payload.distributorId); })[0];
  if (!distributor) return { ok: false, error: '거래처를 찾을 수 없습니다.' };

  var from = payload.from ? new Date(payload.from) : null;
  var to = payload.to ? new Date(payload.to) : null;
  if (to) to.setHours(23, 59, 59, 999);

  var items = sheetToObjects_(getSheet_(SHEET_NAMES.B2B_ORDER_ITEMS));

  var orders = sheetToObjects_(getSheet_(SHEET_NAMES.B2B_ORDERS)).filter(function (o) {
    if (String(o.DistributorID) !== String(payload.distributorId)) return false;
    if (o.StockDeducted !== true) return false;
    var ts = new Date(o.Timestamp);
    if (from && ts < from) return false;
    if (to && ts > to) return false;
    return true;
  });

  orders.sort(function (a, b) { return new Date(a.Timestamp) - new Date(b.Timestamp); });

  var grandTotal = 0;
  var totalBoxes = 0;
  orders.forEach(function (o) {
    o.items = items.filter(function (it) { return it.OrderID === o.OrderID; });
    grandTotal += Number(o.TotalAmount) || 0;
    o.items.forEach(function (it) { totalBoxes += Number(it.BoxQty) || 0; });
  });

  return {
    ok: true,
    statement: {
      distributor: distributor,
      from: payload.from || '',
      to: payload.to || '',
      orders: orders,
      grandTotal: grandTotal,
      totalBoxes: totalBoxes
    }
  };
}
