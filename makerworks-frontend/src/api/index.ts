// src/api/index.ts

import * as auth from './auth';
import * as users from './users';
import * as estimate from './estimate';
import * as filaments from './filaments';
import * as admin from './admin';

export * from './auth';
export * from './users';
export * from './estimate';
export * from './filaments';
export * from './admin';

export default {
  auth,
  users,
  estimate,
  filaments,
  admin,
};
