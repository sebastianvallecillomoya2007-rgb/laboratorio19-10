'use strict';

const { writeFileSync } = require('node:fs');

const parseEmailCode = String.raw`
const source = $input.first().json;
const body = String(source.textPlain || source.text || source.body || source.html || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ');
const lineValue = (label) => {
  const match = body.match(new RegExp('(?:^|\\n)\\s*' + label + '\\s*:\\s*([^\\r\\n]+)', 'i'));
  return match ? match[1].trim() : '';
};
const sender = source.from || source.sender || {};
const firstSender = sender.value && sender.value[0] ? sender.value[0] : {};
const fromText = typeof sender === 'string' ? sender : (sender.text || '');
const emailMatch = String(firstSender.address || fromText).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
const email = emailMatch ? emailMatch[0] : '';
const name = lineValue('Nombre') || firstSender.name ||
  (fromText.includes('<') ? fromText.split('<')[0].replace(/"/g, '').trim() : email.split('@')[0]);
const productTitle = lineValue('Producto');
const quantityText = lineValue('Cantidad');
const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : NaN;
const errors = [];
if (!name) errors.push('Falta el nombre del solicitante.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('El correo del solicitante no es válido.');
if (!productTitle) errors.push('Falta el producto solicitado.');
if (!Number.isInteger(quantity) || quantity <= 0) errors.push('La cantidad debe ser un entero mayor que cero.');
const valid = errors.length === 0;
return [{ json: {
  id: 'COT-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
  requester: name,
  email,
  productTitle,
  quantity: Number.isNaN(quantity) ? null : quantity,
  productId: null,
  availableStock: null,
  status: valid ? 'recibida' : 'error_datos',
  error: valid ? null : errors.join(' '),
  createdAt: new Date().toISOString(),
  valid
} }];
`;

const catalogCode = String.raw`
const request = $('Parsear solicitud').first().json;
const response = $input.first().json;
const failed = response.error || (response.statusCode && response.statusCode >= 400) || !Array.isArray(response.products);
if (failed) {
  return [{ json: { ...request, catalogValid: false, status: 'error_api', error: 'No se pudo consultar el catálogo externo.' } }];
}
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const found = response.products.find((item) => normalize(item.title) === normalize(request.productTitle));
if (!found) {
  return [{ json: { ...request, catalogValid: false, status: 'producto_no_encontrado', error: 'El producto no existe en el catálogo externo.' } }];
}
return [{ json: { ...request, externalId: found.id, productTitle: found.title, catalogValid: true, status: 'catalogo_validado', error: null } }];
`;

const evaluateStockCode = String.raw`
class Product {
  constructor(data) {
    this.id = data.id;
    this.externalId = Number(data.externalId);
    this.title = String(data.title || '').trim();
    this.stock = Number(data.stock);
  }
  hasStock(quantity) {
    return Number.isInteger(quantity) && quantity > 0 && this.stock >= quantity;
  }
}
class QuoteRequest {
  constructor(data) {
    Object.assign(this, data);
    this.quantity = Number(data.quantity);
    this.productId = null;
    this.availableStock = null;
  }
  validate() {
    const errors = [];
    if (!this.requester) errors.push('Falta el nombre del solicitante.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) errors.push('El correo del solicitante no es válido.');
    if (!this.productTitle) errors.push('Falta el producto solicitado.');
    if (!Number.isInteger(this.quantity) || this.quantity <= 0) errors.push('La cantidad debe ser un entero mayor que cero.');
    return { valid: errors.length === 0, errors };
  }
  evaluateProduct(product) {
    const validation = this.validate();
    if (!validation.valid) {
      this.status = 'error_datos';
      this.error = validation.errors.join(' ');
      return this;
    }
    if (!product) {
      this.status = 'producto_no_encontrado';
      this.error = 'El producto no existe en el catálogo o inventario.';
      return this;
    }
    this.productId = product.id;
    this.productTitle = product.title;
    this.availableStock = product.stock;
    this.status = product.hasStock(this.quantity) ? 'pendiente' : 'sin_stock';
    this.error = null;
    return this;
  }
}
const requestData = $('Evaluar catálogo').first().json;
const result = $input.first().json;
if (result.error || (result.statusCode && result.statusCode >= 400)) {
  return [{ json: { ...requestData, productId: null, availableStock: null, status: 'error_inventario', error: 'No se pudo consultar el inventario en JSON Server.' } }];
}
const rows = Array.isArray(result) ? result : Array.isArray(result.body) ? result.body : (result.id ? [result] : []);
const row = rows.find((item) => Number(item.externalId) === Number(requestData.externalId));
const product = row ? new Product(row) : null;
const request = new QuoteRequest(requestData).evaluateProduct(product);
return [{ json: {
  id: request.id,
  requester: request.requester,
  email: request.email,
  productId: request.productId,
  productTitle: request.productTitle,
  quantity: request.quantity,
  availableStock: request.availableStock,
  status: request.status,
  error: request.error,
  createdAt: request.createdAt
} }];
`;

