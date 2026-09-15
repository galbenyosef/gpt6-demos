// This file is also supplied verbatim to Astra and to the virtual TypeScript compiler.
export type Vec3 = [number, number, number];
export type Profile2D = [number, number][];
export type ModelObject = { name: string; visible: boolean; children: ModelObject[]; add(...objects: ModelObject[]): void };
export type MaterialSpec = { baseColor?: string; roughness?: number; metalness?: number; opacity?: number; emissive?: string };
export type PrimitiveOptions = { name?: string; width?: number; height?: number; depth?: number; radius?: number; radiusTop?: number; radiusBottom?: number; tube?: number; length?: number; segments?: number; material?: MaterialSpec };
export type Deformation = { type: "scale-region" | "bend" | "taper" | "twist" | "inflate" | "displace" | "curve-warp"; centre?: Vec3; radius?: number; scale?: Vec3; amount?: number; axis?: "x" | "y" | "z"; falloff?: "smooth" | "linear"; seed?: number; curve?: Vec3[] };
export interface ModellingRuntime {
  create: {
    box(options?: PrimitiveOptions): ModelObject; sphere(options?: PrimitiveOptions): ModelObject;
    ellipsoid(options?: PrimitiveOptions): ModelObject; cylinder(options?: PrimitiveOptions): ModelObject;
    cone(options?: PrimitiveOptions): ModelObject; capsule(options?: PrimitiveOptions): ModelObject;
    torus(options?: PrimitiveOptions): ModelObject; plane(options?: PrimitiveOptions): ModelObject;
    group(name?: string): ModelObject;
  };
  transform: { position(object: ModelObject, value: Vec3): void; rotation(object: ModelObject, radians: Vec3): void; scale(object: ModelObject, value: Vec3): void; translate(object: ModelObject, value: Vec3): void };
  material: { standard(options: MaterialSpec): MaterialSpec; skin(options?: MaterialSpec): MaterialSpec; apply(object: ModelObject, material: MaterialSpec): void };
  geometry: {
    union(a: ModelObject, b: ModelObject): ModelObject; subtract(a: ModelObject, b: ModelObject): ModelObject; intersect(a: ModelObject, b: ModelObject): ModelObject;
    extrude(profile: Profile2D, options: { depth: number; bevel?: number; steps?: number }): ModelObject;
    lathe(profile: Profile2D, options?: { segments?: number }): ModelObject;
    loft(profiles: Vec3[][], options?: { closed?: boolean }): ModelObject;
    mirror(object: ModelObject, axis: "x" | "y" | "z"): ModelObject;
    duplicate(object: ModelObject): ModelObject;
    smooth(object: ModelObject, options?: { iterations?: number; factor?: number }): ModelObject;
    subdivide(object: ModelObject, levels: number): ModelObject;
    deform(object: ModelObject, deformation: Deformation): void;
    fromVertices(options: { positions: number[]; indices?: number[]; uvs?: number[] }): ModelObject;
  };
  scene: { rename(object: ModelObject, name: string): void; metadata(object: ModelObject, data: Record<string, unknown>): void };
  texture: { apply(object: ModelObject, assetId: string): void };
  utility: { centre(object: ModelObject): void; bounds(object: ModelObject): { min: Vec3; max: Vec3 }; random(seed: number): () => number };
}
export interface ModelBuildContext { runtime: ModellingRuntime; assets: { texture(assetId: string): string }; parameters: Record<string, unknown>; metadata: { assemblageId: string; revision: number } }
export interface ModelBuildOutput { root: ModelObject; metadata?: Record<string, unknown>; suggestedCamera?: { position: Vec3; target: Vec3 } }
