import { solveAutoAssignments } from './auto-assign-solver';
import type { AutoAssignContext, AutoAssignExecutionParams } from './schema';

type AutoAssignWorkerRequest = {
  context: AutoAssignContext;
  params: AutoAssignExecutionParams;
  seed: number;
};

self.addEventListener('message', (event: MessageEvent<AutoAssignWorkerRequest>) => {
  self.postMessage(solveAutoAssignments(event.data.context, event.data.params, event.data.seed));
});
