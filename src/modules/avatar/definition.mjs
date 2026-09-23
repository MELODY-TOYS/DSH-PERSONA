import { AVATAR_NAMESPACE } from './settings.mjs';
/** Settings and runtime belong to the feature component. The package only composes them. */
export const avatarDefinition = Object.freeze({
  id: 'avatar', rowId: 'dsh-persona', title: '名称与头像', apiVersion: 1, configVersion: 3,
  namespace: AVATAR_NAMESPACE, status: 'available',
  summary: '设置用户与模型的名称和头像。',
});
