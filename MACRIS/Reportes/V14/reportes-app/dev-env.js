// ===================================================================
// DANGER: DEVELOPMENT ONLY - DO NOT DEPLOY OR COMMIT THIS FILE
// ===================================================================
// This file is a temporary workaround for local development when a
// standard .env file is not being processed by your server. It
// simulates the 'process.env.API_KEY' variable so the application
// can run without changing the core, secure code.
//
// In a production environment, you MUST use a proper method for
// setting environment variables.
// ===================================================================

globalThis.process = {
  ...globalThis.process,
  env: {
    ...globalThis.process?.env,
    API_KEY: 'AIzaSyCkzXBL21pb2Fyc-LQK-ELaKKWVYgK67BM'
  }
};
