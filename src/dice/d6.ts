import type { DieDefinition } from "./types";

/** Opposite faces add up to 7, like a real d6. */
export const d6: DieDefinition = {
  name: "d6",
  edgeLength: 1,
  faces: [
    { value: 1, normal: { x: 0, y: 1, z: 0 } },
    { value: 6, normal: { x: 0, y: -1, z: 0 } },
    { value: 2, normal: { x: 1, y: 0, z: 0 } },
    { value: 5, normal: { x: -1, y: 0, z: 0 } },
    { value: 3, normal: { x: 0, y: 0, z: 1 } },
    { value: 4, normal: { x: 0, y: 0, z: -1 } },
  ],
};
