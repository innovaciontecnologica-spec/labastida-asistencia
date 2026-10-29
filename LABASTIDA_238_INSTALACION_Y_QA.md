# LABASTIDA ASISTENCIA 2.3.8 — NEXQOR multinivel

## Estado

**Candidato de publicación, pruebas locales aprobadas.** No se ha instalado en Apps Script ni publicado en GitHub. La versión 2.3.7 sigue en funcionamiento hasta que el Master decida reemplazarla.

## Corrección

- Los perfiles de **Niveles personalizados** ahora permiten marcar de uno a tres niveles escolares de manera independiente.
- **Todos los niveles** fija Preescolar, Primaria y Secundaria; **Control de acceso** mantiene solamente Primaria y Secundaria, conforme a las reglas previas.
- El servidor valida cada solicitud contra los niveles autorizados. No basta manipular la interfaz para añadir otro nivel.
- El semáforo integra únicamente los grupos de Primaria/Secundaria autorizados. Preescolar no participa en el semáforo de puerta.
- Pases de lista, resumen y consultas de puerta se proyectan o filtran por nivel. Las rutas antiguas de pase que no aceptan ámbito multinivel se bloquean para perfiles multinivel; se utiliza `la231Clases`/`la231Vista`/`la231Validar` por módulo.
- Los perfiles guardados en 2.3.7 siguen funcionando sin eliminación ni conversión manual. No se crean nuevos usuarios maestros y no se cambian contraseñas existentes.
- **No se alteran asistencias, retardos, ENTRADAS, suspensiones, exclusiones NEXQOR ni `la163ConciliarSolicitud_`.**

## Archivos de entrega

1. `LABASTIDA_2_3_8_CODIGO_COMPLETO_PEGAR.gs`: sustituir el contenido **únicamente** de `Código.gs` en el proyecto de Apps Script que ya contiene 2.3.7. Los demás `.gs` no se modifican.
2. `index.html`: reemplazar en la raíz del repositorio GitHub.
3. `labastida-version.json`: reemplazar en la raíz del repositorio GitHub.

## Publicación controlada

1. Confirma que aún conservas el respaldo de la base y la copia de `Código.gs` 2.3.7.
2. En **Apps Script > Código.gs**, reemplaza el código por el archivo completo 2.3.8, guarda y verifica que no aparezcan errores de sintaxis. **No vuelvas a ejecutar** `la237InicializarSuperadministrador`; la cuenta Master ya existe.
3. Selecciona **Implementar > Gestionar implementaciones**. Edita la **misma implementación web** utilizada por el Worker. Elige **Nueva versión**, descripción `LABASTIDA 2.3.8 NEXQOR multinivel`, e implementa. No borres ni sustituyas el ID de la implementación.
4. En GitHub reemplaza solo `index.html` y `labastida-version.json`, confirma los cambios.
5. Abre `https://innovaciontecnologica-spec.github.io/labastida-asistencia/?v=238` y actualiza forzadamente (`Ctrl+F5`). Inicia sesión como Master.

## QA funcional sin modificar registros escolares

1. Ve a **NEXQOR > Control maestro > Crear o editar perfil**.
2. Crea un perfil llamado `Consulta multinivel QA`, con **Tipo de alcance: Niveles personalizados**. Marca **Primaria** y **Secundaria**, deja **Preescolar** desmarcado. Marca únicamente **Consultar semáforo de retardos**; guarda con contraseña Master y justificación de QA.
3. Crea una cuenta QA vinculada a ese perfil; cambia su contraseña temporal desde su primer ingreso, sin enviar credenciales por chat.
4. Confirma que el semáforo muestra grupos de Primaria y Secundaria y **ningún grupo de Preescolar**.
5. Comprueba que el menú de administración, los pases y el registro de incidencias no aparecen para el usuario de solo semáforo.
6. Inicia sesión nuevamente como Master, edita el perfil y deja **solo Primaria**. Cierra sesión de la cuenta QA y vuelve a entrar; confirma que ya no aparecen grupos de Secundaria.
7. Consulta la bitácora del panel para verificar las modificaciones `LA237_PERFIL_CREADO` y `LA237_PERFIL_EDITADO`.

## Volver a 2.3.7

La reversión mantiene las configuraciones originales 2.3.7 de los perfiles previos. Si ya creaste perfiles con dos o tres niveles, **no debes utilizarlos con el backend 2.3.7**: ese backend no entiende el campo `niveles`. Antes de volver a 2.3.7, suspende los nuevos perfiles multinivel desde 2.3.8; conserva la base y solicita revisión de compatibilidad. Regresa la implementación web al código 2.3.7 guardado y vuelve a publicar sus dos archivos GitHub.

## Fuentes oficiales para publicar

- Google Apps Script: https://developers.google.com/apps-script/concepts/deployments
- GitHub: https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files
