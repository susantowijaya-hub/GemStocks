# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Ownership Isolation (PII Protection)**:
   - `/users/{userId}` and every subcollection (`/positions/{positionId}`, `/preferences/{prefId}`, `/aiBriefs/{briefId}`) belong exclusively to the authenticated user whose `request.auth.uid == userId`.
   - Unauthenticated users have zero read/write access anywhere in Firestore.
   - No authenticated user may read, list, create, update, or delete another user's profile, portfolio positions, preferences, or saved AI briefs.
2. **Verified Identity & Immutability**:
   - All writes require `request.auth != null && request.auth.token.email_verified == true`.
   - `uid` / `ownerId` in document payloads must strictly match `request.auth.uid` on create and remain immutable on update.
   - `createdAt` must equal `request.time` on create and remain immutable on update; `updatedAt` must equal `request.time`.
3. **Strict Key & Volumetric Boundaries**:
   - Every document enforces `keys().hasAll(...)` and `keys().hasOnly(...)` on create, and action-scoped `diff(existing()).affectedKeys().hasOnly(...)` on update.
   - Every string field enforces `.size()` bounds matching `firebase-blueprint.json`.
   - Every array (`favoriteAssetIds`, `sources`) is strictly bounded in length (`<= 30` and `<= 10`).

## 2. The "Dirty Dozen" Attack Payloads (All Expected: PERMISSION_DENIED)
1. **Unauthenticated Read on User Profile**: `GET /users/userA` with `auth = null` -> DENIED.
2. **Cross-Tenant Portfolio Read**: `GET /users/userB/positions/pos1` signed in as `userA` -> DENIED.
3. **Unverified Email Write**: `CREATE /users/userA/positions/pos1` with `email_verified = false` -> DENIED.
4. **Owner Spoofing on Create**: `CREATE /users/userA/positions/pos1` with `ownerId: "userB"` -> DENIED.
5. **Shadow / Ghost Field Injection**: `CREATE /users/userA` with extra `isAdmin: true` -> DENIED (`keys().hasOnly(...)`).
6. **Privilege Escalation on Update**: `UPDATE /users/userA/positions/pos1` attempting to alter `ownerId` or `createdAt` -> DENIED.
7. **ID Poisoning**: `CREATE /users/userA/positions/<150-char-invalid-id!>` -> DENIED (`isValidId()`).
8. **Client Timestamp Forgery**: `CREATE /users/userA/positions/pos1` with backdated `createdAt` (`!= request.time`) -> DENIED.
9. **Denial-of-Wallet String Overflow**: `CREATE /users/userA/aiBriefs/b1` with `answer` > 12,000 chars -> DENIED.
10. **Unbounded Array Injection**: `CREATE /users/userA/preferences/settings` with 35 `favoriteAssetIds` -> DENIED (`size() <= 30`).
11. **Invalid Enum Category**: `CREATE /users/userA/positions/pos1` with `category: "Derivatives"` -> DENIED.
12. **Blanket List Scraping**: `LIST /users` or `LIST /users/userB/positions` as `userA` -> DENIED.
