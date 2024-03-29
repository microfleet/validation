import { HttpStatusError as HttpCoreError } from 'common-errors'

export class HttpStatusError extends HttpCoreError {
  public errors?: Error[]
  public field?: string
  public status: number
  public status_code: number

  /**
   * @param statusCode
   * @param message
   * @param field
   */
  constructor(statusCode: number, message?: string, field?: string) {
    super(statusCode, message)
    if (field) this.field = field
    this.status = statusCode
    this.status_code = statusCode
  }

  /**
   * Adds error to the http status
   */
  public addError(error: Error): HttpStatusError {
    this.errors ||= []
    this.errors.push(error)
    return this
  }
}
