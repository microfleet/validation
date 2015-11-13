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
const validator = new Validator('./schemas');

// some logic here
validator.validate('config', {
  configuration: 'string'
})
.then(doc => {
  // all good
  // handle doc, which would eq { configuration: 'string' }
})
.catch(Errors.ValidationError, (error) => {
  // handle error here
});

const result = validator.validateSync('config', { data: true });
if (result.error) {
  // handle error!
}

// do stuff
// ...

// init filter
validator.init('./dir', null, true); // all schemas in this dir will filter out additional properties instead of throwing an error

// catches when we only have 417 errors
validator.filter('config', { conf: 'string', extra: true })
  .then(result => {
    //  { conf: 'string' }
  });
```
