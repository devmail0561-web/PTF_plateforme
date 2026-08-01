import { graphql, HttpResponse } from 'msw';
import { mockProjects } from '../data/projects.fixture';

export const projectsHandlers = [
  graphql.query('GetProjects', ({ variables }) => {
    const filter = variables.filter ?? {};
    let filtered = [...mockProjects];

    if (filter.type) filtered = filtered.filter((p) => p.type === filter.type);
    if (filter.rewardMode) filtered = filtered.filter((p) => p.rewardMode === filter.rewardMode);
    if (filter.status) filtered = filtered.filter((p) => p.status === filter.status);

    return HttpResponse.json({ data: { projects: filtered } });
  }),
];
