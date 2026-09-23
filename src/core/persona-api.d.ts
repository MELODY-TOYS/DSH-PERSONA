import type { Persona, PersonaLibrary, UserDisplay, ModelIdentity } from './contracts.js';
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;
/** Host service v1. Values are immutable committed settings; drafts stay with their editor. */
export interface DshPersonaService {
  readonly apiVersion: 1;
  getSnapshot(): Immutable<{ version: 3; user: UserDisplay; library: PersonaLibrary }>;
  getUser(): Immutable<UserDisplay>;
  listPersonas(): readonly Immutable<Persona>[];
  resolveModel(model: ModelIdentity): Immutable<Persona> | null;
}
declare module '@deepseek-ai/cordis' {
  interface Context { dshPersona: DshPersonaService; }
}
