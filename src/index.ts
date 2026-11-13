/**
 * JupyterLab plugin entry.
 *
 * The plugin id `provjup:plugin` makes JupyterLab read its settings schema from
 * `schema/plugin.json`. On start it activates recording for every verified assignment folder
 * under the server root, and ends those sessions when the page closes.
 *
 * Not yet connected (later tasks): notebook and editor signals, the status item, and
 * recovery after the page reloads.
 */

import type { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import packageJson from '../package.json';
import { SystemClock } from './core/index';
import { activate } from './recorder/activation/activation';
import { ServerClient } from './recorder/io/server-client';

export const PLUGIN_ID = 'provjup:plugin';

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'Records a tamper-evident Provenance log of notebook work.',
  autoStart: true,
  activate: (app: JupyterFrontEnd): void => {
    void start(app);
  },
};

async function start(app: JupyterFrontEnd): Promise<void> {
  const outcome = await activate({
    server: new ServerClient(app.serviceManager.serverSettings),
    clock: new SystemClock(),
    recorderVersion: packageJson.version,
    jupyterlabVersion: app.version,
    onProblem: (root, problem) =>
      console.warn(`${PLUGIN_ID}: log write problem in ${root}`, problem),
  });

  if (outcome.discoveryError !== undefined) {
    console.warn(`${PLUGIN_ID}: could not look for assignments: ${outcome.discoveryError}`);
  }
  for (const skip of outcome.skipped) {
    console.warn(`${PLUGIN_ID}: not recording ${skip.root || '(root)'}: ${skip.error.kind}`);
  }
  for (const failure of outcome.failed) {
    console.warn(`${PLUGIN_ID}: could not start recording ${failure.root}: ${failure.message}`);
  }
  const roots = outcome.registry.all().map((s) => s.root || '(root)');
  console.info(`${PLUGIN_ID}: recording ${roots.length} assignment(s)`, roots);

  // Best effort: a closing page may not finish these requests. An unclean close leaves no
  // session.end, which the analyzer already handles, as it does for VS Code being killed.
  window.addEventListener('pagehide', () => {
    void outcome.registry.endAll('page_closed');
  });
}

export default plugin;
