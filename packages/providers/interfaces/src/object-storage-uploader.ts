// Client-side upload of a binary blob (a PoD photo) to object storage.
// Split from ObjectStorageReader (server-side download) rather than one
// combined interface — client and server never interchange (Blob vs
// Buffer, browser vs Node), mirroring the AuthClient/AuthProvider split for
// the same reason.
export interface ObjectStorageUploader {
  upload(ref: string, blob: Blob, contentType: string): Promise<void>;
  // A URL the browser can render the object from, for the one kind of object
  // the client is allowed to read back: a company's own logo, shown on its
  // profile. PoD photos stay unreadable to clients — the storage rules, not
  // this method, are what decide that.
  viewUrl(ref: string): Promise<string>;
}

export class ObjectStorageError extends Error {
  readonly recoverable: boolean;
  constructor(message: string, recoverable = true) {
    super(message);
    this.name = 'ObjectStorageError';
    this.recoverable = recoverable;
  }
}
