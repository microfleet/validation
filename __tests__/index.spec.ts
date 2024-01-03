import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { io, NotFoundError } from 'common-errors'
import Validation, { HttpStatusError } from '../src/index'

const CORRECT_PATH = path.resolve(__dirname, './fixtures')
const BAD_PATH = path.resolve(__dirname, './notexistant')
const EMPTY_PATH = path.resolve(__dirname, './fixtures/empty')
const FILE_PATH = path.resolve(__dirname, './fixtures/empty/.gitkeep')
const RELATIVE_PATH = './fixtures'

let validator: Validation

beforeEach(() => {
  validator = new Validation()
})

test('doesnt init on missing dir', () => {
  assert.rejects(validator.init(), TypeError)
})

test('should successfully init', async () => {
  validator = new Validation(CORRECT_PATH, () => true)
  await validator.init()

  assert.equal(typeof validator.ajv.getSchema('custom'), 'function', 'custom')
  assert.equal(typeof validator.ajv.getSchema('core-no-id'), 'function', 'core-no-id')
  assert.equal(typeof validator.ajv.getSchema('nested.no-id'), 'function')

  assert.equal(typeof validator.ajv.getSchema('cjs-01.cjs'), 'function', 'cjs-01.cjs')
  assert.equal(typeof validator.ajv.getSchema('cjs-02.cts'), 'function', 'cjs-02.cts')
  assert.equal(typeof validator.ajv.getSchema('cjs-03.ts'), 'function', 'cjs-03.ts')

  assert.equal(typeof validator.ajv.getSchema('esm-01.mjs'), 'function', 'esm-01.mjs')
  assert.equal(typeof validator.ajv.getSchema('esm-02.mts'), 'function', 'esm-02.mts')
  assert.equal(typeof validator.ajv.getSchema('esm-03-defaults.mts'), 'function', 'esm-03-defaults.mts')
  assert.equal(typeof validator.ajv.getSchema('esm-04-defaults.mjs'), 'function', 'esm-04-defaults.mjs')
})

test('should successfully init with a relative path', async () => {
  await validator.init(RELATIVE_PATH)

  assert.equal(typeof validator.ajv.getSchema('custom'), 'function')
  assert.equal(typeof validator.ajv.getSchema('core-no-id'), 'function')
  assert.equal(typeof validator.ajv.getSchema('nested.no-id'), 'function')
})

test('(async) should successfully init', async () => {
  await validator.init(CORRECT_PATH)

  assert.equal(typeof validator.ajv.getSchema('custom'), 'function')
  assert.equal(typeof validator.ajv.getSchema('core-no-id'), 'function')
  assert.equal(typeof validator.ajv.getSchema('nested.no-id'), 'function')
})

test('(async) should successfully init with a relative path', async () => {
  await validator.init(RELATIVE_PATH)

  assert.equal(typeof validator.ajv.getSchema('custom'), 'function')
  assert.equal(typeof validator.ajv.getSchema('core-no-id'), 'function')
  assert.equal(typeof validator.ajv.getSchema('nested.no-id'), 'function')
})

test('should reject promise with an IO Error on invalid dir', async () => {
  await assert.rejects(validator.init(BAD_PATH), io.IOError)
})

test('should reject promise with a file not found error on an empty dir', async () => {
  await assert.rejects(validator.init(EMPTY_PATH), io.FileNotFoundError)
})

test('should reject promise with a io error on a non-dir', async () => {
  await assert.rejects(validator.init(FILE_PATH), io.IOError)
})

test('should reject with a io error on a non-dir', async () => {
  assert.rejects(validator.init(FILE_PATH), io.IOError)
})

test('should reject promise with a NotFoundError on a non-existant validator', async () => {
  await validator.init(CORRECT_PATH)
  await assert.rejects(validator.validate('bad-route', {}), NotFoundError)
})

test('should validate a correct object', async () => {
  await validator.init(CORRECT_PATH)
  assert.deepEqual(await validator.validate('custom', { string: 'not empty' }), { string: 'not empty' })
})

