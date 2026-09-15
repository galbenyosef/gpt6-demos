export type Vec3 = [number, number, number];
export type Kind = "avatar" | "object" | "scene" | "other";
export interface ReferenceAsset { id: string; assemblageId: string; assetId: string; type: "photo" | "texture"; role: string; description: string; createdAt: string }
export interface Assemblage {
  id: string; name: string; kind: Kind; description: string;
  status: "draft" | "generating" | "ready" | "failed";
  references: ReferenceAsset[]; currentRevision: number; currentRevisionId?: string;
  sourceProgramId?: string; currentModelId?: string; createdAt: string; updatedAt: string;
}
export interface SourceProgram { id: string; assemblageId: string; language: "typescript"; target: "threejs-build-module"; entryPoint: "buildModel"; code: string; version: number; createdAt: string }
export interface Override { objectId: string; createGroup?: { name: string }; position?: Vec3; rotation?: Vec3; scale?: Vec3; visible?: boolean; deleted?: boolean; parentId?: string; material?: { baseColor: string; roughness: number; metalness: number } }
export interface BuildDiagnostics { durationMs: number; objectCount: number; meshCount: number; vertexCount: number; triangleCount: number; materialCount: number; textureCount: number; boundingBox: { min: Vec3; max: Vec3 }; warnings: string[] }
export interface ModelArtifact { id: string; assemblageId: string; sourceProgramId?: string; format: "internal-scene" | "glb"; assetId: string; glbAssetId: string; gltfAssetId: string; thumbnailAssetId: string; previewAssetIds: string[]; metadata: Record<string, unknown>; createdAt: string }
export interface Revision { id: string; assemblageId: string; revisionNumber: number; parentRevisionId?: string; sourceProgramId: string; modelArtifactId: string; referenceAssetIds: string[]; originatingPrompt: string; aiSummary: string; diagnostics: BuildDiagnostics; previewAssetIds: string[]; overrides: Override[]; parameters: Record<string, unknown>; evaluation?: RenderEvaluation; provenance: { model: string; runtimeVersion: string; createdAt: string }; createdAt: string }
export interface RenderEvaluation { overallAssessment: string; issues: { area: string; severity: "minor" | "moderate" | "major"; description: string; suggestedChange: string }[]; recommendation: "accept" | "refine" | "requires-user-review" }
export interface BuildAttempt { id: string; jobId: string; iteration: number; sourceProgram: string; status: "validation-failed" | "build-failed" | "rendered" | "accepted" | "superseded"; diagnostics?: BuildDiagnostics; error?: string; previewAssetIds?: string[]; modelArtifactId?: string; overrides?: Override[]; parameters?: Record<string, unknown>; evaluation?: RenderEvaluation; summary?: string; createdAt?: string }
export interface GenerationJob { id: string; assemblageId: string; status: "queued" | "running" | "review" | "completed" | "failed" | "cancelled"; phase: string; iteration: number; maxIterations: number; progress: number; latestAttemptId?: string; evaluation?: RenderEvaluation; error?: string; currentSourceProgramId?: string; currentModelArtifactId?: string; createdAt: string; updatedAt: string }
export interface AssetMetadata { id: string; assemblageId: string; mimeType: string; size: number; originalFilename?: string; sha256: string; category: "reference" | "texture" | "model" | "preview"; createdAt: string }
export interface Message { id: string; assemblageId: string; role: "user" | "assistant"; content: string; createdAt: string; jobId?: string }
export interface BuildResult { scene: Record<string, unknown>; diagnostics: BuildDiagnostics; metadata: Record<string, unknown> }
export interface GeneratedProgram { code: string; summary: string; objectStructure: { name: string; purpose: string }[]; assumptions: string[]; expectedLimitations: string[] }
export const RUNTIME_VERSION = "1.0.0";
