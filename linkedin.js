import fetch from "node-fetch";

const BASE = "https://api.linkedin.com/v2";
const REST = "https://api.linkedin.com/rest";

export class LinkedInClient {
  constructor(accessToken, organizationId = null) {
    this.token = accessToken;
    this.orgId = organizationId;
    this.profileId = null;
  }

  headers(extra = {}) {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      ...extra,
    };
  }

  async getProfile() {
    const res = await fetch(`${BASE}/userinfo`, { headers: this.headers() });
    if (!res.ok) throw new Error(`LinkedIn API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    this.profileId = data.sub;
    return data;
  }

  async getAuthorUrn() {
    if (this.orgId) return `urn:li:organization:${this.orgId}`;
    if (!this.profileId) await this.getProfile();
    return `urn:li:person:${this.profileId}`;
  }

  // Publica un post solo de texto
  async createTextPost(text, visibility = "PUBLIC") {
    const authorUrn = await this.getAuthorUrn();
    const body = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility,
      },
    };

    const res = await fetch(`${BASE}/ugcPosts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Error al publicar: ${res.status} ${await res.text()}`);
    const location = res.headers.get("x-restli-id") || res.headers.get("location") || "publicado";
    return { success: true, postId: location, url: `https://www.linkedin.com/feed/update/${encodeURIComponent(location)}/` };
  }

  // Paso 1: registrar la subida de imagen
  async registerImageUpload(authorUrn) {
    const body = {
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: authorUrn,
        serviceRelationships: [
          { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
        ],
      },
    };

    const res = await fetch(`${BASE}/assets?action=registerUpload`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Error registrando imagen: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return {
      uploadUrl: data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl,
      assetUrn: data.value.asset,
    };
  }

  // Paso 2: subir la imagen desde URL pública
  async uploadImageFromUrl(uploadUrl, imageUrl) {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`No se pudo descargar la imagen: ${imgRes.status}`);
    const buffer = await imgRes.buffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType, Authorization: `Bearer ${this.token}` },
      body: buffer,
    });

    if (!res.ok && res.status !== 201) throw new Error(`Error subiendo imagen: ${res.status}`);
    return true;
  }

  // Publica un post con imagen
  async createImagePost(text, imageUrl, imageTitle = "", visibility = "PUBLIC") {
    const authorUrn = await this.getAuthorUrn();
    const { uploadUrl, assetUrn } = await this.registerImageUpload(authorUrn);
    await this.uploadImageFromUrl(uploadUrl, imageUrl);

    const body = {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "IMAGE",
          media: [
            {
              status: "READY",
              description: { text: imageTitle || text.substring(0, 100) },
              media: assetUrn,
              title: { text: imageTitle || "Seguridad Colectiva" },
            },
          ],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": visibility,
      },
    };

    const res = await fetch(`${BASE}/ugcPosts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Error al publicar con imagen: ${res.status} ${await res.text()}`);
    const postId = res.headers.get("x-restli-id") || "publicado";
    return { success: true, postId, url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/` };
  }

  // Obtiene estadísticas básicas de un post
  async getPostStats(postUrn) {
    const encoded = encodeURIComponent(postUrn);
    const res = await fetch(`${BASE}/socialActions/${encoded}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Error obteniendo estadísticas: ${res.status}`);
    return await res.json();
  }
}
