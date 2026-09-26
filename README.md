# Sistema de Gestión para Taller Mecánico

Este proyecto es un sistema web para ayudar a gestionar un taller mecánico.

## Aplicación publicada

La aplicación ya está publicada en Firebase Hosting.

Enlace:

https://luchex-e844c.web.app

## Usuario de prueba

Puedes ingresar con esta cuenta:

**Correo:** `luchex@gmail.com`  
**Contraseña:** `123456`

> Esta cuenta debe usarse solo para pruebas del sistema.

## Cómo actualizar la página publicada

Cada vez que hagas cambios en el proyecto y quieras que esos cambios aparezcan en la página web publicada, abre la terminal dentro del proyecto y ejecuta:

```bash
npm run deploy  # ejecuta este en tu terminal
```

### Como clonar este repositorio
```bash
git clone https://github.com/JulianMerino877/Luchex.git     # clonar repositorio
```

## Se marroglaste la rama o lo jodiste como a tu ex Como ELIMINAR
### si aun no subiste al github o aun no enviaste a main usa este
```bash
git switch main                    # Primero sales de la rama a rama principal(main)
git branch -D feature/inventario   # eliminas en la parte de feature/inventario  escribe tu rama y eliminas
git branch                         # fijate se si eliminno tu rama
```
### si ya subis al github o ya mandaste al main anteriormente
### y marroglaste la segunda parte de tu trabajo en la misma rama que enviaste
```bash
git restore .  # esto elimina cambios recientes 
git status     # ver estado del proyecto si eliminaste los recientes no debe aparecer rojos
        
```

### 1. Crear tu rama

```bash
git switch main          # Entrar a main
git pull origin main     # Descargar lo último del proyecto
git switch -c mi-rama     # Crear tu rama y entrar en ella
git branch               # Saber en que rama estas realmente


```

Ahora haz tu trabajo y guarda tus archivos.

### 2. Subir tu trabajo por primera vez

```bash
git status                       # Ver los archivos que cambiaste
git add .                        # Preparar tus cambios para guardarlos
git commit -m "Agregué el login"  # Guardar tus cambios con una descripción
git push -u origin mi-rama        # Subir tu rama a GitHub
```

Cambia `"Agregué el login"` por una descripción de lo que hiciste.

**Para que tu trabajo pase a `main`:**

1. Abre el repositorio en GitHub.
2. Entra a **Pull requests** → **New pull request**.
3. En **base**, elige `main`. En **compare**, elige tu rama.
4. Escribe qué hiciste y pulsa **Create pull request**.
5. Avisa al encargado para que revise y junte tu trabajo con `main` usando **Merge**.

### 3. Si ya subiste tu rama y quieres subir más cambios

Sigue trabajando en esa misma rama. Guarda tus archivos y ejecuta:

```bash
git status                          # Ver los archivos que cambiaste
git add .                           # Preparar tus nuevos cambios
git commit -m "Corregí el login"     # Guardarlos con una nueva descripción
git push                            # Subirlos a la misma rama en GitHub
```

Si el encargado **todavía no juntó tu trabajo con `main`**, verá los nuevos cambios en la misma solicitud. No necesitas crear otra.

Si **ya juntó tu trabajo con `main`**, vuelve al paso 1 y crea una rama con otro nombre para tu siguiente tarea.