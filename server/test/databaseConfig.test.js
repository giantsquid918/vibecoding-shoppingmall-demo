const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveMongoUri } = require('../index');

const localMongoUri = 'mongodb://127.0.0.1:27017/shoppingmall';

test('uses the Atlas URI when MONGODB_ATLAS_URL is configured', () => {
  const atlasUri = 'mongodb+srv://example.mongodb.net/shoppingmall';

  assert.equal(resolveMongoUri({ MONGODB_ATLAS_URL: atlasUri }), atlasUri);
});

test('falls back to localhost only when MONGODB_ATLAS_URL is absent or blank', () => {
  assert.equal(resolveMongoUri({}), localMongoUri);
  assert.equal(resolveMongoUri({ MONGODB_ATLAS_URL: '' }), localMongoUri);
  assert.equal(resolveMongoUri({ MONGODB_ATLAS_URL: '   ' }), localMongoUri);
  assert.equal(
    resolveMongoUri({ MONGODB_URI: 'mongodb+srv://legacy.mongodb.net/shoppingmall' }),
    localMongoUri,
  );
});
