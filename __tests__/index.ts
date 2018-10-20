import { io, NotFoundError } from 'common-errors';
import path = require('path');
import Validation, { HttpStatusError } from '../src';

const CORRECT_PATH = path.resolve(__dirname, './fixtures');
const BAD_PATH = path.resolve(__dirname, './notexistant');
const EMPTY_PATH = path.resolve(__dirname, './fixtures/empty');
const RELATIVE_PATH = './fixtures';

let validator: Validation;

beforeEach(() => {
  validator = new Validation();
});

test('should successfully init', () => {
  validator.init(CORRECT_PATH);

  expect(typeof validator.ajv.getSchema('custom')).toBe('function');
  expect(typeof validator.ajv.getSchema('core-no-id')).toBe('function');
  expect(typeof validator.ajv.getSchema('nested.no-id')).toBe('function');
});

test('should successfully init with a relative path', () => {
  validator.init(RELATIVE_PATH);

  expect(typeof validator.ajv.getSchema('custom')).toBe('function');
  expect(typeof validator.ajv.getSchema('core-no-id')).toBe('function');
  expect(typeof validator.ajv.getSchema('nested.no-id')).toBe('function');
});

test('should reject promise with an IO Error on invalid dir', async () => {
  expect.assertions(1);
  await expect(validator.init(BAD_PATH, true))
    .rejects.toThrow(io.IOError);
});

test('should reject promise with a file not found error on an empty dir', async () => {
  expect.assertions(1);
  await expect(validator.init(EMPTY_PATH, true))
    .rejects.toThrow(io.FileNotFoundError);
});

test('should reject promise with a NotFoundError on a non-existant validator', async () => {
  expect.assertions(1);
  validator.init(CORRECT_PATH);
  await expect(validator.validate('bad-route', {}))
    .rejects.toThrow(NotFoundError);
});

test('should validate a correct object', async () => {
  expect.assertions(1);
  validator.init(CORRECT_PATH);
  await expect(validator.validate('custom', { string: 'not empty' }))
    .resolves.toEqual({ string: 'not empty' });
});

test('should filter extra properties', async () => {
  expect.assertions(1);
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: true });
  await expect(validator.filter('custom', { string: 'not empty', qq: 'not in schema' }))
    .resolves.toEqual({ string: 'not empty' });
});

test('should return validation error on an invalid object', async () => {
  const reject = async () => validator.validate('custom', { string: 'not empty', extraneous: true });

  expect.assertions(3);
  validator.init(CORRECT_PATH);
  await expect(reject()).rejects.toThrow(HttpStatusError);

  const error = await reject().catch((e) => e);
  expect(error.statusCode).toBe(417);
  expect(JSON.parse(JSON.stringify(error))).toEqual({
    errors: [{
      field: '/extraneous',
      message: 'should NOT have additional properties',
      name: 'HttpStatusError',
      status: 400,
      statusCode: 400,
      status_code: 400,
    }],
    message: 'custom validation failed: data should NOT have additional properties',
    name: 'HttpStatusError',
    status: 417,
    statusCode: 417,
    status_code: 417,
  });
});

test('should perform sync validation', () => {
  validator.init(CORRECT_PATH);
  const result = validator.validateSync('custom', { string: 'not empty' });
  expect(result.error).toBeUndefined();
  expect(result.doc).toEqual({ string: 'not empty' });
});

test('should filter out extra props on sync validation', () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: true });
  const result = validator.validateSync('custom', { string: 'not empty', extra: true });
  // ajv does not throw errors in this case
  expect(result.error).toBeUndefined();
  expect(result.doc).toEqual({ string: 'not empty' });
});

test('throws when using ifError', () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: true });
  expect(() => validator.ifError('custom', { string: 200, extra: true }))
    .toThrow(HttpStatusError);
});

test('doesn\'t throw on ifError', () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: true });
  expect(validator.ifError('custom', { string: 'not empty', extra: true })).toEqual({
    string: 'not empty',
  });
});
