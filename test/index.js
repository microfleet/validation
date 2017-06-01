const assert = require('assert');
const path = require('path');

describe('Validation', function validationSuite() {
  const Validation = require('../lib');
  const CORRECT_PATH = path.resolve(__dirname, './fixtures');
  const BAD_PATH = path.resolve(__dirname, './notexistant');
  const EMPTY_PATH = path.resolve(__dirname, './fixtures/empty');
  const RELATIVE_PATH = './fixtures';

  beforeEach(() => {
    this.validator = new Validation();
  });

  it('should successfully init', () => {
    this.validator.init(CORRECT_PATH);
  });

  it('should successfully init with a relative path', () => {
    this.validator.init(RELATIVE_PATH);
  });

  it('should reject promise with an IO Error on invalid dir', () => (
    this.validator.init(BAD_PATH, true)
      .reflect()
      .then((result) => {
        assert.ok(result.isRejected());
        assert.equal(result.reason().name, 'IOError');
        return null;
      })
  ));

  it('should reject promise with a file not found error on an empty dir', () => (
    this.validator.init(EMPTY_PATH, true)
      .reflect()
      .then((result) => {
        assert.ok(result.isRejected());
        assert.equal(result.reason().name, 'FileNotFoundError');
        return null;
      })
  ));

  it('should reject promise with a NotFoundError on a non-existant validator', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('bad-route', {})
      .reflect()
      .then((result) => {
        assert.ok(result.isRejected());
        assert.equal(result.reason().name, 'NotFoundError');
        return null;
      });
  });

  it('should validate a correct object', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('custom', { string: 'not empty' })
      .reflect()
      .then((result) => {
        assert.ok(result.isFulfilled());
        assert.deepEqual(result.value(), { string: 'not empty' });
        return null;
      });
  });

  it('should filter extra properties', () => {
    this.validator = new Validation(CORRECT_PATH, null, { removeAdditional: true });
    return this.validator.filter('custom', { string: 'not empty', qq: 'not in schema' })
      .reflect()
      .then((result) => {
        assert.ok(result.isFulfilled());
        assert.deepEqual(result.value(), { string: 'not empty' });
        return null;
      });
  });

  it('should return validation error on an invalid object', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('custom', { string: 'not empty', extraneous: true })
      .reflect()
      .then((result) => {
        assert.ok(result.isRejected());

        const reason = result.reason();

        assert.equal(reason.name, 'ValidationError');
        assert.equal(reason.code, 417);
        assert.deepEqual(reason.toJSON(), {
          name: 'ValidationError',
          message: 'custom validation failed: data should NOT have additional properties',
          code: 417,
          errors: [{ name: 'ValidationError',
            message: 'should NOT have additional properties',
            code: 400,
            field: '/extraneous',
          }],
        });

        return null;
      });
  });

  it('should perform sync validation', () => {
    this.validator.init(CORRECT_PATH);
    const result = this.validator.validateSync('custom', { string: 'not empty' });

    assert.ifError(result.error);
    assert.deepEqual(result.doc, { string: 'not empty' });
  });

  it('should filter out extra props on sync validation', () => {
    this.validator = new Validation(CORRECT_PATH, null, { removeAdditional: true });
    const result = this.validator.validateSync('custom', { string: 'not empty', extra: true });
    // ajv does not throw errors in this case
    assert.ifError(result.error);
    assert.deepEqual(result.doc, { string: 'not empty' });
  });
});
