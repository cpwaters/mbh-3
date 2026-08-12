import { FirebaseStorageUploader } from '@mbh/provider-firebase-storage-web';
import { firebaseConfig, useEmulators } from './firebase-config';

let uploader: FirebaseStorageUploader | null = null;

// One Storage uploader for the app — where a queued deliverJob's local photo
// blobs get uploaded once the sync queue reaches them. Single instance, same
// pattern as getReader().
export function getObjectStorageUploader(): FirebaseStorageUploader {
  if (uploader !== null) return uploader;
  uploader = new FirebaseStorageUploader({
    config: firebaseConfig,
    ...(useEmulators ? { emulator: { host: 'localhost', port: 9199 } } : {}),
  });
  return uploader;
}
