import { InstantDBAttr } from './attrTypes.ts';
import { PageInfoResponse } from './queryTypes.ts';
import { AttrsStore, AttrsStoreJson, Store, StoreJson } from './store.ts';

export type QuerySubResult = {
  store: Store | null;
  attrsStore: AttrsStore | null;
  pageInfo?: PageInfoResponse<any> | null | undefined;
  aggregate?: any;
  processedTxId?: number;
  isExternal?: boolean;
  /** Raw serialized store awaiting hydration once shared attrs load from kv. */
  _rawStore?: StoreJson;
  /** Optimistic attrs not present in the shared attrsStore. */
  _extraAttrs?: Record<string, InstantDBAttr>;
};

export type QuerySub = {
  q: Object;
  eventId?: string;
  lastAccessed?: number | null | undefined;
  result?: QuerySubResult;
};

export type QuerySubResultInStorage = {
  store: StoreJson;
  attrsStore?: AttrsStoreJson;
  extraAttrs?: Record<string, InstantDBAttr>;
  pageInfo?: PageInfoResponse<any> | null | undefined;
  aggregate?: any;
  processedTxId?: number;
};

export type QuerySubInStorage = {
  q: Object;
  eventId?: string;
  lastAccessed?: number | null | undefined;
  result?: QuerySubResultInStorage;
};
