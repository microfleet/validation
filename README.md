# Validation module for amqp transport of microservices

This is basically a wrapper of [is-my-json-valid](https://github.com/mafintosh/is-my-json-valid) module.
What it does - is accepts a directory with schemas, reads it in an async fashion and caches validators under it's name, minus it's extension (to be completely)
honest - it strips down `.json` only. Based on the bluebird promises.

## Installation

`npm i ms-amqp-validation -S`

## Usage

```js
// Lets assume that we have a following file structure:
//
// .
// ./schemas/config.json
// ./schemas/ping.json
// ./index.js
//

const Errors = require('common-errors');
const Validator = require('ms-amqp-validation');
const validator = new Validator(path.resolve(__dirname, './schemas'));

// some logic here
validator.validate('config', {
  configuration: 'string'
})
.then(() => {
  // all good
})
.catch(Errors.ValidationError, (error) => {
  // handle error here
});

const err = validator.validateSync('config', { data: true });
if (err) {
  // handle error!
}

// do stuff
// ...
```
