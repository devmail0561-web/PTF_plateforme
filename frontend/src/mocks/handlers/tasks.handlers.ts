import { graphql, HttpResponse } from 'msw';
import { mockTasks, mockMyTasks } from '../data/tasks.fixture';

export const tasksHandlers = [
  graphql.query('GetTasks', ({ variables }) => {
    const filter = variables.filter ?? {};
    let filtered = [...mockTasks];

    if (filter.status) filtered = filtered.filter((t) => t.status === filter.status);
    if (filter.projectId) filtered = filtered.filter((t) => t.projectId === filter.projectId);
    if (filter.rewardMode) filtered = filtered.filter((t) => t.rewardMode === filter.rewardMode);
    if (filter.minReward != null) filtered = filtered.filter((t) => (t.rewardAmount ?? 0) >= filter.minReward);
    if (filter.priority) filtered = filtered.filter((t) => t.priority === filter.priority);
    if (filter.devAddress) filtered = filtered.filter((t) => t.devAddress === filter.devAddress);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 20;
    return HttpResponse.json({ data: { tasks: filtered.slice(offset, offset + limit) } });
  }),

  graphql.query('GetTask', ({ variables }) => {
    const task = mockTasks.find((t) => t.id === variables.id);
    if (!task) {
      return HttpResponse.json({ errors: [{ message: 'Task not found', extensions: { code: 'NOT_FOUND' } }] });
    }
    return HttpResponse.json({ data: { task } });
  }),

  graphql.query('GetMyTasks', ({ variables }) => {
    let tasks = [...mockMyTasks];
    if (variables.status) tasks = tasks.filter((t) => t.status === variables.status);
    return HttpResponse.json({ data: { myTasks: tasks } });
  }),

  graphql.mutation('CancelTask', () => {
    return HttpResponse.json({ data: { cancelTask: true } });
  }),

];
