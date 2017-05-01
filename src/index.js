const Promise = require('bluebird');
const ajv = require('ajv');
const path = require('path');
const fs = require('fs');
const callsite = require('callsite');
const { ValidationError, io, NotFoundError } = require('common-errors');

/**
 * Patch it! We rely on isntanceof Error when serializing and deserializing errors and
 * this breaks it
 */
ValidationError.prototype.toJSON = function toJSON() {
  const o = {
    name: this.name,
  };

  // so it's not visible
  Object.defineProperty(o, 'super_', { get: Error });

  if (this.errors) {
    if (this.message) {
      o.message = this.message;
    }

    if (this.code) {
      o.code = this.code;
    }

    o.errors = this.errors.map(error => error.toJSON());
  } else {
    if (this.message) {
      o.text = this.message;
    }

    if (this.code) {
      o.code = this.code;
    }

    if (this.field) {
      o.field = this.field;
    }
  }

  return o;
};

/**
 * Default filter function
 * @param  {String} filename
 * @return {Booleam}
 */
function json(filename) {
  return path.extname(filename) === '.json';
}

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
  };

  /**
   * Initializes validator with schemas in the schemaDir with a given filter function
   * and schemaOptions
   * @param  {String}   schemaDir, must be an absolute path
   * @param  {Function} filter
   * @param  {Object}   schemaOptions
   */
  constructor(schemaDir, filter, schemaOptions = {}) {
    this.schemaDir = schemaDir;
    this.schemaOptions = { ...Validator.defaultOptions, ...schemaOptions };
    this.filterOpt = filter || json;
    this.validators = {};

    // init
    this.$ajv = ajv(this.schemaOptions);

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
      list = fs.readdirSync(dir);
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
      const schema = JSON.parse(fs.readFileSync(path.resolve(dir, filename)));
      $ajv.addSchema(schema, schema.id || path.basename(filename, path.extname(filename)));
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
        error.addError(new ValidationError(err.message, 400, err.field));
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
    if ('error' in output && output.error.code !== 417) {
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

}

module.exports = Validator;
