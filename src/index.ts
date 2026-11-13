/**
 * JupyterLab plugin entry.
 *
 * The plugin id `provjup:plugin` makes JupyterLab read its settings schema from
 * `schema/plugin.json`. Activation (manifest discovery and verification, the session
 * lifecycle and the signal wiring) lands in Task 4; until then the plugin only announces
 * that it loaded.
 */

import type { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';

export const PLUGIN_ID = 'provjup:plugin';

const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'Records a tamper-evident Provenance log of notebook work.',
  autoStart: true,
  activate: (_app: JupyterFrontEnd): void => {
    console.info(`${PLUGIN_ID}: loaded (recording is not implemented yet)`);
  },
};

export default plugin;
