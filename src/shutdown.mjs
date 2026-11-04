import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync=promisify(execFile);
export class ShutdownManager {
  constructor({platform=process.platform, runner=execFileAsync, clock=()=>Date.now()}={}) {
    this.platform=platform;this.runner=runner;this.clock=clock;this.scheduledAt=null;this.delay=120;
  }
  get supported() {return this.platform==='win32';}
  get state() {return {supported:this.supported,scheduledAt:this.scheduledAt,delaySeconds:this.delay};}
  async schedule(delay=120) {
    if(!this.supported) throw new Error('Automatic OS shutdown is only supported on Windows');
    if(this.scheduledAt) throw new Error('Shutdown is already scheduled');
    if(!Number.isInteger(delay)||delay<60||delay>600) throw new Error('Shutdown delay must be 60-600 seconds');
    await this.runner('shutdown.exe',['/s','/t',String(delay),'/c','MovieHub uploads finished. Cancel from uploader before countdown ends.']);
    this.delay=delay;this.scheduledAt=new Date(this.clock()+delay*1000).toISOString();
  }
  async cancel() {
    if(!this.scheduledAt) throw new Error('No shutdown scheduled by this app');
    await this.runner('shutdown.exe',['/a']);
    this.scheduledAt=null;
  }
}
