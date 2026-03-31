import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, app_id, app_secret, tenant_access_token, app_token, table_id, record_id, fields, file_token, file_tokens } = body;

    if (action === 'get_token') {
      const res = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id, app_secret }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'list_tables') {
      const res = await fetch(`https://open.larksuite.com/open-apis/bitable/v1/apps/${app_token}/tables?page_size=100`, {
        headers: { 'Authorization': `Bearer ${tenant_access_token}` },
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'get_table_fields') {
      const res = await fetch(`https://open.larksuite.com/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/fields?page_size=100`, {
        headers: { 'Authorization': `Bearer ${tenant_access_token}` },
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'list_records') {
      let allRecords: any[] = [];
      let pageToken: string | undefined;
      
      do {
        const url = new URL(`https://open.larksuite.com/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records`);
        url.searchParams.set('page_size', '100');
        if (pageToken) url.searchParams.set('page_token', pageToken);

        const res = await fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${tenant_access_token}` },
        });
        const data = await res.json();
        
        if (data.code !== 0) {
          return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        
        allRecords = allRecords.concat(data.data?.items || []);
        pageToken = data.data?.page_token;
      } while (pageToken);

      return new Response(JSON.stringify({ code: 0, data: { items: allRecords, total: allRecords.length } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create_record') {
      const res = await fetch(`https://open.larksuite.com/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tenant_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update_record') {
      const res = await fetch(`https://open.larksuite.com/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records/${record_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${tenant_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'download_media' || action === 'stream_media') {
      const res = await fetch(`https://open.larksuite.com/open-apis/drive/v1/medias/${file_token}/download`, {
        headers: { 'Authorization': `Bearer ${tenant_access_token}` },
      });

      if (!res.ok) {
        const errorText = await res.text();
        return new Response(JSON.stringify({ error: `Download failed: ${res.status}`, detail: errorText }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Stream the response body directly — no buffering into memory
      return new Response(res.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
          'Content-Length': res.headers.get('content-length') || '',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // batch_download_media is removed — client downloads individually now

    if (action === 'upload_media') {
      const binaryStr = atob(fields?.file_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const formData = new FormData();
      formData.append('file_name', fields?.file_name || 'report.pdf');
      formData.append('parent_type', fields?.parent_type || 'bitable_file');
      formData.append('parent_node', fields?.parent_node || app_token);
      formData.append('size', String(bytes.length));
      formData.append('file', new Blob([bytes], { type: 'application/pdf' }), fields?.file_name || 'report.pdf');

      const res = await fetch('https://open.larksuite.com/open-apis/drive/v1/medias/upload_all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tenant_access_token}`,
        },
        body: formData,
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
