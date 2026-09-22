/** Declared here, not by the package: see README.md beside this file. */

import type { ParsedDiff } from "@xynogen/pix-pretty/diff";

/** Renders at the terminal width it reads itself: the caller cannot announce one. */
export declare function renderUnified(diff: ParsedDiff, language?: string, max?: number): Promise<string>;
