# Escáner de cookies Pantheon (Cloudflare Browser Run)

Se despliega como servicio externo. No requiere ejecutar Playwright dentro del servidor WordPress.

## Despliegue guiado con Cloudflare

1. Publica **solo el contenido de esta carpeta** en un repositorio público de GitHub (por ejemplo, `pantheon-cloudflare-scanner`). No subas las credenciales de ningún sitio.
2. Desde la página del repositorio, utiliza este enlace (cambia `USUARIO` y `REPOSITORIO` por los nombres reales):

   `https://deploy.workers.cloudflare.com/?url=https://github.com/USUARIO/REPOSITORIO`

3. Autoriza Cloudflare, revisa el Worker y configura `ALLOWED_HOSTS` con los nombres de dominio exactos, separados por comas y sin `https://`. Deja `SCANNER_TOKEN` como secreto: genera una clave aleatoria larga y conserva una copia segura para Pantheon.
4. Completa el despliegue. Copia la URL HTTPS del Worker de Cloudflare.
5. En Pantheon → Cookies → Análisis automático, introduce la URL del Worker y la misma clave privada. Guarda los cambios.

Cloudflare permite configurar variables y secretos durante el despliegue de una plantilla pública. La autorización se realiza en Cloudflare, no desde WordPress. El enlace definitivo debe apuntar a un repositorio real: no utilices el ejemplo anterior sin sustituir sus valores.

## Despliegue manual con Wrangler (alternativa)

1. Crear una cuenta de Cloudflare con Browser Run habilitado.
2. Dentro de este directorio: `npm install`.
3. Configurar `ALLOWED_HOSTS` en `wrangler.toml` con los dominios exactos permitidos, separados por comas y sin `https://`. Se admite `ALLOWED_HOST` para instalaciones anteriores.
4. Configurar la clave compartida mediante `npx wrangler secret put SCANNER_TOKEN`.
5. Desplegar con `npm run deploy`.
6. En Pantheon → Cookies → Análisis automático, introducir la URL HTTPS publicada del Worker y la misma clave privada, guardar y ejecutar «Análisis externo».

El servicio realiza tres visitas con sesiones aisladas: inicial, rechazo y aceptación. Reconoce los controles de consentimiento de Pantheon `[data-cookie-reject-all]` y `[data-cookie-accept-all]`, así como los botones de Elementor enlazados a `#pantheon-cookie-reject-all` y `#pantheon-cookie-accept-all`. Después de pulsar verifica la existencia de la cookie de consentimiento. Si no se produce, informa `clicked: false`; el resultado de esa fase no confirma el estado solicitado y debe revisarse.

Los resultados incluyen cookies (incluidas HttpOnly), dominios solicitados y claves de almacenamiento local. Se almacenan como informe separado en WordPress. El inventario de cookies detectadas se actualiza sin aprobarlas automáticamente.

La revisión del cumplimiento sigue requiriendo analizar los resultados y repetir el escaneo en páginas y configuraciones regionales representativas. No emplear la URL especial para capturas ni ocultar banners durante este análisis.

El servicio debe tener el secreto y una restricción de dominio configurados antes de exponerse en producción. La cuota gratuita de Cloudflare Browser Run es limitada; cada análisis utiliza tiempo real de Chromium.
