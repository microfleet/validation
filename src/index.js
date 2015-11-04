const Promise = require('bluebird');
const validator = require('is-my-json-valid');
const path = require('path');
const fs = Promise.promisifyAll(require('fs'));
const Errors = require('common-errors');

/**
 * Default filter function
 * @param  {String} filename
 * @return {Booleam}
 */
function json(filename) {
  return path.extname(filename) === '.json';
}

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
  }

  /**
   * Init function - loads schemas from config dir
   * Can call multiple times to load multiple dirs, though one must make sure
   * that files are named differently, otherwise validators will be overwritten
   *
   * @param  {String}  _dir - optional, path must be absolute
   * @return {Promise}
   */
  init = (_dir) => {
    const dir = _dir || this.schemaDir;

    return fs.readdirAsync(dir)
      .catch((err) => {
        throw new Errors.io.IOError(`was unable to read ${dir}`, err);
      })
      .filter(this.filter)
      .then((filenames) => {
        if (filenames.length === 0) {
          throw new Errors.io.FileNotFoundError(`no schemas found in dir '${dir}'`);
        }

        return filenames;
      })
      .map((filename) => {
        const schema = require(path.resolve(dir, filename));
        this.validators[path.basename(filename, '.json')] = validator(schema, this.schemaOptions);
      });
  }

  /**
   * Validates data via a `route`, which equals to schema name in the
   * passed dir
   * @param  {String} route
   * @param  {Mixed}  data
   * @return {Promise}
   */
  validate = (route, data) => {
    const validate = this.validators[route];

    if (!validate) {
      return Promise.reject(new Errors.NotFoundError(`validator ${route} not found`));
    }

    validate(data);

    if (validate.errors) {
      const error = new Errors.ValidationError(`route "${route}" validation failed`, 400);
      validate.errors.forEach((err) => {
        error.addError(new Errors.ValidationError(err.message, 400, err.field));
      });

      return Promise.reject(error);
    }

    return Promise.resolve();
  }

}

module.exports = Validator;
