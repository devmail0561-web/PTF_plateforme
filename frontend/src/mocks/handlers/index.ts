import { authHandlers } from './auth.handlers';
import { tasksHandlers } from './tasks.handlers';
import { profileHandlers } from './profile.handlers';
import { projectsHandlers } from './projects.handlers';

export const handlers = [
  ...authHandlers,
  ...tasksHandlers,
  ...profileHandlers,
  ...projectsHandlers,
];