const prepareErrorCode = String.raw`
const request = $input.first().json;
return [{ json: {
  id: request.id,
  requester: request.requester || '',
  email: request.email || '',
  productId: null,
  productTitle: request.productTitle || '',
  quantity: request.quantity,
  availableStock: null,
  status: request.status || 'error_datos',
  error: request.error || 'La solicitud no pudo validarse.',
  createdAt: request.createdAt || new Date().toISOString()
} }];
`;

const workflow = {
  name: 'Recepcion de cotizaciones por correo',
  nodes: [
    {
      parameters: { mailbox: 'INBOX', postProcessAction: 'nothing', format: 'simple', options: {} },
      id: '22a2b554-a9c1-43bc-a005-001ab7100001',
      name: 'Email Trigger IMAP',
      type: 'n8n-nodes-base.emailReadImap',
      typeVersion: 2.1,
      position: [0, 300]
    },
    {
      parameters: { mode: 'runOnceForAllItems', jsCode: parseEmailCode },
      id: '22a2b554-a9c1-43bc-a005-001ab7100002',
      name: 'Parsear solicitud',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 300]
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: 'valid-request', leftValue: '={{ $json.valid }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and'
        },
        options: {}
      },
      id: '22a2b554-a9c1-43bc-a005-001ab7100003',
      name: 'Solicitud válida?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [440, 300]
    },
    {
      parameters: {
        url: 'https://dummyjson.com/products/search',
        sendQuery: true,
        queryParameters: { parameters: [{ name: 'q', value: '={{ $json.productTitle }}' }] },
        options: { timeout: 10000 }
      },
      id: '22a2b554-a9c1-43bc-a005-001ab7100004',
      name: 'Buscar producto API externa',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [680, 200],
      onError: 'continueRegularOutput'
    },
    {
      parameters: { mode: 'runOnceForAllItems', jsCode: catalogCode },
      id: '22a2b554-a9c1-43bc-a005-001ab7100005',
      name: 'Evaluar catálogo',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [900, 200]
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{ id: 'valid-catalog', leftValue: '={{ $json.catalogValid }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and'
        },
        options: {}
      },
      id: '22a2b554-a9c1-43bc-a005-001ab7100006',
      name: 'Producto validado?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [1120, 200]
    },
    {
      parameters: {
        url: 'http://localhost:3000/products',
        sendQuery: true,
        queryParameters: { parameters: [{ name: 'externalId', value: '={{ $json.externalId }}' }] },
        options: { timeout: 10000 }
      },
      id: '22a2b554-a9c1-43bc-a005-001ab7100007',
      name: 'Consultar inventario JSON Server',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1360, 120],
      alwaysOutputData: true,
      onError: 'continueRegularOutput'
    },
    {
      parameters: { mode: 'runOnceForAllItems', jsCode: evaluateStockCode },
      id: '22a2b554-a9c1-43bc-a005-001ab7100008',
      name: 'Evaluar inventario con POO',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1580, 120]
    },
    {
      parameters: { mode: 'runOnceForAllItems', jsCode: prepareErrorCode },
      id: '22a2b554-a9c1-43bc-a005-001ab7100009',
      name: 'Preparar registro de error',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1360, 340]
    },
    {
      parameters: {
        method: 'POST',
        url: 'http://localhost:3000/quotes',
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ $json }}',
        options: { timeout: 10000 }
      },
      id: '22a2b554-a9c1-43bc-a005-001ab7100010',
      name: 'Registrar cotización',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1820, 260]
    }
  ],
  connections: {
    'Email Trigger IMAP': { main: [[{ node: 'Parsear solicitud', type: 'main', index: 0 }]] },
    'Parsear solicitud': { main: [[{ node: 'Solicitud válida?', type: 'main', index: 0 }]] },
    'Solicitud válida?': { main: [
      [{ node: 'Buscar producto API externa', type: 'main', index: 0 }],
      [{ node: 'Preparar registro de error', type: 'main', index: 0 }]
    ] },
    'Buscar producto API externa': { main: [[{ node: 'Evaluar catálogo', type: 'main', index: 0 }]] },
    'Evaluar catálogo': { main: [[{ node: 'Producto validado?', type: 'main', index: 0 }]] },
    'Producto validado?': { main: [
      [{ node: 'Consultar inventario JSON Server', type: 'main', index: 0 }],
      [{ node: 'Preparar registro de error', type: 'main', index: 0 }]
    ] },
    'Consultar inventario JSON Server': { main: [[{ node: 'Evaluar inventario con POO', type: 'main', index: 0 }]] },
    'Evaluar inventario con POO': { main: [[{ node: 'Registrar cotización', type: 'main', index: 0 }]] },
    'Preparar registro de error': { main: [[{ node: 'Registrar cotización', type: 'main', index: 0 }]] }
  },
  active: false,
  settings: { executionOrder: 'v1' },
  versionId: '22a2b554-a9c1-43bc-a005-001ab7100011',
  meta: { templateCredsSetupCompleted: false },
  tags: []
};

writeFileSync('n8n_workflow.json', JSON.stringify(workflow, null, 2) + '\n');
console.log('Generado n8n_workflow.json con ' + workflow.nodes.length + ' nodos.');
