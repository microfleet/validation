import fsAsync from 'node:fs/promises'
import path from 'node:path'
import { URL } from 'node:url'
import Ajv, { ValidateFunction, Options } from 'ajv/dist/2020'
import addKeywords from 'ajv-keywords'
import addFormats from 'ajv-formats'
import draft7MetaSchema from "ajv/dist/refs/json-schema-draft-07.json"
import callsite from 'callsite'
import { InvalidOperationError, io, NotFoundError } from 'common-errors'
import _debug from 'debug'
import { glob } from 'glob'
import { HttpStatusError } from './HttpStatusError'

const debug = _debug('@microfleet/validation')

export type globFilter = (filename: string) => boolean;
export type ValidationError = InvalidOperationError | NotFoundError | HttpStatusError
export type ValidationResponse<T> =
  { error: null; doc: T } |
  { error: ValidationError; doc: unknown }

/**
 * Default filter function
 * @param filename
 */
const json: globFilter = (filename: string) => path.extname(filename) === '.json'
const safeValidate = <T>(validate: ValidateFunction<T>, doc: unknown): boolean | Error => {
  try {
    validate(doc)
  } catch (e) {
    return e as Error
  }

  return true
}

/**
 * @namespace Validator
 */
export class Validator {
  /**
   * Read more about options here:
   * https://github.com/epoberezkin/ajv
   */
  public static readonly defaultOptions: Options = {
    $data: true,
    allErrors: true,
    removeAdditional: false,
    useDefaults: true,
    verbose: true,
  }

  private readonly schemaDir: string | undefined
  private readonly $ajv: Ajv
  private readonly filterOpt: globFilter
  private readonly schemaOptions: Options

  /**
   * Initializes validator with schemas in the schemaDir with a given filter function
   * and schemaOptions
   * @param schemaDir
   * @param filter
   * @param schemaOptions
   */
  constructor(schemaDir?: string, filter?: globFilter | null, schemaOptions: Options = {}) {
    this.schemaDir = schemaDir
    this.schemaOptions = { ...Validator.defaultOptions, ...schemaOptions }
    this.filterOpt = filter || json

    // init
    const ajvInstance = new Ajv(this.schemaOptions)

    // removes ftp protocol and sanitizes internal networks
    ajvInstance.addFormat('http-url', (data: string): boolean => {
      try {
        const url = new URL(data)
        const { protocol, port, hostname } = url
        const [, tld] = hostname.split('.')
        return (
          (
            (protocol === 'http:' && (port === '80' || port === '')) ||
            (protocol === 'https:' && (port === '443' || port === ''))
          ) &&
          (
            typeof tld === 'string' && tld.trim().length > 0
          )
        )
      } catch (_) {
        return false
      }
    })
    ajvInstance.addMetaSchema(draft7MetaSchema)

    addKeywords(ajvInstance)
    addFormats(ajvInstance)

    // save instance
    this.$ajv = ajvInstance
  }

  /**
   * In case you need raw validator instance, e.g. to add more schemas later
   */
  public get ajv(): Ajv {
    return this.$ajv
  }

  /**
   * Validates data via a `schema`, which equals to schema name in the
   * passed dir
   * @param  schema
   * @param  data
   */
  public async validate<T = any>(schema: string, data: unknown): Promise<T> {
    const output = this.$validate<T>(schema, data)

    if (output.error) {
      // so that it can be inspected later
      Object.defineProperty(output.error, '$orig', {
        value: output.doc,
      })

      // reject
      throw output.error
    }

    return output.doc
  }

  /**
   * Make use of { filter: true } option and catch 417 errors
   * @param  schema
   * @param  data
   * @return
   */
  public async filter<T>(schema: string, data: unknown): Promise<T>{
    const output = this.$validate(schema, data)
    if (output.error && (output.error as HttpStatusError).statusCode !== 417) {
      throw output.error
    }

    return output.doc as T
  }

  /**
   * Synchronously validates and returns either an Error object or `void 0`
   * @param  schema
   * @param  data
   */
  public validateSync<T = any>(schema: string, data: unknown): ValidationResponse<T> {
    return this.$validate<T>(schema, data)
  }

