/**
 * JupyterLab plugin entry.
 *
 * The plugin has no settings, so it has no settings schema: students get no knobs to change.
 * On start it activates recording for every verified assignment folder
 * under the server root, records edits to notebooks and text files in those folders, and ends
 * the sessions when the page closes.
 *
 * Not yet connected (later tasks): paste, focus, selection and heartbeat signals, external
 * changes, the status item, and recovery after the page reloads.
 */

import type { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { IEditorTracker } from '@jupyterlab/fileeditor';
import { INotebookTracker } from '@jupyterlab/notebook';
import packageJson from '../package.json';
import { SystemClock } from './core/index';
import { activate } from './recorder/activation/activation';
import { ServerClient } from './recorder/io/server-client';
import { keystrokeTimer, timingRequested } from './recorder/perf/keystroke-timing';
import { connectJupyterDocuments } from './recorder/wiring/jupyter-documents';

export const PLUGIN_ID = 'provjup:plugin';

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'Records a tamper-evident Provenance log of notebook work.',
  autoStart: true,
  requires: [INotebookTracker, IEditorTracker],
  activate: (app: JupyterFrontEnd, notebooks: INotebookTracker, editors: IEditorTracker): void => {
    void start(app, notebooks, editors);
  },
};

async function start(
  app: JupyterFrontEnd,
  notebooks: INotebookTracker,
  editors: IEditorTracker,
): Promise<void> {
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
  if (roots.length === 0) return;

  const documents = connectJupyterDocuments({
    sessions: () => outcome.registry.all(),
    notebooks,
    editors,
    // Only the browser check turns this on (scripts/browser-keystroke-check.mjs).
    timeKeystroke: keystrokeTimer(timingRequested(globalThis), performance),
    readSavedText: async (path) => {
      try {
        const file = await app.serviceManager.contents.get(path, {
          type: 'file',
          format: 'text',
          content: true,
        });
        return typeof file.content === 'string' ? file.content : null;
      } catch {
        return null;
      }
    },
  });

  // Best effort: a closing page may not finish these requests. An unclean close leaves no
  // session.end, which the analyzer already handles, as it does for VS Code being killed.
  window.addEventListener('pagehide', () => {
    documents.dispose();
    void outcome.registry.endAll('page_closed');
  });
}

export default plugin;
