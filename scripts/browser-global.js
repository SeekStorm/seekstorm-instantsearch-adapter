import SeekStormInstantSearchAdapter from '../src/seekstorm-instantsearch-adapter.js';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SeekStormInstantSearchAdapter = factory();
  }
})(typeof globalThis === 'object' ? globalThis : this, () => SeekStormInstantSearchAdapter);