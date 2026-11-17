/**
 * Firestore Security Rules Adversarial Verification Suite ("Dirty Dozen")
 * Maps each attack vector in security_spec.md to expected PERMISSION_DENIED behavior.
 */

export const DIRTY_DOZEN_CASES = [
  {
    name: '1. Unauthenticated read on /users/{userId}',
    operation: 'GET /users/userA',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Cross-tenant portfolio read',
    operation: 'GET /users/userB/positions/pos1',
    auth: { uid: 'userA', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Unverified email write',
    operation: 'CREATE /users/userA/positions/pos1',
    auth: { uid: 'userA', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Owner spoofing on create',
    operation: 'CREATE /users/userA/positions/pos1',
    auth: { uid: 'userA', email_verified: true },
    payload: { ownerId: 'userB', symbol: 'SPX', name: 'S&P 500', category: 'Equities', units: 1, avgCost: 100, currentPrice: 100 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Shadow/ghost field injection',
    operation: 'CREATE /users/userA',
    auth: { uid: 'userA', email_verified: true },
    payload: { uid: 'userA', email: 'a@example.com', displayName: 'A', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Immutable ownerId tampering on update',
    operation: 'UPDATE /users/userA/positions/pos1',
    auth: { uid: 'userA', email_verified: true },
    payload: { ownerId: 'userB' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. ID poisoning with oversized/invalid characters',
    operation: 'CREATE /users/userA/positions/bad!id$' + 'x'.repeat(140),
    auth: { uid: 'userA', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Client timestamp forgery (!= request.time)',
    operation: 'CREATE /users/userA/positions/pos1',
    auth: { uid: 'userA', email_verified: true },
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Denial-of-Wallet oversized AI brief payload',
    operation: 'CREATE /users/userA/aiBriefs/b1',
    auth: { uid: 'userA', email_verified: true },
    payload: { answer: 'a'.repeat(12500) },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Unbounded array injection (>30 favoriteAssetIds)',
    operation: 'CREATE /users/userA/preferences/settings',
    auth: { uid: 'userA', email_verified: true },
    payload: { favoriteAssetIds: Array.from({ length: 35 }, (_, i) => `ASSET_${i}`) },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Invalid category enum injection',
    operation: 'CREATE /users/userA/positions/pos1',
    auth: { uid: 'userA', email_verified: true },
    payload: { category: 'Derivatives' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Blanket list scraping on /users or foreign /positions',
    operation: 'LIST /users',
    auth: { uid: 'userA', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
];
