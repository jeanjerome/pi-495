import type { TSchema } from "typebox";
import {
	ActorRef,
	ArtifactRef,
	CandidateRef,
	CanonicalError,
	Envelope,
	EnvironmentRef,
	ObjectRef,
	ProtocolRef,
	SubjectRef,
} from "./v1/common.ts";
import { CandidateManifest, ReferenceSnapshot } from "./v1/candidate.ts";
import { DecisionRequest, DecisionResponse, HumanDecision, HumanOrigin } from "./v1/decision.ts";
import { BaselineComparison, Evidence, EvidenceCandidate, Finding } from "./v1/evidence.ts";
import { OperationRequest, OperationResult } from "./v1/operation.ts";
import {
	BaselinePolicy,
	ControlDefinition,
	Design,
	Mandate,
	Protocol,
	RequirementsDocument,
	StructureRule,
} from "./v1/protocol.ts";

/** Every published contract, keyed by its short name. Used to emit `contracts/v1/*.json`. */
export const CONTRACTS: Record<string, TSchema> = {
	"artifact-ref": ArtifactRef,
	"subject-ref": SubjectRef,
	"candidate-ref": CandidateRef,
	"protocol-ref": ProtocolRef,
	"environment-ref": EnvironmentRef,
	"actor-ref": ActorRef,
	"object-ref": ObjectRef,
	"canonical-error": CanonicalError,
	envelope: Envelope,
	finding: Finding,
	"baseline-comparison": BaselineComparison,
	evidence: Evidence,
	"evidence-candidate": EvidenceCandidate,
	"operation-request": OperationRequest,
	"operation-result": OperationResult,
	"decision-request": DecisionRequest,
	"decision-response": DecisionResponse,
	"human-origin": HumanOrigin,
	"human-decision": HumanDecision,
	"reference-snapshot": ReferenceSnapshot,
	"candidate-manifest": CandidateManifest,
	"structure-rule": StructureRule,
	"control-definition": ControlDefinition,
	"baseline-policy": BaselinePolicy,
	protocol: Protocol,
	requirements: RequirementsDocument,
	mandate: Mandate,
	design: Design,
};