  /**
   * Sync validation and throws if error is encountered.
   * @param  {string} schema
   * @param  {mixed} data
   */
  public ifError<T = any>(schema: string, data: unknown): T {
    const result = this.$validate<T>(schema, data)

    if (result.error) {
      if (debug.enabled) {
        debug(JSON.stringify(result, null, 2))
      }

      throw result.error
    }

    return result.doc
  }

  /**
   * #init()
   *
   * Init function - loads schemas from config dir
   * Can call multiple times to load multiple dirs, though one must make sure
   * that files are named differently, otherwise validators will be overwritten
   *
   * @param dir - path, eventually resolves to absolute
   */
  public async init(dir: string | undefined = this.schemaDir): Promise<void> {
    if (typeof dir === 'undefined') {
      throw new TypeError('"dir" or this.schemaDir must be defined')
    }

    if (!path.isAbsolute(dir)) {
      const stack = callsite()
      const { length } = stack

      // filter out the file itself
      let iterator = 0
      let source = ''

      while (iterator < length && !source) {
        const call = stack[iterator]
        const filename = call.getFileName()
        if (filename !== __filename) {
          source = path.dirname(filename)
        }
        iterator += 1
      }

      dir = path.resolve(source, dir)
    }

    const list = await this.walkDirAsync(dir)
    const filteredFiles = this.filterSchemas(dir, list)
    await this.readSchemas(dir, filteredFiles)
  }

  private async walkDirAsync(dir: string): Promise<string[]> {
    try {
      const stat = await fsAsync.stat(dir)
      if (stat.isDirectory() === false) {
        throw new io.IOError(`"${dir}" is not a directory`)
      }

      return await glob('**', { cwd: dir, nodir: true })
    } catch (err) {
      const error = new io.IOError(`was unable to read ${dir}`, err as Error)
      throw error
    }
  }

  private filterSchemas(dir: string, list: string[]): string[] {
    const filenames = list.filter(this.filterOpt)

    if (filenames.length === 0) {
      const error = new io.FileNotFoundError(`no schemas found in dir '${dir}'`)
      throw error
    }

    return filenames
  }

  private async readSchemas(dir: string, filenames: string[]): Promise<void> {
    const { $ajv } = this
    for (const filename of filenames) {
      // so that we can use both .json and .js files
      // and other registered extensions
      const modulePath = path.resolve(dir, filename)

      const opts = modulePath.endsWith('.json')
        ? { with: { type: 'json' } }
        : {}

      // bust cache
      const module = await import(`${modulePath}?${Date.now()}`, opts)
      const schema = module.default || module

      const id = schema.$id || schema.id
      const defaultName = modulePath
        .slice(dir.length + 1)
        .replace(/\.[^.]+$/, '')
        .replaceAll(path.sep, '.')

      debug(
        'adding schema [%s], %s with id choice of $id: [%s] vs defaultName: [%s]',
        id || defaultName,
        modulePath,
        id,
        defaultName,
      )

      $ajv.addSchema(schema, id || defaultName)
    }
  }

  /**
   *
   * Internal validation function
   * @param  schema - schema name
   * @param  data
   */
  private $validate<T = unknown>(schema: string, data: unknown): ValidationResponse<T> {
    const validate = this.$ajv.getSchema<T>(schema)

    if (!validate) {
      return { error: new NotFoundError(`validator "${schema}" not found`), doc: data }
    }

    const isValidationCompleted = safeValidate(validate, data)
    if (isValidationCompleted !== true) {
      return {
        error: new InvalidOperationError('internal validation error', isValidationCompleted as Error),
        doc: data
      }
    }

    if (validate.errors) {
      const readable = this.$ajv.errorsText(validate.errors)

      let onlyAdditionalProperties = true
      const error = new HttpStatusError(400, `${schema} validation failed: ${readable}`)
      for (const err of validate.errors) {
        let field
        if (err.keyword !== 'additionalProperties') {
          onlyAdditionalProperties = false
          field = err.instancePath
        } else {
          field = `${err.instancePath}/${err.params.additionalProperty}`
        }

        error.addError(new HttpStatusError(400, err.message, field))
      }

      if (onlyAdditionalProperties === true) {
        error.statusCode = error.status = error.status_code = 417
        return { error, doc: data as T }
      }

      return { error, doc: data }
    }

    return { error: null, doc: data as T }
  }
}

export { HttpStatusError }
export default Validator