test('should filter extra properties', async () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: true })
  await validator.init()
  assert.deepEqual(await validator.filter('custom', { string: 'not empty', qq: 'not in schema' }), { string: 'not empty' })
})

test('should filter extra properties, but still throw on invalid data', async () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: true })
  await validator.init()
  await assert.rejects(validator.filter('custom', { string: 20, qq: 'not in schema' }), HttpStatusError)
})

test('should return validation error on an invalid object', async () => {
  const reject = async (): Promise<any> => validator.validate('custom', { string: 'not empty', extraneous: true })

  await validator.init(CORRECT_PATH)
  await assert.rejects(reject(), HttpStatusError)

  const error = await reject().catch((e) => e)
  assert.equal(error.statusCode, 417)
  assert.deepEqual(JSON.parse(JSON.stringify(error)), {
    errors: [{
      field: '/extraneous',
      message: 'must NOT have additional properties',
      name: 'HttpStatusError',
      status: 400,
      statusCode: 400,
      status_code: 400,
    }],
    message: 'custom validation failed: data must NOT have additional properties',
    name: 'HttpStatusError',
    status: 417,
    statusCode: 417,
    status_code: 417,
  })
})

test('should perform sync validation', async () => {
  await validator.init(CORRECT_PATH)
  const result = validator.validateSync('custom', { string: 'not empty' })
  assert.equal(result.error, null)
  assert.deepEqual(result.doc, { string: 'not empty' })
})

test('should filter out extra props on sync validation', async () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: true })
  await validator.init()

  const result = validator.validateSync('custom', { string: 'not empty', extra: true })
  // ajv does not throw errors in this case
  assert.equal(result.error, null)
  assert.deepEqual(result.doc, { string: 'not empty' })
})

test('throws when using ifError', async () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: true })
  await validator.init()
  assert.throws(() => validator.ifError('custom', { string: 200, extra: true }), HttpStatusError)
})

test('doesn\'t throw on ifError', async () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: true })
  await validator.init()
  assert.deepEqual(validator.ifError('custom', { string: 'not empty', extra: true }), {
    string: 'not empty',
  })
})

test('validates ReDos prone URL', async () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: false })
  await validator.init()
  assert.equal(
    validator.ifError<string>('http-url', 'https://google.com12349834543489525824485'),
    'https://google.com12349834543489525824485')
})

test('throws on invalid URL', async () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: false })
  await validator.init()

  assert.throws(() => validator.ifError<string>('http-url', 'ftp://crap'), 'HttpStatusError')
  assert.throws(() => validator.ifError<string>('http-url', 'https://super.duper:8443'), 'HttpStatusError')
  assert.throws(() => validator.ifError<string>('http-url', 'https://'), 'HttpStatusError')
  assert.throws(() => validator.ifError<string>('http-url', 'http://notld'), 'HttpStatusError')
  assert.throws(() => validator.ifError<string>('http-url', 'http://notld:8443'), 'HttpStatusError')
  assert.throws(() => validator.ifError<string>('http-url', 'http://notld. :8443'), 'HttpStatusError')
  assert.throws(() => validator.ifError<string>('http-url', 'http://notld.'), 'HttpStatusError')
  assert.throws(() => validator.ifError<string>('http-url', 'http://notld. '), 'HttpStatusError')
})

test('do not throw on valid URL', async () => {
  validator = new Validation(CORRECT_PATH, null, { removeAdditional: false })
  await validator.init()
  assert.equal(validator.ifError<string>('http-url', 'https://super.duper#hash'), 'https://super.duper#hash')
})

test('should be able to use 2019-09 schema keywords', async () => {
  validator = new Validation(CORRECT_PATH)
  await validator.init()
  assert.throws(() => validator.ifError<number[]>('2019-09', [1]), 'HttpStatusError')
  assert.deepEqual(validator.ifError<number[]>('2019-09', [1, 2]), [1, 2])
})
