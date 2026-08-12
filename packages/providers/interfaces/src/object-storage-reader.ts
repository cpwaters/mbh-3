// Server-side download of a binary blob (a PoD photo or signature) from
// object storage, resolved to a Buffer for attaching to outbound email. See
// object-storage-uploader.ts for why this is a separate interface from the
// client-side upload side.
export interface ObjectStorageReader {
  download(ref: string): Promise<Buffer>;
}
