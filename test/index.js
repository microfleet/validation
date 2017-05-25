const { expect } = require('chai');
const path = require('path');
const Validation = require('../lib');

describe('Validation', function validationSuite() {
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
        expect(result.isRejected()).to.be.eq(true);
        expect(result.reason().name).to.be.eq('IOError');
        return null;
      })
  ));

  it('should reject promise with a file not found error on an empty dir', () => (
    this.validator.init(EMPTY_PATH, true)
      .reflect()
      .then((result) => {
        expect(result.isRejected()).to.be.eq(true);
        expect(result.reason().name).to.be.eq('FileNotFoundError');
        return null;
      })
  ));

  it('should reject promise with a NotFoundError on a non-existant validator', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('bad-route', {})
      .reflect()
      .then((result) => {
        expect(result.isRejected()).to.be.eq(true);
        expect(result.reason().name).to.be.eq('NotFoundError');
        return null;
      });
  });

  it('should validate a correct object', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('custom', { string: 'not empty' })
      .reflect()
      .then((result) => {
        expect(result.isFulfilled()).to.be.eq(true);
        expect(result.value()).to.be.deep.eq({ string: 'not empty' });
        return null;
      });
  });

  it('should filter extra properties', () => {
    this.validator = new Validation(CORRECT_PATH, null, { removeAdditional: true });
    return this.validator.filter('custom', { string: 'not empty', qq: 'not in schema' })
      .reflect()
      .then((result) => {
        expect(result.isFulfilled()).to.be.eq(true);
        expect(result.value()).to.be.deep.eq({ string: 'not empty' });
        return null;
      });
  });

  it('should return validation error on an invalid object', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('custom', { string: 'not empty', extraneous: true })
      .reflect()
      .then((result) => {
        expect(result.isRejected()).to.be.eq(true);
        expect(result.reason().name).to.be.eq('ValidationError');
        expect(result.reason().code).to.be.eq(417);
        expect(result.reason().toJSON()).to.be.deep.eq({
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
    expect(result.error).to.be.eq(undefined);
    expect(result.doc).to.be.deep.eq({ string: 'not empty' });
  });

  it('should filter out extra props on sync validation', () => {
    this.validator = new Validation(CORRECT_PATH, null, { removeAdditional: true });
    const result = this.validator.validateSync('custom', { string: 'not empty', extra: true });
    // ajv does not throw errors in this case
    expect(result.error).to.be.eq(undefined);
    expect(result.doc).to.be.deep.eq({ string: 'not empty' });
  });
});
