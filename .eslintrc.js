module.exports = {
  "env": {
    "browser": false,
    "es6": true,
    "node": true
  },
  "extends": [
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "tsconfig.json",
    "sourceType": "module"
  },
  "plugins": [
    "@typescript-eslint"
  ],
  "rules": {
    "require-await": "off",
    "semi": ["error", "never"],
    "@typescript-eslint/require-await": "off",
    "@typescript-eslint/no-explicit-any": "off"
  }
};
