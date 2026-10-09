import { createInterface, type Interface } from 'node:readline';

/**
 * Prompt CLI sederhana untuk tool lokal (Phase 2C-2: bootstrap admin).
 *
 * Fitur:
 * - Input tersembunyi (hidden) untuk password: echo keystroke ke stdout
 *   DIBUNGKAM selama bertanya password, sehingga password tidak pernah
 *   tampil di terminal, log, maupun output redirect.
 * - Antrean baris sendiri (bukan rl.question): semua baris yang masuk
 *   di-buffer, lalu dikonsumsi satu per satu oleh setiap pertanyaan.
 *   Penting untuk input pipe (test/otomasi) yang tiba dalam SATU chunk —
 *   rl.question justru membuang baris yang datang tanpa pertanyaan aktif.
 * - Menutup semua patch yang dibuat (stdout dikembalikan seperti semula).
 */

export interface CliPrompter {
  /** Bertanya satu baris. `hidden: true` = jawaban tidak di-echo (untuk password). */
  ask(question: string, options?: { hidden?: boolean }): Promise<string>;
  /** Menutup readline dan mengembalikan patch stdout seperti semula. */
  close(): void;
}

export function createCliPrompter(): CliPrompter {
  const rl: Interface = createInterface({
    input: process.stdin,
    output: process.stdout,
    // true hanya bila stdin terminal sungguhan; pipe otomatis non-echo.
    terminal: Boolean(process.stdin.isTTY),
  });

  const originalWrite = process.stdout.write.bind(process.stdout);
  let muted = false;

  // Baris yang sudah terbaca tetapi belum diminta pertanyaan berikutnya.
  const queuedLines: string[] = [];
  // Pertanyaan yang sedang menunggu baris berikutnya.
  const waiting: Array<(line: string) => void> = [];

  // Bungkam SEMUA tulisan ke stdout selama input password.
  // readline memanggil output.write() saat meng-echo karakter yang diketik;
  // dengan patch ini echo-nya tidak sampai ke layar.
  const patchedWrite = ((chunk: unknown, ...rest: unknown[]): boolean => {
    if (muted) {
      const cb = rest.find((item) => typeof item === 'function');
      if (typeof cb === 'function') (cb as () => void)();
      return true;
    }
    return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as unknown as typeof process.stdout.write;

  process.stdout.write = patchedWrite;

  rl.on('line', (line: string) => {
    const waiter = waiting.shift();
    if (waiter) waiter(line);
    else queuedLines.push(line);
  });

  // Input berakhir (EOF/pipe habis): semua pertanyaan yang masih
  // menggantung menerima string kosong → gagal validasi dengan pesan jelas.
  rl.on('close', () => {
    while (waiting.length > 0) {
      const waiter = waiting.shift();
      if (!waiter) break;
      waiter(queuedLines.shift() ?? '');
    }
  });

  const prompter: CliPrompter = {
    async ask(question: string, options: { hidden?: boolean } = {}): Promise<string> {
      // Label selalu tampil; yang disembunkan hanya jawabannya.
      originalWrite(question);

      if (options.hidden) muted = true;
      try {
        const queued = queuedLines.shift();
        const line =
          queued !== undefined
            ? queued
            : await new Promise<string>((resolve) => {
                waiting.push(resolve);
              });

        if (options.hidden) originalWrite('\n'); // pindah baris (echo Enter ikut dibungkam)
        return line;
      } finally {
        muted = false;
      }
    },

    close(): void {
      process.stdout.write = originalWrite;
      rl.close();
    },
  };

  // Ctrl+C: keluar rapi tanpa meninggalkan stdout dalam keadaan ter-patch.
  rl.on('SIGINT', () => {
    originalWrite('\n');
    prompter.close();
    process.exit(130);
  });

  return prompter;
}
