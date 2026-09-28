# Inventario

Se trasladó el módulo de `Luchex (2).zip` a `/panel/inventario`:

- Alta manual o mediante QR; nombre opcional y stock entero de 0 a 999999.
- Cámara trasera preferida, reintento, zoom y linterna si el dispositivo los soporta.
- Conservación del contenido completo del QR, incluidas URLs, sin abrir enlaces.
- Búsqueda por código o nombre sin distinguir tildes o mayúsculas.
- Edición de código, nombre y stock; eliminación y mensajes de resultado.
- Listado en tiempo real, contador, fecha de registro, estados vacíos y errores recuperables.
- Detección de códigos duplicados mediante ID determinista y transacciones de Firestore.
- Diseño adaptable a móvil y cierre del escáner al salir del formulario.

## Firebase

Usa el proyecto de `src/enviroments/environment.ts`: `luchex-e844c`, y la sesión existente de Firebase Authentication. Los productos se guardan en la colección compartida `productos`, no en almacenamiento local.

Cada documento contiene `codigo`, `nombre`, `total`, `creado` (fecha del servidor) y `creadoPor` (UID). Las ediciones incorporan `actualizado` y `actualizadoPor`. Si cambia el código, una transacción cambia el ID sin perder los datos de creación. El código distingue mayúsculas y conserva espacios, igual que en el ZIP.

## Publicar las reglas

1. En Firebase Console, selecciona **luchex-e844c → Firestore Database**. Crea la base de datos predeterminada si aún no existe.
2. En **Reglas**, pega el contenido completo de `firestore.rules` y pulsa **Publicar**.
3. Inicia sesión en LuchexV1 usando una cuenta existente de Firebase Authentication.

Alternativamente, desde la carpeta `LuchexV1`:

```powershell
npx firebase login
npm run deploy:rules
```

Estas reglas autorizan a los usuarios autenticados del taller a consultar, crear, editar y eliminar productos, y validan campos, cantidades y fechas. No habilitan acceso público. El archivo contiene únicamente las reglas de inventario; si ya tienes reglas de otras colecciones publicadas, conserva sus bloques al incorporar `match /productos/{productoId}`. El despliegue por CLI reemplaza el conjunto completo de reglas.

Para publicar la aplicación: `npm run deploy`. El despliegue de hosting y el de reglas son independientes.

## Comprobación manual en tu proyecto

1. Agrega un código manual con stock y recarga: debe permanecer.
2. Abre otra sesión autorizada: el cambio debe aparecer en tiempo real.
3. Intenta agregar el mismo código: debe mostrar el aviso de duplicado.
4. Edita nombre, stock y código; verifica que la fecha de creación se conserva.
5. Elimina el producto de prueba y verifica ambas sesiones.
6. En un móvil con HTTPS, permite la cámara y escanea un QR. Zoom y linterna dependen del hardware.

Los datos existentes del proyecto asociado al ZIP no se migran automáticamente a otro proyecto Firebase.

## Pruebas automatizadas

```powershell
npm run build
npm test -- --watch=false --browsers=ChromeHeadless --include="src/app/inventario/**/*.spec.ts"
npm run test:firestore
```

Las pruebas de Firestore requieren Java 21 o superior en `PATH` y usan el emulador con el proyecto ficticio `demo-luchex-inventario`. No escriben productos en producción.
