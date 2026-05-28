"use strict";

// Globals Node.js CommonJS (sin paquete externo 'globals')
const nodeGlobals = {
  require:         "readonly",
  module:          "readonly",
  exports:         "writable",
  __dirname:       "readonly",
  __filename:      "readonly",
  process:         "readonly",
  console:         "readonly",
  Buffer:          "readonly",
  setTimeout:      "readonly",
  clearTimeout:    "readonly",
  setInterval:     "readonly",
  clearInterval:   "readonly",
  setImmediate:    "readonly",
  clearImmediate:  "readonly",
  global:          "readonly",
  URL:             "readonly",
  URLSearchParams: "readonly",
  Promise:         "readonly",
  Error:           "readonly",
  JSON:            "readonly",
  Math:            "readonly",
  Number:          "readonly",
  String:          "readonly",
  Array:           "readonly",
  Object:          "readonly",
  Set:             "readonly",
  Map:             "readonly",
  RegExp:          "readonly",
  parseInt:        "readonly",
  parseFloat:      "readonly",
  isNaN:           "readonly",
  isFinite:        "readonly",
  undefined:       "readonly",
  null:            "readonly",
  true:            "readonly",
  false:           "readonly",
};

// Globals Jest para archivos de test
const jestGlobals = {
  describe:   "readonly",
  test:       "readonly",
  it:         "readonly",
  expect:     "readonly",
  beforeAll:  "readonly",
  afterAll:   "readonly",
  beforeEach: "readonly",
  afterEach:  "readonly",
  jest:       "readonly",
};

module.exports = [
  // Excluir node_modules
  {
    ignores: ["node_modules/**"],
  },

  // Reglas para todo el backend (JS CommonJS)
  {
    languageOptions: {
      ecmaVersion:    2022,
      sourceType:     "commonjs",
      globals:        nodeGlobals,
    },
    rules: {
      "no-undef":             "error",
      "no-unused-vars":       ["warn", {
        argsIgnorePattern: "^_",
        caughtErrors:      "none",   // tolera catch(err) aunque no se use err
      }],
      "no-redeclare":         "error",
      "no-unreachable":       "error",
      "no-constant-condition": "error",
      "no-console":           "off",  // console.log permitido en backend
    },
  },

  // Globals extra para archivos de test (Jest)
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: jestGlobals,
    },
  },
];
