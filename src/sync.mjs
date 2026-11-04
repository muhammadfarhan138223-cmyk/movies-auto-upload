/** Optional upload-agent -> Supabase sync. No service-role keys; agent user is RLS-restricted. */
export class StatusSync {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.session = null;
    this.lastError = '';
    this.lastSuccess = '';
    this.running = false;
  }
  get enabled() {
    const c = this.config;
    return Boolean(c.syncUrl && c.syncAnonKey && c.syncAgentEmail && c.syncAgentPassword);
  }
  base() { return this.config.syncUrl.replace(/\/$/,''); }
  async login() {
    const response = await this.fetch(`${this.base()}/auth/v1/token?grant_type=password`, {
      method:'POST', headers:{'Content-Type':'application/json',apikey:this.config.syncAnonKey},
      body:JSON.stringify({email:this.config.syncAgentEmail,password:this.config.syncAgentPassword}),
      signal:AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Sync login failed HTTP ${response.status}; check agent account and confirmed email`);
    const data = await response.json();
    if (!data.access_token) throw new Error('Sync login did not return an access token');
    this.session = { access_token:data.access_token, refresh_token:data.refresh_token,
      expiresAt: Date.now() + (Number(data.expires_in)||3600)*1000 };
  }
  async refresh() {
    if (!this.session?.refresh_token) return this.login();
    const response = await this.fetch(`${this.base()}/auth/v1/token?grant_type=refresh_token`, {
      method:'POST',headers:{'Content-Type':'application/json',apikey:this.config.syncAnonKey},
      body:JSON.stringify({refresh_token:this.session.refresh_token}),signal:AbortSignal.timeout(20000)
    });
    if (!response.ok) return this.login();
    const data = await response.json();
    this.session={access_token:data.access_token,refresh_token:data.refresh_token,
      expiresAt:Date.now()+(Number(data.expires_in)||3600)*1000};
  }
  async push(snapshot) {
    if (!this.enabled || this.running) return false;
    this.running = true;
    try {
      if (!this.session) await this.login();
      else if (Date.now() > this.session.expiresAt - 120000) await this.refresh();
      const req = () => this.fetch(`${this.base()}/rest/v1/mh_uploader_snapshot?id=eq.1`, {
        method:'PATCH',headers:{apikey:this.config.syncAnonKey,Authorization:`Bearer ${this.session.access_token}`,
          'Content-Type':'application/json',Prefer:'return=representation'},
        body:JSON.stringify({payload:snapshot,updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(25000)
      });
      let response = await req();
      if (response.status===401) {await this.refresh();response=await req();}
      if (!response.ok) throw new Error(`Status sync HTTP ${response.status} (check Supabase SQL/RLS)`);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length!==1) throw new Error('Sync update denied: no matching RLS agent row');
      this.lastSuccess=new Date().toISOString(); this.lastError=''; return true;
    } catch (e) { this.lastError=e.message; console.error('Status sync:',e.message);return false; }
    finally { this.running=false; }
  }
}
