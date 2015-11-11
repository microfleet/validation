const path = require('path');
const Errors = require('common-errors');

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
    return this.validator.init(CORRECT_PATH);
  });

  it('should successfully init with a relative path', () => {
    return this.validator.init(RELATIVE_PATH);
  });

  it('should reject promise with an IO Error on invalid dir', () => {
    return this.validator.init(BAD_PATH, true)
      .then(() => {
        throw new Error('should not initialize');
      })
      .catchReturn(Errors.io.IOError);
  });

  it('should reject promise with a file not found error on an empty dir', () => {
    return this.validator.init(EMPTY_PATH, true)
      .then(() => {
        throw new Error('should not initialize');
      })
      .catchReturn(Errors.io.FileNotFoundError);
  });

  it('should reject promise with a NotFoundError on a non-existant validator', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('bad-route', {})
      .then(() => {
        throw new Error('should not initialize');
      })
      .catchReturn(Errors.NotFoundError);
  });

  it('should validate a correct object', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('custom', { string: 'not empty' });
  });

  it('should return validation error on an invalid object', () => {
    this.validator.init(CORRECT_PATH);
    return this.validator.validate('custom', { string: 'not empty', extraneous: true })
      .catchReturn(Errors.ValidationError);
  });
});
