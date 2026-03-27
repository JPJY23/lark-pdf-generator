import { supabase } from "@/integrations/supabase/client";

interface LarkProxyParams {
  action: string;
  app_id?: string;
  app_secret?: string;
  tenant_access_token?: string;
  app_token?: string;
  table_id?: string;
  record_id?: string;
  fields?: Record<string, any>;
  file_token?: string;
  file_tokens?: string[];
}

export async function callLarkProxy(params: LarkProxyParams) {
  const { data, error } = await supabase.functions.invoke('lark-proxy', {
    body: params,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function getTenantAccessToken(appId: string, appSecret: string) {
  const data = await callLarkProxy({ action: 'get_token', app_id: appId, app_secret: appSecret });
  if (data.code !== 0) throw new Error(data.msg || 'Failed to get token');
  return data.tenant_access_token;
}

export async function listTables(token: string, appToken: string) {
  const data = await callLarkProxy({
    action: 'list_tables',
    tenant_access_token: token,
    app_token: appToken,
  });
  if (data.code !== 0) throw new Error(data.msg || 'Failed to list tables');
  return data.data?.items || [];
}

export async function getTableFields(token: string, appToken: string, tableId: string) {
  const data = await callLarkProxy({
    action: 'get_table_fields',
    tenant_access_token: token,
    app_token: appToken,
    table_id: tableId,
  });
  if (data.code !== 0) throw new Error(data.msg || 'Failed to get fields');
  return data.data?.items || [];
}

export async function listRecords(token: string, appToken: string, tableId: string) {
  const data = await callLarkProxy({
    action: 'list_records',
    tenant_access_token: token,
    app_token: appToken,
    table_id: tableId,
  });
  if (data.code !== 0) throw new Error(data.msg || 'Failed to list records');
  return data.data?.items || [];
}

export async function createRecord(token: string, appToken: string, tableId: string, fields: Record<string, any>) {
  const data = await callLarkProxy({
    action: 'create_record',
    tenant_access_token: token,
    app_token: appToken,
    table_id: tableId,
    fields,
  });
  if (data.code !== 0) throw new Error(data.msg || 'Failed to create record');
  return data.data?.record;
}

export async function updateRecord(token: string, appToken: string, tableId: string, recordId: string, fields: Record<string, any>) {
  const data = await callLarkProxy({
    action: 'update_record',
    tenant_access_token: token,
    app_token: appToken,
    table_id: tableId,
    record_id: recordId,
    fields,
  });
  if (data.code !== 0) throw new Error(data.msg || 'Failed to update record');
  return data;
}

export async function downloadMedia(token: string, fileToken: string): Promise<string> {
  const data = await callLarkProxy({
    action: 'download_media',
    tenant_access_token: token,
    file_token: fileToken,
  });
  if (data.error) throw new Error(data.error);
  return `data:${data.content_type};base64,${data.base64}`;
}

export async function batchDownloadMedia(token: string, fileTokens: string[]): Promise<Record<string, string>> {
  if (fileTokens.length === 0) return {};
  const data = await callLarkProxy({
    action: 'batch_download_media',
    tenant_access_token: token,
    file_tokens: fileTokens,
  });
  const result: Record<string, string> = {};
  for (const [ft, info] of Object.entries(data.results || {})) {
    const { base64, content_type } = info as { base64: string; content_type: string };
    result[ft] = `data:${content_type};base64,${base64}`;
  }
  return result;
}

export async function uploadMedia(
  token: string,
  appToken: string,
  fileName: string,
  fileBase64: string,
) {
  const data = await callLarkProxy({
    action: 'upload_media',
    tenant_access_token: token,
    app_token: appToken,
    fields: {
      file_name: fileName,
      file_base64: fileBase64,
      parent_type: 'bitable_file',
      parent_node: appToken,
    },
  });
  if (data.code !== 0) throw new Error(data.msg || 'Failed to upload media');
  return data.data?.file_token;
}
