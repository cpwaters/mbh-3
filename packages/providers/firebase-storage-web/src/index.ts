import { getApps, initializeApp } from 'firebase/app';
import {
  connectStorageEmulator,
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';
import { ObjectStorageError, type ObjectStorageUploader } from '@mbh/provider-interfaces';

// The ONLY package that imports the Firebase Storage web SDK. Uploads a PoD
// photo captured offline once the sync queue reaches this step (see
// packages/offline's resolvePayload hook) — never called synchronously from
// a form submit, so capture itself stays instant and offline-safe.

export interface FirebaseStorageWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
}

export interface FirebaseStorageWebOptions {
  config: FirebaseStorageWebConfig;
  emulator?: { host: string; port: number };
}

export class FirebaseStorageUploader implements ObjectStorageUploader {
  private readonly storage: FirebaseStorage;

  constructor(options: FirebaseStorageWebOptions) {
    const app = getApps()[0] ?? initializeApp(options.config);
    this.storage = getStorage(app);
    if (options.emulator !== undefined) {
      connectStorageEmulator(this.storage, options.emulator.host, options.emulator.port);
    }
  }

  async upload(ref: string, blob: Blob, contentType: string): Promise<void> {
    try {
      await uploadBytes(storageRef(this.storage, ref), blob, { contentType });
    } catch (cause) {
      throw new ObjectStorageError(`failed to upload ${ref}: ${String(cause)}`);
    }
  }

  async viewUrl(ref: string): Promise<string> {
    try {
      return await getDownloadURL(storageRef(this.storage, ref));
    } catch (cause) {
      // Not recoverable by retrying: the object is gone, or the rules say no.
      throw new ObjectStorageError(`failed to resolve ${ref}: ${String(cause)}`, false);
    }
  }
}
