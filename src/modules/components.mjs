import { avatarDefinition } from './avatar/definition.mjs';
import { promptsDefinition } from './prompts/definition.mjs';
export const components = Object.freeze([avatarDefinition, promptsDefinition]);
/** Native component rows are declared by cordis.patch.yml. */
export const reservedComponents = Object.freeze([{ id: 'reserved', title: '后续组件', status: 'reserved' }]);
