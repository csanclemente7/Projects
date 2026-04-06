import './src/config';
import { main } from './src/main';

// El polyfill de process.env se ejecuta automáticamente al importar './src/config'
main().catch(console.error);