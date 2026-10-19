'use strict';

class Product {
  constructor({ id, externalId, title, stock }) {
    this.id = id;
    this.externalId = Number(externalId);
    this.title = String(title || '').trim();
    this.stock = Number(stock);
  }

  hasStock(quantity) {
    return Number.isInteger(quantity) && quantity > 0 && this.stock >= quantity;
  }
}

class QuoteRequest {
  constructor({
    id = `COT-${Date.now()}`,
    requester = '',
    email = '',
    productTitle = '',
    quantity,
    status = 'recibida',
    error = null,
    createdAt = new Date().toISOString(),
  }) {
    this.id = id;
    this.requester = String(requester).trim();
    this.email = String(email).trim();
    this.productTitle = String(productTitle).trim();
    this.quantity = Number(quantity);
    this.status = status;
    this.error = error;
    this.createdAt = createdAt;
    this.productId = null;
    this.availableStock = null;
  }

  validate() {
    const errors = [];
    if (!this.requester) errors.push('Falta el nombre del solicitante.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      errors.push('El correo del solicitante no es válido.');
    }
    if (!this.productTitle) errors.push('Falta el producto solicitado.');
    if (!Number.isInteger(this.quantity) || this.quantity <= 0) {
      errors.push('La cantidad debe ser un entero mayor que cero.');
    }
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

  markError(status, message) {
    this.status = status;
    this.error = message;
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      requester: this.requester,
      email: this.email,
      productId: this.productId,
      productTitle: this.productTitle,
      quantity: this.quantity,
      availableStock: this.availableStock,
      status: this.status,
      error: this.error,
      createdAt: this.createdAt,
    };
  }
}

module.exports = { Product, QuoteRequest };
