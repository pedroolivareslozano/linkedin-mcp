# LinkedIn MCP Server — Seguridad Colectiva

Servidor MCP (Model Context Protocol) para publicar contenido en LinkedIn directamente desde Claude.

## Herramientas disponibles

| Herramienta | Descripción |
|---|---|
| `get_profile` | Comprueba qué perfil/página está autenticado |
| `publish_text_post` | Publica un post de texto con hashtags |
| `publish_image_post` | Publica un post con imagen desde URL |
| `get_post_stats` | Consulta likes y comentarios de un post |

---

## 1. Crear la aplicación en LinkedIn

1. Ve a [LinkedIn Developer Portal](https://developer.linkedin.com/apps) e inicia sesión
2. Haz clic en **Create app**
3. Rellena:
   - App name: `Seguridad Colectiva MCP`
   - LinkedIn Page: busca y selecciona la página de tu empresa
   - App logo: sube el logo
4. En la pestaña **Products**, solicita acceso a:
   - **Share on LinkedIn** (para publicar posts)
   - **Sign In with LinkedIn using OpenID Connect** (para obtener el perfil)
5. En la pestaña **Auth**, anota el `Client ID` y `Client Secret`

## 2. Obtener el Access Token

La forma más sencilla es con el [LinkedIn Token Generator](https://www.linkedin.com/developers/tools/oauth/token-generator):

1. Selecciona tu app
2. Marca los scopes: `openid`, `profile`, `email`, `w_member_social`
3. Si publicas como página de empresa, también: `w_organization_social`, `r_organization_social`
4. Haz clic en **Request access token** y copia el token generado

> ⚠️ Los tokens de LinkedIn duran **60 días**. Necesitarás renovarlos periódicamente o implementar el flujo de refresh token.

## 3. Obtener el ID de tu página de empresa

1. Ve a la página de empresa de Seguridad Colectiva en LinkedIn
2. Mira la URL: `https://www.linkedin.com/company/XXXXXXXXX`
3. El número es tu `LINKEDIN_ORGANIZATION_ID`

## 4. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env`:

```env
LINKEDIN_ACCESS_TOKEN=AQV...tu_token
LINKEDIN_ORGANIZATION_ID=12345678
```

## 5. Ejecutar en local

```bash
npm install
npm start
# El servidor arranca en http://localhost:3000
```

Prueba que funciona:
```bash
curl http://localhost:3000/health
```

## 6. Desplegar en Railway

1. Crea una cuenta en [Railway.app](https://railway.app)
2. Haz clic en **New Project → Deploy from GitHub repo**
3. Conecta este repositorio
4. En la sección **Variables**, añade:
   - `LINKEDIN_ACCESS_TOKEN`
   - `LINKEDIN_ORGANIZATION_ID`
5. Railway desplegará automáticamente y te dará una URL pública tipo:
   ```
   https://linkedin-mcp-production.up.railway.app
   ```

## 7. Conectar con Claude

1. Ve a [claude.ai](https://claude.ai) → **Configuración** → **Conectores** → **Añadir conector personalizado**
2. Nombre: `LinkedIn Seguridad Colectiva`
3. URL del servidor MCP:
   ```
   https://tu-app.up.railway.app/sse
   ```
4. Guarda — Claude ya puede usar las herramientas de LinkedIn

---

## Uso desde Claude

Una vez conectado, puedes decirle a Claude:

> *"Publica este post en LinkedIn como Seguridad Colectiva: [texto del post]"*

> *"Publica el post aprobado con esta imagen: https://..."*

> *"¿Cuántos likes tiene el post con URN urn:li:ugcPost:123456?"*

---

## Renovación del token

Los tokens duran 60 días. Para renovar:
1. Vuelve al [Token Generator](https://www.linkedin.com/developers/tools/oauth/token-generator)
2. Genera un nuevo token
3. Actualiza la variable `LINKEDIN_ACCESS_TOKEN` en Railway
4. Railway reiniciará el servidor automáticamente

---

## Estructura del proyecto

```
linkedin-mcp/
├── server.js          # Servidor MCP principal (Express + SSE)
├── linkedin.js        # Cliente de la LinkedIn API
├── package.json
├── railway.toml       # Configuración de despliegue
└── .env.example       # Plantilla de variables de entorno
```
