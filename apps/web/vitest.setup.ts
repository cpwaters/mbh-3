import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// RTL's automatic afterEach cleanup only self-registers when it detects a
// global `afterEach` — this config doesn't turn on vitest's globals (matches
// the repo's explicit-import convention elsewhere), so register it by hand.
afterEach(cleanup);

// jsdom ships Blob/File without the standard Blob.text() and .arrayBuffer(),
// which every browser we target has had for years. Code that reads an uploaded
// file (the fleet importer) is correct as written; only the test DOM is short,
// so fill the gap here rather than contorting the source for it.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
