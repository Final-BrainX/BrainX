# BrainX

## Auth Password Recovery

- Login page supports password recovery with email verification.
- The client requests an email code with `PASSWORD_CHANGE` purpose.
- After code verification, the client calls `POST /api/v1/auth/password/temporary`.
- The server generates a temporary password, stores only its hash, and sends the temporary password by email.
- The API response never includes the temporary password value.
- The user can log in with the temporary password and change it later from My Page or Settings.
- Password changes emit the existing `PasswordChanged` event with `changeReason`.
  - `USER_CHANGE`: user changed password from an authenticated settings flow.
  - `TEMPORARY_PASSWORD_ISSUED`: password was replaced by password recovery temporary password issuance.
