const Promise = require('bluebird');
const Ajv = require('ajv');
const keywords = require('ajv-keywords');
const path = require('path');
const callsite = require('callsite');
const glob = require('glob');
const fs = require('fs');
const debug = require('debug')('ms-validation');
const { ValidationError, io, NotFoundError } = require('common-errors');

/**
 * Patch it! We rely on isntanceof Error when serializing and deserializing errors and
 * this breaks it
 */
const hasOwnProperty = Object.prototype.hasOwnProperty;
const invokeToJSON = error => error.toJSON();
ValidationError.prototype.toJSON = function toJSON() {
  return Object.create(Object.prototype, {
    name: {
      enumerable: true,
      configurable: true,
      value: this.name,
    },
    super_: {
      enumerable: false,
      configurable: false,
      value: Error,
    },
    message: {
      enumerable: hasOwnProperty.call(this, 'message'),
      value: this.message,
    },
    code: {
      enumerable: hasOwnProperty.call(this, 'code'),
      value: this.code,
    },
    field: {
      enumerable: !!this.field,
      value: this.field,
    },
    errors: {
      enumerable: Array.isArray(this.errors),
      value: Array.isArray(this.errors) ? this.errors.map(invokeToJSON) : undefined,
    },
  });
};

/**
 * Default filter function
 * @param  {String} filename
 * @return {Booleam}
 */
const json = filename => path.extname(filename) === '.json';
const slashes = new RegExp(path.sep, 'g');

/**
 * @namespace Validator
 */
class Validator {
  /**
   * Read more about options here:
   * https://github.com/epoberezkin/ajv
   * @type {Object}
   */
  static defaultOptions = {
    allErrors: true,
    verbose: true,
    removeAdditional: false,
    v5: true,
    useDefaults: true,
    $data: true,
  };

  /**
   * Initializes validator with schemas in the schemaDir with a given filter function
   * and schemaOptions
   * @param {string} schemaDir
   * @param {Function} filter
   * @param {Object} schemaOptions
   */
  constructor(schemaDir, filter, schemaOptions = {}) {
    this.schemaDir = schemaDir;
    this.schemaOptions = { ...Validator.defaultOptions, ...schemaOptions };
    this.filterOpt = filter || json;
    this.validators = {};

    // init
    const ajv = new Ajv(this.schemaOptions);

    // enable extra keywords
    keywords(ajv);

    // save instance
    this.$ajv = ajv;

    // automatically init if we have schema dir
    if (schemaDir) {
      this.init();
    }
  }

  /**
   * #init()
   *
   * Init function - loads schemas from config dir
   * Can call multiple times to load multiple dirs, though one must make sure
   * that files are named differently, otherwise validators will be overwritten
   *
   * @param  {String}  _dir - optional, path must be absolute
   * @return {Promise}
   */
  init(_dir, isAsync = false) {
    let dir = _dir || this.schemaDir;

    if (!path.isAbsolute(dir)) {
      const stack = callsite();
      const length = stack.length;

      // filter out the file itself
      let iterator = 0;
      let source;

      while (iterator < length && !source) {
        const call = stack[iterator];
        const filename = call.getFileName();
        if (filename !== __filename) {
          source = path.dirname(filename);
        }
        iterator += 1;
      }

      dir = path.resolve(source, dir);
    }

    let list;
    try {
      const stat = fs.statSync(dir);
      if (stat.isDirectory() === false) {
        throw new Error('not a directory');
      }

      list = glob.sync('**', { cwd: dir });
    } catch (err) {
      const error = new io.IOError(`was unable to read ${dir}`, err);

      if (isAsync) {
        return Promise.reject(error);
      }

      throw error;
    }

    const filenames = list.filter(this.filterOpt);
    if (filenames.length === 0) {
      const error = new io.FileNotFoundError(`no schemas found in dir '${dir}'`);
      if (isAsync) {
        return Promise.reject(error);
      }

      throw error;
    }

    const $ajv = this.$ajv;
    filenames.forEach((filename) => {
      // so that we can use both .json and .js files
      // and other registered extensions
      const modulePath = require.resolve(path.resolve(dir, filename));

      // eslint-disable-next-line import/no-dynamic-require
      const schema = require(modulePath);

      // erase cache for further requires
      require.cache[modulePath] = undefined;

      const id = schema.$id || schema.id;
      const defaultName = modulePath
        .slice(dir.length + 1)
        .replace(/\.[^.]+$/, '')
        .replace(slashes, '.');

      debug('adding schema [%s], %s with id choice of $id: [%s] vs defaultName: [%s]', id || defaultName, modulePath, id, defaultName);
      $ajv.addSchema(schema, id || defaultName);
    });

    return Promise.resolve();
  }

  /**
   * @private
   *
   * Internal validation function
   * @param  {String} schema - schema name
   * @param  {Mixed}  data
   * @return {Error|Undefined}
   */
  $validate(schema, data) {
    const validate = this.$ajv.getSchema(schema);

    if (!validate) {
      return { error: new NotFoundError(`validator "${schema}" not found`) };
    }

    validate(data);

    if (validate.errors) {
      const readable = this.$ajv.errorsText(validate.errors);

      let onlyAdditionalProperties = true;
      const error = new ValidationError(`${schema} validation failed: ${readable}`);
      validate.errors.forEach((err) => {
        if (err.message !== 'should NOT have additional properties') {
          onlyAdditionalProperties = false;
        }

        const field = err.keyword === 'additionalProperties'
          ? `${err.dataPath}/${err.params.additionalProperty}`
          : err.field;

        error.addError(new ValidationError(err.message, 400, field));
      });

      error.code = onlyAdditionalProperties ? 417 : 400;

      return { error, doc: data };
    }

    return { doc: data };
  }

  /**
   * In case you need raw validator instance, e.g. to add more schemas later
   * @return {Object} Ajv instance
   */
  get ajv() {
    return this.$ajv;
  }

  /**
   * Validates data via a `schema`, which equals to schema name in the
   * passed dir
   * @param  {String} schema
   * @param  {Mixed}  data
   * @return {Promise}
   */
  validate = (schema, data) => {
    const output = this.$validate(schema, data);
    if ('error' in output) {
      return Promise.reject(output.error);
    }

    return Promise.resolve(output.doc);
  };

  /**
   * Make use of { filter: true } option and catch 417 errors
   * @param  {String} schema
   * @param  {Object} data
   * @return {Promise}
   */
  filter = (schema, data) => {
    const output = this.$validate(schema, data);
    if (hasOwnProperty.call(output, 'error') && output.error.code !== 417) {
      return Promise.reject(output.error);
    }

    return Promise.resolve(output.doc);
  };

  /**
   * Synchronously validates and returns either an Error object or `void 0`
   * @param  {String} schema
   * @param  {Mixed}  data
   * @return {Error|Undefined}
   */
  validateSync = (schema, data) => this.$validate(schema, data);

  /**
   * Sync validation and throws if error is encountered.
   * @param  {string} schema
   * @param  {mixed} data
   */
  ifError = (schema, data) => {
    const result = this.$validate(schema, data);
    if (result.error !== undefined) {
      debug(JSON.stringify(result, null, 2));
      throw result.error;
    }
  }
}

module.exports = Validator;
