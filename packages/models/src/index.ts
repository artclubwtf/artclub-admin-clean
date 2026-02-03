import { z } from "zod";

export const ArtistStage = z.enum(["Idea", "In Review", "Angebot", "Under Contract", "Archived"]);
export type ArtistStage = z.infer<typeof ArtistStage>;

export * from "./artwork";
export * from "./mobile";
