import type { AuthUser } from '../auth/user';

/**
 * Augmentasi tipe untuk Express & express-session (Phase 2C-1).
 * File ini tidak menghasilkan kode — hanya mendefinisikan tipe.
 */

declare module 'express-session' {
  interface SessionData {
    /**
     * ID user yang sedang login. Hanya INI yang disimpan di session;
     * identitas lengkap (nama, role) selalu diambil dari database.
     * Session TIDAK PERNAH menyimpan password maupun password_hash.
     */
    userId: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Diisi oleh middleware `requireAuth` setelah session dan
       * database tervalidasi. Jangan pernah mempercayai nilai user
       * /role yang dikirim dari browser.
       */
      authUser?: AuthUser;
    }
  }
}

export {};
