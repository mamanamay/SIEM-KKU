export class SmoothCounter {
  private frame: number | null = null;
  private value = 0;
  private initialized = false;
  constructor(private readonly set: (value: number)=>void,
    private readonly request: (callback: (time:number)=>void)=>number,
    private readonly cancel: (id:number)=>void,
    private readonly now: ()=>number) {}
  update(target:number, immediate=false) {
    if (!Number.isFinite(target)) return;
    if (this.frame !== null) this.cancel(this.frame);
    this.frame = null;
    if (!this.initialized || immediate || target === this.value) {
      this.initialized = true; this.value=target;this.set(target);return;
    }
    const start=this.value, began=this.now();
    const tick=(time:number)=>{
      const p=Math.min(1,Math.max(0,(time-began)/350));
      this.value=Math.round(start+(target-start)*(1-Math.pow(1-p,3)));
      this.set(this.value);
      this.frame=p<1?this.request(tick):null;
    };
    this.frame=this.request(tick);
  }
  stop() { if(this.frame!==null)this.cancel(this.frame);this.frame=null; }
}
