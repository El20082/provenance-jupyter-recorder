/**
 * The Provenance ROOT public key, hex-encoded ed25519 (32 bytes, 64 hex characters).
 *
 * A Manifest 2.0 file carries a root-signed `course_cert`, which authorizes the course key
 * that signed the manifest. Verification chains to this key, so one build serves every
 * course.
 *
 * This is the same DEV root key as the VS Code recorder (`packages/recorder/src/activation/
 * root-public-key.ts`), so manifests signed with the monorepo's dev tooling work here too.
 * A release build must replace it with the production root key (Task 9). Keep this a
 * single-line constant so a build step can substitute it.
 *
 * provjup has no legacy course key: it has no Manifest 1.x history (design §6).
 */
export const ROOT_PUBLIC_KEY_HEX =
  '80051f5bdb9064e0768bf2fca5cc9a4ee888502ab45472e0c6d0f4f704de4499';
