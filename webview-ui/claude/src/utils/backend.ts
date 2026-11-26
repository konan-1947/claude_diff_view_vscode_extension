/**
 * Which agent drives this chat tab. The same app serves Claude UI tabs
 * (Claude Agent SDK) and OMP UI tabs (`omp --mode rpc`, src/omp); the host
 * speaks the same protocol for both, so most of the UI does not care. Use
 * `isOmp` only to hide or relabel what one backend cannot do.
 */
export type ChatBackend = 'claude' | 'omp';

export const backend: ChatBackend = window.UIC_BOOTSTRAP?.backend === 'omp' ? 'omp' : 'claude';

export const isOmp = backend === 'omp';

/** Name of the agent as shown in the UI ("Claude", "OMP") */
export const agentName = isOmp ? 'OMP' : 'Claude';
