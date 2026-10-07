/** The witness trees that qualify the quality controls of a Maven target (VER-05). */
import { WITNESS_PACKAGE, WITNESS_SOURCE_ROOT } from "../project/witness-layout.ts";

/** A method whose cyclomatic complexity is 11: one more than the threshold of the referential. */
const COMPLEX_WITNESS = `package ${WITNESS_PACKAGE};

public final class Witness495Complex {
    private Witness495Complex() {}

    public static int grade(int a, int b, int c) {
        int r = 0;
        if (a > 0) r++;
        if (b > 0) r++;
        if (c > 0) r++;
        if (a > 1) r++;
        if (b > 1) r++;
        if (c > 1) r++;
        if (a > 2) r++;
        if (b > 2) r++;
        if (c > 2) r++;
        if (a > 3) r++;
        return r;
    }
}
`;

/** A class carrying a block of more than 100 tokens that only its twin witness repeats. */
function duplicateWitness(name: string): string {
	return `package ${WITNESS_PACKAGE};

public final class ${name} {
    private ${name}() {}

    public static long witness495Checksum(long[] samples) {
        long witness495Sum = 17L;
        for (int k = 0; k < samples.length; k++) {
            if (samples[k] % 3L == 1L) {
                witness495Sum = witness495Sum * 31L + samples[k];
            } else {
                witness495Sum = witness495Sum * 37L - samples[k] / 5L;
            }
            if (witness495Sum > 99_991L) {
                witness495Sum = witness495Sum % 99_991L;
            }
        }
        String witness495Label = "sum=" + witness495Sum + ";n=" + samples.length;
        return witness495Sum + witness495Label.length();
    }
}
`;
}

/**
 * The trees that carry the defects the quality controls claim to detect (VER-05): a method above the
 * complexity threshold for PMD, and a block two witness classes repeat for CPD. The project may already
 * carry both; a witness is judged by the findings in its own files.
 */
export function qualityNegativeWitnesses(witnessPrefix: string): Record<string, Record<string, string>> {
	const root = `${witnessPrefix}${WITNESS_SOURCE_ROOT}`;
	return {
		pmd: { [`${root}Witness495Complex.java`]: COMPLEX_WITNESS },
		cpd: {
			[`${root}Witness495DuplicateA.java`]: duplicateWitness("Witness495DuplicateA"),
			[`${root}Witness495DuplicateB.java`]: duplicateWitness("Witness495DuplicateB"),
		},
	};
}
