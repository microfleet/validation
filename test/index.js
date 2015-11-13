const { expect } = require('chai');
const path = require('path');

describe('Validation', function validationSuite() {
  const Validation = require('../src');
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

  it('should reject promise with an IO Error on invalid dir', () => {
    return this.validator.init(BAD_PATH, true)
      .reflect()
      .then(result => {
        expect(result.isRejected()).to.be.eq(true);
        expect(result.reason().name).to.be.eq('IOError');
      });
  });

  it('should reject promise with a file not found error on an empty dir', () => {
    return this.validator.init(EMPTY_PATH, true)
      .reflect()
      .then(result => {
        expect(result.isRejected()).to.be.eq(true);
        expect(result.reason().name).to.be.eq('FileNotFoundError');
      });
  });

  it('should reject promise with a NotFoundError on a non-existant validator', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('bad-route', {})
      .reflect()
      .then(result => {
        expect(result.isRejected()).to.be.eq(true);
        expect(result.reason().name).to.be.eq('NotFoundError');
      });
  });

  it('should validate a correct object', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('custom', { string: 'not empty' })
      .reflect()
      .then(result => {
        expect(result.isFulfilled()).to.be.eq(true);
        expect(result.value()).to.be.deep.eq(true);
      });
  });

  it('should filter extra properties', () => {
    this.validator.init(CORRECT_PATH, false, true);
    return this.validator.validate('custom', { string: 'not empty', qq: 'not in schema' })
      .reflect()
      .then(result => {
        expect(result.isFulfilled()).to.be.eq(true);
        expect(result.value()).to.be.deep.eq({ string: 'not empty' });
      });
  });

  it('should return validation error on an invalid object', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('custom', { string: 'not empty', extraneous: true })
      .reflect()
      .then(result => {
        expect(result.isRejected()).to.be.eq(true);
        expect(result.reason().name).to.be.eq('ValidationError');
        expect(result.reason().code).to.be.eq(400);
      });
  });

  it('should perform sync validation', () => {
    this.validator.init(CORRECT_PATH);
    const result = this.validator.validateSync('custom', { string: 'not empty' });
    expect(result.error).to.be.eq(undefined);
    expect(result.doc).to.be.eq(true);
  });

  it('should filter out extra props on sync validation', () => {
    this.validator.init(CORRECT_PATH, false, true);
    const result = this.validator.validateSync('custom', { string: 'not empty', extra: true });
    expect(result.error).to.be.eq(undefined);
    expect(result.doc).to.be.deep.eq({ string: 'not empty' });
  });
});
