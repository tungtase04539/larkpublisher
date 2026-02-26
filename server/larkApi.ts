import { ENV } from "./_core/env";

const BASE_URL = "https://open.larksuite.com/open-apis";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getTenantAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const appId = process.env.LARK_APP_ID;
  const appSecret = process.env.LARK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("LARK_APP_ID and LARK_APP_SECRET must be set");
  }

  const res = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Lark auth failed: ${data.msg}`);
  }

  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - 300) * 1000, // refresh 5 min early
  };

  return cachedToken.token;
}

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Parse a Lark Wiki URL to extract the node token.
 * Supports formats:
 *   - https://xxx.larksuite.com/wiki/NODETOKEN
 *   - https://xxx.feishu.cn/wiki/NODETOKEN
 */
export function parseWikiUrl(url: string): { nodeToken: string } {
  const match = url.match(/\/wiki\/([A-Za-z0-9]+)/);
  if (!match) {
    throw new Error("Invalid Wiki URL format. Expected: https://xxx.larksuite.com/wiki/NODETOKEN");
  }
  return { nodeToken: match[1] };
}

/**
 * Get wiki node info (space_id, obj_token, etc.) from a node token
 */
export async function getWikiNodeInfo(nodeToken: string) {
  const token = await getTenantAccessToken();
  const res = await fetch(`${BASE_URL}/wiki/v2/spaces/get_node?token=${nodeToken}`, {
    headers: getHeaders(token),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to get wiki node: ${data.msg}`);
  }
  return data.data.node;
}

/**
 * Create a new wiki node (page) under a parent node
 */
export async function createWikiNode(
  spaceId: string,
  parentNodeToken: string,
  title: string
): Promise<{ nodeToken: string; objToken: string }> {
  const token = await getTenantAccessToken();
  const res = await fetch(`${BASE_URL}/wiki/v2/spaces/${spaceId}/nodes`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify({
      obj_type: "docx",
      parent_node_token: parentNodeToken,
      node_type: "origin",
      title,
    }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to create wiki node: ${data.msg} (code: ${data.code})`);
  }
  return {
    nodeToken: data.data.node.node_token,
    objToken: data.data.node.obj_token,
  };
}

/**
 * Add blocks to a DocX document
 */
export async function addDocxBlocks(
  docId: string,
  blocks: any[],
  index: number = -1
): Promise<void> {
  const token = await getTenantAccessToken();
  const res = await fetch(
    `${BASE_URL}/docx/v1/documents/${docId}/blocks/${docId}/children`,
    {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({ children: blocks, index }),
    }
  );
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to add blocks: ${data.msg} (code: ${data.code})`);
  }
}

/**
 * Upload an image to Lark and get an image key (file_token)
 */
export async function uploadImageToLark(
  imageBuffer: Buffer,
  fileName: string
): Promise<string> {
  const token = await getTenantAccessToken();

  const formData = new FormData();
  formData.append("image_type", "message");
  const blob = new Blob([imageBuffer], { type: "image/png" });
  formData.append("image", blob, fileName);

  const res = await fetch(`${BASE_URL}/im/v1/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to upload image: ${data.msg} (code: ${data.code})`);
  }
  return data.data.image_key;
}

/**
 * Get list of child nodes in a wiki space
 */
export async function getWikiChildNodes(spaceId: string, parentNodeToken?: string) {
  const token = await getTenantAccessToken();
  let url = `${BASE_URL}/wiki/v2/spaces/${spaceId}/nodes?page_size=50`;
  if (parentNodeToken) {
    url += `&parent_node_token=${parentNodeToken}`;
  }
  const res = await fetch(url, { headers: getHeaders(token) });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Failed to get child nodes: ${data.msg}`);
  }
  return data.data.items || [];
}
