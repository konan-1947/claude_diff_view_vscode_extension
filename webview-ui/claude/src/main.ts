import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import '@vscode/codicons/dist/codicon.css';
import '@mdi/font/css/materialdesignicons.min.css';

declare global {
  interface Window {
    acquireVsCodeApi?: <T = unknown>() => {
      postMessage(data: T): void;
      getState(): any;
      setState(data: any): void;
    };
    UIC_BOOTSTRAP?: {
      host?: 'sidebar' | 'editor' | 'panel';
      page?: string;
      /** Claude UI tab id in the terminal panel; tags every message to the host. */
      id?: string;
      /** Claude session id to reopen when the tab is rebuilt (webview reload, Agent mode toggle). */
      resume?: string;
      /** `/fork`: `resume` is a conversation to open a copy of, not this tab's own */
      fork?: boolean;
      /** First message to send once the tab's conversation is open (`/fork <prompt>`) */
      prompt?: string;
      /** Agent behind this tab: 'claude' (Agent SDK) or 'omp' (omp --mode rpc). Default 'claude'. */
      backend?: 'claude' | 'omp';
    };
  }
}

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.mount('#app');
