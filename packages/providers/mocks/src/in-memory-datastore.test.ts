import { describeDataStoreContract } from '@mbh/provider-interfaces/contract';
import { InMemoryDataStore } from './in-memory-datastore.js';

describeDataStoreContract('InMemoryDataStore', () => new InMemoryDataStore());
