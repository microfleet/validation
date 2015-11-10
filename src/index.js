const Promise = require('bluebird');
const validator = require('is-my-json-valid');
const path = require('path');
const fs = require('fs');
const Errors = require('common-errors');

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
   * https://github.com/mafintosh/is-my-json-valid
   * @type {Object}
   */
  static defaultOptions = {
    greedy: true,
  };

  /**
   * Initializes validator with schemas in the schemaDir with a given filter function
   * and schemaOptions
   * @param  {String}   schemaDir, must be an absolute path
   * @param  {Function} filter
   * @param  {Object}   schemaOptions
   */
  constructor(schemaDir, filter = json, schemaOptions = Validator.defaultOptions) {
    this.schemaDir = schemaDir;
    this.schemaOptions = schemaOptions;
    this.filter = filter;
    this.validators = {};

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
  init = (_dir, async = false) => {
    let dir = _dir || this.schemaDir;
    dir = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);

    let list;
    try {
      list = fs.readdirSync(dir);
    } catch (err) {
      const error = new Errors.io.IOError(`was unable to read ${dir}`, err);

      if (async) {
        return Promise.reject(error);
      }

      throw error;
    }

    const filenames = list.filter(this.filter);
    if (filenames.length === 0) {
      const error = new Errors.io.FileNotFoundError(`no schemas found in dir '${dir}'`);
      if (async) {
        return Promise.reject(error);
      }

      throw error;
    }

    filenames.forEach((filename) => {
      const schema = require(path.resolve(dir, filename));
      this.validators[path.basename(filename, '.json')] = validator(schema, this.schemaOptions);
    });
  }

  /**
   * @private
   *
   * Internal validation function
   * @param  {String} schema - schema name
   * @param  {Mixed}  data
   * @return {Error|Undefined}
   */
  _validate(schema, data) {
    const validate = this.validators[schema];

    if (!validate) {
      return new Errors.NotFoundError(`validator "${schema}" not found`);
    }

    validate(data);

    if (validate.errors) {
      const error = new Errors.ValidationError(`route "${schema}" validation failed`, 400);
      validate.errors.forEach((err) => {
        error.addError(new Errors.ValidationError(err.message, 400, err.field));
      });

      return error;
    }

    return undefined;
  }

  /**
   * Validates data via a `schema`, which equals to schema name in the
   * passed dir
   * @param  {String} schema
   * @param  {Mixed}  data
   * @return {Promise}
   */
  validate = (schema, data) => {
    const err = this._validate(schema, data);
    if (err) {
      return Promise.reject(err);
    }

    return Promise.resolve(data);
  }

  /**
   * Synchronously validates and returns either an Error object or `void 0`
   * @param  {String} schema
   * @param  {Mixed}  data
   * @return {Error|Undefined}
   */
  validateSync = (schema, data) => {
    return this._validate(schema, data);
  }

}

module.exports = Validator;
