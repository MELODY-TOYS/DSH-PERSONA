/** Display data shared by the plugin components. */
export interface ModelIdentity { provider: string; model: string }
export interface VisualIdentity { name: string; avatar: string | null }
export interface UserDisplay extends VisualIdentity {}
export interface Persona extends VisualIdentity {
  id: string;
  revision: number;
  models: ModelIdentity[];
}
export interface PersonaLibrary { schemaVersion: 2; personas: Persona[] }
export interface IdentitySnapshot {
  personaId: string | null;
  personaRevision: number | null;
  user: UserDisplay;
  /** null means preserve the host's original assistant display. */
  assistant: VisualIdentity | null;
  model: ModelIdentity;
}
/** TODO: Implement a transcript adapter with identity reads scoped to the viewed Session. */
export interface HostAdapter {
  listModels(): Promise<readonly ModelIdentity[]>;
  saveTurnIdentity(sessionId: string, turnRef: string, snapshot: IdentitySnapshot): Promise<void>;
  readTurnIdentity(sessionId: string, turnRef: string): Promise<IdentitySnapshot | null>;
}
