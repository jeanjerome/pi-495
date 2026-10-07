/** The witness trees that qualify the quality controls of a Node target (VER-05). */

/** Twenty conditions on top of the function itself: a cyclomatic complexity of 21, one above the threshold. */
const COMPLEX_WITNESS = `export function witness495Grade(a, b, c) {
  let r = 0;
${Array.from({ length: 20 }, (_, i) => `  if (${["a", "b", "c"][i % 3]} > ${Math.floor(i / 3)}) r++;`).join("\n")}
  return r;
}
`;

/** A block of more than 50 tokens over more than 5 lines that only its twin witness repeats. */
const DUPLICATE_WITNESS = `export function witness495Checksum(samples) {
  let witness495Sum = 17;
  for (let k = 0; k < samples.length; k++) {
    if (samples[k] % 3 === 1) {
      witness495Sum = witness495Sum * 31 + samples[k];
    } else {
      witness495Sum = witness495Sum * 37 - samples[k] / 5;
    }
  }
  return witness495Sum;
}
`;

/**
 * The trees that carry the defects the quality controls claim to detect (VER-05): a function above the
 * complexity threshold for ESLint, and a block two witness modules repeat for jscpd. The project may
 * already carry both; a witness is judged by the findings in its own files.
 */
export const QUALITY_NEGATIVE_WITNESSES: Record<string, Record<string, string>> = {
	eslint: { "src/witness495/complex.mjs": COMPLEX_WITNESS },
	jscpd: {
		"src/witness495/duplicate-a.mjs": DUPLICATE_WITNESS,
		"src/witness495/duplicate-b.mjs": DUPLICATE_WITNESS,
	},
};
