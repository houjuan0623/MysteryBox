import { createHmac } from 'node:crypto';
import type { Interest, User } from '../../../packages/shared/src';
import type { Store } from './store';

export type ActivityType='page_view'|'registration'|'login'|'free_box'|'premium_box'|'checkout';
export interface Activity { id:string; type:ActivityType; at:string; visitor?:string; userId?:string; interest?:Interest; mode?:'demo'|'paypal'; path?:string; }
export interface Period {from:string;to:string;timezone:'UTC'}
/** 只保存固定业务字段，不采集请求正文/IP/设备指纹/密钥/验证码。默认保留30天事件。 */
export class Analytics {
 constructor(private store:Store,private secret:string){}
 async record(event:Omit<Activity,'at'|'visitor'> & {at?:string;visitorId?:string}) {
  const {visitorId,...rest}=event;
  const visitor=visitorId && /^[0-9a-f-]{36}$/i.test(visitorId)?createHmac('sha256',this.secret).update(`analytics:${visitorId}`).digest('hex'):undefined;
  // 同一业务资源产生同一事件ID，刷新/重放不会重复计算Box或订单。
  await this.store.insert<Activity>('activity',event.id,{...rest,at:event.at||new Date().toISOString(),...(visitor?{visitor}:{})});
 }
 period(from?:string,to?:string):Period {
  const end=to?new Date(to):new Date(),start=from?new Date(from):new Date(end.getTime()-7*86400000);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>=end||end.getTime()-start.getTime()>31*86400000)throw new RangeError('Choose a valid UTC window of at most 31 days.');
  return {from:start.toISOString(),to:end.toISOString(),timezone:'UTC'};
 }
 async events(period:Period) {return (await this.store.list<Activity>('activity')).filter(e=>e.at>=period.from&&e.at<period.to);}
 async summary(period:Period) {
  const events=await this.events(period),users=await this.store.list<User>('users');
  const count=(type:ActivityType)=>events.filter(e=>e.type===type).length;
  const unique=(types:ActivityType[],field:'visitor'|'userId')=>new Set(events.filter(e=>types.includes(e.type)).map(e=>e[field]).filter(Boolean)).size;
  return {period,counts:{pageViews:count('page_view'),visitors:unique(['page_view'],'visitor'),newUsers:users.filter(u=>u.createdAt&&u.createdAt>=period.from&&u.createdAt<period.to).length,activeUsers:unique(['login','free_box','premium_box','checkout'],'userId'),freeBoxes:count('free_box'),premiumBoxes:count('premium_box'),demoOrders:events.filter(e=>e.type==='checkout'&&e.mode==='demo').length,paidOrders:events.filter(e=>e.type==='premium_box'&&e.mode==='paypal').length},interests:['creator','developer','student','business'].map(interest=>({interest,count:events.filter(e=>e.interest===interest&&['free_box','premium_box'].includes(e.type)).length})),funnel:{visitors:unique(['page_view'],'visitor'),boxUsers:unique(['free_box','premium_box'],'visitor'),checkoutUsers:unique(['checkout'],'visitor')},notes:['UTC window is start-inclusive and end-exclusive.','Visitors are short-lived browser identifiers, not verified people. Bots and cleared storage can affect counts.','Funnel columns are independent unique visitors in this window, not a cohort conversion rate.','Demo orders are simulated. Paid-order count is not net revenue and excludes refunds/reconciliation.','First-party activity records are retained for 30 days.']};
 }
 async users(period:Period) {return (await this.store.list<User>('users')).filter(u=>u.createdAt&&u.createdAt>=period.from&&u.createdAt<period.to).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,100).map(u=>({id:u.id,email:u.email,createdAt:u.createdAt,lastLoginAt:u.lastLoginAt,role:u.role||'member'}));}
 async prune() {const cutoff=new Date(Date.now()-30*86400000).toISOString();for(const event of await this.store.list<Activity>('activity'))if(event.at<cutoff)await this.store.delete('activity',event.id);}
}
