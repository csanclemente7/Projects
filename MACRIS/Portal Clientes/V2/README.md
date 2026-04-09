# Portal de Reportes - Clientes

App separada para clientes con acceso por link directo y un mini portal admin para copiar códigos.

## Requisitos
- Node.js

## Instalacion
1. npm install
2. El PIN admin usa la misma clave del usuario administrador en la app de reportes.
3. npm run dev

## Acceso
- Cliente: https://tu-dominio/portal-reportes-clientes/?empresa=CODIGO
- Admin: https://tu-dominio/portal-reportes-clientes/?admin=1

Notas:
- El código de empresa se genera con el nombre + un fragmento del ID.
- El PIN admin por defecto es macris-admin si no defines la variable.
