declare module 'event-source-polyfill' {
  export class EventSourcePolyfill extends EventSource {
    constructor(url: string, config?: {
      headers?: Record<string, string>;
      withCredentials?: boolean;
    });
  }
}