/**
 * Authentication Constants
 *
 * Constants used for authentication, token management, and session handling.
 */

// Token masking constants
export const TOKEN_MASK_MIN_LENGTH = 8;
export const TOKEN_MASK_PREFIX_LENGTH = 4;
export const TOKEN_MASK_SUFFIX_LENGTH = 4;

// Token display constants
export const TOKEN_PREVIEW_LENGTH = 16;

// State generation constants
export const STATE_LENGTH = 32;

// Time conversion constants
export const MILLISECONDS_PER_SECOND = 1000;

// Session timeout constants (in milliseconds)
// biome-ignore lint/style/noMagicNumbers: Time calculation constant
export const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
