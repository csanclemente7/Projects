// ===================================================================
// DANGER: DEVELOPMENT ONLY - DO NOT DEPLOY OR COMMIT THIS FILE
// ===================================================================
// Este archivo simula la variable 'process.env.API_KEY' para que la
// aplicación funcione en el entorno de desarrollo.
// ===================================================================

globalThis.process = {
  ...globalThis.process,
  env: {
    ...globalThis.process?.env,
    API_KEY: 'AIzaSyCkzXBL21pb2Fyc-LQK-ELaKKWVYgK67BM'
  }
};