import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ObjectRef } from "../../contracts/v1/common.ts";
import type { ObjectStorePort } from "../../ports/object-store.ts";

export interface CasHooks {
	/** Called after the temporary file is written and before the atomic rename (fault injection). */
	beforeRename?: (tmpPath: string, finalPath: string) => void;
}

/**
 * Content-addressed store: `objects/sha256/ab/cdef...` written through a temporary file, fsync,
 * then atomic rename (conception §7.3 step 1). Objects are immutable; a re-put is a no-op.
 */
export class CasObjectStore implements ObjectStorePort {
	readonly root: string;
	private readonly hooks: CasHooks;
	constructor(root: string, hooks: CasHooks = {}) {
		this.root = root;
		this.hooks = hooks;
		mkdirSync(join(root, "sha256"), { recursive: true });
		mkdirSync(join(root, "tmp"), { recursive: true });
	}

	pathFor(digest: string): string {
		const hex = digest.startsWith("sha256:") ? digest.slice(7) : digest;
		return join(this.root, "sha256", hex.slice(0, 2), hex.slice(2));
	}

	async put(bytes: Uint8Array, mediaType: string): Promise<ObjectRef> {
		const hex = createHash("sha256").update(bytes).digest("hex");
		const digest = `sha256:${hex}`;
		const finalPath = this.pathFor(digest);
		const ref: ObjectRef = { algorithm: "sha256", digest, size_bytes: bytes.byteLength, media_type: mediaType };
		if (await this.has(digest)) return ref;
		const tmp = join(this.root, "tmp", `${hex}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`);
		await mkdir(dirname(finalPath), { recursive: true });
		const fh = await open(tmp, "w");
		try {
			await fh.writeFile(bytes);
			await fh.sync();
		} finally {
			await fh.close();
		}
		this.hooks.beforeRename?.(tmp, finalPath);
		await rename(tmp, finalPath);
		return ref;
	}

	putText(text: string, mediaType = "text/plain; charset=utf-8"): Promise<ObjectRef> {
		return this.put(new TextEncoder().encode(text), mediaType);
	}

	async get(ref: ObjectRef | string, range?: { offset: number; length: number }): Promise<Uint8Array | null> {
		const digest = typeof ref === "string" ? ref : ref.digest;
		try {
			if (!range) return new Uint8Array(await readFile(this.pathFor(digest)));
			const fh = await open(this.pathFor(digest), "r");
			try {
				const buf = new Uint8Array(range.length);
				const { bytesRead } = await fh.read(buf, 0, range.length, range.offset);
				return buf.subarray(0, bytesRead);
			} finally {
				await fh.close();
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	}

	async has(digest: string): Promise<boolean> {
		try {
			return statSync(this.pathFor(digest)).isFile();
		} catch {
			return false;
		}
	}

	async verify(digest: string): Promise<boolean> {
		const bytes = await this.get(digest);
		if (!bytes) return false;
		return `sha256:${createHash("sha256").update(bytes).digest("hex")}` === digest;
	}

	async listDigests(): Promise<string[]> {
		const out: string[] = [];
		const base = join(this.root, "sha256");
		for (const prefix of readdirSync(base)) {
			const dir = join(base, prefix);
			if (!statSync(dir).isDirectory()) continue;
			for (const rest of readdirSync(dir)) out.push(`sha256:${prefix}${rest}`);
		}
		return out.sort();
	}

	/** Removes leftover temporary files from interrupted writes. Never touches referenced objects. */
	async cleanupTemporaries(): Promise<number> {
		const dir = join(this.root, "tmp");
		let n = 0;
		for (const f of readdirSync(dir)) {
			await rm(join(dir, f), { force: true });
			n++;
		}
		return n;
	}

	/** Writes a small JSON document; convenience for callers that store canonical JSON. */
	async putJson(value: unknown): Promise<ObjectRef> {
		return this.put(new TextEncoder().encode(JSON.stringify(value)), "application/json");
	}

	static async writeFileAtomic(path: string, bytes: Uint8Array): Promise<void> {
		const tmp = `${path}.${process.pid}.tmp`;
		await writeFile(tmp, bytes);
		await rename(tmp, path);
	}
}
