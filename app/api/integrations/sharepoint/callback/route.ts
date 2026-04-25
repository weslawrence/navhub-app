import { createAdminClient }        from '@/lib/supabase/admin'
import { encrypt }                   from '@/lib/encryption'

/**
 * GET /api/integrations/sharepoint/callback
 * Handles the Microsoft OAuth2 callback, stores encrypted tokens.
 * Uses multi-tenant 'common' endpoint and extracts tenant_id from id_token.
 */

function errorPage(code: string, message: string) {
  const safeMsg  = message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeCode = JSON.stringify(code)
  return new Response(`
    <html><body style="font-family: system-ui; padding: 24px; max-width: 480px;">
      <h3 style="color: #b91c1c;">Connection failed</h3>
      <p>${safeMsg}</p>
      <p style="color: #71717a; font-size: 13px;">This window will close automatically in a few seconds.</p>
      <script>
        window.opener?.postMessage({ type: 'sharepoint-error', error: ${safeCode} }, '*');
        setTimeout(() => window.close(), 3000);
      </script>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } })
}

export async function GET(req: Request) {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const error  = url.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.navhub.co'

  if (error) {
    return errorPage(error, `Microsoft returned: ${error}`)
  }

  if (!code || !state) {
    return errorPage('missing_code', 'Missing authorisation code or state from Microsoft.')
  }

  // Parse state (JSON string from connect route)
  let groupId: string
  try {
    const parsed = JSON.parse(state) as { group_id: string }
    groupId = parsed.group_id
  } catch {
    return errorPage('invalid_state', 'Invalid OAuth state parameter.')
  }

  try {
    // Exchange code for tokens using common endpoint
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.SHAREPOINT_CLIENT_ID!,
        client_secret: process.env.SHAREPOINT_CLIENT_SECRET!,
        code,
        redirect_uri:  `${appUrl}/api/integrations/sharepoint/callback`,
        grant_type:    'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('SharePoint token exchange failed:', text)
      return errorPage('token_exchange_failed', `Token exchange failed: ${text.slice(0, 200)}`)
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
      id_token: string
    }

    // Extract tenant ID from the ID token JWT (middle section)
    let tenantId: string
    try {
      const idTokenPayload = JSON.parse(
        Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()
      ) as { tid: string }
      tenantId = idTokenPayload.tid
    } catch {
      // If id_token parsing fails, use 'common' as fallback
      tenantId = 'common'
    }

    const admin = createAdminClient()

    // Store connection with the user's actual tenant ID
    // Check for existing connection for this group (there is no unique
    // constraint on group_id alone in the current schema, so use explicit
    // insert/update rather than upsert with onConflict).
    const { data: existing } = await admin
      .from('sharepoint_connections')
      .select('id')
      .eq('group_id', groupId)
      .maybeSingle()

    const tokenPayload = {
      tenant_id:               tenantId,
      access_token_encrypted:  encrypt(tokens.access_token),
      refresh_token_encrypted: encrypt(tokens.refresh_token),
      token_expires_at:        new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active:               true,
    }

    let dbError: { message: string } | null = null
    let connectionId: string | null = null
    if (existing) {
      const { error } = await admin
        .from('sharepoint_connections')
        .update(tokenPayload)
        .eq('id', existing.id)
      dbError = error ? { message: error.message } : null
      connectionId = existing.id as string
    } else {
      const { data: inserted, error } = await admin
        .from('sharepoint_connections')
        .insert({
          group_id:    groupId,
          folder_path: 'NavHub/Documents',
          ...tokenPayload,
        })
        .select('id')
        .single()
      dbError = error ? { message: error.message } : null
      connectionId = inserted?.id ?? null
    }

    if (dbError) {
      console.error('SharePoint connection save error:', dbError)
      return errorPage('db_error', `Database error: ${dbError.message}`)
    }

    // Fetch available sites for the setup wizard
    let sites: Array<{ id: string; name: string; webUrl: string }> = []
    try {
      const sitesRes = await fetch('https://graph.microsoft.com/v1.0/sites?search=*', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      })
      if (sitesRes.ok) {
        const sitesJson = await sitesRes.json() as { value?: Array<{ id: string; displayName: string; webUrl: string }> }
        sites = (sitesJson.value ?? []).map(s => ({
          id:     s.id,
          name:   s.displayName,
          webUrl: s.webUrl,
        }))
      }
    } catch {
      // Non-fatal — show wizard without site list; user can set folder + skip
    }

    // Escape helper for inline values
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const safeConnId = esc(connectionId ?? '')
    const sitesOptions = sites.length > 0
      ? sites.map(s => `<option value="${esc(s.id)}" data-url="${esc(s.webUrl)}">${esc(s.name)} — ${esc(s.webUrl)}</option>`).join('')
      : '<option value="">No sites available — you can skip and set the folder path only</option>'

    return new Response(`
      <html>
      <head><title>SharePoint Setup</title></head>
      <body style="font-family: system-ui; padding: 32px 24px; max-width: 560px; margin: 0 auto; color: #0f172a;">
        <h2 style="margin-bottom: 8px; font-size: 20px;">✓ SharePoint Connected</h2>
        <p style="color: #64748b; margin-bottom: 24px; font-size: 14px;">
          Choose your SharePoint site and root folder for document sync. NavHub
          folders will be auto-mirrored as subfolders.
        </p>

        <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px;">SharePoint Site</label>
        <select id="siteSelect" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 16px; font-size: 13px; background: white;">
          ${sitesOptions}
        </select>

        <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px;">Folder</label>

        <div style="border: 1px solid #cbd5e1; border-radius: 6px; background: white; margin-bottom: 8px;">
          <div id="breadcrumb" style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #475569; display: flex; flex-wrap: wrap; gap: 4px;"></div>
          <div id="folderList" style="max-height: 220px; overflow-y: auto; padding: 4px 0; font-size: 13px;">
            <div style="padding: 12px; color: #94a3b8; font-size: 12px;">Select a site to load folders…</div>
          </div>
        </div>

        <details style="margin-bottom: 16px; font-size: 12px; color: #64748b;">
          <summary style="cursor: pointer;">Or enter a path manually</summary>
          <input
            id="folderPath"
            type="text"
            value="NavHub"
            placeholder="NavHub"
            style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; background: white; box-sizing: border-box; margin-top: 6px;"
          />
          <p style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
            Used as a fallback if no folder is selected above. Subfolders are created automatically per NavHub folder.
          </p>
        </details>

        <div style="display: flex; gap: 8px;">
          <button
            onclick="saveAndClose()"
            style="flex: 1; padding: 10px; background: #0f172a; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500;"
          >Save &amp; Continue</button>
          <button
            onclick="skipAndClose()"
            style="padding: 10px 16px; background: white; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; cursor: pointer;"
          >Skip</button>
        </div>

        <script>
          const connectionId = ${JSON.stringify(safeConnId)};
          // Breadcrumb stack: each entry is { id, name } — id===null is "Root"
          let crumbs = [{ id: null, name: 'Root' }];
          let selectedPath = null;   // human-readable path string (e.g. "NavHub/Marketing")
          let selectedFolderId = null;

          function renderBreadcrumb() {
            const el = document.getElementById('breadcrumb');
            el.innerHTML = '';
            crumbs.forEach((c, i) => {
              const link = document.createElement('span');
              link.style.cursor = i < crumbs.length - 1 ? 'pointer' : 'default';
              link.style.color  = i < crumbs.length - 1 ? '#0f172a' : '#94a3b8';
              link.style.textDecoration = i < crumbs.length - 1 ? 'underline' : 'none';
              link.textContent = c.name;
              link.onclick = () => {
                if (i < crumbs.length - 1) {
                  crumbs = crumbs.slice(0, i + 1);
                  loadFolders(c.id);
                }
              };
              el.appendChild(link);
              if (i < crumbs.length - 1) {
                const sep = document.createElement('span');
                sep.textContent = ' / ';
                sep.style.color = '#cbd5e1';
                el.appendChild(sep);
              }
            });
          }

          async function loadFolders(parentId) {
            const list = document.getElementById('folderList');
            list.innerHTML = '<div style="padding: 12px; color: #94a3b8; font-size: 12px;">Loading…</div>';
            renderBreadcrumb();

            const siteSelect = document.getElementById('siteSelect');
            const siteId = siteSelect.value || '';
            const params = new URLSearchParams({ connection_id: connectionId });
            if (parentId) params.set('parent_id', parentId);
            if (siteId)   params.set('site_id',   siteId);

            try {
              const res = await fetch('/api/integrations/sharepoint/folders?' + params.toString());
              const json = await res.json();
              if (!res.ok) {
                list.innerHTML = '<div style="padding: 12px; color: #b91c1c; font-size: 12px;">' + (json.error || 'Failed to load folders') + '</div>';
                return;
              }
              const folders = json.folders || [];
              if (folders.length === 0) {
                list.innerHTML = '<div style="padding: 12px; color: #94a3b8; font-size: 12px;">No subfolders here. Click "Select this folder" to use the current location.</div>';
                addSelectCurrentButton(list, parentId);
                return;
              }
              list.innerHTML = '';
              addSelectCurrentButton(list, parentId);
              folders.forEach(f => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; border-top: 1px solid #f1f5f9;';
                row.innerHTML = '<span style="display: flex; align-items: center; gap: 6px;">' +
                                '  <span style="color: #f59e0b;">📁</span>' +
                                '  <span>' + escapeHtml(f.name) + '</span>' +
                                '  <span style="color: #cbd5e1; font-size: 11px;">(' + f.childCount + ')</span>' +
                                '</span>';
                const btn = document.createElement('button');
                btn.textContent = 'Open ›';
                btn.style.cssText = 'background: none; border: none; color: #2563eb; font-size: 12px; cursor: pointer;';
                btn.onclick = () => {
                  crumbs.push({ id: f.id, name: f.name });
                  loadFolders(f.id);
                };
                row.appendChild(btn);
                list.appendChild(row);
              });
            } catch (e) {
              list.innerHTML = '<div style="padding: 12px; color: #b91c1c; font-size: 12px;">Error loading folders</div>';
            }
          }

          function addSelectCurrentButton(list, parentId) {
            const sel = document.createElement('div');
            sel.style.cssText = 'padding: 6px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;';
            const btn = document.createElement('button');
            const path = crumbs.slice(1).map(c => c.name).join('/') || '(root)';
            btn.textContent = 'Select "' + path + '"';
            btn.style.cssText = 'background: #0f172a; color: white; border: none; border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer;';
            btn.onclick = () => {
              selectedFolderId = parentId;
              selectedPath = crumbs.slice(1).map(c => c.name).join('/');
              if (!selectedPath) selectedPath = 'NavHub';
              btn.textContent = '✓ Selected';
              btn.style.background = '#16a34a';
            };
            sel.appendChild(btn);
            list.appendChild(sel);
          }

          function escapeHtml(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          }

          // Reload folders when site changes
          document.getElementById('siteSelect').addEventListener('change', () => {
            crumbs = [{ id: null, name: 'Root' }];
            selectedFolderId = null;
            selectedPath = null;
            loadFolders(null);
          });

          async function saveAndClose() {
            const siteSelect = document.getElementById('siteSelect');
            const siteId  = siteSelect.value || null;
            const opt     = siteSelect.options[siteSelect.selectedIndex];
            const siteUrl = opt && opt.dataset ? opt.dataset.url : null;
            const manualPath = document.getElementById('folderPath').value;
            const folderPath = selectedPath || manualPath || 'NavHub';
            try {
              await fetch('/api/integrations/sharepoint/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  connection_id: connectionId,
                  site_id:       siteId,
                  site_url:      siteUrl,
                  folder_path:   folderPath,
                  folder_id:     selectedFolderId,
                })
              });
            } catch (e) { /* ignore and close anyway */ }
            window.opener?.postMessage({ type: 'sharepoint-connected' }, '*');
            window.close();
          }
          function skipAndClose() {
            window.opener?.postMessage({ type: 'sharepoint-connected' }, '*');
            window.close();
          }

          // Initial load if a site is preselected
          if (document.getElementById('siteSelect').value) {
            loadFolders(null);
          }
        </script>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })
  } catch (err) {
    console.error('SharePoint callback error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorPage('callback_error', msg)
  }
}
