'use strict';

const { readFileSync } = require('node:fs');
const { Product, QuoteRequest } = require('./domain');

const database = JSON.parse(readFileSync('./db.json', 'utf8'));
const products = database.products.map((data) => new Product(data));
const findProduct = (title) => products.find(
  (product) => product.title.toLowerCase() === title.toLowerCase(),
);

const samples = [
  {
    requester: 'Ana Solis',
    email: 'ana@example.com',
    productTitle: 'Essence Mascara Lash Princess',
    quantity: 3,
  },
  {
    requester: 'Luis Mora',
    email: 'luis@example.com',
    productTitle: 'Eyeshadow Palette with Mirror',
    quantity: 1,
  },
  {
    requester: 'Marta Ruiz',
    email: 'marta@example.com',
    productTitle: 'Producto que no existe',
    quantity: 1,
  },
  {
    requester: 'Pedro Vega',
    email: 'correo-invalido',
    productTitle: 'Powder Canister',
    quantity: 0,
  },
];

for (const sample of samples) {
  const request = new QuoteRequest(sample);
  request.evaluateProduct(findProduct(request.productTitle));
  console.log(JSON.stringify(request.toJSON(), null, 2));
}
