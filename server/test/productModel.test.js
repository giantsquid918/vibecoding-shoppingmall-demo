const assert = require('node:assert/strict');
const test = require('node:test');
const Product = require('../models/Product');

test('accepts a product with required fields and no description', () => {
  const product = new Product({
    productId: 'TOP-001',
    name: '코튼 티셔츠',
    price: 25900,
    category: '상의',
    image: '/images/top-001.jpg',
  });

  assert.equal(product.validateSync(), undefined);
  assert.equal(product.description, undefined);
});

test('requires product fields and restricts categories', () => {
  const product = new Product({ category: '신발' });
  const error = product.validateSync();

  assert.ok(error);
  assert.deepEqual(
    Object.keys(error.errors).sort(),
    ['category', 'image', 'name', 'price', 'productId'].sort(),
  );
});

test('rejects negative prices', () => {
  const product = new Product({
    productId: 'TOP-002',
    name: '코튼 티셔츠',
    price: -1,
    category: '상의',
    image: '/images/top-002.jpg',
  });

  assert.equal(product.validateSync().errors.price.kind, 'min');
});

test('creates a unique database index for product IDs', () => {
  const productIdIndex = Product.schema
    .indexes()
    .find(([keys]) => keys.productId === 1);

  assert.ok(productIdIndex);
  assert.equal(productIdIndex[1].unique, true);
});
